/**
 * The instant answer saved online (lib/answersCloud.ts, contract aaap-tools/notes/instantcloud-contract.md v1), against
 * a stand-in collector (mock fetch): a new browser reads the cloud answer; one write after a kept answer, debounced,
 * never twice for the same entry and time; never while a search runs; a 404 is quiet and stops every call for the page
 * load; the size cap; and the player ID never in a URL or a body (scrubbed before gzip). Placeholder IDs only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANSWERS_DEBOUNCE_MS,
  ANSWERS_MAX_ENTRIES,
  ANSWERS_MAX_GZ,
  ANSWERS_WRITES_PER_HOUR,
  AnswersClient,
  answersUrlOf,
  decodeAnswer,
  encodeAnswer,
  entryGoalTag,
  entryKeyOf,
  scrubIds,
  type AnswersFetch,
  type AnswerOffer,
  type CloudAnswer,
} from './answersCloud';

const K = 'a'.repeat(64);
const URL = 'https://collector.example/answers';
const ID = 'EI1234567890123456';

const snapOf = (at: number, extra: Record<string, unknown> = {}) => ({
  v: 1,
  at,
  result: { best: { chain: [210, 260, 300], end: 1_800_000_000, legs: [{ endTE: 210 }] } },
  header: { from: 100, to: 489 },
  tableUrl: 'precompute/table-v2.bin',
  meta: { account: 'f'.repeat(16), goal: 'target 490', backupTime: 1_790_000_000 },
  ...extra,
});
const offer = (at: number, extra: Partial<AnswerOffer> = {}): AnswerOffer => ({
  goal: 'target 490',
  backupTime: 1_790_000_000,
  snapKey: 'aap-instant-answer:1234abcd|0',
  tables: 'rules=x|table-v2.bin=a',
  at,
  snap: snapOf(at),
  pricing: { account: 'f'.repeat(16), backupTime: 1_790_000_000, setup: '[]', url: 'u', tableTo: 489, at, pricing: { v: 1 } },
  ...extra,
});

/** A stand-in collector: the contract's endpoints, in memory. */
function collector(opts: { missing?: boolean } = {}) {
  const store = new Map<string, { at: number; bytes: Uint8Array; updatedAt: number }>();
  const calls: { method: string; url: string; body?: Uint8Array }[] = [];
  const res = (status: number, body: unknown, bytes?: Uint8Array) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)) as ArrayBuffer,
    headers: { get: () => null },
  });
  const f: AnswersFetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, ...(init?.body ? { body: init.body } : {}) });
    if (opts.missing) return res(404, { error: 'not found' });
    const u = new globalThis.URL(url);
    const e = u.searchParams.get('e') ?? '';
    if (method === 'GET' && u.pathname.endsWith('/answers')) {
      const entries = [...store.entries()].map(([e, v]) => ({ e, at: v.at, bytes: v.bytes.length, updatedAt: v.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
      return res(200, { entries: entries.slice(0, 8), now: Date.now() });
    }
    if (method === 'GET' && u.pathname.endsWith('/answers/get')) {
      const v = store.get(e);
      return v ? res(200, null, v.bytes) : res(404, { error: 'absent' });
    }
    if (method === 'PUT') {
      const body = init!.body!;
      if (body[0] !== 0x1f || body[1] !== 0x8b) return res(400, { error: 'rejected' });
      if (body.length > ANSWERS_MAX_GZ) return res(413, { error: 'too big' });
      store.set(e, { at: Number(u.searchParams.get('at')), bytes: body, updatedAt: Date.now() + store.size });
      return res(200, { ok: true, updatedAt: Date.now() });
    }
    return res(400, { error: 'rejected' });
  };
  return { f, calls, store };
}

function client(c: ReturnType<typeof collector>, busy = () => false) {
  return new AnswersClient({ key: () => K, url: () => URL, busy, fetch: () => c.f });
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

describe('the pieces', () => {
  it('the URL beside /follow; the entry key from the goal, save, answer key and tables (opaque, contract charset)', () => {
    expect(answersUrlOf('https://collector.example/submit')).toBe(URL);
    expect(answersUrlOf('')).toBe('');
    const e = entryKeyOf(offer(1))!;
    expect(e).toMatch(/^a1\.t490\.1790000000\.[0-9a-f]+\.[0-9a-f]+$/);
    expect(e.length).toBeLessThanOrEqual(96);
    expect(entryGoalTag(e)).toBe('t490');
    expect(entryKeyOf({ ...offer(1), goal: 'date 1815670800' })).toMatch(/^a1\.d1815670800\./);
    // Other tables or rules: another entry.
    expect(entryKeyOf({ ...offer(1), tables: 'rules=y|table-v2.bin=a' })).not.toBe(e);
    expect(entryKeyOf({ ...offer(1), goal: 'nonsense' })).toBeNull();
  });

  it('the scrubbed JSON has no ID; a snapshot holding one (nested, any case, in a key) comes out clean', async () => {
    const dirty = offer(5, { snap: snapOf(5, { note: `x ${ID} y`, deep: { list: [ID.toLowerCase()], [ID]: 1 } }) });
    expect(scrubIds(JSON.stringify(dirty))).not.toMatch(/EI\d{16}/i);
    const enc = await encodeAnswer({ v: 1, goal: dirty.goal, at: dirty.at, snap: dirty.snap, pricing: null });
    expect(enc).not.toBeNull();
    expect(enc!.json).not.toMatch(/EI\d{16}/i);
    expect([enc!.bytes[0], enc!.bytes[1]]).toEqual([0x1f, 0x8b]);
    const back = await decodeAnswer(enc!.bytes);
    expect(back?.at).toBe(5);
    expect(JSON.stringify(back)).not.toMatch(/EI\d{16}/i);
  });

  it('too big: the pricing record dropped first, then the extras; still too big: not sent', async () => {
    // Random text barely compresses.
    const noise = (n: number) => Array.from({ length: n }, () => Math.random().toString(36).slice(2)).join('');
    const a: CloudAnswer = { v: 1, goal: 'target 490', at: 1, snap: snapOf(1), pricing: { blob: noise(12_000) } };
    const enc = await encodeAnswer(a);
    expect(enc).not.toBeNull();
    expect(JSON.parse(enc!.json).pricing).toBeNull();
    expect(enc!.bytes.length).toBeLessThanOrEqual(ANSWERS_MAX_GZ);
    const huge: CloudAnswer = { v: 1, goal: 'target 490', at: 1, snap: snapOf(1, { result: { best: noise(14_000) } }), pricing: null };
    expect(await encodeAnswer(huge)).toBeNull();
  });
});

describe('the client against a stand-in collector', () => {
  it('a new browser: the newest answer saved online for the goal, read once', async () => {
    const c = collector();
    const w = client(c);
    w.offer(offer(1000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS);
    await vi.waitFor(() => expect(c.store.size).toBe(1));
    // Another page load (a new browser): nothing kept, the cloud answer read.
    const r = client(c);
    const got = await r.newestFor('target 490');
    expect(got?.at).toBe(1000);
    expect((got?.snap as { result: unknown }).result).toBeTruthy();
    expect(await r.newestFor('date 1815670800')).toBeNull();
    const gets = c.calls.filter(x => x.method === 'GET');
    await r.newestFor('target 490');
    expect(c.calls.filter(x => x.method === 'GET').length).toBe(gets.length);
    expect(r.read.map(a => a.at)).toEqual([1000]);
  });

  it('one write after a kept answer, debounced; the newest offer wins; the same entry and time never again', async () => {
    const c = collector();
    const w = client(c);
    w.offer(offer(1000));
    w.offer(offer(2000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS - 10);
    expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20);
    await vi.waitFor(() => expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(1));
    expect(c.calls.find(x => x.method === 'PUT')!.url).toContain('&at=2000');
    w.offer(offer(2000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    expect(await w.flush()).toBe('skipped');
    expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(1);
    // A page load that finds the same entry and time online writes nothing either.
    const again = client(c);
    again.offer(offer(2000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await vi.waitFor(() => expect(c.calls.filter(x => x.method === 'GET').length).toBeGreaterThan(1));
    expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(1);
  });

  it('no write on load: reading back never writes; nothing is offered, nothing is sent', async () => {
    const c = collector();
    const r = client(c);
    await r.newestFor('target 490');
    await r.newestAny();
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS * 3);
    expect(c.calls.filter(x => x.method !== 'GET')).toHaveLength(0);
  });

  it('never while a search runs or starts: tried again later', async () => {
    const c = collector();
    let busy = true;
    const w = client(c, () => busy);
    w.offer(offer(1000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(0);
    busy = false;
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await vi.waitFor(() => expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(1));
  });

  it('404 (an older collector): quiet, and nothing more is asked on this page load', async () => {
    const c = collector({ missing: true });
    const w = client(c);
    expect(await w.newestFor('target 490')).toBeNull();
    expect(w.off).toBe(true);
    const n = c.calls.length;
    expect(await w.newestAny()).toBeNull();
    w.offer(offer(1000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    expect(c.calls.length).toBe(n);
  });

  it('size cap: oversize never sent; at most ANSWERS_MAX_ENTRIES listed (the oldest dropped)', async () => {
    const c = collector();
    const w = client(c);
    const noise = Array.from({ length: 14_000 }, () => Math.random().toString(36).slice(2)).join('');
    w.offer(offer(1000, { snap: snapOf(1000, { result: { best: noise } }) }));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    expect(await w.flush()).toBe('skipped');
    expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(0);
    for (let i = 0; i < ANSWERS_MAX_ENTRIES + 2; i++) {
      w.offer(offer(2000 + i, { backupTime: 1_790_000_000 + i }));
      await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
      await vi.waitFor(() => expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(i + 1));
    }
    const list = await w.entries();
    expect(list).toHaveLength(ANSWERS_MAX_ENTRIES);
    expect(list.some(x => x.at === 2000)).toBe(false);
    expect(list[0].at).toBe(2000 + ANSWERS_MAX_ENTRIES + 1);
  });

  it(`at most ${ANSWERS_WRITES_PER_HOUR} writes an hour; a 429 holds writes until its retryAfter`, async () => {
    const c = collector();
    const w = client(c);
    for (let i = 0; i < ANSWERS_WRITES_PER_HOUR + 2; i++) {
      w.offer(offer(5000 + i, { backupTime: 1_790_000_000 + i }));
      await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
      await w.flush();
    }
    await vi.waitFor(() => expect(c.calls.filter(x => x.method === 'PUT').length).toBe(ANSWERS_WRITES_PER_HOUR));
  });

  it('the ID never in a URL or a body; the key is the hashed follow key', async () => {
    const c = collector();
    const w = client(c);
    w.offer(offer(1000, { snap: snapOf(1000, { note: ID, meta: { account: 'x', goal: 'target 490', backupTime: 1, id: ID } }) }));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await vi.waitFor(() => expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(1));
    for (const call of c.calls) {
      expect(call.url).not.toMatch(/EI\d{16}/i);
      expect(call.url).toContain(`k=${K}`);
      if (call.body) {
        const text = await new Response(new Blob([call.body as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        expect(text).not.toMatch(/EI\d{16}/i);
      }
    }
  });

  it('without a key or a collector: no call at all', async () => {
    const c = collector();
    const w = new AnswersClient({ key: () => '', url: () => URL, busy: () => false, fetch: () => c.f });
    expect(await w.newestFor('target 490')).toBeNull();
    w.offer(offer(1));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    expect(c.calls).toHaveLength(0);
  });
});

describe("My runs' pricing meanwhile from an answer read back", () => {
  it('its pricing record, marked as the cloud’s (never this browser’s own record), only when usable', async () => {
    const { cloudPricingRecords } = await import('./followEstimate');
    const good = { account: 'acct', backupTime: 1, setup: '[]', url: 'u', tableTo: 489, at: 5, pricing: { v: 1, final: 490, options: { startTE: 194, start: 1, firstLegs: [{ to: 200, endTE: 200, end: 2, delivered: [1] }] } } };
    const got = cloudPricingRecords([{ pricing: good }, { pricing: null }, { pricing: { ...good, pricing: { v: 2 } } }, {}]);
    expect(got).toHaveLength(1);
    expect(got[0].setup).toBe('cloud|[]');
  });
});

describe("the browser's fetch", () => {
  it('is called as a plain function, never as a method (the browser throws "Illegal invocation")', async () => {
    const c = collector();
    const strict = function (this: unknown, url: string, init?: Parameters<AnswersFetch>[1]) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return c.f(url, init);
    } as AnswersFetch;
    const w = new AnswersClient({ key: () => K, url: () => URL, busy: () => false, fetch: () => strict });
    w.offer(offer(1000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await vi.waitFor(() => expect(c.calls.filter(x => x.method === 'PUT')).toHaveLength(1));
    expect((await new AnswersClient({ key: () => K, url: () => URL, busy: () => false, fetch: () => strict }).newestFor('target 490'))?.at).toBe(1000);
  });

  it("the store hands the client a fetch that keeps the browser's own `this`", () => {
    const store = fs.readFileSync(path.resolve(__dirname, '../stores/answers.ts'), 'utf8');
    expect(store).toContain('(u, i) => fetch(u, i as RequestInit)');
  });
});
