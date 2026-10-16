import { describe, expect, it } from 'vitest';
import { TICK_MS, createMinuteClock } from './useMinuteClock';

function fakes() {
  let t = 1_800_000_000_000;
  const timers = new Map<number, () => void>();
  let next = 1;
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_: 'visibilitychange', fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: 'visibilitychange', fn: () => void) => void listeners.delete(fn),
  };
  return {
    doc,
    timers,
    listeners,
    advance(ms: number) {
      t += ms;
      for (const fn of timers.values()) fn();
    },
    show(v: 'visible' | 'hidden') {
      doc.visibilityState = v;
      for (const fn of listeners) fn();
    },
    api: {
      setInterval: (fn: () => void, ms: number) => {
        expect(ms).toBe(TICK_MS);
        timers.set(next, fn);
        return next++;
      },
      clearInterval: (id: unknown) => void timers.delete(id as number),
      now: () => t,
    },
  };
}

describe('the minute clock', () => {
  it('ticks once a minute while visible, one interval only', () => {
    const f = fakes();
    const c = createMinuteClock(f.doc, f.api);
    c.start();
    expect(f.timers.size).toBe(1);
    const t0 = c.now.value;
    f.advance(TICK_MS);
    expect(c.now.value).toBe(t0 + 60);
    f.show('visible');
    expect(f.timers.size).toBe(1);
  });

  it('stops while hidden and catches up when shown', () => {
    const f = fakes();
    const c = createMinuteClock(f.doc, f.api);
    c.start();
    const t0 = c.now.value;
    f.show('hidden');
    expect(f.timers.size).toBe(0);
    f.advance(10 * TICK_MS);
    expect(c.now.value).toBe(t0);
    f.show('visible');
    expect(c.now.value).toBe(t0 + 600);
    expect(f.timers.size).toBe(1);
  });

  it('stops for good on unmount', () => {
    const f = fakes();
    const c = createMinuteClock(f.doc, f.api);
    c.start();
    c.stop();
    expect(f.timers.size).toBe(0);
    expect(f.listeners.size).toBe(0);
  });
});
