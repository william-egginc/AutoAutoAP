import { beforeEach, describe, expect, it } from 'vitest';
import {
  GAP_MS,
  MAX_GAPS,
  MAX_SAMPLES,
  MAX_SENDS,
  PAYLOAD_MAX_CHARS,
  SAMPLE_EVERY_MS,
  beginTimeline,
  boundSamples,
  finishTimeline,
  gapSecondsSince,
  hiddenShare,
  newTimeline,
  noteSendIn,
  noteWorkerChange,
  readTimeline,
  startTimeline,
  tickTimeline,
  timelineFor,
  timelinePayload,
  updateTimeline,
  type Sample,
  type Timeline,
  type TickInput,
  noteFaultIn,
  MAX_FAULTS,
  workerHoursOf,
  workersSummary,
} from './runTimeline';

const T0 = 1_760_000_000_000;
const MIN = 60_000;

function tick(t: Timeline, at: number, more: Partial<TickInput> = {}): Timeline {
  return tickTimeline(t, {
    now: T0 + at,
    routes: Math.round(at / 1000),
    legs: Math.round(at / 500),
    workers: 7,
    hidden: false,
    online: true,
    ...more,
  });
}

/** Ticks every 15 s from `from` to `to` (ms into the run). */
function run(t: Timeline, from: number, to: number, more: (at: number) => Partial<TickInput> = () => ({})): Timeline {
  for (let at = from; at <= to; at += 15_000) t = tick(t, at, more(at));
  return t;
}

const fresh = () =>
  newTimeline({
    runId: T0,
    deadline: 1_800_000_000,
    estimate: { seconds: 360, workers: 7, legs: 5000, source: 'machine' },
  });

describe('tickTimeline', () => {
  it('samples speed every 10 minutes: routes and legs a minute, workers, hidden share, online', () => {
    const t = run(fresh(), 0, 30 * MIN);
    expect(t.samples).toHaveLength(3);
    const [at, span, rpm, lpm, workers, hidden, online] = t.samples[0];
    expect(at).toBe(0);
    expect(span).toBe(10);
    expect(rpm).toBe(60); // a route a second
    expect(lpm).toBe(120);
    expect(workers).toBe(7);
    expect(hidden).toBe(0);
    expect(online).toBe(1);
  });

  it('records the share of the time hidden, the workers time-weighted, and any time offline', () => {
    const t = run(fresh(), 0, 10 * MIN, at => ({
      hidden: at >= 5 * MIN,
      workers: at >= 5 * MIN ? 2 : 7,
      online: at !== 7 * MIN,
    }));
    const [, , , , workers, hidden, online] = t.samples[0];
    expect(hidden).toBeCloseTo(0.5, 1);
    expect(workers).toBeCloseTo(4.5, 0);
    expect(online).toBe(0);
  });

  it('notes a gap over 2 minutes between ticks (asleep or frozen), with whether the tab was hidden', () => {
    let t = run(fresh(), 0, 5 * MIN);
    t = tick(t, 5 * MIN + GAP_MS - 1000);
    expect(t.gaps).toHaveLength(0);
    t = tick(t, 5 * MIN + GAP_MS - 1000 + 47 * MIN, { hidden: true });
    expect(t.gaps).toHaveLength(1);
    expect(t.gaps[0][1]).toBe(47);
    expect(t.gaps[0][2]).toBe(1);
    expect(t.gapMinutes).toBe(47);
    expect(gapSecondsSince(t, T0)).toBe(47 * 60);
    expect(gapSecondsSince(t, T0 + 60 * MIN)).toBe(0);
  });

  it('records the estimate the first time progress reaches 10, 50 and 90 %', () => {
    let t = fresh();
    t = tick(t, MIN, { pct: 5, secondsLeft: 600 });
    t = tick(t, 2 * MIN, { pct: 12, secondsLeft: 540 });
    t = tick(t, 3 * MIN, { pct: 14, secondsLeft: 500 });
    t = tick(t, 9 * MIN, { pct: 95, secondsLeft: null });
    expect(t.milestones.map(m => m.pct)).toEqual([10, 50, 90]);
    expect(t.milestones[0]).toEqual({ pct: 10, atMin: 2, leftMin: 9, workers: 7 });
    expect(t.milestones[2].leftMin).toBeNull();
  });

  it('notes worker crashes and stalls as the pool counts grow', () => {
    let t = tick(fresh(), 0, { pool: { made: 7, crashed: 0, stalled: 0 } });
    t = tick(t, MIN, { pool: { made: 8, crashed: 1, stalled: 0 } });
    t = tick(t, 2 * MIN, { pool: { made: 9, crashed: 1, stalled: 1 } });
    expect(t.workerEvents.map(e => e[1])).toEqual(['crash', 'stall']);
    expect(timelinePayload(t).pool).toEqual({ made: 9, crashed: 1, stalled: 1 });
  });

  it('keeps the memo peak', () => {
    let t = tick(fresh(), 0, { memo: 100 });
    t = tick(t, MIN, { memo: 900 });
    t = tick(t, 2 * MIN, { memo: 400 });
    expect(t.memoPeak).toBe(900);
  });

  it('starts a new baseline when a carried-on session counts from 0 again', () => {
    let t = run(fresh(), 0, 12 * MIN);
    t = startTimeline(t, { runId: T0, estimate: { seconds: 200 }, carryOn: true });
    expect(t.sessions).toBe(2);
    expect(t.carryOnEstimates).toEqual([200]);
    // The new session's counts are small again: no negative speed.
    t = run(t, 60 * MIN, 75 * MIN, at => ({ routes: Math.round((at - 60 * MIN) / 1000), legs: 0 }));
    expect(t.samples.every(s => s[2] >= 0)).toBe(true);
    expect(t.samples.length).toBeGreaterThan(1);
  });

  it('a different run starts afresh', () => {
    const t = startTimeline(run(fresh(), 0, 12 * MIN), { runId: T0 + 1, estimate: null, carryOn: true });
    expect(t.sessions).toBe(1);
    expect(t.samples).toEqual([]);
  });
});

