/**
 * The second hardening round (21 Oct 2026, red team + review): edge limits on the write and read routes,
 * "ranked only with its evidence", simulator stamps, the snapshot's row cap, the board's cache key and
 * GET /csv's cache and cost. Plain in-memory KV, a fake rate limiter and a fake edge cache; no network.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import worker from './worker.js';
import { handleWatch } from './watch.js';

function makeKV() {
  const m = new Map();
  const meta = new Map();
  const counts = { get: 0, put: 0, list: 0 };
  return {
    _m: m,
    counts,
    async get(k) {
      counts.get++;
      return m.has(k) ? m.get(k) : null;
    },
    async getWithMetadata(k) {
      counts.get++;
      return { value: m.has(k) ? m.get(k) : null, metadata: meta.get(k) ?? null };
    },
    async put(k, v, opts) {
      counts.put++;
      m.set(k, v);
      if (opts?.metadata) meta.set(k, opts.metadata);
      else meta.delete(k);
    },
    async delete(k) {
      m.delete(k);
      meta.delete(k);
    },
    async list({ prefix, limit }) {
      counts.list++;
      const keys = [...m.keys()]
        .filter(k => k.startsWith(prefix))
        .sort()
        .slice(0, limit ?? 1000);
      return {
        keys: keys.map(name => (meta.has(name) ? { name, metadata: meta.get(name) } : { name })),
        list_complete: true,
      };
    },
  };
}

/** The Workers rate-limit binding: `limit` successes per key, then refusals. Records every key asked. */
function makeLimiter(limit) {
  const n = new Map();
  const keys = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      n.set(key, (n.get(key) ?? 0) + 1);
      return { success: n.get(key) <= limit };
    },
  };
}

/** caches.default, keyed by URL (what the Cache API keys a GET on). */
function makeCache() {
  const m = new Map();
  return {
    _m: m,
    async match(req) {
      const hit = m.get(typeof req === 'string' ? req : req.url);
      return hit ? hit.clone() : undefined;
    },
    async put(req, res) {
      m.set(typeof req === 'string' ? req : req.url, res.clone());
    },
    async delete(req) {
      return m.delete(typeof req === 'string' ? req : req.url);
    },
  };
}

let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
});
afterEach(() => {
  delete globalThis.caches;
});

