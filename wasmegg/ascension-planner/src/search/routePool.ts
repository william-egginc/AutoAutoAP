/**
 * A few route-search workers (workers/routeFinder.worker.ts) and the plumbing to use them together:
 * each holds the table, and each step of the route search (search/routeFinder.ts `expandArrivals`) is
 * split among them, so the search runs on several cores. The page keeps the search itself, merging
 * what comes back, which is light; the workers do the arithmetic.
 */
import type { TableHeader } from './precomputedTable';
import type { ArrivalItem, Candidate, ExpandSettings, FirstLeg, FoundRoutes, PolishOptions } from './routeFinder';
import type { FirstLegsRequest, RouteWorkerRequest, RouteWorkerResponse } from '@/workers/routeFinder.protocol';
import { splitHours, type EstimateRequest, type Outcome } from './prestigeBy';

type Pending = { resolve: (m: RouteWorkerResponse) => void; reject: (e: Error) => void };
/** A request without its id, member by member (Omit on the union would collapse it). */
type Unsent<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Workers to use: a core left for the page, at most four (more barely helps, and each holds the table).
 *  search/sweepCache.ts `routeWorkers` counts the same, to share the sweeps' memory budget. */
export function poolSize(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(4, cores - 1));
}

/**
 * Split a step's arrivals (in TE order) into up to `n` contiguous runs, balanced by the work each
 * brings: the checkpoints above it. The pool hands one run to each worker; the order is kept.
 */
