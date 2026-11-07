/**
 * An offer made while another is being sent is not dropped (lib/answersCloud.ts flush): the first one's gzip is held
 * open, a newer offer arrives meanwhile, and both are written, the older then the newer. Without a new offer: one write.
 * Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANSWERS_DEBOUNCE_MS, AnswersClient, type AnswersFetch, type AnswerOffer } from './answersCloud';

const K = 'a'.repeat(64);
const URL = 'https://collector.example/answers';

// The first gzip of the test is held until `release()`; later ones run straight through. `held()` says it has started.
const RealCS = globalThis.CompressionStream;
let gate: { held: boolean; release: () => void; used: boolean };
function holdFirstGzip() {
  let release = () => {};
  const open = new Promise<void>(r => (release = r));
  gate = { held: false, release, used: false };
  globalThis.CompressionStream = class {
    constructor(format: CompressionFormat) {
      const real = new RealCS(format);
      const mine = !gate.used;
      gate.used = true;
      const hold = new TransformStream<BufferSource, BufferSource>({
        transform: async (chunk, ctl) => {
          if (mine) {
            gate.held = true;
            await open;
          }
          ctl.enqueue(chunk);
        },
      });
      void hold.readable.pipeTo(real.writable);
      return { writable: hold.writable, readable: real.readable } as unknown as CompressionStream;
    }
  } as unknown as typeof CompressionStream;
}

async function until(what: string, done: () => boolean): Promise<void> {
  const t0 = Number(process.hrtime.bigint() / 1_000_000n);
  while (!done()) {
    if (Number(process.hrtime.bigint() / 1_000_000n) - t0 > 5000) throw new Error(`${what} still pending after 5000 ms`);
    await new Promise<void>(r => setImmediate(r));
  }
}
const turns = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise<void>(r => setImmediate(r));
};

function collector() {
  const puts: string[] = [];
  let inflight = 0;
  const res = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    headers: { get: () => null },
  });
  const f: AnswersFetch = async (url, init) => {
    inflight++;
    try {
      if ((init?.method ?? 'GET') === 'PUT') {
        puts.push(url);
        return res(200, { ok: true, updatedAt: Date.now() });
      }
      return res(200, { entries: [], now: Date.now() });
    } finally {
      inflight--;
    }
  };
  return { f, puts, inflight: () => inflight };
}

const offer = (at: number): AnswerOffer => ({
  goal: 'target 490',
  backupTime: 1_790_000_000,
  snapKey: 'aap-instant-answer:1234abcd|0',
  tables: 'rules=x|table-v2.bin=a',
  at,
  snap: {
    v: 1,
    at,
    result: { best: { chain: [210, 260, 300], end: 1_800_000_000, legs: [{ endTE: 210 }] } },
    header: { from: 100, to: 489 },
    tableUrl: 'precompute/table-v2.bin',
    meta: { account: 'f'.repeat(16), goal: 'target 490', backupTime: 1_790_000_000 },
  },
  pricing: null,
});

const client = (c: ReturnType<typeof collector>) => new AnswersClient({ key: () => K, url: () => URL, busy: () => false, fetch: () => c.f });
const pendingOf = (w: AnswersClient) => (w as unknown as { pending: unknown }).pending;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  holdFirstGzip();
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.CompressionStream = RealCS;
});

describe('an offer made while one is being sent', () => {
  it('is sent by its own timer: two writes, the older then the newer, the newer with its own time', async () => {
    const c = collector();
    const w = client(c);
    w.offer(offer(1000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await until('the first gzip to start', () => gate.held);
    w.offer(offer(2000)); // while the first is being compressed
    gate.release();
    await until('the first write', () => c.puts.length === 1);
    await turns();
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await until('the newer one to be worked on', () => pendingOf(w) === null && c.inflight() === 0);
    await turns();
    expect(c.puts).toHaveLength(2);
    expect(c.puts[0]).toContain('&at=1000');
    expect(c.puts[1]).toContain('&at=2000');
  });

  it('control: no new offer meanwhile, exactly one write', async () => {
    const c = collector();
    const w = client(c);
    w.offer(offer(1000));
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await until('the first gzip to start', () => gate.held);
    gate.release();
    await until('the write', () => c.puts.length === 1);
    await turns();
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await turns();
    expect(c.puts).toHaveLength(1);
    expect(c.puts[0]).toContain('&at=1000');
    expect(pendingOf(w)).toBeNull();
  });
});
