import { describe, expect, it } from 'vitest';
import type { LegSummary } from '@/search/types';
import {
  FORECAST_WORDS,
  NO_SAVE_WORDS,
  OTHER_EGG_WORDS,
  clockWords,
  gapWords,
  paceLine,
  paceWords,
  planEggAt,
  planPace,
  progressOf,
  type PaceLine,
  type PaceState,
} from './planPace';
import { getThresholdForTE } from './truthEggs';

const H = 3600;
const T0 = 1_792_000_000; // the plan start: Oct 14, 2026 at 12:46 PM in Chicago
const ZONE = 'America/Chicago';
const leg = (
  start: number,
  end: number,
  endTE: number,
  shifts: LegSummary['shifts'],
  endEgg: { egg: string; te: number },
  more: Partial<LegSummary> = {}
) =>
  ({
    key: 'continue',
    endTE,
    durationSeconds: end - start,
    maxELR: 0,
    endTime: end,
    tier13Unlocked: false,
    startTime: start,
    shifts,
    endEgg,
    ...more,
  }) as LegSummary;

// nowPlan.spec's plan: two ascensions from 186 TE, a prestige at 190 then 200. Shift by shift the line is 186 at T0,
// 187 at +2 h, 188 at +4 h, 189 at +6 h, 191 at +10 h, flat to +11 h, then Kindness 36 → 46 from +15 h to +30 h.
const legs: LegSummary[] = [
  leg(
    T0,
    T0 + 10 * H,
    190,
    [
      { at: T0 + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 },
      { at: T0 + 6 * H, egg: 'humility', fromEgg: 'integrity', te: 39 },
    ],
    { egg: 'humility', te: 38 }
  ),
  leg(T0 + 11 * H, T0 + 30 * H, 200, [{ at: T0 + 15 * H, egg: 'kindness', fromEgg: 'resilience', te: 37 }], {
    egg: 'kindness',
    te: 46,
  }),
];
const teStart = [40, 37, 36, 37, 36]; // 186
const PLAN_SAVE = T0 - 1800;

const shiftLine = paceLine({
  legs,
  planStart: T0,
  startTEByEgg: teStart,
  startTE: 186,
  planSave: PLAN_SAVE,
}) as PaceLine;
const roughLine = paceLine({ legs, planStart: T0, startTE: 186, planSave: PLAN_SAVE }) as PaceLine;
const at = (seconds: number, progress: number, onVirtue = true, egg: string | null = null) => ({
  seconds,
  progress,
  onVirtue,
  egg,
});
const hoursOf = (s: PaceState) => (s as { hours: number }).hours;

describe('the plan’s line', () => {
  it('shift by shift when the legs carry each shift’s TE and each egg’s start TE is known', () => {
    expect(shiftLine.rough).toBe(false);
    expect(shiftLine.startTE).toBe(186);
    expect(shiftLine.goalTE).toBe(200);
    expect(shiftLine.teAt(T0 + 4 * H)).toBe(188);
    expect(shiftLine.teAt(T0 + 10.5 * H)).toBe(191); // flat across the prestige wait
    expect(shiftLine.stops).toEqual([
      { te: 190, at: T0 + 10 * H },
      { te: 200, at: T0 + 30 * H },
    ]);
  });

  it('leg by leg ("rough") without each egg’s start TE: a straight line from the last stop to the leg’s end', () => {
    expect(roughLine.rough).toBe(true);
    expect(roughLine.teAt(T0 + 5 * H)).toBeCloseTo(188, 6); // 186 → 190 over 10 h
    expect(roughLine.teAt(T0 + 10.5 * H)).toBe(190);
    expect(roughLine.teAt(T0 + 20.5 * H)).toBeCloseTo(195, 6); // 190 → 200 over 19 h
  });

  it('leg by leg when the shifts carry no TE (priced before 15 Oct)', () => {
    const old = legs.map(l => ({ ...l, shifts: l.shifts!.map(s => ({ ...s, te: undefined })) }));
    const line = paceLine({ legs: old, planStart: T0, startTEByEgg: teStart }) as PaceLine;
    expect(line.rough).toBe(true);
    expect(line.startTE).toBe(186);
  });

  it('flat through the build phase, then straight to the leg’s end', () => {
    const built = [{ ...legs[0], buildPhaseEndTime: T0 + 5 * H }, legs[1]];
    const line = paceLine({ legs: built, planStart: T0, startTE: 186 }) as PaceLine;
    expect(line.teAt(T0 + 3 * H)).toBe(186);
    expect(line.teAt(T0 + 5 * H)).toBe(186);
    expect(line.teAt(T0 + 7.5 * H)).toBeCloseTo(188, 6);
    // 188 at +4 h is 3.5 h ahead on this line (1 h ahead on the straight one).
    expect(hoursOf(planPace(line, at(T0 + 4 * H, 188)))).toBeCloseTo(3.5, 2);
    expect(hoursOf(planPace(roughLine, at(T0 + 4 * H, 188)))).toBeCloseTo(1, 2);
  });

  it('an instant answer’s table legs: leg by leg, marked an estimate', () => {
    const line = paceLine({
      tableLegs: [
        { start: T0, end: T0 + 10 * H, endTE: 190 },
        { start: T0 + 11 * H, end: T0 + 30 * H, endTE: 200 },
      ],
      startTE: 186,
      estimate: true,
    }) as PaceLine;
    expect(line.rough).toBe(true);
    expect(line.estimate).toBe(true);
    expect(line.start).toBe(T0);
  });

  it('no line: legs without their times, or no start TE at all', () => {
    expect(paceLine({ legs: legs.map(l => ({ ...l, replayed: true as const })), startTE: 186 })).toBe('no-timeline');
    expect(paceLine({ legs: [], startTE: 186 })).toBe('no-timeline');
    expect(paceLine({ legs: null, tableLegs: null })).toBe('no-timeline');
    expect(paceLine({ legs, planStart: T0 })).toBe('no-te');
  });
});

