/**
 * Calendar feeds (design: ~/code/aaap-tools/notes/calendar-subscription-design-2026-11-14.md, option B).
 *
 * A player makes a secret link, subscribes to it in Google or Apple Calendar, and sees the planned shifts, buys and prestiges. The
 * CLIENT builds the events (src/lib/calendarEvents.ts) and saves the list as the `cal` kind of /sync (sync.js, slot '0', 24 KB); this
 * file validates that list (`readCal`) and prints it as an .ics (`renderIcs`). The collector knows nothing about the plan's format.
 *
 *   POST /cal/new      { k }                a new link: 200 { url }. The token is shown ONCE (only its SHA-256 is stored). At most 3 live
 *                                           links an account (409), 5 new a day an account, 20 a day an address (keyed hash), 500 in all.
 *   GET  /cal/<token>.ics                   the calendar (text/calendar). No login: the token is the secret. Unknown, revoked or expired
 *                                           (not fetched for 90 days): 404 with an empty body. ETag + 304; 300 fetches a day a link.
 *   POST /cal/revoke   { token } | { k, all: true }   revoke one link, or every link of the account. Always 200 for an unknown token.
 *
 * ACCESS: anyone who knows a player ID can make a link for it and read the same plan they could already read through /sync (the accepted
 * design); the link adds no new reach, it only avoids putting the account code `k` in a URL a calendar app stores. A link carries no ID.
 * The `key` column holds the account key (salted once ACCOUNT_KEY_SALT is set; acct.js moves these rows with the others).
 * The event text is plain, printable, with no player ID (refused in a title or notes, in any case). The server prints the client's title
 * and notes VERBATIM and adds no words of its own to an event (the client writes "Planned as of 9:00 AM MST" in the player's zone and a
 * "Plan last updated" marker event); the calendar's description is the one fixed line (CALDESC).
 */
import { AccountKeyError, accountKey, accountKeyDown } from './acct.js';
import { DAY_MS, spend, waitSeconds } from './budget.js';
import { PLAYER_ID, UNIX_FROM, UNIX_TO, isKey, overLimit, reply, retry, whole } from './follow.js';

export const CAL_LINKS_PER_ACCOUNT = 3;
export const CAL_NEW_PER_ACCOUNT_DAY = 5;
export const CAL_NEW_PER_ADDRESS_DAY = 20;
export const CAL_MAX_FEEDS = 500;
export const CAL_FETCHES_PER_DAY = 300;
export const CAL_EXPIRE_DAYS = 90;
export const CAL_MAX_BODY = 512;
export const CAL_MAX_EVENTS = 100;
const HOUR_MS = 3_600_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const FEED_RE = /^\/cal\/([A-Za-z0-9_-]{22})\.ics$/;
const KINDS = ['shift', 'buy', 'prestige', 'route', 'note'];
const UID_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const SRC_RE = /^[A-Za-z0-9._:-]{1,40}$/;
const EVENT_FIELDS = ['uid', 'seq', 'start', 'end', 'kind', 'title', 'notes', 'lead', 'critical', 'quiet'];
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_NO_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const MS_FROM = UNIX_FROM * 1000;
const MS_TO = UNIX_TO * 1000;
const SEVEN_DAYS = 7 * DAY_MS;

export const isCalRequest = url => url.pathname === '/cal/new' || url.pathname === '/cal/revoke' || FEED_RE.test(url.pathname);

const bad = problems => reply({ error: 'rejected', problems }, 400);
const capOf = (v, d) => (Number(v) > 0 ? Number(v) : d);

