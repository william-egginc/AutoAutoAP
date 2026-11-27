/**
 * A1 CONTINUE END EGG (review 2026-11-15 item 4 / R1; LIVE). An A1 'continue' leg that never shifts ends on the egg the
 * farm is on, not Curiosity. compact() (search/leg.ts) took the last shift's `toEgg`, else `baseState.currentEgg`, and
 * the chain hands A1 a base state put on Curiosity (chain.ts: the first leg starts from a blank farm), so a continue
 * with no shift named Curiosity: the Next TE card, the route timeline (every A1 continue with no shift, not only a last
 * leg), and the laying credited during a prestige wait.
 *
 * The synthetic save (src/test/syntheticSave.ts; no player data, fixed clock) farming Kindness with nothing to buy
 * (`nothingToBuyBackup`), Kindness a fraction of a day from its next TE, so continue reaches one more TE on Kindness
 * alone. A real simulation (seconds).
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { nothingToBuyBackup, syntheticInputs } from '@/test/syntheticSave';
import { runLeg } from './leg';
import { createChainEvaluator } from './chain';
import { shiftSteps } from './routeTimeline';
import { CONTINUE_MAX_SECONDS } from './rules';
import type { SearchInputs } from './types';

const FINISH = { firstAscension: 'continue', continuePinSeconds: CONTINUE_MAX_SECONDS } as const;
const SHAPE = { kindness: 0.2 } as const;

describe('an A1 continue with no shift ends on the farm egg (Kindness), not Curiosity', () => {
  let inputs: SearchInputs;
  beforeAll(async () => {
    const base = await syntheticInputs(() => nothingToBuyBackup(SHAPE));
    inputs = { ...base, ...FINISH } as SearchInputs;
  }, 600_000);

  it('the leg: lastEgg and endEgg are Kindness', () => {
    const goal = inputs.currentTE + 1;
    const state = JSON.parse(JSON.stringify(inputs.baseState));
    // As the chain hands A1 its state: a blank farm on Curiosity (chain.ts, the first leg).
    state.currentEgg = 'curiosity';
    const r = runLeg(inputs, state, inputs.planStart, goal, true, inputs.currentTE, 0)!;
    expect(r.key).toBe('continue');
    expect(r.shifts).toEqual([]);
    expect(r.lastEgg).toBe('kindness');
    expect(r.endEgg?.egg).toBe('kindness');
  }, 600_000);

  it('mid-route (A1 not the last leg) and as the last leg: the timeline opens and ends on Kindness', () => {
    const goal = inputs.currentTE + 1;
    const ev = createChainEvaluator({ ...inputs, final: goal + 1 } as SearchInputs);
    const mid = ev.evaluate([goal, goal + 1])!;
    expect(mid.legs[0].key).toBe('continue');
    expect(mid.legs[0].shifts ?? []).toEqual([]);
    expect(mid.legs[0].endEgg?.egg).toBe('kindness');
    expect(shiftSteps(mid.legs[0]).map(s => s.egg)).toEqual(['kindness']);

    const last = ev.evaluate([goal])!;
    expect(last.legs[0].key).toBe('continue');
    expect(last.legs[0].endEgg?.egg).toBe('kindness');
    expect(last.legs[0].endEggs?.egg).toBe('kindness');
  }, 600_000);
});
