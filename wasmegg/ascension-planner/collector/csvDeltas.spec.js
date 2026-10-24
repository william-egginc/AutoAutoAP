/**
 * "The CSV so far in deltas" (see worker.js): crc32Combine, the /csvd and /csv?run= wire protocol, the
 * stitched gzip GET /csv serves, replacement and the sweep. In-memory KV, no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zlib from 'node:zlib';
import worker, { crc32Combine } from './worker.js';

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

let env;
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'test-key' };
});
afterEach(() => vi.useRealTimers());

const call = (path, init) => worker.fetch(new Request('https://collector.test' + path, init), env);
const OWNER = 'a'.repeat(32);
const RUN = 'ab12cd34ef56ab78';
let n = 0;
const BEST = () => ({
  schema: 3,
  chain: [195, 490],
  durationDays: 700 + ++n,
  finalTE: 490,
  provisional: true,
  progress: { done: 1, total: 9 },
});
const submit = (body, owner = OWNER) =>
  call('/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1', 'x-owner-token': owner },
    body: JSON.stringify(body),
  });
const submitBest = async (extra = {}, replaces) =>
  (await submit({ ...BEST(), csvRun: RUN, ...(replaces ? { replaces } : {}), ...extra })).json();

/** A synced raw deflate segment, as pigz makes one. */
const seg = text => zlib.deflateRawSync(Buffer.from(text), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
const crcOf = text => zlib.crc32(Buffer.from(text));
const textOf = (tag, lines) => Array.from({ length: lines }, (_, i) => `priced,${tag},${i},${'x'.repeat(i % 7)}\n`).join('');

const putDelta = (text, seq, { run = RUN, token, count = 2, crc = crcOf(text), len = Buffer.byteLength(text), body } = {}) =>
  call(`/csvd?run=${run}&seq=${seq}&len=${len}&crc=${crc}&count=${count}`, {
    method: 'POST',
    headers: token ? { 'x-upload-token': token } : {},
    body: body ?? seg(text),
  });
const putHead = (id, text, k, { run = RUN, token, delta, body, deltas = k } = {}) =>
  call(`/csv?id=${id}&run=${run}&deltas=${deltas}&len=${Buffer.byteLength(text)}&crc=${crcOf(text)}`, {
    method: 'POST',
    headers: { ...(token ? { 'x-upload-token': token } : {}), ...(delta ? { 'x-delta-token': delta } : {}) },
    body: body ?? seg(text),
  });
const gunzipped = async id => {
  const res = await call(`/csv?id=${id}`);
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
};

describe('crc32Combine', () => {
  it('matches zlib.crc32 of the joined buffers, over random pieces', () => {
    for (let i = 0; i < 200; i++) {
      const a = Buffer.alloc(Math.floor(Math.random() * 3000));
      const b = Buffer.alloc(Math.floor(Math.random() * 3000));
      for (let j = 0; j < a.length; j++) a[j] = Math.random() * 256;
      for (let j = 0; j < b.length; j++) b[j] = Math.random() * 256;
      expect(crc32Combine(zlib.crc32(a), zlib.crc32(b), b.length)).toBe(zlib.crc32(Buffer.concat([a, b])));
    }
  });
  it('treats an empty second piece as nothing, and handles lengths past 2^31', () => {
    expect(crc32Combine(123456, 0, 0)).toBe(123456);
    const a = Buffer.from('hello ');
    // Zeros of a huge length: combine against a crc computed in chunks.
    const chunk = Buffer.alloc(1 << 20);
    let z = 0;
    for (let i = 0; i < 4; i++) z = zlib.crc32(chunk, z);
    expect(crc32Combine(zlib.crc32(a), z, 4 << 20)).toBe(zlib.crc32(Buffer.concat([a, Buffer.alloc(4 << 20)])));
  });
});

describe('deltas, end to end', () => {
  it('serves head + deltas as one gzip member that gunzipSync and DecompressionStream both read', async () => {
    const sub = await submitBest();
    expect(sub.deltaToken).toMatch(/^[a-f0-9]{64}$/);
    const texts = [textOf('a', 40), textOf('b', 3), textOf('c', 500)];
    for (let i = 0; i < 3; i++) {
      const res = await putDelta(texts[i], i, { token: sub.deltaToken });
      expect(await res.json()).toMatchObject({ ok: true, seq: i });
    }
    const head = 'header,line\n' + textOf('h', 5);
    const res = await putHead(sub.id, head, 3, { token: sub.uploadToken, delta: sub.deltaToken });
    expect(await res.json()).toMatchObject({ ok: true, deltas: 3, partial: true });
    const bytes = await gunzipped(sub.id);
    expect([...bytes.subarray(0, 10)]).toEqual([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff]);
    const whole = head + texts.join('');
    expect(zlib.gunzipSync(bytes).toString()).toBe(whole);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    expect(await new Response(stream).text()).toBe(whole);
    // The board says it has a CSV.
    const rows = (await (await call('/all')).json()).rows;
    expect(rows.find(r => r.id === sub.id).hasCsv).toBe(true);
    expect((await call(`/csv?id=${sub.id}`)).headers.get('content-type')).toBe('application/gzip');
  });

  it('works with no deltas at all', async () => {
    const sub = await submitBest();
    await putHead(sub.id, 'only a head\n', 0, { token: sub.uploadToken, delta: sub.deltaToken });
    expect(zlib.gunzipSync(await gunzipped(sub.id)).toString()).toBe('only a head\n');
  });

  it('answers a resent delta with 409 and the stored count', async () => {
    const sub = await submitBest();
    await putDelta(textOf('a', 4), 0, { token: sub.deltaToken, count: 7 });
    const again = await putDelta(textOf('z', 9), 0, { token: sub.deltaToken, count: 3 });
    expect(again.status).toBe(409);
    expect((await again.json()).count).toBe(7);
  });

  it('refuses a head with 422 listing the missing deltas', async () => {
    const sub = await submitBest();
    await putDelta(textOf('a', 4), 1, { token: sub.deltaToken });
    const res = await putHead(sub.id, 'h\n', 3, { token: sub.uploadToken, delta: sub.deltaToken });
    expect(res.status).toBe(422);
    expect((await res.json()).missing).toEqual([0, 2]);
    expect(env.SUBMISSIONS._m.has(`csv:${sub.id}`)).toBe(false);
  });

  it('is write-once for the head, like any CSV', async () => {
    const sub = await submitBest();
    expect((await putHead(sub.id, 'h\n', 0, { token: sub.uploadToken, delta: sub.deltaToken })).status).toBe(200);
    expect((await putHead(sub.id, 'h\n', 0, { token: sub.uploadToken, delta: sub.deltaToken })).status).toBe(409);
  });

  it('500s when a stored delta has gone missing', async () => {
    const sub = await submitBest();
    await putDelta(textOf('a', 4), 0, { token: sub.deltaToken });
    await putHead(sub.id, 'h\n', 1, { token: sub.uploadToken, delta: sub.deltaToken });
    env.SUBMISSIONS._m.delete(`csvd:${RUN}:0`);
    expect((await call(`/csv?id=${sub.id}`)).status).toBe(500);
  });
});

describe('refusals', () => {
  it('403s a wrong or missing token before reading the body, 503s with no key', async () => {
    const sub = await submitBest();
    expect((await putDelta('x\n', 0, {})).status).toBe(403);
    expect((await putDelta('x\n', 0, { token: sub.uploadToken })).status).toBe(403);
    expect((await putDelta('x\n', 0, { token: sub.deltaToken, run: 'ffffffffffffffff' })).status).toBe(403);
    // Head: needs the csvp token AND the delta token.
    expect((await putHead(sub.id, 'h\n', 0, { token: sub.uploadToken })).status).toBe(403);
    expect((await putHead(sub.id, 'h\n', 0, { delta: sub.deltaToken })).status).toBe(403);
    expect((await putHead(sub.id, 'h\n', 0, { token: sub.uploadToken, delta: sub.uploadToken })).status).toBe(403);
    delete env.CSV_UPLOAD_KEY;
    expect((await putDelta('x\n', 0, { token: sub.deltaToken })).status).toBe(503);
  });

  it('400s malformed parameters and a body that is not a sync-flushed segment', async () => {
    const sub = await submitBest();
    const t = sub.deltaToken;
    expect((await putDelta('x\n', 256, { token: t })).status).toBe(400);
    expect((await putDelta('x\n', -1, { token: t })).status).toBe(400);
    expect((await putDelta('x\n', 'q', { token: t })).status).toBe(400);
    expect((await putDelta('x\n', 0, { token: t, len: 0 })).status).toBe(400);
    expect((await putDelta('x\n', 0, { token: t, crc: 2 ** 32 })).status).toBe(400);
    expect((await putDelta('x\n', 0, { token: t, count: -1 })).status).toBe(400);
    expect((await putDelta('x\n', 0, { token: t, run: 'nothex!' })).status).toBe(400);
    expect((await putDelta('x\n', 0, { token: t, body: new Uint8Array(0) })).status).toBe(400);
    // A finished deflate stream, a gzip file: not segments.
    expect((await putDelta('x\n', 0, { token: t, body: zlib.deflateRawSync(Buffer.from('x\n')) })).status).toBe(400);
    expect((await putDelta('x\n', 0, { token: t, body: zlib.gzipSync(Buffer.from('x\n')) })).status).toBe(400);
    expect(env.SUBMISSIONS._m.has(`csvd:${RUN}:0`)).toBe(false);
    // Head: a bad count, a non-segment, and a final/quarantine kind of token with run.
    expect((await putHead(sub.id, 'h\n', 0, { token: sub.uploadToken, delta: t, deltas: 257 })).status).toBe(400);
    expect((await putHead(sub.id, 'h\n', 0, { token: sub.uploadToken, delta: t, body: zlib.gzipSync(Buffer.from('h')) })).status).toBe(400);
    const finalTok = await (async () => {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('test-key'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('csv:' + sub.id)));
      return [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
    })();
    expect((await putHead(sub.id, 'h\n', 0, { token: finalTok, delta: t })).status).toBe(400);
  });

  it('413s a delta over the cap', async () => {
    const sub = await submitBest();
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    expect((await putDelta('x\n', 0, { token: sub.deltaToken, body: big })).status).toBe(413);
  });

  it('ignores a bad or unusable csvRun, and a csvRun on a final row', async () => {
    for (const csvRun of ['short', 'G'.repeat(16), 5, 'a'.repeat(33)]) {
      const r = await submitBest({ csvRun });
      expect(r.ok).toBe(true);
      expect(r.deltaToken).toBeUndefined();
      env.SUBMISSIONS = makeKV();
    }
    const fin = await (await submit({ schema: 3, chain: [195, 490], durationDays: 650, finalTE: 490, csvRun: RUN })).json();
    expect(fin.ok).toBe(true);
    expect(fin.deltaToken).toBeUndefined();
    expect(JSON.stringify([...env.SUBMISSIONS._m.entries()])).not.toContain(RUN);
    delete env.CSV_UPLOAD_KEY;
    expect((await submitBest()).deltaToken).toBeUndefined();
  });
});

describe('csvRun stays private', () => {
  it('is not in any public output, and only in the private snapshot line and the stored record', async () => {
    const sub = await submitBest();
    await putDelta(textOf('a', 3), 0, { token: sub.deltaToken });
    await putHead(sub.id, 'h\n', 1, { token: sub.uploadToken, delta: sub.deltaToken });
    for (const path of ['/all', '/leaderboard?final=490', '/flagged']) {
      expect(await (await call(path)).text()).not.toContain(RUN);
    }
    expect(await (await call('/mine', { headers: { 'x-owner-token': OWNER } })).text()).not.toContain(RUN);
    const snap = env.SUBMISSIONS._m.get('snap:sub');
    expect(snap.slice(0, snap.indexOf('\n'))).not.toContain(RUN);
    expect(snap.slice(snap.indexOf('\n'))).toContain(RUN);
    const rec = JSON.parse([...env.SUBMISSIONS._m.entries()].find(([k]) => k.startsWith('sub:'))[1]);
    expect(rec.csvRun).toBe(RUN);
  });
});

describe('replacement', () => {
  const gap = () => vi.setSystemTime(Date.now() + 26 * 60 * 1000);
  const deltaKeys = () => [...env.SUBMISSIONS._m.keys()].filter(k => k.startsWith('csvd:'));

  it('keeps the deltas for a provisional of the same run, and a final deletes them', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-12T12:00:00Z'));
    const one = await submitBest();
    await putDelta(textOf('a', 5), 0, { token: one.deltaToken });
    await putHead(one.id, 'h1\n', 1, { token: one.uploadToken, delta: one.deltaToken });
    gap();
    const two = await submitBest({}, one.id);
    expect(two.replaced).toBe(one.id);
    expect(env.SUBMISSIONS._m.has(`csv:${one.id}`)).toBe(false);
    expect(deltaKeys()).toEqual([`csvd:${RUN}:0`]);
    await putDelta(textOf('b', 5), 1, { token: two.deltaToken });
    await putHead(two.id, 'h2\n', 2, { token: two.uploadToken, delta: two.deltaToken });
    expect(env.SUBMISSIONS._meta.get(`csv:${two.id}`)).toMatchObject({ run: RUN, deltas: 2 });
    expect(zlib.gunzipSync(await gunzipped(two.id)).toString()).toBe('h2\n' + textOf('a', 5) + textOf('b', 5));
    gap();
    const fin = await (
      await submit({ schema: 3, chain: [195, 490], durationDays: 640, finalTE: 490, replaces: two.id })
    ).json();
    expect(fin.replaced).toBe(two.id);
    expect(deltaKeys()).toEqual([]);
    expect(env.SUBMISSIONS._m.has(`csv:${two.id}`)).toBe(false);
  });

  it('deletes the deltas when a new run takes the row over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-12T12:00:00Z'));
    const one = await submitBest();
    await putDelta(textOf('a', 5), 0, { token: one.deltaToken });
    await putHead(one.id, 'h1\n', 1, { token: one.uploadToken, delta: one.deltaToken });
    gap();
    const two = await submitBest({ csvRun: '0123456789abcdef' }, one.id);
    expect(two.replaced).toBe(one.id);
    expect(deltaKeys()).toEqual([]);
  });
});

