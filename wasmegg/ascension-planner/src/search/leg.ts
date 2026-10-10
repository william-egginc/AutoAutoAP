/**
 * One ascension ("leg"), simulated with the app's own simulator and scored the way the app itself
 * would score it.
 *
 * This is a straight port of `runLeg`/`buildContinueVariant` in scripts/fastsearch.ts, with exactly
 * one change: everything that file reads out of Pinia is passed in as `SearchInputs` instead, so
 * this module runs unchanged in a Web Worker (see search/types.ts for why). The call sequence —
 * `runUntilShift('C3')` once, then `runC3Variants`, then `runAscensionFromC3Variant` per surviving
 * variant, then the app's own `pickVariant` — is deliberately identical, because the whole point of
 * the exercise is that the search scores chains with the SAME code path the Auto Planner tab does.
 * Any divergence here is a bug, not an optimisation.
 *
 * Cost, measured: about 2.5 s per leg on a 20-core Windows box via the CLI harness, so a 6-leg chain
 * is ~15 s. Nothing in here is cheap, and `runC3Variants` (specifically `evaluateStones` inside it)
 * is the hotspot.
 */
import { computeSnapshot } from '@/engine/compute';
import { runUntilShift, deriveNextStartState, runContinueCurrent, runAscensionFromC3Variant } from '@/auto/ascension';
import { runC3Variants } from '@/auto/shifts/c3';
import { heldSecondsOf, holdForPlayer } from '@/auto/hold';
import { isConstrained, nextAvailable } from './availability';
import { pickVariant, type VariantKey, type VariantResult } from '@/stores/autoPlanner';
import {
  calculateArtifactModifiers,
  getArtifactLoadoutFromBackup,
  getOptimalEarningsSet,
  getOptimalELRSet,
} from '@/lib/artifacts';
import { computeRealisticELR } from '@/calculations/realisticELR';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { EngineState, SimulationContext } from '@/engine/types';
import type { Action } from '@/types/actions/meta';
import type { AscensionSummary } from '@/auto/types';
import type { VirtueEgg } from '@/types';
import type { SearchInputs, ShiftMoment } from './types';
import { CONTINUE_PIN_MAX_SECONDS, CONTINUE_MAX_SECONDS } from './rules';
import { readFirstAscension } from './firstAscension';
import { catchUpSeconds, siloSeconds } from '@/lib/saveAge';
import { EGG_ORDER, type BuildParams } from './precomputedLeg';
import type { TableHeader } from './precomputedTable';

/** Mirrors useAscensionGenerator's own constant: below this starting TE a Tier 13 unlock cannot
 *  realistically land inside one build phase, so those variants are skipped rather than simulated
 *  and thrown away. */
export const TIER_13_MIN_STARTING_TE = 190;

/**
 * THE CONTINUE RULE for leg 1 (thresholds in search/rules.ts). Continue holds the farm exactly as it
 * is -- no more habs, vehicles or research, the current lay rate forever -- so it is right over days,
 * pessimistic over months, and absurd on a farm synced minutes into an ascension (a real humility
 * farm came back as 17 billion days and every chain after it overflowed to Infinity). So: taken
 * outright under a week; compared with the fresh 1/2/3-sale starts up to six months, continue
 * winning unless a fresh start is strictly better; not a candidate past six months. A continue leg 1
 * past three months carries a warning (health.ts).
 */
export { CONTINUE_PIN_MAX_SECONDS, CONTINUE_WARN_SECONDS, CONTINUE_MAX_SECONDS } from './rules';

/**
 * The last instant a JS `Date` can hold, in unix seconds. A leg that ends past it cannot be shown,
 * dated or written to the CSV (`Intl.DateTimeFormat` throws on it), so it is not a result.
 */
export const LAST_DATEABLE_SECONDS = 8.64e12;

/** Backup egg enum (50..54) -> EngineState's egg name, the same table the generator keeps as
 *  VIRTUE_EGGS_MAP. Passing the raw number through leaves `currentEgg` as `53` and quietly corrupts
 *  every rate calculation downstream — that was a real bug in the CLI harness. */
const VIRTUE_EGGS_MAP: Record<number, VirtueEgg> = {
  50: 'curiosity',
  51: 'integrity',
  52: 'humility',
  53: 'resilience',
  54: 'kindness',
};

