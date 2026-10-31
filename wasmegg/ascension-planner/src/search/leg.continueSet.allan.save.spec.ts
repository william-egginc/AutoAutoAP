/**
 * SETS CHANGE ONLY ON HUMILITY on the Allan-like synthetic (spec-continueset, 31 Oct 2026; aaap-tools
 * notes/continue-set-2026-10-31.md, "Reconcile"): a Kindness farm at 210 TE wearing its Gusset delivery set,
 * gear maxed. Continue and the build-up keep that set until H1 (search/leg.ts), and the route
 * 237 260 290 328 490 is pinned where Reliability measured it with the set held: A1 Dec 18, 2026, 7:59 am,
 * the route's end Jul 17, 2028, 5:05 pm (Mountain). Before the fix the build-up was priced on the earnings set
 * and the same route ended Jul 12, 2028, 3:09 pm.
 *
 * The fixture is built in memory, as Reliability's `contset/mk.cjs` (EGG=54, variant 2, CATCHUP_H 0.02) and
 * `precompute.ts --reference` built it: the account (epic research, colleggtibles, owned artifacts) from a
 * private save read where it is (never copied; ALLAN_LIKE_SAVE, or ~/code/aaap-tools/chicago-like.json), its
 * eggs set to the Allan-like counts, its farm the K3 farm below, a placeholder ID. Then the best delivery set at
 * that farm's research is EQUIPPED FROM OWNED ITEMS: the active slots point at items in the inventory, and the
 * spec checks the loader reads them back (a save whose slots point at missing items wears nothing, and runs at
 * ~3.0 q/hr instead of ~6.8: the flaw that once hid this).
 *
 * SKIPPED when the save is absent, and unless AAP_SLOW_SPECS=1. A few minutes when it runs:
 *   AAP_SLOW_SPECS=1 npx vitest run src/search/leg.continueSet.allan.save.spec.ts
 */
import '../../scripts/node-shims';

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { resolveColleggtibleContracts } from 'lib';
import { allPossibleTiers } from 'lib/artifacts/data';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { getArtifactLoadoutFromBackup, getOptimalELRSet } from '@/lib/artifacts';
import { sameSet } from '@/lib/gearMatch';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';
import { computeSnapshot } from '@/engine/compute';
import { createChainEvaluator } from './chain';
import { buildUpVariantForCheck, continueStateForCheck, continueVariantForCheck } from './leg';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SearchInputs } from './types';

const SAVE = process.env.ALLAN_LIKE_SAVE ?? join(homedir(), 'code/aaap-tools/chicago-like.json');
const hasSave = existsSync(SAVE);

/** Oct 29, 2026, 7:11 pm Mountain. */
const START = Math.floor(Date.parse('2026-10-30T01:11:00Z') / 1000);
const ROUTE = [237, 260, 290, 328, 490];
/** Measured on the fix (1e277bbd), the same as Reliability's held-set probe. */
const PINNED = {
  /** Dec 18, 2026, 7:59 am Mountain: continue and the build-up end together. */
  a1: 1797605990,
  /** Jul 17, 2028, 5:05 pm Mountain. */
  routeEnd: 1847487917,
};

/** Variant 2's farm at K3 on a fresh build from 210 TE (Reliability's afh/k3states-210.json). Simulator
 *  output, no player data. */