export function splitByWork(items: ArrivalItem[], top: number, n: number): ArrivalItem[][] {
  const parts = Math.min(n, items.length);
  if (parts <= 1) return [items];
  const work = items.map(it => Math.max(1, top - it.te));
  const total = work.reduce((a, b) => a + b, 0);
  const chunks: ArrivalItem[][] = [];
  let current: ArrivalItem[] = [];
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    current.push(items[i]);
    acc += work[i];
    if (acc >= (total * (chunks.length + 1)) / parts && chunks.length < parts - 1) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * How long a route worker may take to say it is up (its first message, workers/routeFinder.worker.ts `ready`) once a
 * request waits on it. A worker that never starts gives no error and no reply, so the instant answer said "Loading"
 * for good (Jordan's Safari reload, 23 Oct 2026). Starting takes well under a second; the table download comes after
 * and has its own limit (search/tableFetch.ts TABLE_STALL_MS).
 */
export const ROUTE_WORKER_START_MS = 20_000;
/** A route worker that never started: the instant answer's "couldn't be loaded" card with Retry (tableFetch.ts
 *  `tableLoadFailed` reads "route worker"). */
export const ROUTE_WORKER_NOT_STARTED = 'A route worker didn’t start (the browser may be short of memory).';

export class RoutePool {
  /** Null while asleep (`sleep`): spawned again, all of them, by the next request. */
  private workers: Worker[] | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly count: number;
  /**
   * The workers the `count` parts run on: part `w` goes to worker `w % physical` (`limitWorkers`). A step is still
   * split into `count` parts, each worked out on its own as before, so the answer is the same on fewer workers;
   * they only take turns.
   */
  private physical: number;
  /** `terminate` is final: no request after it spawns anything. */
  private closed = false;
  /** Workers that have sent anything (`ready`, or a reply): started. */
  private started = new WeakSet<Worker>();
  /** A start limit running for a worker a request waits on (`ROUTE_WORKER_START_MS`). */
  private startTimers = new Map<Worker, ReturnType<typeof setTimeout>>();

  constructor(
    size: number,
    private readonly make: () => Worker,
    private readonly startMs: number = ROUTE_WORKER_START_MS
  ) {
    this.count = Math.max(1, size);
    this.physical = this.count;
    this.workers = this.spawn();
  }

  private spawn(n: number = this.physical): Worker[] {
    return Array.from({ length: n }, () => {
      const w = this.make();
      w.onmessage = (e: MessageEvent<RouteWorkerResponse>) => {
        this.started.add(w);
        this.clearStart(w);
        if (e.data.kind === 'ready') return;
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.kind === 'error') p.reject(new Error(e.data.message));
        else p.resolve(e.data);
      };
      // A worker that crashes or sends a reply the page cannot read would leave its request waiting
      // for good (red team 21 Oct 2026, data-inputs #5). Fail everything in flight and start fresh
      // workers on the next request, as `interrupt` does.
      w.onerror = () => this.lost('A route worker stopped (it crashed or ran out of memory).');
      w.onmessageerror = () => this.lost('A route worker sent a reply the page could not read.');
      return w;
    });
  }

  get size(): number {
    return this.count;
  }

  /** The workers the parts run on now (`limitWorkers`). */
  get workerCount(): number {
    return this.physical;
  }

  /**
   * Run the pool's parts on at most `n` workers (Safari, 22 Oct 2026: each route worker holds a table and its
   * sweeps), or on all of them again with `n` = `size`. Only while idle (false otherwise, nothing changed): workers
   * above `n` are terminated, the first `n` keep their table; growing spawns the missing ones. The split into
   * `size` parts is unchanged, so every answer is the same.
   */
  limitWorkers(n: number): boolean {
    const want = Math.max(1, Math.min(this.count, Math.floor(n)));
    if (want === this.physical) return true;
    if (this.closed || !this.idle) return false;
    this.physical = want;
    if (this.workers) {
      if (this.workers.length > want) {
        for (const w of this.workers.slice(want)) {
          this.clearStart(w);
          w.terminate();
        }
        this.workers = this.workers.slice(0, want);
      } else this.workers = [...this.workers, ...this.spawn(want - this.workers.length)];
    }
    return true;
  }

  /** No request in flight. */
  get idle(): boolean {
    return this.pending.size === 0;
  }

  /**
   * Give the workers' memory back while nothing is asked of them: each holds a decoded table, and a
   * chain search wants every MB of the browser's shared heap for its own workers. Only when idle --
   * a request in flight is never cut off; false then, and nothing is done. The next request spawns
   * the workers again, and they load the table again (from the HTTP cache, normally).
   */
  sleep(): boolean {
    if (!this.idle || !this.workers) return !this.workers;
    this.clearStart();
    for (const w of this.workers) w.terminate();
    this.workers = null;
    return true;
  }

  /**
   * Stop what is in flight and give the memory back now: a search started, and the instant answer's
   * background polish waits for it to end (InstantRoute.vue). Unlike `sleep` it cuts a request off --
   * it rejects with "paused" -- and unlike `terminate` the pool stays usable: the next request spawns
   * the workers again. True when anything was cut off.
   */
  interrupt(): boolean {
    const cut = this.pending.size > 0;
    this.clearStart();
    for (const w of this.workers ?? []) w.terminate();
    this.workers = null;
    for (const p of this.pending.values()) p.reject(new Error('paused'));
    this.pending.clear();
    return cut;
  }

  private clearStart(w?: Worker): void {
    for (const [k, t] of this.startTimers) {
      if (w && k !== w) continue;
      clearTimeout(t);
      this.startTimers.delete(k);
    }
  }

  /**
   * A request now waits on `w`: if it has not started within `startMs`, everything in flight fails (`lost`). Looked
   * at twice, a moment apart: after the page was busy, its `ready` may be queued behind the timer.
   */
  private watchStart(w: Worker): void {
    if (this.started.has(w) || this.startTimers.has(w)) return;
    const check = (again: boolean): ReturnType<typeof setTimeout> =>
      setTimeout(
        () => {
          this.startTimers.delete(w);
          if (this.started.has(w) || !this.workers?.includes(w)) return;
          if (again) this.startTimers.set(w, check(false));
          else this.lost(ROUTE_WORKER_NOT_STARTED);
        },
        again ? this.startMs : Math.min(1000, this.startMs)
      );
    this.startTimers.set(w, check(true));
  }

  private lost(why: string): void {
    this.clearStart();
    for (const w of this.workers ?? []) w.terminate();
    this.workers = null;
    for (const p of this.pending.values()) p.reject(new Error(why));
    this.pending.clear();
  }

  get asleep(): boolean {
    return !this.workers;
  }

  private ask(worker: number, message: Unsent<RouteWorkerRequest>): Promise<RouteWorkerResponse> {
    if (this.closed) return Promise.reject(new Error('stopped'));
    const id = this.nextId++;
    this.workers ??= this.spawn();
    const target = this.workers[worker % this.physical];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.watchStart(target);
      target.postMessage({ ...message, id });
    });
  }

  async header(url: string): Promise<TableHeader> {
    const m = await this.ask(0, { kind: 'header', url });
    if (m.kind !== 'header') throw new Error('unexpected reply');
    return m.header;
  }

  /** The search's answer polished on the table, in a worker (routeFinder.ts `polishFound`). */
  async polish(url: string, options: PolishOptions, found: FoundRoutes): Promise<FoundRoutes> {
    const m = await this.ask(0, { kind: 'polish', url, options, found });
    if (m.kind !== 'polish') throw new Error('unexpected reply');
    return m.found;
  }

  async firstLegs(request: Omit<FirstLegsRequest, 'id' | 'kind'>): Promise<FirstLeg[]> {
    const m = await this.ask(0, { kind: 'first-legs', ...request });
    if (m.kind !== 'first-legs') throw new Error('unexpected reply');
    return m.firstLegs;
  }

  /**
   * One step for all these arrivals, split among the workers in contiguous runs of TE (the order
   * they come in), balanced by the work each brings (the checkpoints above it), and put back
   * together in the same order.
   */
  async expand(url: string, items: ArrivalItem[], settings: ExpandSettings): Promise<Candidate[]> {
    const chunks = splitByWork(items, settings.top, this.count);
    const replies = await Promise.all(
      chunks.map((chunk, w) => this.ask(w, { kind: 'expand', url, items: chunk, settings }))
    );
    return replies.flatMap(m => (m.kind === 'expand' ? m.candidates : []));
  }

  /**
   * The experimental "Prestige by" estimate (search/prestigeBy.ts `estimateProfile`) for hours
   * `from`..`hours`, the hours split among the workers and put back in order.
   */
  async prestigeEstimate(url: string, request: EstimateRequest): Promise<Outcome[]> {
    const runs = splitHours(request.from ?? 0, request.hours, this.count);
    const replies = await Promise.all(
      runs.map(([a, b], w) =>
        this.ask(w, { kind: 'prestige-estimate', url, request: { ...request, from: a, hours: b } })
      )
    );
    return replies.flatMap(m => (m.kind === 'prestige-estimate' ? m.outcomes : []));
  }

  terminate(): void {
    this.closed = true;
    this.clearStart();
    for (const w of this.workers ?? []) w.terminate();
    this.workers = null;
    for (const p of this.pending.values()) p.reject(new Error('stopped'));
    this.pending.clear();
  }
}
