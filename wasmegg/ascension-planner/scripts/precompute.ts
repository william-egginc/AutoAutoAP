/**
 * The precomputed-ascension table (Allan's idea, 1 Oct 2026; the evidence it holds is in the
 * precompute notes): every fresh ascension priced once, keyed by where it starts (TE), when it starts
 * (hour of the week) and where it ascends (checkpoint), so that finding the fastest route becomes a
 * lookup instead of a simulation.
 *
 * WHY ONE BUILD COVERS EVERY CHECKPOINT. An ascension in the simulator is an expensive build (the
 * C1..R1 shifts, then the 1/2/3-sale C3 variants), then a tail that is arithmetic: K3 waits for the
 * later of the sale ending and kindness's share of the goal, and C4/I2/R2/H2 wait for theirs, all at
 * the build's peak delivery rate (auto/ascension.ts `runAscension`, auto/shifts/te-wait.ts). So the
 * build is run once per start, and each checkpoint only re-runs the cheap tail.
 *
 * MODES
 *   --profile        Time the build, the variants and the tail on a few starts, and check that the
 *                    split gives exactly what the search's own `runLeg` gives.
 *   --verify         Check `tailTo` (search/precomputedLeg.ts) against the simulator on every
 *                    checkpoint from several starts and hours.
 *   --check          Print the account the table would be built on: its delivery set and score,
 *                    and its earnings set's Clothed TE bonus.
 *
 *   --reference      Make the save a perfect maxed account first, by adding what the alt's save is
 *                    missing (a T4L quantum metronome and T4 stones) to its owned artifacts. The
 *                    optimizer then picks the best sets as it would for anyone; --check shows them.
 */
import './node-shims';

import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
setActivePinia(createPinia());

import { readFileSync } from 'node:fs';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { deriveNextStartState, runAscensionFromC3Variant, runUntilShift } from '@/auto/ascension';
import { runC3Variants } from '@/auto/shifts/c3';
import { distributeTargetTE } from '@/auto/shifts/te-wait';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';
import { pickVariant, type VariantKey, type VariantResult } from '@/stores/autoPlanner';
import { runLeg, TIER_13_MIN_STARTING_TE } from '@/search/leg';
import { runH1 } from '@/auto/shifts/h1';
import { applyShiftAction } from '@/auto/shifts/helpers/actionHelpers';
import { runMaxVehiclesPlan } from '@/auto/shifts/helpers/vehicles';
import { calculateArtifactModifiers } from '@/lib/artifacts';
import { computeRealisticELR } from '@/calculations/realisticELR';
import { bestTailTo, EGG_ORDER, tailTo, type BuildParams } from '@/search/precomputedLeg';
import { deliveryScore } from '@/search/virtueScore';
import { describeLoadoutSlots } from '@/search/csv';
import { cteFromArtifacts } from 'lib/virtue';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import type { EngineState } from '@/engine/types';
import type { SearchInputs } from '@/search/types';
import type { VirtueEgg } from '@/types';

const EGGS: VirtueEgg[] = ['curiosity', 'kindness', 'integrity', 'resilience', 'humility'];

function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const has = (name: string) => process.argv.includes('--' + name);

/** Load a save the way the Auto Planner does (lib/modes/planFuture.ts), and return the inputs a
 *  search would get from it. */
/** What `--reference` adds to the owned (not equipped) virtue artifacts: [afx name, level, rarity,
 *  count]. Ids from lib/artifacts/data.json: T4L quantum metronome 24/3/3, T4 lunar 33/2, T4 tachyon
 *  1/2, T4 quantum 36/2. Generous on stones; the optimizer takes what it needs. */
const REFERENCE_ADDITIONS: [number, number, number, number][] = [
  [24, 3, 3, 1],
  [33, 2, 0, 12],
  [1, 2, 0, 12],
  [36, 2, 0, 12],
];

function addReferenceGear(backup: any): void {
  const db = backup?.artifactsDb?.virtueAfxDb;
  if (!db) throw new Error('--reference: the save has no virtue artifacts to add to');
  db.inventoryItems ??= [];
  REFERENCE_ADDITIONS.forEach(([name, level, rarity, quantity], i) =>
    // An itemId far above any real one (real ids are Longs in the tens of thousands), as fastsearch's
    // --add-artifact does: owned, never equipped.
    db.inventoryItems.push({
      itemId: 910000000 + i,
      artifact: { spec: { name, level, rarity, egg: 1000 } },
      quantity,
      serverId: '',
    })
  );
}

async function loadInputs(file: string): Promise<SearchInputs> {
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  if (has('reference')) addReferenceGear(backup);
  resolveColleggtibleContracts(backup);
  await initPlanFuture('file', markRaw(backup));
  return useChainSearchStore().collectInputs();
}

