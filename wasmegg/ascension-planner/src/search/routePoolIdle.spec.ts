import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutePool } from './routePool';
import { IDLE_SLEEP_MS, HIDDEN_SLEEP_MS, sleepWhenIdle } from './routePoolIdle';

/** A worker that answers a header request when told to. */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  terminated = false;
  inbox: { id: number; kind: string }[] = [];
  postMessage(m: { id: number; kind: string }) {
    if (this.terminated) return;
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

/** A page whose visibility the spec flips. */
class FakeDoc extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
  set(state: 'visible' | 'hidden') {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

const MIN = 60_000;

function setup() {
  const made: FakeWorker[] = [];
  const p = new RoutePool(2, () => {
    const w = new FakeWorker();
    made.push(w);
    return w as unknown as Worker;
  });
  const doc = new FakeDoc();
  const stop = sleepWhenIdle(p, { doc });
  return { p, made, doc, stop };
}

describe('sleepWhenIdle (the idle route workers go on every browser)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('uses 2 minutes idle and 60 s hidden', () => {
    expect(IDLE_SLEEP_MS).toBe(2 * MIN);
    expect(HIDDEN_SLEEP_MS).toBe(MIN);
  });

  it('sleeps after 2 minutes with no ask, not before', () => {
    const { p } = setup();
    vi.advanceTimersByTime(2 * MIN - 1000);
    expect(p.asleep).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(p.asleep).toBe(true);
  });

  it('sleeps once hidden for 60 s; visible again before that, it stays up', () => {
    const { p, doc } = setup();
    doc.set('hidden');
    vi.advanceTimersByTime(MIN - 1000);
    expect(p.asleep).toBe(false);
    doc.set('visible');
    vi.advanceTimersByTime(MIN);
    expect(p.asleep).toBe(false);
    doc.set('hidden');
    vi.advanceTimersByTime(MIN);
    expect(p.asleep).toBe(true);
  });

  it('wakes on the next ask, which is answered, and sleeps again after another idle spell', async () => {
    const { p, made } = setup();
    vi.advanceTimersByTime(2 * MIN);
    expect(p.asleep).toBe(true);
    const header = p.header('t.bin');
    expect(p.asleep).toBe(false);
    expect(made).toHaveLength(4);
    made[2].answer();
    await expect(header).resolves.toEqual({ from: 1 });
    vi.advanceTimersByTime(2 * MIN - 1000);
    expect(p.asleep).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(p.asleep).toBe(true);
  });

  it('does not sleep mid-ask, and the idle clock runs from its end', async () => {
    const { p, made } = setup();
    vi.advanceTimersByTime(MIN);
    const header = p.header('t.bin');
    vi.advanceTimersByTime(5 * MIN);
    expect(p.asleep).toBe(false);
    expect(made.some(w => w.terminated)).toBe(false);
    made[0].answer();
    await header;
    vi.advanceTimersByTime(2 * MIN - 1000);
    expect(p.asleep).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(p.asleep).toBe(true);
  });

  it('does not sleep a pending ask while hidden for 60 s; the hidden clock runs from its end', async () => {
    const { p, made, doc } = setup();
    const header = p.header('t.bin');
    doc.set('hidden');
    vi.advanceTimersByTime(3 * MIN);
    expect(p.asleep).toBe(false);
    made[0].answer();
    await header;
    vi.advanceTimersByTime(MIN - 1000);
    expect(p.asleep).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(p.asleep).toBe(true);
  });

  it('removes its timers and listeners on stop and on terminate', () => {
    const a = setup();
    a.stop();
    a.doc.set('hidden');
    vi.advanceTimersByTime(5 * MIN);
    expect(a.p.asleep).toBe(false);

    const b = setup();
    b.doc.set('hidden');
    b.p.terminate();
    expect(vi.getTimerCount()).toBe(0);
    b.doc.set('visible');
    b.doc.set('hidden');
    expect(vi.getTimerCount()).toBe(0);
  });
});
