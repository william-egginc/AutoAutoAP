import { describe, expect, it } from 'vitest';
import { RoutePool } from './routePool';

/** A worker that answers a header request when told to. */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
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

function pool(size = 2) {
  const made: FakeWorker[] = [];
  const p = new RoutePool(size, () => {
    const w = new FakeWorker();
    made.push(w);
    return w as unknown as Worker;
  });
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