const send = (body, { ip = '1.1.1.1', token, path = '/submit?quarantine=1' } = {}) =>
  worker.fetch(
    new Request(`https://collector.test${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': ip,
        ...(token ? { 'x-owner-token': token } : {}),
      },
      body: JSON.stringify(body),
    }),
    env
  );
const get = (path, { ip = '2.2.2.2', token } = {}) =>
  worker.fetch(
    new Request('https://collector.test' + path, {
      headers: { 'cf-connecting-ip': ip, ...(token ? { 'x-owner-token': token } : {}) },
    }),
    env
  );
const keysOf = prefix => [...env.SUBMISSIONS._m.keys()].filter(k => k.startsWith(prefix));
const TOKEN = 'a'.repeat(32);

const DAY = 86400000;
const START = '2026-09-25T13:12:00.000Z';
const LEGS = [
  { te: 195, strategy: 'continue', days: 70.2, peakDeliveryQph: 12.5 },
  { te: 219, strategy: '2-sale-tier13', days: 60.1, peakDeliveryQph: 13.1 },
  { te: 248, strategy: '2-sale-tier13', days: 62.3, peakDeliveryQph: 13.9 },
  { te: 286, strategy: '2-sale-tier13', days: 70.0, peakDeliveryQph: 14.6 },
  { te: 327, strategy: '2-sale-tier13', days: 75.0, peakDeliveryQph: 15.2 },
  { te: 490, strategy: '1-sale-tier13', days: 404.365, peakDeliveryQph: 15.9 },
];
/** A send as the app makes it (src/search/submission.ts buildSubmission): every field a rule reads, agreeing. */
const GOOD = {
  schema: 7,
  chain: [195, 219, 248, 286, 327, 490],
  ascensions: 6,
  currentTE: 185,
  backupTE: 185,
  finalTE: 490,
  durationDays: 741.965,
  startLocal: '2026-09-25 07:12',
  timezone: 'America/Denver',
  startUtc: START,
  endUtc: new Date(Date.parse(START) + 741.965 * DAY).toISOString(),
  backupAgeHours: 1.5,
  effort: 'balanced',
  legs: LEGS,
};
/** The red team's forged #1 (server.md): no currentTE, legs or times, so no rule had anything to fail. */
const FORGED = {
  schema: 2,
  chain: [999000, 1000000],
  finalTE: 1000000,
  durationDays: 0.0001,
  nickname: 'Totally Legit',
  simVersion: '2026-10-21-egg-beta2',
};

// ------------------------------------------------------------------------------------------- (a)
describe('edge limits on /submit, /claim and /hide (SUBMIT_LIMITER)', () => {
  it('refuses past the limit, per address and per route, before any KV read', async () => {
    env.SUBMIT_LIMITER = makeLimiter(2);
    expect((await send(GOOD)).status).toBe(200);
    expect((await send({ ...GOOD, durationDays: GOOD.durationDays })).status).toBe(200);
    const before = env.SUBMISSIONS.counts.get;
    const third = await send(GOOD);
    expect(third.status).toBe(429);
    expect((await third.json()).retryAfter).toBe(60);
    expect(env.SUBMISSIONS.counts.get).toBe(before); // the floodGate's read never happened
    // Another address, and another route from the same address, have their own counts.
    expect((await send(GOOD, { ip: '9.9.9.9' })).status).toBe(200);
    const claim = await send({ id: 'abcd1234', nickname: 'x' }, { path: '/claim', token: TOKEN });
    expect(claim.status).not.toBe(429);
    expect(env.SUBMIT_LIMITER.keys).toEqual(
      expect.arrayContaining(['submit|1.1.1.1', 'submit|9.9.9.9', 'claim|1.1.1.1'])
    );
  });

  it('covers /hide too, and a missing binding means no limit (as deployed before)', async () => {
    env.SUBMIT_LIMITER = makeLimiter(0);
    expect((await send({ all: true, hidden: true }, { path: '/hide', token: TOKEN })).status).toBe(429);
    delete env.SUBMIT_LIMITER;
    expect((await send({ all: true, hidden: true }, { path: '/hide', token: TOKEN })).status).toBe(200);
  });

  it('a limiter that throws never blocks a send', async () => {
    env.SUBMIT_LIMITER = {
      limit: async () => {
        throw new Error('down');
      },
    };
    expect((await send(GOOD)).status).toBe(200);
  });
});

describe('the phone watch limit (WATCH_LIMIT) covers GET as well as POST', () => {
  const id = 'A'.repeat(22);
  const watchEnv = limiter => ({
    WATCH_LIMIT: limiter,
    WATCH: {
      prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({ meta: { changes: 1 } }) }) }),
    },
  });
  const req = (method, ip) =>
    new Request(`https://collector.test/watch${method === 'GET' ? `?id=${id}` : ''}`, {
      method,
      headers: { 'cf-connecting-ip': ip },
      ...(method === 'POST' ? { body: JSON.stringify({ id, status: 'running' }) } : {}),
    });
  it('counts GET and POST apart and refuses past the limit', async () => {
    const lim = makeLimiter(1);
    const e = watchEnv(lim);
    expect((await handleWatch(req('GET', '5.5.5.5'), e)).status).toBe(404); // read allowed (no such row)
    expect((await handleWatch(req('GET', '5.5.5.5'), e)).status).toBe(429);
    expect((await handleWatch(req('POST', '5.5.5.5'), e)).status).not.toBe(429);
    expect((await handleWatch(req('POST', '5.5.5.5'), e)).status).toBe(429);
    expect(lim.keys).toEqual(['get|5.5.5.5', 'get|5.5.5.5', 'post|5.5.5.5', 'post|5.5.5.5']);
  });
});

