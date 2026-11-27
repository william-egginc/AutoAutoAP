/**
 * "Follow in the cloud" (follow.js): the contract in ~/code/aaap-tools/notes/follow-contract.md, end to end.
 * D1 is Node's in-memory SQLite behind D1's prepare/bind/first/all/run shape, as in watch.spec.js, with the
 * real migration files applied.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.js';
import { FOLLOW_MAX_GOALS, FOLLOW_VERSIONS, FOLLOW_WRITES_PER_HOUR, handleFollow, readGoal, readValue } from './follow.js';

const MIGRATIONS = ['0001_watch.sql', '0002_follow.sql'].map(f => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));

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

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const T0 = Date.UTC(2026, 9, 23, 18, 0, 0);
const VALUE = {
  chain: [196, 225, 251, 283, 312],
  planStart: 1792800000,
  source: 'exact',
  at: T0,
  finish: 1815500000,
  spareSeconds: 88000,
  hours: { start: '07:00', end: '23:00', timezone: 'America/New_York' },
  saveTime: 1792790000,
  simVersion: '2026-10-13-lowte-gate',
  build: '2026-10-22T20:10:00Z',
};
const GOAL = 'bydate:1815580800';

let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});

const put = (body, now = T0, headers = {}) =>
  handleFollow(
    new Request('https://c.example/follow', { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env,
    now
  );
const get = (path, now = T0) => handleFollow(new Request(`https://c.example${path}`), env, now);
const send = (value = VALUE, goal = GOAL, k = K, now = T0) => put({ k, goal, value }, now);

describe('PUT then GET /follow', () => {
  it('stores a route per goal and serves every goal of a key back', async () => {
    const res = await send();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 1, updatedAt: T0 });
    await send({ ...VALUE, chain: [205, 480], source: 'instant' }, 'race490');
    const got = await get(`/follow?k=${K}`, T0 + 5);
    expect(got.status).toBe(200);
    const body = await got.json();
    expect(Object.keys(body.goals).sort()).toEqual(['bydate:1815580800', 'race490']);
    expect(body.goals[GOAL]).toEqual({ value: VALUE, version: 1, updatedAt: T0 });
    expect(body.now).toBe(T0 + 5);
    expect(got.headers.get('cache-control')).toBe('no-store');
    expect(got.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers an unknown key with no goals, and another key sees nothing of it', async () => {
    await send();
    expect(await (await get(`/follow?k=${K2}`)).json()).toMatchObject({ goals: {} });
  });

  it('serves the newest version of a goal', async () => {
    await send();
    await send({ ...VALUE, chain: [200, 300, 312], at: T0 + 1000 }, GOAL, K, T0 + 1000);
    const body = await (await get(`/follow?k=${K}`)).json();
    expect(body.goals[GOAL].version).toBe(2);
    expect(body.goals[GOAL].value.chain).toEqual([200, 300, 312]);
  });

  it('stores nothing for an equal value and says so', async () => {
    await send();
    const again = await send(VALUE, GOAL, K, T0 + 60_000);
    expect(await again.json()).toEqual({ ok: true, version: 1, updatedAt: T0, unchanged: true });
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM follows').get().n).toBe(1);
  });

  it('keeps hours null, drops unknown fields, and never stores more than the whitelist', async () => {
    await send({ ...VALUE, hours: null, nickname: 'x', junk: { a: 1 } });
    const stored = JSON.parse(env.WATCH._db.prepare('SELECT value FROM follows').get().value);
    expect(stored.hours).toBeNull();
    expect(stored).not.toHaveProperty('nickname');
    expect(stored).not.toHaveProperty('junk');
  });
});

describe('history and restore', () => {
  it('keeps the last five versions of a goal, newest first, and a restore is a PUT of an old value', async () => {
    for (let i = 1; i <= 7; i++) await send({ ...VALUE, chain: [190 + i, 312], at: T0 + i }, GOAL, K, T0 + i * 1000);
    const hist = await (await get(`/follow/history?k=${K}&goal=${GOAL}`)).json();
    expect(hist.versions.map(v => v.version)).toEqual([7, 6, 5, 4, 3]);
    expect(hist.versions).toHaveLength(FOLLOW_VERSIONS);
    expect(hist.versions[4].value.chain).toEqual([193, 312]);
    // Restore version 3: the app puts its value again with a fresh `at`.
    const restored = await send({ ...hist.versions[4].value, at: T0 + 99_000 }, GOAL, K, T0 + 99_000);
    expect((await restored.json()).version).toBe(8);
    const after = await (await get(`/follow/history?k=${K}&goal=${GOAL}`)).json();
    expect(after.versions.map(v => v.version)).toEqual([8, 7, 6, 5, 4]);
  });

  it('answers an unknown goal with no versions, and refuses a bad goal or key', async () => {
    expect(await (await get(`/follow/history?k=${K}&goal=race490`)).json()).toMatchObject({ versions: [] });
    expect((await get(`/follow/history?k=${K}&goal=nonsense`)).status).toBe(400);
    expect((await get(`/follow/history?k=short&goal=race490`)).status).toBe(400);
  });
});

describe('validation', () => {
  it.each([
    ['a short key', { k: 'abc', goal: GOAL, value: VALUE }],
    ['an upper-case key', { k: 'A'.repeat(64), goal: GOAL, value: VALUE }],
    ['a bad goal', { k: K, goal: 'bydate:5', value: VALUE }],
    ['target 0', { k: K, goal: 'target:0', value: VALUE }],
    ['no chain', { k: K, goal: GOAL, value: { ...VALUE, chain: [] } }],
    ['a chain that does not increase', { k: K, goal: GOAL, value: { ...VALUE, chain: [250, 200] } }],
    ['a stop over 490', { k: K, goal: GOAL, value: { ...VALUE, chain: [200, 491] } }],
    ['17 stops', { k: K, goal: GOAL, value: { ...VALUE, chain: Array.from({ length: 17 }, (_, i) => i + 100) } }],
    ['an unknown source', { k: K, goal: GOAL, value: { ...VALUE, source: 'guess' } }],
    ['a planStart in seconds that is ms', { k: K, goal: GOAL, value: { ...VALUE, planStart: 1792800000000 } }],
    ['no at', { k: K, goal: GOAL, value: { ...VALUE, at: undefined } }],
    ['bad hours', { k: K, goal: GOAL, value: { ...VALUE, hours: { start: '7am', end: '23:00' } } }],
    ['a bad build', { k: K, goal: GOAL, value: { ...VALUE, build: 'x y' } }],
    ['spare out of range', { k: K, goal: GOAL, value: { ...VALUE, spareSeconds: 1e12 } }],
    ['value not an object', { k: K, goal: GOAL, value: 'x' }],
  ])('refuses %s with 400 and names the problem, and stores nothing', async (_n, body) => {
    const res = await put(body);
    expect(res.status).toBe(400);
    expect((await res.json()).problems.length).toBeGreaterThan(0);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM follows').get().n).toBe(0);
  });

  it('refuses a player id anywhere in the body or the query, even a hidden one', async () => {
    expect((await put({ k: K, goal: GOAL, value: { ...VALUE, build: 'ok' }, note: 'EI1234567890123456' })).status).toBe(400);
    expect((await get(`/follow?k=${K}&x=EI1234567890123456`)).status).toBe(400);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM follows').get().n).toBe(0);
  });

  it('refuses a body over 6 KB (declared or actual) with 413, and not-JSON with 400', async () => {
    const big = JSON.stringify({ k: K, goal: GOAL, value: VALUE, pad: 'x'.repeat(7000) });
    expect((await put(big)).status).toBe(413);
    expect((await put(big, T0, { 'content-length': String(big.length) })).status).toBe(413);
    expect((await put('not json')).status).toBe(400);
  });

  it('readValue and readGoal, directly', () => {
    expect(readGoal('race490')).toBe('race490');
    expect(readGoal('eggday2027')).toBe('eggday2027');
    expect(readGoal('target:490')).toBe('target:490');
    expect(readGoal('target:491')).toBeNull();
    expect(readValue(VALUE).value).toEqual(VALUE);
    expect(JSON.stringify(readValue(VALUE).value).length).toBeLessThan(500);
  });
});

describe('limits', () => {
  it(`takes ${FOLLOW_WRITES_PER_HOUR} writes an hour per key, then 429 with the wait; a new hour starts again; another key is unaffected`, async () => {
    for (let i = 0; i < FOLLOW_WRITES_PER_HOUR; i++) {
      expect((await send({ ...VALUE, chain: [100 + (i % 90), 200 + i], at: T0 + i }, GOAL, K, T0 + i * 1000)).status).toBe(200);
    }
    const over = await send({ ...VALUE, chain: [150, 480] }, GOAL, K, T0 + 40_000);
    expect(over.status).toBe(429);
    const body = await over.json();
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(over.headers.get('retry-after')).toBe(String(body.retryAfter));
    expect((await send(VALUE, GOAL, K2, T0 + 40_000)).status).toBe(200);
    expect((await send({ ...VALUE, chain: [150, 480] }, GOAL, K, T0 + 3_700_000)).status).toBe(200);
  });

  it(`takes at most ${FOLLOW_MAX_GOALS} goals for one key`, async () => {
    for (let i = 1; i <= FOLLOW_MAX_GOALS; i++) expect((await send(VALUE, `target:${100 + i}`)).status).toBe(200);
    const res = await send(VALUE, 'race490');
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/goals/);
    // An existing goal can still change.
    expect((await send({ ...VALUE, chain: [210, 400] }, 'target:101', K, T0 + 1000)).status).toBe(200);
  });

  it('refuses over the per-address edge limit, before touching D1; no binding means no limit', async () => {
    const calls = [];
    env.FOLLOW_LIMIT = { async limit({ key }) { calls.push(key); return { success: calls.length <= 1 }; } };
    expect((await get(`/follow?k=${K}`)).status).toBe(200);
    const slow = await get(`/follow?k=${K}`);
    expect(slow.status).toBe(429);
    expect(calls).toEqual(['follow-get|unknown', 'follow-get|unknown']);
    env.FOLLOW_LIMIT = { limit: async () => { throw new Error('down'); } };
    expect((await get(`/follow?k=${K}`)).status).toBe(200);
  });

  it('says 503 without D1', async () => {
    env = {};
    expect((await get(`/follow?k=${K}`)).status).toBe(503);
  });
});

describe('through the Worker (routing and CORS)', () => {
  const through = (path, init = {}) => worker.fetch(new Request(`https://collector.test${path}`, init), { SUBMISSIONS: { async get() { return null; } }, ...env });

  it('answers the preflight for PUT with the content-type header allowed', async () => {
    const res = await through('/follow', { method: 'OPTIONS', headers: { origin: 'https://egg.example', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type');
  });

  it('routes PUT, GET and history to the follow module', async () => {
    const w = await through('/follow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K, goal: GOAL, value: VALUE }) });
    expect(w.status).toBe(200);
    expect((await (await through(`/follow?k=${K}`)).json()).goals[GOAL].value.chain).toEqual(VALUE.chain);
    expect((await (await through(`/follow/history?k=${K}&goal=${GOAL}`)).json()).versions).toHaveLength(1);
    expect((await through('/follow', { method: 'DELETE' })).status).toBe(405);
  });
});