export interface LegResult {
  summary: AscensionSummary;
  key: VariantKey;
  /** The starting state for the NEXT leg, via the app's own `deriveNextStartState`. */
  nextState: EngineState;
  /** Absolute instants, unix seconds, at which this leg's twelve shifts happen. Only the shifts:
   *  they are the manual moments inside an ascension that cannot be missed without the plan
   *  slipping, and unlike a research purchase there are exactly twelve of them, so a count of how
   *  many fall in a sleep window means something. See `shiftInstants` for why `timestamp` is not
   *  the field to read. */
  shifts: ShiftMoment[];
  /** Seconds the leg's shifts waited for the player's hours inside the simulation (auto/hold.ts):
   *  0 without hours. With hours the shift instants above already include these waits. */
  heldSeconds: number;
  /** The egg the farm is on when the leg ends: the one it keeps laying while the player waits to
   *  prestige (search/chain.ts). */
  lastEgg: string;
  /** A1 only, when both kinds were simulated: the best option of the OTHER kind -- the fresh build
   *  continue beat, or the continue that lost (also when it was dropped for running past six months,
   *  so a record can say how far off it was). Absent when only one kind was simulated: Prestige Now,
   *  no farm in the save, the one-hour rule, or Continue Asc. taken outright inside a week. */
  rival?: FirstLegRival;
}

/** The leg-1 option that lost (LegResult.rival): its variant and when its leg would have ended. */
export interface FirstLegRival {
  key: VariantKey;
  /** Absolute end instant, unix seconds. */
  endTime: number;
}

/**
 * When each action actually happens, absolute unix seconds.
 *
 * `Action.timestamp` is NOT the field to use: `runAscension` sets it only on the synthetic
 * `start_ascension` action (and in milliseconds), while every action the shift helpers create keeps
 * `createSimAction`'s placeholder of "now". The app itself never reads it for scheduling either —
 * `useResearchViews` derives absolute time as `baseTimestamp + (snapshot.lastStepTime - offset)`,
 * and this is the same expression with `legContext`'s `planStartOffset: 0` substituted in.
 */
function shiftInstants(actions: Action[], legStart: number): ShiftMoment[] {
  const out: ShiftMoment[] = [];
  for (const a of actions) {
    if (a.type !== 'shift') continue;
    const step = a.endState?.lastStepTime;
    if (typeof step !== 'number' || !Number.isFinite(step)) continue;
    // `toEgg` is the virtue egg this shift switches to - the thing the player physically does.
    // `fromEgg` is carried so the panel can name the block the leg starts on; see ShiftMoment.
    const payload = a.payload as { toEgg?: string; fromEgg?: string } | undefined;
    out.push({ at: legStart + step, egg: payload?.toEgg ?? '', fromEgg: payload?.fromEgg });
  }
  return out;
}

/** A fresh `SimulationContext` pinned to this leg's start. The stored context is never mutated —
 *  legs are evaluated out of order and share one `SearchInputs`. */
function legContext(inputs: SearchInputs, startTime: number): SimulationContext {
  // With the player's hours picked, every egg shift waits for them inside the simulation, the farm
  // laying the egg it is on meanwhile (auto/hold.ts). Built here from the inputs' plain data, so a
  // worker that received the inputs by message gets the same hook.
  const a = inputs.availability;
  const hours = a && inputs.deferShifts && isConstrained(a) ? a : null;
  return {
    ...inputs.context,
    ascensionStartTime: startTime,
    planStartOffset: 0,
    ...(hours ? { holdUntil: (t: number) => nextAvailable(t, hours) } : {}),
  };
}

/** A deep, proxy-free copy of the base state. `runUntilShift` clones its own input too, but
 *  `deriveNextStartState` spreads this straight into the next leg's state, so a shared reference
 *  would let one leg's mutation leak into another's. */
function cloneBaseState(inputs: SearchInputs): EngineState {
  return JSON.parse(JSON.stringify(inputs.baseState)) as EngineState;
}

/** A simulated variant once `runLeg` is done with its actions: what `LegResult` and `pickVariant`
 *  read, with an empty `actions` so it still satisfies `pickVariant`'s `VariantResult`. */
interface CompactVariant extends VariantResult {
  shifts: ShiftMoment[];
  heldSeconds: number;
  lastEgg: string;
}
const NO_ACTIONS: Action[] = Object.freeze([]) as unknown as Action[];

/**
 * Simulate one ascension and return the variant the app itself would pick.
 *
 * `allowContinue` is only true for A1: "continue current ascension" is a claim about the farm as it
 * stands right now, so it has no meaning further down a chain, and the app only offers it there for
 * the same reason.
 *
 * Returns null when the leg is unevaluable (no surviving variant). The caller treats that as "this
 * chain failed", not as an error.
 */