describe('the save’s progress: whole TE only', () => {
  const raw = (integrityDelivered: number, eggType = 51) => ({
    settings: { lastBackupTime: T0 + 2 * H },
    virtue: { eovEarned: [40, 37, 36, 37, 36], eggsDelivered: [0, integrityDelivered, 0, 0, 0] },
    farms: [{ eggType }],
  });
  const thr = getThresholdForTE;

  it('TE per egg (pending counted) and the egg the farm is on; no credit for the way to the next TE', () => {
    const half = thr(37) + (thr(38) - thr(37)) / 2;
    expect(progressOf(raw(half), T0 + 2 * H)).toEqual({
      seconds: T0 + 2 * H,
      progress: 186,
      onVirtue: true,
      egg: 'integrity',
    });
    expect(progressOf(null, T0)).toBeNull();
  });

  it('just short of a threshold counts the TE below it; the threshold itself counts (pending)', () => {
    expect(progressOf(raw(thr(38) - (thr(38) - thr(37)) * 0.01), T0 + 2 * H)!.progress).toBe(186); // 99% of the way
    expect(progressOf(raw(thr(38)), T0 + 2 * H)!.progress).toBe(187);
  });

  it('no virtue farm: no egg to check, the same maths, and the detail says so', () => {
    const p = progressOf(raw(thr(37) + 10, 1), T0 + 2 * H)!;
    expect(p).toEqual({ seconds: T0 + 2 * H, progress: 186, onVirtue: false, egg: null });
    const w = paceWords(planPace(shiftLine, at(T0 + 4 * H, 188, false)), T0 + 5 * H, ZONE);
    expect(w.detail).toContain('Not on your virtue farm in this save.');
  });
});

describe('the plan’s egg at a moment', () => {
  it('the first shift’s egg it leaves, each shift’s egg, the end egg through the wait, the next leg’s start egg', () => {
    expect(planEggAt(legs, T0 - H)).toBe('curiosity');
    expect(planEggAt(legs, T0 + H)).toBe('curiosity');
    expect(planEggAt(legs, T0 + 2 * H)).toBe('integrity');
    expect(planEggAt(legs, T0 + 7 * H)).toBe('humility');
    expect(planEggAt(legs, T0 + 10.5 * H)).toBe('humility'); // the wait before the prestige
    expect(planEggAt(legs, T0 + 12 * H)).toBe('resilience');
    expect(planEggAt(legs, T0 + 20 * H)).toBe('kindness');
    expect(planEggAt(legs, T0 + 99 * H)).toBe('kindness');
    expect(shiftLine.eggAt?.(T0 + 3 * H)).toBe('integrity');
  });

  it('the line counts whole TE: the egg being laid only gains a TE when it gets there', () => {
    expect(shiftLine.teAt(T0 + 2.5 * H)).toBe(187); // Integrity 37.25 → 37
    expect(shiftLine.teAt(T0 + 3.99 * H)).toBe(187);
    expect(shiftLine.teAt(T0 + 4 * H)).toBe(188);
    expect(roughLine.teAt(T0 + 4 * H)).toBe(187); // 186 → 190 over 10 h: 187.6 → 187
  });
});

