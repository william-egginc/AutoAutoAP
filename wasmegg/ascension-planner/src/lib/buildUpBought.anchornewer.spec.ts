/**
 * AN ANCHOR FARM NEWER THAN THE PLAN'S START BLOCKS EVERY TICK (design spec, failing first; game expert, 6 Nov 2026).
 *
 * Jordan's Chrome at 2:51 pm: "Build-up tracker 0 of 105 check-ins done", the 1:59 pm line (Enlightened Chickens 93 -> 101,
 * Neural Net Refinement 13 -> 14, Neural Linking 29 -> 30) unticked although the 2:50 pm save holds all of it (EC 102,
 * NNR 14, NL 30), and no Re-plan offered. Reproduced headless: a plan simulated from an earlier save (start farm EC 93)
 * whose kept anchor farm (`useBuildUpTracker.ts` `anchorFarmNow`, the page's save AT KEEP TIME) is a newer save (EC 98).
 * `saveFit` (lib/buildUpBought.ts) then reads "start farm does not hold the anchor farm and the save does" as
 * 'beforePrestige' (the save is from before a prestige), so every line is "not bought" (auto false, 0 ticks) and
 * `offPlan` returns [] because the fit is not 'fits'; the re-plan offer waits for the save to be 60 min behind the
 * first line it believes unbought (REPLAN_BEHIND), here the 1:59 pm line, so not before 3:00 pm.
 *
 * 'beforePrestige' is for a plan that starts afresh after a prestige. For a build-up plan (the same ascension) a newer
 * anchor must not make the save "older": the save holds the start farm, which is all that matters.
 *
 * Wanted: with a build-up plan whose anchor farm is newer than its start farm, a later save still 'fits' and ticks the
 * lines it holds. The prestige case keeps 'beforePrestige' (control).
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker } from './buildUpTracker';
import { boughtFromSave, saveFit, type SaveFarm } from './buildUpBought';
import { HOURS, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpAction, BuildUpStart } from '@/search/buildUpActions';

const farm = (ec: number, nl: number, nnr: number): SaveFarm => ({
  egg: 'curiosity',
  researchLevels: { enlightened_chickens: ec, neural_linking: nl, neural_net_refine: nnr },
  habIds: [18, 18, 18, 18],
  vehicles: [{ vehicleId: 11, trainLength: 8 }],
  siloCount: 9,
  artifactSet: null,
});
const start: BuildUpStart = {
  egg: 'curiosity',
  researchLevels: { enlightened_chickens: 93, neural_linking: 29, neural_net_refine: 13 },
  habIds: [18, 18, 18, 18],
  vehicles: [{ vehicleId: 11, trainLength: 8 }],
  siloCount: 9,
};
const buy = (t: number, id: string, label: string, from: number, to: number): BuildUpAction => ({ t, kind: 'research', label, id, fromLevel: from, level: to, cost: 1e41 });
const actions: BuildUpAction[] = [
  buy(mt(11, 6, 13, 59), 'enlightened_chickens', 'Enlightened Chickens', 93, 101),
  buy(mt(11, 6, 13, 59), 'neural_net_refine', 'Neural Net Refinement', 13, 14),
  buy(mt(11, 6, 13, 59), 'neural_linking', 'Neural Linking', 29, 30),
  buy(mt(11, 6, 14, 2), 'enlightened_chickens', 'Enlightened Chickens', 101, 102),
  buy(mt(11, 6, 14, 27), 'enlightened_chickens', 'Enlightened Chickens', 102, 103),
];
const lines = buildUpTracker({ actions, zone: ZONE, hours: HOURS, siloSeconds: 97200, startSilos: 9, startEgg: 'curiosity', now: mt(11, 6, 14, 51) }).lines;
const save = farm(102, 30, 14);

describe('a build-up plan with an anchor farm newer than its start farm', () => {
  it('the save still fits and ticks the lines it holds', () => {
    const anchorNewer = farm(98, 30, 13);
    expect(saveFit(save, start, anchorNewer)).toBe('fits');
    const b = boughtFromSave({ lines, save, start, startEgg: 'curiosity', anchorFarm: anchorNewer });
    expect(b.ticks.size).toBe(2); // the 1:59 pm line and the 2:02 pm line
  });
  it('control: with the anchor equal to the start farm it ticks (passes today)', () => {
    const b = boughtFromSave({ lines, save, start, startEgg: 'curiosity', anchorFarm: farm(93, 29, 13) });
    expect(b.ticks.size).toBe(2);
  });
  it('control: a plan that starts afresh after a prestige still reads a save from before it as beforePrestige', () => {
    const freshStart: BuildUpStart = { ...start, researchLevels: {}, habIds: [0, null, null, null], vehicles: [{ vehicleId: 0, trainLength: 1 }], siloCount: 1 };
    const oldFarm = farm(100, 30, 15);
    expect(saveFit(oldFarm, freshStart, oldFarm)).toBe('beforePrestige');
  });
});
