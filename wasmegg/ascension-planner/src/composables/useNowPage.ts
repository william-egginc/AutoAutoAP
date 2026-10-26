/**
 * Everything My runs' "Right now" page shows, read from what is already here (spec myruns-now v3; build plan
 * aaap-tools/specialists/ui-nowpage-build.md). NOTHING is worked out again: no instant answer, no Check exactly,
 * no search. One exception (24 Oct 2026): a followed route with no timeline on this save is priced on the instant
 * answer's data in one route worker (lib/followEstimate.ts, composables/useFollowEstimate.ts). The reads:
 *
 *   the loaded save            the raw backup itself (its time, farm, TE, eggs: lib/saveFreshness.ts, lib/farmFacts.ts);
 *                              the stores only for the instant answer's key and the gear sets, once they hold it
 *   saved instant answers      localStorage `aap-instant-snap:<key>|0` (the whole answer, kept after Check exactly,
 *                              24 h at most) and its index (each answer's account, goal and save), parsed once per
 *                              key; `aap-instant-answer:<key>` (the last checked answer, no age limit)
 *   Check exactly's history    IndexedDB, per account
 *   saved answers              the store's list (By a date)
 *   board rows                 the ones My runs' board part already loaded (passed in)
 *
 * The one thing worked out here is the two artifact sets (earnings and production), from the save: pure and a few
 * milliseconds, the same calls the instant answer makes for its key every time it opens (store `readInventory`);
 * once per save. The farm's rates (lib/farmFacts.ts) are the planner's own formulas at the save's moment.
 *
 * The keys are the instant answer's own (search/instantSnapshot.ts `instantKey`), built from the same store
 * values InstantRoute.vue reads, so an answer worked out on Fastest or By a date is found here.
 */
import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import {
  ANSWER_PREFIX,
  instantGoal,
  instantKey,
  instantSnapKey,
  readSnapIndex,
  patchSnapshot,
  readSnapshot,
  snapshotUsable,
  type SnapWhatIf,
} from '@/search/instantSnapshot';
import { insideHoursFor, readFilters, readInsideHoursChoice } from '@/search/instantFilters';
import { isConstrained } from '@/search/availability';
import { virtueInventory } from '@/search/csv';
import { accountOf } from '@/search/runSaves';
import { loadHistory, type CheckEntry } from '@/search/checkHistory';
import { GEAR_RULE } from '@/search/tableGear';
import { getSimulationContext } from '@/engine/adapter';
import { saveOnVirtue } from '@/lib/onVirtue';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { finishesBefore } from '@/lib/eggDayRule';
import { calculateClothedTEForSet } from '@/lib/artifacts/virtue';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { BoardRow } from '@/lib/leaderboardRank';
import { hoursDiffer, simulatorAge } from '@/lib/myRunsDashboard';
import { useMinuteClock } from './useMinuteClock';
import { backupSecondsOf, saveStrip, saveTEByEggOf, saveTEOf } from '@/lib/saveFreshness';
import { hashID } from '@/lib/storage/db';
import { virtueEggOf } from '@/lib/virtueEggs';
import { progressOf } from '@/lib/planPace';
import {
  SAVE_EGG_ORDER,
  ascensionAt,
  markPrestigeWaits,
  mergeSimultaneousShifts,
  onTrack,
  planEvents,
  planFromSnapshot,
  planPrestiges,
  shiftsAfter,
  stepLegsOf,
  tableEvents,
  withTableShifts,
  type NowPlan,
  type SnapLike,
} from '@/lib/nowPlan';
import { answerFinish, buildTile, type SavedDateAnswer, type Tile } from '@/lib/savedTiles';
import {
  drivingPlan,
  findKeptSearch,
  liveSearchResult,
  markKeptBack,
  newerSearch,
  planFromSearch,
  readKeptSearches,
  readSearch,
  recordKeptSearch,
  type Driving,
  type KeptSearch,
  type SnapSearch,
} from '@/lib/searchPlan';
import { accountHashNow } from '@/lib/accountHash';
import {
  currentSetup,
  otherSetupLabel,
  planFinish,
  pricedWithWords,
  setupCheck,
  todayIn,
  type CardCandidate,
  type PricedSetup,
} from '@/lib/currentAnswer';
import { eggLines, farmFacts, saveEggCountsOf, saveFarmOf } from '@/lib/farmFacts';
import { nextShiftCostAt, plannedShiftsCost } from '@/lib/shiftCost';
import { dateStanding, raceStanding, type Standing } from '@/lib/standing';
import { dayWords as dayWordsIn } from '@/lib/eventWhen';
import {
  defaultGoalKey,
  goalDefs,
  goalOpen,
  goalKeyOf,
  goalFollowOf,
  goalOptions,
  plansByGoal,
  type GoalAnswer,
  type GoalKey,
  type PlanGoal,
} from '@/lib/planGoals';
import { whichSet } from '@/lib/gearMatch';
import type { FollowedForSteps, MyRunsOpen, StepWindow } from '@/lib/myRunsDashboard';
import { timeOffWindows, usableTimeOff, type TimeOffDates } from '@/search/timeOff';
import { timeOffWords } from '@/lib/pricedWith';
import { phaseNow } from '@/lib/nowPhase';
import { startLines } from '@/lib/nowStart';
import { useFollowStore } from '@/stores/follow';
import { followPrice, type FollowResult, type FollowSnap } from '@/lib/followPrice';
import {
  estimateKey,
  needsPricingRecord,
  pickPricing,
  recordFinalFor,
  planFromEstimate,
  pricingSetupKey,
  readPricing,
  readPricingRecords,
  recordSources,
  type PickedPricing,
  type PricingSource,
} from '@/lib/followEstimate';
import { useFollowEstimate, type EstimateRequest } from './useFollowEstimate';
import { useInstantCompute, type InstantComputeRequest } from './useInstantCompute';
import { useBoardRunLegs, type BoardRunWant, type RunCsvFetch } from './useBoardRunLegs';
import { fetchRunCsv } from '@/explorer/collector';
import { readKept } from '@/search/instantScale';
import { ascensionSteps, instantSteps } from '@/lib/instantSteps';
import { useCurrentSim, type SimRequest } from './useCurrentSim';
import { simKey, simSetupKey, withCurrentSim } from '@/lib/followSim';
import { continuesFarm, nextAction, nextShifts, type ActionLeg, type NextAction, type NextShiftLine } from '@/lib/nextAction';
import { nextPrestigeAt } from '@/search/noPrestige';
import { followedFromNow, type FollowFrom } from '@/lib/follow';
import { hoursOf, sameHours, setWithOtherWords, sourceOfFrom } from '@/lib/followCloud';
import { SIM_VERSION } from '@/search/simVersion';
import { autoFollowOf, autoFollowsGoal, followedLabel } from '@/lib/followPolicy';
import type { FollowPrompt, RouteFinish } from '@/lib/searchPlan';

/** The race the Fastest tile is for first (the board's), then the player's own target. */
export const RACE_TARGET = 490;

type Goal = { goal: 'fastest'; target: number; deadline: null } | { goal: 'date'; target: number; deadline: number };

export interface CardPlan {
  plan: NowPlan;
  goal: Goal;
  /** 'this-save': worked out from the loaded save and setup. 'setup-changed': the same save, another setup.
   *  'older-save': worked out from an earlier save (its own time in `plan.meta.backupTime`). */
  state: 'this-save' | 'setup-changed' | 'older-save';
  /** "priced with your hours 7 am to 1 am, no time off" (lib/currentAnswer.ts `pricedWithWords`). */
  pricedWith?: string;
  /** A better plan of the same goal and save priced with other hours: its plan and label ("with any hour (before
   *  your hours changed)"); null when none. */
  secondary?: { plan: NowPlan; label: string } | null;
  /** The goal's key and name (lib/planGoals.ts): "Race to 490", "Egg Day 2027", "By Mar 3, 2027". */
  key?: GoalKey;
  name?: string;
  /** The route is the player's own pick for this goal ("Follow this route", lib/follow.ts), priced from a save. */
  followed?: FollowCard;
  /** This save's instant plan and Fast, Exact or Custom result for the goal, and which drives (lib/searchPlan.ts):
   *  the card's pill, "Go back to the instant answer" and the one line when the result doesn't take over. */
  driving?: Driving;
}

/** The route the player follows for the selected goal, and how it is priced (lib/followPrice.ts). */
export interface FollowCard {
  /** The route shown: as priced (a plan's), else the stops still ahead of the save. */
  chain: number[];
  from: FollowFrom;
  /** 'exact': the simulator's times kept (Check exactly's, or this save's Fast, Exact or Custom result: the card's
   *  plan is it); 'instant': this save's instant answer has this route (its rounded times are the card's plan);
   *  'finish': only its finish, from Check exactly's history; 'estimate': priced on the instant answer's data on this
   *  page (lib/followEstimate.ts; the card's plan is it, rounded); 'none': not priced yet. */
  price: 'exact' | 'instant' | 'estimate' | 'finish' | 'none';
  /** No timeline yet: being estimated or about to be ('working'), waiting for a search to end ('waiting'), the route
   *  goes past the instant answer's data ('beyond'), no instant answer of this save and setup to price it with yet
   *  ('nosource': only when working it out here failed, `instantFailure`), or the estimate failed ('failed'). With no
   *  record yet, My runs works the instant answer's pricing out itself (composables/useInstantCompute.ts): 'instant'
   *  while it does, 'instantwait' while a search runs. Absent: priced. */
  estimating?: 'working' | 'waiting' | 'beyond' | 'nosource' | 'failed' | 'instant' | 'instantwait';
  /** 'nosource': why the instant answer for this setup couldn't be worked out here (short, no IDs). */
  instantFailure?: string;
  source: 'this-save' | 'setup-changed' | 'older-save' | 'history' | null;
  /** The save it was priced from, unix seconds (an older save's, or the history entry's); null when not known. */
  pricedSave: number | null;
  /** 'finish': when it lands and the TE then, and when that check ran (ms). */
  finish?: { end: number; endTE: number | null; at: number };
  /** By a date: the route lands after the date. */
  missesDate?: boolean;
  /** Right now's words for whose route it is: "your pick" (a Follow press), "from the instant answer" or "from your
   *  Fast run" (the first answer, followed on its own, lib/followPolicy.ts). Absent: "your pick". */
  label?: string;
}

