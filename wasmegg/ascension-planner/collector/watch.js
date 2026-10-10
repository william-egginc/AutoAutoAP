/**
 * "Watch this run from your phone": the collector's half (the planner's is
 * src/composables/useWatchLink.ts, the page src/watch/phone.ts, the rules src/search/watchLink.ts).
 *
 *   POST /watch          a run's heartbeat, under its random watch key. Text body (no preflight).
 *   GET  /watch?key=     the last heartbeat for that key, for the watch page.
 *   scheduled()          every 5 min: one ntfy note for a running run that stopped reporting, and
 *                        rows not updated in 7 days are deleted.
 *
 * D1, NOT KV. A run posts every 5 minutes: ~290 writes a day for a run left going, and KV's free
 * plan allows 1,000 writes a day for the whole account. D1's free plan allows 100,000 rows written a
 * day. The table is `WITHOUT ROWID` with the key as its primary key, so an update is one row written.
 *
 * NOTHING PERSONAL. A heartbeat is whitelisted field by field (`cleanHeartbeat`): status, mode,
 * progress, time left, best so far (TE, route, finish, spare days), start and update times, worker
 * count, and a label only if the player typed one. The ntfy topic, if any, goes in its own column
 * and is never served back.
 *
 * LIMITS. A body over 2 KB is refused. One write a minute per key: the upsert itself refuses an
 * earlier one (no separate read), except that a change of status gets through after 2 s, so a run
 * that is stopped straight after starting still says so. At most MAX_ROWS rows: a new key past
 * that is refused. With the optional WATCH_LIMIT rate-limit binding (wrangler.toml), also a few
 * requests a minute per IP address.
 */

export const WATCH_MAX_BYTES = 2048;
export const WATCH_MIN_GAP_MS = 60_000;
export const WATCH_STATUS_GAP_MS = 2_000;
export const WATCH_STALE_MS = 15 * 60_000;
export const WATCH_KEEP_MS = 7 * 86_400_000;
export const MAX_ROWS = 5000;
const NTFY = 'https://ntfy.sh';

const STATUSES = new Set(['running', 'finished', 'stopped', 'failed']);
const MODES = new Set(['fastest', 'full-sweep', 'by-date']);

const isKey = k => typeof k === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(k);
const isTopic = t => typeof t === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(t);
const num = (v, max = 1e15) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
const int = (v, max) => {
  const n = num(v, max);
  return n === null ? null : Math.round(n);
};

/** The heartbeat as stored: only the known fields, each checked. Null when it is not one. */
export function cleanHeartbeat(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  if (!isKey(b.key) || !STATUSES.has(b.status) || !MODES.has(b.mode)) return null;
  const startedAt = int(b.startedAt, 1e14);
  const updatedAt = int(b.updatedAt, 1e14);
  if (startedAt === null || updatedAt === null) return null;
  const out = {
    status: b.status,
    mode: b.mode,
    done: int(b.done, 1e12) ?? 0,
    total: int(b.total, 1e12),
    timeLeftSec: int(b.timeLeftSec, 1e9),
    bestSoFar: null,
    startedAt,
    updatedAt,
    workers: int(b.workers, 4096) ?? 0,
  };
  const pct = num(b.pct, 100);
  if (pct !== null) out.pct = Math.round(pct * 10) / 10;
  const best = b.bestSoFar;
  if (best && typeof best === 'object' && !Array.isArray(best)) {
    const te = int(best.te, 1e6);
    if (te !== null) {
      out.bestSoFar = {
        te,
        route: Array.isArray(best.route) ? best.route.slice(0, 40).map(x => int(x, 1e6) ?? 0) : [],
        finish: int(best.finish, 1e11),
      };
      if (typeof best.spareDays === 'number' && Number.isFinite(best.spareDays) && Math.abs(best.spareDays) < 1e5)
        out.bestSoFar.spareDays = Math.round(best.spareDays * 10) / 10;
    }
  }
  if (typeof b.label === 'string') {
    const label = b.label
      // eslint-disable-next-line no-control-regex -- control characters are exactly what goes
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, 40);
    if (label) out.label = label;
  }
  return out;
}

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};
const reply = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

/** Whether a request is for this module. */
export function isWatchRequest(url) {
  return url.pathname === '/watch';
}

