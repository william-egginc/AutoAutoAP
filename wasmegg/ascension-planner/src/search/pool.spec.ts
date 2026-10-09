/**
 * The pool's watchdog.
 *
 * This exists because of a measured eight-and-a-half-hour hang: a worker died without firing an
 * error event, its promise stayed pending forever, `Promise.all` never settled, and the run sat on
 * `7634 / ~8865 chains` with a stale ETA at 3% CPU. There was nothing in the code that could ever
 * have noticed. These tests are the thing that notices.
 *
 * A fake worker rather than a real one: the real one imports the whole simulator, and the point
 * here is the bookkeeping, not the simulation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainSearchPool } from './pool';
import type { SearchInputs } from './types';
import type { WorkerRequest, WorkerResponse } from '@/workers/chainSearch.protocol';

vi.mock('@/lib/artifacts/utils', () => ({ sanitizeLongs: <T>(v: T) => v }));
vi.mock('./batch', () => ({
  maxPoolSize: () => 2,
  hardwareThreads: () => 4,
  clampPoolSize: (n: number) => Math.max(1, Math.min(4, Math.floor(n))),
  workersForBatch: (batch: number, pool: number) => Math.min(pool, Math.max(1, batch)),
  splitByPrefix: (chains: number[][], workers: number) => {
    const buckets: number[][][] = Array.from({ length: workers }, () => []);
    chains.forEach((c, i) => buckets[i % workers].push(c));
    return buckets.filter(b => b.length);
  },
}));

/** Minimal stand-in for a DedicatedWorker. `mode` decides how it answers an evaluate. */
class FakeWorker {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  static instances: FakeWorker[] = [];
  /** 'ok' replies; 'silent' answers init then never speaks again; 'heartbeat' only heartbeats. */
  mode: 'ok' | 'silent' | 'heartbeat' | 'hold' = 'ok';
  /** In 'hold' mode, the evaluate it is sitting on until `release()`. */
  held: Extract<WorkerRequest, { kind: 'evaluate' }> | null = null;
  /** The heap each new worker reports on its heartbeats (the real one reads `performance.memory`);
   *  undefined sends none, as a browser without that API does. */
  static heapOf: ((index: number) => number | null) | undefined;
  heap: number | null | undefined;
  /** Every evaluate request any fake worker received, as it received it. */
  static evaluates: Extract<WorkerRequest, { kind: 'evaluate' }>[] = [];

  constructor() {
    this.heap = FakeWorker.heapOf?.(FakeWorker.instances.length);
    FakeWorker.instances.push(this);
  }

