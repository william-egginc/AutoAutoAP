/**
 * "Prefs in the cloud" (prefs.js): the contract in ~/code/aaap-tools/notes/prefs-contract.md. D1 is Node's
 * in-memory SQLite behind D1's prepare/bind/first/all/run shape, with the real migration files applied.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { handlePrefs, readConsent, readSetup } from './prefs.js';
import { handleFollow } from './follow.js';

const MIGRATIONS = readdirSync(new URL('./migrations/', import.meta.url))
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));

function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) db.exec(m);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    async first() {
      const row = db.prepare(sql).get(...args);
      return row ? { ...row } : null;
    },
    async all() {
      return { results: db.prepare(sql).all(...args).map(r => ({ ...r })), success: true };
    },
    async run() {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: sql => statement(sql), _db: db };
}

const K = 'c'.repeat(64);
const K2 = 'd'.repeat(64);
const T0 = Date.UTC(2026, 9, 26, 18, 0, 0);
const CONSENT = {
  at: T0,
  answeredAt: T0 - 5000,
  study: 'yes',
  ticks: { shareRuns: true, sendCsv: true, sendDiagnostics: false, shareInstant: true },
  credit: 'name',
  nickname: 'Williamthe5thc',
};
const SETUP = {
  at: T0,
  hours: { start: '07:00', end: '23:00', days: [1, 2, 3, 4, 5], scheduleEnabled: true },
  timeOff: [{ from: '2026-11-01 08:00', to: '2026-11-03 20:00' }],
  noPrestigeDays: [{ from: '2026-12-24', to: '2026-12-26' }],
  targetTE: 490,
  timezone: 'America/Denver',
};

let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});

const put = (body, now = T0) =>
  handlePrefs(new Request('https://c.example/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env, now);
const get = (path, now = T0) => handlePrefs(new Request(`https://c.example${path}`), env, now);
const send = (kind = 'consent', value = CONSENT, k = K, now = T0) => put({ k, kind, value }, now);
const count = table => env.WATCH._db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

describe('PUT then GET /prefs', () => {
  it('stores consent and setup apart and serves both back', async () => {
    expect(await (await send('consent', CONSENT)).json()).toEqual({ ok: true, version: 1, updatedAt: T0 });
    await send('setup', SETUP);
    const got = await get(`/prefs?k=${K}`, T0 + 5);
    expect(got.status).toBe(200);
    const body = await got.json();
    expect(body.prefs.consent).toEqual({ value: CONSENT, version: 1, updatedAt: T0 });
    expect(body.prefs.setup).toEqual({ value: SETUP, version: 1, updatedAt: T0 });
    expect(body.now).toBe(T0 + 5);
    expect(got.headers.get('cache-control')).toBe('no-store');
    expect(got.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('leaves a kind never saved out, and an unknown key has no prefs', async () => {
    await send('consent');
    expect(Object.keys((await (await get(`/prefs?k=${K}`)).json()).prefs)).toEqual(['consent']);
    expect(await (await get(`/prefs?k=${K2}`)).json()).toMatchObject({ prefs: {} });
  });

  it('serves the newest version, and stores nothing for an equal value', async () => {
    await send();
    const same = await send('consent', CONSENT, K, T0 + 60_000);
    expect(await same.json()).toEqual({ ok: true, version: 1, updatedAt: T0, unchanged: true });
    await send('consent', { ...CONSENT, at: T0 + 1, study: 'no' }, K, T0 + 70_000);
    expect((await (await get(`/prefs?k=${K}`)).json()).prefs.consent).toMatchObject({ version: 2, value: { study: 'no' } });
    expect(count('prefs')).toBe(2);
  });

  it('drops unknown fields, keeps a nickname only with credit name, drops control characters', async () => {
    await send('consent', { ...CONSENT, junk: 1, nickname: ' Will\u0000iam ' });
    expect(JSON.parse(env.WATCH._db.prepare('SELECT value FROM prefs').get().value)).toEqual({ ...CONSENT, nickname: 'William' });
    env.WATCH._db.exec('DELETE FROM prefs');
    await send('consent', { ...CONSENT, credit: 'anonymous', nickname: 'Hidden' }, K, T0 + 1);
    expect(JSON.parse(env.WATCH._db.prepare('SELECT value FROM prefs').get().value)).not.toHaveProperty('nickname');
  });

  it('keeps hours null and targetTE null', async () => {
    await send('setup', { at: T0, hours: null, targetTE: null });
    expect((await (await get(`/prefs?k=${K}`)).json()).prefs.setup.value).toEqual({ at: T0, hours: null, targetTE: null });
  });
});

describe('history and restore', () => {
  it('keeps the last five versions of a kind, newest first; a restore is a PUT of an old value', async () => {
    for (let i = 1; i <= 7; i++) await send('setup', { ...SETUP, targetTE: 100 + i, at: T0 + i }, K, T0 + i * 1000);
    const hist = await (await get(`/prefs/history?k=${K}&kind=setup`)).json();
    expect(hist.versions.map(v => v.version)).toEqual([7, 6, 5, 4, 3]);
    const restored = await send('setup', { ...hist.versions[4].value, at: T0 + 99_000 }, K, T0 + 99_000);
    expect((await restored.json()).version).toBe(8);
    expect((await (await get(`/prefs/history?k=${K}&kind=setup`)).json()).versions.map(v => v.version)).toEqual([8, 7, 6, 5, 4]);
  });

  it('answers an unknown kind or key sensibly', async () => {
    expect(await (await get(`/prefs/history?k=${K}&kind=consent`)).json()).toMatchObject({ versions: [] });
    expect((await get(`/prefs/history?k=${K}&kind=follow`)).status).toBe(400);
    expect((await get('/prefs/history?k=short&kind=consent')).status).toBe(400);
  });
});

describe('validation', () => {
  it.each([
    ['a short key', { k: 'abc', kind: 'consent', value: CONSENT }],
    ['a bad kind', { k: K, kind: 'computer', value: CONSENT }],
    ['consent without at', { k: K, kind: 'consent', value: { ...CONSENT, at: undefined } }],
    ['at in seconds', { k: K, kind: 'consent', value: { ...CONSENT, at: 1792800000 } }],
    ['a bad study answer', { k: K, kind: 'consent', value: { ...CONSENT, study: 'maybe' } }],
    ['a non-boolean tick', { k: K, kind: 'consent', value: { ...CONSENT, ticks: { shareRuns: 1 } } }],
    ['a badly named tick', { k: K, kind: 'consent', value: { ...CONSENT, ticks: { 'Share Runs': true } } }],
    ['17 ticks', { k: K, kind: 'consent', value: { ...CONSENT, ticks: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`t${i}`, true])) } }],
    ['a bad credit', { k: K, kind: 'consent', value: { ...CONSENT, credit: 'everyone' } }],
    ['an empty nickname with credit name', { k: K, kind: 'consent', value: { ...CONSENT, nickname: '   ' } }],
    ['bad hours', { k: K, kind: 'setup', value: { ...SETUP, hours: { start: '7', end: '23:00' } } }],
    ['17 time-off ranges', { k: K, kind: 'setup', value: { ...SETUP, timeOff: Array.from({ length: 17 }, () => ({ from: 'a', to: 'b' })) } }],
    ['time off with a bad character', { k: K, kind: 'setup', value: { ...SETUP, timeOff: [{ from: '<b>', to: 'x' }] } }],
    ['a weekday number as a no-prestige stretch', { k: K, kind: 'setup', value: { ...SETUP, noPrestigeDays: [5] } }],
    ['17 no-prestige stretches', { k: K, kind: 'setup', value: { ...SETUP, noPrestigeDays: Array.from({ length: 17 }, () => ({ from: '2026-12-24', to: '2026-12-25' })) } }],
    ['a no-prestige stretch with a bad character', { k: K, kind: 'setup', value: { ...SETUP, noPrestigeDays: [{ from: '2026/12/24', to: 'x' }] } }],
    ['hours days over 6', { k: K, kind: 'setup', value: { ...SETUP, hours: { start: '07:00', end: '23:00', days: [7] } } }],
    ['8 hours days', { k: K, kind: 'setup', value: { ...SETUP, hours: { start: '07:00', end: '23:00', days: [0, 1, 2, 3, 4, 5, 6, 0] } } }],
    ['a non-boolean scheduleEnabled', { k: K, kind: 'setup', value: { ...SETUP, hours: { start: '07:00', end: '23:00', scheduleEnabled: 'yes' } } }],
    ['a targetTE of 0', { k: K, kind: 'setup', value: { ...SETUP, targetTE: 0 } }],
    ['a bad timezone', { k: K, kind: 'setup', value: { ...SETUP, timezone: 'x y' } }],
    ['value not an object', { k: K, kind: 'setup', value: 'x' }],
  ])('refuses %s with 400 and names the problem, storing nothing', async (_n, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect((await res.json()).problems.length).toBeGreaterThan(0);
    expect(count('prefs')).toBe(0);
  });

  it('refuses a player id anywhere, even in the nickname or the query', async () => {
    expect((await put({ k: K, kind: 'consent', value: { ...CONSENT, nickname: 'EI1234567890123456' } })).status).toBe(400);
    expect((await get(`/prefs?k=${K}&x=ei1234567890123456`)).status).toBe(400);
    expect(count('prefs')).toBe(0);
  });

  it('refuses a body over 6 KB with 413 and not-JSON with 400', async () => {
    const big = JSON.stringify({ k: K, kind: 'consent', value: CONSENT, pad: 'x'.repeat(7000) });
    expect((await put(big)).status).toBe(413);
    expect((await put('not json')).status).toBe(400);
  });

  it('readConsent and readSetup directly', () => {
    expect(readConsent(CONSENT).value).toEqual(CONSENT);
    expect(readSetup(SETUP).value).toEqual(SETUP);
    expect(JSON.stringify(readSetup(SETUP).value).length).toBeLessThan(500);
  });
});

describe('limits', () => {
  it('takes 30 writes an hour per key, 429 with the wait, a new hour starts again, another key is unaffected, and /follow has its own budget', async () => {
    for (let i = 0; i < 30; i++) expect((await send('setup', { ...SETUP, targetTE: 100 + (i % 300), at: T0 + i, timezone: `Zone/N${i}` }, K, T0 + i * 1000)).status).toBe(200);
    const over = await send('setup', { ...SETUP, targetTE: 77 }, K, T0 + 40_000);
    expect(over.status).toBe(429);
    const body = await over.json();
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(over.headers.get('retry-after')).toBe(String(body.retryAfter));
    expect((await send('setup', SETUP, K2, T0 + 40_000)).status).toBe(200);
    expect((await send('setup', { ...SETUP, targetTE: 77 }, K, T0 + 3_700_000)).status).toBe(200);
    // /follow's own budget for the same key is untouched.
    const followed = await handleFollow(
      new Request('https://c.example/follow', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ k: K, goal: 'race490', value: { chain: [200, 300], planStart: 1792800000, source: 'instant', at: T0 } }),
      }),
      env,
      T0 + 40_000
    );
    expect(followed.status).toBe(200);
  });

  it('refuses over the per-address edge limit before touching D1; no binding means no limit', async () => {
    const calls = [];
    env.FOLLOW_LIMIT = { async limit({ key }) { calls.push(key); return { success: calls.length <= 1 }; } };
    expect((await get(`/prefs?k=${K}`)).status).toBe(200);
    expect((await get(`/prefs?k=${K}`)).status).toBe(429);
    expect(calls[0]).toBe('follow-prefs-get|unknown');
    env.FOLLOW_LIMIT = { limit: async () => { throw new Error('down'); } };
    expect((await get(`/prefs?k=${K}`)).status).toBe(200);
  });

  it('says 503 without D1', async () => {
    env = {};
    expect((await get(`/prefs?k=${K}`)).status).toBe(503);
  });
});

describe('through the Worker: routing, CORS, and /follow unchanged', () => {
  const through = (path, init = {}) => worker.fetch(new Request(`https://collector.test${path}`, init), { SUBMISSIONS: { async get() { return null; } }, ...env });

  it('answers the preflight, and routes PUT, GET and history', async () => {
    const pre = await through('/prefs', { method: 'OPTIONS', headers: { origin: 'https://egg.example', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' } });
    expect(pre.status).toBe(200);
    expect(pre.headers.get('access-control-allow-methods')).toContain('PUT');
    const w = await through('/prefs', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K, kind: 'setup', value: SETUP }) });
    expect(w.status).toBe(200);
    expect((await (await through(`/prefs?k=${K}`)).json()).prefs.setup.value.targetTE).toBe(490);
    expect((await (await through(`/prefs/history?k=${K}&kind=setup`)).json()).versions).toHaveLength(1);
    expect((await through('/prefs', { method: 'DELETE' })).status).toBe(405);
  });

  it("never shows prefs in /follow's goals (today's live clients see exactly what they did)", async () => {
    await send('consent');
    await send('setup');
    const f = await (await through(`/follow?k=${K}`)).json();
    expect(f).toEqual({ goals: {}, now: expect.any(Number) });
    expect(JSON.stringify(f)).not.toMatch(/consent|setup/);
  });
});