const K3_RESEARCH: Record<string, number> = {
  comfy_nests: 50,
  excitable_chickens: 25,
  nutritional_sup: 40,
  better_incubators: 15,
  hatchery_expansion: 10,
  hab_capacity1: 8,
  internal_hatchery1: 10,
  padded_packaging: 30,
  coordinated_clucking: 50,
  leafsprings: 30,
  bigger_eggs: 1,
  rooster_booster: 25,
  hen_house_ac: 50,
  internal_hatchery2: 10,
  microlux: 10,
  vehicle_reliablity: 2,
  superfeed: 35,
  compact_incubators: 10,
  hatchery_rebuild1: 1,
  lightweight_boxes: 40,
  excoskeletons: 2,
  internal_hatchery3: 15,
  motivational_clucking: 50,
  improved_genetics: 30,
  usde_prime: 1,
  traffic_management: 2,
  driver_training: 30,
  shell_fortification: 60,
  internal_hatchery4: 30,
  even_bigger_eggs: 5,
  super_alloy: 50,
  egg_loading_bots: 2,
  genetic_purification: 100,
  time_compress: 20,
  internal_hatchery5: 250,
  quantum_storage: 20,
  hover_upgrades: 25,
  graviton_coating: 7,
  chrystal_shells: 100,
  neural_linking: 30,
  grav_plating: 25,
  autonomous_vehicles: 5,
  dark_containment: 25,
  telepathic_will: 50,
  enlightened_chickens: 105,
  timeline_diversion: 50,
  micro_coupling: 4,
  atomic_purification: 47,
  neural_net_refine: 19,
  multi_layering: 2,
  eggsistor: 62,
  wormhole_dampening: 19,
  matter_reconfig: 189,
  relativity_optimization: 5,
  hyper_portalling: 7,
};

/** mk.cjs and `--reference`, in memory. */
function allanLike(): any {
  const b = JSON.parse(readFileSync(SAVE, 'utf8'));
  b.eiUserId = 'EI1234567890123456';
  const B = TE_BREAKPOINTS;
  const rate = 6.06e15 / 3600;
  const left = (d: number) => B[46] - d * 86400 * rate;
  b.virtue.eggsDelivered = [left(8.45), left(18.45), B[46] * 1.0005, left(14.45), left(9.6)];
  b.virtue.eovEarned = [43, 38, 38, 40, 40];
  const f = b.farms[0];
  f.eggType = 54;
  f.lastStepTime = START - 0.02 * 3600;
  f.commonResearch = Object.entries(K3_RESEARCH).map(([id, level]) => ({ id, level }));
  f.habs = [18, 18, 18, 18];
  f.vehicles = Array(17).fill(11);
  f.trainLength = Array(17).fill(9);
  f.silosOwned = 9;
  f.unclaimedCash = 0;
  f.cashEarned = 0;
  f.cashSpent = 0;
  b.approxTime = START - 60;
  b.settings.lastBackupTime = START - 60;
  // --reference (scripts/precompute.ts REFERENCE_ADDITIONS): a T4L metronome and T4 stones, owned.
  const items = b.artifactsDb.virtueAfxDb.inventoryItems;
  (
    [
      [24, 3, 3, 1],
      [33, 2, 0, 12],
      [1, 2, 0, 12],
      [36, 2, 0, 12],
    ] as const
  ).forEach(([name, level, rarity, quantity], i) =>
    items.push({
      itemId: 910000000 + i,
      artifact: { spec: { name, level, rarity, egg: 1000 } },
      quantity,
      serverId: '',
    })
  );
  return b;
}

/** The spec of an artifact or stone id ("gusset-4-3", "quantum-stone-4"). */
function specOf(id: string): { name: number; level: number; rarity: number } {
  const t = (allPossibleTiers as any[]).find(
    t => id === `${t.family.id}-${t.tier_number}` || id.startsWith(`${t.family.id}-${t.tier_number}-`)
  );
  if (!t) throw new Error(`unknown artifact ${id}`);
  const rest = id.slice(`${t.family.id}-${t.tier_number}`.length);
  return { name: t.afx_id, level: t.afx_level, rarity: rest ? Number(rest.slice(1)) : 0 };
}

/** Wear `set` from OWNED items: each slot points at an inventory item of that artifact, socketed with the set's
 *  stones (owned loose stones). Throws when the save does not own one. */
function wear(backup: any, set: EquippedArtifact[]): void {
  const db = backup.artifactsDb.virtueAfxDb;
  const used = new Set<number>();
  db.activeArtifacts = {
    slots: set.map(a => {
      if (!a.artifactId) return { occupied: false };
      const want = specOf(a.artifactId);
      const item = db.inventoryItems.find(
        (it: any) =>
          !used.has(it.itemId) &&
          it.artifact?.spec?.name === want.name &&
          it.artifact.spec.level === want.level &&
          (it.artifact.spec.rarity || 0) === want.rarity
      );
      if (!item) throw new Error(`the save does not own ${a.artifactId}`);
      used.add(item.itemId);
      item.artifact.stones = a.stones.filter((s): s is string => !!s).map(s => ({ ...specOf(s), rarity: 0 }));
      return { occupied: true, itemId: item.itemId };
    }),
  };
}