/**
 * The state a fresh ascension starts from at TE `te`, as if the last one had just ended there: the
 * account's permanent progress from the save, a reset farm, and `te` shared across the five eggs
 * the way the simulator shares a goal (cheapest next TE first, from nothing), each egg's delivered
 * count exactly on its threshold. Canonical on purpose: the table is keyed by TE, and the history
 * that got a player there is shown (by the board's legs) to barely matter.
 */
export function startStateAt(inputs: SearchInputs, te: number): EngineState {
  const zero = Object.fromEntries(EGGS.map(e => [e, 0])) as Record<VirtueEgg, number>;
  const perEgg = distributeTargetTE(zero, te);
  const delivered = Object.fromEntries(EGGS.map(e => [e, perEgg[e] > 0 ? TE_BREAKPOINTS[perEgg[e] - 1] : 0])) as Record<
    VirtueEgg,
    number
  >;
  const base = JSON.parse(JSON.stringify(inputs.baseState)) as EngineState;
  return deriveNextStartState(
    {
      finalTE: perEgg,
      endSoulEggs: base.soulEggs,
      endShiftCount: base.shiftCount,
      eggsDelivered: delivered,
    } as never,
    base
  );
}

/** One start's build: the shared C1..R1 run and every C3 variant still possible. */
export function buildAt(inputs: SearchInputs, state: EngineState, start: number, te: number) {
  const ctx = { ...inputs.context, ascensionStartTime: start, planStartOffset: 0 };
  const pre = runUntilShift(state, ctx, 'C3');
  const preC3 = { actions: pre.actions, state: pre.state, elapsedSeconds: pre.elapsedSeconds };
  const variants = runC3Variants(pre.state, ctx, 3, te < TIER_13_MIN_STARTING_TE).filter(v => !v.impossible);
  return { ctx, preC3, variants };
}

/** Every variant's tail to `target`, and the one the app picks (seconds, key). */
export function legTo(
  state: EngineState,
  build: ReturnType<typeof buildAt>,
  start: number,
  target: number
): { seconds: number; key: VariantKey } | null {
  const fresh: Partial<Record<VariantKey, VariantResult>> = {};
  for (const v of build.variants) {
    const key = (v.attemptTier13Unlock ? `${v.saleCount}-sale-tier13` : `${v.saleCount}-sale`) as VariantKey;
    fresh[key] = runAscensionFromC3Variant(state, build.preC3, v, build.ctx, start, 'asc', target);
  }
  const keys = Object.keys(fresh) as VariantKey[];
  if (!keys.length) return null;
  const best = pickVariant(fresh);
  const key = keys.find(k => fresh[k] === best)!;
  return { seconds: best.summary.totalDurationSeconds, key };
}

/**
 * A variant's build as `BuildParams`: H1 and K3's purchases replayed exactly as `runAscension` runs
 * them when it resumes a C3 variant at H1, stopping where K3's wait would begin.
 */
export function paramsOf(
  build: ReturnType<typeof buildAt>,
  v: ReturnType<typeof buildAt>['variants'][number],
  start: number
): BuildParams {
  const ctx = build.ctx;
  let state = JSON.parse(JSON.stringify(v.result.endState)) as EngineState;
  let elapsed = build.preC3.elapsedSeconds + v.result.elapsedSeconds;
  state.lastStepTime = elapsed;
  const h1 = runH1(state, ctx);
  state = h1.endState;
  elapsed += h1.elapsedSeconds;
  state.lastStepTime = elapsed;
  const shifted = applyShiftAction(state, ctx, 'kindness');
  const vehicles = runMaxVehiclesPlan(shifted.state, ctx, Infinity);
  const k3 = vehicles.endState;
  const peakELR = computeRealisticELR(
    k3.researchLevels,
    calculateArtifactModifiers(k3.artifactLoadout),
    ctx.epicResearchLevels,
    ctx.colleggtibleModifiers
  ).effectiveRate;
  return {
    sales: v.saleCount,
    tier13: !!v.attemptTier13Unlock,
    waitStart: elapsed + vehicles.elapsedSeconds,
    saleEnd: v.buildPhaseEnd - start,
    peakELR,
    delivered: EGG_ORDER.map(e => k3.eggsDelivered[e] || 0),
  };
}

