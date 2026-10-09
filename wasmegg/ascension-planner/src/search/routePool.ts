/**
 * A few route-search workers (workers/routeFinder.worker.ts) and the plumbing to use them together:
 * each holds the table, and each step of the route search (search/routeFinder.ts `expandArrivals`) is
 * split among them, so the search runs on several cores. The page keeps the search itself, merging
 * what comes back, which is light; the workers do the arithmetic.
 */
import type { TableHeader } from './precomputedTable';
import type { ArrivalItem, Candidate, ExpandSettings, FirstLeg, FoundRoutes, PolishOptions } from './routeFinder';
import type { FirstLegsRequest, RouteWorkerRequest, RouteWorkerResponse } from '@/workers/routeFinder.protocol';

type Pending = { resolve: (m: RouteWorkerResponse) => void; reject: (e: Error) => void };
/** A request without its id, member by member (Omit on the union would collapse it). */
type Unsent<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Workers to use: a core left for the page, at most four (more barely helps, and each holds the table). */
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

export class RoutePool {
  /** Null while asleep (`sleep`): spawned again, all of them, by the next request. */
  private workers: Worker[] | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private readonly count: number;
  /** `terminate` is final: no request after it spawns anything. */
  private closed = false;

  constructor(
    size: number,
    private readonly make: () => Worker
  ) {
    this.count = Math.max(1, size);
    this.workers = this.spawn();
  }

  private spawn(): Worker[] {
    return Array.from({ length: this.count }, () => {
      const w = this.make();
      w.onmessage = (e: MessageEvent<RouteWorkerResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.kind === 'error') p.reject(new Error(e.data.message));
        else p.resolve(e.data);
      };
      return w;
    });
  }

  get size(): number {
    return this.count;
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
    for (const w of this.workers ?? []) w.terminate();
    this.workers = null;
    for (const p of this.pending.values()) p.reject(new Error('paused'));
    this.pending.clear();
    return cut;
  }

  get asleep(): boolean {
    return !this.workers;
  }

  private ask(worker: number, message: Unsent<RouteWorkerRequest>): Promise<RouteWorkerResponse> {
    if (this.closed) return Promise.reject(new Error('stopped'));
    const id = this.nextId++;
    this.workers ??= this.spawn();
    const target = this.workers[worker];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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

  terminate(): void {
    this.closed = true;
    for (const w of this.workers ?? []) w.terminate();
    this.workers = null;
    for (const p of this.pending.values()) p.reject(new Error('stopped'));
    this.pending.clear();
  }
}
