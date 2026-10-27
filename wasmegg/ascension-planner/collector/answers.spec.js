/**
 * "Instant answers in the cloud" (answers.js): the contract in ~/code/aaap-tools/notes/instantcloud-contract.md. D1 is
 * Node's in-memory SQLite behind D1's prepare/bind/first/all/run shape with the real migrations applied.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import worker from './worker.js';
import { ANSWER_MAX_BYTES, ANSWER_MAX_ENTRIES, ANSWER_MAX_TOTAL, handleAnswers } from './answers.js';

const MIGRATIONS = readdirSync(new URL('./migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(`./migrations/${f}`, import.meta.url), 'utf8'));
function makeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) db.exec(m);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    async first() { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
    async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })), success: true }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: sql => statement(sql), _db: db };
}

const K = 'e'.repeat(64);
const K2 = 'f'.repeat(64);
const T0 = Date.UTC(2026, 9, 27, 18, 0, 0);
const E = 'sv9f3a21c4.setup7.tbl-2026-10-21.rules3';
const RECORD = { answer: { chain: [196, 225, 251, 283, 312], finish: 1815500000 }, rows: Array.from({ length: 200 }, (_, i) => ({ i, v: i * 7 })) };
const gz = obj => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(obj))));

let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});

const q = (k, e, at) => `k=${k}${e ? `&e=${e}` : ''}${at ? `&at=${at}` : ''}`;
const put = (bytes, { k = K, e = E, at = T0, now = T0, headers = {} } = {}) =>
  handleAnswers(new Request(`https://c.example/answers?${q(k, e, at)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length), ...headers }, body: bytes }), env, now);
const list = (k = K, now = T0) => handleAnswers(new Request(`https://c.example/answers?k=${k}`), env, now);
const one = (e = E, k = K) => handleAnswers(new Request(`https://c.example/answers/get?${q(k, e)}`), env);
const count = () => env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM answers').get().n;

describe('PUT, list and get', () => {
  it('stores a gzip record, lists it without the body, and returns the very bytes', async () => {
    const bytes = gz(RECORD);
    const res = await put(bytes);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updatedAt: T0 });
    const body = await (await list(K, T0 + 5)).json();
    expect(body.entries).toEqual([{ e: E, at: T0, bytes: bytes.length, updatedAt: T0 }]);
    expect(body.now).toBe(T0 + 5);
    const got = await one();
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('application/octet-stream');
    expect(got.headers.get('content-encoding')).toBeNull();
    expect(got.headers.get('x-answer-at')).toBe(String(T0));
    expect(got.headers.get('x-answer-updated')).toBe(String(T0));
    expect(got.headers.get('access-control-expose-headers')).toMatch(/x-answer-at/);
    const back = new Uint8Array(await got.arrayBuffer());
    expect(Buffer.compare(Buffer.from(back), Buffer.from(bytes))).toBe(0);
    expect(JSON.parse(gunzipSync(Buffer.from(back)).toString())).toEqual(RECORD);
  });

  it('keeps a record near the cap intact (the base64 round trip)', async () => {
    const big = new Uint8Array(ANSWER_MAX_BYTES);
    big.set([0x1f, 0x8b], 0);
    for (let i = 2; i < big.length; i++) big[i] = (i * 31) % 256;
    expect((await put(big)).status).toBe(200);
    const back = new Uint8Array(await (await one()).arrayBuffer());
    expect(Buffer.compare(Buffer.from(back), Buffer.from(big))).toBe(0);
  });

  it('replaces an entry with the same key (last write wins) and another key sees nothing', async () => {
    await put(gz({ v: 1 }), { at: T0 });
    await put(gz({ v: 2 }), { at: T0 + 1000, now: T0 + 1000 });
    expect(count()).toBe(1);
    const entry = (await (await list()).json()).entries[0];
    expect(entry).toMatchObject({ at: T0 + 1000, updatedAt: T0 + 1000 });
    expect(JSON.parse(gunzipSync(Buffer.from(await (await one()).arrayBuffer())).toString())).toEqual({ v: 2 });
    expect((await (await list(K2)).json()).entries).toEqual([]);
    expect((await one(E, K2)).status).toBe(404);
  });

  it('deletes an entry, and deleting an absent one is fine', async () => {
    await put(gz({ v: 1 }));
    const del = () => handleAnswers(new Request(`https://c.example/answers?${q(K, E)}`, { method: 'DELETE' }), env, T0);
    expect((await del()).status).toBe(200);
    expect(count()).toBe(0);
    expect((await del()).status).toBe(200);
  });
});

describe('at most 8 entries per key', () => {
  it('evicts the least recently written when a ninth arrives, and says so', async () => {
    for (let i = 1; i <= ANSWER_MAX_ENTRIES; i++) expect((await put(gz({ i }), { e: `e${i}`, now: T0 + i * 1000 })).status).toBe(200);
    expect(count()).toBe(8);
    const res = await put(gz({ i: 9 }), { e: 'e9', now: T0 + 9000 });
    expect(await res.json()).toEqual({ ok: true, updatedAt: T0 + 9000, evicted: 1 });
    const es = (await (await list(K, T0 + 9000)).json()).entries.map(x => x.e);
    expect(es).toEqual(['e9', 'e8', 'e7', 'e6', 'e5', 'e4', 'e3', 'e2']);
    // Rewriting an old entry makes it new again.
    await put(gz({ i: 2 }), { e: 'e2', now: T0 + 10_000 });
    expect((await (await list(K, T0 + 10_000)).json()).entries[0].e).toBe('e2');
  });
});

describe('validation', () => {
  it.each([
    ['a short key', { k: 'abc' }],
    ['an upper-case key', { k: 'E'.repeat(64) }],
    ['a bad entry key', { e: 'has space' }],
    ['an entry key of 97 characters', { e: 'x'.repeat(97) }],
    ['at in seconds', { at: 1792800000 }],
    ['no at', { at: '' }],
  ])('refuses %s with 400', async (_n, over) => {
    const res = await handleAnswers(
      new Request(`https://c.example/answers?k=${over.k ?? K}&e=${over.e ?? E}&at=${over.at === undefined ? T0 : over.at}`, { method: 'PUT', headers: { 'content-length': '30' }, body: gz({ a: 1 }) }),
      env,
      T0
    );
    expect(res.status).toBe(400);
    expect(count()).toBe(0);
  });

  it('refuses a body that is not gzip, an empty one, and one over 64 KB (413); 411 without content-length', async () => {
    expect((await put(new TextEncoder().encode('{"not":"gzip, just json text here"}'))).status).toBe(400);
    expect((await put(new Uint8Array(0))).status).toBe(400);
    const big = new Uint8Array(ANSWER_MAX_BYTES + 1);
    big.set([0x1f, 0x8b]);
    expect((await put(big)).status).toBe(413);
    // The declared length alone is enough to refuse, before the body is read.
    expect((await put(gz({ a: 1 }), { headers: { 'content-length': String(ANSWER_MAX_BYTES + 5) } })).status).toBe(413);
    const noLen = await handleAnswers(new Request(`https://c.example/answers?${q(K, E, T0)}`, { method: 'PUT', body: undefined }), env, T0);
    expect(noLen.status).toBe(411);
    expect(count()).toBe(0);
  });

  it('refuses a player id in the query, even in the entry key', async () => {
    expect((await handleAnswers(new Request(`https://c.example/answers?k=${K}&e=EI1234567890123456`), env, T0)).status).toBe(400);
    expect((await put(gz({ a: 1 }), { e: 'ei1234567890123456' })).status).toBe(400);
    expect(count()).toBe(0);
  });
});

describe('limits', () => {
  it('takes 30 writes an hour per key, then 429 with the wait; a new hour and another key are fine; /follow and /prefs budgets are separate', async () => {
    for (let i = 0; i < 30; i++) expect((await put(gz({ i }), { e: `e${i % 8}`, now: T0 + i * 1000 })).status).toBe(200);
    const over = await put(gz({ x: 1 }), { now: T0 + 40_000 });
    expect(over.status).toBe(429);
    const body = await over.json();
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(over.headers.get('retry-after')).toBe(String(body.retryAfter));
    expect((await put(gz({ x: 1 }), { k: K2, now: T0 + 40_000 })).status).toBe(200);
    expect((await put(gz({ x: 2 }), { now: T0 + 3_700_000 })).status).toBe(200);
    const keys = env.WATCH._db.prepare("SELECT key FROM follow_rate").all().map(r => r.key);
    expect(keys).toContain(`answers|${K}`);
    expect(keys.every(k => k.startsWith('answers|'))).toBe(true);
  });

  it('refuses a new entry when the table is full, but lets an existing one be replaced', async () => {
    const stmt = env.WATCH._db.prepare("INSERT INTO answers (key, e, at, updated, bytes, data) VALUES (?, 'x', 1, 1, 1, 'AA==')");
    env.WATCH._db.exec('BEGIN');
    for (let i = 0; i < ANSWER_MAX_TOTAL; i++) stmt.run(i.toString(16).padStart(64, '0'));
    env.WATCH._db.exec('COMMIT');
    expect((await put(gz({ a: 1 }))).status).toBe(429);
    expect((await put(gz({ a: 1 }), { k: '0'.repeat(64), e: 'x', now: T0 })).status).toBe(200);
  });

  it('refuses over the per-address edge limit before touching D1; no binding means no limit; 503 without D1', async () => {
    const calls = [];
    env.FOLLOW_LIMIT = { async limit({ key }) { calls.push(key); return { success: calls.length <= 1 }; } };
    expect((await list()).status).toBe(200);
    expect((await list()).status).toBe(429);
    expect(calls[0]).toBe('follow-answers-get|unknown');
    env.FOLLOW_LIMIT = { limit: async () => { throw new Error('down'); } };
    expect((await list()).status).toBe(200);
    env = {};
    expect((await list()).status).toBe(503);
  });
});

describe('through the Worker', () => {
  const through = (path, init = {}) => worker.fetch(new Request(`https://collector.test${path}`, init), { SUBMISSIONS: { async get() { return null; } }, ...env });

  it('answers the preflight, routes the four calls, and leaves /follow and /prefs alone', async () => {
    const pre = await through('/answers', { method: 'OPTIONS', headers: { origin: 'https://egg.example', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' } });
    expect(pre.status).toBe(200);
    expect(pre.headers.get('access-control-allow-methods')).toMatch(/PUT.*DELETE|DELETE.*PUT/);
    const bytes = gz(RECORD);
    const w = await through(`/answers?${q(K, E, T0)}`, { method: 'PUT', headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) }, body: bytes });
    expect(w.status).toBe(200);
    expect((await (await through(`/answers?k=${K}`)).json()).entries).toHaveLength(1);
    expect((await through(`/answers/get?${q(K, E)}`)).status).toBe(200);
    expect((await through(`/answers?${q(K, E)}`, { method: 'DELETE' })).status).toBe(200);
    expect(await (await through(`/follow?k=${K}`)).json()).toEqual({ goals: {}, now: expect.any(Number) });
    expect(await (await through(`/prefs?k=${K}`)).json()).toEqual({ prefs: {}, now: expect.any(Number) });
  });
});
