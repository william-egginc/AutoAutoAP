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
  private workers: Worker[];
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(size: number, make: () => Worker) {
    this.workers = Array.from({ length: Math.max(1, size) }, () => {
      const w = make();
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
    return this.workers.length;
  }

  private ask(worker: number, message: Unsent<RouteWorkerRequest>): Promise<RouteWorkerResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.workers[worker].postMessage({ ...message, id });
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
    const chunks = splitByWork(items, settings.top, this.workers.length);
    const replies = await Promise.all(
      chunks.map((chunk, w) => this.ask(w, { kind: 'expand', url, items: chunk, settings }))
    );
    return replies.flatMap(m => (m.kind === 'expand' ? m.candidates : []));
  }

  terminate(): void {
    for (const w of this.workers) w.terminate();
    for (const p of this.pending.values()) p.reject(new Error('stopped'));
    this.pending.clear();
  }
}