/** `POST /watch` and `GET /watch?key=`. */
export async function handleWatch(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'watching is not set up on this collector' }, 503);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const key = url.searchParams.get('key');
    if (!isKey(key)) return reply({ error: 'not a watch key' }, 400);
    const row = await env.WATCH.prepare('SELECT data, updated FROM watch WHERE key = ?').bind(key).first();
    if (!row) return reply({ error: 'not found' }, 404);
    let data;
    try {
      data = JSON.parse(row.data);
    } catch {
      return reply({ error: 'not found' }, 404);
    }
    return reply({ data, updated: row.updated, now });
  }

  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  if (env.WATCH_LIMIT) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    try {
      const { success } = await env.WATCH_LIMIT.limit({ key: ip });
      if (!success)
        return reply({ error: 'too many requests', retryAfter: 60 }, 429, {
          'retry-after': '60',
          'access-control-expose-headers': 'retry-after',
        });
    } catch {
      // the limiter itself failed: carry on with the per-key limit alone
    }
  }

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > WATCH_MAX_BYTES) return reply({ error: 'too big' }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > WATCH_MAX_BYTES) return reply({ error: 'too big' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: 'body must be JSON' }, 400);
  }
  const data = cleanHeartbeat(body);
  if (!data) return reply({ error: 'not a heartbeat' }, 400);
  const key = body.key;
  const notify = isTopic(body.notify) ? body.notify : null;
  const json = JSON.stringify(data);
  if (!(await roomForNewKey(env, key))) return reply({ error: 'too many runs are being watched right now' }, 503);

  // One statement: insert a new key, or update an old one only if it is a minute old (or the status
  // changed and it is 2 s old). `changes` says which happened, so the rate limit costs no read.
  const res = await env.WATCH.prepare(
    `INSERT INTO watch (key, data, updated, notify, alerted) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated = excluded.updated,
       notify = excluded.notify, alerted = 0
     WHERE watch.updated <= ?
        OR (watch.updated <= ? AND json_extract(watch.data, '$.status') <> json_extract(excluded.data, '$.status'))`
  )
    .bind(key, json, now, notify, now - WATCH_MIN_GAP_MS, now - WATCH_STATUS_GAP_MS)
    .run();
  if (!res.meta || !res.meta.changes) {
    const prev = await env.WATCH.prepare('SELECT updated FROM watch WHERE key = ?').bind(key).first();
    const wait = prev ? Math.max(1, Math.ceil((prev.updated + WATCH_MIN_GAP_MS - now) / 1000)) : 60;
    return reply({ error: 'too soon', retryAfter: wait }, 429, {
      'retry-after': String(wait),
      'access-control-expose-headers': 'retry-after',
    });
  }
  return reply({ ok: true });
}

/**
 * The cron: a running run with notifications on that has not reported for 15 minutes gets ONE ntfy
 * note (`alerted` is set, and only a fresh heartbeat clears it); rows not updated in 7 days go.
 */
export async function watchCron(env, now = Date.now(), fetchImpl = fetch, opts = {}) {
  if (!env.WATCH) return { alerted: 0, deleted: 0 };
  const { results } = await env.WATCH.prepare(
    `SELECT key, notify FROM watch
     WHERE alerted = 0 AND notify IS NOT NULL AND updated < ? AND updated > ?
       AND json_extract(data, '$.status') = 'running'
     LIMIT 100`
  )
    .bind(now - WATCH_STALE_MS, now - WATCH_KEEP_MS)
    .all();
  let alerted = 0;
  for (const row of results || []) {
    // Marked first, so a note that fails is not retried every 5 minutes for a week.
    const mark = await env.WATCH.prepare('UPDATE watch SET alerted = 1 WHERE key = ? AND alerted = 0')
      .bind(row.key)
      .run();
    if (!mark.meta || !mark.meta.changes) continue;
    alerted++;
    const click = opts.pageUrl ? `${opts.pageUrl}?k=${encodeURIComponent(row.key)}` : undefined;
    try {
      await fetchImpl(NTFY, {
        method: 'POST',
        body: JSON.stringify({
          topic: row.notify,
          title: 'Ascension Planner',
          message: 'Your run stopped reporting 15 min ago. The tab may have crashed or the computer may be asleep.',
          tags: ['warning'],
          ...(click ? { click } : {}),
        }),
      });
    } catch {
      // ntfy down: the watch page still says so
    }
  }
  let deleted = 0;
  if (opts.prune !== false) {
    const del = await env.WATCH.prepare('DELETE FROM watch WHERE updated < ?')
      .bind(now - WATCH_KEEP_MS)
      .run();
    deleted = (del.meta && del.meta.changes) || 0;
  }
  return { alerted, deleted };
}

/** At most MAX_ROWS rows: checked only when a key is new, so a run's own updates read nothing. */
export async function roomForNewKey(env, key) {
  const known = await env.WATCH.prepare('SELECT 1 AS x FROM watch WHERE key = ?').bind(key).first();
  if (known) return true;
  const n = await env.WATCH.prepare('SELECT COUNT(*) AS n FROM watch').first();
  return !n || n.n < MAX_ROWS;
}