describe('ahead, behind, on schedule', () => {
  it('on schedule: within an hour either way', () => {
    const s = planPace(shiftLine, at(T0 + 4 * H, 188));
    expect(s.kind).toBe('on-schedule');
    expect(paceWords(s, T0 + 5 * H, ZONE)).toMatchObject({
      badge: 'On schedule (within an hour)',
      asOf: 'as of 4:46 PM',
      text: 'On schedule (within an hour), as of 4:46 PM',
      tone: 'ok',
      greyed: false,
    });
    expect(planPace(shiftLine, at(T0 + 4 * H, 188.4)).kind).toBe('on-schedule'); // 0.8 h ahead
  });

  it('the same whole TE as the plan expects is on schedule, wherever the plan is inside that TE', () => {
    // The plan has 187 from +2 h to +4 h.
    expect(planPace(shiftLine, at(T0 + 2 * H, 187))).toMatchObject({ kind: 'on-schedule', hours: 0 });
    expect(planPace(shiftLine, at(T0 + 3.9 * H, 187))).toMatchObject({ kind: 'on-schedule', hours: 0 });
  });

  it('3 hours ahead: the plan only gets the save’s TE 3 hours after the save', () => {
    const s = planPace(shiftLine, at(T0 + 3 * H, 189)); // the plan has 187 at +3 h and gets 189 at +6 h
    expect(s.kind).toBe('ahead');
    expect(hoursOf(s)).toBeCloseTo(3, 2);
    const w = paceWords(s, T0 + 3.5 * H, ZONE);
    expect(w.text).toBe('3 hours ahead, as of 3:46 PM');
    expect(w.detail).toBe(
      `Plan expected 187 TE by 3:46 PM; you had 189. Plan: ascension 1 of 2 by then · you: ascension 0 of 2. ${FORECAST_WORDS}`
    );
  });

  it('5 hours behind: the plan had the save’s next TE 5 hours before the save, with both ascension counts', () => {
    const s = planPace(shiftLine, at(T0 + 11 * H, 188)); // the plan had 189 at +6 h
    expect(s.kind).toBe('behind');
    expect(hoursOf(s)).toBeCloseTo(-5, 2);
    const w = paceWords(s, T0 + 11.1 * H, ZONE);
    expect(w).toMatchObject({ badge: '5 hours behind', asOf: 'as of 11:46 PM', tone: 'bad' });
    expect(w.detail).toContain('Plan expected 191 TE by 11:46 PM; you had 188.');
    expect(w.detail).toContain('Plan: ascension 2 of 2 by then · you: ascension 0 of 2.');
  });

  it('past the plan’s end and short of its goal: still behind, in days from 48 hours', () => {
    const s = planPace(shiftLine, at(T0 + 78 * H, 189)); // the plan had 190 at +8 h
    expect(s.kind).toBe('behind');
    expect(hoursOf(s)).toBeCloseTo(-70, 2);
    const w = paceWords(s, T0 + 79 * H, ZONE);
    expect(w.text).toBe('3 days behind, as of 6:46 PM');
  });

  it('the time names the day when it isn’t today, in the planner’s zone (12-hour)', () => {
    const s = planPace(shiftLine, at(T0 + 13 * H, 189));
    expect(paceWords(s, T0 + 13 * H, ZONE).asOf).toBe('as of 1:46 AM');
    expect(paceWords(s, T0 + 40 * H, ZONE).asOf).toBe('as of Oct 15 at 1:46 AM');
    expect(paceWords(s, T0 + 13 * H, 'UTC').asOf).toBe('as of 6:46 AM');
    expect(clockWords(T0, T0, 'UTC')).toBe('5:46 PM');
  });

  it('a plan set to start more than an hour after its save says so', () => {
    const line = paceLine({ legs, planStart: T0, startTEByEgg: teStart, planSave: T0 - 3 * H }) as PaceLine;
    const w = paceWords(planPace(line, at(T0 + 2 * H, 188.5)), T0 + 3 * H, ZONE);
    expect(w.detail).toContain('This plan was set to start 12:46 PM.');
    expect(paceWords(planPace(shiftLine, at(T0 + 2 * H, 188.5)), T0 + 3 * H, ZONE).detail).not.toContain(
      'set to start'
    );
  });

  it('rough and estimate: in the detail, and "(estimate)" on the badge', () => {
    const est = { ...roughLine, estimate: true };
    const w = paceWords(planPace(est, at(T0 + 2 * H, 189)), T0 + 3 * H, ZONE); // 186 → 190 over 10 h: 189 at +7.5 h
    expect(w.badge).toBe('6 hours ahead (estimate)');
    expect(w.text).toBe('6 hours ahead (estimate), as of 2:46 PM');
    expect(w.detail).toContain('Rough: compared ascension by ascension.');
    expect(w.detail).toContain('The plan is an instant answer, an estimate not simulated on your account.');
  });
});

