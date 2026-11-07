/**
 * "Synced records" (design: ~/code/aaap-tools/notes/sync-override-tracker-design-2026-11-07.md): three small per-account
 * records the planner keeps in the browser, saved online so every browser and device agrees:
 *   override  the starting-TE override (Joo's fcc9e764): the claimed TE per virtue egg the player typed in. slot '0'.
 *   ticks     the Build-up tracker's ticked and unticked lines, per ascension. slot = the ascension's start (unix seconds).
 *   plan      the tracker's kept plan, per ascension, gzip. slot as for ticks.
 *
 *   GET    /sync?k=                       the list, no bodies: { records: [{ kind, slot, at, bytes, updatedAt }], now }
 *   GET    /sync/get?k=&kind=&slot=       one record. override and ticks: the JSON as stored (application/json); plan: the
 *                                         gzip bytes as sent (application/octet-stream, NOT content-encoding gzip, as /answers).
 *                                         Headers x-sync-at (the client's at) and x-sync-updated, both exposed to the page.
 *   PUT    /sync?k=&kind=&slot=&at=       the record as the body. 200 { ok, updatedAt, unchanged? }.
 *   DELETE /sync?k=[&kind=&slot=]         one record, or every record of the key (the player's "forget my cloud copy").
 *
 * THE KEY `k` is the same as /follow: SHA-256("aaap-follow-v1:" + PLAYER_ID in upper case), 64 hex, computed in the browser.
 * The collector never sees the ID and refuses `EI` + 16 digits (any case) in a query or a JSON body. Anyone who knows an ID can
 * read and write that account's records (the accepted design, as /follow and /prefs). A plan is the player's own farm planning
 * (what to buy and when), so the privacy page lists it.
 *
 * LAST WRITE WINS BY the client's `at` (ms since 1970, 2020 to 2100, at most 10 minutes ahead of the collector's clock). A write
 * whose `at` is older than the stored one's is 409 with the stored record's meta (and its value for the two small kinds); the
 * client adopts it, or for ticks merges and writes again with a fresh `at`. A tie is accepted. The same content again is
 * `unchanged` and writes nothing. No history: one row per record.
 *
 * LIMITS. override 512 bytes, ticks 16 KB (at most 300 ticked and 300 unticked line keys of 120 characters), plan 256 KB gzip.
 * Per key: one override and at most 3 ascensions of ticks and plans (a 4th evicts the lowest). 60 writes an hour a key (`follow_rate`
 * under 'sync|<key>'), SYNC_PUTS_PER_DAY (6,000) writes and SYNC_NEW_KEYS_PER_DAY (100) new keys a day for the whole collector,
 * 3,000 keys and SYNC_MAX_TOTAL_BYTES (150 MB) in all, and the FOLLOW_LIMIT edge binding per address.
 */
import { dayWait } from './budget.js';
import { FOLLOW_WRITES_PER_HOUR, HOUR_MS, PLAYER_ID, UNIX_FROM, UNIX_TO, isKey, overLimit, reply, retry, whole } from './follow.js';

export const SYNC_MAX_OVERRIDE_BYTES = 512;
export const SYNC_MAX_TICKS_BYTES = 16 * 1024;
export const SYNC_MAX_PLAN_BYTES = 256 * 1024;
export const SYNC_MAX_SLOTS = 3;
export const SYNC_WRITES_PER_HOUR = 60;
export const SYNC_PUTS_PER_DAY = 6000;
export const SYNC_NEW_KEYS_PER_DAY = 100;
export const SYNC_MAX_KEYS = 3000;
export const SYNC_MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const AT_AHEAD_MS = 600_000;
const EGGS = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'];
const KINDS = ['override', 'ticks', 'plan'];
const SLOT_RE = /^\d{9,11}$/;
const TICK_KEY_MAX = 120;
const TICK_COUNT_MAX = 300;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export const isSyncRequest = url => url.pathname === '/sync' || url.pathname === '/sync/get';

const bad = problems => reply({ error: 'rejected', problems }, 400);
const EXPOSE = { 'access-control-expose-headers': 'x-sync-at, x-sync-updated' };

const b64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

/** The override as stored: `{ removed: true }` or the five eggs (and optionally the save's own TE when it was typed). */
function readOverride(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { problems: ['the override must be an object'] };
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === 'removed') return v.removed === true ? { value: { removed: true } } : { problems: ['removed must be true'] };
  const out = {};
  for (const egg of EGGS) {
    if (!whole(v[egg], 0, 98)) return { problems: [`${egg} must be a whole number 0 to 98`] };
    out[egg] = v[egg];
  }
  if (v.saveTE !== undefined) {
    if (!whole(v.saveTE, 0, 490)) return { problems: ['saveTE must be a whole number 0 to 490'] };
    out.saveTE = v.saveTE;
  }
  const extra = keys.filter(k => !(EGGS.includes(k) || k === 'saveTE'));
  if (extra.length) return { problems: [`unknown field: ${extra[0]}`] };
  return { value: out };
}