/** The events list as stored: `{ v: 1, asOf, window, src, events }`. Unknown fields are refused. */
export function readCal(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { problems: ['the calendar record must be an object'] };
  const extra = Object.keys(v).filter(k => !['v', 'asOf', 'window', 'src', 'events'].includes(k));
  if (extra.length) return { problems: [`unknown field: ${extra[0]}`] };
  if (v.v !== 1) return { problems: ['v must be 1'] };
  if (!whole(v.asOf, MS_FROM, MS_TO)) return { problems: ['asOf must be milliseconds since 1970 between 2020 and 2100'] };
  if (typeof v.src !== 'string' || !SRC_RE.test(v.src)) return { problems: ['src must be 1 to 40 characters of letters, digits and ._:-'] };
  const w = v.window;
  if (!w || typeof w !== 'object' || !whole(w.from, MS_FROM, MS_TO) || !whole(w.to, MS_FROM, MS_TO) || w.to < w.from) return { problems: ['window must be { from, to } in milliseconds, to not before from'] };
  if (!Array.isArray(v.events) || v.events.length > CAL_MAX_EVENTS) return { problems: [`events must be a list of at most ${CAL_MAX_EVENTS}`] };
  const seen = new Set();
  const events = [];
  for (const [i, e] of v.events.entries()) {
    const at = `event ${i}`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) return { problems: [`${at} must be an object`] };
    const unknown = Object.keys(e).filter(k => !EVENT_FIELDS.includes(k));
    if (unknown.length) return { problems: [`${at}: unknown field ${unknown[0]}`] };
    if (typeof e.uid !== 'string' || !UID_RE.test(e.uid)) return { problems: [`${at}: uid must be 1 to 80 characters of letters, digits and ._:-`] };
    if (seen.has(e.uid)) return { problems: [`${at}: duplicate uid`] };
    seen.add(e.uid);
    if (!whole(e.seq, 0, 1_000_000)) return { problems: [`${at}: seq must be a whole number 0 to 1000000`] };
    if (!whole(e.start, MS_FROM, MS_TO)) return { problems: [`${at}: start must be milliseconds since 1970 between 2020 and 2100`] };
    if (e.end !== undefined && !(whole(e.end, e.start + 1, e.start + SEVEN_DAYS))) return { problems: [`${at}: end must be after start and at most 7 days later`] };
    if (!KINDS.includes(e.kind)) return { problems: [`${at}: kind must be one of ${KINDS.join(', ')}`] };
    if (typeof e.title !== 'string' || e.title.length < 1 || e.title.length > 80 || CONTROL.test(e.title)) return { problems: [`${at}: title must be 1 to 80 characters, no control characters`] };
    if (PLAYER_ID.test(e.title)) return { problems: [`${at}: no player id in a title`] };
    if (e.notes !== undefined && (typeof e.notes !== 'string' || e.notes.length > 300 || CONTROL_NO_NEWLINE.test(e.notes))) return { problems: [`${at}: notes must be at most 300 characters, no control characters`] };
    if (e.notes !== undefined && PLAYER_ID.test(e.notes)) return { problems: [`${at}: no player id in notes`] };
    if (e.lead !== undefined && !whole(e.lead, 0, 10080)) return { problems: [`${at}: lead must be whole minutes 0 to 10080`] };
    for (const flag of ['critical', 'quiet']) if (e[flag] !== undefined && typeof e[flag] !== 'boolean') return { problems: [`${at}: ${flag} must be true or false`] };
    events.push(Object.fromEntries(EVENT_FIELDS.filter(f => e[f] !== undefined).map(f => [f, e[f]])));
  }
  return { value: { v: 1, asOf: v.asOf, window: { from: w.from, to: w.to }, src: v.src, events } };
}

