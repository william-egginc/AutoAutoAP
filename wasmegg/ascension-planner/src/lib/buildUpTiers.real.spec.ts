/**
 * The tier unlock labels on a REAL simulated build-up (the synthetic save, no player data; the same plan as
 * buildUpTracker.real.spec.ts): every marked check-in is exactly where the planner's own `isTierUnlocked` (the rule the
 * simulation uses) first says yes, replaying the plan's research items from its start levels; no other tier flips anywhere
 * else. One leg of simulation (a minute or two).
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { syntheticInputs } from '@/test/syntheticSave';
import { createChainEvaluator } from '@/search/chain';
import { buildUpPlanFromSegments } from './followSim';
import { siloSeconds } from './saveAge';
import { buildUpTracker, type TrackerResult } from './buildUpTracker';
import { tierUnlocks } from './buildUpTiers';
import { isTierUnlocked } from '@/calculations/commonResearch';
import type { BuildUpPlan } from '@/search/buildUpActions';

const ZONE = 'America/Denver';
let plan: BuildUpPlan;
let r: TrackerResult;

beforeAll(async () => {
  const inputs = await syntheticInputs();
  const route = createChainEvaluator(inputs).evaluate([192], { keepPurchases: true })!;
  const level = (inputs.context?.epicResearchLevels as Record<string, number> | undefined)?.['silo_capacity'];
  const made = buildUpPlanFromSegments(route.legs, { accountKey: 'acct-synthetic', siloSeconds: siloSeconds(inputs.currentFarmState?.numSilos, level) })!;
  plan = { ...made, siloSeconds: siloSeconds(made.start!.siloCount, level) };
  r = buildUpTracker({
    actions: plan.actions,
    zone: ZONE,
    hours: { days: [], fromHour: 7, toHour: 1, timezone: ZONE },
    siloSeconds: plan.siloSeconds,
    startSilos: plan.start?.siloCount ?? null,
    startEgg: plan.start?.egg ?? null,
    saleCount: plan.saleCount ?? null,
    variantKey: plan.variantKey,
    now: plan.startedAt + 600,
  });
}, 1_800_000);

describe('tier unlocks on a real build-up match isTierUnlocked', () => {
  it('each marked check-in is where the tier first unlocks, and no tier flips anywhere else', () => {
    const start = plan.start!.researchLevels;
    const u = tierUnlocks(start, r.lines);
    // Not vacuous: this build-up does unlock a tier.
    expect(u.length, JSON.stringify(u.map(x => x.tiers))).toBeGreaterThan(0);
    const at = new Map(u.map(x => [x.key, x.tiers]));
    const levels: Record<string, number> = { ...start };
    const open = new Set<number>();
    for (let t = 2; t <= 13; t++) if (isTierUnlocked(levels, t)) open.add(t);
    const flips = new Map<string, number[]>();
    for (const l of r.lines) {
      if (l.kind !== 'research' || !l.items) continue;
      for (const i of l.items) if (i.kind === 'research') levels[i.id] = Math.max(levels[i.id] ?? 0, i.level);
      const now: number[] = [];
      for (let t = 2; t <= 13; t++) if (!open.has(t) && isTierUnlocked(levels, t)) (open.add(t), now.push(t));
      if (now.length) flips.set(l.key, now);
    }
    expect([...at]).toEqual([...flips]);
    // The labels say what is true of this plan: whatever it unlocks, it unlocks; the rest it does not.
    for (let t = 2; t <= 13; t++) expect(open.has(t)).toBe(isTierUnlocked(levels, t));
  });
});
