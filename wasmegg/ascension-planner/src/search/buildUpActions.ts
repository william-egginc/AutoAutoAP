/**
 * THE BUILD-UP LIST (build-up tracker, Phase 1; ~/code/aaap-tools/wireframes/buildup-tracker-v1.md).
 *
 * What the simulator's chosen variant does in the followed route's current ascension, one compact
 * record per action the engine took, in the order it took them, with the instant it happened. It is
 * kept only when asked for (`keepPurchases` on search/leg.ts `runLeg`, `wantBuildUp` on
 * composables/useCurrentSim.ts); without the ask nothing here is built and every result is as before.
 *
 * No `EngineState`s in here: a record is a few numbers and short strings, so a whole build-up (about
 * 1,500 buys) is tens of KB, not the ~22 MB the engine's own action list holds.
 */
import type { Action } from '@/types/actions/meta';
import type { EngineState } from '@/engine/types';
import { getResearchById } from '@/calculations/commonResearch';
import { getHabById, isHabId } from '@/lib/habs';
import { getVehicleType } from '@/lib/vehicles';

/**
 * What kind of thing the player does (or waits for):
 *  - 'research'    buy_research: `id` the research id, `label` its name, `fromLevel` -> `level`.
 *  - 'vehicle'     buy_vehicle: `slot`, `itemId` the vehicle id, `level` the train length when given.
 *  - 'trainCar'    buy_train_car: `slot`, `fromLevel` -> `level` (train length before and after).
 *  - 'hab'         buy_hab: `slot`, `itemId` the hab id.
 *  - 'silo'        buy_silo: `fromLevel` -> `count` (silos before and after).
 *  - 'shift'       shift: `id` the egg shifted to, `detail` the egg left, `label` the auto planner's
 *                  shift name ('C3', 'K1', ...) when it has one.
 *  - 'prestige'    start_ascension: `id` the starting egg.
 *  - 'artifactSet' equip_artifact_set / update_artifact_set / change_artifacts: `id` the set name
 *                  ('earnings' | 'elr') when the engine says.
 *  - 'event'       toggle_sale / toggle_earnings_boost: `id` the sale type or 'earnings_boost',
 *                  `on` whether it starts or ends.
 *  - 'wait'        any wait_*: `id` the engine's action type ('wait_for_research_sale',
 *                  'wait_for_earnings_boost', 'wait_for_te', ...), `seconds` how long the engine
 *                  waited, as the engine reports it (not clock-anchored). A `wait_for_time` under a
 *                  second (the build's slivers of waiting for cash between buys) is left out.
 *  - 'other'       anything else the engine does (fuel, missions, notifications, bank edits):
 *                  `id` the engine's action type.
 */
export type BuildUpActionKind =
  | 'research'
  | 'vehicle'
  | 'trainCar'
  | 'hab'
  | 'silo'
  | 'shift'
  | 'prestige'
  | 'artifactSet'
  | 'event'
  | 'wait'
  | 'other';

export interface BuildUpAction {
  /** When the action happens in the simulation, absolute unix seconds (the leg start plus the
   *  action's `endState.lastStepTime`, the same clock search/leg.ts `shiftInstants` reads). For a wait
   *  that is the engine's end state's time: normally when the wait ENDS (it began `seconds` earlier),
   *  but K3's `wait_for_te` (the wait to the build phase end) reports its START; read the next action's
   *  `t` for when a wait is over. */
  t: number;
  kind: BuildUpActionKind;
  /** For people: the research's name, the shift's name, the set's name, or the engine type. */
  label: string;
  /** The engine's id: research id, egg, set name, sale type, or the engine action type. */
  id?: string;
  /** Research level after the buy, train length after a car/vehicle buy. */
  level?: number;
  /** Research level / train length / silo count before the buy. */
  fromLevel?: number;
  /** Silo count after the buy. */
  count?: number;
  /** Vehicle or hab slot, 0-based as the engine counts it. */
  slot?: number;
  /** Vehicle id or hab id bought into `slot`. */
  itemId?: number;
  /** 'wait': seconds the engine waited. */
  seconds?: number;
  /** 'event': true when the sale / boost starts, false when it ends. */
  on?: boolean;
  /** What it cost, in the engine's bucks (0 when free or not a purchase). */
  cost?: number;
  /** Raw engine text: the engine action type, and for a shift the egg it leaves. */
  detail?: string;
  /** 'research': it cost `CHEAP_SWEEP_SECONDS` of the farm's income or less (the engine's `offlineEarnings` just
   *  before the buy), the opening sweep's rule: the tracker marks it "(cheap sweep)" so it is not read as an ROI pick
   *  (spec-buylabel, 30 Oct 2026). Absent otherwise, and on records made before it existed. */
  cheap?: true;
}

