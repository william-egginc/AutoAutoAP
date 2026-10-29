/**
 * "Which build is in use": a daily count per page build, and nothing else (24 Oct 2026, the owner: "it just sends
 * only what version it is"). The app side is src/lib/buildCount.ts.
 *
 *   POST /v      body: the build id as plain text, e.g. `index-BGv8tSVu` (the hashed entry script the page loaded)
 *
 * WHAT IS KEPT. One row per (UTC day, build) in D1 `build_counts` with a count `n`: no address, no time beyond
 * the day, no header, no other field. Rows older than 30 days are deleted by the cron (`buildCountSweep`).
 *
 * WHAT IS REFUSED. A body that is not exactly one build id (`BUILD_ID`: a lowercase entry name, a dash and a
 * 6 to 16 character hash; 33 characters at most, so a player ID's 18 cannot fit) is `400`; a body over 64 bytes is
 * `413`. Past `BUILD_DAY_CAP` different builds in one day a new build is not counted (`counted: false`), so junk
 * cannot fill the table; builds already seen that day still count.
 *
 * THE RATE LIMIT is the `BUILD_LIMIT` edge binding, per address, counted at the edge: the address is a key for
 * the binding only, never written anywhere. A missing binding means no per-address limit, as for the others.
 *
 * COST. A count is one upsert: its WHERE reads the (day, build) row and, only for a build new that day, the
 * day's rows (at most BUILD_DAY_CAP). A browser sends at most once a day per build.
 */

export const BUILD_MAX_BODY = 64;
export const BUILD_DAY_CAP = 200;
export const BUILD_KEEP_DAYS = 30;
/** `index-BGv8tSVu`: the entry's name (vite.config.ts rollupOptions.input), a dash, the content hash. */
export const BUILD_ID = /^[a-z]{1,16}-[A-Za-z0-9_-]{6,16}$/;
const DAY_MS = 86_400_000;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};
const reply = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });

export const isBuildCountRequest = url => url.pathname === '/v';

/** The UTC day of `ms`, `YYYY-MM-DD`. */
export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

async function overLimit(env, request) {
  if (!env.BUILD_LIMIT || typeof env.BUILD_LIMIT.limit !== 'function') return null;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const { success } = await env.BUILD_LIMIT.limit({ key: `v|${ip}` });
    if (success) return null;
  } catch {
    return null; // a limiter that errors must never take the rest down
  }
  return reply({ error: 'too many requests from this address', retryAfter: 60 }, 429, {
    'retry-after': '60',
    'access-control-expose-headers': 'retry-after',
  });
}

/** `POST /v`. */
export async function handleBuildCount(request, env, now = Date.now()) {
  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405, { allow: 'POST, OPTIONS' });
  const slow = await overLimit(env, request);
  if (slow) return slow;
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > BUILD_MAX_BODY) return reply({ error: 'too big' }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > BUILD_MAX_BODY) return reply({ error: 'too big' }, 413);
  const build = text.trim();
  if (!BUILD_ID.test(build))
    return reply({ error: 'rejected', problems: ['the body must be one build id, like index-BGv8tSVu'] }, 400);
  if (!env.WATCH) return reply({ error: 'build counts are not set up on this collector' }, 503);

  const day = utcDay(now);
  try {
    // One statement: a build already counted today adds one; a new one is inserted only while the day has fewer
    // than BUILD_DAY_CAP builds (`changes` 0 means it was over the cap).
    const r = await env.WATCH.prepare(
      `INSERT INTO build_counts (day, build, n)
       SELECT ?, ?, 1
       WHERE EXISTS (SELECT 1 FROM build_counts WHERE day = ? AND build = ?)
          OR (SELECT COUNT(*) FROM build_counts WHERE day = ?) < ?
       ON CONFLICT(day, build) DO UPDATE SET n = n + 1`
    )
      .bind(day, build, day, build, day, BUILD_DAY_CAP)
      .run();
    return reply({ ok: true, counted: !!(r.meta && r.meta.changes) });
  } catch {
    return reply({ error: 'could not count it' }, 503);
  }
}

/** The cron's clean-up: rows of days more than BUILD_KEEP_DAYS ago. Returns the rows deleted. */
export async function buildCountSweep(env, now = Date.now()) {
  if (!env.WATCH) return 0;
  const r = await env.WATCH.prepare('DELETE FROM build_counts WHERE day < ?')
    .bind(utcDay(now - BUILD_KEEP_DAYS * DAY_MS))
    .run();
  return (r.meta && r.meta.changes) || 0;
}