export function runLeg(
  inputs: SearchInputs,
  baseState: EngineState,
  startTime: number,
  targetTE: number,
  allowContinue: boolean,
  startTE: number,
  idx: number,
  /** Absolute unix seconds the leg must END at (time off starting). Supersedes `targetTE`: the leg
   *  reaches whatever TE it can by then. Same contract as the CLI's `--override-ascension`. */
  endOverride?: number
): LegResult | null {
  const ctx = legContext(inputs, startTime);
  // runAscensionFromC3Variant and runContinueCurrent only consult the deadline when the TE goal is
  // absent, so leaving the goal set here would silently ignore it (the trap the generator documents).
  const goalTE = endOverride !== undefined ? undefined : targetTE;
  const byDeadline = endOverride !== undefined;
  // Each variant is boiled down to what the leg's result and `pickVariant` read the moment it is
  // simulated, and its action list -- hundreds of actions, each carrying a whole EngineState as its
  // `endState` -- is let go then, rather than all of them being held until the pick. Nothing past
  // this function reads a variant's actions (LegResult does not carry them).
  const compact = (v: VariantResult): CompactVariant => ({
    summary: v.summary,
    actions: NO_ACTIONS,
    shifts: shiftInstants(v.actions, startTime),
    heldSeconds: heldSecondsOf(v.actions),
    lastEgg:
      (v.actions.filter(a => a.type === 'shift').pop()?.payload as { toEgg?: string } | undefined)?.toEgg ??
      baseState.currentEgg,
  });
  const compactOrNull = (v: VariantResult | null): CompactVariant | null => (v ? compact(v) : null);
  const asLeg = (
    v: CompactVariant,
    key: VariantKey,
    rival?: CompactVariant | null,
    rivalKey?: VariantKey
  ): LegResult => ({
    summary: v.summary,
    key,
    nextState: deriveNextStartState(v.summary, cloneBaseState(inputs)),
    shifts: v.shifts,
    heldSeconds: v.heldSeconds,
    lastEgg: v.lastEgg,
    ...(rival && rivalKey && Number.isFinite(rival.summary.endTime)
      ? { rival: { key: rivalKey, endTime: rival.summary.endTime } }
      : {}),
  });

  // Continue first (A1 only): see CONTINUE_PIN_MAX_SECONDS for the whole rule. Past six months it
  // is dropped rather than compared, so a bare farm's billion-day continue can never win anything.
  // 'fresh' (Prestige Now) never continues; 'continue' pins it; 'auto' lets it compete on time.
  const mode = readFirstAscension(inputs);
  let cont =
    allowContinue && mode !== 'fresh'
      ? compactOrNull(buildContinueVariant(inputs, baseState, startTime, goalTE, idx, endOverride))
      : null;
  // Kept even when dropped below, as the rival a fresh leg 1 is recorded against.
  const contBuilt = cont;
  if (cont && !(cont.summary.totalDurationSeconds <= (inputs.continueMaxSeconds ?? CONTINUE_MAX_SECONDS))) cont = null;
  if (
    cont &&
    mode === 'continue' &&
    !byDeadline &&
    cont.summary.totalDurationSeconds <= (inputs.continuePinSeconds ?? CONTINUE_PIN_MAX_SECONDS)
  ) {
    return asLeg(cont, 'continue');
  }

  // Single C1->R1 precompute shared by every build variant, exactly as the app does it — K3..H2 is
  // the expensive part and must not be repeated per variant.
  const pre = runUntilShift(baseState, ctx, 'C3');
  // C3's own shift waits for the player too (the C3 variants start with it, outside the main loop).
  const held = holdForPlayer(pre.state, ctx, startTime, pre.elapsedSeconds, 'curiosity');
  if (held.heldSeconds) {
    pre.actions = [...pre.actions, ...held.actions];
    pre.state = held.state;
    pre.elapsedSeconds = held.elapsedSeconds;
  }
  const preC3 = { actions: pre.actions, state: pre.state, elapsedSeconds: pre.elapsedSeconds };

  const c3 = runC3Variants(pre.state, ctx, 3, startTE < TIER_13_MIN_STARTING_TE);
  let surviving = c3.filter(x => !x.impossible);
  // K3's mandatory wait to buildPhaseEnd cannot be truncated, so under a deadline a variant whose
  // build phase ends after it is not slower but unevaluable.
  if (byDeadline) surviving = surviving.filter(v => v.buildPhaseEnd <= endOverride!);

  const fresh: Partial<Record<VariantKey, CompactVariant>> = {};
  for (const v of surviving) {
    const key = (v.attemptTier13Unlock ? `${v.saleCount}-sale-tier13` : `${v.saleCount}-sale`) as VariantKey;
    fresh[key] = compact(
      runAscensionFromC3Variant(baseState, preC3, v, ctx, startTime, `asc_${idx}`, goalTE, endOverride)
    );
  }
  const freshKeys = Object.keys(fresh) as VariantKey[];
  // By a deadline every variant ends at the same instant, so "better" is more TE, not less time.
  // `pickVariant` reads only `summary`, and returns one of the records it was given.
  const freshBest = freshKeys.length ? (pickVariant(fresh, undefined, byDeadline) as CompactVariant) : null;
  const freshKey = freshBest ? freshKeys.find(k => fresh[k] === freshBest)! : null;

  if (cont) {
    const contWins = !freshBest
      ? true
      : mode === 'continue'
        ? // Continue Asc.: it holds unless a fresh start is strictly better.
          byDeadline
          ? cont.summary.endTE >= freshBest.summary.endTE
          : cont.summary.totalDurationSeconds <= freshBest.summary.totalDurationSeconds
        : // 'auto': simply one more candidate, as Classic treats it with nothing picked.
          pickVariant({ ...fresh, continue: cont }, undefined, byDeadline) === cont;
    if (contWins) return asLeg(cont, 'continue', freshBest, freshKey ?? undefined);
  }
  if (!freshBest || !freshKey) return null;
  return asLeg(freshBest, freshKey, contBuilt, 'continue');
}

