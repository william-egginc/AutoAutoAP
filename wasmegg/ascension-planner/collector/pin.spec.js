/**
 * Optional PIN (pin.js, notes/pin-cloud-design-2026-11-17.md). Made-up codes only: no real account anywhere in this file.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { saltedKeyOf } from './acct.js';
import { handleFollow } from './follow.js';
import { handlePrefs } from './prefs.js';
import { handleAnswers } from './answers.js';
import { handleForget, handleSync } from './sync.js';
import { handleCal } from './cal.js';
import { handlePin, pinGuard, pinResetsDue } from './pin.js';
import worker from './worker.js';
import { makeD1 } from './d1shim.js';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const PK = '1'.repeat(64);
const PK2 = '2'.repeat(64);
const SALT = 'f'.repeat(64);
const T0 = Date.UTC(2026, 10, 18, 18, 0, 0);
const HOUR = 3_600_000;
const DAY = 86_400_000;
let env;
beforeEach(() => {
  env = { WATCH: makeD1(), ACCOUNT_KEY_SALT: SALT, PIN_ENABLED: '1' };
});
const db = () => env.WATCH._db;

const pin = (route, body, headers = {}, now = T0, ip = '203.0.113.5') =>
  handlePin(new Request(`https://c.example/pin/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers }, body: JSON.stringify(body) }), env, now);
const status = (k = K, now = T0) => handlePin(new Request(`https://c.example/pin/status?k=${k}`), env, now);
const setPin = async (k = K, pk = PK) => (await pin('set', { k, pk })).json();
const verify = (pk, k = K, now = T0, ip) => pin('verify', { k, pk }, {}, now, ip);
const S = session => ({ 'x-aaap-session': session });

const FOLLOW = { chain: [196, 312], planStart: 1792800000, source: 'exact', at: T0 - 1000 };
const gz = new Uint8Array(gzipSync(Buffer.from('{"a":1}')));
const TICKS = '{"ticked":["a"]}';
const routes = (k, session, now = T0) => {
  const h = session ? S(session) : {};
  const json = { 'content-type': 'application/json', ...h };
  return {
    followGet: () => handleFollow(new Request(`https://c.example/follow?k=${k}`, { headers: h }), env, now),
    followPut: () => handleFollow(new Request('https://c.example/follow', { method: 'PUT', headers: json, body: JSON.stringify({ k, goal: 'race490', value: FOLLOW }) }), env, now),
    prefsGet: () => handlePrefs(new Request(`https://c.example/prefs?k=${k}`, { headers: h }), env, now),
    prefsPut: () => handlePrefs(new Request('https://c.example/prefs', { method: 'PUT', headers: json, body: JSON.stringify({ k, kind: 'setup', value: { at: now - 1000, targetTE: 100 } }) }), env, now),
    answersGet: () => handleAnswers(new Request(`https://c.example/answers?k=${k}`, { headers: h }), env, now),
    answersPut: () => handleAnswers(new Request(`https://c.example/answers?k=${k}&e=e1&at=${now - 1000}`, { method: 'PUT', headers: { 'content-length': String(gz.length), ...h }, body: gz }), env, now),
    syncList: () => handleSync(new Request(`https://c.example/sync?k=${k}`, { headers: h }), env, now),
    syncGet: () => handleSync(new Request(`https://c.example/sync/get?k=${k}&kind=ticks&slot=1793000000`, { headers: h }), env, now),
    syncPut: () => handleSync(new Request(`https://c.example/sync?k=${k}&kind=ticks&slot=1793000000&at=${now - 1000}`, { method: 'PUT', headers: { 'content-length': String(TICKS.length), ...h }, body: TICKS }), env, now),
    syncDelete: () => handleSync(new Request(`https://c.example/sync?k=${k}`, { method: 'DELETE', headers: h }), env, now),
    forget: () => handleForget(new Request(`https://c.example/forget?k=${k}&all=1`, { method: 'DELETE', headers: h }), env, now),
    calNew: () => handleCal(new Request('https://c.example/cal/new', { method: 'POST', headers: json, body: JSON.stringify({ k }) }), env, now),
    calRevokeAll: () => handleCal(new Request('https://c.example/cal/revoke', { method: 'POST', headers: json, body: JSON.stringify({ k, all: true }) }), env, now),
  };
};
const rowsOf = table => db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

describe('off by default', () => {
  it('with PIN_ENABLED unset the /pin routes are 404 and every cloud route works as before', async () => {
    delete env.PIN_ENABLED;
    expect((await pin('set', { k: K, pk: PK })).status).toBe(404);
    expect((await status()).status).toBe(404);
    const r = routes(K);
    expect((await r.followPut()).status).toBe(200);
    expect((await r.syncList()).status).toBe(200);
    expect((await r.calNew()).status).toBe(200);
  });
  it('an account with no PIN is not asked for anything (flag on)', async () => {
    const r = routes(K);
    expect((await r.followPut()).status).toBe(200);
    expect((await r.prefsPut()).status).toBe(200);
    expect((await r.syncPut()).status).toBe(200);
    expect(await (await status()).json()).toEqual({ pin: false });
  });
});

describe('set', () => {
  it('needs the account-key secret', async () => {
    delete env.ACCOUNT_KEY_SALT;
    expect((await pin('set', { k: K, pk: PK })).status).toBe(503);
    expect(rowsOf('pin')).toBe(0);
  });
  it('gives a session and a recovery code once, and a second set is 409', async () => {
    const r = await pin('set', { k: K, pk: PK });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.session).toMatch(/^v1\.\d+\.1\.[0-9a-f]{64}$/);
    expect(b.recovery).toMatch(/^[A-Z2-7]{16}$/);
    expect(b.expires).toBe(T0 + 30 * DAY);
    expect((await pin('set', { k: K, pk: PK2 })).status).toBe(409);
    expect(await (await status()).json()).toEqual({ pin: true });
  });
  it('revokes the older calendar links of the account (and only that account)', async () => {
    await routes(K).calNew();
    await routes(K).calNew();
    await routes(K2).calNew();
    const b = await setPin();
    expect(b.revokedLinks).toBe(2);
    expect(rowsOf('cal_feeds')).toBe(1);
  });
  it('rejects a body with a player id, extra fields, a bad pk, and a query string key', async () => {
    expect((await pin('set', { k: K, pk: 'EI1234567890123456' })).status).toBe(400);
    expect((await pin('set', { k: K, pk: PK, extra: 1 })).status).toBe(400);
    expect((await pin('set', { k: K, pk: 'abc' })).status).toBe(400);
    expect((await handlePin(new Request(`https://c.example/pin/set?k=${K}`, { method: 'POST', body: '{}' }), env, T0)).status).toBe(400);
  });
  it('stores only an HMAC of the proof: no pk, no k, no recovery code, no raw key in any table', async () => {
    const b = await setPin();
    const dump = JSON.stringify(['pin', 'follow_rate', 'cal_feeds'].flatMap(t => db().prepare(`SELECT * FROM ${t}`).all()));
    for (const secret of [PK, K, b.recovery, b.session]) expect(dump).not.toContain(secret);
    expect(db().prepare('SELECT key FROM pin').get().key).toBe(await saltedKeyOf(SALT, K));
  });
});

describe('every cloud route needs the session once a PIN is set', () => {
  it('401 pin required without a session, with data untouched; the same calls work with one', async () => {
    const before = routes(K);
    await before.followPut();
    await before.prefsPut();
    await before.answersPut();
    await before.syncPut();
    const { session } = await setPin();
    const open = routes(K);
    for (const [name, call] of Object.entries(open)) {
      const res = await call();
      expect(res.status, name).toBe(401);
      expect(await res.json(), name).toEqual({ error: 'pin required', pin: true });
    }
    expect(rowsOf('follows')).toBe(1);
    expect(rowsOf('prefs')).toBe(1);
    expect(rowsOf('answers')).toBe(1);
    expect(rowsOf('synced')).toBe(1);
    const mine = routes(K, session);
    for (const name of ['followGet', 'followPut', 'prefsGet', 'prefsPut', 'answersGet', 'answersPut', 'syncList', 'syncGet', 'syncPut', 'calNew']) {
      expect((await mine[name]()).status, name).toBeLessThan(400);
    }
    expect((await mine.syncList()).status).toBe(200);
  });
  it('another account is not affected', async () => {
    await setPin();
    expect((await routes(K2).followPut()).status).toBe(200);
  });
  it('a bad, truncated, other-account, expired or old-epoch session is 401', async () => {
    const { session } = await setPin();
    const other = (await (await pin('set', { k: K2, pk: PK })).json()).session;
    const parts = session.split('.');
    const bads = ['', 'x', session.slice(0, -2), `${session}0`, other, `v1.${parts[1]}.2.${parts[3]}`, `v1.${Number(parts[1]) + 1}.1.${parts[3]}`];
    for (const s of bads) expect((await routes(K, s).syncList()).status, s).toBe(401);
    expect((await routes(K, session, T0 + 31 * DAY).syncList()).status).toBe(401);
    const { session: s2 } = await (await pin('change', { k: K, pk: PK2 }, S(session))).json();
    expect((await routes(K, session).syncList()).status).toBe(401);
    expect((await routes(K, s2).syncList()).status).toBe(200);
  });
  it('/cal/revoke with a token still works without a session (holding the token is the proof); the .ics needs nothing', async () => {
    const mint = await (await routes(K).calNew()).json();
    await setPin();
    const token = /([A-Za-z0-9_-]{22})\.ics/.exec(mint.url)[1];
    // set already revoked it: a new link needs the session, a stale token revokes nothing and is 200
    const r = await handleCal(new Request('https://c.example/cal/revoke', { method: 'POST', body: JSON.stringify({ token }) }), env, T0);
    expect(r.status).toBe(200);
    expect((await handleCal(new Request(`https://c.example/cal/${token}.ics`), env, T0)).status).toBe(404);
  });
  it('forget with the session deletes everything including the PIN; without it nothing is deleted', async () => {
    const { session } = await setPin();
    await routes(K, session).syncPut();
    expect((await routes(K).forget()).status).toBe(401);
    expect(rowsOf('synced')).toBe(1);
    const res = await routes(K, session).forget();
    expect(res.status).toBe(200);
    expect((await res.json()).deleted.pin).toBe(1);
    expect(rowsOf('pin')).toBe(0);
    expect(rowsOf('synced')).toBe(0);
  });
});

describe('guessing', () => {
  const wrong = (n, start = T0, gap = 0) => Promise.all([]).then(async () => {
    const out = [];
    for (let i = 0; i < n; i++) out.push((await verify('9'.repeat(64), K, start + i * gap, `198.51.100.${i % 200}`)).status);
    return out;
  });
  it('5 wrong tries are free (401), then one an hour (429 with retry-after)', async () => {
    await setPin();
    expect(await wrong(5)).toEqual([401, 401, 401, 401, 401]);
    const sixth = await verify('9'.repeat(64), K, T0 + 1000);
    expect(sixth.status).toBe(429);
    const wait = Number(sixth.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(3500);
    expect(wait).toBeLessThanOrEqual(3600);
    expect((await verify('9'.repeat(64), K, T0 + HOUR + 10)).status).toBe(401);
    expect((await verify('9'.repeat(64), K, T0 + HOUR + 20)).status).toBe(429);
  });
  it('10 a day: after 10 tries even the right PIN waits until 24 hours after the first', async () => {
    await setPin();
    await wrong(5);
    for (let i = 1; i <= 5; i++) expect((await verify('9'.repeat(64), K, T0 + i * (HOUR + 5), `192.0.2.${i}`)).status).toBe(401);
    const locked = await verify(PK, K, T0 + 6 * HOUR + 100);
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(17 * 3600);
    expect((await verify(PK, K, T0 + DAY + 1000)).status).toBe(200);
  });
  it('a daily per-address cap says the real time left, not a flat hour (and a retry then is allowed)', async () => {
    // 20 sets a day per address: the 21st, 5 hours after the first, must wait the rest of the day.
    for (let i = 0; i < 20; i++) expect((await pin('set', { k: i.toString(16).padStart(2, '0').repeat(32), pk: PK }, {}, T0, '203.0.113.9')).status).not.toBe(429);
    const k21 = 'c'.repeat(64);
    const refused = await pin('set', { k: k21, pk: PK }, {}, T0 + 5 * HOUR, '203.0.113.9');
    expect(refused.status).toBe(429);
    const wait = Number(refused.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(18 * 3600 - 5);
    expect(wait).toBeLessThanOrEqual(19 * 3600);
    expect((await refused.json()).retryAfter).toBe(wait);
    expect((await pin('set', { k: k21, pk: PK }, {}, T0 + 5 * HOUR + wait * 1000, '203.0.113.9')).status).toBe(200);
  });
  it('a 4th reset in a day says the real time left', async () => {
    const ks = ['d', 'e', 'f', '1'].map(c => c.repeat(64));
    for (const k of ks) await setPin(k);
    for (let i = 0; i < 3; i++) expect((await pin('reset', { k: ks[i] }, {}, T0, '203.0.113.7')).status).toBe(200);
    const refused = await pin('reset', { k: ks[3] }, {}, T0 + 2 * HOUR, '203.0.113.7');
    expect(refused.status).toBe(429);
    const wait = Number(refused.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(22 * 3600 - 5);
    expect(wait).toBeLessThanOrEqual(22 * 3600);
    expect((await pin('reset', { k: ks[3] }, {}, T0 + 2 * HOUR + wait * 1000, '203.0.113.7')).status).toBe(200);
  });
  it('the 11th recovery try in a day says the real time left', async () => {
    await setPin();
    const bad = 'A'.repeat(16);
    for (let i = 0; i < 10; i++) expect((await pin('recover', { k: K, recovery: bad, pk: PK2 }, {}, T0)).status).toBe(401);
    const refused = await pin('recover', { k: K, recovery: bad, pk: PK2 }, {}, T0 + 3 * HOUR);
    expect(refused.status).toBe(429);
    const wait = Number(refused.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(21 * 3600 - 5);
    expect(wait).toBeLessThanOrEqual(21 * 3600);
  });
  it('the hourly address cap on tries says the real time left', async () => {
    await setPin();
    for (let i = 0; i < 30; i++) await verify('9'.repeat(64), K, T0, '203.0.113.50');
    const refused = await verify('9'.repeat(64), K, T0 + 20 * 60_000, '203.0.113.50');
    expect(refused.status).toBe(429);
    const wait = Number(refused.headers.get('retry-after'));
    expect(wait).toBeGreaterThan(40 * 60 - 5);
    expect(wait).toBeLessThanOrEqual(40 * 60);
  });
  it('a right PIN resets the count (5 more free tries)', async () => {
    await setPin();
    await wrong(4);
    expect((await verify(PK, K, T0 + 10)).status).toBe(200);
    expect(await wrong(5, T0 + 20)).toEqual([401, 401, 401, 401, 401]);
  });
  it('the cap is per account: another account is not slowed', async () => {
    await setPin();
    await pin('set', { k: K2, pk: PK });
    await wrong(8);
    expect((await verify(PK, K2, T0 + 10, '192.0.2.77')).status).toBe(200);
  });
  it('30 tries an hour an address, whatever the accounts', async () => {
    const keys = Array.from({ length: 31 }, (_, i) => i.toString(16).padStart(2, '0').repeat(32));
    for (const k of keys) await pin('set', { k, pk: PK }, {}, T0, `10.0.0.${keys.indexOf(k)}`);
    const codes = [];
    for (const k of keys) codes.push((await verify('9'.repeat(64), k, T0 + 5, '10.9.9.9')).status);
    expect(codes.slice(0, 30).every(c => c === 401)).toBe(true);
    expect(codes[30]).toBe(429);
  });
  it('parallel guesses cannot slip under the cap: the try is reserved before the compare', async () => {
    await setPin();
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => verify('9'.repeat(64), K, T0, `192.0.2.${i}`)));
    expect(res.filter(r => r.status === 401).length).toBeLessThanOrEqual(5);
  });
  it('an unknown account answers 404 {pin:false}, never touching a counter', async () => {
    const r = await verify(PK, K2);
    expect(r.status).toBe(404);
  });
});

describe('forgotten PIN', () => {
  it('the recovery code sets a new PIN, kills old sessions, and gives a new recovery code (the old one stops working)', async () => {
    const { session, recovery } = await setPin();
    expect((await pin('recover', { k: K, recovery: 'A'.repeat(16), pk: PK2 })).status).toBe(401);
    const r = await pin('recover', { k: K, recovery, pk: PK2 });
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.recovery).not.toBe(recovery);
    expect((await routes(K, session).syncList()).status).toBe(401);
    expect((await routes(K, b.session).syncList()).status).toBe(200);
    expect((await verify(PK)).status).toBe(401);
    expect((await verify(PK2, K, T0 + 10 * HOUR)).status).toBe(200);
    expect((await pin('recover', { k: K, recovery, pk: PK })).status).toBe(401);
  });
  it('recovery tries are limited to 10 a day', async () => {
    await setPin();
    for (let i = 0; i < 10; i++) expect((await pin('recover', { k: K, recovery: 'A'.repeat(16), pk: PK2 })).status).toBe(401);
    expect((await pin('recover', { k: K, recovery: 'A'.repeat(16), pk: PK2 })).status).toBe(429);
  });
  it('change and remove need the session; remove opens the account again', async () => {
    const { session } = await setPin();
    expect((await pin('change', { k: K, pk: PK2 })).status).toBe(401);
    expect((await pin('remove', { k: K })).status).toBe(401);
    expect((await pin('remove', { k: K }, S(session))).status).toBe(200);
    expect(rowsOf('pin')).toBe(0);
    expect((await routes(K).syncList()).status).toBe(200);
  });
  it('wait-and-delete reset: starts a 7-day timer anyone can start, visible in status; the data goes when it is due', async () => {
    const { session } = await setPin();
    await routes(K, session).syncPut();
    await routes(K, session).followPut();
    const r = await pin('reset', { k: K });
    expect(r.status).toBe(200);
    expect((await r.json()).resetAt).toBe(T0 + 7 * DAY);
    expect(await (await status(K, T0 + DAY)).json()).toEqual({ pin: true, resetAt: T0 + 7 * DAY });
    expect((await routes(K, session, T0 + 6 * DAY).syncList()).status).toBe(200);
    expect(rowsOf('synced')).toBe(1);
    const due = await routes(K, undefined, T0 + 7 * DAY + 1).syncList();
    expect(due.status).toBe(200);
    expect(rowsOf('synced')).toBe(0);
    expect(rowsOf('follows')).toBe(0);
    expect(rowsOf('pin')).toBe(0);
  });
  it('the hourly cron carries out a due reset on its own; a not-yet-due one is left', async () => {
    const { session } = await setPin();
    await routes(K, session).syncPut();
    await pin('reset', { k: K });
    expect(await pinResetsDue(env, T0 + 6 * DAY)).toBe(0);
    expect(rowsOf('pin')).toBe(1);
    expect(await pinResetsDue(env, T0 + 7 * DAY)).toBe(1);
    expect(rowsOf('pin')).toBe(0);
    expect(rowsOf('synced')).toBe(0);
  });
  it('cancel needs a session; it stops the timer and blocks a new reset for 7 days', async () => {
    const { session } = await setPin();
    await pin('reset', { k: K });
    expect((await pin('reset/cancel', { k: K })).status).toBe(401);
    expect((await pin('reset/cancel', { k: K }, S(session), T0 + HOUR)).status).toBe(200);
    expect(await (await status(K, T0 + HOUR)).json()).toEqual({ pin: true });
    const again = await pin('reset', { k: K }, {}, T0 + 2 * HOUR);
    expect(again.status).toBe(409);
    expect((await pin('reset', { k: K }, {}, T0 + HOUR + 7 * DAY + 5)).status).toBe(200);
  });
  it('resets are limited: 3 an address a day', async () => {
    const ks = ['c', 'd', 'e', '1'].map(c => c.repeat(64));
    for (const k of ks) await pin('set', { k, pk: PK }, {}, T0, '192.0.2.200');
    const codes = [];
    for (const k of ks) codes.push((await pin('reset', { k }, {}, T0, '192.0.2.201')).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });
});

describe('rollout and failing closed', () => {
  it('flag off while a PIN row exists: every cloud route is 503, never open', async () => {
    const { session } = await setPin();
    await routes(K, session).syncPut();
    delete env.PIN_ENABLED;
    for (const [name, call] of Object.entries(routes(K, session))) expect((await call()).status, name).toBe(503);
    expect(rowsOf('synced')).toBe(1);
    env.PIN_ENABLED = '1';
    expect((await routes(K, session).syncList()).status).toBe(200);
  });
  it('a D1 error reading the pin row is 503, not "no PIN"', async () => {
    const real = env.WATCH.prepare;
    env.WATCH = { ...env.WATCH, prepare: sql => (/FROM pin /.test(sql) ? { bind: () => ({ first: async () => { throw new Error('D1_ERROR: boom'); } }) } : real(sql)) };
    const res = await pinGuard(env, new Request('https://c.example/x'), await saltedKeyOf(SALT, K), T0);
    expect(res.status).toBe(503);
  });
  it('an old client (no session header) against a PIN account gets 401 on every route and loses nothing', async () => {
    const { session } = await setPin();
    await routes(K, session).syncPut();
    await routes(K, session).prefsPut();
    for (const call of Object.values(routes(K))) expect((await call()).status).toBe(401);
    expect(rowsOf('synced')).toBe(1);
    expect(rowsOf('prefs')).toBe(1);
  });
  it('the worker answers the preflight for x-aaap-session and routes /pin/*', async () => {
    const pre = await worker.fetch(new Request('https://c.example/sync', { method: 'OPTIONS' }), env, { waitUntil() {} });
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-aaap-session');
    const res = await worker.fetch(new Request(`https://c.example/pin/status?k=${K}`), env, { waitUntil() {} });
    expect(res.status).toBe(200);
  });
  it('wrangler.toml leaves the PIN off', async () => {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(/^PIN_ENABLED = "0"/m);
  });
});

describe('review 22 Nov, C1: a new PIN is a new epoch of its own', () => {
  const WEEK = 7 * DAY;
  const epochOf = res => Number(String(res.session).split('.')[2]);
  const oldSessionDead = async (session, now) => {
    const r = routes(K, session, now);
    expect((await r.syncList()).status).toBe(401);
    expect((await pin('change', { k: K, pk: PK2 }, S(session), now)).status).toBe(401);
    expect((await pin('refresh', { k: K }, S(session), now)).status).toBe(401);
  };
  const ways = [
    ['remove', async s1 => ({ at: T0 + 1000, kill: async () => expect((await pin('remove', { k: K }, S(s1.session), T0 + 500)).status).toBe(200) })],
    ['forget', async s1 => ({ at: T0 + 1000, kill: async () => expect((await routes(K, s1.session, T0 + 500).forget()).status).toBe(200) })],
    [
      'a reset that came due (found by a request)',
      async () => ({
        at: T0 + WEEK + 5000,
        kill: async () => {
          expect((await pin('reset', { k: K }, {}, T0)).status).toBe(200);
          expect((await status(K, T0 + WEEK + 1000)).status).toBe(200);
          expect(rowsOf('pin')).toBe(0);
        },
      }),
    ],
    [
      'a reset that came due (found by the hourly cron)',
      async () => ({
        at: T0 + WEEK + 5000,
        kill: async () => {
          expect((await pin('reset', { k: K }, {}, T0)).status).toBe(200);
          expect(await pinResetsDue(env, T0 + WEEK + 1000)).toBe(1);
          expect(rowsOf('pin')).toBe(0);
        },
      }),
    ],
  ];
  for (const [name, plan] of ways) {
    it(`set, then ${name}, then set again: the first session stays dead on /sync, /pin/change and /pin/refresh`, async () => {
      const s1 = await (await pin('set', { k: K, pk: PK }, {}, T0)).json();
      expect((await routes(K, s1.session, T0 + 100).syncList()).status).toBe(200);
      const { at, kill } = await plan(s1);
      await kill();
      const s2 = await (await pin('set', { k: K, pk: PK2 }, {}, at)).json();
      expect(s2.session).toBeTruthy();
      await oldSessionDead(s1.session, at + 1000);
      expect((await routes(K, s2.session, at + 1000).syncList()).status).toBe(200);
    });
  }

  it('change and recover at the same moment never both hand out a live session for the same epoch', async () => {
    const s1 = await (await pin('set', { k: K, pk: PK }, {}, T0)).json();
    const recovery = s1.recovery;
    const [c, r] = await Promise.all([pin('change', { k: K, pk: PK2 }, S(s1.session), T0 + 1000), pin('recover', { k: K, recovery, pk: '3'.repeat(64) }, {}, T0 + 1000)]);
    const answers = [];
    for (const res of [c, r]) if (res.status === 200) answers.push(await res.json());
    expect([200, 401]).toContain(c.status);
    expect(r.status).toBe(200);
    const epochs = answers.map(epochOf);
    expect(new Set(epochs).size).toBe(epochs.length);
    expect(db().prepare('SELECT epoch FROM pin WHERE key = ?').get(await saltedKeyOf(SALT, K)).epoch).toBe(Math.max(...epochs));
  });

  it('PIN_ENABLED off with a PIN row (and a pending reset): every /pin route is closed (404), every cloud route 503, the cron does nothing', async () => {
    const s1 = await (await pin('set', { k: K, pk: PK }, {}, T0)).json();
    await pin('reset', { k: K }, {}, T0);
    env.PIN_ENABLED = '0';
    const bodies = { verify: { k: K, pk: PK }, set: { k: K, pk: PK }, change: { k: K, pk: PK2 }, recover: { k: K, recovery: s1.recovery, pk: PK2 }, remove: { k: K }, refresh: { k: K }, reset: { k: K }, 'reset/cancel': { k: K } };
    for (const [route, body] of Object.entries(bodies)) expect((await pin(route, body, S(s1.session), T0 + WEEK + 1000)).status, route).toBe(404);
    expect((await status(K, T0 + WEEK + 1000)).status).toBe(404);
    for (const [name, call] of Object.entries(routes(K, s1.session, T0 + WEEK + 1000))) expect((await call()).status, name).toBe(503);
    expect(await pinResetsDue(env, T0 + WEEK + 1000)).toBe(0);
    expect(rowsOf('pin')).toBe(1);
  });
  it('the hourly cron leaves a due reset alone while the PIN is off, and carries it out when it is on again', async () => {
    await pin('set', { k: K, pk: PK }, {}, T0);
    await pin('reset', { k: K }, {}, T0);
    env.PIN_ENABLED = '0';
    expect(await pinResetsDue(env, T0 + WEEK + 1000)).toBe(0);
    expect(rowsOf('pin')).toBe(1);
    env.PIN_ENABLED = '1';
    expect(await pinResetsDue(env, T0 + WEEK + 2000)).toBe(1);
    expect(rowsOf('pin')).toBe(0);
  });
});
