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
 *                  waited, as the engine reports it (not clock-anchored).
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
   *  that is when the wait ENDS; it began `seconds` earlier. */
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
}