describe('the words for every other case', () => {
  it('no save loaded', () => {
    const w = paceWords(planPace(shiftLine, null), T0, ZONE);
    expect(w).toMatchObject({ badge: NO_SAVE_WORDS, asOf: '', tone: 'plain' });
    expect(NO_SAVE_WORDS).toBe('Load your save to see how you are doing');
  });

  it('the plan’s own save (within 10 minutes), and an older one', () => {
    expect(planPace(shiftLine, at(PLAN_SAVE + 300, 186)).kind).toBe('same-save');
    expect(paceWords({ kind: 'same-save' }, T0, ZONE).badge).toBe('Made from your latest save');
    const older = planPace(shiftLine, at(PLAN_SAVE - 2 * H, 185));
    expect(older).toEqual({ kind: 'cant', why: 'older-save' });
    expect(paceWords(older, T0, ZONE).badge).toBe('Your loaded save is older than this plan');
  });

  it('before the plan starts: nothing to compare yet', () => {
    const line = { ...shiftLine, start: T0 + 18 * H + 14 * 60 }; // Oct 15 at 7:00 AM in Chicago
    const s = planPace(line, at(T0 + H, 187));
    expect(s.kind).toBe('cant');
    expect(paceWords(s, T0 + H, ZONE).badge).toBe('Starts Oct 15 at 7:00 AM: nothing to compare yet');
  });

  it('below where the plan starts: the badge hidden, the detail says why', () => {
    const s = planPace(shiftLine, at(T0 + H, 185.5));
    expect(s).toEqual({ kind: 'cant', why: 'below-start' });
    expect(paceWords(s, T0, ZONE)).toMatchObject({
      badge: '',
      text: '',
      detail: 'Your TE is below where this plan starts.',
    });
  });

  it('done: the last stop reached', () => {
    const s = planPace(shiftLine, at(T0 + 20 * H, 200.2));
    expect(s.kind).toBe('done');
    expect(paceWords(s, T0 + 20 * H, ZONE).text).toBe('Done: you reached 200, as of 8:46 AM');
  });

  it('no timeline, no TE per egg', () => {
    expect(paceWords(planPace('no-timeline', at(T0, 186)), T0, ZONE).badge).toBe(
      "Can't tell: saved without its timeline"
    );
    expect(paceWords(planPace('no-te', at(T0, 186)), T0, ZONE).badge).toBe("Can't tell: saved without each egg's TE");
  });

  it('not the route followed for its goal: greyed, and the detail says so', () => {
    const w = paceWords(planPace(shiftLine, at(T0 + 11 * H, 188)), T0 + 12 * H, ZONE, { followed: false });
    expect(w.greyed).toBe(true);
    expect(w.badge).toBe('5 hours behind');
    expect(w.detail.startsWith('This is not the route you follow for its goal.')).toBe(true);
  });

  it('hours and days', () => {
    expect(gapWords(1.4)).toBe('1 hour');
    expect(gapWords(-6.1)).toBe('6 hours');
    expect(gapWords(47.4)).toBe('47 hours');
    expect(gapWords(48)).toBe('2 days');
    expect(gapWords(-72.2)).toBe('3 days');
  });
});