// ------------------------------------------------------------------------------------------- (b)
describe('ranked only with its evidence (RANK_NEEDS_EVIDENCE)', () => {
  beforeEach(() => {
    env.RANK_NEEDS_EVIDENCE = '1';
  });
  const board = async () => (await (await get('/all')).json()).rows;

  it("the red team's forged #1 no longer reaches the main board: it is unranked, on the flagged board", async () => {
    const j = await (await send(FORGED)).json();
    expect(j.ok).toBe(true);
    expect(j.flagged).toEqual(['unverified']);
    expect(await board()).toEqual([]);
    expect(keysOf('sub:')).toEqual([]);
    expect(keysOf('flag:')).toHaveLength(1);
  });

  it('a send as the app makes it still ranks on the main board, unflagged', async () => {
    const j = await (await send(GOOD)).json();
    expect(j.flagged).toBeUndefined();
    expect((await board()).map(r => r.id)).toEqual([j.id]);
  });

  for (const [missing, body] of [
    ['currentTE', { ...GOOD, currentTE: undefined }],
    ['legs', { ...GOOD, legs: [] }],
    [
      'a leg without its days',
      { ...GOOD, legs: LEGS.map((l, i) => (i === 2 ? { te: l.te, strategy: l.strategy } : l)) },
    ],
    ['startUtc', { ...GOOD, startUtc: undefined }],
    ['endUtc', { ...GOOD, endUtc: 'not a time' }],
  ]) {
    it(`without ${missing}: unranked, not refused and not quarantined`, async () => {
      const j = await (await send(body)).json();
      expect(j.ok).toBe(true);
      expect(j.quarantined).toBeUndefined();
      expect(j.flagged).toEqual(['unverified']);
      expect(await board()).toEqual([]);
    });
  }

  it('present but disagreeing is still quarantined, as before', async () => {
    const j = await (
      await send({ ...GOOD, durationDays: 0.5, endUtc: new Date(Date.parse(START) + 0.5 * DAY).toISOString() })
    ).json();
    expect(j.quarantined).toBe(true);
    expect(j.reasons).toEqual(expect.arrayContaining(['legs-sum']));
  });

  it('keeps a client flag beside its own, and the sender still finds the row in /mine', async () => {
    const j = await (await send({ ...GOOD, legs: [], flags: ['integrity-stall'] }, { token: TOKEN })).json();
    expect(j.flagged).toEqual(['integrity-stall', 'unverified']);
    const mine = await (await get('/mine', { token: TOKEN })).json();
    expect(mine.rows.map(r => r.id)).toEqual([j.id]);
  });

  it('a By a date answer (schema 8) with its legs ranks; replayed from a checkpoint (legs: []) it is unranked', async () => {
    const deadline = Math.floor(Date.parse(GOOD.endUtc) / 1000) + 86400;
    const d8 = { ...GOOD, schema: 8, effort: 'deadline', deadline };
    expect((await (await send(d8)).json()).flagged).toBeUndefined();
    expect((await (await send({ ...d8, legs: [] }, { ip: '3.3.3.3' })).json()).flagged).toEqual(['unverified']);
  });

  it('a client cannot send the flag itself to dodge or fake it', async () => {
    const j = await (await send({ ...GOOD, flags: ['unverified'] })).json();
    expect(j.flagged).toBeUndefined();
  });

  it('without the var the rule is off (a fork, or the owner turning it off)', async () => {
    delete env.RANK_NEEDS_EVIDENCE;
    const j = await (await send(FORGED)).json();
    expect(j.flagged).toBeUndefined();
    expect(await board()).toHaveLength(1);
  });
});