describe('bounds', () => {
  it('holds the samples to MAX_SAMPLES, merging the older ones', () => {
    const many: Sample[] = Array.from({ length: MAX_SAMPLES + 50 }, (_, i) => [i * 10, 10, 60, 120, 7, 0, 1, null]);
    const out = boundSamples(many);
    expect(out.length).toBeLessThanOrEqual(MAX_SAMPLES);
    // The newest are as measured; the oldest cover more time; the minutes add up.
    expect(out[out.length - 1]).toEqual(many[many.length - 1]);
    expect(out[0][1]).toBeGreaterThan(10);
    expect(out.reduce((n, s) => n + s[1], 0)).toBeCloseTo(many.length * 10, 5);
    expect(out.every(s => s[2] === 60 && s[3] === 120)).toBe(true);
  });

  it('keeps the last MAX_SENDS sends and MAX_GAPS gaps', () => {
    let t = fresh();
    for (let i = 0; i < MAX_SENDS + 10; i++) t = noteSendIn(t, { now: T0 + i * MIN, what: 'progress', ok: true });
    expect(t.sends).toHaveLength(MAX_SENDS);
    for (let i = 0; i < MAX_GAPS + 10; i++) t = tick(t, i * 10 * MIN);
    expect(t.gaps).toHaveLength(MAX_GAPS);
  });
});

