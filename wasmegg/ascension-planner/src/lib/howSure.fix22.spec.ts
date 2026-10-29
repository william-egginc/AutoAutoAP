/** Fix 22: "the next route is only 0.0 h behind" reads as a tie (the Egg Day tile on beta, 16 Oct). */
import { describe, expect, it } from 'vitest';
import { TIE_HOURS, behindWords, howSure, type SureInput } from './howSure';
import { planFromSnapshot, type SnapLike } from './nowPlan';
import { buildTile } from './savedTiles';

const date = (o: Partial<SureInput>): SureInput => ({ goal: 'date', how: 'check', ageDays: 0.1, te: 248, spareHours: 30, ...o });

describe('a runner-up that ties', () => {
  it('under 0.05 h: "another route ties it"; the same TE and spare: "ties it exactly" and names it', () => {
    expect(TIE_HOURS).toBe(0.05);
    expect(behindWords(1.2)).toBe('the next route is only 1.2 h behind');
    expect(behindWords(0.05)).toBe('the next route is only 0.1 h behind');
    expect(behindWords(0.04)).toBe('another route ties it');
    expect(behindWords(0)).toBe('another route ties it');
    expect(behindWords(0, { runnerUpSame: true, runnerUpChain: [155, 180, 247] })).toBe('another route ties it exactly (155 180 247)');
    expect(behindWords(0, { runnerUpSame: true })).toBe('another route ties it exactly');
  });

  it('the Egg Day tile: "Exact check done; another route ties it", never "0.0 h behind"', () => {
    expect(howSure(date({ runnerUpHours: 0.02 })).reason).toBe('simulator check done; another route ties it');
    expect(howSure(date({ runnerUpHours: 0, runnerUpSame: true, runnerUpChain: [160, 248] })).reason).toBe(
      'simulator check done; another route ties it exactly (160 248)'
    );
    expect(howSure(date({ runnerUpHours: 1 })).reason).toBe('simulator check done; the next route is only 1.0 h behind');
    // Fastest's search line too.
    expect(howSure({ goal: 'fastest', how: 'search', level: 'normal', ageDays: 0.1, runnerUpHours: 0.01 }).reason).toBe(
      'Exact search; another route ties it'
    );
  });

  it('from a kept snapshot to the tile: the tied route is named', () => {
    const DEADLINE = 2_000_000_000;
    const end = DEADLINE - 30 * 3600;
    const snap: SnapLike = {
      at: 1_700_000_000_000,
      result: { best: null, byAscensions: [], byDate: { chain: [160, 248], legs: [], end } },
      dateExact: { chain: [160, 248], endTE: 248, end },
      dateExactByK: { 2: { chain: [160, 248], endTE: 248, end }, 3: { chain: [150, 200, 248], endTE: 248, end } },
    };
    const plan = planFromSnapshot(snap, 'date', DEADLINE)!;
    expect(plan.runnerUpHours).toBe(0);
    expect(plan.runnerUp).toEqual({ chain: [150, 200, 248], end, endTE: 248 });
    const tile = buildTile({
      goal: 'date',
      target: 490,
      deadline: DEADLINE,
      nowMs: 1_700_000_100_000,
      save: { seconds: 1_699_999_000, te: 191 },
      snapshot: plan,
      lastChecked: null,
      history: [],
      board: null,
      saved: [],
    });
    expect(tile.sure?.reason).toBe('simulator check done; another route ties it exactly (150 200 248)');
  });
});