async function load(backup: any): Promise<SearchInputs> {
  setActivePinia(createPinia());
  resolveColleggtibleContracts(backup);
  await initPlanFuture('file', markRaw(backup));
  const store = useChainSearchStore();
  store.setFirstAscension('auto');
  store.continueStartRule = false;
  store.pinPlanStart(START);
  return store.collectInputs();
}

const qph = (perSecond: number) => (perSecond * 3600) / 1e15;

describe.skipIf(!hasSave || !process.env.AAP_SLOW_SPECS)('Allan-like: the Gusset set worn on Kindness', () => {
  let inputs: SearchInputs;
  let worn: EquippedArtifact[];

  beforeAll(async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-31T18:00:00Z'), toFake: ['Date'] });
    const backup = allanLike();
    // The best delivery set at the farm's research, as continue picks it with nothing worn.
    const bare = await load(backup);
    expect(getArtifactLoadoutFromBackup(backup).every(a => !a.artifactId)).toBe(true);
    worn = getOptimalELRSet(backup, {
      commonResearch: bare.currentFarmState!.commonResearches,
      epicResearchLevels: bare.context.epicResearchLevels,
      colleggtibleModifiers: bare.context.colleggtibleModifiers,
      currentSet: getArtifactLoadoutFromBackup(backup),
      assumeMaxHabsVehicles: false,
    });
    wear(backup, worn);
    inputs = await load(backup);
  }, 600_000);
  afterAll(() => vi.useRealTimers());

  it('wears the Gusset set from owned items: the loader reads it back, and it lays at ~6.8 q/hr, not bare', () => {
    const read = getArtifactLoadoutFromBackup(inputs.context.rawBackup as any);
    expect(read.filter(a => a.artifactId)).toHaveLength(4);
    expect(read.map(a => a.artifactId)).toContain('gusset-4-3');
    expect(sameSet(read, worn)).toBe(true);
    const c = continueStateForCheck(inputs, inputs.baseState)!;
    expect(c.currentEgg).toBe('kindness');
    expect(sameSet(c.artifactLoadout as EquippedArtifact[], worn)).toBe(true);
    const elr = computeSnapshot(c, inputs.context, { skipGrowth: true }).elr;
    const bareElr = computeSnapshot(
      { ...c, artifactLoadout: c.artifactLoadout.map(() => ({ artifactId: null, stones: [] })) },
      inputs.context,
      {
        skipGrowth: true,
      }
    ).elr;
    expect(qph(elr)).toBeGreaterThan(6.5);
    expect(qph(elr)).toBeGreaterThan(qph(bareElr) * 1.5);
  });

  it('A1: continue and the build-up end together, Dec 18, 2026, 7:59 am', () => {
    const base = () => JSON.parse(JSON.stringify(inputs.baseState));
    const c = continueVariantForCheck(inputs, base(), inputs.planStart, ROUTE[0], 0)!;
    const b = buildUpVariantForCheck(inputs, base(), inputs.planStart, ROUTE[0], 0, Math.floor(inputs.currentTE))!;
    expect(Math.floor(c.summary.endTime)).toBe(PINNED.a1);
    expect(Math.floor(b.summary.endTime)).toBe(PINNED.a1);
  }, 600_000);

  it('the route 237 260 290 328 490 ends Jul 17, 2028, 5:05 pm', () => {
    const r = createChainEvaluator(inputs).evaluate(ROUTE, { handoff: 'hour' })!;
    expect(r).not.toBeNull();
    expect(Math.floor(r.legs[0].endTime)).toBe(PINNED.a1);
    expect(Math.floor(inputs.planStart + r.seconds)).toBe(PINNED.routeEnd);
  }, 1_200_000);
});
