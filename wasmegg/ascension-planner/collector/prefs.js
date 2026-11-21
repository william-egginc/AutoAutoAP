/**
 * "Prefs in the cloud": each account's consent choices and Setup, saved online so that entering the player ID
 * on any device loads them. Contract for the app: ~/code/aaap-tools/notes/prefs-contract.md.
 *
 *   GET /prefs?k=                    `{ prefs: { consent?: {value,version,updatedAt}, setup?: {...} }, now }`
 *   PUT /prefs                       `{ k, kind: 'consent' | 'setup', value }`, written only when the player changes it
 *   GET /prefs/history?k=&kind=      the last 5 versions of one kind, newest first (a restore is a PUT of an old value)
 *
 * A SEPARATE ENDPOINT, not reserved goals in /follow: GET /follow returns every goal of a key, so `consent` and
 * `setup` there would show up in the goals map of the clients already live, which only know route goals.
 * /follow is untouched, so every live client keeps working.
 *
 * Same design and accepted trade-off as follow.js: the key is SHA-256("aaap-follow-v1:" + the player ID in upper
 * case) computed in the browser; the collector never sees the ID and refuses any body or query that holds one;
 * anyone who knows the ID can read and write the key's prefs, so the damage is bounded: 30 writes an hour per key
 * (apart from /follow's, `follow_rate` under 'prefs|<key>'), 5 versions per kind, 4 KB a value, FOLLOW_LIMIT per address.
 * Last write wins by the CLIENT's `at`: the server stores every write and keeps `updatedAt`; the app compares.
 * D1 (the WATCH binding), not KV: KV's 1,000 writes a day belong to the board.
 */
import { FOLLOW_MAX_BODY, FOLLOW_MAX_KEYS, FOLLOW_MAX_VALUE, FOLLOW_VERSIONS, FOLLOW_WRITES_PER_HOUR, HHMM, HOUR_MS, PLAYER_ID, UNIX_FROM, UNIX_TO, isKey, overLimit, parse, reply, retry, whole } from './follow.js';

const KINDS = ['consent', 'setup'];
const STUDY = ['yes', 'no', 'later'];
const CREDIT = ['name', 'anonymous'];
const TICK_NAME = /^[a-z][A-Za-z0-9]{0,23}$/;
const OFF_TEXT = /^[0-9A-Za-z:T +/_-]{1,32}$/;
const RANGE_TEXT = /^[0-9A-Za-z:-]{1,32}$/;
const ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

export const isPrefsRequest = url => url.pathname === '/prefs' || url.pathname === '/prefs/history';

const atOk = v => whole(v, UNIX_FROM * 1000, UNIX_TO * 1000);
/** A name: control characters dropped, trimmed, at most 40 characters; null when nothing is left. */
const nameOf = v => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40);
  return t || null;
};

