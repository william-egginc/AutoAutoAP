/**
 * How the By a date run hands its routes to the workers: the old way (64 routes a batch, each set
 * sent to `hash(set) % workers`) against the new (big batches, dealt evenly and stickily by
 * search/stickyDealer.ts, a few routes at a time per worker, streamed back).
 *
 * Two things are checked, on the real deadline search and the real pool, with workers that stand in
 * for the simulator on a virtual clock:
 *   1. THE ANSWER IS UNCHANGED. The same space and the same deadline give identical routes, ranking,
 *      best per count and priced count, and the search asks for exactly the same routes in exactly
 *      the same order, whichever way they are handed out.
 *   2. THE WORKERS ARE BUSIER. Busy fraction = worker-seconds spent simulating / (workers x wall
 *      clock), where each leg costs a few virtual seconds unless that worker's prefix memo has it.
 *
 * Set DEADLINE_BUSY_REPORT=1 to print the busy fractions for a bigger space at 8, 16 and 24 workers.
 */
import { describe, expect, it, vi } from 'vitest';
import { createChainSearchPool, type ChainSearchPool, type EvaluateOptions } from './pool';
import { createStickyDealer } from './stickyDealer';
import { runDeadlineSearch, type DeadlineOutcome, type DeadlineSpec } from './deadline';
import { replayingEvaluator } from './deadlineStore';
import { firstRouteLegs, spaceSets } from './deadlineEstimate';
import type { ChainResult, SearchInputs } from './types';
import type { WorkerRequest, WorkerResponse } from '@/workers/chainSearch.protocol';

vi.mock('@/lib/artifacts/utils', () => ({ sanitizeLongs: <T>(v: T) => v }));
vi.mock('./batch', async importOriginal => ({
  ...(await importOriginal<typeof import('./batch')>()),
  hardwareThreads: () => 32,
  maxPoolSize: () => 8,
  clampPoolSize: (n: number) => Math.max(1, Math.min(32, Math.floor(n))),
}));

const DAY = 86400;
const START = 1_790_000_000;
const TE = 150;

/** The deadline spec's stand-in simulator: a day to rebuild, slower per TE the lower you start. */
function legSeconds(a: number, b: number): number {
  return DAY + (b - a) * DAY * (150 / (a + 20));
}
function priceChain(chain: number[]): ChainResult {
  let te = TE;
  let seconds = 0;
  for (const c of chain) {
    seconds += legSeconds(te, c);
    te = c;
  }
  return { chain: [...chain], seconds, legs: [] };
}