/**
 * The goal picked on Right now's switch, for this visit: module state (not stored), kept with the account and save
 * it was picked on, so it falls back to the default when either changes.
 */
const chosenGoal = ref<{ scope: string; key: GoalKey } | null>(null);
/**
 * "Go back to the instant answer" (lib/searchPlan.ts): per account, save and goal, the search result (its `at`) the
 * player went back from. A newer result takes over again. Module state for this visit, like the goal picked.
 */
const wentBack = ref<Record<string, number>>({});
/** Forget the pick (specs). */
export function resetGoalChoice(): void {
  chosenGoal.value = null;
  wentBack.value = {};
}

const goalOf = (d: PlanGoal): Goal =>
  d.goal === 'date' && d.deadline ? { goal: 'date', target: d.target, deadline: d.deadline } : { goal: 'fastest', target: d.target, deadline: null };

/**
 * The instant answer's key for a goal, from the same store values InstantRoute.vue's `cacheKey` reads (its
 * filters as remembered in this browser): null without a save. Needs an active Pinia.
 */
/** "Works inside my hours" as the instant answer's tick box has it (ticked by default with hours set). Needs an active
 *  Pinia. */
export function useHoursFromStores(): boolean {
  const store = useChainSearchStore();
  const filters = readFilters();
  return (
    store.scheduleEnabled &&
    !!store.availability &&
    insideHoursFor(true, isConstrained(store.availability), readInsideHoursChoice(), filters.inHours)
  );
}

/** The pricing record's setup key (lib/followEstimate.ts `pricingSetupKey`) from the stores, as InstantRoute.vue keeps it
 *  (its first ascension is the store's `firstAscensionFor()`, the value `collectInputs` puts there; the zone the plan's). */
export function pricingSetupFromStores(): string {
  const store = useChainSearchStore();
  return pricingSetupKey({
    availability: store.availability,
    timeOff: store.timeOff,
    noPrestige: store.noPrestige,
    useHours: useHoursFromStores(),
    firstAscension: store.firstAscensionFor(),
    zone: useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    deferShifts: !!store.deferShifts,
    target: store.finalTE,
  });
}

export function instantKeyFromStores(deadline: number | null, finalTE: number): string | null {
  const store = useChainSearchStore();
  const r = useInitialStateStore().rawBackup as { eiUserId?: string } | null;
  if (!r?.eiUserId) return null;
  try {
    const inputs = store.collectInputs();
    const inv = virtueInventory(r);
    const filters = readFilters();
    return instantKey({
      playerId: r.eiUserId,
      deadline,
      finalTE,
      currentTE: store.currentTE,
      eggsDelivered: inputs.baseState.eggsDelivered,
      artifacts: inv.artifacts,
      stones: inv.stones,
      epic: inputs.context.epicResearchLevels,
      availability: store.availability,
      timeOff: store.timeOff,
      noPrestige: store.noPrestige,
      milestones: store.milestones,
      firstAscension: inputs.firstAscension,
      // "Works inside my hours" as the instant answer's tick box has it (ticked by default with hours set).
      useHours: useHoursFromStores(),
      maxAscensions: filters.maxAscensions,
      minAscensions: filters.minAscensions,
    });
  } catch {
    return null;
  }
}

