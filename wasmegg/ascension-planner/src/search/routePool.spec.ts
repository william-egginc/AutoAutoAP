import { describe, expect, it } from 'vitest';
import { ROUTE_WORKER_NOT_STARTED, RoutePool } from './routePool';
import { tableLoadFailed } from './tableFetch';

/** A worker that answers a header request when told to. */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  terminated = false;
  inbox: { id: number; kind: string }[] = [];
  postMessage(m: { id: number; kind: string }) {
    if (this.terminated) return; // a terminated worker drops messages, as a real one does
    this.inbox.push(m);
  }
  answer() {
    const m = this.inbox.shift()!;
    this.onmessage?.({ data: { kind: 'header', id: m.id, header: { from: 1 } } } as MessageEvent);
  }
  terminate() {
    this.terminated = true;
  }
}

function pool(size = 2, startMs?: number) {
  const made: FakeWorker[] = [];
  const p = new RoutePool(
    size,
    () => {
      const w = new FakeWorker();
      made.push(w);
      return w as unknown as Worker;
    },
    startMs
  );
  return { p, made };
}

describe('RoutePool sleep (the route workers give their memory to a chain search)', () => {
  it('terminates idle workers, and the next request spawns them again', async () => {
    const { p, made } = pool();
    expect(made).toHaveLength(2);
    expect(p.sleep()).toBe(true);
    expect(p.asleep).toBe(true);
    expect(made.every(w => w.terminated)).toBe(true);

    const header = p.header('t.bin');
    expect(made).toHaveLength(4);
    expect(p.asleep).toBe(false);
    made[2].answer();
    await expect(header).resolves.toEqual({ from: 1 });
    expect(p.size).toBe(2);
  });

  it('never cuts off a request in flight', async () => {
    const { p, made } = pool();
    const header = p.header('t.bin');
    expect(p.idle).toBe(false);
    expect(p.sleep()).toBe(false);
    expect(made.some(w => w.terminated)).toBe(false);
    made[0].answer();
    await header;
    expect(p.sleep()).toBe(true);
  });

  it('is final after terminate: a late request is refused rather than spawning workers', async () => {
    const { p, made } = pool();
    p.terminate();
    await expect(p.header('t.bin')).rejects.toThrow('stopped');
    expect(made).toHaveLength(2);
  });

  it('interrupt cuts a request off with "paused" and frees the workers, and the pool works again after', async () => {
    const { p, made } = pool();
    const header = p.header('t.bin');
    expect(p.interrupt()).toBe(true);
    await expect(header).rejects.toThrow('paused');
    expect(made.every(w => w.terminated)).toBe(true);
    expect(p.asleep).toBe(true);
    const again = p.header('t.bin');
    expect(made).toHaveLength(4);
    made[2].answer();
    await expect(again).resolves.toEqual({ from: 1 });
    expect(p.interrupt()).toBe(false);
  });
});

describe('RoutePool limitWorkers (Safari: the polish and "Prestige by" on two route workers, 22 Oct 2026)', () => {
  it('keeps the parts and runs them on fewer workers, the first ones keeping their table', async () => {
    const { p, made } = pool(4);
    expect(p.limitWorkers(2)).toBe(true);
    expect(p.size).toBe(4);
    expect(p.workerCount).toBe(2);
    expect(made.map(w => w.terminated)).toEqual([false, false, true, true]);
    // Four parts still go out, two to each live worker.
    const asked = (p as unknown as { ask(w: number, m: unknown): Promise<unknown> }).ask.bind(p);
    const replies = [0, 1, 2, 3].map(w => asked(w, { kind: 'header', url: 't.bin' }));
    expect(made[0].inbox).toHaveLength(2);
    expect(made[1].inbox).toHaveLength(2);
    made[0].answer();
    made[0].answer();
    made[1].answer();
    made[1].answer();
    await Promise.all(replies);
    // Asleep and woken: two again.
    expect(p.sleep()).toBe(true);
    void p.header('t.bin');
    expect(made).toHaveLength(6);
  });

  it('only while idle, and grows back to every worker', async () => {
    const { p, made } = pool(4);
    const h = p.header('t.bin');
    expect(p.limitWorkers(2)).toBe(false);
    expect(p.workerCount).toBe(4);
    made[0].answer();
    await h;
    expect(p.limitWorkers(2)).toBe(true);
    expect(p.limitWorkers(9)).toBe(true);
    expect(p.workerCount).toBe(4);
    expect(made).toHaveLength(6);
    expect(made.slice(0, 2).every(w => !w.terminated)).toBe(true);
    expect(p.limitWorkers(0)).toBe(true);
    expect(p.workerCount).toBe(1);
  });
});

