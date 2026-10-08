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
});
