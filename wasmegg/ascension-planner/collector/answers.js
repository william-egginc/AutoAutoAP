/**
 * "Instant answers in the cloud": the page's computed instant answer and pricing record per account, 10 to 40 KB
 * gzipped, kept online so another device shows it at once and then rechecks. Contract for the app:
 * ~/code/aaap-tools/notes/instantcloud-contract.md.
 *
 *   GET    /answers?k=              the account's entries, no bodies: `{ entries: [{ e, at, bytes, updatedAt }], now }`
 *   GET    /answers/get?k=&e=       one record: the gzip bytes as sent
 *   PUT    /answers?k=&e=&at=       the gzip bytes; replaces that entry
 *   DELETE /answers?k=&e=
 *
 * A SIBLING of /follow, not part of it: a follow value is 4 KB and GET /follow returns every goal, so an answer
 * record would break the cap and ride on every follow read. Same key `k` as /follow and /prefs (SHA-256 of the ID,
 * computed in the browser; the collector never sees the ID and refuses any query that holds one).
 *
 * THE BODY IS GZIP AND IS NOT INFLATED HERE (the Free plan's ~10 ms of CPU), so it cannot be scanned for a player ID:
 * the app scrubs before it compresses, as for the CSV. Only the gzip magic, the size and the query are checked.
 *
 * D1, the WATCH binding (text column, base64: D1 returns BLOBs as number arrays). At most MAX_ENTRIES per key (a new one
 * evicts the least recently written, so the answer is never refused for room), 30 writes an hour per key (`follow_rate`
 * under 'answers|<key>'), MAX_TOTAL entries in all, and the FOLLOW_LIMIT edge binding per address.
 */
import { FOLLOW_WRITES_PER_HOUR, HOUR_MS, PLAYER_ID, UNIX_FROM, UNIX_TO, isKey, overLimit, reply, retry, whole } from './follow.js';

export const ANSWER_MAX_BYTES = 65_536;
export const ANSWER_MAX_ENTRIES = 8;
export const ANSWER_MAX_TOTAL = 20_000;
const E_RE = /^[A-Za-z0-9._:-]{1,96}$/;

export const isAnswersRequest = url => url.pathname === '/answers' || url.pathname === '/answers/get';

const b64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

const bad = problems => reply({ error: 'rejected', problems }, 400);

