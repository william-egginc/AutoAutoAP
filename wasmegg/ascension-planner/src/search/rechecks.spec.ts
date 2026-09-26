import { describe, expect, it } from 'vitest';
import type { BoardRow } from '@/lib/leaderboardRank';
import { currentPlans, recheckChains, type RecheckRun } from './rechecks';

const NOW = Date.parse('2026-09-25T23:59:00Z');
const WINDOW = 'every day 07:00-23:00 America/Chicago';

let seq = 0;
function row(over: Partial<BoardRow> = {}): BoardRow {
  seq++;
  return {
    id: `r${seq}`,
    nickname: 'allanfieldhouse',
    acct: 'a11a11a11a11',
    yours: true,
    chain: [199, 223, 253, 282, 316, 490],
    durationDays: 665.7,
    startLocal: '2026-09-23 10:46',
    timezone: 'America/Chicago',
    currentTE: 198,
    finalTE: 490,
    window: WINDOW,
    holdShifts: true,
    forceContinue: true,
    submittedAt: '2026-09-23T15:50:00Z',
    artifacts: ['T4L Gusset'],
    legs: [],
    ...over,
  };
}

const run = (over: Partial<RecheckRun> = {}): RecheckRun => ({
  currentTE: 201,
  finalTE: 490,
  winner: [225, 255, 290, 328, 490],
  window: WINDOW,
  holdShifts: true,
  forceContinue: true,
  ...over,
});

describe('recheckChains', () => {
  it("takes the player's best current plans, cut to what is still ahead", () => {
    const rows = [
      row({ id: 'best' }),
      row({ id: 'second', chain: [206, 217, 255, 290, 324, 490], durationDays: 679.7 }),
      row({ id: 'third', chain: [230, 490], durationDays: 690 }),
      row({ id: 'fourth', chain: [240, 490], durationDays: 700 }),
    ];
    const plans = currentPlans(rows, null, 490, NOW);
    expect(plans.map(p => p.row.id)).toEqual(['best', 'second', 'third', 'fourth']);
    // 199 is behind TE 201 now, so the first plan is re-checked from 223.
    expect(recheckChains(plans, run())).toEqual([
      [223, 253, 282, 316, 490],
      [206, 217, 255, 290, 324, 490],
      [230, 490],
    ]);
  });

  it("skips this run's own answer, repeats, other settings and other targets", () => {
    const rows = [
      row({ id: 'winner', chain: [199, 225, 255, 290, 328, 490] }), // cut, it is the winner
      row({ id: 'dupe', chain: [195, 225, 255, 290, 328, 490], durationDays: 666 }), // cut, the same again
      row({ id: 'window', chain: [230, 490], window: null, durationDays: 667 }),
      row({ id: 'held', chain: [231, 490], holdShifts: false, durationDays: 668 }),
      row({ id: 'kept', chain: [232, 490], durationDays: 669 }),
      row({ id: 'lower', chain: [300, 400], finalTE: 400, durationDays: 100 }),
    ];
    const plans = currentPlans(rows, null, 490, NOW);
    expect(recheckChains(plans, run())).toEqual([[232, 490]]);
  });

  it('falls back to rows matching the account when the collector confirmed none', () => {
    const rows = [row({ id: 'old', yours: undefined, acct: undefined })];
    expect(currentPlans(rows, null, 490, NOW)).toEqual([]);
    const key = `America/Chicago::T4L Gusset`;
    expect(currentPlans(rows, key, 490, NOW).map(p => p.row.id)).toEqual(['old']);
  });

  it('leaves out plans that no longer count', () => {
    const rows = [row({ id: 'whatif', startLocal: '2026-11-23 10:00' }), row({ id: 'real', chain: [230, 490] })];
    const plans = currentPlans(rows, null, 490, NOW);
    expect(recheckChains(plans, run())).toEqual([[230, 490]]);
  });
});