/** A consent value checked: `{ value, text }` or `{ problems }`. Required: at. Unknown fields are dropped. */
export function readConsent(v) {
  const problems = [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { problems: ['value must be an object'] };
  const out = {};
  if (!atOk(v.at)) problems.push('at must be milliseconds since 1970 between 2020 and 2100');
  else out.at = v.at;
  if (v.answeredAt !== undefined) {
    if (!atOk(v.answeredAt)) problems.push('answeredAt must be milliseconds since 1970 between 2020 and 2100');
    else out.answeredAt = v.answeredAt;
  }
  if (v.study !== undefined) {
    if (!STUDY.includes(v.study)) problems.push(`study must be one of ${STUDY.join(', ')}`);
    else out.study = v.study;
  }
  if (v.ticks !== undefined) {
    const t = v.ticks;
    const keys = t && typeof t === 'object' && !Array.isArray(t) ? Object.keys(t) : null;
    if (!keys || keys.length > 16 || !keys.every(k => TICK_NAME.test(k) && typeof t[k] === 'boolean'))
      problems.push('ticks must be an object of at most 16 true/false values with names like shareRuns');
    else out.ticks = Object.fromEntries(keys.map(k => [k, t[k]]));
  }
  if (v.credit !== undefined) {
    if (!CREDIT.includes(v.credit)) problems.push(`credit must be one of ${CREDIT.join(', ')}`);
    else out.credit = v.credit;
  }
  if (out.credit === 'name' && v.nickname !== undefined) {
    const n = nameOf(v.nickname);
    if (n) out.nickname = n;
    else problems.push('nickname must be 1 to 40 characters');
  }
  return finish(out, problems);
}

/** A Setup value checked. Required: at. Not the "This computer" settings. */
export function readSetup(v) {
  const problems = [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { problems: ['value must be an object'] };
  const out = {};
  if (!atOk(v.at)) problems.push('at must be milliseconds since 1970 between 2020 and 2100');
  else out.at = v.at;
  if (v.hours === null) out.hours = null;
  else if (v.hours !== undefined) {
    const h = v.hours;
    const days = h?.days;
    if (
      !h ||
      typeof h !== 'object' ||
      Array.isArray(h) ||
      !HHMM.test(h.start ?? '') ||
      !HHMM.test(h.end ?? '') ||
      (days !== undefined && !(Array.isArray(days) && days.length <= 7 && days.every(d => whole(d, 0, 6)))) ||
      (h.scheduleEnabled !== undefined && typeof h.scheduleEnabled !== 'boolean')
    )
      problems.push('hours must be null or { start: "HH:MM", end: "HH:MM", days?: weekday numbers 0 to 6 (at most 7), scheduleEnabled?: true/false }');
    else
      out.hours = {
        start: h.start,
        end: h.end,
        ...(days !== undefined ? { days: days.slice() } : {}),
        ...(h.scheduleEnabled !== undefined ? { scheduleEnabled: h.scheduleEnabled } : {}),
      };
  }
  if (v.timeOff !== undefined) {
    const t = v.timeOff;
    if (!Array.isArray(t) || t.length > 16 || !t.every(x => x && typeof x === 'object' && OFF_TEXT.test(x.from ?? '') && OFF_TEXT.test(x.to ?? '')))
      problems.push('timeOff must be at most 16 of { from, to } with text of 1 to 32 characters');
    else out.timeOff = t.map(x => ({ from: x.from, to: x.to }));
  }
  if (v.noPrestigeDays !== undefined) {
    const d = v.noPrestigeDays;
    if (!Array.isArray(d) || d.length > 16 || !d.every(x => x && typeof x === 'object' && RANGE_TEXT.test(x.from ?? '') && RANGE_TEXT.test(x.to ?? '')))
      problems.push('noPrestigeDays must be at most 16 of { from, to } with text of 1 to 32 characters (YYYY-MM-DD)');
    else out.noPrestigeDays = d.map(x => ({ from: x.from, to: x.to }));
  }
  if (v.targetTE === null) out.targetTE = null;
  else if (v.targetTE !== undefined) {
    if (!whole(v.targetTE, 1, 490)) problems.push('targetTE must be null or a whole number 1 to 490');
    else out.targetTE = v.targetTE;
  }
  if (v.timezone !== undefined) {
    if (typeof v.timezone !== 'string' || !ZONE.test(v.timezone)) problems.push('timezone must be an IANA name of at most 64 characters');
    else out.timezone = v.timezone;
  }
  return finish(out, problems);
}

function finish(out, problems) {
  if (problems.length) return { problems };
  const text = JSON.stringify(out);
  if (text.length > FOLLOW_MAX_VALUE) return { problems: [`value is over ${FOLLOW_MAX_VALUE} bytes`], big: true };
  return { value: out, text };
}

const read = { consent: readConsent, setup: readSetup };

/** `GET /prefs`, `PUT /prefs`, `GET /prefs/history`. */
export async function handlePrefs(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'prefs are not set up on this collector' }, 503);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    if (PLAYER_ID.test(url.search)) return reply({ error: 'rejected', problems: ['send the key, never the player id'] }, 400);
    const k = url.searchParams.get('k');
    if (!isKey(k)) return reply({ error: 'rejected', problems: ['k must be 64 lowercase hex characters'] }, 400);
    const slow = await overLimit(env, request, 'prefs-get');
    if (slow) return slow;
    if (url.pathname === '/prefs/history') {
      const kind = url.searchParams.get('kind');
      if (!KINDS.includes(kind)) return reply({ error: 'rejected', problems: ['kind must be consent or setup'] }, 400);
      const { results } = await env.WATCH.prepare('SELECT version, value, updated FROM prefs WHERE key = ? AND kind = ? ORDER BY version DESC LIMIT ?')
        .bind(k, kind, FOLLOW_VERSIONS)
        .all();
      const versions = (results || []).flatMap(r => {
        const value = parse(r.value);
        return value ? [{ version: r.version, updatedAt: r.updated, value }] : [];
      });
      return reply({ versions, now });
    }
    const { results } = await env.WATCH.prepare(
      `SELECT p.kind, p.version, p.value, p.updated FROM prefs p
       WHERE p.key = ? AND p.version = (SELECT MAX(version) FROM prefs WHERE key = p.key AND kind = p.kind)
       ORDER BY p.kind LIMIT 2`
    )
      .bind(k)
      .all();
    const prefs = {};
    for (const r of results || []) {
      const value = parse(r.value);
      if (value) prefs[r.kind] = { value, version: r.version, updatedAt: r.updated };
    }
    return reply({ prefs, now });
  }

  if (request.method !== 'PUT' || url.pathname !== '/prefs') return reply({ error: 'method not allowed' }, 405);

  const slow = await overLimit(env, request, 'prefs-put');
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
  const kind = KINDS.includes(body.kind) ? body.kind : null;
  if (!kind) problems.push('kind must be consent or setup');
  let checked = { problems: [] };
  if (kind) {
    checked = read[kind](body.value);
    if (checked.problems) {
      if (checked.big) return reply({ error: 'too big', problems: checked.problems }, 413);
      problems.push(...checked.problems);
    }
  }
  if (problems.length) return reply({ error: 'rejected', problems }, 400);
  const k = body.k;
  const valueText = checked.text;

  const latest = await env.WATCH.prepare('SELECT version, value, updated FROM prefs WHERE key = ? AND kind = ? ORDER BY version DESC LIMIT 1')
    .bind(k, kind)
    .first();
  if (latest && latest.value === valueText) return reply({ ok: true, version: latest.version, updatedAt: latest.updated, unchanged: true });
  if (!latest) {
    const other = await env.WATCH.prepare('SELECT COUNT(*) AS n FROM prefs WHERE key = ?').bind(k).first();
    if (!other?.n) {
      const keys = await env.WATCH.prepare('SELECT COUNT(DISTINCT key) AS n FROM prefs').first();
      if ((keys?.n ?? 0) >= FOLLOW_MAX_KEYS) return retry(3600, 'the cloud save is full right now');
    }
  }

  // The hour's budget, in one statement (as follow.js does): a refused write changes no row, so it costs no read.
  const budgetKey = `prefs|${k}`;
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

  const ins = await env.WATCH.prepare(
    `INSERT INTO prefs (key, kind, version, value, updated)
     SELECT ?, ?, COALESCE(MAX(version), 0) + 1, ?, ? FROM prefs WHERE key = ? AND kind = ?`
  )
    .bind(k, kind, valueText, now, k, kind)
    .run();
  if (!ins.meta || !ins.meta.changes) return reply({ error: 'could not store it, try again' }, 503);
  const top = await env.WATCH.prepare('SELECT MAX(version) AS v FROM prefs WHERE key = ? AND kind = ?').bind(k, kind).first();
  const version = top?.v ?? 1;
  await env.WATCH.prepare('DELETE FROM prefs WHERE key = ? AND kind = ? AND version <= ?').bind(k, kind, version - FOLLOW_VERSIONS).run();
  return reply({ ok: true, version, updatedAt: now });
}