/** The farm the build-up starts from (the chosen variant's start, before its first action). */
export interface BuildUpStart {
  egg: string;
  researchLevels: Record<string, number>;
  habIds: (number | null)[];
  vehicles: { vehicleId: number | null; trainLength: number }[];
  siloCount: number;
  /** Which artifact set is worn: 'earnings' | 'elr' (or what the state says). */
  artifactSet?: string;
}

export interface BuildUpPlan {
  /** The leg start the clock counts from, unix seconds (`t` of every action is `startedAt` plus the
   *  engine's own step time). */
  startedAt: number;
  /** Which account the plan is for (the caller's account hash); '' when the caller has none. */
  accountKey: string;
  /** The variant the simulator picked ('buildup', 'continue', '2-sale', '1-sale-tier13', ...). */
  variantKey: string;
  /** The start state, compact. Absent when the engine's start state could not be read. */
  start?: BuildUpStart;
  /** Every action of the chosen variant, ordered by `t` (ties in the engine's own order). */
  actions: BuildUpAction[];
  /** What the start farm's silos hold, seconds (lib/saveAge.ts `siloSeconds`). */
  siloSeconds: number;
  /** When the leg ends (the variant's `summary.endTime`), unix seconds. */
  endTime: number;
  /** How many sales the build looks ahead to (the simulator's `buildPhaseSaleCount`: C3's `saleCount`, the Smart Buy
   *  card's sale stepper), when the segment said. Absent on plans kept before 30 Oct 2026 (spec-buylabel). */
  saleCount?: number;
}

/** What search/leg.ts `LegResult.buildUp` (and search/types.ts `LegSummary.buildUp`) carries for one
 *  simulated ascension when `keepPurchases` asked for it: the list and the farm it starts from. */
export interface BuildUpList {
  actions: BuildUpAction[];
  start?: BuildUpStart;
}

// ------------------------------------------------------------------------------------------------
// From the engine's actions (worker side). Reads Joo's action types and name tables by import only.

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** `wait_for_time` records shorter than this are left out (`recordOf`). */
export const MIN_TIME_WAIT_SECONDS = 1;

/**
 * A research buy costing this many seconds of the farm's income or less is `cheap`: the threshold of C3's opening
 * sweep (auto/shifts/c3.ts `OPENING_SMART_BUY_THRESHOLD_SECONDS`, not exported, so mirrored here; the sweep is
 * auto/shifts/helpers/milestones.ts `runSmartBuyForSeconds`: cheapest first, any category, anything that saves up in
 * this long). The sweep's own wait counts the farm's growth too (engine/apply/math.ts `getTimeToSave`); this is the
 * plain cost over the income, a hair stricter. C1's bootstrap sweep (3 s) falls under it as well.
 */
export const CHEAP_SWEEP_SECONDS = 10;

