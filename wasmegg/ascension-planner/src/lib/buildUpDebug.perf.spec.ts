/**
 * PERF BREADCRUMBS (lib/buildUpDebug.ts, spec-mainfreeze 31 Oct 2026): off by default and then nothing at all (no
 * performance.mark, no clock read, no observer); on (`aap-debug` = '1' or ?debug=1), a mark and a measure per step, a
 * `[buildup] perf <step> <ms> ms` line from 50 ms, and a long-task observer naming the nearest step. No IDs in a line.
 * A fake clock (performance.now stubbed), no waits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureLongTaskWatch,
  nearestMark,
  perfEnd,
  perfOn,
  perfStart,
  perfStep,
  setPerfFlag,
  stopLongTaskWatch,
} from './buildUpDebug';

let mem: Map<string, string>;
let now: number;
let info: ReturnType<typeof vi.spyOn>;

/** A stand-in PerformanceObserver: what it observes, and a way to hand it entries. */
class FakeObserver {
  static made: FakeObserver[] = [];
  static supportedEntryTypes = ['longtask', 'mark', 'measure'];
  observed: unknown[] = [];
  disconnected = false;
  constructor(public cb: (list: { getEntries(): { duration: number; startTime: number }[] }) => void) {
    FakeObserver.made.push(this);
  }
  observe(o: unknown): void {
    this.observed.push(o);
  }
  disconnect(): void {
    this.disconnected = true;
  }
  emit(entries: { duration: number; startTime: number }[]): void {
    this.cb({ getEntries: () => entries });
  }
}

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.stubGlobal('location', { search: '' });
  FakeObserver.made = [];
  vi.stubGlobal('PerformanceObserver', FakeObserver);
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  stopLongTaskWatch();
  setPerfFlag(null);
});
afterEach(() => {
  stopLongTaskWatch();
  setPerfFlag(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('off (the default)', () => {
  it('marks nothing, measures nothing, reads no clock, watches nothing, says nothing', () => {
    const mark = vi.spyOn(performance, 'mark');
    const measure = vi.spyOn(performance, 'measure');
    expect(perfOn()).toBe(false);
    expect(perfStep('sim request build', () => 42)).toBe(42);
    const t0 = perfStart('collectInputs');
    expect(t0).toBeNull();
    now += 5000;
    perfEnd('collectInputs', t0);
    ensureLongTaskWatch();
    expect(mark).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
    expect(performance.now).not.toHaveBeenCalled();
    expect(FakeObserver.made).toHaveLength(0);
    expect(info).not.toHaveBeenCalled();
  });

  it('reads the flag once per page load: turned on later, it stays off until the page loads again', () => {
    expect(perfOn()).toBe(false);
    mem.set('aap-debug', '1');
    expect(perfOn()).toBe(false);
    setPerfFlag(null); // what a reload does
    expect(perfOn()).toBe(true);
  });

  it('a throwing step still throws, with the flag off and on', () => {
    expect(() => perfStep('x', () => { throw new Error('boom'); })).toThrow('boom');
    setPerfFlag(true);
    expect(() => perfStep('x', () => { throw new Error('boom'); })).toThrow('boom');
  });
});

describe('on (aap-debug = 1 or ?debug=1)', () => {
  beforeEach(() => mem.set('aap-debug', '1'));

  it('?debug=1 turns it on too', () => {
    mem.clear();
    vi.stubGlobal('location', { search: '?debug=1' });
    setPerfFlag(null);
    expect(perfOn()).toBe(true);
  });

  it('a step of 50 ms or more is marked, measured and said; a shorter one is marked and measured only', () => {
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => undefined as never);
    const measure = vi.spyOn(performance, 'measure').mockImplementation(() => undefined as never);
    expect(perfStep('collectInputs', () => { now += 120; return 'in'; })).toBe('in');
    expect(mark).toHaveBeenCalledWith('aap:collectInputs:start');
    expect(measure).toHaveBeenCalledWith('aap:collectInputs', { start: 1000, end: 1120 });
    expect(info).toHaveBeenCalledWith('[buildup] perf collectInputs 120 ms');
    info.mockClear();
    perfStep('readSimRecords', () => { now += 49; });
    expect(info).not.toHaveBeenCalled();
    expect(measure).toHaveBeenCalledWith('aap:readSimRecords', { start: 1120, end: 1169 });
    perfStep('recordSim', () => { now += 50; });
    expect(info).toHaveBeenCalledWith('[buildup] perf recordSim 50 ms');
  });

  it('a quiet step (each worker reply) is said from 50 ms but never marked', () => {
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => undefined as never);
    vi.spyOn(performance, 'measure').mockImplementation(() => undefined as never);
    const t0 = perfStart('worker reply read', true);
    now += 300;
    perfEnd('worker reply read (evaluate)', t0);
    expect(mark).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('[buildup] perf worker reply read (evaluate) 300 ms');
  });

  it('never says an ID (EI + 16 digits masked)', () => {
    vi.spyOn(performance, 'mark').mockImplementation(() => undefined as never);
    vi.spyOn(performance, 'measure').mockImplementation(() => undefined as never);
    const t0 = perfStart('step EI1234567890123456');
    now += 80;
    perfEnd('step EI1234567890123456', t0, 'for EI1234567890123456');
    const said = info.mock.calls.map(c => String(c[0])).join('\n');
    expect(said).toContain('[buildup] perf step EI… 80 ms (for EI…)');
    expect(said).not.toMatch(/EI\d{16}/);
  });

  it('wires one long-task observer, and a long task names the nearest step marked before it', () => {
    vi.spyOn(performance, 'mark').mockImplementation(() => undefined as never);
    vi.spyOn(performance, 'measure').mockImplementation(() => undefined as never);
    perfStep('sim request build', () => { now += 10; });
    now = 5000;
    perfStep('sim pool create', () => { now += 10; });
    ensureLongTaskWatch();
    expect(FakeObserver.made).toHaveLength(1);
    expect(FakeObserver.made[0].observed).toEqual([{ type: 'longtask', buffered: true }]);
    FakeObserver.made[0].emit([{ duration: 45_300.4, startTime: 5200 }]);
    expect(info).toHaveBeenCalledWith('[buildup] longtask 45300 ms, nearest mark sim pool create (200 ms before)');
    FakeObserver.made[0].emit([{ duration: 70, startTime: 1500 }]);
    expect(info).toHaveBeenCalledWith('[buildup] longtask 70 ms, nearest mark sim request build (500 ms before)');
    FakeObserver.made[0].emit([{ duration: 70, startTime: 10 }]);
    expect(info).toHaveBeenCalledWith('[buildup] longtask 70 ms, nearest mark none');
    expect(nearestMark(999_999)).toBe('sim pool create (994999 ms before)');
  });

  it('no long-task support (Safari, Firefox): no observer, no error', () => {
    FakeObserver.supportedEntryTypes = ['mark', 'measure'];
    try {
      ensureLongTaskWatch();
      expect(FakeObserver.made).toHaveLength(0);
    } finally {
      FakeObserver.supportedEntryTypes = ['longtask', 'mark', 'measure'];
    }
  });
});