// ------------------------------------------------------------------------------------------- (c)
describe('simulator stamps', () => {
  const stampOf = async (simVersion, ip) => {
    // A code per call: the same result from one sender would be folded into the first row.
    const j = await (await send({ ...GOOD, simVersion }, { ip, token: ip.replace(/\D/g, '').padEnd(32, 'c') })).json();
    const rec = JSON.parse(env.SUBMISSIONS._m.get(keysOf('sub:').find(k => k.endsWith(':' + j.id))));
    return { simVersion: rec.simVersion, simNewer: rec.simNewer };
  };
  it('keeps the known stamps, unmarked', async () => {
    expect(await stampOf('2026-10-13-lowte-gate', '4.0.0.1')).toEqual({
      simVersion: '2026-10-13-lowte-gate',
      simNewer: undefined,
    });
    expect(await stampOf('2026-10-21-egg-beta2', '4.0.0.2')).toEqual({
      simVersion: '2026-10-21-egg-beta2',
      simNewer: undefined,
    });
  });
  it('keeps an older unknown stamp, unmarked (old rows are history)', async () => {
    expect(await stampOf('2026-09-30-first', '4.0.0.3')).toEqual({
      simVersion: '2026-09-30-first',
      simNewer: undefined,
    });
  });
  it('marks a stamp newer than this Worker knows, or an unknown one claiming to be current', async () => {
    expect(await stampOf('2026-11-02-next', '4.0.0.4')).toEqual({ simVersion: '2026-11-02-next', simNewer: true });
    expect(await stampOf('2026-10-21-forged', '4.0.0.5')).toEqual({ simVersion: '2026-10-21-forged', simNewer: true });
  });
  it('drops anything not a date and words, or too long, without refusing the row', async () => {
    for (const [v, ip] of [
      ['latest', '4.1.0.1'],
      ['2026-13-45-x', '4.1.0.2'],
      ['2026-10-21-Egg-Beta2', '4.1.0.3'],
      ['2026-10-21_x', '4.1.0.4'],
      ['2026-10-21-' + 'a'.repeat(30), '4.1.0.5'],
      ['2026-10-21-a-b-c-d-e-f-g', '4.1.0.6'],
    ]) {
      expect(await stampOf(v, ip)).toEqual({ simVersion: undefined, simNewer: undefined });
    }
  });
});

// ------------------------------------------------------------------------------------------- (d)
describe("a row's size in the snapshot is capped", () => {
  const BIG_SPACE = {
    mode: 'bands',
    bands: Array.from({ length: 32 }, (_, b) => Array.from({ length: 1024 }, (_, i) => 1 + b * 1024 + i)),
    minGap: 1,
    minAscensions: 1,
    maxAscensions: 32,
    chains: 1e9,
  };
  it('trims the snapshot copy, keeps the stored row whole', async () => {
    const j = await (await send({ ...GOOD, space: BIG_SPACE, note: 'mine' })).json();
    const stored = JSON.parse(env.SUBMISSIONS._m.get(keysOf('sub:')[0]));
    expect(stored.space.bands).toHaveLength(32);
    const row = (await (await get('/all')).json()).rows[0];
    expect(row.id).toBe(j.id);
    expect(row.trimmed).toBe(true);
    expect(row.space).toBeUndefined();
    // What the board ranks and names by is all still there.
    expect(row).toMatchObject({
      finalTE: 490,
      durationDays: GOOD.durationDays,
      chain: GOOD.chain,
      currentTE: 185,
      note: 'mine',
    });
    expect(JSON.stringify(row).length).toBeLessThanOrEqual(16 * 1024);
  });
  it('leaves an ordinary row alone', async () => {
    await send(GOOD);
    expect((await (await get('/all')).json()).rows[0].trimmed).toBeUndefined();
  });
  it('50 maximal rows keep the snapshot under a megabyte', async () => {
    for (let i = 0; i < 50; i++) {
      await send(
        { ...GOOD, space: BIG_SPACE, durationDays: GOOD.durationDays },
        { ip: `6.6.${i}.1`, token: (i + 10).toString(16).padStart(32, 'b') }
      );
    }
    const raw = env.SUBMISSIONS._m.get('snap:sub');
    expect((await (await get('/all')).json()).count).toBe(50);
    expect(raw.length).toBeLessThan(1024 * 1024);
  });
});

