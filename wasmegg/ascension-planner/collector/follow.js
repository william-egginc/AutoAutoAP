/**
 * "Follow in the cloud": a cloud save of each player's FOLLOWED route, so entering the player ID on any
 * device loads the route they follow. Contract for the app: ~/code/aaap-tools/notes/follow-contract.md.
 *
 *   GET /follow?k=            every goal for a key: `{ goals: { <goal>: { value, version, updatedAt } }, now }`
 *   PUT /follow               `{ k, goal, value }`, written only when the player presses Follow
 *   GET /follow/history?k=&goal=   the last 5 versions of one goal, newest first (a restore is a PUT of an old value)
 *
 * THE KEY. `k` is SHA-256("aaap-follow-v1:" + the player ID in upper case), lowercase hex, computed in the
 * browser. The collector never sees the ID and refuses any body or query that contains one. Anyone who knows
 * the ID can compute the key, read the route and write over it: Jordan's design ("one less setup"), so the
 * damage is bounded instead: 30 writes an hour per key, the last 5 versions of each goal kept so an old
 * one can be put back, 8 goals per key, and (with the FOLLOW_LIMIT binding) a per-address limit.
 *
 * D1, NOT KV. KV's 1,000 writes a day are shared with the board. A PUT is one insert and one prune (rows
 * written: about 3 with the rate row); D1's free plan allows 100,000 rows a day. The per-key hourly budget
 * is one upsert on `follow_rate` whose WHERE refuses the write, so it costs no read (the trick watch.js uses).
 *
 * LIMITS. Body 6 KB, stored value 4 KB, 8 goals a key, 20,000 keys in all. The value is whitelisted field by
 * field (`readValue`): a field that is out of bounds refuses the write with its name; an unknown field is dropped.
 */

export const FOLLOW_MAX_BODY = 6 * 1024;
export const FOLLOW_MAX_VALUE = 4096;
export const FOLLOW_VERSIONS = 5;
export const FOLLOW_WRITES_PER_HOUR = 30;
export const FOLLOW_MAX_GOALS = 8;
export const FOLLOW_MAX_KEYS = 20000;
const HOUR_MS = 3_600_000;
const UNIX_FROM = 1577836800;
const UNIX_TO = 4102444800;
const SOURCES = ['instant', 'fast', 'exact', 'custom', 'manual'];
/** A version or build stamp: the app's build is an ISO time (colons), a simulator version has none. */
const STAMP = /^[0-9A-Za-z._:-]{1,40}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PLAYER_ID = /EI\d{16}/i;

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};
const reply = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const retry = (seconds, error, status = 429) =>
  reply({ error, retryAfter: seconds }, status, { 'retry-after': String(seconds), 'access-control-expose-headers': 'retry-after' });

export const isFollowRequest = url => url.pathname === '/follow' || url.pathname === '/follow/history';
const isKey = k => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);

/** A goal's text, or null: race490, eggday2027, bydate:<unix seconds>, target:<te 1-490>. */
export function readGoal(g) {
  if (typeof g !== 'string' || g.length > 32) return null;
  if (g === 'race490' || g === 'eggday2027') return g;
  const d = /^bydate:(\d{9,11})$/.exec(g);
  if (d && +d[1] >= UNIX_FROM && +d[1] <= UNIX_TO) return g;
  const t = /^target:(\d{1,3})$/.exec(g);
  if (t && +t[1] >= 1 && +t[1] <= 490) return g;
  return null;
}

const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/**
 * A value checked: `{ value }` (the whitelisted copy) or `{ problems }`. Required: chain, planStart, source, at.
 * A bad optional field is a problem too (the app builds these, so a drift should say so); unknown fields are dropped.
 */
