/**
 * "Watch this run from your phone": the collector's half (the planner's is
 * src/composables/useWatchLink.ts, the page src/watch/phone.ts, the rules src/search/watchLink.ts).
 *
 *   POST /watch          a run's sealed heartbeat: `{ id, iv, ct, status, notify? }`, text body (no
 *                        preflight). Or `{ id, status }` alone: a status change with nothing sealed
 *                        (the run page closing), which keeps the last sealed heartbeat.
 *   GET  /watch?id=      `{ iv, ct, status, updated, now }` for the watch page.
 *   scheduled()          every 5 min: one ntfy note for a running run that stopped reporting, and
 *                        rows not updated in 7 days are deleted.
 *
 * END TO END: THE COLLECTOR CANNOT READ A HEARTBEAT. The run's tab encrypts it (AES-256-GCM) with a
 * secret that exists only in the watch link's fragment (`watch.html#<id>.<secret>`), which browsers
 * never send to a server. All this stores is the id, the IV, the ciphertext, the plain status (the
 * cron needs to know a run is still marked running), when it was stored, and the ntfy topic if the
 * player turned notifications on (its own column, never served back). Progress, TE, route, dates and
 * the label are inside the ciphertext.
 *
 * D1, NOT KV. A run posts every 5 minutes: ~290 writes a day for a run left going, and KV's free
 * plan allows 1,000 writes a day for the whole account. D1's free plan allows 100,000 rows written a
 * day. The table is `WITHOUT ROWID` with the id as its primary key (column `key`), so an update is
 * one row written.
 *
 * LIMITS. A body over 2 KB is refused. One write a minute per id: the write itself refuses an
 * earlier one (no separate read), except that a change of status gets through after 2 s, so a run
 * that is stopped straight after starting still says so. At most MAX_ROWS rows: a new id past that
 * is refused. With the optional WATCH_LIMIT rate-limit binding (wrangler.toml), also a few requests a
 * minute per IP address.
 */

export const WATCH_MAX_BYTES = 2048;
export const WATCH_MIN_GAP_MS = 60_000;
export const WATCH_STATUS_GAP_MS = 2_000;
export const WATCH_STALE_MS = 15 * 60_000;
export const WATCH_KEEP_MS = 7 * 86_400_000;
export const MAX_ROWS = 5000;
const NTFY = 'https://ntfy.sh';

const STATUSES = new Set(['running', 'finished', 'stopped', 'failed']);

const isId = k => typeof k === 'string' && /^[A-Za-z0-9_-]{22}$/.test(k);
const isTopic = t => typeof t === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(t);
/** A 12-byte IV is 16 characters of base64url. */
const isIv = v => typeof v === 'string' && /^[A-Za-z0-9_-]{16}$/.test(v);
/** Ciphertext: base64url, at least the 16-byte GCM tag (22 characters). The body cap bounds it. */
const isCt = v => typeof v === 'string' && /^[A-Za-z0-9_-]{22,}$/.test(v);

/**
 * A POST body checked: `{ id, status, notify, sealed }`, where `sealed` is `{ iv, ct }` or null for a
 * status-only post. Null when it is not one. Nothing else in the body is kept.
 */
export function readPost(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  if (!isId(b.id) || !STATUSES.has(b.status)) return null;
  const has = b.iv !== undefined || b.ct !== undefined;
  if (has && !(isIv(b.iv) && isCt(b.ct))) return null;
  return {
    id: b.id,
    status: b.status,
    notify: isTopic(b.notify) ? b.notify : null,
    sealed: has ? { iv: b.iv, ct: b.ct } : null,
  };
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

/** The write may go: a minute since the last, or a new status two seconds after it. (SQL, shared.) */
const MAY_WRITE = `(watch.updated <= ? OR (watch.updated <= ? AND json_extract(watch.data, '$.status') <> ?))`;

/** `POST /watch` and `GET /watch?id=`. */
export async function handleWatch(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'watching is not set up on this collector' }, 503);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!isId(id)) return reply({ error: 'not a watch id' }, 400);
    const row = await env.WATCH.prepare('SELECT data, updated FROM watch WHERE key = ?').bind(id).first();
    if (!row) return reply({ error: 'not found' }, 404);
    let data;
    try {
      data = JSON.parse(row.data);
    } catch {
      return reply({ error: 'not found' }, 404);
    }
    return reply({ iv: data.iv, ct: data.ct, status: data.status, updated: row.updated, now });
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
      // the limiter itself failed: carry on with the per-id limit alone
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
  const p = readPost(body);
  if (!p) return reply({ error: 'not a heartbeat' }, 400);
  const gate = [now - WATCH_MIN_GAP_MS, now - WATCH_STATUS_GAP_MS, p.status];

  let res;
  if (p.sealed) {
    if (!(await roomForNewKey(env, p.id))) return reply({ error: 'too many runs are being watched right now' }, 503);
    const data = JSON.stringify({ iv: p.sealed.iv, ct: p.sealed.ct, status: p.status });
    // One statement: insert a new id, or update an old one only when MAY_WRITE. `changes` says which
    // happened, so the rate limit costs no read.
    res = await env.WATCH.prepare(
      `INSERT INTO watch (key, data, updated, notify, alerted) VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated = excluded.updated,
         notify = excluded.notify, alerted = 0
       WHERE ${MAY_WRITE}`
    )
      .bind(p.id, data, now, p.notify, ...gate)
      .run();
  } else {
    // A status alone: the last sealed heartbeat stays, with its status replaced.
    res = await env.WATCH.prepare(
      `UPDATE watch SET data = json_set(data, '$.status', ?), updated = ?, notify = ?, alerted = 0
       WHERE key = ? AND ${MAY_WRITE}`
    )
      .bind(p.status, now, p.notify, p.id, ...gate)
      .run();
  }
  if (!res.meta || !res.meta.changes) {
    const prev = await env.WATCH.prepare('SELECT updated FROM watch WHERE key = ?').bind(p.id).first();
    if (!prev) return reply({ error: 'not found' }, 404);
    const wait = Math.max(1, Math.ceil((prev.updated + WATCH_MIN_GAP_MS - now) / 1000));
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
    try {
      await fetchImpl(NTFY, {
        method: 'POST',
        body: JSON.stringify({
          topic: row.notify,
          title: 'Ascension Planner',
          // No link and no run details: anyone who knows a topic can read it, and the collector has
          // neither the watch link's secret nor anything readable to put in.
          message:
            'Your planner run stopped reporting 15 min ago. The tab may have crashed or the computer may be asleep.',
          tags: ['warning'],
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
