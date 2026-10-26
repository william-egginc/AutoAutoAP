/**
 * No prestige on these days in the searches (search/noPrestige.ts, search/chain.ts): a prestige that would land on a
 * no-prestige day waits for the next allowed time inside the hours, the farm keeps laying meanwhile but only until
 * its silos run out, the leg itself (and so its shifts) is simulated exactly as without the days, a plan start on
 * such a day may still continue, and nothing changes without them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  inputs: { firstAscension?: string };
  state: { eggsDelivered: Record<string, number>; te: number };
  te: number;
  start: number;
  allowContinue: boolean;
}
const calls: Call[] = [];
/** Each leg's end and key, from its call: set per test. */
let shape: (c: Call, n: number) => { end: number; key: string; endTE?: number };
let silo = 12 * 3600;
vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 4_102_444_800,
  saveSiloSeconds: () => silo,
  farmLaying: () => ({ egg: 0, rate: 1e9, capSeconds: silo }),
  runLeg: (inputs: object, state: object, start: number, target: number, allowContinue: boolean, te: number) => {
    const call = { inputs, state: JSON.parse(JSON.stringify(state)), te, start, allowContinue } as Call;
    calls.push(call);
    const { end, key, endTE } = shape(call, calls.length);
    return {
      summary: {
        startTime: start,
        endTime: end,
        totalDurationSeconds: end - start,
        endTE: endTE ?? target,
        maxELR: 1e12,
        tier13Unlocked: false,
        buildPhaseEndTime: start,
        buildPhaseSaleCount: 1,
      },
      key,
      nextState: { ...state, eggsDelivered: { humility: HUMILITY_AT_END }, teEarned: { humility: 0 }, te: endTE ?? target },
      shifts: [{ at: start + 3600, egg: 'kindness' }],
      heldSeconds: 0,
      lastEgg: 'humility',
    };
  },
}));

import { createChainEvaluator } from './chain';
import { timeOffWindows } from './timeOff';
import { creditedWaitSeconds, nextPrestigeAt, noPrestigeKey, prestigeHoldOf } from './noPrestige';
import { nextAvailable } from './availability';
import { getThresholdForTE } from '@/lib/truthEggs';
import type { SearchInputs } from './types';

const TZ = 'America/Denver';
const at = (iso: string) => Date.parse(iso) / 1000;
// Leg 1 ends 1:00 am Denver on Saturday Jan 2, 2027 (MST, UTC-7).
const LEG1_END = at('2027-01-02T08:00:00Z');
const SAT_7AM = at('2027-01-02T14:00:00Z');
const SUN_MIDNIGHT = at('2027-01-03T07:00:00Z');
const SUN_7AM = at('2027-01-03T14:00:00Z');
const HUMILITY_AT_END = getThresholdForTE(40) - 1e12 * 7200;
const hours = { days: [], fromHour: 7, toHour: 23, timezone: TZ };
const saturday = timeOffWindows([{ from: '2027-01-02', to: '2027-01-02' }], TZ);
const inputs = (over: Partial<SearchInputs>) =>
  ({
    baseState: { currentEgg: 'humility', eggsDelivered: {}, teEarned: {}, te: 190 },
    planStart: at('2026-12-28T15:00:00Z'),
    currentTE: 190,
    final: 490,
    timeOff: [],
    milestones: [],
    ...over,
  }) as unknown as SearchInputs;
/** Leg 1 ends at LEG1_END, every later one a day after it starts. */
const twoLegs = (c: Call, n: number) => ({ end: n === 1 ? LEG1_END : c.start + 86_400, key: '1-sale' });

beforeEach(() => {
  calls.length = 0;
  silo = 12 * 3600;
  shape = twoLegs;
});

describe('the next allowed time (nextPrestigeAt)', () => {
  it('inside the hours and not on the day: Saturday 1:00 am waits for Sunday 7:00 am', () => {
    expect(nextPrestigeAt(LEG1_END, hours, saturday)).toBe(SUN_7AM);
    // The hours alone: Saturday 7:00 am.
    expect(nextPrestigeAt(LEG1_END, hours, [])).toBe(SAT_7AM);
  });
  it('no hours set: only the days apply (midnight after the day)', () => {
    expect(nextPrestigeAt(LEG1_END, null, saturday)).toBe(SUN_MIDNIGHT);
  });
  it('any-hour window (every day, all hours) is no restriction: the days alone', () => {
    expect(nextPrestigeAt(LEG1_END, { days: [], fromHour: 0, toHour: 0, timezone: TZ }, saturday)).toBe(SUN_MIDNIGHT);
  });
  it('outside the days, the hours own answer; neither, the instant itself', () => {
    const friday = at('2027-01-01T08:00:00Z');
    expect(nextPrestigeAt(friday, hours, saturday)).toBe(nextAvailable(friday, hours));
    expect(nextPrestigeAt(friday, null, saturday)).toBe(friday);
  });
  it('back-to-back days: past both', () => {
    const weekend = timeOffWindows(
      [
        { from: '2027-01-02', to: '2027-01-02' },
        { from: '2027-01-03', to: '2027-01-03' },
      ],
      TZ
    );
    expect(nextPrestigeAt(LEG1_END, hours, weekend)).toBe(at('2027-01-04T14:00:00Z'));
  });
  it('a hold hook: the hours hook unchanged without days', () => {
    const back = (t: number) => nextAvailable(t, hours);
    expect(prestigeHoldOf(back, [])).toBe(back);
    expect(prestigeHoldOf(back, saturday)!(LEG1_END)).toBe(SUN_7AM);
    expect(prestigeHoldOf(undefined, saturday)!(LEG1_END)).toBe(SUN_MIDNIGHT);
  });
  it('the key: empty for none', () => {
    expect(noPrestigeKey([])).toBe('');
    expect(noPrestigeKey(saturday)).toMatch(/^np\d+-\d+$/);
  });
});