async function verify(file: string): Promise<void> {
  const inputs = await loadInputs(file);
  const base = Math.floor(Date.now() / 1000);
  let checked = 0;
  let worst = 0;
  let worstAt = '';
  let endMismatch = 0;
  let pickMismatch = 0;
  for (const te of [140, 190, 250, 320, 400, 460]) {
    for (const hourOffset of [0, 29, 77, 131]) {
      const start = base + hourOffset * 3600;
      const state = startStateAt(inputs, te);
      const build = buildAt(inputs, state, start, te);
      const params = build.variants.map(v => paramsOf(build, v, start));
      for (let target = te + 1; target <= 490; target++) {
        const fresh: Partial<Record<VariantKey, VariantResult>> = {};
        build.variants.forEach((v, i) => {
          const key = (v.attemptTier13Unlock ? `${v.saleCount}-sale-tier13` : `${v.saleCount}-sale`) as VariantKey;
          const sim = runAscensionFromC3Variant(state, build.preC3, v, build.ctx, start, 'asc', target);
          fresh[key] = sim;
          const mine = tailTo(params[i], target);
          const simEnd = Object.values(sim.summary.finalTE).reduce((a, b) => a + b, 0);
          if (!mine) {
            if (simEnd >= target) worst = Infinity;
            return;
          }
          checked++;
          const d = Math.abs(mine.seconds - sim.summary.totalDurationSeconds);
          if (d > worst) {
            worst = d;
            worstAt = `TE ${te} -> ${target}, +${hourOffset} h, ${key}`;
          }
          if (mine.endTE !== simEnd) endMismatch++;
        });
        const keys = Object.keys(fresh) as VariantKey[];
        if (!keys.length) continue;
        const simBest = pickVariant(fresh).summary.totalDurationSeconds;
        const mine = bestTailTo(params, target);
        if (!mine || Math.abs(mine.seconds - simBest) > 1e-6) pickMismatch++;
      }
    }
    console.log(`  TE ${te} done (${checked} checks so far, worst ${worst.toExponential(2)} s)`);
  }
  console.log(
    `\nverified ${checked} (start, hour, checkpoint, variant) cases: worst difference ${worst.toExponential(3)} s` +
      (worstAt ? ` (${worstAt})` : '') +
      `; end-TE mismatches ${endMismatch}; best-variant mismatches ${pickMismatch}`
  );
}

async function check(file: string): Promise<void> {
  await loadInputs(file);
  const inv = useChainSearchStore().readInventory();
  const fmt = (slots: ReturnType<typeof describeLoadoutSlots>) =>
    (slots ?? [])
      .map(sl => `${sl.artifact} [${sl.stones.map(x => x.replace(' stone', '')).join(', ')}]`)
      .join('\n    ');
  console.log('delivery set:\n    ' + fmt(describeLoadoutSlots(inv.elr)));
  console.log('delivery score: ' + JSON.stringify(inv.elr ? deliveryScore(inv.elr) : null));
  console.log('earnings set:\n    ' + fmt(describeLoadoutSlots(inv.earnings)));
  console.log(
    'Clothed TE bonus from the earnings set: ' +
      (inv.earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(inv.earnings)).toFixed(2) : 'none')
  );
}

async function profile(file: string): Promise<void> {
  const inputs = await loadInputs(file);
  const now = Math.floor(Date.now() / 1000);
  const ms = (t: number) => (performance.now() - t).toFixed(0) + ' ms';
  for (const te of [160, 230, 300]) {
    const state = startStateAt(inputs, te);
    let t = performance.now();
    const build = buildAt(inputs, state, now, te);
    const buildMs = performance.now() - t;
    const targets: number[] = [];
    for (let b = te + 5; b <= Math.min(490, te + 160); b += 5) targets.push(b);
    t = performance.now();
    const tails = targets.map(b => legTo(state, build, now, b));
    const tailMs = (performance.now() - t) / targets.length;
    // The split must give what the search's own runLeg gives, to the second.
    let worst = 0;
    for (const [k, b] of targets.entries()) {
      if (k % 6) continue;
      const leg = runLeg(inputs, state, now, b, false, te, 2);
      const mine = tails[k];
      if (!leg || !mine) continue;
      worst = Math.max(worst, Math.abs(leg.summary.totalDurationSeconds - mine.seconds));
    }
    console.log(
      `TE ${te}: build ${buildMs.toFixed(0)} ms (${build.variants.length} variants) | tail ${tailMs.toFixed(1)} ms per checkpoint` +
        ` | runLeg agrees within ${worst.toFixed(3)} s | e.g. to ${targets[0]}: ${((tails[0]?.seconds ?? 0) / 86400).toFixed(2)} d (${tails[0]?.key})` +
        `, to ${targets[targets.length - 1]}: ${((tails[tails.length - 1]?.seconds ?? 0) / 86400).toFixed(2)} d`
    );
    void ms;
  }
}

async function main(): Promise<void> {
  const backup = arg('backup');
  if (!backup) throw new Error('--backup FILE.json is required');
  if (has('profile')) return profile(backup);
  if (has('verify')) return verify(backup);
  if (has('check')) return check(backup);
  throw new Error('nothing to do: pass --profile, --verify or --check');
}

main().then(
  () => process.exit(0),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
