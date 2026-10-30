/**
 * BUILD-UP TRACKER (search/leg.ts `LegOptions.keepPurchases`, search/chain.ts `EvaluateChainOptions.keepPurchases`,
 * lib/followSim.ts `buildUpPlanFromSegments`) on a real simulated leg of the synthetic save (src/test/syntheticSave.ts;
 * no player data, fixed clock).
 *
 * What it proves:
 * - off (the default) nothing changes: the leg's result, the route and Right now's leg (`simLegFromSegments`) are
 *   IDENTICAL with the flag on and off, apart from the one extra field (`buildUp`), and the simulation's own numbers
 *   are the ones leg.shiftTE.spec.ts recorded before;
 * - on, the list is the picked variant's actions in time order: research with names and levels, vehicles, habs,
 *   silos, the leg's shifts exactly, and artifact set swaps only while the farm is on Humility;
 * - the leg-build cache (search/leg.ts `legBuild`) is not poisoned: a build made without the ask is made again with
 *   it, a build made with it answers a leg asked without it exactly as before, and the list is the same whether the
 *   build is shared or not;
 * - the chain memo keeps the two apart.
 *
 * A few legs of simulation (minutes), like leg.shiftTE.spec.ts.
 */
import '../../scripts/node-shims';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheticInputs } from '@/test/syntheticSave';
import { createChainEvaluator } from './chain';
import { legBuildStats, runLeg, setLegBuildSharing, type LegResult } from './leg';
import { writeFileSync } from 'node:fs';
import { BUILDUP_PLAN_MAX_BYTES, buildUpPlanFromSegments, simLegFromSegments } from '@/lib/followSim';
import type { EngineState } from '@/engine/types';
import type { ChainResult, SearchInputs } from './types';
import type { BuildUpAction } from './buildUpActions';

/** leg.shiftTE.spec.ts `BEFORE`: the route's numbers recorded before the build-up list existed. */
const BEFORE = { seconds: 1410518.5035481453, endTime: 1792270118.5035481, key: '1-sale', endTE: 192 };

let inputs: SearchInputs;
/** The first leg's start state, as chain.ts builds it. */
function firstState(): EngineState {
  const b = JSON.parse(JSON.stringify(inputs.baseState)) as EngineState;
  b.currentEgg = 'curiosity';
  b.population = 1;
  b.bankValue = 0;
  b.researchLevels = {};
  return b;
}
const leg = (keep?: boolean): LegResult | null =>
  keep
    ? runLeg(inputs, firstState(), inputs.planStart, 192, true, inputs.currentTE, 0, undefined, { keepPurchases: true })
    : runLeg(inputs, firstState(), inputs.planStart, 192, true, inputs.currentTE, 0);
const without = <T extends { buildUp?: unknown }>(x: T): Omit<T, 'buildUp'> => {
  const { buildUp: _b, ...rest } = x;
  return rest;
};

let off: LegResult;
let on: LegResult;
let offAgain: LegResult;
let stats: { hits: number; misses: number };
let routeOff: ChainResult;
let routeOn: ChainResult;
let routeOffAfter: ChainResult;

beforeAll(async () => {
  inputs = await syntheticInputs();
  setLegBuildSharing(true);
  legBuildStats(true);
  off = leg()!; // builds (miss)
  on = leg(true)!; // the kept build has no list: built again, with it (miss)
  offAgain = leg()!; // the build with the list answers a leg without the ask (hit)
  stats = legBuildStats(true);
  routeOff = createChainEvaluator(inputs).evaluate([192])!;
  const ev = createChainEvaluator(inputs);
  routeOn = ev.evaluate([192], { keepPurchases: true })!;
  routeOffAfter = ev.evaluate([192])!;
}, 1_800_000);
afterAll(() => setLegBuildSharing(true));

describe('the build-up list, off by default', () => {
  it('the leg is identical with the flag on and off, apart from buildUp', () => {
    expect(off).not.toHaveProperty('buildUp');
    expect(on.buildUp).toBeDefined();
    expect(without(on)).toEqual(off);
    expect(JSON.stringify(without(on))).toBe(JSON.stringify(off));
    expect(JSON.stringify(offAgain)).toBe(JSON.stringify(off));
  });

  it('the leg cache is not poisoned: built again for the ask, then shared with a leg asked without it', () => {
    expect(stats).toEqual({ hits: 1, misses: 2 });
  });

  it("the route is identical, and the simulation's own numbers are the ones recorded before", () => {
    expect(routeOff.seconds).toBe(BEFORE.seconds);
    expect(routeOff.legs[0]).toMatchObject({ key: BEFORE.key, endTE: BEFORE.endTE, endTime: BEFORE.endTime });
    expect(routeOff.legs[0]).not.toHaveProperty('buildUp');
    expect(routeOn.seconds).toBe(routeOff.seconds);
    expect(JSON.stringify({ ...routeOn, legs: routeOn.legs.map(without) })).toBe(JSON.stringify(routeOff));
    // The memo keeps them apart: the same evaluator, asked without, answers as before.
    expect(JSON.stringify(routeOffAfter)).toBe(JSON.stringify(routeOff));
    expect(routeOn.legs[0].buildUp).toEqual(on.buildUp);
  });

  it("Right now's leg is identical; the plan comes only from the list", () => {
    const o = { timeOff: inputs.timeOff, currentTE: inputs.currentTE, planStart: inputs.planStart };
    expect(simLegFromSegments(routeOn.legs, o)).toEqual(simLegFromSegments(routeOff.legs, o));
    expect(buildUpPlanFromSegments(routeOff.legs, { accountKey: 'a', siloSeconds: 3600 })).toBeNull();
    const plan = buildUpPlanFromSegments(routeOn.legs, { accountKey: 'a', siloSeconds: 3600 })!;
    expect(plan.startedAt).toBe(routeOn.legs[0].startTime);
    expect(plan.endTime).toBe(routeOn.legs[0].endTime);
    expect(plan.variantKey).toBe(BEFORE.key);
    expect(plan.actions).toEqual(on.buildUp!.actions);
    expect(plan.start).toMatchObject({ egg: 'curiosity', researchLevels: {} });
  });
});