describe('RoutePool when a worker is lost (red team 21 Oct 2026, data-inputs #5)', () => {
  it('a crash fails the requests in flight instead of leaving them waiting, and the next request starts fresh', async () => {
    const { p, made } = pool();
    const header = p.header('t.bin');
    made[0].onerror?.({} as ErrorEvent);
    await expect(header).rejects.toThrow(/route worker stopped/);
    expect(p.idle).toBe(true);
    expect(made.slice(0, 2).every(w => w.terminated)).toBe(true);
    const again = p.header('t.bin');
    made[2].answer();
    await expect(again).resolves.toEqual({ from: 1 });
  });

  it('so does a reply the page cannot read', async () => {
    const { p, made } = pool();
    const header = p.header('t.bin');
    made[0].onmessageerror?.({} as MessageEvent);
    await expect(header).rejects.toThrow(/could not read/);
  });
});

describe('RoutePool when a worker never starts (Safari reload, 23 Oct 2026)', () => {
  const ready = (w: FakeWorker) => w.onmessage?.({ data: { kind: 'ready', id: 0 } } as MessageEvent);
  const later = (ms: number) => new Promise(r => setTimeout(r, ms));

  it('a worker that sends nothing within the start limit fails the request, as a load failure (the card with Retry)', async () => {
    const { p, made } = pool(2, 20);
    const header = p.header('t.bin');
    const failed = header.catch((e: Error) => e);
    await later(40);
    const e = await failed;
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toBe(ROUTE_WORKER_NOT_STARTED);
    expect(tableLoadFailed((e as Error).message)).toBe(true);
    expect(made.slice(0, 2).every(w => w.terminated)).toBe(true);
    // Retry: fresh workers, and one that starts answers.
    const again = p.header('t.bin');
    ready(made[2]);
    await later(40);
    made[2].answer();
    await expect(again).resolves.toEqual({ from: 1 });
  });

  it('a started worker may take as long as it needs (the table download has its own limit)', async () => {
    const { p, made } = pool(2, 20);
    const header = p.header('t.bin');
    ready(made[0]);
    await later(40);
    made[0].answer();
    await expect(header).resolves.toEqual({ from: 1 });
  });

  it('a crashed or unreadable worker is a load failure too', () => {
    expect(tableLoadFailed('A route worker stopped (it crashed or ran out of memory).')).toBe(true);
    expect(tableLoadFailed('A route worker sent a reply the page could not read.')).toBe(true);
  });
});

describe('RoutePool priceChain (a followed route on My runs, lib/followEstimate.ts)', () => {
  it('asks one worker for the route and gives back its answer', async () => {
    const { p, made } = pool(1);
    const route = { chain: [205, 238], legs: [], end: 100, seconds: 50 };
    const priced = p.priceChain('t.bin', { startTE: 194, start: 50 }, [205, 238]);
    const m = made[0].inbox.shift() as unknown as { id: number; kind: string; url: string; chain: number[] };
    expect(m).toMatchObject({ kind: 'price-chain', url: 't.bin', chain: [205, 238], options: { startTE: 194, start: 50 } });
    made[0].onmessage?.({ data: { kind: 'price-chain', id: m.id, route } } as MessageEvent);
    await expect(priced).resolves.toEqual(route);
  });

  it("a worker's error is the request's", async () => {
    const { p, made } = pool(1);
    const priced = p.priceChain('t.bin', { startTE: 194, start: 50 }, [205]);
    const m = made[0].inbox.shift()!;
    made[0].onmessage?.({ data: { kind: 'error', id: m.id, message: 'no table' } } as MessageEvent);
    await expect(priced).rejects.toThrow('no table');
  });
});