describe('timelinePayload', () => {
  it('says the estimate, the milestones, the end and the ratio of actual to estimated', () => {
    let t = run(fresh(), 0, 21 * MIN, at => ({ pct: Math.min(99, (at / (21 * MIN)) * 100), workers: 2 }));
    t = noteWorkerChange(t, T0 + MIN, 7, 2);
    t = noteSendIn(t, { now: T0 + 21 * MIN, what: 'final', ok: true, status: 200, bytes: 4096 });
    t = finishTimeline(t, { now: T0 + 21 * MIN, activeSeconds: 21 * 60, routes: 1260, legs: 2520, how: 'done' });
    const p = timelinePayload(t);
    expect(p.est).toEqual({ min: 6, workers: 7, legs: 5000, src: 'machine' });
    expect(p.end).toEqual({ min: 21, activeMin: 21, routes: 1260, legs: 2520, how: 'done', ratio: 3.5 });
    expect((p.at as unknown[]).length).toBe(3);
    expect(p.sends).toEqual([[21, 'final', 1, 200, 4, 1, 1]]);
    expect(p.wk).toEqual([[1, 'resize', 7, 2]]);
  });

  it("keeps why a send failed, and nothing extra on one that worked", () => {
    let t = fresh();
    t = noteSendIn(t, { now: T0 + MIN, what: 'csv-head', ok: false, tries: 3, why: 'blocked by CORS, or offline' });
    t = noteSendIn(t, { now: T0 + 2 * MIN, what: 'csv-so-far', ok: true, status: 200, why: 'ignored' });
    expect(t.sends).toEqual([
      [1, 'csv-head', 0, null, 0, 1, 3, 'blocked by CORS, or offline'],
      [2, 'csv-so-far', 1, 200, 0, 1, 1],
    ]);
  });

  it('a 42-hour run with everything full stays under PAYLOAD_MAX_CHARS', () => {
    let t = fresh();
    for (let at = 0; at <= 42 * 60 * MIN; at += 15_000) {
      t = tickTimeline(t, {
        now: T0 + at,
        routes: Math.round(at / 457),
        legs: Math.round(at / 231),
        workers: 19,
        hidden: at % (3 * 60 * MIN) < 30 * MIN,
        online: true,
        memo: 41_830 + (at % 997),
        pct: (at / (42 * 60 * MIN)) * 95,
        secondsLeft: (42 * 60 * MIN - at) / 1000,
        pool: { made: 19, crashed: 0, stalled: 0 },
      });
    }
    for (let i = 0; i < 60; i++) {
      t = noteSendIn(t, {
        now: T0 + i * 40 * MIN,
        what: i % 2 ? 'csv-so-far' : 'progress',
        ok: i % 7 !== 0,
        status: 200,
        bytes: 7_100_000,
        parts: 1,
        tries: 2,
      });
      t = noteWorkerChange(t, T0 + i * 40 * MIN, 19, 12);
    }
    for (let i = 0; i < 60; i++)
      t = { ...t, gaps: [...t.gaps, [i * 30, 12.5, 1] as [number, number, 0 | 1]].slice(-MAX_GAPS) };
    t = finishTimeline(t, {
      now: T0 + 42 * 60 * MIN,
      activeSeconds: 41 * 3600,
      routes: 330_000,
      legs: 654_000,
      how: 'done',
    });
    expect(t.samples.length).toBeGreaterThan(200);
    const text = JSON.stringify(timelinePayload(t));
    expect(text.length).toBeLessThanOrEqual(PAYLOAD_MAX_CHARS);
    // Still the speed timeline, not just the headline.
    expect((timelinePayload(t).s as unknown[]).length).toBeGreaterThan(30);
    // The whole private extra (this plus the 4 KB diagnostics at most) fits the collector's 16 KB.
    expect(text.length + 4096 + 64).toBeLessThan(16 * 1024);
  });

  it('a timeline that cannot fit sends its headline only', () => {
    let t = run(fresh(), 0, 60 * MIN);
    const p = timelinePayload(t, 300);
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(400);
    expect((p.s as unknown[] | undefined)?.length ?? 0).toBe(0);
    t = finishTimeline(t, { now: T0 + 60 * MIN, activeSeconds: 3600, routes: 3600, legs: 7200, how: 'stopped' });
    expect(timelinePayload(t).end).toMatchObject({ how: 'stopped', ratio: 10 });
  });

  it('carries no timestamps, only minutes into the run', () => {
    const t = run(fresh(), 0, 25 * MIN);
    const text = JSON.stringify(timelinePayload(t));
    expect(text).not.toContain(String(T0).slice(0, 6));
  });
});

describe('hiddenShare', () => {
  it('is the hidden share of the sampled time, or null with no samples', () => {
    expect(hiddenShare(null)).toBeNull();
    expect(hiddenShare(fresh())).toBeNull();
    const t = run(fresh(), 0, 20 * MIN, at => ({ hidden: at >= 10 * MIN }));
    expect(hiddenShare(t)).toBeCloseTo(0.5, 1);
  });
});

