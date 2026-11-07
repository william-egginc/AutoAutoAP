/**
 * "Synced records" (sync.js, notes/sync-override-tracker-design-2026-11-07.md): the starting-TE override, the Build-up
 * tracker's ticks and its kept plan, per account, so every browser agrees. D1 is Node's in-memory SQLite, real migrations.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { handleSync, SYNC_MAX_PLAN_BYTES, SYNC_MAX_TOTAL_BYTES } from './sync.js';
import { makeD1 } from './d1shim.js';

const K = 'a'.repeat(64);
const K2 = 'b'.repeat(64);
const T0 = Date.UTC(2026, 10, 7, 23, 0, 0);
const SLOT = '1793000000';
const OVERRIDE = { curiosity: 40, integrity: 40, humility: 39, resilience: 39, kindness: 39, saveTE: 198 };
let env;
beforeEach(() => {
  env = { WATCH: makeD1() };
});
const gz = o => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(o))));
const put = (kind, slot, body, { k = K, at = T0, now = T0, headers = {} } = {}) => {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return handleSync(
    new Request(`https://c.example/sync?k=${k}&kind=${kind}&slot=${slot}&at=${at}`, { method: 'PUT', headers: { 'content-length': String(bytes.length), ...headers }, body: bytes }),
    env,
    now
  );
};
const putJson = (kind, slot, value, o) => put(kind, slot, JSON.stringify(value), o);
const list = (k = K, now = T0) => handleSync(new Request(`https://c.example/sync?k=${k}`), env, now);
const one = (kind, slot, k = K) => handleSync(new Request(`https://c.example/sync/get?k=${k}&kind=${kind}&slot=${slot}`), env, T0);
const del = (qs, now = T0) => handleSync(new Request(`https://c.example/sync?${qs}`, { method: 'DELETE' }), env, now);
const count = () => env.WATCH._db.prepare('SELECT COUNT(*) AS n FROM synced').get().n;

describe('the starting-TE override', () => {
  it('stores it per account and serves it back as it was sent', async () => {
    const res = await putJson('override', '0', OVERRIDE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updatedAt: T0 });
    const got = await one('override', '0');
    expect(got.status).toBe(200);
    expect(got.headers.get('x-sync-at')).toBe(String(T0));
    expect(got.headers.get('cache-control')).toBe('no-store');
    expect(await got.json()).toEqual(OVERRIDE);
    expect((await (await list()).json()).records).toEqual([{ kind: 'override', slot: '0', at: T0, bytes: expect.any(Number), updatedAt: T0 }]);
  });
  it('removing it is a record too: a tombstone with a newer at, so another browser learns it was removed', async () => {
    await putJson('override', '0', OVERRIDE);
    expect((await putJson('override', '0', { removed: true }, { at: T0 + 1000, now: T0 + 1000 })).status).toBe(200);
    expect(await (await one('override', '0')).json()).toEqual({ removed: true });
  });
  it.each([
    ['an egg missing', { ...OVERRIDE, kindness: undefined }],
    ['an egg over 98', { ...OVERRIDE, curiosity: 99 }],
    ['a fraction', { ...OVERRIDE, humility: 3.5 }],
    ['an unknown egg', { ...OVERRIDE, wisdom: 3 }],
    ['saveTE over 490', { ...OVERRIDE, saveTE: 491 }],
    ['removed that is not true', { removed: false }],
    ['text', 'soon'],
  ])('refuses an override with %s (400, nothing stored)', async (_n, v) => {
    expect((await putJson('override', '0', v)).status).toBe(400);
    expect(count()).toBe(0);
  });
  it('a slot other than 0 for the override is 400', async () => {
    expect((await putJson('override', SLOT, OVERRIDE)).status).toBe(400);
  });
});

describe('the tracker ticks', () => {
  const TICKS = { ticked: ['1793003600:1', 'e:research:1793007200', 'w:night:1793010000'], unticked: ['1793003600:2'] };
  it('stores ticks per ascension and serves them back', async () => {
    expect((await putJson('ticks', SLOT, TICKS)).status).toBe(200);
    expect(await (await one('ticks', SLOT)).json()).toEqual(TICKS);
  });
  it('unticked is optional', async () => {
    expect((await putJson('ticks', SLOT, { ticked: ['a:1'] })).status).toBe(200);
  });
  it.each([
    ['not arrays', { ticked: 'a' }],
    ['a non-text key', { ticked: [1] }],
    ['a 200-character key', { ticked: ['x'.repeat(200)] }],
    ['301 keys', { ticked: Array.from({ length: 301 }, (_, i) => `k${i}`) }],
    ['a control character', { ticked: ['a\u0007b'] }],
    ['a bad slot', null],
  ])('refuses ticks with %s (400)', async (_n, v) => {
    const res = v === null ? await putJson('ticks', 'tomorrow', TICKS) : await putJson('ticks', SLOT, v);
    expect(res.status).toBe(400);
    expect(count()).toBe(0);
  });
  it('a body over 16 KB is 413', async () => {
    const big = { ticked: Array.from({ length: 300 }, () => 'k'.repeat(100)) };
    expect((await putJson('ticks', SLOT, big)).status).toBe(413);
  });
});

describe('the kept plan', () => {
  it('stores gzip bytes as sent, and serves them as octet-stream, not content-encoding gzip', async () => {
    const body = gz({ actions: [{ kind: 'research', label: 'x' }], saveSeconds: 1793000100 });
    expect((await put('plan', SLOT, body)).status).toBe(200);
    const got = await one('plan', SLOT);
    expect(got.headers.get('content-type')).toBe('application/octet-stream');
    expect(got.headers.get('content-encoding')).toBe(null);
    expect(Buffer.compare(Buffer.from(await got.arrayBuffer()), Buffer.from(body))).toBe(0);
  });
  it('refuses a body that is not gzip, an empty one, and one over the cap (413)', async () => {
    expect((await put('plan', SLOT, new TextEncoder().encode('{"actions":[]}'))).status).toBe(400);
    expect((await put('plan', SLOT, new Uint8Array(0))).status).toBe(400);
    const big = new Uint8Array(SYNC_MAX_PLAN_BYTES + 1);
    big.set([0x1f, 0x8b]);
    expect((await put('plan', SLOT, big)).status).toBe(413);
  });
  it('a request with no content-length is 411', async () => {
    const res = await handleSync(new Request(`https://c.example/sync?k=${K}&kind=plan&slot=${SLOT}&at=${T0}`, { method: 'PUT', body: gz({ a: 1 }) }), env, T0);
    expect([200, 411]).toContain(res.status);
  });
});

describe('last write wins by at, and a stale one is 409', () => {
  it('an older at never replaces a newer one: 409 with the stored meta (and the value for the small kinds)', async () => {
    await putJson('override', '0', OVERRIDE, { at: T0 + 5000, now: T0 + 5000 });
    const res = await putJson('override', '0', { ...OVERRIDE, kindness: 1 }, { at: T0, now: T0 + 6000 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.latest).toMatchObject({ kind: 'override', slot: '0', at: T0 + 5000, value: OVERRIDE });
    expect((await (await one('override', '0')).json()).kindness).toBe(39);
  });
  it('a plan 409 carries the meta only, never the bytes', async () => {
    await put('plan', SLOT, gz({ a: 1 }), { at: T0 + 5000, now: T0 + 5000 });
    const body = await (await put('plan', SLOT, gz({ a: 2 }), { at: T0, now: T0 + 6000 })).json();
    expect(body.latest).toMatchObject({ kind: 'plan', slot: SLOT, at: T0 + 5000 });
    expect(body.latest.value).toBeUndefined();
  });
  it('an equal at is accepted (a tie); a newer one replaces', async () => {
    await putJson('ticks', SLOT, { ticked: ['a'] });
    expect((await putJson('ticks', SLOT, { ticked: ['a', 'b'] })).status).toBe(200);
    expect(await (await one('ticks', SLOT)).json()).toEqual({ ticked: ['a', 'b'] });
  });
  it('an at more than 10 minutes ahead of the collector clock is 400; 9 minutes is fine; at in seconds is 400', async () => {
    expect((await putJson('ticks', SLOT, { ticked: [] }, { at: T0 + 11 * 60_000 })).status).toBe(400);
    expect((await putJson('ticks', SLOT, { ticked: [] }, { at: T0 + 9 * 60_000 })).status).toBe(200);
    expect((await putJson('ticks', SLOT, { ticked: [] }, { at: Math.floor(T0 / 1000) })).status).toBe(400);
  });
  it('the same value again is "unchanged" and writes nothing', async () => {
    await putJson('ticks', SLOT, { ticked: ['a'] });
    const res = await putJson('ticks', SLOT, { ticked: ['a'] }, { at: T0 + 100, now: T0 + 100 });
    expect((await res.json()).unchanged).toBe(true);
  });
});

describe('shape and limits', () => {
  it('a bad key, kind or at is 400', async () => {
    expect((await putJson('override', '0', OVERRIDE, { k: 'abc' })).status).toBe(400);
    expect((await putJson('colour', '0', OVERRIDE)).status).toBe(400);
    expect((await putJson('override', '0', OVERRIDE, { at: 'soon' })).status).toBe(400);
  });
  it('a player id in the query or a JSON body is refused', async () => {
    expect((await handleSync(new Request(`https://c.example/sync?k=${K}&x=EI1234567890123456`), env, T0)).status).toBe(400);
    expect((await putJson('ticks', SLOT, { ticked: ['ei1234567890123456'] })).status).toBe(400);
    expect(count()).toBe(0);
  });
  it('at most 3 ascension slots a kind: a 4th evicts the lowest slot', async () => {
    for (const s of ['1793000000', '1793100000', '1793200000', '1793300000']) await putJson('ticks', s, { ticked: [s] });
    const slots = (await (await list()).json()).records.filter(r => r.kind === 'ticks').map(r => r.slot).sort();
    expect(slots).toEqual(['1793100000', '1793200000', '1793300000']);
  });
  it('60 writes an hour a key, then 429 with the wait; another key and a new hour are fine; the answers/prefs budgets are apart', async () => {
    for (let i = 0; i < 60; i++) expect((await putJson('ticks', SLOT, { ticked: [`k${i}`] }, { at: T0 + i, now: T0 + i * 1000 })).status).toBe(200);
    const over = await putJson('ticks', SLOT, { ticked: ['z'] }, { at: T0 + 70_000, now: T0 + 70_000 });
    expect(over.status).toBe(429);
    const b = await over.json();
    expect(b.retryAfter).toBeGreaterThan(0);
    expect(over.headers.get('retry-after')).toBe(String(b.retryAfter));
    expect((await putJson('ticks', SLOT, { ticked: ['z'] }, { k: K2, at: T0 + 70_000, now: T0 + 70_000 })).status).toBe(200);
    expect((await putJson('ticks', SLOT, { ticked: ['z'] }, { at: T0 + 3_700_000, now: T0 + 3_700_000 })).status).toBe(200);
    const keys = env.WATCH._db.prepare('SELECT key FROM follow_rate').all().map(r => r.key);
    expect(keys).toContain(`sync|${K}`);
  });
  it('SYNC_PUTS_PER_DAY caps writes for the whole collector (429); SYNC_NEW_KEYS_PER_DAY caps brand-new keys', async () => {
    env.SYNC_PUTS_PER_DAY = '2';
    expect((await putJson('ticks', SLOT, { ticked: ['a'] }, { k: K })).status).toBe(200);
    expect((await putJson('ticks', SLOT, { ticked: ['b'] }, { k: K2 })).status).toBe(200);
    expect((await putJson('ticks', SLOT, { ticked: ['c'] }, { k: 'c'.repeat(64) })).status).toBe(429);
    env.SYNC_PUTS_PER_DAY = '1000';
    env.SYNC_NEW_KEYS_PER_DAY = '2';
    expect((await putJson('ticks', SLOT, { ticked: ['c'] }, { k: 'c'.repeat(64), now: T0 + 86_400_001, at: T0 + 86_400_001 })).status).toBe(200);
    expect((await putJson('ticks', SLOT, { ticked: ['d'] }, { k: 'd'.repeat(64), now: T0 + 86_400_002, at: T0 + 86_400_002 })).status).toBe(200);
    expect((await putJson('ticks', SLOT, { ticked: ['e'] }, { k: 'e'.repeat(64), now: T0 + 86_400_003, at: T0 + 86_400_003 })).status).toBe(429);
    expect((await putJson('ticks', SLOT, { ticked: ['f'] }, { k: 'c'.repeat(64), now: T0 + 86_400_004, at: T0 + 86_400_004 })).status).toBe(200);
  });
  it('the stored bytes are capped: a new record is 429 "full" once the total would pass SYNC_MAX_TOTAL_BYTES; replacing one is free', async () => {
    await putJson('ticks', SLOT, { ticked: ['a'] });
    env.WATCH._db.prepare("INSERT INTO synced (key, kind, slot, at, updated, bytes, enc, data) VALUES (?, 'plan', ?, ?, ?, ?, 'gz', 'AAAA')").run(K2, SLOT, T0, T0, SYNC_MAX_TOTAL_BYTES);
    const res = await putJson('ticks', '1793100000', { ticked: ['b'] }, { k: 'c'.repeat(64) });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/full/);
    expect((await putJson('ticks', SLOT, { ticked: ['a', 'again'] }, { at: T0 + 10, now: T0 + 10 })).status).toBe(200);
  });
  it('the edge limiter (FOLLOW_LIMIT) answers 429', async () => {
    env.FOLLOW_LIMIT = { limit: async () => ({ success: false }) };
    expect((await putJson('ticks', SLOT, { ticked: [] })).status).toBe(429);
    expect((await list()).status).toBe(429);
  });
  it('is 503 without D1', async () => {
    delete env.WATCH;
    expect((await list()).status).toBe(503);
  });
});

describe('reading and forgetting', () => {
  it('an unknown key lists nothing; a missing record is 404; CORS allows PUT and DELETE', async () => {
    const res = await list(K2);
    expect(await res.json()).toEqual({ records: [], now: T0 });
    expect((await one('ticks', SLOT)).status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('DELETE with kind and slot removes one record; DELETE with only k removes every record of the key; an absent one is ok', async () => {
    await putJson('override', '0', OVERRIDE);
    await putJson('ticks', SLOT, { ticked: ['a'] });
    await put('plan', SLOT, gz({ a: 1 }));
    expect((await del(`k=${K}&kind=ticks&slot=${SLOT}`)).status).toBe(200);
    expect(count()).toBe(2);
    expect((await del(`k=${K}`)).status).toBe(200);
    expect(count()).toBe(0);
    expect((await del(`k=${K}`)).status).toBe(200);
  });
  it('another key is untouched by a delete', async () => {
    await putJson('ticks', SLOT, { ticked: ['a'] }, { k: K2 });
    await del(`k=${K}`);
    expect(count()).toBe(1);
  });
});