/** `GET /answers`, `GET /answers/get`, `PUT /answers`, `DELETE /answers`. */
export async function handleAnswers(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'instant answers are not set up on this collector' }, 503);
  const url = new URL(request.url);
  if (PLAYER_ID.test(url.search)) return bad(['send the key, never the player id']);
  const k = url.searchParams.get('k');
  if (!isKey(k)) return bad(['k must be 64 lowercase hex characters']);
  const e = url.searchParams.get('e');

  if (request.method === 'GET') {
    const slow = await overLimit(env, request, 'answers-get');
    if (slow) return slow;
    if (url.pathname === '/answers/get') {
      if (!e || !E_RE.test(e)) return bad(['e must be 1 to 96 of letters, digits, . _ : -']);
      const row = await env.WATCH.prepare('SELECT at, updated, data FROM answers WHERE key = ? AND e = ?').bind(k, e).first();
      if (!row) return reply({ error: 'not found' }, 404);
      return new Response(unb64(row.data), {
        headers: {
          'content-type': 'application/octet-stream',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'x-answer-at, x-answer-updated',
          'cache-control': 'no-store',
          'x-answer-at': String(row.at),
          'x-answer-updated': String(row.updated),
        },
      });
    }
    const { results } = await env.WATCH.prepare('SELECT e, at, bytes, updated FROM answers WHERE key = ? ORDER BY updated DESC LIMIT ?')
      .bind(k, ANSWER_MAX_ENTRIES)
      .all();
    return reply({ entries: (results || []).map(r => ({ e: r.e, at: r.at, bytes: r.bytes, updatedAt: r.updated })), now });
  }

  if (url.pathname !== '/answers') return reply({ error: 'method not allowed' }, 405);
  if (!e || !E_RE.test(e)) return bad(['e must be 1 to 96 of letters, digits, . _ : -']);

  if (request.method === 'DELETE') {
    const slow = await overLimit(env, request, 'answers-put');
    if (slow) return slow;
    await env.WATCH.prepare('DELETE FROM answers WHERE key = ? AND e = ?').bind(k, e).run();
    return reply({ ok: true });
  }
  if (request.method !== 'PUT') return reply({ error: 'method not allowed' }, 405);

  const slow = await overLimit(env, request, 'answers-put');
  if (slow) return slow;
  const at = /^\d{1,16}$/.test(url.searchParams.get('at') ?? '') ? Number(url.searchParams.get('at')) : NaN;
  if (!whole(at, UNIX_FROM * 1000, UNIX_TO * 1000)) return bad(['at must be milliseconds since 1970 between 2020 and 2100']);
  const declared = request.headers.get('content-length');
  if (declared === null) return reply({ error: 'content-length is required' }, 411);
  if (Number(declared) > ANSWER_MAX_BYTES) return reply({ error: 'too big' }, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > ANSWER_MAX_BYTES) return reply({ error: 'too big' }, 413);
  if (body.length < 18 || body[0] !== 0x1f || body[1] !== 0x8b) return bad(['the body must be gzip bytes']);

  const have = await env.WATCH.prepare('SELECT 1 AS x FROM answers WHERE key = ? AND e = ?').bind(k, e).first();
  if (!have) {
    const total = await env.WATCH.prepare('SELECT COUNT(*) AS n FROM answers').first();
    if ((total?.n ?? 0) >= ANSWER_MAX_TOTAL) return retry(3600, 'the cloud save is full right now');
  }

  // The hour's budget in one statement (as follow.js): a refused write changes no row, so it needs no read.
  const budgetKey = `answers|${k}`;
  const hourAgo = now - HOUR_MS;
  const budget = await env.WATCH.prepare(
    `INSERT INTO follow_rate (key, since, n) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       n = CASE WHEN follow_rate.since <= ? THEN 1 ELSE follow_rate.n + 1 END,
       since = CASE WHEN follow_rate.since <= ? THEN excluded.since ELSE follow_rate.since END
     WHERE follow_rate.since <= ? OR follow_rate.n < ?`
  )
    .bind(budgetKey, now, hourAgo, hourAgo, hourAgo, FOLLOW_WRITES_PER_HOUR)
    .run();
  if (!budget.meta || !budget.meta.changes) {
    const r = await env.WATCH.prepare('SELECT since FROM follow_rate WHERE key = ?').bind(budgetKey).first();
    const wait = Math.max(1, Math.ceil(((r?.since ?? now) + HOUR_MS - now) / 1000));
    return retry(wait, `at most ${FOLLOW_WRITES_PER_HOUR} changes an hour for one key`);
  }

  await env.WATCH.prepare(
    `INSERT INTO answers (key, e, at, updated, bytes, data) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, e) DO UPDATE SET at = excluded.at, updated = excluded.updated, bytes = excluded.bytes, data = excluded.data`
  )
    .bind(k, e, at, now, body.length, b64(body))
    .run();
  // At most ANSWER_MAX_ENTRIES per key: the least recently written go.
  const evicted = await env.WATCH.prepare(
    `DELETE FROM answers WHERE key = ? AND e NOT IN (SELECT e FROM answers WHERE key = ? ORDER BY updated DESC, e LIMIT ?)`
  )
    .bind(k, k, ANSWER_MAX_ENTRIES)
    .run();
  const n = evicted.meta?.changes ?? 0;
  return reply({ ok: true, updatedAt: now, ...(n ? { evicted: n } : {}) });
}
