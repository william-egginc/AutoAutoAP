/**
 * The richer private diagnostics (10 Oct): the run's own facts and its last beats, `lastVisitCrashed`
 * true after a crash or a failed end, and all of it well under the collector's 4 KB for the field.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, diagnosticsSummary, pageShown, SUMMARY_BEATS } from './blackBox';

beforeEach(() => {
  const backing = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
  });
  pageShown();
});

const base = { browser: 'edge on windows', cores: 20, workers: 19, carryOns: 0, crashed: null };

describe('the diagnostics summary', () => {
  it("carries the run's facts and its last beats as [minutes in, heap MB, workers]", () => {
    const start = Date.now() - 600 * 60_000;
    for (let i = 0; i < 30; i++) beat({ phase: 'deadline search', done: i * 1000, workers: 19 });
    beat({ phase: 'submit', detail: 'building the CSV' });
    const got = diagnosticsSummary({
      ...base,
      run: {
        build: '2026-10-10T12:00',
        kind: 'by-date',
        from: 'carry-on',
        runMinutes: 1170,
        pricedThisSession: 84,
        replayed: 158995,
        runCarryOns: 1,
      },
      runStartedAt: start,
    });
    expect(got.run).toMatchObject({ kind: 'by-date', from: 'carry-on', replayed: 158995 });
    const beats = got.beats as (number | null)[][];
    expect(beats).toHaveLength(SUMMARY_BEATS);
    expect(beats[0][0]).toBeGreaterThanOrEqual(599);
    expect(beats[0][2]).toBe(19);
  });

  it('says the last visit crashed after a failed end or a carry-on, not only with a crash beat at hand', () => {
    expect(diagnosticsSummary(base).lastVisitCrashed).toBe(false);
    expect(diagnosticsSummary({ ...base, lastVisitCrashed: true }).lastVisitCrashed).toBe(true);
  });

  it('stays well under the 4 KB the collector keeps', () => {
    for (let i = 0; i < 60; i++)
      beat({
        phase: 'deadline search',
        detail: 'Round 4 · 31,000 of 32,645 sets of early stops finished',
        workers: 19,
        workersHeapMB: 2900,
        workersMemoEntries: 400000,
        workersMemoCapacity: 900000,
      });
    const got = diagnosticsSummary({
      ...base,
      crashed: {
        at: Date.now(),
        phase: 'submit',
        detail: 'building the CSV of the top 20,000 routes',
        hidden: true,
        heapMB: 3900,
        workers: 19,
      },
      lastVisitCrashed: true,
      run: {
        build: '2026-10-10T12:00:00.000Z',
        builtAt: '2026-10-10T12:00:00.000Z',
        kind: 'by-date',
        from: 'carry-on',
        runMinutes: 1170,
        pricedThisSession: 159079,
        replayed: 158995,
        runCarryOns: 3,
        memoPerWorker: 48000,
        checkpointRoutes: 159079,
        checkpointKB: 31000,
        setsKept: 32645,
      },
      runStartedAt: Date.now() - 1170 * 60_000,
    });
    const size = JSON.stringify(got).length;
    expect(size).toBeLessThan(2048);
    // Never the note, an id or a timestamp.
    expect(JSON.stringify(got)).not.toMatch(/EI\d|runNote|"at":/);
  });
});
