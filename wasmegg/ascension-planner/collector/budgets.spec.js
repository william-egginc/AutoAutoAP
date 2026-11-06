/**
 * Red team 6 Nov 2026, C1 and C2/C6: byte and write budgets (budget.js) on /csvd and /answers, and the cron
 * prune. D1 is Node's in-memory SQLite with the real migrations; KV is a Map.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import worker from './worker.js';
import { CSVD_RUN_BYTES, pruneBudgets, spend } from './budget.js';
import { makeD1 } from './d1shim.js';
import { ANSWER_KEEP_DAYS, ANSWER_MAX_TOTAL_BYTES, handleAnswers, pruneAnswers } from './answers.js';

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


const OWNER = 'a'.repeat(32);
const NOW = Date.UTC(2026, 10, 6, 18, 0, 0);
let env;
let seen;
beforeEach(() => {
  seen = 0;
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key', WATCH: makeD1() };
});
const call = (path, init) => worker.fetch(new Request('https://collector.test' + path, init), env);

describe('spend(): one upsert, nothing written past the cap', () => {
  it('adds up to the cap, then refuses without changing the total', async () => {
    expect((await spend(env, 'x|1', 40, 100, NOW, 1e15)).ok).toBe(true);
    expect((await spend(env, 'x|1', 60, 100, NOW, 1e15)).ok).toBe(true);
    expect((await spend(env, 'x|1', 1, 100, NOW, 1e15)).ok).toBe(false);
    expect(env.WATCH._db.prepare("SELECT n FROM follow_rate WHERE key = 'x|1'").get().n).toBe(100);
  });
  it('an amount over the cap on its own is refused on the first call too', async () => {
    expect((await spend(env, 'x|2', 101, 100, NOW, 1e15)).ok).toBe(false);
    expect(env.WATCH._db.prepare("SELECT COUNT(*) AS n FROM follow_rate WHERE key = 'x|2'").get().n).toBe(0);
  });
  it('a new window starts the count over', async () => {
    await spend(env, 'x|3', 100, 100, NOW, 1000);
    expect((await spend(env, 'x|3', 1, 100, NOW + 500, 1000)).ok).toBe(false);
    expect((await spend(env, 'x|3', 100, 100, NOW + 1500, 1000)).ok).toBe(true);
  });
  it('without D1 it lets the request through (the callers keep their other caps)', async () => {
    expect((await spend({}, 'x|4', 5, 1, NOW, 1000)).ok).toBe(true);
  });
});

describe('C1: /csvd has a byte budget per run', () => {
  const RUN = 'ab12cd34ef56ab78';
  const submitProvisional = async () => {
    const res = await call('/submit?quarantine=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1', 'x-owner-token': OWNER },
      body: JSON.stringify({ schema: 7, chain: [400, 490], finalTE: 490, durationDays: 100, provisional: true, csvRun: RUN }),
    });
    return res.json();
  };
  const big = bytes => {
    const b = Buffer.alloc(bytes);
    b.set([0, 0, 255, 255], bytes - 4);
    return b;
  };
  const delta = (token, seq, body, run = RUN) =>
    call(`/csvd?run=${run}&seq=${seq}&len=1&crc=0&count=0`, { method: 'POST', headers: { 'x-upload-token': token, 'cf-connecting-ip': '1.1.1.1' }, body });

  it('eight 8 MB deltas for one run: refused with 413 by the time the run passes its budget, and what was refused is not stored', async () => {
    const sub = await submitProvisional();
    expect(sub.deltaToken).toMatch(/^[a-f0-9]{64}$/);
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await delta(sub.deltaToken, i, big(8 * 1024 * 1024))).status);
    const allowed = Math.floor(CSVD_RUN_BYTES / (8 * 1024 * 1024));
    expect(statuses.slice(0, allowed).every(s => s === 200)).toBe(true);
    expect(statuses[allowed]).toBe(413);
    expect(statuses.slice(allowed).every(s => s === 413)).toBe(true);
    const stored = [...env.SUBMISSIONS._m.keys()].filter(k => k.startsWith('csvd:'));
    expect(stored.length).toBe(allowed);
  });
  it('many small deltas still fit (the real use): 40 of 300 KB', async () => {
    const sub = await submitProvisional();
    for (let i = 0; i < 40; i++) expect((await delta(sub.deltaToken, i, big(300 * 1024))).status).toBe(200);
  });
  it('a day-wide write cap stops a flood of runs: CSVD_DAY_WRITES from the env, 429 with retryAfter', async () => {
    env.CSVD_DAY_WRITES = '3';
    const sub = await submitProvisional();
    for (let i = 0; i < 3; i++) expect((await delta(sub.deltaToken, i, big(1000))).status).toBe(200);
    const res = await delta(sub.deltaToken, 3, big(1000));
    expect(res.status).toBe(429);
    expect((await res.json()).retryAfter).toBeGreaterThan(0);
    expect([...env.SUBMISSIONS._m.keys()].filter(k => k.startsWith('csvd:')).length).toBe(3);
  });
});

describe('the cron drops spent budget rows', () => {
  it('pruneBudgets deletes follow_rate rows older than 3 days and keeps recent ones', async () => {
    await spend(env, 'csvd|old', 1, 10, NOW - 4 * 86_400_000, 1e15);
    await spend(env, 'csvd|new', 1, 10, NOW - 86_400_000, 1e15);
    await pruneBudgets(env, NOW);
    const keys = env.WATCH._db.prepare('SELECT key FROM follow_rate').all().map(r => r.key);
    expect(keys).toEqual(['csvd|new']);
  });
});

describe('C2/C6: answers have a byte budget, a daily new-entry cap, and expire', () => {
  const T0 = NOW;
  const key = n => n.toString(16).padStart(64, '0');
  const gzBody = n => new Uint8Array(zlib.gzipSync(Buffer.from(JSON.stringify({ n, pad: 'x'.repeat(40) }))));
  const put = (k, { e = 'e1', now = T0, body = gzBody(1) } = {}) =>
    handleAnswers(
      new Request(`https://c.example/answers?k=${k}&e=${e}&at=${now}`, { method: 'PUT', headers: { 'content-length': String(body.length) }, body }),
      env,
      now
    );
  const seed = (rows, bytesEach, updated = T0) => {
    const stmt = env.WATCH._db.prepare('INSERT INTO answers (key, e, at, updated, bytes, data) VALUES (?, ?, ?, ?, ?, ?)');
    env.WATCH._db.exec('BEGIN');
    for (let i = 0; i < rows; i++) stmt.run(key(1000 + i), 'e1', T0, updated, bytesEach, 'AAAA');
    env.WATCH._db.exec('COMMIT');
  };

  it('a new key is refused with 429 once the stored bytes reach ANSWER_MAX_TOTAL_BYTES, and nothing is stored', async () => {
    seed(Math.ceil(ANSWER_MAX_TOTAL_BYTES / 60_000) + 1, 60_000);
    const before = env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM answers').get().n;
    const res = await put(key(1));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/full/);
    expect(env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM answers').get().n).toBe(before);
  });
  it('an entry that already exists can still be replaced at the cap (no new bytes held)', async () => {
    expect((await put(key(1))).status).toBe(200);
    seed(Math.ceil(ANSWER_MAX_TOTAL_BYTES / 60_000) + 1, 60_000);
    expect((await put(key(1), { now: T0 + 1000 })).status).toBe(200);
  });
  it('under the cap a new key is fine', async () => {
    seed(10, 60_000);
    expect((await put(key(1))).status).toBe(200);
  });
  it('ANSWERS_NEW_PER_DAY limits new entries a day for the whole collector; replacing one is free', async () => {
    env.ANSWERS_NEW_PER_DAY = '2';
    expect((await put(key(1))).status).toBe(200);
    expect((await put(key(2))).status).toBe(200);
    const res = await put(key(3));
    expect(res.status).toBe(429);
    expect((await res.json()).retryAfter).toBeGreaterThan(0);
    expect((await put(key(1), { now: T0 + 5000 })).status).toBe(200);
    expect((await put(key(3), { now: T0 + 86_400_001 })).status).toBe(200);
  });
  it('an `at` more than 10 minutes ahead of the collector clock is 400 (QA C4c, answers too), 9 minutes is fine', async () => {
    const send = at => handleAnswers(new Request(`https://c.example/answers?k=${key(1)}&e=e1&at=${at}`, { method: 'PUT', headers: { 'content-length': String(gzBody(1).length) }, body: gzBody(1) }), env, T0);
    const res = await send(T0 + 365 * 86_400_000);
    expect(res.status).toBe(400);
    expect((await res.json()).problems.join(' ')).toMatch(/at /);
    expect((await send(T0 + 11 * 60_000)).status).toBe(400);
    expect((await send(T0 + 9 * 60_000)).status).toBe(200);
  });
  it('pruneAnswers drops entries not written for ANSWER_KEEP_DAYS and keeps the rest', async () => {
    seed(3, 1000, T0 - (ANSWER_KEEP_DAYS + 1) * 86_400_000);
    env.WATCH._db.prepare('INSERT INTO answers (key, e, at, updated, bytes, data) VALUES (?, ?, ?, ?, ?, ?)').run(key(1), 'e1', T0, T0 - 86_400_000, 1000, 'AAAA');
    await pruneAnswers(env, T0);
    expect(env.WATCH._db.prepare('SELECT key FROM answers').all().map(r => r.key)).toEqual([key(1)]);
  });
});

describe('KV and D1 quotas: daily bytes and rows across the anonymous write paths (Jordan 6 Nov)', () => {
  const submit = async (extra, n) =>
    (
      await call('/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': `7.0.${n >> 8}.${n & 255}`, 'x-owner-token': String(n).padStart(32, 'e') },
        body: JSON.stringify({ schema: 3, chain: [195, 490], durationDays: 700 + n, finalTE: 490, ...extra }),
      })
    ).json();
  const gzCsv = bytes => {
    const b = Buffer.concat([Buffer.from(zlib.gzipSync(Buffer.from('a,b\n1,2\n'))), Buffer.alloc(bytes)]);
    return b;
  };
  const postCsv = (id, token, body) => call(`/csv?id=${id}`, { method: 'POST', headers: { 'x-upload-token': token, 'cf-connecting-ip': '7.9.9.9' }, body });

  it('a csvd delta is stored with an expiry, so KV drops it without a delete (the sweep deletes only 20 a day)', async () => {
    const sub = await (await call('/submit?quarantine=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1', 'x-owner-token': OWNER },
      body: JSON.stringify({ schema: 7, chain: [400, 490], finalTE: 490, durationDays: 100, provisional: true, csvRun: 'ab12cd34ef56ab78' }),
    })).json();
    const body = Buffer.alloc(1000);
    body.set([0, 0, 255, 255], 996);
    expect((await call('/csvd?run=ab12cd34ef56ab78&seq=0&len=1&crc=0&count=0', { method: 'POST', headers: { 'x-upload-token': sub.deltaToken, 'cf-connecting-ip': '1.1.1.1' }, body })).status).toBe(200);
    const ttl = env.SUBMISSIONS._ttl.get('csvd:ab12cd34ef56ab78:0');
    expect(ttl).toBeGreaterThan(86_400);
    expect(ttl).toBeLessThanOrEqual(14 * 86_400);
  });
  it('CSV_DAY_BYTES caps the CSV bytes written to KV in a day across /csv and /csvd: 429 with retryAfter, nothing stored', async () => {
    env.CSV_DAY_BYTES = String(3 * 1024 * 1024);
    const a = await submit({}, 1);
    const b = await submit({}, 2);
    expect(a.uploadToken).toBeTruthy();
    expect((await postCsv(a.id, a.uploadToken, gzCsv(2 * 1024 * 1024))).status).toBe(200);
    const res = await postCsv(b.id, b.uploadToken, gzCsv(2 * 1024 * 1024));
    expect(res.status).toBe(429);
    expect((await res.json()).retryAfter).toBeGreaterThan(0);
    expect(env.SUBMISSIONS._m.has(`csv:${b.id}`)).toBe(false);
  });
  it('SUBMITS_PER_DAY caps new rows a day for the whole collector (each costs about 3 KV writes): 429, nothing stored', async () => {
    env.SUBMITS_PER_DAY = '2';
    expect((await submit({}, 11)).ok).toBe(true);
    expect((await submit({}, 12)).ok).toBe(true);
    const before = env.SUBMISSIONS._m.size;
    const res = await call('/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '7.0.0.13', 'x-owner-token': '13'.padStart(32, 'e') },
      body: JSON.stringify({ schema: 3, chain: [195, 490], durationDays: 713, finalTE: 490 }),
    });
    expect(res.status).toBe(429);
    expect((await res.json()).retryAfter).toBeGreaterThan(0);
    expect(env.SUBMISSIONS._m.size).toBe(before);
  });
});