const readLines = (name, a) => {
  if (!Array.isArray(a) || a.length > TICK_COUNT_MAX) return { problems: [`${name} must be a list of at most ${TICK_COUNT_MAX} line keys`] };
  if (!a.every(x => typeof x === 'string' && x.length >= 1 && x.length <= TICK_KEY_MAX && !CONTROL.test(x))) return { problems: [`each ${name} key must be 1 to ${TICK_KEY_MAX} characters, no control characters`] };
  return { value: a.slice() };
};
function readTicks(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { problems: ['ticks must be an object'] };
  const t = readLines('ticked', v.ticked);
  if (t.problems) return t;
  const out = { ticked: t.value };
  if (v.unticked !== undefined) {
    const u = readLines('unticked', v.unticked);
    if (u.problems) return u;
    out.unticked = u.value;
  }
  return { value: out };
}

const metaOf = r => ({ kind: r.kind, slot: r.slot, at: r.at, bytes: r.bytes, updatedAt: r.updated });
const latestOf = r => ({ ...metaOf(r), ...(r.enc === 'json' ? { value: JSON.parse(r.data) } : {}) });

/** `GET /sync`, `GET /sync/get`, `PUT /sync`, `DELETE /sync`. */
export async function handleSync(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'synced records are not set up on this collector' }, 503);
  const url = new URL(request.url);
  if (PLAYER_ID.test(url.search)) return bad(['send the key, never the player id']);
  const k = url.searchParams.get('k');
  if (!isKey(k)) return bad(['k must be 64 lowercase hex characters']);

  if (request.method === 'GET') {
    const slow = await overLimit(env, request, 'sync-get');
    if (slow) return slow;
    if (url.pathname === '/sync/get') {
      const kind = url.searchParams.get('kind');
      const slot = url.searchParams.get('slot') ?? '';
      if (!KINDS.includes(kind)) return bad([`kind must be one of ${KINDS.join(', ')}`]);
      const r = await env.WATCH.prepare('SELECT kind, slot, at, updated, bytes, enc, data FROM synced WHERE key = ? AND kind = ? AND slot = ?').bind(k, kind, slot).first();
      if (!r) return reply({ error: 'not found' }, 404);
      const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-sync-at': String(r.at), 'x-sync-updated': String(r.updated), ...EXPOSE };
      if (r.enc === 'json') return new Response(r.data, { status: 200, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
      return new Response(unb64(r.data), { status: 200, headers: { ...headers, 'content-type': 'application/octet-stream' } });
    }
    const { results } = await env.WATCH.prepare('SELECT kind, slot, at, updated, bytes FROM synced WHERE key = ? ORDER BY kind, slot LIMIT 20').bind(k).all();
    return reply({ records: (results || []).map(metaOf), now });
  }

  if (request.method === 'DELETE') {
    const slow = await overLimit(env, request, 'sync-put');
    if (slow) return slow;
    const kind = url.searchParams.get('kind');
    if (kind === null) await env.WATCH.prepare('DELETE FROM synced WHERE key = ?').bind(k).run();
    else {
      if (!KINDS.includes(kind)) return bad([`kind must be one of ${KINDS.join(', ')}`]);
      await env.WATCH.prepare('DELETE FROM synced WHERE key = ? AND kind = ? AND slot = ?').bind(k, kind, url.searchParams.get('slot') ?? '').run();
    }
    return reply({ ok: true });
  }

  if (request.method !== 'PUT' || url.pathname !== '/sync') return reply({ error: 'method not allowed' }, 405);
  const slow = await overLimit(env, request, 'sync-put');
  if (slow) return slow;

  const kind = url.searchParams.get('kind');
  const slot = url.searchParams.get('slot') ?? '';
  const atText = url.searchParams.get('at') ?? '';
  const problems = [];
  if (!KINDS.includes(kind)) problems.push(`kind must be one of ${KINDS.join(', ')}`);
  else if (kind === 'override' ? slot !== '0' : !SLOT_RE.test(slot)) problems.push(kind === 'override' ? "slot must be '0' for the override" : 'slot must be the ascension start in unix seconds');
  const at = /^\d{1,16}$/.test(atText) ? Number(atText) : NaN;
  if (!whole(at, UNIX_FROM * 1000, UNIX_TO * 1000)) problems.push('at must be milliseconds since 1970 between 2020 and 2100');
  else if (at > now + AT_AHEAD_MS) problems.push("at is more than 10 minutes ahead of the collector clock: check this device's clock");
  if (problems.length) return bad(problems);

  const cap = kind === 'override' ? SYNC_MAX_OVERRIDE_BYTES : kind === 'ticks' ? SYNC_MAX_TICKS_BYTES : SYNC_MAX_PLAN_BYTES;
  const declared = request.headers.get('content-length');
  if (declared === null) return reply({ error: 'content-length is required' }, 411);
  if (Number(declared) > cap) return reply({ error: 'too big' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > cap) return reply({ error: 'too big' }, 413);

  let enc;
  let data;
  if (kind === 'plan') {
    if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bad(['the plan must be gzip bytes']);
    enc = 'gz';
    data = b64(bytes);
  } else {
    const text = new TextDecoder().decode(bytes);
    if (PLAYER_ID.test(text)) return bad(['send the key, never the player id']);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return reply({ error: 'body must be JSON' }, 400);
    }
    const checked = kind === 'override' ? readOverride(parsed) : readTicks(parsed);
    if (checked.problems) return bad(checked.problems);
    enc = 'json';
    data = JSON.stringify(checked.value);
  }
  const size = enc === 'gz' ? bytes.length : data.length;

  const have = await env.WATCH.prepare('SELECT kind, slot, at, updated, bytes, enc, data FROM synced WHERE key = ? AND kind = ? AND slot = ?').bind(k, kind, slot).first();
  if (have) {
    if (have.data === data) return reply({ ok: true, unchanged: true, updatedAt: have.updated });
    if (have.at > at) return reply({ error: 'a newer record is stored (its at is higher); use it', latest: latestOf(have) }, 409);
  } else {
    // A new record: the collector's size caps, a read each, only when something new would be created.
    const mine = await env.WATCH.prepare('SELECT COUNT(*) AS n FROM synced WHERE key = ?').bind(k).first();
    if (!mine?.n) {
      const newKeyWait = await dayWait(env, 'sync-new-keys-day', Number(env.SYNC_NEW_KEYS_PER_DAY) || SYNC_NEW_KEYS_PER_DAY, now);
      if (newKeyWait) return retry(newKeyWait, 'the cloud save has taken all the new accounts it can today');
      const keys = await env.WATCH.prepare('SELECT COUNT(DISTINCT key) AS n FROM synced').first();
      if ((keys?.n ?? 0) >= SYNC_MAX_KEYS) return retry(3600, 'the cloud save is full right now');
    }
    const total = await env.WATCH.prepare('SELECT COALESCE(SUM(bytes), 0) AS b FROM synced').first();
    if ((total?.b ?? 0) + size > (Number(env.SYNC_MAX_TOTAL_BYTES) || SYNC_MAX_TOTAL_BYTES)) return retry(3600, 'the cloud save is full right now');
  }

  const putWait = await dayWait(env, 'sync-puts-day', Number(env.SYNC_PUTS_PER_DAY) || SYNC_PUTS_PER_DAY, now);
  if (putWait) return retry(putWait, 'the cloud save has taken all the writes it can today');
  const hourAgo = now - HOUR_MS;
  const budget = await env.WATCH.prepare(
    `INSERT INTO follow_rate (key, since, n) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       n = CASE WHEN follow_rate.since <= ? THEN 1 ELSE follow_rate.n + 1 END,
       since = CASE WHEN follow_rate.since <= ? THEN excluded.since ELSE follow_rate.since END
     WHERE follow_rate.since <= ? OR follow_rate.n < ?`
  )
    .bind(`sync|${k}`, now, hourAgo, hourAgo, hourAgo, SYNC_WRITES_PER_HOUR)
    .run();
  if (!budget.meta || !budget.meta.changes) {
    const r = await env.WATCH.prepare('SELECT since FROM follow_rate WHERE key = ?').bind(`sync|${k}`).first();
    return retry(Math.max(1, Math.ceil(((r?.since ?? now) + HOUR_MS - now) / 1000)), `at most ${SYNC_WRITES_PER_HOUR} changes an hour for one key`);
  }

  await env.WATCH.prepare(
    `INSERT INTO synced (key, kind, slot, at, updated, bytes, enc, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key, kind, slot) DO UPDATE SET at = excluded.at, updated = excluded.updated, bytes = excluded.bytes, enc = excluded.enc, data = excluded.data`
  )
    .bind(k, kind, slot, at, now, size, enc, data)
    .run();
  if (kind !== 'override') {
    // At most SYNC_MAX_SLOTS ascensions a kind: the lowest slots (the oldest ascensions) go.
    await env.WATCH.prepare(
      `DELETE FROM synced WHERE key = ? AND kind = ? AND slot NOT IN (SELECT slot FROM synced WHERE key = ? AND kind = ? ORDER BY CAST(slot AS INTEGER) DESC LIMIT ?)`
    )
      .bind(k, kind, k, kind, SYNC_MAX_SLOTS)
      .run();
  }
  return reply({ ok: true, updatedAt: now });
}