export function useNowPage(o: { myRows: Ref<BoardRow[] | null>; boardRows: Ref<BoardRow[] | null> }) {
  const store = useChainSearchStore();
  const initial = useInitialStateStore();
  const planner = useAutoPlannerStore();
  const follows = useFollowStore();
  const now = useMinuteClock();
  const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  // ------------------------------------------------------------------------------------------ the save

  /**
   * The save is `rawBackup`, and on this page it wins: every TE, egg, farm and time below is read from the save
   * itself, never from the initial-state store's TE, egg or farm fields. Those can be another state of it:
   *   - a page load restores the Manual planner's draft (hydrate: `lastBackupTime` 0, the TE and egg of whenever that
   *     plan was made) beside the save (fix 20);
   *   - an account switch (`submitPlayerId`) loads the save without rolling the pending Truth Eggs up, and moves the
   *     farm on to "now" (`catchUpFarmState`): on beta the main account's card said "159 TE so far" (the CLAIMED TE)
   *     and both tiles "Your TE has moved since" over a save at 191 (fix 21).
   * The page shows once the stores hold THIS save (same save time); App sets them up the Auto Planner's way on My
   * runs. What has to match another screen or the planner's setup (the instant answer's key, the gear sets) waits
   * for `storeReady`: the stores set up from this save with its pending TE rolled up, as Fastest and By a date have.
   */
  const raw = computed(() => (backupSecondsOf(initial.rawBackup) > 0 ? initial.rawBackup : null));
  const saveSeconds = computed(() => backupSecondsOf(raw.value));
  const storeHasSave = computed(() => !!raw.value && initial.hasData && initial.lastBackupTime === saveSeconds.value);
  const storeReady = computed(() => storeHasSave.value && Math.floor(store.currentTE) === saveTEOf(raw.value));
  const hasSave = computed(() => storeHasSave.value);
  /** A save is here but the stores don't hold it yet: the page waits for it (App loads it). */
  const saveWaiting = computed(() => !!raw.value && !storeHasSave.value);
  const onVirtue = computed(() => saveOnVirtue(raw.value));
  const account = computed(() => accountOf(raw.value));
  /** The save's virtue farm, as the save has it. */
  const farm = computed(() => saveFarmOf(raw.value));
  const currentEgg = computed(() => (hasSave.value && onVirtue.value ? virtueEggOf(farm.value?.eggType) : null));
  const teByEgg = computed(() => saveTEByEggOf(raw.value));
  const teSoFar = computed(() => (hasSave.value ? saveTEOf(raw.value) : 0));
  const strip = computed(() => saveStrip(saveSeconds.value, now.value, zone.value));

  // ------------------------------------------------------------------------------------- the keys

  const eggDayYear = nextEggDayYear();
  const eggDayAt = eggDaySeconds(eggDayYear);

  const keyFor = (deadline: number | null, finalTE: number) =>
    hasSave.value && storeReady.value ? instantKeyFromStores(deadline, finalTE) : null;

  const eggDay = { year: eggDayYear, at: eggDayAt };
  const dayWords = (t: number) => dayWordsIn(t, zone.value);
  /** Fastest's goal words use the target in the key (`target 490`); By a date's its deadline. */
  const keyOfGoal = (d: PlanGoal) => keyFor(d.deadline, d.goal === 'date' ? store.finalTE : d.target);

  /** The goals always looked for (lib/planGoals.ts): Race to your target, Fastest to 490 when it differs, Egg Day. */
  const baseGoals = computed(() =>
    goalDefs({ ownTarget: store.finalTE, raceTarget: RACE_TARGET, eggDay, otherDates: [], dayWords })
  );
  const baseKeys = computed(() => baseGoals.value.map(d => ({ d, g: goalOf(d), key: keyOfGoal(d) })));

  /** Parsed once per key (a snapshot can be 600 kB). */
  const parsed = new Map<string, SnapLike | null>();
  function snapOf(snapKey: string | null): SnapLike | null {
    if (!snapKey) return null;
    if (!parsed.has(snapKey)) {
      const s = readSnapshot<SnapLike & { v?: number; header?: unknown; ownChanged?: string; gearRule?: number }>(snapKey);
      parsed.set(snapKey, s && s.result && snapshotUsable(s, GEAR_RULE) ? s : null);
    }
    return parsed.get(snapKey) ?? null;
  }
  function lastCheckedOf(answerKey: string | null): { at: number; chain: number[]; end: number; endTE: number } | null {
    if (!answerKey || typeof localStorage === 'undefined') return null;
    try {
      const v = JSON.parse(localStorage.getItem(answerKey) ?? 'null');
      return v && Array.isArray(v.chain) && v.chain.length && typeof v.at === 'number' ? v : null;
    } catch {
      return null;
    }
  }

  /** The snapshot index (small), read again when the save or setup changes. */
  const index = computed(() => {
    void baseKeys.value;
    return readSnapIndex();
  });

  /** Every other date a plan of this account was kept for (By a date): each is a goal of its own on the switch. */
  const otherDates = computed(() => {
    const acct = account.value;
    if (!acct) return [];
    const out: number[] = [];
    for (const e of index.value) {
      const m = /^date (\d+)$/.exec(e.meta?.account === acct ? (e.meta.goal ?? '') : '');
      const d = m ? Number(m[1]) : 0;
      if (d && d !== eggDayAt) out.push(d);
    }
    return out;
  });
  /** The goals a route is followed for (lib/follow.ts): listed on the switch even without a plan. */
  const followedKeys = computed(() => new Set(account.value ? follows.followedGoals() : []));
  const followedDates = computed(() =>
    [...followedKeys.value].map(k => /^date-(\d+)$/.exec(k)).filter((m): m is RegExpExecArray => !!m).map(m => Number(m[1]))
  );
  const followedTargets = computed(() =>
    [...followedKeys.value].map(k => /^fastest-(\d+)$/.exec(k)).filter((m): m is RegExpExecArray => !!m).map(m => Number(m[1]))
  );
  const goalList = computed<PlanGoal[]>(() =>
    otherDates.value.length || followedDates.value.length || followedTargets.value.length
      ? goalDefs({
          ownTarget: store.finalTE,
          raceTarget: RACE_TARGET,
          eggDay,
          otherDates: [...otherDates.value, ...followedDates.value],
          otherTargets: followedTargets.value,
          dayWords,
        })
      : baseGoals.value
  );
  /** Each goal with its instant-answer key (the base goals' keys are worked out once). */
  const keys = computed(() =>
    goalList.value.map(d => baseKeys.value.find(b => b.d.key === d.key) ?? { d, g: goalOf(d), key: keyOfGoal(d) })
  );

  function planOf(g: Goal, s: SnapLike | null): NowPlan | null {
    return planFromSnapshot(s, g.goal, g.deadline);
  }

  // ---------------------------------------------------------------- the search result (Fast, Exact, Custom)

  /** The chain-search store's finished result for a goal on this save (lib/searchPlan.ts, the instant card's rule). */
  function liveFor(g: Goal): SnapSearch | null {
    if (!storeReady.value) return null;
    const pid = (initial.playerId as string | undefined) ?? '';
    const me = pid ? accountHashNow(pid) : '';
    return liveSearchResult({
      goal: g.goal,
      deadline: g.deadline,
      target: g.target,
      currentTE: store.currentTE,
      ownerOk: owner => !owner || !me || owner === me,
      fastest: {
        running: store.isRunning,
        bestDays: store.bestDays,
        bestChain: store.bestChain,
        bestLegs: store.bestLegs,
        planStart: store.planStartUsed || store.planStart,
        custom: store.runKindUsed === 'full',
        effort: store.runSettingsUsed?.effort,
        at: store.chainResultAt,
        owner: store.chainResultOwner,
      },
      date: { running: store.deadlineRunning, result: store.deadlineResult, owner: store.deadlineResultOwner },
    });
  }
  const backKey = (goalKey: GoalKey) => `${choiceScope.value}|${goalKey}`;
  const goalWordsOf = (g: Goal) => instantGoal(g.deadline, g.deadline ? store.finalTE : g.target);
  /** Bumped when a result is kept (in a snapshot, or beyond it): the parsed copies are read again. */
  const kept = ref(0);
  /** Results kept beyond the snapshot's day (lib/searchPlan.ts `KeptSearch`), read again when one is kept. */
  const keptList = computed<KeptSearch[]>(() => {
    void kept.value;
    void saveSeconds.value;
    return readKeptSearches();
  });
  /** This save's kept result for a goal, when priced with Your setup now (else it is a candidate of its own). */
  function keptFor(g: Goal): KeptSearch | null {
    const acct = account.value;
    if (!acct) return null;
    const k = findKeptSearch(keptList.value, { account: acct, goal: goalWordsOf(g), backupTime: saveSeconds.value });
    if (!k) return null;
    const sn = setupNow.value;
    return !k.setup || setupCheck(k.setup, sn.setup, sn.today).fit === 'current' ? k : null;
  }
  /** This save's own snapshot for a goal, with the plan that drives Right now (lib/searchPlan.ts `drivingPlan`): the
   *  store's result, the snapshot's or the one kept beyond it, the newest. */
  function drivingOf(g: Goal, goalKey: GoalKey, snapKey: string | null): Driving {
    const k = keptFor(g);
    return drivingPlan(snapOf(snapKey), g.goal, g.deadline, {
      live: newerSearch(liveFor(g), k?.search ?? null),
      // Gone back in this visit, or on an earlier one (kept with the result).
      back: wentBack.value[backKey(goalKey)] ?? (k?.back ? k.search.at : null),
      meta: k ? { account: k.account, goal: k.goal, backupTime: k.backupTime, teByEgg: k.teByEgg, setup: k.setup } : null,
    });
  }
  /** Keep a result for this save and goal beyond the snapshot's day. */
  function keepResult(g: Goal, s: SnapSearch): boolean {
    const acct = account.value;
    if (!acct || !hasSave.value) return false;
    const sn = setupNow.value;
    return recordKeptSearch({
      account: acct,
      goal: goalWordsOf(g),
      backupTime: saveSeconds.value,
      setup: { availability: sn.setup.availability ? JSON.parse(JSON.stringify(sn.setup.availability)) : null, timeOff: JSON.parse(JSON.stringify(sn.setup.timeOff ?? [])) },
      teByEgg: [...teByEgg.value],
      search: s,
    });
  }

  // ------------------------------------------------------------------------- the answers kept

  const history = ref<CheckEntry[]>([]);
  watch(
    raw,
    async r => {
      history.value = [];
      if (!r) return;
      // The save's own account, never the store's cached partition (it can still be the last account's after a
      // switch).
      const id = (r as { eiUserId?: string }).eiUserId ?? '';
      const partition = id ? await hashID(id).catch(() => '') : '';
      if (raw.value !== r) return;
      history.value = partition ? await loadHistory(partition).catch(() => []) : [];
    },
    { immediate: true }
  );
  const savedDate = computed<SavedDateAnswer[]>(() =>
    store.savedAnswers.map(a => ({
      savedAt: a.savedAt,
      deadline: a.result.deadline,
      te: a.result.te,
      saveSeconds: a.save?.backupAt || null,
      level: a.result.level,
      simple: a.result.simple,
      setup: a.result.settings
        ? { availability: a.result.settings.availability ?? null, timeOff: a.result.settings.timeOff ?? [] }
        : null,
      route: a.result.routes[0]
        ? { chain: [...a.result.routes[0].chain], reachAt: a.result.routes[0].reachAt, spare: a.result.routes[0].spare, legs: a.result.routes[0].legs }
        : null,
    }))
  );
  // ------------------------------------------------------------------------------- the card's plan

  /** Your setup now (the hours and time off every answer is compared with) and today in the planner's zone. */
  const setupNow = computed<{ setup: PricedSetup; today: string }>(() => ({
    setup: { availability: store.availability ?? null, timeOff: store.timeOff ?? [] },
    today: todayIn(now.value * 1000, zone.value),
  }));

  // A result the store holds is kept with this save's snapshot for the goal, and every result (the store's or a
  // snapshot's) beyond the snapshot's day, so Right now still has it after a reload and the next day.
  watch(
    () => keys.value.map(({ g, key }) => ({ g, snapKey: instantSnapKey(key), live: liveFor(g) })),
    list => {
      let changed = false;
      for (const { g, snapKey, live } of list) {
        const s = snapKey ? (snapOf(snapKey) as (SnapLike & { search?: { at?: number } }) | null) : null;
        const newest = newerSearch(live, readSearch(s?.search));
        if (newest && keepResult(g, newest)) changed = true;
        if (!snapKey || !live || !s || (s.search?.at ?? 0) >= live.at) continue;
        if (patchSnapshot(snapKey, { search: JSON.parse(JSON.stringify(live)) })) {
          parsed.delete(snapKey);
          changed = true;
        }
      }
      if (changed) kept.value++;
    },
    { immediate: true }
  );

  /**
   * Every kept snapshot Right now could show, each with how it was priced (lib/currentAnswer.ts): this save's own
   * key for each goal (priced with Your setup now: the key holds it), then the index's snapshots of this account and
   * goal under other keys (the same save with another setup, or an earlier save), with the setup each recorded.
   */
  const snapCandidates = computed<CardCandidate[]>(() => {
    if (!hasSave.value) return [];
    const out: CardCandidate[] = [];
    const seen = new Set<string>();
    const sn = setupNow.value;
    void kept.value;
    keys.value.forEach(({ g, key, d }, goalIndex) => {
      const snapKey = instantSnapKey(key);
      if (!snapKey) return;
      seen.add(snapKey);
      const driving = drivingOf(g, d.key, snapKey);
      const p = driving.plan;
      if (p) out.push({ plan: p, goalIndex, goalKey: d.key, ownKey: true, check: currentSetup(sn.setup), driving });
    });
    const acct = account.value;
    if (!acct) return out;
    const goalWords = (g: Goal) => instantGoal(g.deadline, g.deadline ? store.finalTE : g.target);
    for (const e of [...index.value].reverse()) {
      const m = e.meta;
      if (!m || m.account !== acct || seen.has(e.key)) continue;
      const goalIndex = keys.value.findIndex(({ g }) => goalWords(g) === m.goal);
      if (goalIndex < 0) continue;
      const p = planOf(keys.value[goalIndex].g, snapOf(e.key));
      if (!p) continue;
      seen.add(e.key);
      out.push({
        plan: p,
        goalIndex,
        goalKey: keys.value[goalIndex].d.key,
        ownKey: false,
        check: setupCheck(m.setup ?? null, sn.setup, sn.today),
      });
    }
    // Results kept beyond the snapshot's day for an older save or another setup (this save's with Your setup now
    // drive its own goal above): ranked like any other answer, so a newer save's leads (lib/currentAnswer.ts).
    const used = new Set(out.map(c => c.plan.from?.at).filter((x): x is number => x != null));
    for (const k of keptList.value) {
      if (k.account !== acct || k.back || used.has(k.search.at)) continue;
      const goalIndex = keys.value.findIndex(({ g }) => goalWords(g) === k.goal);
      if (goalIndex < 0) continue;
      const { g, d } = keys.value[goalIndex];
      if (keptFor(g)?.search.at === k.search.at) continue;
      used.add(k.search.at);
      const meta = { account: k.account, goal: k.goal, backupTime: k.backupTime, teByEgg: k.teByEgg, setup: k.setup };
      out.push({
        plan: planFromSearch(k.search, g.goal, g.deadline, { meta, whatIf: null }),
        goalIndex,
        goalKey: d.key,
        ownKey: false,
        check: setupCheck(k.setup ?? null, sn.setup, sn.today),
      });
    }
    return out;
  });

  /**
   * The answers kept without their times (they say a goal was checked, and when): the last checked answer under
   * each goal's own key, Check exactly's history and the By a date answers saved here.
   */
  const goalAnswers = computed<GoalAnswer[]>(() => {
    if (!hasSave.value) return [];
    const out: GoalAnswer[] = [];
    for (const { d, key } of keys.value) {
      const c = lastCheckedOf(key && key.startsWith(ANSWER_PREFIX) ? key : null);
      if (c) out.push({ goalKey: d.key, calculatedAt: c.at, saveSeconds: saveSeconds.value, ownKey: true });
    }
    for (const e of history.value) {
      const gk =
        e.mode === 'date' ? (e.deadline ? goalKeyOf('date', 0, e.deadline, eggDay) : null) : typeof e.target === 'number' ? goalKeyOf('fastest', e.target, null, eggDay) : null;
      if (gk) out.push({ goalKey: gk, calculatedAt: e.at, saveSeconds: e.backupTime ?? null });
    }
    for (const a of savedDate.value)
      if (a.route) out.push({ goalKey: goalKeyOf('date', 0, a.deadline, eggDay), calculatedAt: a.savedAt, saveSeconds: a.saveSeconds });
    return out;
  });

  /** Per goal its saved plan (lib/currentAnswer.ts's rule, through lib/planGoals.ts `plansByGoal`). */
  const planGoals = computed(() =>
    hasSave.value
      ? plansByGoal(goalList.value, snapCandidates.value, goalAnswers.value, saveSeconds.value, followedKeys.value)
      : []
  );
  /** The goal Right now opens on: the one checked last (`defaultGoalKey`). */
  const defaultGoal = computed(() => defaultGoalKey(planGoals.value, saveSeconds.value));
  const choiceScope = computed(() => `${account.value ?? ''}|${saveSeconds.value}`);
  /** The goal shown: the one picked on the switch for this account and save, else the default. */
  const selectedGoal = computed<GoalKey | null>(() => {
    const c = chosenGoal.value;
    if (c && c.scope === choiceScope.value && planGoals.value.some(p => p.goal.key === c.key)) return c.key;
    return defaultGoal.value;
  });
  function selectGoal(key: GoalKey): void {
    chosenGoal.value = { scope: choiceScope.value, key };
  }
  /** The pills; a followed goal's says how far its route's times are (`goalFollowOf`), never "no saved plan yet". */
  const goalChoices = computed(() =>
    goalOptions(planGoals.value, zone.value).map(g => {
      if (!followedKeys.value.has(g.key)) {
        // No plan with its times: the saved answer tile's answer for the goal, when it has one (the pill agrees).
        if (g.state === 'plan' || g.state === 'late') return g;
        const pg = planGoals.value.find(p => p.goal.key === g.key);
        const a = pg ? tileFor(goalOf(pg.goal)).answer : null;
        return a ? { ...g, answer: { end: answerFinish(a), how: a.how, found: a.found ?? null } } : g;
      }
      const fs = followStateOf(g.key);
      return fs
        ? { ...g, following: true, follow: goalFollowOf(fs.card, fs.plan ? planFinish(fs.plan.plan) : null, g.key === selectedGoal.value ? currentChip.value : null) }
        : { ...g, following: true };
    })
  );

  /**
   * The selected goal's followed route priced from what is saved (lib/followPrice.ts): every kept snapshot of this
   * account and goal (this save's own key first, then the index's), each with the TE its routes start from, then
   * Check exactly's history. Nothing is worked out here (a route with no timeline is estimated below).
   */
  /**
   * A FOLLOWED ROUTE FROM A RUN SENT FROM ANOTHER BROWSER (26 Oct 2026, composables/useBoardRunLegs.ts): the account's
   * Leaderboard run of the followed route, its legs read once from its CSV, priced like a kept result (exact legs, the
   * calendar's Add buttons) with "(sent from another browser)".
   */
  const boardWants = computed<BoardRunWant[]>(() =>
    hasSave.value
      ? planGoals.value.flatMap(pg => {
          const f = follows.followed(pg.goal.key);
          const g = goalOf(pg.goal);
          return f ? [{ goalKey: pg.goal.key, goal: g.goal, target: g.target, deadline: g.deadline, chain: [...f.chain] }] : [];
        })
      : []
  );
  const boardCsvFetch = computed<RunCsvFetch | null>(() => {
    const base = store.submitUrl ? store.leaderboardUrl.replace(/\/$/, '') : '';
    return base ? (id: string) => fetchRunCsv(base, id) : null;
  });
  const { found: boardRuns } = useBoardRunLegs({ rows: o.myRows, wants: boardWants, currentTE: teSoFar, fetch: boardCsvFetch });

  function followPricedFor(sel: ReturnType<typeof plansByGoal>[number] | undefined) {
    const f = sel ? follows.followed(sel.goal.key) : null;
    if (!sel || !f || !hasSave.value) return null;
    // A result kept with the snapshot or beyond it: the parsed copies are read again.
    void kept.value;
    const g = goalOf(sel.goal);
    const gi = keys.value.findIndex(k => k.d.key === sel.goal.key);
    const sn = setupNow.value;
    const snaps: FollowSnap[] = [];
    const seen = new Set<string>();
    const own = instantSnapKey(keys.value[gi]?.key ?? null);
    const ownSnap = snapOf(own);
    if (own && ownSnap) {
      seen.add(own);
      snaps.push({ snap: ownSnap, startTE: teSoFar.value, ownKey: true, check: currentSetup(sn.setup) });
    }
    const acct = account.value;
    const words = instantGoal(g.deadline, g.deadline ? store.finalTE : g.target);
    if (acct)
      for (const e of [...index.value].reverse()) {
        const m = e.meta;
        if (!m || m.account !== acct || m.goal !== words || seen.has(e.key)) continue;
        const sp = snapOf(e.key);
        if (!sp) continue;
        seen.add(e.key);
        const te = Array.isArray(m.teByEgg) && m.teByEgg.length ? m.teByEgg.reduce((a, b) => a + b, 0) : null;
        snaps.push({ snap: sp, startTE: te, ownKey: false, check: setupCheck(m.setup ?? null, sn.setup, sn.today) });
      }
    // This save's Fast, Exact or Custom results for the goal (the store's, the one kept beyond the snapshot): a followed
    // route that is one of them keeps its timeline (lib/followPrice.ts step 0).
    const results: FollowResult[] = [];
    const olderResultsFromBoard: FollowResult[] = [];
    const live = liveFor(g);
    if (live) results.push({ found: live, meta: { account: acct ?? '', goal: words, backupTime: saveSeconds.value, teByEgg: [...teByEgg.value] }, check: currentSetup(sn.setup) });
    // The account's Leaderboard run of this route, sent from another browser (`boardRuns`): this save's when its save is
    // the loaded one (within ten minutes), else an older save's.
    const run = boardRuns.value[sel.goal.key];
    if (run) {
      const same = run.save != null && Math.abs(run.save - saveSeconds.value) <= 600;
      (same ? results : olderResultsFromBoard).push({
        found: run.search,
        meta: same
          ? { account: acct ?? '', goal: words, backupTime: saveSeconds.value, teByEgg: [...teByEgg.value] }
          : { account: acct ?? '', goal: words, backupTime: run.save ?? 0 },
        check: same ? currentSetup(sn.setup) : setupCheck(null, sn.setup, sn.today),
      });
    }
    const k = keptFor(g);
    if (k)
      results.push({
        found: k.search,
        meta: { account: k.account, goal: k.goal, backupTime: k.backupTime, teByEgg: k.teByEgg, setup: k.setup },
        check: currentSetup(sn.setup),
      });
    // The account's results for the goal kept from older saves (or this save under another setup): a followed route
    // that is one of them shows its timeline, said to be priced on that save.
    const olderResults: FollowResult[] = [...olderResultsFromBoard];
    for (const e of keptList.value) {
      if (!acct || e.account !== acct || e.goal !== words || e.search.at === k?.search.at) continue;
      olderResults.push({
        found: e.search,
        meta: { account: e.account, goal: e.goal, backupTime: e.backupTime, teByEgg: e.teByEgg, setup: e.setup },
        check: setupCheck(e.setup ?? null, sn.setup, sn.today),
      });
    }
    const price = followPrice({
      olderResults,
      chain: f.chain,
      goal: g,
      currentTE: teSoFar.value,
      loadedSave: saveSeconds.value,
      snaps,
      history: history.value,
      goalIndex: Math.max(0, gi),
      goalKey: sel.goal.key,
      results,
      // Picked on the instant answer (or read back from online as the instant answer's): its own times lead.
      prefer: (f.source ?? sourceOfFrom(f.from)) === 'instant' ? 'instant' : 'search',
    });
    return { sel, f, g, gi, price };
  }
  const followPriced = computed(() => followPricedFor(planGoals.value.find(p => p.goal.key === selectedGoal.value)));

  /**
   * A FOLLOWED ROUTE ALWAYS HAS A TIMELINE (24 Oct 2026, lib/followEstimate.ts): a route no kept result prices on this
   * save (only a finish, or nothing) is priced on the instant answer's data in a route worker
   * (composables/useFollowEstimate.ts), with what this save's instant answer priced its own routes with: the selected
   * goal's own snapshot, else another goal's of the same save and setup.
   */
  /**
   * THE PRICING RECORD'S SETUP KEY (lib/followEstimate.ts `pricingSetupKey`), the same words InstantRoute.vue keeps it
   * under, read WITHOUT `collectInputs()` (the crash lesson, search/instantScale.ts: the whole search setup rebuilt on
   * each reactive edit, and anything in it that threw took the page down). Its first ascension is the store's
   * `firstAscensionFor()`, the value `collectInputs` itself puts there. Memoised by its own inputs (an edit to a day off
   * re-reads it once), and a reading that throws keeps the last good key with a console line.
   */
  const pricingSetupLast = { value: '' };
  /** Bumped when My runs keeps a pricing record itself (`instantNeed`): the records are read again. */
  const recordsRead = ref(0);
  const pricingSetup = computed(() =>
    readKept(
      () => pricingSetupFromStores(),
      pricingSetupLast,
      err => console.warn('My runs: reading the setup for the follow estimate failed:', err instanceof Error ? err.message : String(err))
    )
  );
  type FollowPriced = NonNullable<ReturnType<typeof followPricedFor>>;
  function estimatePickFor(fp: FollowPriced | null): PickedPricing {
    if (!fp || (fp.price.priced !== 'none' && fp.price.priced !== 'finish')) return null;
    return pickPricing(pricingSourcesFor(fp.sel.goal.key), followedFromNow(fp.f.chain, teSoFar.value), teSoFar.value);
  }
  /** What this save's instant answer priced its routes with (`goalKey`'s own snapshot ranked first). */
  function pricingSourcesFor(goalKey: GoalKey): PricingSource[] {
    void kept.value;
    // A record My runs kept itself (`instantNeed` below) is read again.
    void recordsRead.value;
    const sources: PricingSource[] = [];
    keys.value.forEach(({ d, key }) => {
      const s = snapOf(instantSnapKey(key)) as (SnapLike & { pricing?: unknown; tableUrl?: unknown; header?: { to?: unknown } | null }) | null;
      const pricing = s ? readPricing(s.pricing) : null;
      if (!s || !pricing || typeof s.tableUrl !== 'string') return;
      const to = s.header?.to;
      sources.push({
        url: s.tableUrl,
        pricing,
        tableTo: typeof to === 'number' ? to : null,
        ownGoal: d.key === goalKey,
        at: s.at,
        meta: s.meta ?? null,
      });
    });
    // The settings the instant answer kept for this save and setup the moment its answer was in (any goal's: they
    // price every route from this save), found by account, save and setup rather than by the goal's key.
    const setup = pricingSetup.value;
    if (setup && storeReady.value)
      sources.push(
        ...recordSources(readPricingRecords(), {
          account: account.value,
          backupTime: saveSeconds.value,
          setup,
          meta: account.value ? { account: account.value, goal: '', backupTime: saveSeconds.value } : null,
        })
      );
    return sources;
  }
  function estimateRequestOf(p: PickedPricing): EstimateRequest | null {
    if (!p || !('source' in p)) return null;
    // `shifts`: each table leg's shifts too (search/legShifts.ts), for Right now's table and Full timeline.
    return {
      key: estimateKey(saveSeconds.value, p.source, p.chain),
      url: p.source.url,
      options: { ...p.source.pricing.options, shifts: true },
      chain: p.chain,
    };
  }
  const estimatePick = computed<PickedPricing>(() => estimatePickFor(followPriced.value));
  const estimateRequest = computed<EstimateRequest | null>(() => estimateRequestOf(estimatePick.value));
  /** Every other followed goal's route as priced from what is saved, with its estimate's pick and request (priced in the
   *  background on load, so its pill and Next steps have its times before it is picked: composables/useFollowEstimate.ts
   *  `others`). */
  const otherFollows = computed(() =>
    hasSave.value
      ? planGoals.value.flatMap(pg => {
          if (pg.goal.key === selectedGoal.value || !follows.followed(pg.goal.key)) return [];
          const fp = followPricedFor(pg);
          if (!fp) return [];
          const pick = estimatePickFor(fp);
          return [{ fp, pick, req: estimateRequestOf(pick) }];
        })
      : []
  );
  /** The instant answer's own route priced again for its shifts (`shiftRequest`, below), in the background. */
  const shiftRequests = shallowRef<EstimateRequest[]>([]);
  const otherRequests = computed(() => [...otherFollows.value.flatMap(o => (o.req ? [o.req] : [])), ...shiftRequests.value]);
  const searchBusy = computed(() => store.isRunning || store.deadlineRunning || store.resultSending);
  const { state: estimate, otherStates } = useFollowEstimate(estimateRequest, searchBusy, otherRequests);

  /**
   * MY RUNS NEVER WAITS FOR ANOTHER TAB (26 Oct 2026, composables/useInstantCompute.ts): a followed goal with no
   * timeline whose route no pricing record of this save and setup reaches (a fresh browser, a Setup change) gets one
   * worked out here, the instant answer's own way, in the background. One record prices every followed goal, so one
   * request: up to the highest TE any of them needs. The TE a goal needs, or null when it needs none.
   */
  function recordNeedFor(fp: FollowPriced | null): number | null {
    if (!fp || (fp.price.priced !== 'none' && fp.price.priced !== 'finish')) return null;
    const chain = followedFromNow(fp.f.chain, teSoFar.value);
    if (!needsPricingRecord(pricingSourcesFor(fp.sel.goal.key), chain, teSoFar.value)) return null;
    return recordFinalFor(fp.g, chain);
  }
  /** The followed goals that need it, by goal key, with the TE each needs. */
  const recordNeeds = computed(() => {
    const out = new Map<GoalKey, number>();
    if (!hasSave.value || !storeReady.value) return out;
    const sel = recordNeedFor(followPriced.value);
    if (sel != null && selectedGoal.value) out.set(selectedGoal.value, sel);
    for (const o of otherFollows.value) {
      const n = recordNeedFor(o.fp);
      if (n != null) out.set(o.fp.sel.goal.key, n);
    }
    return out;
  });
  const instantNeed = computed<InstantComputeRequest | null>(() => {
    const needs = [...recordNeeds.value.values()];
    const acct = account.value;
    const setup = pricingSetup.value;
    // Only on the save as the Auto Planner sets it up, with Setup loaded (as the instant answer waits for them).
    if (!needs.length || !acct || !setup || store.startWait || !store.setupLoaded) return null;
    const final = Math.max(...needs);
    if (!(final > Math.floor(teSoFar.value))) return null;
    const backupTime = saveSeconds.value;
    return { key: `${acct}|${backupTime}|${setup}|${final}`, account: acct, backupTime, setup, final, useHours: useHoursFromStores() };
  });
  const { state: instantCompute } = useInstantCompute(instantNeed, searchBusy, () => recordsRead.value++);
  /** A goal's state while its record is worked out here, or why it couldn't be. */
  function instantStateFor(goalKey: GoalKey): Pick<FollowCard, 'estimating' | 'instantFailure'> | null {
    const st = instantCompute.value;
    const req = instantNeed.value;
    if (!st || !req || st.key !== req.key || !recordNeeds.value.has(goalKey)) return null;
    if (st.status === 'working') return { estimating: 'instant' };
    if (st.status === 'waiting') return { estimating: 'instantwait' };
    if (st.status === 'failed') return { estimating: 'nosource', instantFailure: st.reason };
    return null;
  }

  /** The selected goal's followed route and its plan: priced from what is saved, else estimated (above). */
  const followState = computed<{ card: FollowCard; plan: CardPlan | null } | null>(() => {
    const req = estimateRequest.value;
    return followStateFor(followPriced.value, estimatePick.value, req && estimate.value?.key === req.key ? estimate.value : null, !!req);
  });
  /** Another followed goal's, the same way (its estimate from the background). */
  const otherFollowStates = computed(() => {
    const out = new Map<GoalKey, { card: FollowCard; plan: CardPlan | null }>();
    const states = otherStates.value;
    for (const o of otherFollows.value) {
      const st = followStateFor(o.fp, o.pick, o.req ? (states[o.req.key] ?? { key: o.req.key, status: 'working' }) : null, !!o.req);
      if (st) out.set(o.fp.sel.goal.key, st);
    }
    return out;
  });
  /** Any followed goal's state: the selected one's, else the background's. */
  function followStateOf(key: GoalKey) {
    return key === selectedGoal.value ? followState.value : (otherFollowStates.value.get(key) ?? null);
  }

  function followStateFor(
    fp: FollowPriced | null,
    pick: PickedPricing,
    est: import('./useFollowEstimate').EstimateState | null,
    asked: boolean
  ): { card: FollowCard; plan: CardPlan | null } | null {
    if (!fp) return null;
    const { sel, f, g, price } = fp;
    const sn = setupNow.value;
    if (price.priced === 'exact') {
      const p = price.plan;
      const card: FollowCard = {
        chain: [...p.chain],
        from: f.from,
        label: followedLabel(f),
        price: p.exact ? 'exact' : 'instant',
        source: price.source,
        pricedSave: p.meta?.backupTime ?? null,
        ...(g.deadline && !finishesBefore(planFinish(p), g.deadline) ? { missesDate: true } : {}),
      };
      return {
        card,
        plan: {
          plan: p,
          goal: g,
          state: price.source,
          pricedWith: pricedWithWords(price.candidate.check),
          secondary: null,
          key: sel.goal.key,
          name: sel.goal.name,
          followed: card,
        },
      };
    }
    // Estimated on the instant answer's data: its timeline, said to be an estimate (times rounded to the hour).
    if (est?.status === 'done' && pick && 'source' in pick) {
      const p = planFromEstimate(est.route, g, pick.source, est.at);
      const card: FollowCard = {
        chain: [...p.chain],
        from: f.from,
        label: followedLabel(f),
        price: 'estimate',
        source: 'this-save',
        pricedSave: saveSeconds.value,
        ...(g.deadline && !finishesBefore(planFinish(p), g.deadline) ? { missesDate: true } : {}),
      };
      return {
        card,
        plan: { plan: p, goal: g, state: 'this-save', pricedWith: pricedWithWords(currentSetup(sn.setup)), secondary: null, key: sel.goal.key, name: sel.goal.name, followed: card },
      };
    }
    /** While it is worked out, or why it can't be (Right now's Next step). */
    // Asked and not answered yet counts as working, so "working it out" shows the whole time.
    const inst = asked ? null : instantStateFor(sel.goal.key);
    const estimating: FollowCard['estimating'] = asked
      ? est?.status === 'waiting'
        ? 'waiting'
        : est?.status === 'failed'
          ? 'failed'
          : 'working'
      : inst
        ? inst.estimating
        : pick && 'beyond' in pick
          ? 'beyond'
          : 'nosource';
    const failure = inst?.instantFailure ? { instantFailure: inst.instantFailure } : {};
    if (price.priced === 'finish')
      return {
        card: {
          chain: followedFromNow(f.chain, teSoFar.value),
          from: f.from,
          label: followedLabel(f),
          price: 'finish',
          source: 'history',
          pricedSave: price.backupTime,
          finish: { end: price.end, endTE: price.endTE, at: price.at },
          ...(g.deadline && !finishesBefore(price.end, g.deadline) ? { missesDate: true } : {}),
          ...(estimating ? { estimating } : {}),
          ...failure,
        },
        plan: null,
      };
    return {
      card: { chain: price.chain, from: f.from, label: followedLabel(f), price: 'none', source: null, pricedSave: null, ...(estimating ? { estimating } : {}), ...failure },
      plan: null,
    };
  }
  /**
   * NEXT STEPS (lib/myRunsDashboard.ts `buildSteps`, 24 Oct 2026): each followed goal's route with its priced finish
   * and prestiges (as Right now shows it, its estimate included; another goal's estimate worked out in the background)
   * and this save's Fast, Exact or Custom result for the goal when it is another route.
   */
  const followsForSteps = computed<FollowedForSteps[]>(() => {
    if (!hasSave.value) return [];
    const out: FollowedForSteps[] = [];
    for (const pg of planGoals.value) {
      const f = follows.followed(pg.goal.key);
      if (!f) continue;
      // Each goal as its pill and Right now show it: priced from what is saved, else its estimate (the selected goal's,
      // or the background's for another: 25 Oct 2026).
      const fs = followStateOf(pg.goal.key);
      let plan: NowPlan | null = fs?.plan?.plan ?? null;
      let finish: { end: number; endTE: number } | null = null;
      if (!plan && fs?.card.finish) finish = { end: fs.card.finish.end, endTE: fs.card.finish.endTE ?? f.chain[f.chain.length - 1] };
      if (plan) finish = { end: planFinish(plan), endTE: plan.endTE };
      const pick = pg.pick;
      const thisSave = pick?.state === 'this-save' ? pick.candidate : null;
      const r = thisSave ? (thisSave.driving?.search ?? (thisSave.plan.from ? thisSave.plan : null)) : null;
      const level = r?.from?.level;
      out.push({
        goalKey: pg.goal.key,
        name: pg.goal.name,
        goal: pg.goal.goal,
        target: pg.goal.target,
        deadline: pg.goal.deadline,
        eggDay: pg.goal.kind === 'eggday',
        chain: plan ? [...plan.chain] : followedFromNow(f.chain, teSoFar.value),
        finish,
        prestiges: plan ? planPrestiges(plan) : [],
        result:
          r && (level === 'Fast' || level === 'Exact' || level === 'Custom')
            ? { level, chain: [...r.chain], end: planFinish(r), endTE: r.endTE }
            : null,
      });
    }
    return out;
  });
  /** Time off and no-prestige days as absolute stretches, with their words (Next steps' `prestige` item). */
  const stepWindows = computed<StepWindow[]>(() => {
    const z = zone.value;
    const one = (list: TimeOffDates[] | null | undefined, kind: StepWindow['kind']): StepWindow[] =>
      usableTimeOff(list ?? []).flatMap(d => {
        const words = timeOffWords([d]).replace(/^time off/, kind === 'time off' ? 'your time off' : 'your no prestige days');
        return timeOffWindows([d], z).map(w => ({ from: w.from, to: w.to, words, kind }));
      });
    return [...one(store.timeOff, 'time off'), ...one(store.noPrestige, 'no-prestige day')];
  });

  /**
   * THE FIRST ANSWER BECOMES THE FOLLOW (lib/followPolicy.ts, AUTO_FOLLOW_FIRST): each goal whose Fast, Exact or Custom
   * result of this save drives Right now while nothing was ever followed for it follows that result (and saves it
   * online once; stores/follow.ts `autoFollow`). Only once the saved routes are read (or there is no collector): a
   * route followed elsewhere is never overwritten. The instant answer does the same on its own screen (InstantRoute.vue).
   */
  const autoTried = new Set<string>();
  watch(
    () => {
      if (!follows.autoReady || !hasSave.value) return [];
      return planGoals.value.flatMap(pg => {
        if (!autoFollowsGoal(pg.goal.key)) return [];
        const pick = pg.pick;
        const a = autoFollowOf({
          driving: pick?.candidate.ownKey ? pick.candidate.driving : null,
          thisSave: pick?.state === 'this-save',
          followed: !!follows.followed(pg.goal.key),
          goneAt: follows.goneAt(pg.goal.key),
          deadline: pg.goal.goal === 'date' ? pg.goal.deadline : null,
        });
        return a ? [{ goalKey: pg.goal.key, a }] : [];
      });
    },
    async list => {
      for (const { goalKey, a } of list) {
        const once = `${choiceScope.value}|${goalKey}|${a.at}`;
        if (autoTried.has(once)) continue;
        autoTried.add(once);
        await follows.autoFollow(goalKey, a);
      }
    },
    { immediate: true }
  );

  /** The followed route of the selected goal, for the card (null: the planner's checked route is shown). */
  const follow = computed<FollowCard | null>(() => followState.value?.card ?? null);

  /** Right now's plan: the selected goal's (the table, Next step, the timeline and the calendar all follow it). */
  const basePlan = computed<CardPlan | null>(() => {
    // A route the player follows replaces the planner's pick (priced from a save, or nothing to show yet). A newer,
    // better result never replaces it: it is offered (`betterRoute`, lib/searchPlan.ts the 'prompt' path).
    if (followState.value) return followState.value.plan;
    return pickedPlan.value;
  });
  /** The planner's pick for the selected goal, without a followed route: the instant answer, or a Fast, Exact or
   *  Custom result that takes over from it (lib/searchPlan.ts the 'takeover' path). */
  const pickedPlan = computed<CardPlan | null>(() => {
    const sel = planGoals.value.find(p => p.goal.key === selectedGoal.value);
    const pick = sel?.pick;
    if (!sel || !pick) return null;
    const c = pick.candidate;
    return {
      plan: c.plan,
      goal: goalOf(sel.goal),
      state: pick.state,
      pricedWith: pricedWithWords(c.check),
      secondary: pick.secondary ? { plan: pick.secondary.plan, label: otherSetupLabel(pick.secondary.check) } : null,
      key: sel.goal.key,
      name: sel.goal.name,
      ...(c.driving ? { driving: c.driving } : {}),
    };
  });
  /**
   * EACH ASCENSION'S SHIFTS FOR THE INSTANT ANSWER'S OWN ROUTE (26 Oct 2026): a plan of this save with the table's
   * times and no shifts listed (the instant answer's snapshot keeps none) is priced again with the same settings in
   * the background (composables/useFollowEstimate.ts `others`), for the shifts only (nowPlan `withTableShifts`).
   */
  const shiftRequest = computed<EstimateRequest | null>(() => {
    const c = basePlan.value;
    const p = c?.plan;
    if (!c?.key || !p || p.legs || p.exact || p.estimated || c.state !== 'this-save' || !p.tableLegs?.length) return null;
    if (p.tableLegs.some(l => l.shifts?.length)) return null;
    const chain = followedFromNow(p.chain, teSoFar.value);
    if (chain.join(',') !== p.chain.join(',')) return null;
    const r = estimateRequestOf(pickPricing(pricingSourcesFor(c.key), chain, teSoFar.value));
    return r ? { ...r, key: `shifts|${r.key}` } : null;
  });
  watch(
    shiftRequest,
    r => {
      if ((shiftRequests.value[0]?.key ?? null) !== (r?.key ?? null)) shiftRequests.value = r ? [r] : [];
    },
    { immediate: true }
  );
  /**
   * THE CURRENT ASCENSION SIMULATED ON THE LIVE SAVE (26 Oct 2026, lib/followSim.ts): the followed route's first
   * ascension, when its plan has the table's times, simulated once per save, route and setup in one chain worker
   * (composables/useCurrentSim.ts, never while a search runs). The request carries a builder: the evaluator's inputs
   * are read from the stores once, in the run, never here.
   */
  const simRequest = computed<SimRequest | null>(() => {
    // Any followed route without exact legs, whether the table's estimate is in, being worked out or couldn't be made
    // (26 Oct 2026: a route the estimate couldn't price still gets its Next step from the ascension you are in).
    const fs = followState.value;
    const p = fs?.plan?.plan;
    const acct = account.value;
    if (!fs || p?.legs || !acct || !storeReady.value || onVirtue.value === false) return null;
    const route = followedFromNow(p ? p.chain : fs.card.chain, teSoFar.value);
    if (!route.length) return null;
    const useHours = useHoursFromStores();
    const setup = simSetupKey({
      availability: store.availability,
      useHours,
      timeOff: store.timeOff,
      noPrestige: store.noPrestige,
      firstAscension: store.firstAscension,
      deferShifts: !!store.deferShifts,
    });
    const backupTime = saveSeconds.value;
    return {
      key: simKey({ account: acct, backupTime, route, setup }),
      account: acct,
      backupTime,
      route,
      setup,
      inputs: () => {
        const i = store.collectInputs();
        // One ascension, not the whole route: no dated milestones to meet; the hours only as the answers use them.
        return { ...i, milestones: [], ...(useHours ? {} : { availability: null }) };
      },
    };
  });
  const { state: currentSim, slow: simSlow } = useCurrentSim(simRequest, searchBusy);
  /** 'working' while the current ascension is simulated (or 'waiting' for a search), else null. */
  const simWorking = computed(() => {
    const st = currentSim.value;
    return st && st.key === simRequest.value?.key && (st.status === 'working' || st.status === 'waiting') ? st.status : null;
  });
  /** The simulation failed: its short reason, and whether it is tried once more (Right now says so, never silently). */
  const simFailure = computed(() => {
    const st = currentSim.value;
    return st?.status === 'failed' && st.key === simRequest.value?.key ? { reason: st.reason, retrying: !!st.retrying } : null;
  });
  const cardPlan = computed<CardPlan | null>(() => {
    const c = basePlan.value;
    const r = shiftRequest.value;
    const st = r ? otherStates.value[r.key] : null;
    const shifted = c && st?.status === 'done' ? { ...c, plan: withTableShifts(c.plan, st.route) } : c;
    const sim = currentSim.value;
    return shifted && sim?.status === 'done' && sim.key === simRequest.value?.key
      ? { ...shifted, plan: withCurrentSim(shifted.plan, sim.leg) }
      : shifted;
  });
  /**
   * With a followed route for the selected goal: the planner's pick for this save as the new result the prompt
   * compares (BetterRoutePrompt.vue, lib/searchPlan.ts `followPrompt`), with the followed route's own finish as priced
   * here (else the one saved with it). Null without a followed route or a pick of this save.
   */
  const betterRoute = computed<{
    goalKey: GoalKey;
    goal: 'fastest' | 'date';
    deadline: number | null;
    candidate: RouteFinish & { chain: number[]; at: number; source: FollowPrompt['source']; planStart: number | null };
    followedFinish: RouteFinish | null;
    /** The followed route's finish here came from a priced result (a Fast, Exact or Custom timeline, Check exactly's
     *  price or history): an instant answer never asks about it (lib/searchPlan.ts `followIsPriced`). */
    followedPriced: boolean;
  } | null>(() => {
    const fs = followState.value;
    const pick = pickedPlan.value;
    const key = selectedGoal.value;
    if (!fs || !pick || !key || pick.state !== 'this-save') return null;
    const p = pick.plan;
    const f = follows.followed(key);
    if (!f) return null;
    let followedFinish: RouteFinish | null = null;
    if (fs.plan) followedFinish = { end: planFinish(fs.plan.plan), endTE: fs.plan.plan.endTE };
    else if (fs.card.finish) followedFinish = { end: fs.card.finish.end, endTE: fs.card.finish.endTE ?? f.chain[f.chain.length - 1] };
    else if (typeof f.finish === 'number') followedFinish = { end: f.finish, endTE: f.endTE ?? f.chain[f.chain.length - 1] };
    const level = p.from?.level;
    return {
      goalKey: key,
      goal: pick.goal.goal,
      deadline: pick.goal.deadline,
      candidate: {
        chain: [...p.chain],
        end: planFinish(p),
        endTE: p.endTE,
        at: p.from?.at ?? p.calculatedAt,
        source: level === 'Exact' ? 'exact' : level === 'Custom' ? 'custom' : level === 'Fast' ? 'fast' : 'instant',
        planStart: p.planStart,
      },
      followedFinish,
      followedPriced: fs.card.price === 'exact' || fs.card.price === 'finish',
    };
  });
  /** A followed route read back from online, set with another hours window or simulator than the player's now: the
   *  quiet note under it ('' otherwise). */
  const followSetWith = computed(() => {
    const key = selectedGoal.value;
    const f = key && followState.value ? follows.followed(key) : null;
    if (!f?.cloud) return '';
    const hours = f.hours !== undefined && !sameHours(f.hours, hoursOf(store.availability));
    const sim = !!f.simVersion && f.simVersion !== SIM_VERSION;
    return setWithOtherWords({ hours, sim });
  });
  /** The last Follow press on this goal couldn't be saved online: its words ('' otherwise). */
  const followSaveWords = computed(() => {
    const s = follows.saveState(selectedGoal.value);
    return s?.state === 'failed' ? s.words : '';
  });

  /** The followed route of the selected goal isn't saved online (stores/follow.ts `notSaved`): Right now says so, with
   *  "Save it online". */
  const followNotSaved = computed(() => !!followState.value && follows.notSaved(selectedGoal.value));
  /** The account's routes saved online couldn't be read on this load (stores/follow.ts `cloudStatus`): Right now says
   *  so in amber, with Retry, as following still works in this browser (UX review, 25 Oct 2026: not red). */
  const followCloudUnreachable = computed(() => follows.online && follows.cloudStatus === 'unreachable');
  /** Retry: read the saved routes again now, whatever the last read's age. */
  function retryFollowCloud(): void {
    void follows.loadCloud(true);
  }
  /** "Save it online": the followed route of the selected goal saved now (a Follow press's save). */
  function saveFollowOnline(): void {
    const g = selectedGoal.value;
    if (g) void follows.saveNow(g);
  }

  /** "Go back to the instant answer": the selected goal follows its instant plan until a newer result lands. */
  function goBackToInstant(): void {
    const c = cardPlan.value;
    const at = c?.driving?.search?.from?.at;
    if (!c?.key || at == null) return;
    wentBack.value = { ...wentBack.value, [backKey(c.key)]: at };
    // Kept with the result, so the next visit doesn't take it over again: the instant answer drives this goal until a
    // newer result.
    const f = c.driving?.found;
    if (f) keepResult(c.goal, f);
    if (account.value) markKeptBack({ account: account.value, goal: goalWordsOf(c.goal), backupTime: saveSeconds.value }, true);
    kept.value++;
  }
  /** "Use your Fast run": undo it. */
  function useSearchResult(): void {
    const c = cardPlan.value;
    if (!c?.key) return;
    const { [backKey(c.key)]: _gone, ...rest } = wentBack.value;
    void _gone;
    wentBack.value = rest;
    const f = c.driving?.found;
    if (f) keepResult(c.goal, f);
    if (account.value) markKeptBack({ account: account.value, goal: goalWordsOf(c.goal), backupTime: saveSeconds.value }, false);
    kept.value++;
  }

  /** The player's hours as the answers were priced with them ("Works inside my hours"), and the no-prestige days as
   *  absolute stretches (the store's `collectInputs` makes the same), for the prestiges that wait (lib/instantSteps.ts). */
  const stepHours = computed(() => {
    void storeReady.value;
    return useHoursFromStores() ? (store.availability ?? null) : null;
  });
  const stepNoPrestige = computed(() => timeOffWindows(usableTimeOff(store.noPrestige ?? []), zone.value));
  /** Time off as absolute stretches: the estimate prices none, so its rows that run into one are flagged. */
  const stepTimeOff = computed(() => timeOffWindows(usableTimeOff(store.timeOff ?? []), zone.value));
  /** Every ascension of the plan and its shifts (Right now's Full timeline when the plan has no exact legs). */
  const ascensions = computed(() => {
    const p = cardPlan.value?.plan;
    if (!p || p.legs) return [];
    return ascensionSteps(
      stepLegsOf(p).map((l, i) => ({
        ...l,
        ...(p.tableLegs?.[i]?.shifts ? { shifts: p.tableLegs[i].shifts } : {}),
        ...(p.tableLegs?.[i]?.simulated ? { simulated: true } : {}),
        ...(p.tableLegs?.[i]?.timeOff ? { timeOff: p.tableLegs[i].timeOff } : {}),
        // The build-up line (lib/buildUpLine.ts): its variant (the simulated one's key, else the table's label) and rate.
        ...(p.tableLegs?.[i]?.variant ? { variant: p.tableLegs[i].variant } : {}),
        ...(p.tableLegs?.[i]?.label ? { label: p.tableLegs[i].label } : {}),
        ...(p.tableLegs?.[i]?.peakELR !== undefined ? { peakELR: p.tableLegs[i].peakELR } : {}),
      })),
      stepHours.value,
      stepNoPrestige.value,
      stepTimeOff.value
    );
  });
  /** The plan's ascensions as lib/nextAction.ts reads them (the first simulated once it is in). */
  /** The simulated ascension, when it is in for the followed route. */
  const simLeg = computed(() => {
    const sim = currentSim.value;
    return sim?.status === 'done' && sim.key === simRequest.value?.key ? sim.leg : null;
  });
  /** The route goes on past the legs known (no plan: only the simulated ascension). */
  const moreThanKnown = computed(() => !cardPlan.value && (simRequest.value?.route.length ?? 0) > 1);
  const actionLegs = computed<ActionLeg[]>(() => {
    const p = cardPlan.value?.plan;
    // No timeline for the route: the ascension you are in alone, once simulated.
    const leg = simLeg.value;
    if (!p)
      return leg && simRequest.value
        ? [
            {
              to: simRequest.value.route[0],
              endTE: leg.endTE,
              start: leg.startTime,
              end: leg.endTime,
              shifts: leg.shifts,
              simulated: true,
              ...(leg.buildPhaseEndTime !== null ? { buildEnd: leg.buildPhaseEndTime } : {}),
              ...(continuesFarm(leg.key) ? { live: true } : {}),
              ...(leg.timeOff ? { timeOff: leg.timeOff } : {}),
            },
          ]
        : [];
    if (p.legs) return [];
    return (p.tableLegs ?? []).slice(0, p.chain.length).map(l => ({
      to: l.to,
      endTE: l.endTE,
      start: l.start,
      end: l.end,
      ...(l.shifts ? { shifts: l.shifts } : {}),
      ...(l.simulated ? { simulated: true } : {}),
      ...(l.buildEnd !== undefined ? { buildEnd: l.buildEnd } : {}),
      ...(continuesFarm(l.variant) ? { live: true } : {}),
      ...(l.timeOff ? { timeOff: l.timeOff } : {}),
    }));
  });
  /** The selected followed route's pill without a timeline: the ascension you are in being worked out, or its next
   *  prestige (planGoals `goalFollowOf`). */
  const currentChip = computed(() => {
    if (cardPlan.value || !simRequest.value) return null;
    const leg = simLeg.value;
    if (leg) return { working: false, prestigeAt: simRequest.value.route.length > 1 ? prestigeAtFrom(leg.endTime) : leg.endTime };
    return simWorking.value ? { working: true, prestigeAt: null } : null;
  });
  /** When a prestige may happen from a moment: the hours and the no-prestige days (search/noPrestige.ts). */
  const prestigeAtFrom = (t: number) => nextPrestigeAt(t, stepHours.value, stepNoPrestige.value);
  /** THE NEXT ACTION (26 Oct 2026, lib/nextAction.ts): from the ascension you are in as simulated on the save; null
   *  until the simulation is in (Right now keeps its line from the table). */
  const nextStep = computed<NextAction | null>(() => {
    const first = actionLegs.value[0];
    if (!first?.simulated) return null;
    return nextAction({
      now: now.value,
      leg: first,
      last: actionLegs.value.length === 1 && !moreThanKnown.value,
      prestigeAt: prestigeAtFrom,
      timeOff: stepTimeOff.value,
    });
  });
  /** NEXT SHIFTS (26 Oct 2026, lib/nextAction.ts `nextShifts`): the next 3 to 5 shifts under the Next step, the
   *  ascension you are in from the simulation, the later ones from the table, ending with a prestige inside the list. */
  const nextShiftLines = computed<NextShiftLine[]>(() =>
    actionLegs.value.length
      ? nextShifts({ now: now.value, legs: actionLegs.value, prestigeAt: prestigeAtFrom, more: moreThanKnown.value, timeOff: stepTimeOff.value })
      : []
  );
  /** Shifts at the same minute are one row (Joo's H1 step, then K3): nowPlan `mergeSimultaneousShifts`. The
   *  planned-shift total reads the legs, so it still counts both. A prestige that waits for the hours or past a
   *  no-prestige day says so (nowPlan `markPrestigeWaits`). */
  const events = computed(() => {
    if (!cardPlan.value) return [];
    // Done by the save's state, not the clock alone: the egg it is on and its TE (nowPlan `planEvents`).
    const list = planEvents(cardPlan.value.plan, now.value, hasSave.value ? { egg: currentEgg.value, te: teSoFar.value } : null);
    const lines = instantSteps(stepLegsOf(cardPlan.value.plan), stepHours.value, stepNoPrestige.value, stepTimeOff.value);
    return mergeSimultaneousShifts(markPrestigeWaits(list, lines), zone.value);
  });
  const shownEvents = computed(() => tableEvents(events.value));
  const ascNow = computed(() => (cardPlan.value ? ascensionAt(cardPlan.value.plan, now.value) : 0));
  const track = computed(() => {
    if (!cardPlan.value) return null;
    // Whole TE only, and the egg the farm is on (lib/planPace.ts `progressOf`), as on My runs' saved plans.
    const p = progressOf(raw.value, saveSeconds.value);
    return onTrack(cardPlan.value.plan, {
      seconds: saveSeconds.value,
      teByEgg: teByEgg.value,
      progress: p?.progress,
      onVirtue: onVirtue.value !== false,
      egg: p?.egg ?? null,
    });
  });

  // -------------------------------------------------------------------------------------- the gear

  /** The save's three sets, worked out once per save (store `readInventory`: pure, a few ms). */
  const inventory = shallowRef<{ equipped: EquippedArtifact[] | null; earnings: EquippedArtifact[] | null; production: EquippedArtifact[] | null } | null>(null);
  watch(
    [raw, storeHasSave, storeReady],
    ([r, here]) => {
      if (!r || !here) {
        inventory.value = null;
        return;
      }
      try {
        const inv = store.readInventory();
        inventory.value = { equipped: inv.equippedNow, earnings: inv.earnings, production: inv.elr };
      } catch {
        inventory.value = null;
      }
    },
    { immediate: true }
  );
  function clothedOf(set: EquippedArtifact[] | null): number | null {
    if (!set || !hasSave.value) return null;
    try {
      const ctx = getSimulationContext();
      return calculateClothedTEForSet(set, {
        truthEggs: teByEgg.value.reduce((a, b) => a + b, 0),
        colleggtibleModifiers: ctx.colleggtibleModifiers,
        labUpgradeLevel: ctx.epicResearchLevels['cheaper_research'] ?? 0,
        permitLevel: (raw.value as { game?: { permitLevel?: number | null } }).game?.permitLevel ?? null,
      });
    } catch {
      return null;
    }
  }
  /** Which set the save wears (lib/gearMatch.ts): Gear's "Equipped now = your earnings set" and the badge. */
  const setMatch = computed(() => {
    const inv = inventory.value;
    return inv ? whichSet(inv.equipped, inv.earnings, inv.production) : null;
  });
  const gear = computed(() => {
    const inv = inventory.value;
    if (!inv) return null;
    return {
      ...inv,
      match: setMatch.value,
      clothedEquipped: clothedOf(inv.equipped),
      clothedEarnings: clothedOf(inv.earnings),
      whatIf: selectedWhatIf.value ?? (cardPlan.value?.state === 'this-save' ? cardPlan.value.plan.whatIf : null),
    };
  });
  /** The maxed what-if kept with the selected goal's instant answer of THIS save and setup (its own snapshot key), so
   *  a followed or estimated route still has it: the gear block's "With a perfect set" line (25 Oct 2026). */
  const selectedWhatIf = computed<SnapWhatIf | null>(() => {
    void kept.value;
    const k = keys.value.find(x => x.d.key === selectedGoal.value);
    const s = k ? (snapOf(instantSnapKey(k.key)) as { whatIf?: SnapWhatIf | null } | null) : null;
    return s?.whatIf ?? null;
  });

  // -------------------------------------------------------------------------------- eggs and facts

  const facts = computed(() =>
    hasSave.value
      ? farmFacts({
          farm: onVirtue.value ? farm.value : null,
          epic: initial.epicResearchLevels,
          colleggtibles: initial.colleggtibleModifiers,
          equipped: inventory.value?.equipped ?? initial.artifactLoadout,
        })
      : null
  );
  /** The corner badge, Building or Producing with the rate (lib/nowPhase.ts); null off virtue. */
  const phase = computed(() =>
    hasSave.value
      ? phaseNow({
          onVirtue: onVirtue.value,
          plan: cardPlan.value?.plan ?? null,
          nowSeconds: now.value,
          setMatch: setMatch.value,
          saveElr: facts.value?.elr ?? null,
        })
      : null
  );
  /** Not on virtue yet: each goal's saved plan as "If you start <date>: …" (lib/nowStart.ts). */
  const startInfo = computed(() =>
    onVirtue.value === false
      ? startLines(
          planGoals.value.map(p => ({
            key: p.goal.key,
            name: p.goal.name,
            goal: p.goal.goal,
            target: p.goal.target,
            plan: p.pick?.candidate.plan ?? null,
          })),
          now.value,
          zone.value
        )
      : []
  );
  const eggs = computed(() => {
    if (!hasSave.value) return [];
    const { delivered, earned } = saveEggCountsOf(raw.value);
    return eggLines(delivered, earned, currentEgg.value, facts.value?.elr ?? null);
  });
  const shiftsDone = computed(() => (raw.value as { virtue?: { shiftCount?: number | null } } | null)?.virtue?.shiftCount ?? 0);
  const soulEggs = computed(() => (raw.value as { game?: { soulEggsD?: number | null } } | null)?.game?.soulEggsD ?? 0);
  const nextShiftCost = computed(() => (raw.value ? nextShiftCostAt(soulEggs.value, shiftsDone.value) : null));
  /** The plan's shifts after the save and their cost at today's soul eggs; null: can't tell (no shift listed).
   *  `partial`: counted from the table's shifts, which leave out each fresh ascension's opening. */
  const plannedShifts = computed(() => {
    const p = cardPlan.value?.plan;
    const n = p ? shiftsAfter(p, saveSeconds.value) : null;
    if (n == null) return null;
    return { count: n, cost: plannedShiftsCost(soulEggs.value, shiftsDone.value, n), ...(p && !p.legs ? { partial: true } : {}) };
  });

  // -------------------------------------------------------------------------------------- the tiles

  function tileFor(g: Goal): Tile {
    const gi = keys.value.findIndex(x => x.g.goal === g.goal && x.g.target === g.target && x.g.deadline === g.deadline);
    const k = keys.value[gi]?.key ?? null;
    const setup = { availability: store.availability, timeOff: store.timeOff };
    const nowMs = now.value * 1000;
    // Every kept snapshot of this goal under another key, with the setup it recorded (Right now ranks the same).
    const others = snapCandidates.value
      .filter(c => !c.ownKey && c.goalIndex === gi && c.plan.goal === g.goal)
      .map(c => ({ plan: c.plan, recorded: c.check.recorded }));
    return buildTile({
      goal: g.goal,
      target: g.target,
      deadline: g.deadline,
      nowMs,
      save: hasSave.value ? { seconds: saveSeconds.value, te: saveTEOf(raw.value) } : null,
      snapshot: gi >= 0 ? drivingOf(g, keys.value[gi].d.key, instantSnapKey(k)).plan : planOf(g, snapOf(instantSnapKey(k))),
      lastChecked: lastCheckedOf(k && k.startsWith(ANSWER_PREFIX) ? k : null),
      history: history.value,
      board: o.myRows.value,
      saved: savedDate.value,
      setupNow: setupNow.value,
      otherSnapshots: others,
      hoursChanged: row => {
        const d = hoursDiffer(row, setup, nowMs, zone.value);
        return d.hours || d.timeOff;
      },
      olderSimulator: row => simulatorAge(row) === 'older',
    });
  }
  const fastestTile = computed<{ tile: Tile; target: number }>(() => {
    const first = tileFor({ goal: 'fastest', target: RACE_TARGET, deadline: null });
    if (first.answer || store.finalTE === RACE_TARGET) return { tile: first, target: RACE_TARGET };
    const own = tileFor({ goal: 'fastest', target: store.finalTE, deadline: null });
    return own.answer ? { tile: own, target: store.finalTE } : { tile: first, target: RACE_TARGET };
  });
  const eggDayTile = computed(() => tileFor({ goal: 'date', target: store.finalTE, deadline: eggDayAt }));

  const raceStand = computed<Standing | null>(() => {
    const a = fastestTile.value.tile.answer;
    return raceStanding(o.boardRows.value, o.myRows.value, fastestTile.value.target, now.value * 1000, a ? a.end * 1000 : null);
  });
  const eggDayStand = computed<Standing | null>(() => {
    const a = eggDayTile.value.answer;
    return dateStanding(
      o.boardRows.value,
      o.myRows.value,
      eggDayAt,
      now.value * 1000,
      a ? { te: a.endTE, spareSeconds: (a.spareHours ?? 0) * 3600 } : null
    );
  });

  /**
   * THE SAVED ANSWER SHOWN (24 Oct 2026, Jordan): only the goal picked on Right now's switch, never both; switching the
   * pill switches the tile. Race to N: that race's tile (Fastest to 490's own when it is the one picked); Egg Day: its
   * tile; another date: that date's.
   */
  const shownTile = computed<{
    goal: 'fastest' | 'date';
    key: GoalKey | null;
    /** By a date: the pill's name ("Egg Day 2027", "By Feb 10, 2027"); Fastest: null (the view names the target). */
    name: string | null;
    tile: Tile;
    target: number;
    stand: Standing | null;
    standingLabel: string;
    /** Another date than Egg Day: its screen, and its own late words (SavedTile `open`, `dateKind`). */
    open?: MyRunsOpen;
  }>(() => {
    const sel = planGoals.value.find(p => p.goal.key === selectedGoal.value)?.goal ?? null;
    const nowMs = now.value * 1000;
    if (sel?.goal === 'date' && sel.deadline) {
      if (sel.deadline === eggDayAt)
        return { goal: 'date', key: sel.key, name: sel.name, tile: eggDayTile.value, target: store.finalTE, stand: eggDayStand.value, standingLabel: 'Egg Day' };
      const tile = tileFor({ goal: 'date', target: store.finalTE, deadline: sel.deadline });
      const a = tile.answer;
      const stand = dateStanding(o.boardRows.value, o.myRows.value, sel.deadline, nowMs, a ? { te: a.endTE, spareSeconds: (a.spareHours ?? 0) * 3600 } : null);
      return { goal: 'date', key: sel.key, name: sel.name, tile, target: store.finalTE, stand, standingLabel: sel.name, open: goalOpen(sel, zone.value) };
    }
    const f = fastestTile.value;
    if (sel?.goal === 'fastest' && sel.target !== f.target) {
      const tile = tileFor({ goal: 'fastest', target: sel.target, deadline: null });
      const a = tile.answer;
      const stand = raceStanding(o.boardRows.value, o.myRows.value, sel.target, nowMs, a ? a.end * 1000 : null);
      return { goal: 'fastest', key: sel.key, name: null, tile, target: sel.target, stand, standingLabel: `Fastest to ${sel.target} TE` };
    }
    return { goal: 'fastest', key: sel?.key ?? null, name: null, tile: f.tile, target: f.target, stand: raceStand.value, standingLabel: `Fastest to ${f.target} TE` };
  });

  return {
    now,
    zone,
    hasSave,
    saveWaiting,
    saveSeconds,
    onVirtue,
    currentEgg,
    teSoFar,
    strip,
    eggDayAt,
    eggDayYear,
    cardPlan,
    follow,
    betterRoute,
    followSetWith,
    followSaveWords,
    followNotSaved,
    saveFollowOnline,
    followCloudUnreachable,
    retryFollowCloud,
    goalChoices,
    selectedGoal,
    selectGoal,
    goBackToInstant,
    useSearchResult,
    events,
    shownEvents,
    ascensions,
    simWorking,
    simFailure,
    simSlow,
    nextStep,
    nextShiftLines,
    ascNow,
    track,
    gear,
    facts,
    phase,
    startInfo,
    eggs,
    shiftsDone,
    soulEggs,
    nextShiftCost,
    plannedShifts,
    fastestTile,
    eggDayTile,
    raceStand,
    eggDayStand,
    shownTile,
    followsForSteps,
    stepWindows,
  };
}