/**
 * A1-only "continue current ascension" variant, mirroring the generator's own setup.
 *
 * The field names below are load-bearing and were each a real bug in the CLI harness:
 *   - `habIds`, NOT `habs`. Writing `habs` left habIds at `[0,null,null,null]` — one starter hab,
 *     no capacity, so the farm could never afford research and `buyResearch` recursed until the
 *     stack blew on the third leg.
 *   - `currentEgg` must be the NAME, not the backup's 50..54 enum.
 *   - the ELR set is recomputed rather than reusing the equipped (earnings) loadout. Filing the
 *     earnings set under `artifactSets.elr` made "continue" report 1.580q/hr instead of 3.574q/hr.
 */
/** The farm "continue current ascension" carries on with: the save's own farm, the best delivery
 *  set it can wear, its eggs and TE. Null without a farm in the save. */
function continueState(inputs: SearchInputs, baseState: EngineState): EngineState | null {
  const farmState = inputs.currentFarmState;
  const raw = inputs.context.rawBackup;
  if (!farmState || !raw) return null;

  const rawLoadout = getArtifactLoadoutFromBackup(raw);
  const optimalEarnings = getOptimalEarningsSet(raw);
  const elr =
    getOptimalELRSet(raw, {
      commonResearch: farmState.commonResearches,
      epicResearchLevels: inputs.context.epicResearchLevels,
      colleggtibleModifiers: inputs.context.colleggtibleModifiers,
      currentSet: rawLoadout,
      assumeMaxHabsVehicles: false,
    }) ?? rawLoadout;

  const state = {
    ...JSON.parse(JSON.stringify(baseState)),
    currentEgg: VIRTUE_EGGS_MAP[farmState.eggType as number] ?? 'curiosity',
    researchLevels: { ...farmState.commonResearches },
    habIds: farmState.habs || [0, null, null, null],
    vehicles: farmState.vehicles || [{ vehicleId: 0, trainLength: 1 }],
    siloCount: farmState.numSilos || 1,
    tankLevel: baseState.tankLevel,
    artifactLoadout: elr.map(s => ({ artifactId: s.artifactId, stones: [...s.stones] })),
    activeArtifactSet: 'elr',
    artifactSets: {
      earnings: optimalEarnings ? JSON.parse(JSON.stringify(optimalEarnings)) : null,
      elr: JSON.parse(JSON.stringify(elr)),
    },
    fuelTankAmounts: { ...baseState.fuelTankAmounts },
    eggsDelivered: { ...baseState.eggsDelivered },
    teEarned: { ...baseState.teEarned },
    population: farmState.population || 0,
    lastStepTime: farmState.lastStepTime || 0,
    bankValue: farmState.cash || 0,
    activeSales: { research: false, hab: false, vehicle: false },
    earningsBoost: { active: false, multiplier: 1 },
  } as EngineState;
  return state;
}

function buildContinueVariant(
  inputs: SearchInputs,
  baseState: EngineState,
  startTime: number,
  targetTE: number | undefined,
  idx: number,
  endOverride?: number
): VariantResult | null {
  const state = continueState(inputs, baseState);
  if (!state) return null;
  const ctx = legContext(inputs, startTime);
  const elrNow = computeSnapshot(state, ctx, { skipGrowth: true }).elr;
  if (!(elrNow > 0)) return null;
  return runContinueCurrent(state, ctx, startTime, elrNow, targetTE, `asc_${idx}_continue`, endOverride);
}