  private emit(msg: WorkerResponse): void {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>);
  }

  postMessage(raw: WorkerRequest): void {
    // What a real worker boundary does first: structured-clone the message. A proxy (a Vue reactive
    // array) throws here exactly as it does in a browser.
    const msg = structuredClone(raw);
    if (msg.kind === 'init') {
      this.emit({ type: 'init-done', requestId: msg.requestId });
      return;
    }
    if (msg.kind === 'evaluate') FakeWorker.evaluates.push(msg);
    if (this.mode === 'silent') return;
    if (msg.kind === 'integrity') {
      this.emit({ type: 'integrity', requestId: msg.requestId, seconds: 120 });
      return;
    }
    if (msg.kind === 'starts') {
      // A stand-in that depends on the start, so an answer filed under the wrong start shows.
      msg.starts.forEach((_, i) =>
        this.emit({ type: 'progress', requestId: msg.requestId, done: i + 1, total: msg.starts.length })
      );
      this.emit({ type: 'starts', requestId: msg.requestId, seconds: msg.starts.map(s => 1000 + (s % 97)) });
      return;
    }
    for (let i = 0; i < msg.chains.length; i++) {
      this.emit({
        type: 'progress',
        requestId: msg.requestId,
        done: i + 1,
        total: msg.chains.length,
        ...(this.heap !== undefined ? { heapMB: this.heap } : {}),
      });
    }
    if (this.mode === 'heartbeat') return;
    if (this.mode === 'hold') {
      this.held = msg;
      return;
    }
    this.reply(msg);
  }

  /** Answer the held evaluate, as a worker finishing its chains would. */
  release(): void {
    const msg = this.held;
    this.held = null;
    this.mode = 'ok';
    if (msg) this.reply(msg);
  }

  private reply(msg: Extract<WorkerRequest, { kind: 'evaluate' }>): void {
    this.emit({
      type: 'result',
      requestId: msg.requestId,
      results: msg.chains.map(chain => ({ chain, seconds: 100 * chain.length, legs: [] })),
      legSims: msg.chains.length,
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

const INPUTS = { final: 490, currentTE: 175 } as unknown as SearchInputs;

let clock = 0;
const now = () => clock;

/**
 * Assert a rejection, attaching the handler BEFORE the rejection can happen.
 *
 * `await expect(p).rejects...` attaches its handler at the moment it is awaited. If the sweep has
 * already rejected by then, Node reports an unhandled rejection first and only afterwards notices
 * the late handler (`PromiseRejectionHandledWarning`), which Vitest surfaces as a run-level error
 * and warns can cause false positives. Attaching up front keeps the run clean and, more usefully,
 * is what a real caller does — the driver is already awaiting when a worker dies.
 */
function expectRejection(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  return p.then(
    () => {
      throw new Error('expected a rejection, got a resolved batch');
    },
    (err: unknown) => {
      expect(String(err)).toMatch(pattern);
    }
  );
}

/**
 * Let the in-flight sends register, then jump the clock past the stall window and sweep again.
 *
 * The two phases are load-bearing. `send` stamps `lastSeen` from the injected clock, and those
 * sends happen in microtasks AFTER `evaluate()` returns its promise — so moving the clock first
 * moves `lastSeen` with it and the worker never looks stale. Advance once to let the sends land,
 * then move the clock, then advance again.
 */
async function letItGoQuiet(byMs: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);
  clock += byMs;
  await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);
}

/** Matches WATCHDOG_INTERVAL_MS in pool.ts. */
const WATCHDOG_TICK = 30_000;

function makePool(stallMs = 1000) {
  return createChainSearchPool(INPUTS, {
    spawn: () => new FakeWorker() as unknown as Worker,
    stallMs,
    now,
  });
}

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.evaluates = [];
  FakeWorker.heapOf = undefined;
  clock = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createChainSearchPool', () => {
  it('evaluates a batch across workers and merges the replies', async () => {
    const pool = await makePool();
    const out = await pool.evaluate([
      [195, 490],
      [196, 490],
      [197, 490],
    ]);
    expect(out.results).toHaveLength(3);
    expect(out.legSims).toBe(3);
    pool.terminate();
  });

  it('reports progress DURING a batch, not only at the end', async () => {
    // The display bug that hid the hang: stage 6's widest sweep is one ~2200-chain request, and
    // with no intra-batch reporting the counter did not move for half an hour at a time.
    const pool = await makePool();
    const seen: number[] = [];
    await pool.evaluate(
      [
        [195, 490],
        [196, 490],
        [197, 490],
        [198, 490],
      ],
      done => seen.push(done)
    );
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(4);
    pool.terminate();
  });

  it('rejects a request whose worker goes silent, instead of hanging forever', async () => {
    const pool = await makePool(1000);
    // Two chains -> two workers under the stubbed split; the second never answers.
    const promise = pool.evaluate([
      [195, 490],
      [196, 490],
    ]);
    FakeWorker.instances[1].mode = 'silent';
    const settled = expectRejection(promise, /stopped responding/);

    await letItGoQuiet(5000);
    await settled;
    pool.terminate();
  });

  it('names the worker and how far it got, and says progress is checkpointed', async () => {
    // A hang cost a user a night's compute. The message has to say what happened and that the
    // work is not lost, not just fail.
    const pool = await makePool(1000);
    const promise = pool.evaluate([
      [195, 490],
      [196, 490],
    ]);
    FakeWorker.instances[1].mode = 'silent';
    const named = expectRejection(promise, /worker 1[\s\S]*chains done/);
    const reassuring = expectRejection(promise, /checkpointed/);
    await letItGoQuiet(5000);
    await named;
    await reassuring;
    pool.terminate();
  });

  it('drops a stalled worker so a later batch does not send into a void', async () => {
    const pool = await makePool(1000);
    const first = pool.evaluate([
      [195, 490],
      [196, 490],
    ]);
    FakeWorker.instances[1].mode = 'silent';
    const settled = expectRejection(first, /stopped responding/);
    await letItGoQuiet(5000);
    await settled;

    expect(FakeWorker.instances[1].terminated).toBe(true);
    // Slot freed: the next batch spawns a replacement rather than reusing the dead one.
    const before = FakeWorker.instances.length;
    await pool.evaluate([
      [195, 490],
      [196, 490],
    ]);
    expect(FakeWorker.instances.length).toBeGreaterThan(before);
    pool.terminate();
  });

  it('does not fail a worker that is heartbeating, however long the batch runs', async () => {
    // The whole risk of a watchdog is killing healthy work. A heartbeat inside the window must
    // keep the request alive indefinitely.
    const pool = await makePool(1000);
    const worker = FakeWorker.instances[0];
    worker.mode = 'heartbeat';
    const promise = pool.evaluate([[195, 490]]);
    let settled = false;
    void promise.then(
      () => (settled = true),
      () => (settled = true)
    );

    // Heartbeats landed at clock 0; keep the clock just inside the threshold and sweep repeatedly.
    for (let i = 0; i < 5; i++) {
      clock += 900;
      await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);
      // Re-heartbeat, as a live worker would.
      worker.postMessage({ kind: 'evaluate', requestId: 2, chains: [[195, 490]] } as WorkerRequest);
    }
    expect(settled).toBe(false);
    pool.terminate();
  });

  it('forgives a gap that means the PAGE was suspended, not that a worker died', async () => {
    // The failure this exists for: an observed run reported "no progress for 290 minutes" when the
    // threshold is ten. That is impossible unless the watchdog itself was frozen — Edge had slept
    // the background tab, suspending timers AND workers together. The first tick after resume then
    // killed a worker that had merely been paused.
    const suspensions: number[] = [];
    const pool = await createChainSearchPool(INPUTS, {
      spawn: () => new FakeWorker() as unknown as Worker,
      stallMs: 1000,
      now,
      onSuspend: s => suspensions.push(s),
    });
    const promise = pool.evaluate([[195, 490]]);
    FakeWorker.instances[0].mode = 'silent';
    let settled = false;
    void promise.then(
      () => (settled = true),
      () => (settled = true)
    );

    // Let the send register, then jump the clock far past BOTH the stall threshold and the gap
    // that marks a suspension.
    await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);
    clock += 290 * 60 * 1000;
    await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);

    expect(settled).toBe(false);
    expect(suspensions).toHaveLength(1);
    expect(suspensions[0]).toBeGreaterThan(17000);
    expect(pool.suspendedSeconds).toBeGreaterThan(17000);
    pool.terminate();
  });

  it('still kills a worker that goes silent AFTER a suspension', async () => {
    // Forgiveness must not be amnesty: once the page is awake again, ten more minutes of silence
    // is real evidence and has to fail loudly.
    const pool = await makePool(1000);
    const promise = pool.evaluate([[195, 490]]);
    FakeWorker.instances[0].mode = 'silent';
    const settled = expectRejection(promise, /stopped responding/);

    await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);
    clock += 290 * 60 * 1000; // suspension: forgiven
    await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);
    clock += 5000; // genuine silence, measured by a watchdog that was awake
    await vi.advanceTimersByTimeAsync(WATCHDOG_TICK);

    await settled;
    pool.terminate();
  });

  it('terminate rejects everything outstanding and stops the watchdog', async () => {
    const pool = await makePool(1000);
    FakeWorker.instances[0].mode = 'silent';
    const promise = pool.evaluate([[195, 490]]);
    const settled = expectRejection(promise, /terminated/);
    pool.terminate();
    await settled;
    // A sweep after terminate must not throw or resurrect anything.
    clock = 100_000;
    await vi.advanceTimersByTimeAsync(2 * WATCHDOG_TICK);
  });

  it('returns an empty outcome for an empty batch without touching a worker', async () => {
    const pool = await makePool();
    const out = await pool.evaluate([]);
    expect(out).toEqual({ results: [], legSims: 0, workersUsed: 0 });
    pool.terminate();
  });
});