/** A tiny event queue: a binary heap on (time, order). */
class Clock {
  now = 0;
  private seq = 0;
  private heap: { t: number; s: number; fn: () => void }[] = [];
  at(t: number, fn: () => void): void {
    const h = this.heap;
    h.push({ t, s: this.seq++, fn });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].t < h[i].t || (h[p].t === h[i].t && h[p].s < h[i].s)) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop(): { t: number; fn: () => void } | undefined {
    const h = this.heap;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        const less = (a: number, b: number) => h[a].t < h[b].t || (h[a].t === h[b].t && h[a].s < h[b].s);
        if (l < h.length && less(l, m)) m = l;
        if (r < h.length && less(r, m)) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Virtual seconds a leg costs: 3 s give or take 30%, fixed per prefix. */
function legCost(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 3 * (0.7 + 0.6 * ((h >>> 0) / 4294967296));
}

/** A worker on the virtual clock, with a prefix memo like search/chain.ts's (3,000 entries). */
class SimWorker {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  busy = 0;
  legs = 0;
  private freeAt = 0;
  private memo = new Map<string, true>();
  constructor(
    private clock: Clock,
    private lru: boolean
  ) {}
  private emit(msg: WorkerResponse): void {
    this.onmessage?.({ data: msg } as MessageEvent<WorkerResponse>);
  }
  postMessage(msg: WorkerRequest): void {
    if (msg.kind === 'init') {
      this.clock.at(this.clock.now, () => this.emit({ type: 'init-done', requestId: msg.requestId }));
      return;
    }
    if (msg.kind !== 'evaluate') throw new Error(`unexpected ${msg.kind}`);
    let cost = 0;
    let legSims = 0;
    for (const chain of msg.chains) {
      for (let i = 0; i < chain.length; i++) {
        const key = chain.slice(0, i + 1).join(',');
        if (this.memo.has(key)) {
          if (this.lru) {
            this.memo.delete(key);
            this.memo.set(key, true);
          }
          continue;
        }
        cost += legCost(key);
        legSims++;
        if (this.memo.size >= 3000) {
          let drop = 750;
          for (const k of this.memo.keys()) {
            if (drop-- <= 0) break;
            this.memo.delete(k);
          }
        }
        this.memo.set(key, true);
      }
    }
    const start = Math.max(this.clock.now, this.freeAt);
    this.freeAt = start + cost;
    this.busy += cost;
    this.legs += legSims;
    const results = msg.chains.map(priceChain);
    this.clock.at(this.freeAt, () => this.emit({ type: 'result', requestId: msg.requestId, results, legSims }));
  }
  terminate(): void {}
}

type Way = 'old' | 'new';

interface Run {
  out: DeadlineOutcome;
  /** Every route the search asked for, in order. */
  asked: string[];
  busy: number;
  wall: number;
  legs: number;
}

/** Run the deadline search on `workers` simulated workers, handing routes out the old or new way. */
async function simulate(spec: DeadlineSpec, workers: number, way: Way, lru = true): Promise<Run> {
  const clock = new Clock();
  const sims: SimWorker[] = [];
  const pool: ChainSearchPool = await (async () => {
    const p = createChainSearchPool({ final: 490, currentTE: TE } as unknown as SearchInputs, {
      size: workers,
      spawn: () => {
        const w = new SimWorker(clock, lru);
        sims.push(w);
        return w as unknown as Worker;
      },
      stallMs: Number.MAX_SAFE_INTEGER,
      now: () => 0,
    });
    return drive(clock, p);
  })();
  const dealer = createStickyDealer();
  const asked: string[] = [];
  const outP = runDeadlineSearch(
    { ...spec, parallel: workers, ...(way === 'old' ? { chunk: 64 } : {}) },
    {
      evaluate: async (chains, onResult) => {
        for (const c of chains) asked.push(c.join(','));
        const shapes = new Set(chains.map(c => c.slice(0, -1).join(','))).size;
        const many = shapes >= pool.size;
        const opts: EvaluateOptions = !many
          ? { spreadOut: true }
          : way === 'old'
            ? { stickyDepth: -1 }
            : { workerOf: (cs, n) => dealer.deal(cs, n), onResult };
        return (await pool.evaluate(chains, undefined, opts)).results;
      },
    }
  );
  const out = await drive(clock, outP);
  pool.terminate();
  return {
    out,
    asked,
    busy: sims.reduce((a, w) => a + w.busy, 0),
    wall: clock.now,
    legs: sims.reduce((a, w) => a + w.legs, 0),
  };
}

/** Advance the virtual clock one event at a time, letting every promise settle in between, until
 *  `p` settles. */
async function drive<T>(clock: Clock, p: Promise<T>): Promise<T> {
  let settled = false;
  p.then(
    () => (settled = true),
    () => (settled = true)
  );
  for (;;) {
    await new Promise(r => setImmediate(r));
    if (settled) return p;
    const ev = clock.pop();
    if (!ev) {
      await new Promise(r => setImmediate(r));
      if (settled) return p;
      throw new Error('the simulation has nothing left to do and the search has not finished');
    }
    clock.now = ev.t;
    ev.fn();
  }
}

const range = (lo: number, hi: number, step: number) => {
  const out: number[] = [];
  for (let v = lo; v <= hi; v += step) out.push(v);
  return out;
};

/** The Science card's 1-4 ascension boxes from TE 150, narrowed by `firsts` first stops. */
function space(firsts: number): DeadlineSpec {
  const first = range(151, 150 + firsts, 1);
  return {
    currentTE: TE,
    planStart: START,
    deadline: START + 200 * DAY,
    minStops: 1,
    maxStops: 4,
    lastLo: 195,
    lastHi: 330,
    step: 1,
    extend: true,
    bandSets: [[], [first], [first, range(195, 250, 2)], [first, range(195, 250, 5), range(230, 295, 10)]],
  };
}

const fraction = (r: Run, workers: number) => r.busy / (workers * r.wall);

describe('handing By a date routes to the workers', () => {
  it('finds exactly the same answer, asking for exactly the same routes, either way', async () => {
    const s = space(12);
    for (const workers of [3, 8]) {
      const before = await simulate(s, workers, 'old', false);
      const after = await simulate(s, workers, 'new');
      expect(after.asked).toEqual(before.asked);
      expect(after.out.priced).toBe(before.out.priced);
      expect(after.out.shapes).toBe(before.out.shapes);
      expect(JSON.stringify(after.out.routes)).toBe(JSON.stringify(before.out.routes));
      expect(JSON.stringify([...after.out.byStops])).toBe(JSON.stringify([...before.out.byStops]));
      expect(after.out.routes.length).toBeGreaterThan(100);
    }
  }, 120_000);

  it('keeps the workers busier', async () => {
    const s = space(12);
    const before = await simulate(s, 8, 'old', false);
    const after = await simulate(s, 8, 'new');
    expect(fraction(after, 8)).toBeGreaterThan(fraction(before, 8) + 0.15);
    expect(fraction(after, 8)).toBeGreaterThan(0.85);
    // And simulates no more legs for it: the sets still go back to the worker that knows them.
    expect(after.legs).toBeLessThanOrEqual(before.legs * 1.05);
  }, 120_000);

  it("counts the legs the way the workers simulate them (the estimate's model)", async () => {
    const s = space(12);
    const run = await simulate(s, 8, 'new');
    const sets = spaceSets(
      s.bandSets!.map(b => ({ asc: b.length + 1, bands: b })),
      TE,
      s.lastHi
    )!;
    expect(sets.length).toBe(run.out.shapes);
    // Each set's first route at its share of the shared legs, every later route one leg.
    const model = firstRouteLegs(sets, 8) + (run.out.priced - sets.length);
    expect(model / run.legs).toBeGreaterThan(0.9);
    expect(model / run.legs).toBeLessThan(1.1);
  }, 60_000);

  it('carries on after a stop mid-batch to the same answer as a run never stopped', async () => {
    const s = { ...space(8), parallel: 4 };
    const whole = await runDeadlineSearch(s, { evaluate: async cs => cs.map(priceChain) });
    // First half: streams results, and is told to stop part-way through a batch.
    let stop = false;
    let n = 0;
    const first = replayingEvaluator(
      async (cs, onResult) => {
        const out: ChainResult[] = [];
        for (const c of cs) {
          if (stop) break; // the pool sends no more pieces once stopped
          const r = priceChain(c);
          out.push(r);
          onResult?.(c, r);
          if (++n === 500) stop = true;
        }
        return out;
      },
      [],
      () => stop
    );
    const cut = await runDeadlineSearch(s, { evaluate: first.evaluate, shouldStop: () => stop });
    expect(cut.stoppedEarly).toBe(true);
    // Nothing that was not priced is recorded as unreachable.
    expect(first.entries().every(e => e[1] >= 0)).toBe(true);
    const second = replayingEvaluator(async cs => cs.map(priceChain), first.entries());
    const rest = await runDeadlineSearch(s, { evaluate: second.evaluate });
    expect(JSON.stringify(rest.routes)).toBe(JSON.stringify(whole.routes));
    expect(rest.priced).toBe(whole.priced);
  }, 60_000);

  it.runIf(!!process.env.DEADLINE_BUSY_REPORT)(
    'reports busy fractions on the full card space',
    async () => {
      const s = space(40);
      const lines: string[] = [];
      for (const workers of [8, 16, 24]) {
        const shipped = await simulate(s, workers, 'old', false);
        const oldLru = await simulate(s, workers, 'old', true);
        const now = await simulate(s, workers, 'new', true);
        expect(now.asked).toEqual(shipped.asked);
        expect(JSON.stringify(now.out.routes)).toBe(JSON.stringify(shipped.out.routes));
        const h = (r: Run) =>
          `${(100 * fraction(r, workers)).toFixed(0)}% busy, ${(r.wall / 3600).toFixed(2)} h, ${r.legs} legs`;
        lines.push(
          `${workers} workers, ${now.out.shapes} sets, ${now.out.priced} routes: before ${h(shipped)} | before + LRU memo ${h(oldLru)} | after ${h(now)}`
        );
      }
      console.log(lines.join('\n'));
    },
    600_000
  );
});