describe('the silo cap on the laying (creditedWaitSeconds)', () => {
  it('a wait for the hours alone is credited in full, whatever the silos', () => {
    expect(creditedWaitSeconds(0, 6 * 3600, 6 * 3600, 3600)).toBe(6 * 3600);
  });
  it('a no-prestige wait longer than the silos: only the silo seconds', () => {
    expect(creditedWaitSeconds(0, 6 * 3600, 30 * 3600, 12 * 3600)).toBe(12 * 3600);
  });
  it('shorter than the silos: the whole wait', () => {
    expect(creditedWaitSeconds(0, 6 * 3600, 30 * 3600, 48 * 3600)).toBe(30 * 3600);
  });
  it('never less than the hours part', () => {
    expect(creditedWaitSeconds(0, 6 * 3600, 30 * 3600, 2 * 3600)).toBe(6 * 3600);
  });
});

describe('a prestige landing on a no-prestige day (chain.ts)', () => {
  it('waits to the next allowed time inside the hours, and the wait is named', () => {
    const r = createChainEvaluator(inputs({ availability: hours, deferShifts: true, noPrestige: saturday })).evaluate([
      200, 490,
    ])!;
    expect(calls[1].start).toBe(SUN_7AM);
    expect(r.legs[0].sleepDelaySeconds).toBe(SUN_7AM - LEG1_END);
    expect(r.legs[0].noPrestigeWaitSeconds).toBe(SUN_7AM - SAT_7AM);
    expect(r.legs[1].startTime).toBe(SUN_7AM);
  });

  it("the farm's laying is credited only up to the silo seconds (12 h of a 30 h wait)", () => {
    createChainEvaluator(inputs({ availability: hours, deferShifts: true, noPrestige: saturday })).evaluate([200, 490]);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END + 1e12 * 12 * 3600);
  });

  it('a wait shorter than the silos is credited in full', () => {
    silo = 48 * 3600;
    createChainEvaluator(inputs({ availability: hours, deferShifts: true, noPrestige: saturday })).evaluate([200, 490]);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END + 1e12 * (SUN_7AM - LEG1_END));
  });

  it('the hours hold is unchanged: no days, the 6 h wait credited in full even with small silos', () => {
    silo = 3600;
    const r = createChainEvaluator(inputs({ availability: hours, deferShifts: true })).evaluate([200, 490])!;
    expect(calls[1].start).toBe(SAT_7AM);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END + 1e12 * (SAT_7AM - LEG1_END));
    expect(r.legs[0].noPrestigeWaitSeconds).toBeUndefined();
  });

  it('with no hours set only the days apply: the next leg starts at midnight after the day', () => {
    const r = createChainEvaluator(inputs({ availability: null, noPrestige: saturday })).evaluate([200, 490])!;
    expect(calls[1].start).toBe(SUN_MIDNIGHT);
    expect(r.legs[0].noPrestigeWaitSeconds).toBe(SUN_MIDNIGHT - LEG1_END);
    expect(calls[1].state.eggsDelivered.humility).toBe(HUMILITY_AT_END + 1e12 * 12 * 3600);
  });

  it('shifts are unaffected: each leg is simulated from the same start with the same inputs as without the days', () => {
    createChainEvaluator(inputs({ availability: hours, deferShifts: true, noPrestige: saturday })).evaluate([200, 490]);
    const withDays = calls.map(c => ({ start: c.start, allowContinue: c.allowContinue }));
    calls.length = 0;
    createChainEvaluator(inputs({ availability: hours, deferShifts: true })).evaluate([200]);
    // Leg 1 is the same leg (the days only move the prestige after it); its shifts come back as it simulated them.
    expect(withDays[0]).toEqual({ start: calls[0].start, allowContinue: calls[0].allowContinue });
  });

  it('a leg ending outside the days, and the final leg, are not moved', () => {
    const friday = timeOffWindows([{ from: '2027-01-08', to: '2027-01-08' }], TZ);
    const r = createChainEvaluator(inputs({ availability: null, noPrestige: friday })).evaluate([200, 490])!;
    expect(calls[1].start).toBe(LEG1_END);
    expect(r.legs[0].sleepDelaySeconds).toBe(0);
    // Reaching the final target is no prestige: a final leg ending on a no-prestige day ends where it ends.
    shape = (c, n) => ({ end: n === 1 ? LEG1_END : c.start + 86_400, key: '1-sale' });
    calls.length = 0;
    const one = createChainEvaluator(inputs({ availability: null, noPrestige: saturday })).evaluate([490])!;
    expect(one.legs[0].endTime).toBe(LEG1_END);
    expect(one.seconds).toBe(LEG1_END - at('2026-12-28T15:00:00Z'));
  });

  it('the rebuild after time off starts with a prestige, so it waits for the day to pass too', () => {
    // Time off Friday Jan 1; Saturday no prestige: the rebuild starts Sunday 7:00 am.
    const off = timeOffWindows([{ from: '2027-01-01', to: '2027-01-01' }], TZ);
    shape = (c, n) =>
      n === 1
        ? { end: at('2027-01-05T00:00:00Z'), key: '1-sale' }
        : n === 2
          ? { end: at('2027-01-01T07:00:00Z'), key: '1-sale', endTE: 200 }
          : { end: c.start + 86_400, key: '1-sale' };
    createChainEvaluator(
      inputs({ planStart: at('2026-12-31T15:00:00Z'), availability: hours, timeOff: off, noPrestige: saturday })
    ).evaluate([490]);
    // Call 1: the whole leg; 2: cut at the time off; 3: the rebuild.
    expect(calls[2].start).toBe(SUN_7AM);
  });
});