// ------------------------------------------------------------------ the .ics
const utc = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const encoder = new TextEncoder();
/** One content line, folded so no physical line is over 75 bytes (continuations start with a space). */
export function fold(line) {
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (curBytes + n > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}
const DEFAULT_MINUTES = 10;
const NAME = 'Ascension Planner';

/** The only words of its own the server prints: the calendar's description. Everything else is the client's title and notes. */
const CALDESC = 'Your plan from the Ascension Planner. Your calendar may show times up to a day old. For a step that matters to the minute, open the planner.';

export function renderIcs(cal) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ascension Planner//Calendar feed//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(NAME)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  lines.push(`X-WR-CALDESC:${esc(CALDESC)}`);
  for (const e of cal?.events ?? []) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@aaap`, `DTSTAMP:${utc(cal.asOf)}`, `LAST-MODIFIED:${utc(cal.asOf)}`, `SEQUENCE:${e.seq}`, `DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end ?? e.start + DEFAULT_MINUTES * 60_000)}`, `SUMMARY:${esc(e.title)}`, ...(e.notes ? [`DESCRIPTION:${esc(e.notes)}`] : []), `CATEGORIES:${e.kind.toUpperCase()}`);
    if (e.lead !== undefined) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.lead}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------ helpers
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function keyedHash(env, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.CSV_UPLOAD_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))).slice(0, 12));
}
const empty = (status, extra = {}) => new Response(null, { status, headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store', ...extra } });

async function readBody(request) {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > CAL_MAX_BODY) return { res: reply({ error: 'too big' }, 413) };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > CAL_MAX_BODY) return { res: reply({ error: 'too big' }, 413) };
  if (PLAYER_ID.test(text)) return { res: bad(['send the key, never the player id']) };
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { res: bad(['the body must be a JSON object']) };
    return { body: v };
  } catch {
    return { res: reply({ error: 'body must be JSON' }, 400) };
  }
}

async function keyOf(env, rawK) {
  try {
    return { key: await accountKey(env, rawK) };
  } catch (e) {
    if (e instanceof AccountKeyError) return { res: accountKeyDown(reply) };
    throw e;
  }
}

// ------------------------------------------------------------------ routes
export async function handleCal(request, env, now = Date.now()) {
  if (!env.WATCH) return reply({ error: 'calendar feeds are not set up on this collector' }, 503);
  const url = new URL(request.url);
  const feed = FEED_RE.exec(url.pathname);
  if (feed) return handleFeed(request, env, now, feed[1]);
  if (request.method === 'GET' || request.method === 'HEAD') return empty(404);
  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
  if (url.search) return bad(['send the key in the body, never in the address']);
  if (url.pathname === '/cal/new') return handleNew(request, env, now, url);
  if (url.pathname === '/cal/revoke') return handleRevoke(request, env);
  return reply({ error: 'not found' }, 404);
}

async function handleNew(request, env, now, url) {
  const slow = await overLimit(env, request, 'cal-new');
  if (slow) return slow;
  const { res, body } = await readBody(request);
  if (res) return res;
  if (!isKey(body.k)) return bad(['k must be 64 lowercase hex characters']);
  if (Object.keys(body).some(f => f !== 'k')) return bad(['only k is accepted']);
  const { res: down, key } = await keyOf(env, body.k);
  if (down) return down;

  const live = await env.WATCH.prepare('SELECT COUNT(*) AS n FROM cal_feeds WHERE key = ?').bind(key).first();
  if ((live?.n ?? 0) >= CAL_LINKS_PER_ACCOUNT) return reply({ error: `at most ${CAL_LINKS_PER_ACCOUNT} calendar links: reset one first` }, 409);
  const all = await env.WATCH.prepare('SELECT COUNT(*) AS n FROM cal_feeds').first();
  if ((all?.n ?? 0) >= capOf(env.CAL_MAX_FEEDS, CAL_MAX_FEEDS)) return retry(3600, 'calendar links are full right now');
  const mine = await spend(env, `calnew|${key}`, 1, CAL_NEW_PER_ACCOUNT_DAY, now, DAY_MS);
  if (!mine.ok) return retry(waitSeconds(mine.since, DAY_MS, now), `at most ${CAL_NEW_PER_ACCOUNT_DAY} new calendar links a day`);
  if (env.CSV_UPLOAD_KEY) {
    const ip = await keyedHash(env, `calnew-ip|${request.headers.get('cf-connecting-ip') || 'unknown'}`);
    const addr = await spend(env, `calnew-ip|${ip}`, 1, CAL_NEW_PER_ADDRESS_DAY, now, DAY_MS);
    if (!addr.ok) return retry(waitSeconds(addr.since, DAY_MS, now), 'too many new calendar links from this address today');
  }

  const token = newToken();
  await env.WATCH.prepare('INSERT INTO cal_feeds (token_hash, key, created, last_fetch, fetches) VALUES (?, ?, ?, 0, 0)').bind(await sha256Hex(token), key, now).run();
  return reply({ ok: true, url: `${url.origin}/cal/${token}.ics` });
}

async function handleRevoke(request, env) {
  const slow = await overLimit(env, request, 'cal-revoke');
  if (slow) return slow;
  const { res, body } = await readBody(request);
  if (res) return res;
  if (typeof body.token === 'string') {
    if (Object.keys(body).some(f => f !== 'token')) return bad(['send only the token']);
    if (!TOKEN_RE.test(body.token)) return reply({ ok: true, revoked: 0 });
    const r = await env.WATCH.prepare('DELETE FROM cal_feeds WHERE token_hash = ?').bind(await sha256Hex(body.token)).run();
    return reply({ ok: true, revoked: r.meta?.changes ?? 0 });
  }
  if (isKey(body.k) && body.all === true && Object.keys(body).every(f => f === 'k' || f === 'all')) {
    const { res: down, key } = await keyOf(env, body.k);
    if (down) return down;
    const r = await env.WATCH.prepare('DELETE FROM cal_feeds WHERE key = ?').bind(key).run();
    return reply({ ok: true, revoked: r.meta?.changes ?? 0 });
  }
  return bad(['send { token } or { k, all: true }']);
}

async function handleFeed(request, env, now, token) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return reply({ error: 'method not allowed' }, 405);
  const slow = await overLimit(env, request, 'cal-get');
  if (slow) return slow;
  const hash = await sha256Hex(token);
  const row = await env.WATCH.prepare('SELECT key, created, last_fetch FROM cal_feeds WHERE token_hash = ?').bind(hash).first();
  if (!row) return empty(404);
  if ((row.last_fetch || row.created) < now - CAL_EXPIRE_DAYS * DAY_MS) return empty(404);

  const day = await spend(env, `calget|${hash.slice(0, 24)}`, 1, capOf(env.CAL_FETCHES_PER_DAY, CAL_FETCHES_PER_DAY), now, DAY_MS);
  if (!day.ok) {
    const wait = waitSeconds(day.since, DAY_MS, now);
    return empty(429, { 'retry-after': String(wait) });
  }
  // last_fetch moves at most once an hour (a D1 row written), the rest of the hour's fetches cost no write.
  await env.WATCH.prepare('UPDATE cal_feeds SET last_fetch = ?, fetches = fetches + 1 WHERE token_hash = ? AND last_fetch < ?').bind(now, hash, now - HOUR_MS).run();

  const rec = await env.WATCH.prepare("SELECT data FROM synced WHERE key = ? AND kind = 'cal' AND slot = '0'").bind(row.key).first();
  const etag = `"${(await sha256Hex(`cal1|${rec?.data ?? ''}`)).slice(0, 16)}"`;
  const headers = { 'cache-control': 'private, max-age=900', etag, 'access-control-allow-origin': '*' };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  let cal = null;
  if (rec) {
    try {
      cal = JSON.parse(rec.data);
    } catch {
      cal = null;
    }
  }
  return new Response(request.method === 'HEAD' ? null : renderIcs(cal), { status: 200, headers: { ...headers, 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="ascension-planner.ics"' } });
}

/** The cron: links not fetched for 90 days (or never fetched in 90 days from making) are deleted. Returns how many. */
export async function pruneCal(env, now) {
  if (!env.WATCH) return 0;
  const cutoff = now - CAL_EXPIRE_DAYS * DAY_MS;
  const r = await env.WATCH.prepare('DELETE FROM cal_feeds WHERE (CASE WHEN last_fetch > 0 THEN last_fetch ELSE created END) < ?').bind(cutoff).run();
  return r.meta?.changes ?? 0;
}
