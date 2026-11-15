/**
 * Calendar feeds (cal.js, design notes/calendar-subscription-design-2026-11-14.md): the `cal` sync kind (the events list the
 * client builds), a secret link per device, and the .ics a calendar app fetches. D1 is Node's in-memory SQLite, real migrations.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { handleCal, pruneCal, CAL_LINKS_PER_ACCOUNT, CAL_EXPIRE_DAYS } from './cal.js';
import { handleForget, handleSync, SYNC_MAX_CAL_BYTES } from './sync.js';
import { rekeyLegacy, saltedKeyOf } from './acct.js';
import { makeD1 } from './d1shim.js';
import worker from './worker.js';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const T0 = Date.UTC(2026, 10, 15, 23, 10, 0); // 4:10 pm MST on 15 Nov 2026
const DAY = 86_400_000;
const EVENT = (n, o = {}) => ({ uid: `s1793000000:line${n}`, seq: 0, start: T0 + n * 3_600_000, kind: 'buy', title: `Buy: research ${n}`, ...o });
const LIST = (events = [EVENT(1), EVENT(2, { kind: 'shift', title: 'Shift: swap to the farm', notes: 'Swap, then buy.', lead: 10, end: T0 + 2 * 3_600_000 + 900_000 })], o = {}) => ({
  v: 1,
  asOf: T0,
  window: { from: T0 - DAY, to: T0 + 14 * DAY },
  src: 'abc123',
  events,
  ...o,
});
let env;
beforeEach(() => {
  env = { WATCH: makeD1(), CSV_UPLOAD_KEY: 'test-upload-key' };
});
const putCal = (value, { k = K, at = T0, now = T0 } = {}) => {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  return handleSync(new Request(`https://c.example/sync?k=${k}&kind=cal&slot=0&at=${at}`, { method: 'PUT', headers: { 'content-length': String(bytes.length) }, body: bytes }), env, now);
};
const post = (path, body, now = T0, extra = {}) => handleCal(new Request(`https://c.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, now);
const mint = async (k = K, now = T0) => {
  const res = await post('/cal/new', { k }, now);
  return { res, body: res.status === 200 ? await res.clone().json() : null };
};
const tokenOf = url => url.match(/\/cal\/([A-Za-z0-9_-]{22})\.ics$/)[1];
const feed = (token, { now = T0, headers = {} } = {}) => handleCal(new Request(`https://c.example/cal/${token}.ics`, { headers }), env, now);
const rows = () => env.WATCH._db.prepare('SELECT * FROM cal_feeds').all();
const unfold = text => text.replace(/\r\n[ \t]/g, '');

describe('the cal sync kind', () => {
  it('stores the events list per account and serves it back', async () => {
    const res = await putCal(LIST());
    expect(res.status).toBe(200);
    const got = await handleSync(new Request(`https://c.example/sync/get?k=${K}&kind=cal&slot=0`), env, T0);
    expect(got.status).toBe(200);
    expect((await got.json()).events.length).toBe(2);
  });
  it('is slot 0 only', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(LIST()));
    const res = await handleSync(new Request(`https://c.example/sync?k=${K}&kind=cal&slot=1793000000&at=${T0}`, { method: 'PUT', headers: { 'content-length': String(bytes.length) }, body: bytes }), env, T0);
    expect(res.status).toBe(400);
  });
  it('last write wins by at: an older one is 409', async () => {
    await putCal(LIST(), { at: T0 });
    expect((await putCal(LIST([EVENT(5)], { src: 'new' }), { at: T0 - 1000 })).status).toBe(409);
    expect((await putCal(LIST([EVENT(5)], { src: 'new' }), { at: T0 + 1000, now: T0 + 1000 })).status).toBe(200);
  });
  it.each([
    ['a wrong version', LIST(undefined, { v: 2 })],
    ['no src', LIST(undefined, { src: undefined })],
    ['a src with spaces', LIST(undefined, { src: 'a b' })],
    ['more than 100 events', LIST(Array.from({ length: 101 }, (_, n) => EVENT(n)))],
    ['an unknown top-level field', LIST(undefined, { extra: 1 })],
    ['an unknown event field', LIST([{ ...EVENT(1), colour: 'red' }])],
    ['an unknown kind', LIST([EVENT(1, { kind: 'party' })])],
    ['a duplicate uid', LIST([EVENT(1), EVENT(1)])],
    ['a uid with a space', LIST([EVENT(1, { uid: 'a b' })])],
    ['an end before the start', LIST([EVENT(1, { end: T0 })])],
    ['an end over 7 days after the start', LIST([EVENT(1, { end: T0 + 3_600_000 + 8 * DAY })])],
    ['a start in 2019', LIST([EVENT(1, { start: Date.UTC(2019, 0, 1) })])],
    ['a fractional seq', LIST([EVENT(1, { seq: 1.5 })])],
    ['an empty title', LIST([EVENT(1, { title: '' })])],
    ['a title over 80 characters', LIST([EVENT(1, { title: 'x'.repeat(81) })])],
    ['a control character in a title', LIST([EVENT(1, { title: 'a\u0007b' })])],
    ['notes over 300 characters', LIST([EVENT(1, { notes: 'x'.repeat(301) })])],
    ['a lead over a week', LIST([EVENT(1, { lead: 10081 })])],
    ['critical that is not a boolean', LIST([EVENT(1, { critical: 'yes' })])],
    ['text', 'soon'],
  ])('refuses %s (400, nothing stored)', async (_n, v) => {
    expect((await putCal(v)).status).toBe(400);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM synced').get().n).toBe(0);
  });
  it('refuses a player ID in a title or in notes, in any case', async () => {
    expect((await putCal(LIST([EVENT(1, { title: 'Buy for ei1234567890123456' })]))).status).toBe(400);
    expect((await putCal(LIST([EVENT(1, { notes: 'EI1234567890123456' })]))).status).toBe(400);
  });
  it('accepts quiet and critical flags, newlines in notes, and 100 events', async () => {
    const r = await putCal(LIST(Array.from({ length: 100 }, (_, n) => EVENT(n, { quiet: n % 2 === 0, critical: n === 3, notes: 'a\nb' }))));
    expect(r.status).toBe(200);
  });
  it('is capped at 24 KB (413)', async () => {
    expect(SYNC_MAX_CAL_BYTES).toBe(24 * 1024);
    const r = await putCal('{"v":1,"pad":"' + 'x'.repeat(SYNC_MAX_CAL_BYTES) + '"}');
    expect(r.status).toBe(413);
  });
});

describe('Unicode line breaks (QA red team, 14 Nov: a lenient reader could see a fake END:VEVENT / BEGIN:VEVENT)', () => {
  const BREAKS = ['\u000b', '\u000c', '\u001c', '\u001d', '\u001e', '\u0085', '\u2028', '\u2029', '\u0080', '\u009f'];
  const name = c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  it.each(BREAKS)('readCal refuses %j in a title and in notes (400, nothing stored)', async c => {
    expect((await putCal(LIST([EVENT(1, { title: `Buy: a${c}END:VEVENT` })]))).status, name(c)).toBe(400);
    expect((await putCal(LIST([EVENT(1, { notes: `a${c}END:VEVENT\nBEGIN:VEVENT` })]))).status, name(c)).toBe(400);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM synced').get().n).toBe(0);
  });
  it('other control characters in an old row become a space, never a raw byte in the feed', async () => {
    const token = tokenOf((await mint()).body.url);
    const data = JSON.stringify(LIST([EVENT(1, { title: 'Buy: a\u0080b\u009fc\u0007d' })]));
    env.WATCH._db.prepare("INSERT INTO synced (key, kind, slot, at, updated, bytes, enc, data) VALUES (?, 'cal', '0', ?, ?, ?, 'json', ?)").run(K, T0, T0, data.length, data);
    expect(unfold(await (await feed(token)).text())).toContain('SUMMARY:Buy: a b c d');
  });
  it('a plain newline in notes is still fine', async () => {
    expect((await putCal(LIST([EVENT(1, { notes: 'a\nb' })]))).status).toBe(200);
  });
  it.each(BREAKS.filter(c => c !== '\u0080' && c !== '\u009f').concat(['\r', '\n']))('esc prints %j as a literal \\n even if an old row holds it (no injected lines)', async c => {
    const token = tokenOf((await mint()).body.url);
    const data = JSON.stringify(LIST([EVENT(1, { title: `Buy: a${c}END:VEVENT`, notes: `x${c}END:VEVENT${c}BEGIN:VEVENT${c}SUMMARY:fake` })]));
    env.WATCH._db.prepare("INSERT INTO synced (key, kind, slot, at, updated, bytes, enc, data) VALUES (?, 'cal', '0', ?, ?, ?, 'json', ?)").run(K, T0, T0, data.length, data);
    const raw = await (await feed(token)).text();
    // eslint-disable-next-line no-control-regex
    expect(raw).not.toMatch(new RegExp('[\\u000b\\u000c\\u001c-\\u001e\\u0085\\u2028\\u2029\\u0080-\\u009f]'));
    const physical = raw.split('\r\n').filter(l => l.length);
    expect(physical.filter(l => l === 'BEGIN:VEVENT').length).toBe(1);
    expect(physical.filter(l => l === 'END:VEVENT').length).toBe(1);
    expect(physical.filter(l => /^SUMMARY:/.test(l)).length).toBe(1);
    expect(unfold(raw)).toContain('\\nEND:VEVENT\\nBEGIN:VEVENT\\nSUMMARY:fake');
  });
});

describe('making a link (POST /cal/new)', () => {
  it('returns a url with a random 22-character token, and stores only its hash', async () => {
    const { res, body } = await mint();
    expect(res.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/c\.example\/cal\/[A-Za-z0-9_-]{22}\.ics$/);
    const token = tokenOf(body.url);
    const all = JSON.stringify(rows());
    expect(all).not.toContain(token);
    expect(rows().length).toBe(1);
    expect(rows()[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('makes a different token each time', async () => {
    const a = tokenOf((await mint()).body.url);
    const b = tokenOf((await mint()).body.url);
    expect(a).not.toBe(b);
  });
  it('allows 3 live links an account, then 409 (reset one first); another account is unaffected', async () => {
    for (let i = 0; i < CAL_LINKS_PER_ACCOUNT; i++) expect((await mint()).res.status).toBe(200);
    expect((await mint()).res.status).toBe(409);
    expect((await mint(K2)).res.status).toBe(200);
  });
  it('5 new links a day an account (429 with retryAfter), the day after is fine', async () => {
    for (let i = 0; i < 5; i++) {
      const { body } = await mint();
      await post('/cal/revoke', { token: tokenOf(body.url) });
    }
    const sixth = await mint();
    expect(sixth.res.status).toBe(429);
    expect((await sixth.res.json()).retryAfter).toBeGreaterThan(0);
    expect((await mint(K, T0 + DAY + 1000)).res.status).toBe(200);
  });
  it('20 a day for one address (keyed hash, no plain address kept)', async () => {
    for (let i = 0; i < 20; i++) {
      const k = i.toString(16).padStart(64, '0');
      expect((await post('/cal/new', { k }, T0, { 'cf-connecting-ip': '203.0.113.9' })).status).toBe(200);
    }
    expect((await post('/cal/new', { k: K }, T0, { 'cf-connecting-ip': '203.0.113.9' })).status).toBe(429);
    expect(JSON.stringify(env.WATCH._db.prepare('SELECT key FROM follow_rate').all())).not.toContain('203.0.113.9');
  });
  it('refuses a bad key, a player ID, a body over 512 bytes and a key in the query', async () => {
    expect((await post('/cal/new', { k: 'nope' })).status).toBe(400);
    expect((await post('/cal/new', { k: K, note: 'EI1234567890123456' })).status).toBe(400);
    expect((await post('/cal/new', 'x'.repeat(600))).status).toBe(413);
    expect((await post(`/cal/new?k=${K}`, { k: K })).status).toBe(400);
    expect(rows().length).toBe(0);
  });
  it('stops at 500 links in all (503-style full: 429 with retryAfter)', async () => {
    env.CAL_MAX_FEEDS = '2';
    await mint(K);
    await mint(K2);
    expect((await mint('c'.repeat(64))).res.status).toBe(429);
  });
  it('is 503 without D1', async () => {
    expect((await handleCal(new Request('https://c.example/cal/new', { method: 'POST', body: JSON.stringify({ k: K }) }), {}, T0)).status).toBe(503);
  });
});

describe('the feed (GET /cal/<token>.ics)', () => {
  const setup = async () => {
    await putCal(LIST());
    return tokenOf((await mint()).body.url);
  };
  it('is a calendar a calendar app reads: type, CRLF lines, events with stable UIDs, SEQUENCE, UTC times', async () => {
    const res = await feed(await setup());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('cache-control')).toMatch(/max-age=900/);
    const text = await res.text();
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.split('\r\n').every(l => !l.includes('\n'))).toBe(true);
    expect(text).toContain('UID:s1793000000:line1@aaap');
    expect(text).toContain('SEQUENCE:0');
    expect(text).toContain('DTSTART:20261116T001000Z'); // T0 + 1 hour
    expect(text).toContain('SUMMARY:Buy: research 1');
    expect(text.match(/BEGIN:VEVENT/g).length).toBe(2);
  });
  it('an alarm for an event with a lead, an end when given', async () => {
    const text = unfold(await (await feed(await setup())).text());
    expect(text).toContain('BEGIN:VALARM');
    expect(text).toContain('TRIGGER:-PT10M');
    expect(text).toContain('DTEND:20261116T012500Z');
  });
  it('prints the client\'s title and notes verbatim and adds no words of its own to an event; the calendar says it may be a day old', async () => {
    await putCal(LIST([EVENT(1, { title: 'Shift to Humility', notes: 'Planned as of 9:00 AM MST. Open the planner to confirm.' }), EVENT(2)]));
    const token = tokenOf((await mint()).body.url);
    const text = unfold(await (await feed(token)).text());
    expect(text).toContain('SUMMARY:Shift to Humility');
    expect(text).toContain('DESCRIPTION:Planned as of 9:00 AM MST. Open the planner to confirm.');
    expect(text).not.toMatch(/Planned as of 4:10/);
    const second = text.split('BEGIN:VEVENT')[2];
    expect(second).not.toContain('DESCRIPTION:');
    expect(text).toContain('X-WR-CALDESC:The plan from the Ascension Planner. Your calendar may show times up to a day old.');
  });
  it('escapes text and folds long lines at 75 bytes', async () => {
    await putCal(LIST([EVENT(1, { title: 'Buy; a, b \\ c', notes: 'line one\nline two ' + 'word '.repeat(40) + 'é'.repeat(30) })]));
    const token = tokenOf((await mint()).body.url);
    const raw = await (await feed(token)).text();
    expect(raw.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const text = unfold(raw);
    expect(text).toContain('SUMMARY:Buy\\; a\\, b \\\\ c');
    expect(text).toContain('line one\\nline two');
    expect(text).toContain('é'.repeat(30));
  });
  it('never carries the account key, the token or a player ID', async () => {
    const token = await setup();
    const text = await (await feed(token)).text();
    expect(text).not.toContain(K);
    expect(text).not.toContain(token);
    expect(text).not.toMatch(/EI\d{16}/i);
  });
  it('an account with no events yet is a valid empty calendar', async () => {
    const token = tokenOf((await mint()).body.url);
    const res = await feed(token);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).not.toContain('BEGIN:VEVENT');
  });
  it('an unknown, malformed or wrong-method token is 404 with an empty body (no hint)', async () => {
    for (const t of ['A'.repeat(22), 'short', 'A'.repeat(23)]) {
      const res = await feed(t);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('');
    }
    const put = await handleCal(new Request(`https://c.example/cal/${'A'.repeat(22)}.ics`, { method: 'PUT' }), env, T0);
    expect([404, 405]).toContain(put.status);
  });
  it('ETag: a repeat with If-None-Match is 304, a changed list is a new ETag', async () => {
    const token = await setup();
    const first = await feed(token);
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect((await feed(token, { headers: { 'if-none-match': etag } })).status).toBe(304);
    await putCal(LIST([EVENT(1, { seq: 1, title: 'Buy: research 1 (moved)' })]), { at: T0 + 1000, now: T0 + 1000 });
    const third = await feed(token, { now: T0 + 2000, headers: { 'if-none-match': etag } });
    expect(third.status).toBe(200);
    expect(third.headers.get('etag')).not.toBe(etag);
    expect(unfold(await third.text())).toContain('SEQUENCE:1');
  });
  it('writes last_fetch at most once an hour', async () => {
    const token = await setup();
    await feed(token, { now: T0 });
    expect(rows()[0].last_fetch).toBe(T0);
    await feed(token, { now: T0 + 600_000 });
    expect(rows()[0].last_fetch).toBe(T0);
    await feed(token, { now: T0 + 3_700_000 });
    expect(rows()[0].last_fetch).toBe(T0 + 3_700_000);
    expect(rows()[0].fetches).toBe(2);
  });
  it('is capped at 300 fetches a day a link (429), the same for a 304', async () => {
    const token = await setup();
    env.CAL_FETCHES_PER_DAY = '3';
    for (let i = 0; i < 3; i++) expect((await feed(token, { now: T0 + i })).status).toBe(200);
    const res = await feed(token, { now: T0 + 5 });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
  it('a link nobody fetched for 90 days is gone (404), a fetch keeps it alive', async () => {
    expect(CAL_EXPIRE_DAYS).toBe(90);
    const token = await setup();
    expect((await feed(token, { now: T0 + 89 * DAY })).status).toBe(200);
    expect((await feed(token, { now: T0 + 89 * DAY + 2 * 3_600_000 + (89 * DAY) })).status).toBe(200);
    const other = await mint(K2, T0);
    expect((await feed(tokenOf(other.body.url), { now: T0 + 91 * DAY })).status).toBe(404);
  });
  it('the edge limit answers first', async () => {
    const token = await setup();
    env.FOLLOW_LIMIT = { limit: async () => ({ success: false }) };
    expect((await feed(token)).status).toBe(429);
  });
});

describe('revoking and resetting', () => {
  it('a revoked token is 404 at once and the other links stay', async () => {
    const a = tokenOf((await mint()).body.url);
    const b = tokenOf((await mint()).body.url);
    await putCal(LIST());
    expect((await post('/cal/revoke', { token: a })).status).toBe(200);
    expect((await feed(a)).status).toBe(404);
    expect((await feed(b)).status).toBe(200);
  });
  it('revoking an unknown token is still 200 (no way to probe for tokens)', async () => {
    expect((await post('/cal/revoke', { token: 'A'.repeat(22) })).status).toBe(200);
  });
  it('{ k, all: true } revokes every link of the account and no other', async () => {
    const a = tokenOf((await mint(K)).body.url);
    const b = tokenOf((await mint(K)).body.url);
    const c = tokenOf((await mint(K2)).body.url);
    const res = await post('/cal/revoke', { k: K, all: true });
    expect((await res.json()).revoked).toBe(2);
    expect((await feed(a)).status).toBe(404);
    expect((await feed(b)).status).toBe(404);
    expect((await feed(c)).status).toBe(200);
  });
  it('refuses a body with neither a token nor k with all, or with a player ID', async () => {
    expect((await post('/cal/revoke', {})).status).toBe(400);
    expect((await post('/cal/revoke', { k: K })).status).toBe(400);
    expect((await post('/cal/revoke', { token: 'A'.repeat(22), x: 'EI1234567890123456' })).status).toBe(400);
  });
  it('DELETE /forget removes the account links AND the cal list (/sync kind cal)', async () => {
    await putCal(LIST());
    const a = tokenOf((await mint(K)).body.url);
    const b = tokenOf((await mint(K2)).body.url);
    const res = await handleForget(new Request(`https://c.example/forget?k=${K}&all=1`, { method: 'DELETE' }), env, T0);
    const body = await res.json();
    expect(body.deleted.calFeeds).toBe(1);
    expect(body.deleted.synced).toBe(1);
    expect((await feed(a)).status).toBe(404);
    expect((await feed(b)).status).toBe(200);
    // the cal list itself is gone too (not just the links), and no row of this account is left in either table
    expect((await handleSync(new Request(`https://c.example/sync/get?k=${K}&kind=cal&slot=0`), env, T0)).status).toBe(404);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM synced WHERE key = ?').get(K).n).toBe(0);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM cal_feeds WHERE key = ?').get(K).n).toBe(0);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM cal_feeds WHERE key = ?').get(K2).n).toBe(1);
  });
});

describe('salted account codes', () => {
  const SALT = 'f'.repeat(64);
  it('stores links under the salted key: the raw code is nowhere in cal_feeds or the budgets', async () => {
    env.ACCOUNT_KEY_SALT = SALT;
    await mint();
    const sk = await saltedKeyOf(SALT, K);
    expect(rows()[0].key).toBe(sk);
    expect(JSON.stringify(rows())).not.toContain(K);
    expect(JSON.stringify(env.WATCH._db.prepare('SELECT key FROM follow_rate').all())).not.toContain(K);
  });
  it('a link made before the secret moves with the account on first touch, and the feed still works', async () => {
    const token = tokenOf((await mint()).body.url);
    expect(rows()[0].key).toBe(K);
    env.ACCOUNT_KEY_SALT = SALT;
    await putCal(LIST());
    expect(rows()[0].key).toBe(await saltedKeyOf(SALT, K));
    expect((await feed(token)).status).toBe(200);
    expect((await (await feed(token)).text())).toContain('BEGIN:VEVENT');
  });
  it('the hourly sweep moves raw-keyed links (rekeyLegacy covers cal_feeds)', async () => {
    const token = tokenOf((await mint()).body.url);
    env.ACCOUNT_KEY_SALT = SALT;
    expect(await rekeyLegacy(env, T0)).toBe(1);
    expect(rows()[0].key).toBe(await saltedKeyOf(SALT, K));
    expect((await feed(token)).status).toBe(200);
  });
  it('fails closed (503) when salted rows exist and the secret is gone', async () => {
    env.ACCOUNT_KEY_SALT = SALT;
    await mint();
    delete env.ACCOUNT_KEY_SALT;
    env.WATCH._db.prepare("UPDATE cal_feeds SET key = key").run();
    expect((await mint(K2)).res.status).toBe(503);
  });
});

describe('the clean-up and the route', () => {
  it('pruneCal deletes links not fetched for 90 days (or never fetched for 90 days)', async () => {
    const old = tokenOf((await mint(K, T0)).body.url);
    const fresh = tokenOf((await mint(K2, T0 + 80 * DAY)).body.url);
    const n = await pruneCal(env, T0 + 91 * DAY);
    expect(n).toBe(1);
    expect((await feed(old, { now: T0 + 91 * DAY })).status).toBe(404);
    expect((await feed(fresh, { now: T0 + 91 * DAY })).status).toBe(200);
  });
  it('the Worker routes /cal/new (with CORS preflight) and the feed', async () => {
    const pre = await worker.fetch(new Request('https://c.example/cal/new', { method: 'OPTIONS' }), env, { waitUntil() {} });
    expect(pre.status).toBe(200);
    const res = await worker.fetch(new Request('https://c.example/cal/new', { method: 'POST', body: JSON.stringify({ k: K }) }), env, { waitUntil() {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const token = tokenOf((await res.json()).url);
    const f = await worker.fetch(new Request(`https://c.example/cal/${token}.ics`), env, { waitUntil() {} });
    expect(f.status).toBe(200);
  });
});