/**
 * Continue current ascension as the precomputed tail takes it (search/precomputedLeg.ts): no build
 * and no sale, the farm's own delivery rate, and its eggs after the catch-up `runContinueCurrent`
 * credits from the last sync to the plan start. `tailTo` on this gives continue's time to any
 * checkpoint, the same as `buildContinueVariant` does for one (scripts/precompute.ts checks).
 */
export function continueTailParams(inputs: SearchInputs, startTime: number): BuildParams | null {
  const state = continueState(inputs, cloneBaseState(inputs));
  if (!state) return null;
  const ctx = legContext(inputs, startTime);
  const elr = computeSnapshot(state, ctx, { skipGrowth: true }).elr;
  if (!(elr > 0)) return null;
  const delivered = { ...state.eggsDelivered };
  const last = state.lastStepTime;
  if (last > 1e9 && startTime > last) {
    const egg = state.currentEgg as VirtueEgg;
    delivered[egg] =
      (delivered[egg] || 0) +
      elr * catchUpSeconds(last, startTime, siloSeconds(state.siloCount, ctx.epicResearchLevels?.['silo_capacity']));
  }
  return {
    sales: 0,
    tier13: false,
    waitStart: 0,
    saleEnd: 0,
    peakELR: elr,
    delivered: EGG_ORDER.map(e => delivered[e] || 0),
  };
}

/**
 * The instant answer's delivery adjustment (components/auto/InstantRoute.vue): the player's peak
 * delivery rate against the precomputed table's, at the research a build waits with (the table's
 * `k3`). The best set the player's whole inventory can wear there, through the simulator's own rate
 * function: at that research nearly every stone goes to lay rate, so the set a save shows (chosen at
 * today's research) would understate everyone (scripts/precompute.ts --verify-table --as). 1 without
 * a save to read.
 */
export function instantDeliveryScale(inputs: SearchInputs, k3: NonNullable<TableHeader['k3']>): number {
  const ctx = inputs.context;
  const raw = ctx.rawBackup;
  if (!raw) return 1;
  const rate = (set: EquippedArtifact[]) =>
    computeRealisticELR(k3.research, calculateArtifactModifiers(set), ctx.epicResearchLevels, ctx.colleggtibleModifiers)
      .effectiveRate;
  const mine = getOptimalELRSet(raw, {
    commonResearch: k3.research,
    epicResearchLevels: ctx.epicResearchLevels,
    colleggtibleModifiers: ctx.colleggtibleModifiers,
    assumeMaxHabsVehicles: true,
  });
  const theirs = rate(k3.delivery as EquippedArtifact[]);
  return mine && theirs > 0 ? rate(mine as EquippedArtifact[]) / theirs : 1;
}

/** `buildContinueVariant` for checks (scripts/precompute.ts); the search calls it through `runLeg`. */
export const continueVariantForCheck = buildContinueVariant;

/**
 * How long a FRESH ascension from the plan start sits on its first Integrity shift, in seconds, or
 * null when it never reaches one (no backup, or a simulation that could not run).
 *
 * This is the stall that makes the planner useless on low-earnings accounts: the build buys cheap
 * vehicles, reaches Integrity shipping almost nothing, and then waits months or years to afford its
 * habs. It happens inside the C1->C3 precompute every build variant shares, so simulating just that
 * much is enough, and it is the same for every chain -- a fresh start from today's TE is the worst
 * case the plan can contain (later legs start with more TE, so they earn more).
 *
 * Built exactly as chain.ts builds leg 1 for a fresh start (curiosity, one chicken, no cash, no
 * research), so the wait measured here is the wait the run would contain.
 */
export function integrityWaitSeconds(inputs: SearchInputs): number | null {
  const b = cloneBaseState(inputs);
  b.currentEgg = 'curiosity';
  b.population = 1;
  b.bankValue = 0;
  b.researchLevels = {};
  const ctx = legContext(inputs, inputs.planStart);
  let pre: ReturnType<typeof runUntilShift>;
  try {
    pre = runUntilShift(b, ctx, 'C3');
  } catch {
    return null;
  }
  const shifts = shiftInstants(pre.actions, inputs.planStart);
  const at = shifts.findIndex(s => s.egg === 'integrity');
  if (at < 0) return null;
  // The next shift ends the wait; with none inside the precompute, the wait runs to its end.
  const until = shifts[at + 1]?.at ?? inputs.planStart + pre.elapsedSeconds;
  return Math.max(0, until - shifts[at].at);
}