describe('the integrity check', () => {
  it('asks one worker and returns its answer', async () => {
    const pool = await makePool();
    expect(await pool.integrityWait()).toBe(120);
    pool.terminate();
  });
});

describe('resizing while a run is going', () => {
  const batch = (n: number) => Array.from({ length: n }, (_, i) => [200 + i, 490]);
  const alive = () => FakeWorker.instances.filter(w => !w.terminated).length;

  it('uses more workers from the next batch once grown', async () => {
    const pool = await makePool();
    await pool.evaluate(batch(8));
    expect(alive()).toBe(2);
    expect(pool.resize(4)).toBe(4);
    expect(pool.size).toBe(4);
    const out = await pool.evaluate(batch(8));
    expect(out.workersUsed).toBe(4);
    expect(alive()).toBe(4);
    pool.terminate();
  });

  it('holds a request to the machine, like the starting size', async () => {
    const pool = await makePool();
    expect(pool.resize(64)).toBe(4);
    expect(pool.resize(0)).toBe(1);
    pool.terminate();
  });

  it('terminates idle workers above a smaller size at once, handing their memory back', async () => {
    const pool = await makePool();
    pool.resize(4);
    await pool.evaluate(batch(8));
    expect(alive()).toBe(4);
    pool.resize(1);
    expect(alive()).toBe(1);
    expect(pool.spawned).toBe(1);
    const out = await pool.evaluate(batch(8));
    expect(out.workersUsed).toBe(1);
    expect(out.results).toHaveLength(8);
    pool.terminate();
  });

  it('lets a busy worker finish its chains before it goes', async () => {
    const pool = await makePool(10 * 60 * 1000);
    await pool.evaluate(batch(4)); // spawns both workers
    const second = FakeWorker.instances[1];
    second.mode = 'hold';
    const running = pool.evaluate(batch(4));
    await vi.advanceTimersByTimeAsync(0);

    pool.resize(1);
    expect(second.terminated).toBe(false); // mid-request: its chains are not thrown away

    second.release();
    const out = await running;
    expect(out.results).toHaveLength(4); // every chain came back, the busy worker's included
    expect(second.terminated).toBe(true); // and then it went
    expect(pool.spawned).toBe(1);
    pool.terminate();
  });
});