describe('storage', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  it('begins, updates, and hands out the payload for the run with that deadline only', () => {
    beginTimeline({ runId: T0, deadline: 1_800_000_000, estimate: { seconds: 600 }, carryOn: false });
    updateTimeline(t => noteSendIn(t, { now: T0 + MIN, what: 'progress', ok: false, status: 503 }));
    expect(readTimeline()?.sends).toHaveLength(1);
    expect(timelineFor(1_800_000_000)).toMatchObject({ est: { min: 10 } });
    expect(timelineFor(1_800_000_001)).toBeUndefined();
  });

  it('never throws when storage is blocked', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(() => beginTimeline({ runId: T0, estimate: null, carryOn: false })).not.toThrow();
    expect(() => updateTimeline(t => t)).not.toThrow();
    expect(readTimeline()).toBeNull();
    expect(timelineFor(1)).toBeUndefined();
  });

  it('SAMPLE_EVERY_MS is 10 minutes', () => {
    expect(SAMPLE_EVERY_MS).toBe(10 * MIN);
  });
});

describe('faults (12 Oct: what and why memory errors happen)', () => {
  it('records each fault with its state, swept of player ids, and the payload carries them', () => {
    let t = newTimeline({ runId: 0, estimate: null });
    t = noteFaultIn(t, { at: 90_000, kind: 'crash', worker: 3, workers: 19, hidden: true, heapMB: 201.4, memo: 43627, pct: 61.2, message: '' });
    t = noteFaultIn(t, { at: 120_000, kind: 'page', workers: 19, hidden: false, heapMB: 202, message: 'Round 4 · EI1234567890123456; died; next load navigate' });
    expect(t.faults![0]).toEqual([1.5, 'crash', 3, 19, 1, 201, 43627, 61, '']);
    expect(t.faults![1][8]).toBe('Round 4 · EI[redacted]; died; next load navigate');
    const p = timelinePayload(t) as { faults?: unknown[]; faultCols?: string };
    expect(p.faults).toHaveLength(2);
    expect(p.faultCols).toMatch(/^min,what,worker/);
    for (let i = 0; i < 30; i++) t = noteFaultIn(t, { at: i, kind: 'stall', message: 'silent 10 minutes' });
    expect(t.faults).toHaveLength(MAX_FAULTS);
  });
});

describe("the run's workers over its life (Q1, 18 Oct 2026: 19, then 5 for three hours, then 19)", () => {
  // 19 from the start, 5 from minute 362, back to 19 at 542 (in four quick steps, as the slider gives
  // them), 600 minutes in all, never hidden.
  function jordans(): Timeline {
    let t = fresh();
    t = noteWorkerChange(t, T0 + 1 * MIN, 10, 18);
    t = noteWorkerChange(t, T0 + 1.1 * MIN, 18, 19);
    t = run(t, 0, 362 * MIN, () => ({ workers: 19 }));
    t = noteWorkerChange(t, T0 + 362 * MIN, 19, 5);
    t = run(t, 362 * MIN + 15_000, 542 * MIN, () => ({ workers: 5 }));
    for (const [m, a, b] of [[542.1, 5, 16], [542.1, 16, 17], [542.1, 17, 18], [542.2, 18, 19]] as const)
      t = noteWorkerChange(t, T0 + m * MIN, a, b);
    return run(t, 542 * MIN + 15_000, 600 * MIN, () => ({ workers: 19 }));
  }
  const at = (s: number) => `min ${Math.round((s * 1000 - T0) / MIN)}`;

  it('says each count with when it began, the worker-hours and the hidden time', () => {
    const line = workersSummary(jordans(), at)!;
    expect(line).toMatch(/^19 from the start; 5 from min 362; 19 from min 542\. \d+ worker-hours over \d+\.\d h; never hidden$/);
    const w = workerHoursOf(jordans())!;
    // 19 x (362 + 58) min + 5 x 180 min = 148 worker-hours.
    expect(w.workerHours).toBeGreaterThan(144);
    expect(w.workerHours).toBeLessThan(152);
    expect(w.averageWorkers).toBeGreaterThan(14);
    expect(w.averageWorkers).toBeLessThan(15.5);
  });

  it('a run that never changed is one count; a hidden one says how much', () => {
    const steady = run(fresh(), 0, 60 * MIN, () => ({ workers: 7 }));
    expect(workersSummary(steady, at)).toMatch(/^7 from the start\. 7 worker-hours over 1\.0 h; never hidden$/);
    const hidden = run(fresh(), 0, 60 * MIN, x => ({ workers: 7, hidden: x > 30 * MIN }));
    expect(workersSummary(hidden, at)).toMatch(/hidden 50% of the time$/);
    expect(workersSummary(fresh(), at)).toBeNull();
    expect(workerHoursOf(fresh())).toBeNull();
  });
});