export function readValue(v) {
  const problems = [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { problems: ['value must be an object'] };
  const out = {};
  const c = v.chain;
  if (!Array.isArray(c) || !c.length || c.length > 16 || !c.every((x, i) => whole(x, 0, 490) && (i === 0 || x > c[i - 1])))
    problems.push('chain must be 1 to 16 whole TE stops, 0 to 490, strictly increasing');
  else out.chain = c.slice();
  if (!whole(v.planStart, UNIX_FROM, UNIX_TO)) problems.push('planStart must be unix seconds between 2020 and 2100');
  else out.planStart = v.planStart;
  if (!SOURCES.includes(v.source)) problems.push(`source must be one of ${SOURCES.join(', ')}`);
  else out.source = v.source;
  if (!whole(v.at, UNIX_FROM * 1000, UNIX_TO * 1000)) problems.push('at must be milliseconds since 1970 between 2020 and 2100');
  else out.at = v.at;
  if (v.finish !== undefined) {
    if (!whole(v.finish, UNIX_FROM, UNIX_TO)) problems.push('finish must be unix seconds between 2020 and 2100');
    else out.finish = v.finish;
  }
  if (v.endTE !== undefined) {
    if (!whole(v.endTE, 0, 490)) problems.push('endTE must be a whole number 0 to 490');
    else out.endTE = v.endTE;
  }
  if (v.spareSeconds !== undefined) {
    if (!Number.isFinite(v.spareSeconds) || Math.abs(v.spareSeconds) > 3e8) problems.push('spareSeconds must be within 300,000,000 either way');
    else out.spareSeconds = v.spareSeconds;
  }
  if (v.hours !== undefined && v.hours !== null) {
    const h = v.hours;
    if (
      !h ||
      typeof h !== 'object' ||
      Array.isArray(h) ||
      !HHMM.test(h.start ?? '') ||
      !HHMM.test(h.end ?? '') ||
      (h.timezone !== undefined && !(typeof h.timezone === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(h.timezone)))
    )
      problems.push('hours must be null or { start: "HH:MM", end: "HH:MM", timezone?: IANA name }');
    else out.hours = { start: h.start, end: h.end, ...(h.timezone !== undefined ? { timezone: h.timezone } : {}) };
  } else if (v.hours === null) out.hours = null;
  if (v.saveTime !== undefined) {
    if (!whole(v.saveTime, UNIX_FROM, UNIX_TO)) problems.push('saveTime must be unix seconds between 2020 and 2100');
    else out.saveTime = v.saveTime;
  }
  for (const f of ['simVersion', 'build']) {
    if (v[f] === undefined) continue;
    if (typeof v[f] !== 'string' || !STAMP.test(v[f])) problems.push(`${f} must be 1 to 40 of letters, digits, . _ : -`);
    else out[f] = v[f];
  }
  if (problems.length) return { problems };
  const text = JSON.stringify(out);
  if (text.length > FOLLOW_MAX_VALUE) return { problems: [`value is over ${FOLLOW_MAX_VALUE} bytes`], big: true };
  return { value: out, text };
}

async function overLimit(env, request, kind) {
  if (!env.FOLLOW_LIMIT || typeof env.FOLLOW_LIMIT.limit !== 'function') return null;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const { success } = await env.FOLLOW_LIMIT.limit({ key: `follow-${kind}|${ip}` });
    if (success) return null;
  } catch {
    return null;
  }
  return retry(60, 'too many requests from this address');
}