describe('the sweep', () => {
  it('deletes an old delta of an unreferenced run and keeps a referenced or a young one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.parse('2026-10-12T12:00:00Z');
    vi.setSystemTime(t0);
    const sub = await submitBest();
    await call('/all'); // both snapshots exist
    await call('/flagged');
    await putDelta(textOf('a', 3), 0, { token: sub.deltaToken });
    const ORPHAN = 'fedcba9876543210';
    const old = { len: 1, crc: 0, count: 1, at: t0 - 2 * 86400000 };
    const kv = env.SUBMISSIONS;
    await kv.put(`csvd:${ORPHAN}:0`, new Uint8Array([0, 0, 0xff, 0xff]), { metadata: old });
    await kv.put(`csvd:${ORPHAN}:1`, new Uint8Array([0, 0, 0xff, 0xff]), { metadata: { ...old, at: t0 - 3600000 } });
    kv._meta.set(`csvd:${RUN}:0`, { ...kv._meta.get(`csvd:${RUN}:0`), at: t0 - 5 * 86400000 });
    // Hour 11 sweeps csvd:.
    vi.setSystemTime(Date.parse('2026-10-13T11:30:00Z'));
    kv._meta.set(`csvd:${ORPHAN}:1`, { ...old, at: Date.now() - 3600000 });
    const waits = [];
    await worker.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    const left = [...kv._m.keys()].filter(k => k.startsWith('csvd:'));
    expect(left.sort()).toEqual([`csvd:${ORPHAN}:1`, `csvd:${RUN}:0`].sort());
  });
});
