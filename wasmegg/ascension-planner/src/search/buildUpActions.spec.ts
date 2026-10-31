/**
 * search/buildUpActions.ts `toBuildUpActions`: a research buy is flagged `cheap` when it cost 10 s of the farm's income
 * or less (the opening sweep's threshold, auto/shifts/c3.ts OPENING_SMART_BUY_THRESHOLD_SECONDS, read-only), the income
 * being the engine's `offlineEarnings` just before the buy (the previous action's end state). Placeholder actions.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '@/types/actions/meta';
import { CHEAP_SWEEP_SECONDS, toBuildUpActions } from './buildUpActions';

const START = 1_800_000_000;
let step = 0;
function act(type: string, payload: Record<string, unknown>, cost: number, rate: number): Action {
  step += 10;
  return { type, payload, cost, endState: { lastStepTime: step, offlineEarnings: rate } } as unknown as Action;
}
const buy = (id: string, from: number, cost: number, rateAfter = 1e10) =>
  act('buy_research', { researchId: id, fromLevel: from, toLevel: from + 1 }, cost, rateAfter);

describe('toBuildUpActions: cheap buys', () => {
  it('the threshold is the opening sweep\'s 10 s', () => {
    expect(CHEAP_SWEEP_SECONDS).toBe(10);
  });

  it('cost at most 10 s of the income just before the buy: cheap; more: not', () => {
    step = 0;
    const list = toBuildUpActions(
      [
        act('notification', {}, 0, 1e10), // the sweep's note: the farm's income at the sweep's start
        buy('neural_linking', 24, 5e10), // 5 s
        buy('neural_linking', 25, 1e11), // exactly 10 s
        buy('timeline_diversion', 39, 2e11), // 20 s
      ],
      START
    );
    const r = list.filter(a => a.kind === 'research');
    expect(r.map(a => a.cheap ?? false)).toEqual([true, true, false]);
  });

  it('the income is the one BEFORE the buy, not after it', () => {
    step = 0;
    const list = toBuildUpActions([act('notification', {}, 0, 1e9), buy('neural_linking', 24, 5e10, 1e12)], START);
    expect(list.find(a => a.kind === 'research')!.cheap).toBeUndefined();
  });

  it('no income known before the buy (first action, or no earnings): not flagged', () => {
    step = 0;
    expect(toBuildUpActions([buy('neural_linking', 24, 1)], START)[0].cheap).toBeUndefined();
    step = 0;
    expect(toBuildUpActions([act('notification', {}, 0, 0), buy('neural_linking', 24, 1)], START)[1].cheap).toBeUndefined();
  });

  it('only research is flagged', () => {
    step = 0;
    const list = toBuildUpActions([act('notification', {}, 0, 1e10), act('buy_silo', { fromCount: 1, toCount: 2 }, 1, 1e10)], START);
    expect(list.every(a => a.cheap === undefined)).toBe(true);
  });
});