const parse = text => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** `GET /follow`, `PUT /follow`, `GET /follow/history`. */
export async function handleFollow(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'following is not set up on this collector' }, 503);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    if (PLAYER_ID.test(url.search)) return reply({ error: 'rejected', problems: ['send the key, never the player id'] }, 400);
    const k = url.searchParams.get('k');
    if (!isKey(k)) return reply({ error: 'rejected', problems: ['k must be 64 lowercase hex characters'] }, 400);
    const slow = await overLimit(env, request, 'get');
    if (slow) return slow;
    if (url.pathname === '/follow/history') {
      const goal = readGoal(url.searchParams.get('goal'));
      if (!goal) return reply({ error: 'rejected', problems: ['goal is not one of race490, eggday2027, bydate:<unix>, target:<te>'] }, 400);
      const { results } = await env.WATCH.prepare(
        'SELECT version, value, updated FROM follows WHERE key = ? AND goal = ? ORDER BY version DESC LIMIT ?'
      )
        .bind(k, goal, FOLLOW_VERSIONS)
        .all();
      const versions = (results || []).flatMap(r => {
        const value = parse(r.value);
        return value ? [{ version: r.version, updatedAt: r.updated, value }] : [];
      });
      return reply({ versions, now });
    }
    // The newest version of each goal.
    const { results } = await env.WATCH.prepare(
      `SELECT f.goal, f.version, f.value, f.updated FROM follows f
       WHERE f.key = ? AND f.version = (SELECT MAX(version) FROM follows WHERE key = f.key AND goal = f.goal)
       ORDER BY f.goal LIMIT ?`
    )
      .bind(k, FOLLOW_MAX_GOALS)
      .all();
    const goals = {};
    for (const r of results || []) {
      const value = parse(r.value);
      if (value) goals[r.goal] = { value, version: r.version, updatedAt: r.updated };
    }
    return reply({ goals, now });
  }

  if (request.method !== 'PUT' || url.pathname !== '/follow') return reply({ error: 'method not allowed' }, 405);

  const slow = await overLimit(env, request, 'put');
  if (slow) return slow;
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > FOLLOW_MAX_BODY) return reply({ error: 'too big' }, 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > FOLLOW_MAX_BODY) return reply({ error: 'too big' }, 413);
  if (PLAYER_ID.test(text)) return reply({ error: 'rejected', problems: ['send the key, never the player id'] }, 400);
  const body = parse(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'body must be JSON' }, 400);
  const problems = [];
  if (!isKey(body.k)) problems.push('k must be 64 lowercase hex characters');
  const goal = readGoal(body.goal);
  if (!goal) problems.push('goal is not one of race490, eggday2027, bydate:<unix>, target:<te>');
  const checked = readValue(body.value);
  if (checked.problems) {
    if (checked.big) return reply({ error: 'too big', problems: checked.problems }, 413);
    problems.push(...checked.problems);
  }
  if (problems.length) return reply({ error: 'rejected', problems }, 400);
  const { k, value: valueText } = { k: body.k, value: checked.text };

  // The latest stored version of this goal: an equal value is not stored again.
  const latest = await env.WATCH.prepare(
    'SELECT version, value, updated FROM follows WHERE key = ? AND goal = ? ORDER BY version DESC LIMIT 1'
  )
    .bind(k, goal)
    .first();
  if (latest && latest.value === valueText) return reply({ ok: true, version: latest.version, updatedAt: latest.updated, unchanged: true });

  // Caps on a new goal or a new key: a read each, only when something new would be created.
  if (!latest) {
    const goals = await env.WATCH.prepare('SELECT COUNT(DISTINCT goal) AS n FROM follows WHERE key = ?').bind(k).first();
    if ((goals?.n ?? 0) >= FOLLOW_MAX_GOALS) return retry(3600, `at most ${FOLLOW_MAX_GOALS} goals for one key`);
    if (!goals?.n) {
      const keys = await env.WATCH.prepare('SELECT COUNT(DISTINCT key) AS n FROM follows').first();
      if ((keys?.n ?? 0) >= FOLLOW_MAX_KEYS) return retry(3600, 'the cloud save is full right now');
    }
  }

  // The hour's budget for this key, in one statement: a new hour starts the count over, a write past the
  // budget changes no row (so `changes` says it was refused, and no read was needed).
  const hourAgo = now - HOUR_MS;
  const budget = await env.WATCH.prepare(
    `INSERT INTO follow_rate (key, since, n) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       n = CASE WHEN follow_rate.since <= ? THEN 1 ELSE follow_rate.n + 1 END,
       since = CASE WHEN follow_rate.since <= ? THEN excluded.since ELSE follow_rate.since END
     WHERE follow_rate.since <= ? OR follow_rate.n < ?`
  )
    .bind(k, now, hourAgo, hourAgo, hourAgo, FOLLOW_WRITES_PER_HOUR)
    .run();
  if (!budget.meta || !budget.meta.changes) {
    const r = await env.WATCH.prepare('SELECT since FROM follow_rate WHERE key = ?').bind(k).first();
    const wait = Math.max(1, Math.ceil(((r?.since ?? now) + HOUR_MS - now) / 1000));
    return retry(wait, `at most ${FOLLOW_WRITES_PER_HOUR} changes an hour for one key`);
  }

  // The next version number, taken in the insert itself so two writes cannot share one.
  const ins = await env.WATCH.prepare(
    `INSERT INTO follows (key, goal, version, value, updated)
     SELECT ?, ?, COALESCE(MAX(version), 0) + 1, ?, ? FROM follows WHERE key = ? AND goal = ?`
  )
    .bind(k, goal, valueText, now, k, goal)
    .run();
  if (!ins.meta || !ins.meta.changes) return reply({ error: 'could not store it, try again' }, 503);
  const top = await env.WATCH.prepare('SELECT MAX(version) AS v FROM follows WHERE key = ? AND goal = ?').bind(k, goal).first();
  const version = top?.v ?? 1;
  await env.WATCH.prepare('DELETE FROM follows WHERE key = ? AND goal = ? AND version <= ?')
    .bind(k, goal, version - FOLLOW_VERSIONS)
    .run();
  return reply({ ok: true, version, updatedAt: now });
}