describe('the build-up list, on', () => {
  const acts = (): BuildUpAction[] => on.buildUp!.actions;

  it('is in time order, inside the leg', () => {
    const a = acts();
    expect(a.length).toBeGreaterThan(50);
    for (let i = 1; i < a.length; i++) expect(a[i].t).toBeGreaterThanOrEqual(a[i - 1].t);
    expect(a[0].t).toBeGreaterThanOrEqual(inputs.planStart);
    expect(a[a.length - 1].t).toBeLessThanOrEqual(on.summary.endTime + 1e-6);
  });

  it('has research with names and levels, vehicles, habs and silos', () => {
    const a = acts();
    const research = a.filter(x => x.kind === 'research');
    expect(research.length).toBeGreaterThan(20);
    for (const r of research) {
      expect(r.id).toBeTruthy();
      expect(r.label).not.toBe(r.id);
      expect(r.level).toBeGreaterThan(r.fromLevel!);
    }
    expect(research.find(r => r.id === 'comfy_nests')?.label).toBe('Comfortable Nests');
    const vehicles = a.filter(x => x.kind === 'vehicle');
    expect(vehicles.length).toBeGreaterThan(0);
    for (const v of vehicles) expect(typeof v.slot === 'number' && typeof v.itemId === 'number').toBe(true);
    const habs = a.filter(x => x.kind === 'hab');
    expect(habs.length).toBeGreaterThan(0);
    for (const h of habs) expect(typeof h.slot === 'number' && typeof h.itemId === 'number').toBe(true);
    const silos = a.filter(x => x.kind === 'silo');
    expect(silos.length).toBeGreaterThan(0);
    for (const s of silos) expect(s.count).toBe(s.fromLevel! + 1);
  });

  it("has the leg's shifts, exactly", () => {
    const shifts = acts().filter(x => x.kind === 'shift');
    expect(shifts.map(s => [s.t, s.id, s.detail])).toEqual(on.shifts.map(s => [s.at, s.egg, s.fromEgg]));
  });

  it('swaps the artifact set only while the farm is on Humility (after the set it starts in)', () => {
    let egg = on.buildUp!.start!.egg;
    let shifted = false;
    const swaps: string[] = [];
    for (const x of acts()) {
      if (x.kind === 'shift') {
        egg = x.id!;
        shifted = true;
      }
      if (x.kind !== 'artifactSet') continue;
      // The ascension starts by putting on its earnings set, before any shift.
      if (!shifted) {
        expect(x).toMatchObject({ t: inputs.planStart, id: 'earnings' });
        continue;
      }
      expect(egg).toBe('humility');
      swaps.push(`${x.detail} ${x.id}`);
    }
    // H1 puts the delivery set on (fixture: the synthetic save's 1-sale leg).
    expect(swaps).toEqual(['update_artifact_set elr', 'equip_artifact_set elr']);
  });

  it('keeps the engine waits as it reports them: the research sale, and the sale starting', () => {
    const a = acts();
    const sale = a.find(x => x.kind === 'wait' && x.id === 'wait_for_research_sale');
    expect(sale?.seconds).toBeGreaterThan(0);
    expect(a.find(x => x.kind === 'event' && x.id === 'research' && x.on === true)?.t).toBe(sale!.t);
  });

  it('stays small: no engine states, well under what the plan record may hold', () => {
    const text = JSON.stringify(on.buildUp);
    expect(text).not.toContain('endState');
    expect(text.length).toBeLessThan(BUILDUP_PLAN_MAX_BYTES);
    if (process.env.BUILDUP_SIZE)
      writeFileSync(process.env.BUILDUP_SIZE, `${on.buildUp!.actions.length} actions, ${text.length} bytes\n`);
  });

  it('is the same list when the build is not shared', () => {
    setLegBuildSharing(false);
    const own = leg(true)!;
    setLegBuildSharing(true);
    expect(JSON.stringify(own)).toBe(JSON.stringify(on));
  }, 900_000);
});