describe('what reaches a worker', () => {
  it('posts a chain held in Vue reactive state, which the browser cannot clone as-is', async () => {
    // The store re-prices its winner from `bestChain.value`, a reactive proxy. Posted as-is it threw
    // "Failed to execute 'postMessage' on 'Worker': [object Object] could not be cloned".
    const { reactive } = await import('vue');
    const pool = await makePool();
    const winner = reactive([201, 282, 490]);
    const out = await pool.evaluate([winner]);
    expect(out.results.map(r => r.chain)).toEqual([[201, 282, 490]]);
    pool.terminate();
  });
});

describe('stickyBuckets', () => {
  it('sends a shape to the same worker whatever else is in the batch', async () => {
    const { stickyBuckets } = await import('./pool');
    const shape = [150, 180, 210];
    const whereIs = (chains: number[][]) => {
      for (const [w, b] of stickyBuckets(chains, -1, 4))
        if (b.some(c => c.slice(0, -1).join() === shape.join())) return w;
      return -1;
    };
    const a = whereIs([
      [...shape, 240],
      [140, 170, 200, 230],
      [160, 190, 220, 250],
    ]);
    const b = whereIs([
      [...shape, 243],
      [145, 175, 205, 235],
    ]);
    expect(a).toBe(b);
    // and every last stop of that shape goes together
    const buckets = stickyBuckets(
      [
        [...shape, 240],
        [...shape, 241],
        [...shape, 242],
      ],
      -1,
      4
    );
    expect(buckets.size).toBe(1);
  });
});

describe('evaluateStarts', () => {
  it('shares the start times across the workers and answers them in the order given', async () => {
    const pool = await createChainSearchPool({} as never, { size: 3, spawn: () => new FakeWorker() as never });
    const starts = [5000, 5100, 5200, 5300, 5400, 5500, 5600];
    const ticks: number[] = [];
    const out = await pool.evaluateStarts([150, 490], starts, { fresh: true }, done => ticks.push(done));
    expect(out).toEqual(starts.map(s => 1000 + (s % 97)));
    expect(Math.max(...ticks)).toBe(starts.length);
    pool.terminate();
  });
});