// ------------------------------------------------------------------------------------------- (e)
describe("the board's cache key ignores parameters it does not read", () => {
  beforeEach(async () => {
    await send(GOOD);
    globalThis.caches = { default: makeCache() };
  });
  it('/all?x=<anything> is the same cache entry as /all: no KV read after the first', async () => {
    expect((await get('/all')).status).toBe(200);
    const reads = env.SUBMISSIONS.counts.get;
    for (const q of ['?x=1', '?x=2&y=3', '?cachebust=' + Math.random()])
      expect((await get('/all' + q)).status).toBe(200);
    expect(env.SUBMISSIONS.counts.get).toBe(reads);
    expect([...globalThis.caches.default._m.keys()]).toEqual(['https://collector.test/all']);
  });
  it('keys final and limit in the order the write path drops them, and 400s a final that is not a TE', async () => {
    await get('/leaderboard?limit=50&junk=1&final=0490');
    expect([...globalThis.caches.default._m.keys()]).toEqual(['https://collector.test/leaderboard?final=490&limit=50']);
    expect((await get('/all?final=abc')).status).toBe(400);
    expect((await get('/all?final=1e3')).status).toBe(400);
  });
  it('a write still drops the cached board, so the writer sees it at once', async () => {
    await get('/all?x=1');
    await send({ ...GOOD, durationDays: GOOD.durationDays }, { ip: '8.8.8.8', token: TOKEN });
    expect((await (await get('/all?x=2')).json()).count).toBe(2);
  });
  it('misses are counted against READ_LIMITER, hits are free', async () => {
    env.READ_LIMITER = makeLimiter(1);
    expect((await get('/all?final=490')).status).toBe(200);
    expect((await get('/all?final=490&x=1')).status).toBe(200); // a hit: not counted
    expect((await get('/leaderboard')).status).toBe(429); // a second miss from the same address
    expect(env.READ_LIMITER.keys).toEqual(['board|2.2.2.2', 'board|2.2.2.2']);
  });
});

describe('GET /csv is cached and its KV reads are limited', () => {
  const gz = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 1, 2, 3]);
  let id;
  beforeEach(async () => {
    id = (await (await send(GOOD)).json()).id;
    env.SUBMISSIONS._m.set(`csv:${id}`, gz.buffer);
  });
  it('a public whole file is served from the edge after the first read, whatever else the query says', async () => {
    globalThis.caches = { default: makeCache() };
    expect((await get(`/csv?id=${id}`)).status).toBe(200);
    const reads = env.SUBMISSIONS.counts.get;
    const again = await get(`/csv?id=${id}&x=${Math.random()}`);
    expect(again.status).toBe(200);
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(gz);
    expect(env.SUBMISSIONS.counts.get).toBe(reads);
  });
  it('a hidden row is never cached, and hiding drops a cached copy', async () => {
    globalThis.caches = { default: makeCache() };
    const own = (
      await (await send({ ...GOOD, durationDays: GOOD.durationDays }, { ip: '7.7.7.7', token: TOKEN })).json()
    ).id;
    env.SUBMISSIONS._m.set(`csv:${own}`, gz.buffer);
    await get(`/csv?id=${own}`);
    expect(globalThis.caches.default._m.has(`https://collector.test/csv?id=${own}`)).toBe(true);
    await send({ ids: [own], hidden: true }, { path: '/hide', token: TOKEN });
    expect(globalThis.caches.default._m.has(`https://collector.test/csv?id=${own}`)).toBe(false);
    expect((await get(`/csv?id=${own}`)).status).toBe(403);
    expect((await get(`/csv?id=${own}`, { token: TOKEN })).status).toBe(200);
    expect(globalThis.caches.default._m.has(`https://collector.test/csv?id=${own}`)).toBe(false);
  });
  it('counts each read per address, and a file in deltas counts once per two extra reads', async () => {
    env.READ_LIMITER = makeLimiter(120);
    await get(`/csv?id=${id}`);
    expect(env.READ_LIMITER.keys).toEqual(['csv|2.2.2.2']);
    // A CSV so far in 256 deltas: 1 + 100 units (capped), so the second read in a minute is refused.
    const run = 'c'.repeat(16);
    const heavy = (await (await send(GOOD, { ip: '7.7.7.8', token: 'd'.repeat(32) })).json()).id;
    await env.SUBMISSIONS.put(`csv:${heavy}`, new Uint8Array([1, 2]).buffer, {
      metadata: { run, deltas: 256, crc: 0, len: 2 },
    });
    env.READ_LIMITER = makeLimiter(120);
    const first = await get(`/csv?id=${heavy}`, { ip: '3.4.5.6' });
    expect(first.status).not.toBe(429);
    expect(env.READ_LIMITER.keys).toHaveLength(101);
    expect((await get(`/csv?id=${heavy}`, { ip: '3.4.5.6' })).status).toBe(429);
  });
  it('without the binding or a cache, GET /csv works as deployed', async () => {
    const res = await get(`/csv?id=${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/gzip');
  });
});