// My runs review, 22 Oct 2026 (bug 1): the alt save on Humility with 34 TE there, nearly at its 35th, and a plan
// from that save whose first action is the shift to Curiosity at 8:03 PM. Curiosity then takes days per TE, so a
// fraction counted on the save's side (and dropped by the plan when it leaves Humility) read "3 days ahead" for the
// same save stamped 8 h later, and more with 20 h of laying added.
describe('the review’s repro: a plan that leaves the save’s egg (whole TE, no fraction)', () => {
  const DENVER = 'America/Denver';
  const S = Date.UTC(2026, 9, 19, 0, 33) / 1000; // the save: Oct 18, 2026 at 6:33 PM in Denver
  const D = 24 * H;
  const start = [30, 28, 34, 26, 24]; // 142 TE: Curiosity, Integrity, Humility, Resilience, Kindness
  const plan = [
    leg(
      S,
      S + 50 * D,
      165,
      [
        { at: S + 1.5 * H, egg: 'curiosity', fromEgg: 'humility', te: 34 }, // 8:03 PM
        { at: S + 20 * D, egg: 'integrity', fromEgg: 'curiosity', te: 36 },
        { at: S + 35 * D, egg: 'resilience', fromEgg: 'integrity', te: 35 },
        { at: S + 45 * D, egg: 'kindness', fromEgg: 'resilience', te: 32 },
      ],
      { egg: 'kindness', te: 28 }
    ),
  ];
  const line = paceLine({ legs: plan, planStart: S, startTEByEgg: start, planSave: S }) as PaceLine;
  const thr = getThresholdForTE;
  /** The alt save: Humility `fraction` of the way from its 34th TE to its 35th, stamped at `seconds`. */
  const save = (fraction: number) => ({
    virtue: {
      eovEarned: start,
      eggsDelivered: [0, 0, thr(34) + (thr(35) - thr(34)) * fraction, 0, 0],
    },
    farms: [{ eggType: 52 }],
  });
  const fresh = (seconds: number, fraction = 0.9) => progressOf(save(fraction), seconds)!;

  it('the plan has left Humility for Curiosity at 8:03 PM', () => {
    expect(line.rough).toBe(false);
    expect(line.eggAt?.(S + H)).toBe('humility');
    expect(line.eggAt?.(S + 1.5 * H)).toBe('curiosity');
    expect(line.teAt(S + 8 * H)).toBe(142);
  });

  it('the same save stamped 8 h later, no progress: never ahead; can’t compare, the save is on another egg', () => {
    const s = planPace(line, fresh(S + 8 * H));
    expect(s.kind).not.toBe('ahead');
    expect(s).toEqual({ kind: 'cant', why: 'other-egg', saveEgg: 'humility', planEgg: 'curiosity', saveTime: S + 8 * H });
    const w = paceWords(s, S + 9 * H, DENVER);
    expect(w.badge).toBe("Can't compare right now: your save is on a different egg than the plan expects.");
    expect(w.text).toBe(OTHER_EGG_WORDS);
    expect(w.tone).toBe('warn');
    expect(w.detail).toBe('Your save is on Humility; at 2:33 AM the plan has you on Curiosity.');
    // Without the egg (not known), whole TE against whole TE: 142 and 142, not ahead.
    const blind = planPace(line, { ...fresh(S + 8 * H), egg: null });
    expect(blind.kind).toBe('on-schedule');
    expect(paceWords(blind, S + 9 * H, DENVER).detail).toContain('Plan expected 142 TE by 2:33 AM; you had 142.');
  });

  it('with 20 h of Humility laying added: not "5 days ahead" (nor any days ahead)', () => {
    for (const fraction of [0.99, 1.2]) {
      // 0.99: still 34 on Humility; 1.2: past its 35th (143 TE).
      for (const later of [3, 8]) {
        const s = planPace(line, fresh(S + later * H, fraction));
        expect(s.kind).not.toBe('ahead');
        expect(s).toMatchObject({ kind: 'cant', why: 'other-egg' });
      }
    }
    // Still on Humility within the plan's first 1.5 h (the plan is on it too): the TE gained there is ahead.
    const early = planPace(line, fresh(S + H, 1.2));
    expect(early.kind).toBe('ahead');
  });

  it('on Curiosity as the plan expects, with the same TE: on schedule, not ahead', () => {
    const p = { ...fresh(S + 8 * H), egg: 'curiosity' };
    expect(planPace(line, p)).toMatchObject({ kind: 'on-schedule', expected: 142, actual: 142 });
  });

  it('property: for a fixed plan and a save with no progress, a later save time is never more ahead', () => {
    // A score per result: hours (positive ahead) for a comparison; nothing for "can't compare" or the plan's own save.
    const score = (st: PaceState): number | null =>
      st.kind === 'ahead' || st.kind === 'behind' || st.kind === 'on-schedule' ? st.hours : null;
    const lines = [line, shiftLine, roughLine];
    for (const l of lines) {
      for (const egg of [null, ...['curiosity', 'integrity', 'humility', 'resilience', 'kindness']]) {
        for (let W = Math.floor(l.startTE); W < l.goalTE; W++) {
          let last = Infinity;
          const span = l.end - l.start;
          for (let k = 0; k <= 400; k++) {
            const t = l.start + (span * 1.3 * k) / 400 + 1;
            const x = score(planPace(l, { seconds: t, progress: W, onVirtue: true, egg }));
            if (x === null) continue;
            expect(x).toBeLessThanOrEqual(last + 1e-6);
            last = x;
          }
        }
      }
    }
  });
});