describe('workerHeaps', () => {
  it("keeps each worker's last reported heap, from the heartbeats it already sends", async () => {
    FakeWorker.heapOf = i => [120, null, 300][i] ?? null;
    const pool = await createChainSearchPool(INPUTS, { size: 3, spawn: () => new FakeWorker() as never });
    expect(pool.workerHeaps()).toEqual([null]);
    await pool.evaluate([[1], [2], [3]], undefined, { spreadOut: true });
    expect(pool.workerHeaps()).toEqual([120, null, 300]);
    pool.terminate();
  });

  it('is all null where workers cannot report', async () => {
    const pool = await createChainSearchPool(INPUTS, { size: 2, spawn: () => new FakeWorker() as never });
    await pool.evaluate([[1], [2]], undefined, { spreadOut: true });
    expect(pool.workerHeaps()).toEqual([null, null]);
    pool.terminate();
  });
});

describe('a dealt batch (workerOf)', () => {
  const chains = Array.from({ length: 12 }, (_, i) => [150 + i, 300]);

  it("tells each worker how to keep its memo, sized for the pool's workers", async () => {
    const pool = await createChainSearchPool(INPUTS, { size: 3, spawn: () => new FakeWorker() as never });
    const asked: number[] = [];
    await pool.evaluate(chains, undefined, {
      workerOf: cs => cs.map((_, i) => i % 3),
      memo: { keepLast: false, capacity: w => (asked.push(w), 1000 * w) },
    });
    expect(asked).toEqual([3]);
    expect(FakeWorker.evaluates.length).toBeGreaterThan(0);
    for (const m of FakeWorker.evaluates) expect(m.memo).toEqual({ keepLast: false, capacity: 3000 });
    // An undealt batch too.
    FakeWorker.evaluates = [];
    await pool.evaluate(chains.slice(0, 2), undefined, { spreadOut: true, memo: { keepLast: false } });
    for (const m of FakeWorker.evaluates) expect(m.memo).toEqual({ keepLast: false });
    // Without it nothing is said, so Smart search and the Full sweep keep their memo as it was.
    FakeWorker.evaluates = [];
    await pool.evaluate(chains, undefined, { workerOf: cs => cs.map(() => 0) });
    for (const m of FakeWorker.evaluates) expect(m.memo).toBeUndefined();
    pool.terminate();
  });

  it("sends each worker its own chains a piece at a time and streams every chain's result", async () => {
    const pool = await createChainSearchPool(INPUTS, { size: 3, spawn: () => new FakeWorker() as never });
    const streamed: string[] = [];
    let legs = 0;
    const out = await pool.evaluate(chains, undefined, {
      workerOf: cs => cs.map((_, i) => i % 3),
      piece: 2,
      onResult: (c, r) => streamed.push(`${c.join(',')}:${r ? r.seconds : 'x'}`),
      onLegs: n => (legs += n),
    });
    expect(out.results).toHaveLength(12);
    expect(out.unpriced).toEqual([]);
    expect(out.workersUsed).toBe(3);
    expect(streamed).toHaveLength(12);
    expect(legs).toBe(out.legSims);
    pool.terminate();
  });

  it('sends no more pieces once told to stop, and lists what it never sent', async () => {
    const pool = await createChainSearchPool(INPUTS, { size: 1, spawn: () => new FakeWorker() as never });
    let sent = 0;
    const out = await pool.evaluate(chains, undefined, {
      workerOf: cs => cs.map(() => 0),
      piece: 4,
      onResult: () => sent++,
      shouldStop: () => sent >= 4,
    });
    expect(out.results).toHaveLength(4);
    expect(out.unpriced).toHaveLength(8);
    pool.terminate();
  });

  it('lets a worker with nothing left take the last pieces of a busy one', async () => {
    const pool = await createChainSearchPool(INPUTS, { size: 2, spawn: () => new FakeWorker() as never });
    // Worker 0 gets everything and sits on its first piece; worker 1 is dealt nothing.
    await pool.evaluate([[1, 2]], undefined, { spreadOut: true });
    FakeWorker.instances[0].mode = 'hold';
    const done = pool.evaluate(chains, undefined, { workerOf: cs => cs.map(() => 0), piece: 3 });
    await vi.advanceTimersByTimeAsync(0);
    FakeWorker.instances[0].release();
    const out = await done;
    expect(out.results).toHaveLength(12);
    // Worker 1 took pieces: the batch used both.
    expect(out.workersUsed).toBe(2);
    pool.terminate();
  });
});