/** One engine action as a compact record, or null when it has no usable time (or is a sub-second cash wait). */
function recordOf(a: Action, legStart: number): BuildUpAction | null {
  const step = a.endState?.lastStepTime;
  if (!finite(step)) return null;
  const t = legStart + step;
  const cost = finite(a.cost) && a.cost > 0 ? { cost: a.cost } : {};
  switch (a.type) {
    case 'buy_research': {
      const p = a.payload;
      return {
        t,
        kind: 'research',
        label: getResearchById(p.researchId)?.name ?? p.researchId,
        id: p.researchId,
        fromLevel: p.fromLevel,
        level: p.toLevel,
        ...cost,
      };
    }
    case 'buy_vehicle': {
      const p = a.payload;
      return {
        t,
        kind: 'vehicle',
        label: getVehicleType(p.vehicleId)?.name ?? `vehicle ${p.vehicleId}`,
        slot: p.slotIndex,
        itemId: p.vehicleId,
        ...(finite(p.trainLength) ? { level: p.trainLength } : {}),
        ...cost,
      };
    }
    case 'buy_train_car': {
      const p = a.payload;
      return {
        t,
        kind: 'trainCar',
        label: 'train car',
        slot: p.slotIndex,
        fromLevel: p.fromLength,
        level: p.toLength,
        ...cost,
      };
    }
    case 'buy_hab': {
      const p = a.payload;
      return {
        t,
        kind: 'hab',
        label: isHabId(p.habId) ? getHabById(p.habId).name : `hab ${p.habId}`,
        slot: p.slotIndex,
        itemId: p.habId,
        ...cost,
      };
    }
    case 'buy_silo': {
      const p = a.payload;
      return { t, kind: 'silo', label: 'silo', fromLevel: p.fromCount, count: p.toCount, ...cost };
    }
    case 'shift': {
      const p = a.payload;
      return {
        t,
        kind: 'shift',
        label: p.autoShiftName ?? `shift to ${p.toEgg}`,
        id: p.toEgg,
        detail: p.fromEgg,
        ...cost,
      };
    }
    case 'start_ascension':
      return { t, kind: 'prestige', label: 'prestige', id: a.payload.initialEgg, detail: a.type };
    case 'equip_artifact_set':
    case 'update_artifact_set':
      return { t, kind: 'artifactSet', label: `${a.payload.setName} set`, id: a.payload.setName, detail: a.type };
    case 'change_artifacts':
      return { t, kind: 'artifactSet', label: 'artifacts', detail: a.type };
    case 'toggle_sale':
      return {
        t,
        kind: 'event',
        label: `${a.payload.saleType} sale`,
        id: a.payload.saleType,
        on: !!a.payload.active,
        detail: a.type,
      };
    case 'toggle_earnings_boost':
      return {
        t,
        kind: 'event',
        label: 'earnings boost',
        id: 'earnings_boost',
        on: !!a.payload.active,
        detail: a.type,
      };
    case 'wait_for_te':
    case 'wait_for_time':
    case 'wait_for_full_habs':
    case 'wait_for_research_sale':
    case 'wait_for_earnings_boost':
    case 'wait_for_no_earnings':
    case 'wait_for_missions':
    case 'wait_for_gems': {
      const p = a.payload as { totalTimeSeconds?: number; timeSeconds?: number; egg?: string; targetTE?: number };
      const seconds = finite(p.totalTimeSeconds)
        ? p.totalTimeSeconds
        : finite(p.timeSeconds)
          ? p.timeSeconds
          : undefined;
      // The build's waits for cash between two buys are mostly slivers of a second (about half of a build-up's
      // actions, and half the list's size); the buys around them carry the time. Only those under a second go.
      if (a.type === 'wait_for_time' && seconds !== undefined && seconds < MIN_TIME_WAIT_SECONDS) return null;
      return {
        t,
        kind: 'wait',
        label: a.type,
        id: a.type,
        ...(seconds !== undefined ? { seconds } : {}),
        ...(a.type === 'wait_for_te' && p.egg ? { detail: `${p.egg} ${p.targetTE ?? ''}`.trim() } : {}),
      };
    }
    default:
      return { t, kind: 'other', label: a.type, id: a.type, ...cost };
  }
}

/**
 * The compact list of an engine action list, ordered by `t` (stable: ties keep the engine's order).
 * `legStart` is the leg's start, unix seconds (search/leg.ts `shiftInstants` reads the same clock).
 */
export function toBuildUpActions(actions: readonly Action[], legStart: number): BuildUpAction[] {
  const out: BuildUpAction[] = [];
  // The farm's income just before each action: the previous action's end state (the sweep's own note, a shift, the
  // buy before it). Unknown before the first action.
  let rate = NaN;
  for (const a of actions) {
    const r = recordOf(a, legStart);
    if (r && r.kind === 'research' && finite(r.cost) && rate > 0 && r.cost <= CHEAP_SWEEP_SECONDS * rate) r.cheap = true;
    if (r) out.push(r);
    const next = a.endState?.offlineEarnings;
    if (finite(next)) rate = next;
  }
  // Array.prototype.sort is stable; the engine's own order already is by time, so this rarely moves anything.
  return out.sort((x, y) => x.t - y.t);
}

/** The compact start farm of an engine state. */
export function buildUpStartOf(s: EngineState | null | undefined): BuildUpStart | undefined {
  if (!s) return undefined;
  return {
    egg: s.currentEgg,
    researchLevels: { ...(s.researchLevels as Record<string, number>) },
    habIds: [...s.habIds],
    vehicles: (s.vehicles ?? []).map(v => ({ vehicleId: v.vehicleId ?? null, trainLength: v.trainLength ?? 1 })),
    siloCount: s.siloCount,
    ...(s.activeArtifactSet ? { artifactSet: s.activeArtifactSet } : {}),
  };
}
