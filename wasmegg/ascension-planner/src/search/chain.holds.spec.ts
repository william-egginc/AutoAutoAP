import { describe, expect, it, vi } from 'vitest';

// Board row 392d55f7's best route, leg 1: started 9 Oct 2026 8:05 am CDT, its shifts held 1.83 h for
// the player's 7:00-23:00, and the simulation (which runs through every hold, auto/hold.ts) ended it
// 11 Dec 4:11 pm CST. The CSV said leg_days 63.4555, which is 4:11 pm plus the 1.83 h hold a second
// time: start + leg_days landed at 6:00 pm, not at the leg's own end.
const LEG1_START = Date.parse('2026-10-09T13:05:00Z') / 1000;
const LEG1_END = Date.parse('2026-12-11T22:11:00Z') / 1000;
const HELD = 1.83 * 3600;

const starts: number[] = [];
vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 8.64e12,
  runLeg: (_inputs: unknown, state: object, start: number, target: number) => {
    starts.push(start);
    const first = starts.length === 1;
    const end = first ? LEG1_END : start + 30 * 86_400;
    return {
      summary: {
        startTime: start,
        endTime: end,
        // What runAscension returns: the leg's whole clock, holds included.
        totalDurationSeconds: end - start,
        endTE: target,
        maxELR: 1e12,
        tier13Unlocked: true,
        buildPhaseEndTime: start,
        buildPhaseSaleCount: 3,
      },
      key: '3-sale-tier13',
      nextState: state,
      shifts: [],
      heldSeconds: first ? HELD : 0,
      lastEgg: 'curiosity',
    };
  },
}));

import { createChainEvaluator } from './chain';
import { buildChainsCsv } from './csv';
import type { SearchInputs } from './types';

const hours = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Chicago' };
const inputs = {
  baseState: { currentEgg: 'curiosity', eggsDelivered: {}, teEarned: {}, te: 198 },
  planStart: LEG1_START,
  currentTE: 198,
  final: 490,
  timeOff: [],
  milestones: [],
  availability: hours,
  deferShifts: true,
} as unknown as SearchInputs;

describe('a held shift is counted once in the leg (392d55f7, leg 1)', () => {
  it('days are end minus start; the hold is part of them, not added on top', () => {
    starts.length = 0;
    const r = createChainEvaluator(inputs).evaluate([224, 490])!;
    const leg = r.legs[0];
    expect(leg.shiftDelaySeconds).toBeCloseTo(HELD, 6);
    expect(leg.endTime).toBe(LEG1_END);
    expect(leg.durationSeconds).toBe(LEG1_END - LEG1_START);
    // 63.3792 days, not the 63.4555 the CSV printed (1.83 h more).
    expect(leg.durationSeconds / 86400).toBeCloseTo(63.3792, 4);
    // 4:11 pm is inside the hours, so leg 2 starts at leg 1's end, with nothing added.
    expect(starts[1]).toBe(LEG1_END);
    expect(r.seconds).toBe(LEG1_END + 30 * 86_400 - LEG1_START);
  });

  it('the CSV: leg_start + leg_days = leg_end', () => {
    starts.length = 0;
    const r = createChainEvaluator(inputs).evaluate([224, 490])!;
    const csv = buildChainsCsv([{ key: r.chain.join(','), seconds: r.seconds, legs: r.legs }] as never, {
      planStart: LEG1_START,
      timezone: 'America/Chicago',
      currentTE: 198,
      final: 490,
      effort: 'normal',
      firstAscension: 'auto',
      availability: hours,
      seedChain: [],
      loadouts: [],
      generatedAt: LEG1_START * 1000,
    });
    const lines = csv.split('\n');
    const head = lines.find(l => l.startsWith('rank,'))!.split(',');
    const row = lines.find(l => l.startsWith('1,224 490,2,') && l.split(',')[head.indexOf('leg')] === '1')!.split(',');
    expect(row[head.indexOf('leg_start_local')]).toBe('2026-10-09 08:05');
    expect(row[head.indexOf('leg_end_local')]).toBe('2026-12-11 16:11');
    expect(row[head.indexOf('leg_days')]).toBe('63.3792');
    expect(row[head.indexOf('shift_hold_hours')]).toBe('1.83');
  });
});