describe('a plan starting on a no-prestige day (leg 1)', () => {
  const START = at('2027-01-02T17:00:00Z'); // Saturday 10:00 am Denver

  it('continuing needs no prestige: taken as it is', () => {
    shape = c => ({ end: c.start + 86_400, key: 'continue' });
    const r = createChainEvaluator(inputs({ planStart: START, noPrestige: saturday })).evaluate([490])!;
    expect(r.legs[0].key).toBe('continue');
    expect(r.legs[0].startTime).toBe(START);
    expect(calls).toHaveLength(1);
  });

  it('a fresh start is held to the next allowed time, unless continuing ends sooner', () => {
    // As asked: fresh at once (ends in 2 days); continue only: ends in 5 days; fresh held to Sunday: ends 2 days later.
    shape = c =>
      c.inputs.firstAscension === 'buildup'
        ? { end: c.start + 5 * 86_400, key: 'continue' }
        : { end: c.start + 2 * 86_400, key: '1-sale' };
    const r = createChainEvaluator(inputs({ planStart: START, availability: hours, noPrestige: saturday })).evaluate([
      490,
    ])!;
    expect(r.legs[0].key).toBe('1-sale');
    expect(r.legs[0].startTime).toBe(SUN_7AM);
    expect(r.legs[0].endTime).toBe(SUN_7AM + 2 * 86_400);
    // The save's farm laid while it waited (capped at the silos: 12 h at 1e9/s on curiosity).
    const held = calls.find(c => c.start === SUN_7AM)!;
    expect(held.allowContinue).toBe(false);
    expect(held.state.eggsDelivered.curiosity).toBe(1e9 * 12 * 3600);
  });

  it('continuing wins when it ends sooner than the held fresh start', () => {
    shape = c =>
      c.inputs.firstAscension === 'buildup'
        ? { end: c.start + 1.5 * 86_400, key: 'continue' }
        : { end: c.start + 1 * 86_400, key: '1-sale' };
    const r = createChainEvaluator(inputs({ planStart: START, availability: hours, noPrestige: saturday })).evaluate([
      490,
    ])!;
    expect(r.legs[0].key).toBe('continue');
    expect(r.legs[0].startTime).toBe(START);
  });

  it('Prestige now: held, with no continue tried', () => {
    shape = c => ({ end: c.start + 86_400, key: '1-sale' });
    const r = createChainEvaluator(
      inputs({ planStart: START, availability: hours, noPrestige: saturday, firstAscension: 'fresh' })
    ).evaluate([490])!;
    expect(r.legs[0].startTime).toBe(SUN_7AM);
    expect(calls.some(c => c.inputs.firstAscension === 'buildup')).toBe(false);
  });

  it('without the days, nothing is held and only one leg is simulated', () => {
    shape = c => ({ end: c.start + 86_400, key: '1-sale' });
    const r = createChainEvaluator(inputs({ planStart: START, availability: hours })).evaluate([490])!;
    expect(r.legs[0].startTime).toBe(START);
    expect(calls).toHaveLength(1);
  });
});
