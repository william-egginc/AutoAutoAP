/**
 * MIN_BUILD_STAMP (6 Nov 2026, Jordan via the orchestrator): the collector refuses writes from a page built
 * before the cutoff, or an old page that sent no build stamp, with 426 and a plain message the old client shows as it is.
 * Off when the var is unset. Gated where a stamp is sent: /submit (body.build), /instant (record.build) and
 * /follow (value.build). /csv, /csvd and /bigcsv carry none and need tokens that only an accepted /submit issues;
 * /prefs, /answers, /claim and /hide send no stamp (and a pre-R5 build never calls /follow, /prefs or /answers).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import worker from './worker.js';
import { handleFollow } from './follow.js';
import { makeD1 } from './d1shim.js';

function makeKV() {
  const m = new Map();
  const meta = new Map();
  return {
    _m: m,
    _meta: meta,
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async getWithMetadata(k, type) {
      const value = await this.get(k, type);
      return { value, metadata: value !== null && meta.has(k) ? meta.get(k) : null };
    },
    async put(k, v, opts) {
      m.set(k, v);
      (this._ttl ||= new Map()).set(k, opts && opts.expirationTtl);
      if (opts && opts.metadata) meta.set(k, opts.metadata);
      else meta.delete(k);
    },
    async delete(k) {
      m.delete(k);
      meta.delete(k);
    },
    async list({ prefix, limit }) {
      const keys = [...m.keys()]
        .filter(k => k.startsWith(prefix))
        .sort()
        .slice(0, limit);
      return {
        keys: keys.map(name => (meta.has(name) ? { name, metadata: meta.get(name) } : { name })),
        list_complete: true,
      };
    },
  };
}



const CUT = '2026-10-23T00:00:00.000Z';
const MESSAGE = 'This page is an old version: reload to send.';
const T = Math.floor(Date.UTC(2026, 10, 6, 18, 0, 0) / 1000);
const TOKEN_A = 'a'.repeat(32);
let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key', WATCH: makeD1(), MIN_BUILD_STAMP: CUT };
});
const call = (path, init) => worker.fetch(new Request('https://collector.test' + path, init), env);
let n = 0;
const submitWith = (extra = {}, remove = []) => {
  const body = { schema: 3, chain: [195, 490], durationDays: 700 + ++n, finalTE: 490, build: '2026-11-04T17:18:24.914Z', ...extra };
  for (const k of remove) delete body[k];
  return call('/submit', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `9.0.${n >> 8}.${n & 255}`, 'x-owner-token': TOKEN_A }, body: JSON.stringify(body) });
};
const kvKeys = () => [...env.SUBMISSIONS._m.keys()];

describe('/submit', () => {
  it('is off when MIN_BUILD_STAMP is unset: an old build, and no build at all, send as before', async () => {
    delete env.MIN_BUILD_STAMP;
    expect((await submitWith({ build: '2026-09-01T00:00:00.000Z' })).status).toBe(200);
    expect((await submitWith({}, ['build'])).status).toBe(200);
  });
  it('refuses a build before the cutoff with 426, the plain message, and stores nothing', async () => {
    const res = await submitWith({ build: '2026-10-22T22:40:38.224Z' });
    expect(res.status).toBe(426);
    const body = await res.json();
    expect(body.problems).toEqual([MESSAGE]);
    expect(body.reload).toBe(true);
    expect(kvKeys()).toEqual([]);
  });
  it('refuses an old page that sent no stamp (schema 6 and below never sent one)', async () => {
    expect((await submitWith({ schema: 6 }, ['build'])).status).toBe(426);
    expect((await submitWith({ schema: 3, build: '' })).status).toBe(426);
    expect(kvKeys()).toEqual([]);
  });
  it('does not refuse a current page that sends no stamp: the Insights upload page omits build (schema 7 and up)', async () => {
    expect((await submitWith({ schema: 7 }, ['build'])).status).toBe(200);
    expect((await submitWith({ schema: 7, nickname: 'Upload page' }, ['build'])).status).toBe(200);
  });
  it('takes the cutoff itself and anything newer, and refuses the millisecond before it', async () => {
    expect((await submitWith({ build: '2026-10-22T23:59:59.999Z' })).status).toBe(426);
    expect((await submitWith({ build: CUT })).status).toBe(200);
    expect((await submitWith({ build: '2026-11-04T17:18:24.914Z' })).status).toBe(200);
  });
  it("leaves Release 5's live build (2026-10-23T00:13:48Z) and every later one alone, and turns away its pre-release betas", async () => {
    for (const b of ['2026-10-23T00:13:48.665Z', '2026-10-23T00:13:48Z', '2026-10-23T20:22:40.094Z', '2026-10-29T23:42:48.618Z']) {
      expect((await submitWith({ build: b })).status).toBe(200);
    }
    for (const b of ['2026-10-22T22:40:38.224Z', '2026-10-22T15:23:02.962Z', '2026-10-20T00:39:29.592Z', '2026-10-16T21:28:40.089Z']) {
      expect((await submitWith({ build: b })).status).toBe(426);
    }
  });
  it('does not judge a stamp that is not a date (a build named by its commit)', async () => {
    expect((await submitWith({ build: 'abc1234' })).status).toBe(200);
  });
  it('a raised cutoff refuses what the old one allowed', async () => {
    env.MIN_BUILD_STAMP = '2026-11-04T17:18:24.000Z';
    expect((await submitWith({ build: '2026-10-29T23:42:48.618Z' })).status).toBe(426);
    expect((await submitWith({ build: '2026-11-04T17:18:24.914Z' })).status).toBe(200);
  });
  it('an unreadable cutoff is off, not a collector that refuses everyone', async () => {
    env.MIN_BUILD_STAMP = 'soon';
    expect((await submitWith({ build: '2026-09-01T00:00:00.000Z' })).status).toBe(200);
  });
});

describe('/instant', () => {
  const RECORD = {
    v: 1,
    build: 'abc1234',
    mode: 'fastest',
    target: 490,
    planStart: T,
    timezone: 'America/Denver',
    backupTime: T - 7200,
    backupAgeHours: 2,
    currentTE: 201,
    backupTE: 201,
    clothedTE: 247.3,
    gear: {
      stamp: '0123456789abcdef01234567',
      answer: 'maxed',
      earningsShort: 24.1,
      deliveryScale: 0.9712,
      adjusted: true,
      progressionShort: false,
      tableFrom: 120,
      bracket: { above: { gear: 'table.bin 128.7/1.000', end: T + 9e6, te: 490 }, below: null },
    },
    stall: { cte: 247.3, clears: 225, belowLine: false, integrityHours: 0.4, notice: 'none' },
    settings: {
      firstAscension: 'auto',
      maxAscensions: null,
      inHours: false,
      window: null,
      holdShifts: true,
      tryAtOnce: false,
      timeOff: 0,
      milestones: 0,
      small: false,
    },
    instant: {
      chain: [206, 490],
      end: T + 9e6,
      endTE: 490,
      legs: [
        { to: 206, endTE: 206.2, start: T, end: T + 1e5, label: 'continue', sales: 0, tier13: false },
        { to: 490, endTE: 490, start: T + 1e5, end: T + 9e6, label: '2-sale-tier13', sales: 2, tier13: true },
      ],
    },
    rows: [{ n: 2, chain: [206, 490], iEnd: T + 9e6, xEnd: T + 9.1e6, xTE: 490 }],
    exact: {
      chain: [206, 490],
      end: T + 9.1e6,
      endTE: 490,
      handoff: 'hour',
      firstLeg: 'continue',
      firstLegOtherHours: 31.5,
      legs: [
        { te: 206.2, start: T, days: 1.2, strategy: 'continue', tier13: false, peakQph: 4.564, holdHours: 0, delayHours: 0 },
        { te: 490, start: T + 1e5, days: 104, strategy: '2-sale-tier13', sales: 2, tier13: true, peakQph: 6.06, holdHours: 1.5, delayHours: 0 },
      ],
    },
    buildGap: { contQph: 4.564, freshQph: 6.06, ratio: 0.753, freshLeg: 2 },
    checkSeconds: 41.2,
  };
  const instant = rec => call('/instant', { method: 'POST', headers: { 'content-type': 'application/json', 'x-owner-token': TOKEN_A, 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify(rec) });
  it('refuses an old build with 426 and the message, counts nothing and stores nothing', async () => {
    const res = await instant({ ...RECORD, build: '2026-10-22T22:40:38.224Z' });
    expect(res.status).toBe(426);
    expect((await res.json()).problems).toEqual([MESSAGE]);
    expect(kvKeys()).toEqual([]);
  });
  it('lets a record with no build through: the app leaves it out only when it has no build time (current pages always have one)', async () => {
    const { build, ...rest } = RECORD;
    expect((await instant(rest)).status).toBe(200);
  });
  it("takes Release 5's build and refuses the minute before the cutoff", async () => {
    expect((await instant({ ...RECORD, build: '2026-10-23T00:13:48.665Z' })).status).toBe(200);
    expect((await instant({ ...RECORD, build: '2026-10-22T23:59:00.000Z', planStart: T + 9 })).status).toBe(426);
  });
  it('takes a new build, and a non-date build is not judged', async () => {
    expect((await instant({ ...RECORD, build: '2026-11-04T17:18:24.914Z' })).status).toBe(200);
    expect((await instant({ ...RECORD, build: 'abc1234', planStart: T + 5 })).status).toBe(200);
  });
});

describe('/follow', () => {
  const K = 'c'.repeat(64);
  const put = value =>
    handleFollow(new Request('https://c.example/follow', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: K, goal: 'race490', value }) }), env, Date.UTC(2026, 10, 6, 18, 0, 0));
  const value = extra => ({ chain: [196, 312], planStart: 1792800000, source: 'exact', at: Date.UTC(2026, 10, 6, 17, 59, 0), ...extra });
  it('refuses a value stamped with an old build (426, the message), and takes a new one or none', async () => {
    const res = await put(value({ build: '2026-10-22T22:40:38.224Z' }));
    expect(res.status).toBe(426);
    expect((await res.json()).problems).toEqual([MESSAGE]);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM follows').get().n).toBe(0);
    expect((await put(value({ build: '2026-11-04T17:18:24.914Z' }))).status).toBe(200);
    expect((await put(value({ chain: [1, 2] }))).status).toBe(200);
  });
  it('is off without the var', async () => {
    delete env.MIN_BUILD_STAMP;
    expect((await put(value({ build: '2026-10-22T22:40:38.224Z' }))).status).toBe(200);
  });
});
