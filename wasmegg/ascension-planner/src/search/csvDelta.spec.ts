/**
 * The CSV so far in deltas, app side (search/csvDelta.ts) against the collector (collector/worker.js)
 * over an in-memory KV: what the app compresses and posts is what GET /csv serves as one gzip file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zlib from 'node:zlib';
// @ts-expect-error -- the collector is plain JS
import worker from '../../collector/worker.js';
import {
  BLOCKED_WHY,
  checkDeltaState,
  crc32,
  deflateSegment,
  fetchFailureWhy,
  freshDeltaState,
  MAX_DELTAS,
  uploadDelta,
  uploadDeltaHead,
} from './csvDelta';
import { PricedRoutes } from './deadline';
import { pricedDeltaChunks, pricedLine } from './csv';

function makeKV() {
  const m = new Map<string, unknown>();
  const meta = new Map<string, unknown>();
  return {
    async get(k: string) {
      return m.has(k) ? m.get(k) : null;
    },
    async getWithMetadata(k: string) {
      const value = m.has(k) ? m.get(k) : null;
      return { value, metadata: value !== null && meta.has(k) ? meta.get(k) : null };
    },
    async put(k: string, v: unknown, opts?: { metadata?: unknown }) {
      m.set(k, v);
      if (opts?.metadata) meta.set(k, opts.metadata);
      else meta.delete(k);
    },
    async delete(k: string) {
      m.delete(k);
      meta.delete(k);
    },
    async list({ prefix, limit }: { prefix: string; limit?: number }) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, limit ?? 1000);
      return { keys: keys.map(name => ({ name, metadata: meta.get(name) })), list_complete: true };
    },
  };
}

let env: { SUBMISSIONS: ReturnType<typeof makeKV>; CSV_UPLOAD_KEY: string };
beforeEach(() => {
  env = { SUBMISSIONS: makeKV(), CSV_UPLOAD_KEY: 'k' };
});
afterEach(() => vi.useRealTimers());
const BASE = 'https://collector.test';
const doFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  worker.fetch(new Request(String(input), init), env)) as typeof fetch;

const ZONE = 'America/Denver';
const START = 1_790_000_000;
const DEADLINE = START + 300 * 86400;
const META = { timezone: ZONE, planStart: START };

function routes(n: number, from = 0): PricedRoutes {
  const all = new PricedRoutes();
  for (let i = 0; i < n; i++) {
    const t = from + i === 7 ? NaN : START + (100 + ((from + i) % 250)) * 86400;
    all.add(`${160 + ((from + i) % 20)},${200 + ((from + i) % 30)},${240 + ((from + i) % 9)}`, t, t);
  }
  return all;
}

describe('crc32 and the segment', () => {
  it('matches zlib.crc32, also continued across pieces', () => {
    const a = Buffer.from('priced,160 200 240,3\n');
    const b = Buffer.from('more text, é and all\n');
    expect(crc32(a)).toBe(zlib.crc32(a));
    expect(crc32(b, crc32(a))).toBe(zlib.crc32(Buffer.concat([a, b])));
  });

  it('ends with a sync flush and inflates back to the text', async () => {
    const chunks = ['hello,', 'world\n'.repeat(5000)];
    const seg = await deflateSegment(chunks, 1 << 20);
    if (!seg.ok) throw new Error('too big');
    expect([...seg.body.slice(-4)]).toEqual([0, 0, 0xff, 0xff]);
    const text = zlib.inflateRawSync(Buffer.from(seg.body), { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString();
    expect(text).toBe(chunks.join(''));
    expect(seg.len).toBe(Buffer.byteLength(text));
    expect(seg.crc).toBe(zlib.crc32(Buffer.from(text)));
  });

  it('says too big over the cap', async () => {
    const noisy = Array.from({ length: 50 }, () => Array.from({ length: 200 }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join(''));
    expect((await deflateSegment(noisy, 1000)).ok).toBe(false);
  });
});

describe('which routes a delta carries', () => {
  it('cuts the priced routes into deltas that join back to every line, in priced order', () => {
    const all = routes(5000);
    const whole = [...pricedDeltaChunks(all, 0, all.size, META, DEADLINE)].join('');
    const parts = [0, 1234, 4000, 5000].slice(0, -1).map((from, i, a) => {
      const to = [1234, 4000, 5000][i];
      return [...pricedDeltaChunks(all, from, to, META, DEADLINE)].join('');
    });
    expect(parts.join('')).toBe(whole);
    expect(whole.split('\n')[3]).toBe(pricedLine(all, 3, META, DEADLINE));
  });

  it('goes on after a carry-on that priced the same routes, waits while it replays, and starts afresh if they differ', () => {
    const all = routes(3000);
    const s = { run: 'ab12cd34ef56ab78', seq: 2, sent: 2000, hash: all.hashAt(1999) };
    expect(checkDeltaState(s, all)).toEqual({ state: s, wait: false });
    // A carry-on replaying: the same routes, only 1,000 of them back so far.
    expect(checkDeltaState(s, routes(1000))).toEqual({ state: s, wait: true });
    // Priced in another order: a fresh run key from route 0.
    const other = routes(3000, 1);
    const next = checkDeltaState(s, other).state;
    expect(next.run).not.toBe(s.run);
    expect(next).toMatchObject({ seq: 0, sent: 0, hash: 0 });
    // The collector's cap reached.
    expect(checkDeltaState({ ...s, seq: MAX_DELTAS }, all).state.run).not.toBe(s.run);
  });
});

describe('end to end with the collector', () => {
  it('two progress sends of one run: the second row serves head + both deltas as one gzip', async () => {
    const st = freshDeltaState();
    const submit = async (replaces?: string) =>
      (await doFetch(`${BASE}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1', 'x-owner-token': 'a'.repeat(32) },
        body: JSON.stringify({
          schema: 3,
          chain: [195, 490],
          durationDays: 700 + (replaces ? 1 : 0),
          finalTE: 490,
          provisional: true,
          progress: { done: 1, total: 9 },
          csvRun: st.run,
          ...(replaces ? { replaces } : {}),
        }),
      }).then(r => r.json())) as { id: string; uploadToken: string; deltaToken: string };

    const all = routes(6000);
    const head = (k: number) => `# head with ${k} deltas\n# every route priced\nkind,route\n`;
    const send = async (row: { id: string; uploadToken: string; deltaToken: string }, from: number, to: number, seq: number) => {
      const seg = await deflateSegment(pricedDeltaChunks(all, from, to, META, DEADLINE), 8 << 20);
      if (!seg.ok) throw new Error('too big');
      const up = await uploadDelta(BASE, { run: st.run, seq, token: row.deltaToken, seg, count: to - from }, doFetch);
      expect(up).toEqual({ kind: 'stored', count: to - from });
      // A retry whose answer was lost: the board says what it holds.
      expect(await uploadDelta(BASE, { run: st.run, seq, token: row.deltaToken, seg, count: 999 }, doFetch)).toEqual({
        kind: 'stored',
        count: to - from,
      });
      const h = await deflateSegment([head(seq + 1)], 1 << 20);
      if (!h.ok) throw new Error('too big');
      expect(
        await uploadDeltaHead(BASE, { id: row.id, run: st.run, deltas: seq + 1, token: row.uploadToken, deltaToken: row.deltaToken, seg: h }, doFetch)
      ).toEqual({ kind: 'stored' });
    };
    // The collector takes one progress send per 25 minutes.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    const first = await submit();
    expect(first.deltaToken).toBeTruthy();
    await send(first, 0, 2500, 0);
    vi.setSystemTime(new Date('2026-10-12T13:00:00Z'));
    const second = await submit(first.id);
    expect(second.deltaToken).toBeTruthy();
    await send(second, 2500, 6000, 1);

    const res = await doFetch(`${BASE}/csv?id=${second.id}`);
    expect(res.status).toBe(200);
    const gz = Buffer.from(await res.arrayBuffer());
    const want = head(2) + [...pricedDeltaChunks(all, 0, 6000, META, DEADLINE)].join('');
    expect(zlib.gunzipSync(gz).toString()).toBe(want);
    // One member: what the Explorer's DecompressionStream needs (Chrome refuses a second member).
    const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    expect(text).toBe(want);
  }, 30_000);
});

describe('why an upload failed (12 Oct 2026: a CORS block went unrecorded)', () => {
  const seg = { body: new Uint8Array([1, 2, 3]), crc: 1, len: 3 };
  const head = { id: 'r1', run: 'abc', deltas: 1, token: 't', deltaToken: 'd', seg };
  const delta = { run: 'abc', seq: 0, token: 'd', seg, count: 3 };
  async function settle<T>(p: Promise<T>): Promise<T> {
    // The retries wait 3 s and 6 s.
    await vi.advanceTimersByTimeAsync(10_000);
    return p;
  }

  it('says the browser refused or could not send when fetch throws a TypeError', async () => {
    vi.useFakeTimers();
    try {
      let tries = 0;
      const blocked = (() => {
        tries++;
        return Promise.reject(new TypeError('Failed to fetch'));
      }) as typeof fetch;
      expect(await settle(uploadDeltaHead(BASE, head, blocked))).toEqual({ kind: 'failed', why: BLOCKED_WHY });
      expect(tries).toBe(3);
      expect(await settle(uploadDelta(BASE, delta, blocked))).toEqual({ kind: 'failed', why: BLOCKED_WHY });
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives the board's status when it kept answering a server error", async () => {
    vi.useFakeTimers();
    try {
      const busy = (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch;
      expect(await settle(uploadDeltaHead(BASE, head, busy))).toEqual({ kind: 'failed', why: 'the Leaderboard answered 503', status: 503 });
      expect(await settle(uploadDelta(BASE, delta, busy))).toEqual({ kind: 'failed', why: 'the Leaderboard answered 503', status: 503 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('names other failures by their message', () => {
    expect(fetchFailureWhy(new TypeError('Load failed'))).toBe(BLOCKED_WHY);
    expect(fetchFailureWhy(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('the request was cut off');
    expect(fetchFailureWhy(new Error('boom'))).toBe('the request failed (boom)');
  });
});
