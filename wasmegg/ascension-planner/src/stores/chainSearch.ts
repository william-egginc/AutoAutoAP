/**
 * Drives a chain search from the browser: gathers the Pinia-resolved inputs, owns the worker pool,
 * runs the driver, and keeps the live progress the UI renders.
 *
 * WHY THE STORE OWNS THE POOL. useResearchCalcWorker.ts ties its worker to a component via
 * `onUnmounted`, which is right for a computation that only matters while a tab is open. A chain
 * search runs for HOURS; its lifetime belongs to the run, not to whichever component happens to be
 * mounted. So the pool is created in `start()` and terminated in `stop()`/on completion, and the
 * component below it is free to unmount and remount without disturbing anything.
 *
 * ALL PINIA READS HAPPEN HERE, ON THE MAIN THREAD, ONCE. `getSimulationContext()` and
 * `createBaseEngineState(null)` (engine/adapter.ts) throw immediately outside a Pinia context, which
 * a worker never has — the same split researchCalc.worker.ts documents. Everything the simulation
 * itself calls is already Pinia-free.
 */
import { defineStore } from 'pinia';
import { computed, markRaw, ref, shallowRef, toRaw, watch } from 'vue';
import { CHART_AUTO_LIMIT, addToHeat, createHeat, heatSnapshot, type HeatSnapshot } from '@/lib/chartThin';
import { getSimulationContext, createBaseEngineState } from '@/engine/adapter';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { hashID } from '@/lib/storage/db';
import { runChainSearch, type CacheEntry } from '@/search/driver';
import { findStartingChain, planCoarseGrid } from '@/search/coarse';
import { createChainSearchPool, type ChainSearchPool } from '@/search/pool';
import { contention, timeWeightedWorkers, workerSecondsFromRate } from '@/search/speed';
import { addChainSample, sweepTimeLeft, type SweepTimeLeft } from '@/search/sweepEstimate';
import { createStickyDealer } from '@/search/stickyDealer';
import { hardwareThreads, maxPoolSize, clampPoolSize, targetWorkerCount, workersForBatch } from '@/search/batch';
import { describeRunError } from '@/utils/errors';
import { loadChainBenchmark, saveChainBenchmark } from '@/lib/chainBenchmarkCache';
import { patchAutoPlannerSchedule } from '@/lib/autoPlannerFormCache';
import { cteFromColleggtibles, cteFromLabUpgrade, multiplierToTE } from 'lib/virtue';
import { DEFAULT_EFFORT, EFFORT, estimateChains } from '@/search/effort';
import {
  buildCheckpoint,
  clearCheckpoint,
  fingerprintChanges,
  fingerprintSettings,
  lockedChanges,
  settingsChanges,
  fingerprintPlanStart,
  fingerprintRun,
  withPlanStart,
  loadAnyCheckpoint,
  loadCheckpoint,
  listInterrupted,
  restoreInterrupted,
  discardInterrupted,
  restoreEntries,
  saveCheckpoint,
  type SearchCheckpoint,
} from '@/search/persistence';
import {
  buildChainsCsv,
  buildDeadlineCsv,
  chainsCsvChunks,
  deadlineCsvChunks,
  type CsvMeta,
  describeLoadoutSlots,
  describeVirtueInventory,
  formatInZone,
  virtueInventory,
  type InventoryCount,
} from '@/search/csv';
import { showDateTime, showDay } from '@/lib/displayTime';
import { type ShortlistRow } from '@/search/shortlist';
import { buildView, type ViewId } from '@/search/views';
import {
  appBuildId,
  bestPerFamily,
  asProvisional,
  BEST_SO_FAR_GAP_MS,
  buildSubmission,
  cleanNote,
  duplicateMessage,
  keepVirtueArtifacts,
  scrubIdentifiers,
  submissionFilename,
  summariseProof,
  provisionalProgress,
  readProvisionalRow,
  tooManySubmissionsMessage,
  type ProvisionalRow,
  type Recheck,
  type SearchSpace,
  type Submission,
  type SweepTag,
} from '@/search/submission';
import { currentPlans, recheckChains, type RecheckRun } from '@/search/rechecks';
import { accountKeyOf, type BoardRow, type Plan } from '@/lib/leaderboardRank';
import { describeAvailability, isConstrained, nextAvailable, type Availability } from '@/search/availability';
import { MAX_LAST_STOP, runDeadlineSearch, type DeadlineProgress, type DeadlineRoute } from '@/search/deadline';
import * as blackBox from '@/search/blackBox';
import { detectBrowser } from '@/lib/browserHelp';
import {
  aboutIn,
  autoDecision,
  autoStatusLine,
  bestLabel,
  progressKey,
  type AutoInput,
  type AutoRefusal,
} from '@/search/bestSoFarAuto';
import {
  csvNote,
  csvSettled,
  gzipChunksCapped,
  progressDetail,
  PROGRESS_CSV_LIMIT_BYTES,
  sizeLabel,
  type ProgressCsv,
} from '@/search/progressSend';
import { useShareExtras } from '@/composables/useShareExtras';
import {
  installStepAway,
  stepAwayBeat,
  stepAwayOptions,
  stepAwayPageClosing,
  stepAwayRunEnded,
  stepAwayRunStarted,
  stepAwayStopPressed,
} from '@/composables/useStepAway';
import { readRunMark, runAliveElsewhere, RUN_KEY, type RunKind } from '@/search/stepAway';
import {
  clearDeadlineCheckpoint,
  loadDeadlineCheckpoint,
  loadDeadlineResult,
  replayingEvaluator,
  runBandSets,
  saveDeadlineCheckpoint,
  saveDeadlineResult,
  listSavedAnswers,
  saveAnswer,
  deleteSavedAnswer,
  type SavedAnswer,
  type DeadlineCheckpoint,
  type DeadlineAccount,
  type DeadlineRunSpec,
  type PricedEntry,
  type SavedDeadlineResult,
} from '@/search/deadlineStore';
import { missedMilestones, usableMilestones, type Milestone } from '@/search/milestones';
import { defaultSeedChain, seedChainIssue, seedTidied, usableCheckpoints, fitSeedToLimits } from '@/search/seedChain';
import { buildPool, exhaustiveChainsWithGap, bandedChains, sortByPrefix } from '@/search/exhaustive';
import {
  addLegSample,
  deadlineMemoCapacity,
  deadlinePercent,
  estimateRoutes,
  firstRouteLegs,
  laterRouteLegs,
  legsLeft,
  liveLegRate,
  spaceSets,
  spaceShapeKey,
  usableRatio,
  type SetsLearned,
} from '@/search/deadlineEstimate';
import { applyLegBudget, estimateLegBytes } from '@/search/legBudget';
import { summariseEpicResearch, summariseColleggtibles } from '@/search/progression';
import { reviewContext, reviewLegs, reviewSetup, TE_MISMATCH_TOLERANCE, type HealthIssue } from '@/search/health';
import {
  DECADES_LONG_DAYS,
  INTEGRITY_BLOCK_SECONDS,
  INTEGRITY_WARN_SECONDS,
  integrityMessage,
  type CteParts,
  type SubmissionFlag,
} from '@/search/rules';
import { existingOwnerToken, ownerToken } from '@/search/owner';
import { describeSaveAge, siloSeconds } from '@/lib/saveAge';
import { timeOffWindows, usableTimeOff, type TimeOffDates } from '@/search/timeOff';
import {
  DEFAULT_FIRST_ASCENSION,
  firstAscensionAt,
  fromClassicOverride,
  readFirstAscension,
  type FirstAscension,
} from '@/search/firstAscension';
import { listRuns, saveRun, loadRun, deleteRun, defaultRunLabel, type RunSummary } from '@/search/runLibrary';
import {
  listRunSaves,
  loadRunInputs,
  pruneRunSaves,
  runSaveKey,
  saveRunInputs,
  type RunSaveSummary,
  accountOf,
} from '@/search/runSaves';
import { epicResearchDefs } from '@/lib/epicResearch';
import { deliveryScore } from '@/search/virtueScore';
import { getColleggtibleTiers } from 'lib/collegtibles';
import {
  getArtifactLoadoutFromBackup,
  getOptimalEarningsSet,
  calculateClothedTEForSet,
  getOptimalELRSet,
  type EquippedArtifact,
} from '@/lib/artifacts';
import type { EffortTier, LegSummary, PricedChain, SearchInputs } from '@/search/types';
import { useActionsStore } from './actions';
import { useAutoPlannerStore, type VariantKey } from './autoPlanner';
import { useInitialStateStore } from './initialState';
import { useUIStore } from './ui';

/** Don't write to IndexedDB more often than this. A checkpoint costs a JSON round-trip over the
 *  whole cache; a batch takes tens of seconds, so this loses at most one batch on a crash. */
const CHECKPOINT_INTERVAL_MS = 20_000;

/** Weight on the newest batch in the s/chain estimate. High enough to follow a stage change
 *  within a couple of batches, low enough that one slow batch does not dominate. */
const RATE_ALPHA = 0.3;

/** Chains in a Smart search's first batch: the last checkpoint's first sweep (search/driver.ts
 *  `resolveLast`, span 12 = 25 values) plus the seed, which rides in it. Sizes the warm-up. */
const FIRST_SWEEP_CHAINS = 26;

/** How often to recompute the runners-up table. Slower than the batch rate on purpose — see
 *  `refreshShortlist`. */
const SHORTLIST_INTERVAL_MS = 30_000;

/**
 * Chains that keep their per-leg detail by default. See `legDetailBudget`.
 *
 * Scaled off the machine where the browser will tell us about it. `navigator.deviceMemory` is a
 * coarse, deliberately-fuzzed figure -- 0.25, 0.5, 1, 2, 4, 8 -- and capped at 8 by the spec so it
 * cannot be used to fingerprint a big workstation, which is fine here: the question is only whether
 * this is a 4 GB laptop or something with room to spare. Unavailable in Safari and Firefox, where
 * the middle value is the honest guess.
 */
const DEFAULT_LEG_DETAIL_BUDGET = (() => {
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (!gb) return 2000;
  return Math.max(500, Math.min(8000, Math.round(gb * 500)));
})();

/** Shared by `startExhaustive` and `benchmarkMachine` — the exhaustive search's whole configuration,
 *  the browser form of the CLI's `--range`/`--bands` flags. */
export interface ExhaustiveSpec {
  lo: number;
  hi: number;
  step: number;
  minAsc: number;
  maxAsc: number;
  /** Minimum TE between consecutive checkpoints. 0 leaves the enumeration unconstrained. */
  minGap?: number;
  /** Per-checkpoint bands. When present these replace the single pool entirely, and the
   *  ascension count is `bands.length + 1` rather than the min/max range. */
  bands?: number[][];
}

/** Where the background worker count is remembered (per browser, a convenience only). */
const BACKGROUND_WORKERS_KEY = 'aap-background-workers';

function readStoredCount(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0; // Blocked storage or a private window: the default, "same as in front".
  }
}

/** Whether the run chart is open (per browser). Hidden unless the player opened it. */
const CHART_SHOWN_KEY = 'autoap.chartShown';

function loadChartShown(): boolean {
  try {
    return localStorage.getItem(CHART_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

function saveChartShown(on: boolean): void {
  try {
    localStorage.setItem(CHART_SHOWN_KEY, on ? '1' : '0');
  } catch {
    // Not remembered this time.
  }
}

function writeStoredCount(key: string, n: number): void {
  try {
    if (n > 0) localStorage.setItem(key, String(n));
    else localStorage.removeItem(key);
  } catch {
    // Not remembered this time; the setting still applies to this visit.
  }
}

/** The collector's cap on a gzipped table (collector/worker.js, MAX.CSV_BYTES). */
const TABLE_LIMIT_BYTES = 8 * 1024 * 1024;

function tableTooLargeMessage(size: string): string {
  return `sent, but the table is too large for the board (${size} compressed, limit 8 MB). The summary is in. Keep the table with Download CSV and send the file to whoever runs the board; retrying will not help.`;
}

/** What the progress bar shows for the run going now (see `runProgress`). */
export interface RunProgress {
  kind: 'smart' | 'full' | 'by-date' | 'start-times';
  stage: string;
  done: number;
  /** Null when the run has no estimate; never below `done`. */
  total: number | null;
  unit: string;
  /** Seconds, from a measured rate; null when this kind has none (the bar estimates from pace). */
  secondsLeft: number | null;
  /** `secondsLeft` is still the planned figure: too little real work yet to measure the speed. */
  measuring?: boolean;
  /** The bar's fill, 0-100, when the kind works out its own (By a date: never full while time is
   *  left); absent or null: done over total, as before. */
  percent?: number | null;
  /** Date.now() when it started. */
  startedAt: number;
  stopping: boolean;
  /** A Full sweep queue's chain running ("chain 1 of 3"); absent for a single run. */
  chain?: { at: number; of: number } | null;
  /** The best so far: its route, the TE it reaches, and when (unix seconds). */
  best: { chain: number[]; te: number; at: number } | null;
}

/** What Find says while the save is still settling (`saveNotReady`). */
export const SAVE_STILL_LOADING = 'Your save is still loading. Try again in a moment.';
/** What a send says when the payload contradicts its own save (`startContradictsSave`). */
export const START_MISMATCH_NOT_SENT = "This run's start doesn't match its save; it wasn't sent.";
/** How far a submission's start TE may sit from its save's TE: the health check's tolerance. */
const SEND_TE_TOLERANCE = 3;

/** Sum a per-virtue TE map; 0 for none. */
function sumTE(earned: Record<string, number> | null | undefined): number {
  return earned ? (Object.values(earned) as number[]).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
}
/** The TE of a state the workers price: what a run's `currentTE` must be. */
export function pricedTE(state: { teEarned?: Record<string, number> } | null | undefined): number {
  return sumTE(state?.teEarned);
}

/**
 * Why a submission must not be sent because it contradicts itself, or '' when it is fine: a start TE
 * more than 3 from the save it says it was made from, or a first stop that is not above the start.
 * A row like that was priced from one save and labelled with another (board row 07e3dbf0). Better a
 * lost row than a wrong one.
 */
export function startContradictsSave(p: {
  currentTE?: number;
  backupTE?: number | null;
  chain?: readonly number[];
}): string {
  const te = p.currentTE;
  // No start at all is the collector's to reject (it validates the shape); this judges a stated one.
  if (typeof te !== 'number' || !Number.isFinite(te)) return '';
  if (typeof p.backupTE === 'number' && Number.isFinite(p.backupTE) && Math.abs(te - p.backupTE) > SEND_TE_TOLERANCE) {
    return START_MISMATCH_NOT_SENT;
  }
  const first = p.chain?.[0];
  if (typeof first === 'number' && first <= te) return START_MISMATCH_NOT_SENT;
  return '';
}

export const useChainSearchStore = defineStore('chainSearch', () => {
  const effort = ref<EffortTier>(DEFAULT_EFFORT);
  const finalTE = ref(490);
  /**
   * What A1 does with the ascension in progress, following Classic's rule (search/firstAscension.ts):
   * 'auto' (Fastest, the default) takes the faster of continuing and a fresh start, 'continue' pins
   * continue, 'fresh' prestiges now. `firstAscensionChoice` is Your setup's own choice; Classic's A1
   * dropdown, when something is picked there, outranks it (`firstAscension`). Replaced the boolean
   * `forceContinue` (on by default) on 9 Oct 2026.
   */
  const firstAscensionChoice = ref<FirstAscension>(DEFAULT_FIRST_ASCENSION);
  /** Classic's A1 dropdown read as the setting ('continue', or any build for a fresh start), or null
   *  when nothing is picked there. */
  const firstAscensionFromClassic = computed(() => fromClassicOverride(useAutoPlannerStore().planVariantOverrides[0]));
  /** A1's setting: Classic's dropdown when it names one, else Your setup's choice. Writing it is
   *  `setFirstAscension`, which keeps Classic's dropdown in step. */
  const firstAscension = computed<FirstAscension>({
    get: () => firstAscensionFromClassic.value ?? firstAscensionChoice.value,
    set: v => setFirstAscension(v),
  });
  /** Set when Your setup changes Classic's A1 pick, so a plan already built there is rebuilt around
   *  it; AutomaticPlanner does that (now, or when it next opens) and clears it. */
  const classicFirstPickChanged = ref(false);
  /**
   * Set A1's setting, and Classic's A1 dropdown with it: Continue sets `{0: 'continue'}`, Fastest
   * clears pick 0, Prestige now clears a 'continue' pick. Classic's dropdown can only name a specific
   * build, and which build is fastest depends on the chain, so Prestige now never pins one here; a
   * build already picked there stays, since it means Prestige now too. `rebuildClassic`: Your setup's
   * own control, which also has a plan already built in Classic rebuilt to match.
   */
  function setFirstAscension(v: FirstAscension, opts: { rebuildClassic?: boolean } = {}): void {
    firstAscensionChoice.value = v;
    const planner = useAutoPlannerStore();
    const current = planner.planVariantOverrides[0];
    const next = v === 'continue' ? 'continue' : v === 'auto' || current === 'continue' ? undefined : current;
    if (next === current) return;
    const rest = { ...planner.planVariantOverrides };
    delete rest[0];
    planner.planVariantOverrides = next ? { ...rest, 0: next } : rest;
    if (opts.rebuildClassic) classicFirstPickChanged.value = true;
  }
  /**
   * What Classic's A1 pick should be after Generate (which clears every pick), so the plan it builds
   * starts as the search priced it. For the chain Apply just put there, priced under the setting in
   * force now, the search's own A1: under Prestige now, the build it took (a build pick means Prestige
   * Now, so the setting stays); under Continue, no pick when it took a build (a fresh start strictly
   * faster than a continue of over a week: Classic's own fastest is that build too, and a build pick
   * would read back as Prestige Now). Otherwise Continue when that is Your setup's choice, else none.
   */
  function classicFirstPick(): Record<number, VariantKey> {
    const applied = appliedFirstLeg;
    const mode = firstAscension.value;
    const forThis =
      !!applied &&
      applied.mode === mode &&
      applied.targets === (useAutoPlannerStore().targetTE || '').trim().split(/\s+/).join(' ');
    if (forThis && mode === 'fresh' && applied!.key !== 'continue') return { 0: applied!.key };
    if (forThis && mode === 'continue' && applied!.key !== 'continue') return {};
    return firstAscensionChoice.value === 'continue' ? { 0: 'continue' } : {};
  }
  /** The chain Apply last put in Classic, the variant the search took for its A1, and the setting it
   *  was priced under (`classicFirstPick`). */
  let appliedFirstLeg: { targets: string; key: VariantKey; mode: FirstAscension } | null = null;
  /** @deprecated The old boolean, kept so older callers still work: true is 'continue', false 'auto'. */
  const forceContinue = computed<boolean>({
    get: () => firstAscension.value === 'continue',
    set: v => setFirstAscension(v ? 'continue' : 'auto'),
  });
  /** Your setup's choice and Classic's A1 pick, to put back exactly (`restoreFirstAscension`): a sweep
   *  sets its own for one run. */
  function firstAscensionState(): { choice: FirstAscension; pick: VariantKey | undefined } {
    return { choice: firstAscensionChoice.value, pick: useAutoPlannerStore().planVariantOverrides[0] };
  }
  function restoreFirstAscension(s: { choice: FirstAscension; pick: VariantKey | undefined }): void {
    firstAscensionChoice.value = s.choice;
    const planner = useAutoPlannerStore();
    if (planner.planVariantOverrides[0] === s.pick) return;
    const rest = { ...planner.planVariantOverrides };
    delete rest[0];
    planner.planVariantOverrides = s.pick ? { ...rest, 0: s.pick } : rest;
  }
  /** Set when Insane mode was opened from a Chain Explorer "Run this sweep" link; see InsanePanel. */
  const sweepTag = ref<SweepTag | null>(null);
  /** The run note box: what the player is trying or testing (optional, submission.ts `cleanNote`). */
  const runNote = ref('');
  /** Time off from the virtue farm, as whole local dates (search/timeOff.ts). Each stretch ends the
   *  ascension in progress, and the player comes back to a complete rebuild. */
  const timeOff = ref<TimeOffDates[]>([]);
  /**
   * The tag the CURRENT RESULT was run under, captured when an exhaustive run starts. `sweepTag`
   * itself only says a link was followed; a staged search started afterwards, or a sweep whose
   * bands were edited first, is not that sweep. Both happened in one real session: a 6-ascension
   * staged result arrived on the board filed under the 2-ascension M1 preset.
   */
  let runSweepTag: SweepTag | null = null;
  /** The note the CURRENT RESULT was run under, captured when a run starts, as `runSweepTag` is:
   *  the box may be edited while it runs, and the CSV, the save and the send describe this run. */
  let runNoteUsed: string | undefined;
  /** Hold the first N checkpoints fixed. Moving X1 re-simulates every downstream leg, and X1 is
   *  usually the best-validated value, so pinning it is often the right trade. */
  const pin = ref(0);

  /**
   * How many ascensions the plan may use, counted as chain length INCLUDING the final target.
   *
   * Two stages read this and they read it differently, which is why it lives here rather than
   * being hardcoded in each. The coarse scan enumerates subsets at these lengths; the count probe
   * uses them as the range it may drop or insert a checkpoint within. Previously the scan was
   * pinned to 5-8 and the probe silently used "one either side of the seed", so a user who wanted
   * to forbid an 8th rebuild had no way to say so.
   */
  /** Override for the driver's `maxLast`. Null means "use the driver's default". Advanced only. */
  const maxLastOverride = ref<number | null>(null);

  const minPrestiges = ref(5);
  const maxPrestiges = ref(8);

  /**
   * When the player can actually act — the schedule the plan has to fit around.
   *
   * OFF by default, and that is not timidity. Turning it on changes the objective the search
   * minimises (every prestige is pushed into the window and the delay is charged), so a plan built
   * with it is not comparable to one built without it, and every accuracy figure in EFFORT_NOTES
   * was measured without it. See search/availability.ts for what it models.
   *
   * Defaults describe someone awake 07:00-23:00 every day, which is the sleep case — the narrower
   * feature this generalises.
   */
  const scheduleEnabled = ref(false);
  const availableFrom = ref(7);
  const availableTo = ref(23);
  /** 0 = Sunday. All seven means "every day", which the constraint check treats as no day filter. */
  const availableDays = ref<number[]>([0, 1, 2, 3, 4, 5, 6]);

  /** The schedule as the search takes it, or null. Timezone comes from the Auto Planner's own
   *  scheduling inputs so the hours mean what the rest of the planner shows. */
  const availability = computed<Availability | null>(() => {
    if (!scheduleEnabled.value) return null;
    const a = {
      days: [...availableDays.value],
      fromHour: availableFrom.value,
      toHour: availableTo.value,
      timezone: useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    return isConstrained(a) ? a : null;
  });

  /**
   * Hold each SHIFT for the schedule too, not just each prestige.
   *
   * ON by default, because it is what "plan around my schedule" plainly means: without it the
   * search reports night shifts and plans around none of them. With it they are charged, so the
   * answer is a chain whose twelve-per-ascension switches actually land in your hours — usually a
   * different chain, and always a slower-looking one, because work that was invisible is now
   * counted. See chain.ts for what the delay model approximates.
   */
  const deferShifts = ref(true);

  const availabilityLabel = computed(() => describeAvailability(availability.value));

  /** True when the boxes are ticked but describe no restriction at all — every day, all hours.
   *  The panel says so rather than letting the user think a constraint is in force. */
  const scheduleIsEmpty = computed(() => scheduleEnabled.value && availability.value === null);

  /**
   * Dated TE milestones — "be at 248 by the first of June".
   *
   * A HARD filter: a chain that misses one is not a candidate (see search/milestones.ts). That is
   * what makes it steer the search rather than merely annotate the answer, and it is also why the
   * panel has to handle "nothing satisfied them" as a first-class outcome instead of rendering an
   * infinite duration.
   */
  const milestones = ref<Milestone[]>([]);

  /** The ones that could ever be met — a positive TE at or below the final target. The panel warns
   *  about the rest rather than letting the search reject every chain over a typo. */
  const activeMilestones = computed(() => usableMilestones(milestones.value, finalTE.value));

  const droppedMilestones = computed(() =>
    milestones.value.filter(m => !activeMilestones.value.some(a => a.te === m.te && a.by === m.by))
  );

  const isRunning = ref(false);
  const stopRequested = ref(false);
  const error = ref<string | null>(null);
  /** True when `error` is a pre-flight refusal: the run never started, so nothing was lost and the
   *  crash advice (lower the effort tier, read the worker console) does not apply. */
  const errorBeforeStart = ref(false);
  /** Things worth knowing about the run just started that do not stop it -- e.g. "no virtue
   *  ascension in progress, so leg 1 is a fresh one". Set at start, from the pre-flight review. */
  const runNotes = ref<string[]>([]);

  const stage = ref('');
  const detail = ref('');
  const chainsDone = ref(0);
  const chainsEstimated = ref(0);
  const bestChain = ref<number[]>([]);
  const bestDays = ref(0);
  const bestLegs = ref<LegSummary[]>([]);

  /** Which milestones the CURRENT best chain misses. Normally empty, because a chain that missed one
   *  would have been rejected — it is non-empty only for a best chain that predates the milestone
   *  (a restored checkpoint, or a run stopped before anything feasible was priced). */
  const bestMissed = computed(() => missedMilestones(bestLegs.value, activeMilestones.value));
  /** When true, start() runs the coarse subset scan and ladder check FIRST and uses their
   *  answer as the seed, instead of trusting the chain typed into Target TE. That is the
   *  only way to get a starting chain from nothing - stages 2-3 in the CLI. */
  const findSeedFirst = ref(false);
  /** The coarse scan's own log lines, shown verbatim like the CLI prints them. */
  const coarseLog = ref<string[]>([]);
  /** Every stage/detail line the run has emitted, newest last. The panel shows only the
   *  latest by default; this is what a verbose view reads, and it is the only record of
   *  which combinations were actually tried. Capped so a 3-hour run cannot grow unbounded. */
  const runLog = ref<string[]>([]);
  const lastCompletedStage = ref('none');
  const stoppedEarly = ref(false);
  /** A run that reached the end of its tier, as opposed to stopped, failed or still going. */
  const finishedCleanly = computed(
    () => !isRunning.value && !error.value && !stoppedEarly.value && stage.value.startsWith('done')
  );
  /**
   * Whether a run should take the screen Wake Lock (see `holdScreenLock` below). The operator's
   * call, not a silent default -- some people run this on a laptop they need to actually use, or on
   * a machine where the OS sleep timer is already handled some other way. On by default because
   * the failure mode it prevents (the machine sleeping and freezing every worker for hours,
   * unnoticed) is worse than the failure mode it risks (a screen kept on that didn't need to be).
   */
  const keepAwake = ref(true);

  /**
   * Workers this run may use. The knob, as opposed to `workersInPool`, which is the readback.
   *
   * Separate because the two answer different questions and a run can make them disagree: the pool
   * spawns lazily and a small batch is not worth every worker, so "how many did you end up with" is
   * not "how many may you have". Held to the machine's core count when a pool is built.
   */
  const workerBudget = ref(maxPoolSize());
  /**
   * Workers to use while this tab is in the BACKGROUND, 0 meaning "the same as in front".
   *
   * Nothing here ever pauses a run. What pauses one is the browser freezing a hidden tab, which a
   * page cannot prevent. This is the other half: someone who switches away to work or play can have
   * the search keep going at a lower draw instead of choosing between full speed and stopping it,
   * and get full speed back the moment they return. Remembered per browser.
   */
  const backgroundWorkers = ref(readStoredCount(BACKGROUND_WORKERS_KEY));
  watch(backgroundWorkers, n => writeStoredCount(BACKGROUND_WORKERS_KEY, n));
  /** Whether this tab is hidden right now; tracked only while a run is going. */
  const tabHidden = ref(false);
  /** What the running pool should be sized to: the background count while hidden, if one is set. */
  const targetWorkers = computed(() => targetWorkerCount(workerBudget.value, backgroundWorkers.value, tabHidden.value));
  /** Logical cores, for the panel to show alongside the knob. */
  const machineThreads = hardwareThreads();
  /** Runs carried on this visit, for "Also send diagnostics". */
  let carryOnCount = 0;
  const workersInPool = ref(maxPoolSize());
  /** Measured on THIS machine, from this run's own batches. Not an assumption carried over from the
   *  CLI's 20-core box. */
  const secondsPerChain = ref(0);
  /** How many workers were running when `secondsPerChain` was measured (search/speed.ts). */
  const rateWorkers = ref(0);
  /** Where `secondsPerChain` came from: a live run's own first chunk, or a "Benchmark my PC" probe
   *  run before anything started. Both write the identical quantity; this is only so the UI can say
   *  which one it is showing. */
  const rateSource = ref<'benchmark' | 'live' | null>(null);
  /** A "Benchmark my PC" probe in flight. Mutually exclusive with `isRunning`: only one pool runs at
   *  a time. */
  const benchmarking = ref(false);
  const benchmarkError = ref<string | null>(null);
  /** `Date.now()` of the last benchmark probe (button-triggered or restored from a previous
   *  session), for the panel's "benchmarked Xs ago" caption. 0 means never. */
  const benchmarkedAt = ref(0);
  const benchmarkChainCount = ref(0);
  const startedAt = ref(0);
  /** A checkpoint from a previous session that matches the current inputs, if any. */
  const resumable = ref<SearchCheckpoint | null>(null);
  /**
   * An unfinished checkpoint that CANNOT resume, and why ("TE was 147, now 170").
   *
   * It used to simply not appear, so an overnight run lost to a crash looked like it had never been
   * saved at all. Usually the reason is a backup that loaded stale on one visit and fresh on the
   * next, and saying so is the only way the player finds out.
   */
  const blockedCheckpoint = ref<{ record: SearchCheckpoint; changes: string[] } | null>(null);
  /** Unfinished runs a later run moved out of the checkpoint slot (persistence.ts), newest first. */
  const interrupted = shallowRef<SearchCheckpoint[]>([]);
  /** The saves stored for unfinished runs (search/runSaves.ts), so a panel can label a run and know
   *  it can carry on without loading multi-MB bodies. */
  const runSaves = ref<RunSaveSummary[]>([]);
  function runSaveFor(key: string | undefined): RunSaveSummary | null {
    return key ? (runSaves.value.find(s => s.key === key) ?? null) : null;
  }
  /** True while a run is being got ready to carry on (a stored save loading): every Start and
   *  Resume waits, or a second click would launch a second run against half-reset stores. */
  const preparing = ref(false);
  /** Anything that must not overlap a run: a run of either kind, getting one ready, or the
   *  latest-save re-check. */
  const busy = computed(
    () =>
      isRunning.value || preparing.value || recheckingLatest.value || deadlineRunning.value || startSweepRunning.value
  );
  /**
   * "When should I start?": one route priced from every hour of the next week (or every few), so a
   * player can see whether waiting a few hours to begin catches the sales and finishes sooner. The
   * answer belongs to that route: another route's legs line up with the weekly sales differently.
   */
  const startSweepRunning = ref(false);
  const startSweep = ref<{
    chain: number[];
    step: number;
    done: number;
    total: number;
    results: { start: number; finish: number | null }[];
    stoppedEarly: boolean;
    at: number;
  } | null>(null);
  let startSweepPool: ChainSearchPool | null = null;

  /**
   * A Full sweep's multi-chain click (InsanePanel): which chain is running (-1 for none), of how
   * many, whether Stop asked the rest not to start, and what the finished ones found. In the store
   * rather than the panel, because the panel now closes whenever the player looks at another tab
   * (the unified layout) and the queue keeps going; back on the Full sweep, the panel shows it.
   */
  const sweepQueue = ref<{
    at: number;
    total: number;
    cancelled: boolean;
    results: { label: string; chain: number[]; days: number; stopped: boolean; finish: number }[];
    /** Each chain's count and length, for the time left of the whole queue (`sweepLeft`). */
    counts?: number[];
    ascensions?: number[];
  }>({ at: -1, total: 0, cancelled: false, results: [] });

  /**
   * HOOK for the instant answer. When something outside a search (the precomputed answer, on the
   * branch that has one) thinks a different number of ascensions is better than the one a search
   * covers, it sets these and both search panels say so next to what they cover ("The instant answer
   * suggests 7 ascensions; this sweep only searches 5."). Left unset on this branch.
   */
  const suggestedCount = ref<number | null>(null);
  const suggestedRoute = ref<number[] | null>(null);
  /** The instant answer's route for each number of ascensions, fastest first (precompute: set by
   *  InstantRoute.vue on Fastest route; by the exact check's order once it is in). Smart search starts
   *  from the fastest of them inside the Limits box, and the Full sweep's Suggest a space centres on
   *  them. */
  const instantRoutes = ref<number[][] | null>(null);

  /** Set by the panel that started the run when it will send the result itself at the end (Find and
   *  submit), so the progress bar on other tabs can say so. */
  const submitsWhenDone = ref(false);
  /** How the last automatic send went (Find and submit), for a panel opened after it: the run and
   *  its send outlive the panel that started them (AutoSendReport.vue). Cleared by the next Find. */
  const lastAutoSend = ref<{ kind: 'smart' | 'full' | 'by-date'; ok: boolean; text: string } | null>(null);

  // ------------------------------------------------------------------------- Send best so far
  //
  // A long run (By a date, a Full sweep: 10-20 h) used to send only when it ended. "Send best so far"
  // sends its best mid-run as a PROVISIONAL row and lets it carry on; the run's final send carries
  // `replaces` and takes that row's place (collector/README.md, "Provisional rows"). So does a second
  // best so far from the same run. Fastest and By a date each keep their own.

  /** The provisional row each screen's run has on the board, and the name it went under. Kept in the
   *  run's checkpoint, so a crash and a carry-on still replace it. */
  const provisionalRows = ref<{ fastest: ProvisionalRow | null; deadline: ProvisionalRow | null }>({
    fastest: null,
    deadline: null,
  });
  /** A carried-on run's provisional row, read from its checkpoint, until the run takes it at its start
   *  (`takeCarriedProvisional`). A fresh run takes nothing, so it never replaces another run's row. */
  let carriedProvisional: ProvisionalRow | null = null;
  function takeCarriedProvisional(): ProvisionalRow | null {
    const held = carriedProvisional;
    carriedProvisional = null;
    return held;
  }
  function setProvisional(kind: 'fastest' | 'deadline', row: ProvisionalRow | null): void {
    provisionalRows.value = { ...provisionalRows.value, [kind]: row };
  }
  /**
   * The run that may Send best so far: set by the screen that started it for the length of the run
   * (`beginBestSoFar`), so a run started anywhere else (a sweep from Science) offers nothing. `consent`
   * is the name to send under once the player has agreed -- at Find and submit, or in the screen's box
   * during the run -- and null until then. `asked`: the progress bar's button was pressed without
   * consent, so the screen opens its consent box. `sendOnAgree`: that box was opened by a Send best
   * so far press (not by the automatic option), so ticking it sends at once: the press was the ask,
   * and a second press nobody knew was needed is how a best so far went unsent (review, 9 Oct).
   */
  const bestSoFar = ref<{
    kind: 'fastest' | 'deadline';
    consent: { nickname: string } | null;
    asked: boolean;
    sendOnAgree: boolean;
  } | null>(null);
  const bestSoFarSending = ref(false);
  /**
   * How the last Send best so far went, for the bar and the screen. Cleared when a run begins.
   * `pending`: not an outcome but what to do next ("tick the box under Find"), shown in neither
   * green nor red.
   */
  const bestSoFarStatus = ref<{ ok: boolean; text: string; pending?: boolean } | null>(null);
  let bestSoFarInFlight: Promise<unknown> | null = null;
  /** A clock for "You can send again in N min", ticking only while a run can send. */
  const bestSoFarNow = ref(Date.now());
  let bestSoFarTicker: ReturnType<typeof setInterval> | null = null;
  /** Whole minutes until this run may send its best so far again (one every 30 min); 0 when it may. */
  const bestSoFarWait = computed(() => {
    const run = bestSoFar.value;
    const at = run ? provisionalRows.value[run.kind]?.at : undefined;
    if (!at) return 0;
    const left = at + BEST_SO_FAR_GAP_MS - bestSoFarNow.value;
    return left > 0 ? Math.ceil(left / 60_000) : 0;
  });
  function beginBestSoFar(kind: 'fastest' | 'deadline', consent: { nickname: string } | null): void {
    bestSoFar.value = { kind, consent, asked: false, sendOnAgree: false };
    bestSoFarStatus.value = null;
    bestSoFarNow.value = Date.now();
    bestSoFarStartedAt = bestSoFarNow.value;
    bestSoFarAuto.value = {
      lastKey: null,
      lastBest: null,
      lastDetail: null,
      lastFailAt: null,
      retryAt: null,
      lastSkipAt: null,
      failed: false,
      refused: null,
    };
    autoAsked = false;
    if (!bestSoFarTicker)
      bestSoFarTicker = setInterval(() => {
        bestSoFarNow.value = Date.now();
        // A hidden tab runs this about once a minute, which is plenty for sends 30 minutes apart.
        autoTick();
      }, 15_000);
  }
  function endBestSoFar(): void {
    bestSoFar.value = null;
    if (bestSoFarTicker) clearInterval(bestSoFarTicker);
    bestSoFarTicker = null;
  }
  /** The player agreed, in the screen's box, during the run (or changed the name it goes under). */
  function agreeBestSoFar(nickname: string): void {
    if (bestSoFar.value)
      bestSoFar.value = { ...bestSoFar.value, consent: { nickname }, asked: false, sendOnAgree: false };
    if (bestSoFarStatus.value?.pending) bestSoFarStatus.value = null;
  }
  /**
   * Send best so far pressed before consent (`send`), or the automatic option wanting its yes: the
   * screen shows its consent box. A press also says so on the bar and under the button, so the
   * press never looks like it did nothing.
   */
  function askBestSoFar(send = false): void {
    const run = bestSoFar.value;
    if (!run) return;
    bestSoFar.value = { ...run, asked: true, sendOnAgree: run.sendOnAgree || send };
    if (send)
      bestSoFarStatus.value = {
        ok: false,
        pending: true,
        text: 'Not sent yet: tick the box under Find to agree, and it sends straight away.',
      };
  }
  /** Resolves once any best-so-far send in flight has its answer, so a final send that follows
   *  knows which row to replace. */
  async function bestSoFarSettled(): Promise<void> {
    if (bestSoFarInFlight) await bestSoFarInFlight.catch(() => {});
  }

  // Automatic best so far ("Stepping away?", search/bestSoFarAuto.ts): the rules are the pure
  // `autoDecision`; this holds the little state it needs and does the sending, on the ticker above.
  const bestSoFarAuto = ref<{
    /** The progress (`progressKey`) the row on the board carries, from any send this run made, and how
     *  the status line names its best (`bestLabel`: the finish date for Fastest, the TE for By a date)
     *  and the rest (`progressDetail`: "3,735 chains, CSV 2.1 MB"). */
    lastKey: string | null;
    lastBest: string | null;
    lastDetail: string | null;
    lastFailAt: number | null;
    retryAt: number | null;
    /** A due time passed with nothing new priced: not sent, said, next check one interval on. */
    lastSkipAt: number | null;
    failed: boolean;
    /** The collector's daily cap turned a send away: said on the line until the next send. */
    refused: AutoRefusal | null;
  }>({
    lastKey: null,
    lastBest: null,
    lastDetail: null,
    lastFailAt: null,
    retryAt: null,
    lastSkipAt: null,
    failed: false,
    refused: null,
  });
  let bestSoFarStartedAt = Date.now();
  /** The box was opened by the automatic option (so unticking it can close the box again). */
  let autoAsked = false;

  /** The scheduling inputs now; null when no run here may send. */
  function autoInput():
    | (AutoInput & {
        lastBest: string | null;
        failed: boolean;
        lastDetail: string | null;
        refused: AutoRefusal | null;
      })
    | null {
    const run = bestSoFar.value;
    if (!run) return null;
    const p = runProgress.value;
    const here = !!p && (p.kind === 'by-date') === (run.kind === 'deadline');
    const a = bestSoFarAuto.value;
    return {
      now: bestSoFarNow.value,
      active: stepAwayOptions.value.autoSendBest && !!run.consent && here,
      everyMs: stepAwayOptions.value.autoSendEveryMin * 60_000,
      startedAt: bestSoFarStartedAt,
      lastSentAt: provisionalRows.value[run.kind]?.at ?? null,
      lastSentKey: a.lastKey,
      lastFailAt: a.lastFailAt,
      retryAt: a.retryAt,
      lastSkipAt: a.lastSkipAt,
      key: here ? progressKey(p) : null,
      sending: bestSoFarSending.value,
      lastBest: a.lastBest,
      failed: a.failed,
      lastDetail: a.lastDetail,
      refused: a.refused,
    };
  }
  /** The quiet line under the tick: "Last progress sent 4:20 pm (best 248; 3,735 routes, CSV 2.1 MB).
   *  Next in about 60 min." */
  const bestSoFarAutoLine = computed(() => {
    const run = bestSoFar.value;
    if (!run || !stepAwayOptions.value.autoSendBest) return '';
    if (!run.consent) return 'Waiting for your OK in the box under Find.';
    const i = autoInput();
    return i ? autoStatusLine(i) : '';
  });
  async function autoSend(): Promise<void> {
    const r = await sendBestSoFar();
    const a = bestSoFarAuto.value;
    if (r.ok) bestSoFarAuto.value = { ...a, lastFailAt: null, retryAt: null, failed: false, refused: null };
    else if (r.tooSoon)
      bestSoFarAuto.value = {
        ...a,
        retryAt: Date.now() + (r.retryAfter ?? 60) * 1000,
        ...(r.dailyCap ? { refused: { at: Date.now(), why: r.text.replace(/\.$/, '') } } : {}),
      };
    // Any other failure: the next try is one interval on.
    else bestSoFarAuto.value = { ...a, lastFailAt: Date.now(), failed: true };
  }
  /** One look at the schedule: gets the player's yes if it is missing, and sends when it is time. */
  function autoTick(): void {
    const run = bestSoFar.value;
    if (!run || !stepAwayOptions.value.autoSendBest) return;
    bestSoFarNow.value = Date.now();
    if (!run.consent) {
      // A carried-on run that already sent a row under a name has the player's yes for that name.
      const row = provisionalRows.value[run.kind];
      if (row) agreeBestSoFar(row.nickname);
      else if (!run.asked) {
        askBestSoFar();
        autoAsked = true;
      }
    }
    const i = autoInput();
    const decision = i && autoDecision(i);
    if (decision?.do === 'send') void autoSend();
    // Due, and nothing new priced: say so on the status line, and look again one interval on.
    else if (decision?.do === 'skip') bestSoFarAuto.value = { ...bestSoFarAuto.value, lastSkipAt: i!.now };
  }
  watch(
    () => stepAwayOptions.value.autoSendBest,
    on => {
      const run = bestSoFar.value;
      if (!run) return;
      if (on) autoTick();
      else if (autoAsked && !run.consent) bestSoFar.value = { ...run, asked: false };
      if (!on) autoAsked = false;
    }
  );
  // Any other load replacing the carried-on run's save (the header's refresh, Plan Next, a plan
  // from the library...) ends "on the run's own save": drop the notice and the run's pinned start.
  watch(
    () => useInitialStateStore().rawBackup,
    now => {
      // Null is the moment between a reset and the next save landing, not a replacement: acting on
      // it cleared the pin and then had no save time to move the start to.
      if (!now || !ownSaveBackup || !useUIStore().runSaveLoaded || toRaw(now) === ownSaveBackup) return;
      ownSaveBackup = null;
      useUIStore().runSaveLoaded = null;
      resetPlanStartTo((toRaw(now) as { approxTime?: number } | null)?.approxTime);
    }
  );
  /** The planner's save as loaded for a carried-on run, to notice when anything replaces it. */
  let ownSaveBackup: unknown = null;
  /** The stored save the current run is priced under ('' when it could not be stored). */
  let runInputsKey = '';
  /**
   * Set when the results on screen were priced on a run's OWN (older) save rather than the latest
   * one. They are right for that save, but the player has moved on since, so the panel offers to
   * re-price the fastest few on the latest save before anyone follows one.
   */
  const resultsFromOlderSave = ref<{ te: number; backupAt: number; planStart: number } | null>(null);
  const recheckingLatest = ref(false);
  const latestRecheck = ref<{
    rows: { chain: number[]; oldFinish: number; newFinish: number | null; newDays: number | null }[];
    te: number;
    at: number;
  } | null>(null);

  /**
   * The saved run currently loaded into the panel, when one is.
   *
   * Held so Resume knows which run's cache is in memory, and so the panel can explain WHY a run
   * cannot be resumed rather than just disabling a button.
   */
  const openedRun = ref<RunSummary | null>(null);
  /** Chains replayed from a checkpoint at the start of this run. They cost nothing to re-obtain,
   *  so they are counted separately from `chainsDone`, which is real simulation. */
  const chainsReplayed = ref(0);

  /**
   * Progress WITHIN the current batch, from the workers' own per-chain heartbeats.
   *
   * `chainsDone` only advances when a whole batch returns, and stage 6's widest sweep is a single
   * ~2200-chain request — so the display could sit motionless for half an hour while everything was
   * healthy. That is precisely what made a real hang invisible: an observed run held the same
   * numbers and the same stale ETA for eight and a half hours and looked no different from a long
   * batch. This moves while the batch runs.
   */
  const batchDone = ref(0);
  const batchTotal = ref(0);

  /**
   * Seconds the browser suspended this tab mid-run — time in which NOTHING progressed.
   *
   * Worth its own readout because it is invisible otherwise and it is the single biggest reason an
   * unattended run comes back with nothing done. Edge's sleeping tabs (and a machine going to
   * sleep) freeze the workers and the page's timers together; the run is not broken, it is simply
   * not running. The panel turns this into the instruction that actually fixes it.
   */
  const suspendedSeconds = ref(0);
  /** The single worst freeze, kept alongside the total: one long stall reads differently from many short ones. */
  const longestStallSeconds = ref(0);
  /** The space an exhaustive run covered, for the submission. Null for every staged run. */
  const searchSpace = ref<SearchSpace | null>(null);

  /**
   * Wall clock around the search, for the submission's run cost.
   *
   * Kept separate from `secondsPerChain`, which is a smoothed live estimate and deliberately
   * forgets the past. These two are the raw bookends, minus whatever `suspendedSeconds` says the
   * browser froze, so a run left in a background tab overnight does not report twelve hours of
   * "compute" it never did.
   */
  const runStartedAt = ref(0);
  const runEndedAt = ref(0);

  /** Minutes actually spent searching, or null when this result did not come from a live run. */
  const runMinutes = computed(() => {
    if (!runStartedAt.value || !runEndedAt.value) return null;
    const elapsed = (runEndedAt.value - runStartedAt.value) / 1000 - suspendedSeconds.value;
    return elapsed > 0 ? elapsed / 60 : null;
  });

  /**
   * What the run cost this machine, for the collector. Null unless a live run finished here:
   * a result replayed from a checkpoint took no time to produce, and reporting that as a fast
   * machine would poison exactly the estimate this exists to improve.
   */
  const runCost = computed(() => {
    const minutes = runMinutes.value;
    if (minutes === null || chainsDone.value <= 0) return null;
    // A carried-on Full sweep's replayed chains took no time here: per chain is over the fresh ones,
    // and a carry-on that priced none has no cost of its own to report.
    const fresh = chainsDone.value - (searchSpace.value ? chainsReplayed.value : 0);
    if (fresh <= 0) return null;
    return {
      workers: averageWorkers.value,
      cores: typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : null,
      minutes,
      suspendedMinutes: suspendedSeconds.value / 60,
      longestStallMinutes: longestStallSeconds.value / 60,
      secondsPerChain: (minutes * 60) / fresh,
    };
  });

  /**
   * Worker-milliseconds spent so far this run, up to `workersChangedAt`. The worker count can change
   * mid-run (the slider stays live), so what a run cost is the TIME-WEIGHTED average, not whatever
   * the slider happened to say at the end: 4 hours on 4 workers and 10 minutes on 16 is a 4.4-worker
   * run, and reporting it as 16 would make this machine look four times slower than it is.
   */
  const workerMs = ref(0);
  const workersChangedAt = ref(0);

  /** Start the worker clock for a run, at the pool's size. */
  function startWorkerClock(): void {
    workerMs.value = 0;
    workersChangedAt.value = Date.now();
  }

  /** Bank the time spent at the old count before switching to a new one. */
  function bankWorkerTime(at = Date.now()): void {
    if (!workersChangedAt.value) return;
    workerMs.value += Math.max(0, at - workersChangedAt.value) * workersInPool.value;
    workersChangedAt.value = at;
  }

  /**
   * The By a date run's own worker clock and count. It used to share the three above with the
   * fastest run, so a By a date run after an unsent fastest result overwrote that result's worker
   * count, which goes to the board in `runCost`.
   */
  const deadlineWorkersInPool = ref(maxPoolSize());
  const deadlineWorkerMs = ref(0);
  const deadlineWorkersChangedAt = ref(0);
  function startDeadlineWorkerClock(): void {
    deadlineWorkerMs.value = 0;
    deadlineWorkersChangedAt.value = Date.now();
  }
  function bankDeadlineWorkerTime(at = Date.now()): void {
    if (!deadlineWorkersChangedAt.value) return;
    deadlineWorkerMs.value += Math.max(0, at - deadlineWorkersChangedAt.value) * deadlineWorkersInPool.value;
    deadlineWorkersChangedAt.value = at;
  }

  /** The run's time-weighted worker count, to one decimal. */
  const averageWorkers = computed(() =>
    timeWeightedWorkers(
      workerMs.value,
      workersChangedAt.value,
      workersInPool.value,
      runStartedAt.value,
      runEndedAt.value || Date.now()
    )
  );

  let pool: ChainSearchPool | null = null;

  /**
   * THE SLIDER STAYS LIVE DURING A RUN (2026-09-24). Moving it resizes the running pool: more workers
   * join from the next batch, and workers above a lower count are let go as soon as they are idle,
   * which gives their cores and memory back without throwing away a chain in progress. The rate
   * measurement is re-based at the change, because a smoothed seconds-per-chain from 4 workers says
   * nothing about 16.
   */
  //
  // Debounced: a slider being dragged from 4 to 16 is one change, not twelve log lines and twelve
  // rate resets.
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  function applyWorkerBudget(): void {
    resizeTimer = null;
    if (!pool || !isRunning.value) return;
    const before = workersInPool.value;
    const after = pool.resize(targetWorkers.value);
    if (after === before) return;
    bankWorkerTime();
    workersInPool.value = after;
    const why = tabHidden.value && backgroundWorkers.value > 0 ? ' (tab in the background)' : '';
    runLog.value.push(`--- workers: ${before} -> ${after}${why}`);
    secondsPerChain.value = 0;
    noteRate(chainsDone.value, true);
  }
  watch(targetWorkers, () => {
    // The deadline search has a pool of its own; the slider and the background-tab throttle reach it
    // too (they used to reach only the fastest-run pool). The guesses per round stay as the run
    // started (deadline.ts `parallel`), so a carry-on still replays; only the workers change.
    if (deadlinePool && deadlineRunning.value) {
      if (deadlineResizeTimer) clearTimeout(deadlineResizeTimer);
      deadlineResizeTimer = setTimeout(() => {
        deadlineResizeTimer = null;
        if (!deadlinePool) return;
        // The worker clock, as for the other runs: what a run cost is its time-weighted worker count.
        const after = deadlinePool.resize(targetWorkers.value);
        if (after !== deadlineWorkersInPool.value) {
          bankDeadlineWorkerTime();
          deadlineWorkersInPool.value = after;
        }
      }, 400);
    }
    if (!pool || !isRunning.value) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyWorkerBudget, 400);
  });
  let deadlinePool: ChainSearchPool | null = null;
  let deadlineResizeTimer: ReturnType<typeof setTimeout> | null = null;

  let lastCheckpointAt = 0;
  let lastRateAt = 0;
  let lastRateChains = 0;
  let partitionHash = '';

  /** Seconds a fresh ascension sat on its first Integrity shift, measured as the last run started
   *  (search/rules.ts). Null until measured, and after a saved run is opened. */
  const integrityWait = ref<number | null>(null);

  /**
   * The integrity check, on the run's own pool before a single chain is priced. False means the run
   * is refused and `error` says why and for how long; a wait past an hour but under a week runs,
   * with the same wording as a note, and flags the result for the flagged board.
   */
  async function checkIntegrity(p: ChainSearchPool): Promise<boolean> {
    stage.value = 'checking this account can build';
    const wait = await p.integrityWait();
    integrityWait.value = wait;
    if (wait === null || wait <= INTEGRITY_WARN_SECONDS) return true;
    if (wait > INTEGRITY_BLOCK_SECONDS) {
      error.value = integrityMessage(wait, cteParts());
      errorBeforeStart.value = true;
      stage.value = 'idle';
      return false;
    }
    runNotes.value = [...runNotes.value, integrityMessage(wait, cteParts())];
    return true;
  }

  /**
   * The same integrity check, run AHEAD of any Start: on one background worker, as soon as a save
   * is loaded, so a stalled account says so the moment the panel opens instead of after the player
   * presses Start and waits for a pool to spin up. Keyed on what changes the answer (account, TE,
   * plan start), so it runs once per loaded account, not on every render. Start still re-checks.
   */
  const integrityChecking = ref(false);
  let integrityKey = '';
  async function probeIntegrity(playerId: string): Promise<void> {
    if (isRunning.value || !playerId || !useInitialStateStore().rawBackup) return;
    const key = `${playerId}|${currentTE.value}|${planStart.value}`;
    if (key === integrityKey) return;
    integrityKey = key;
    integrityWait.value = null;
    integrityChecking.value = true;
    let probe: ChainSearchPool | null = null;
    try {
      probe = await createChainSearchPool(collectInputs(), { size: 1 });
      const wait = await probe.integrityWait();
      if (integrityKey === key) integrityWait.value = wait;
    } catch {
      // Not worth a message: Start runs the same check again and reports properly.
    } finally {
      probe?.terminate();
      if (integrityKey === key) integrityChecking.value = false;
    }
  }

  /**
   * This account's Clothed TE, part by part, for the "can't be planned yet" advice: its best earnings
   * set, colleggtibles, Lab Upgrade and permit, from the save loaded now. Null without a save.
   */
  function cteParts(): CteParts | null {
    const initialStateStore = useInitialStateStore();
    const raw = initialStateStore.rawBackup;
    if (!raw) return null;
    const inv = readInventory();
    // Pending Truth Eggs are claimed at the next ascension -- the fresh one this is about -- so they
    // count. Loading through the planner already rolls them in (and clears them here); any still
    // listed are the ones it didn't, capped at 98 an egg as the roll-up caps them.
    let pending = 0;
    for (const [egg, p] of Object.entries(initialStateStore.initialTePending ?? {}) as [string, number][]) {
      const earned = (initialStateStore.initialTeEarned as Record<string, number>)[egg] ?? 0;
      if (p > 0) pending += Math.max(0, Math.min(98, earned + p) - earned);
    }
    const opts = {
      truthEggs: currentTE.value + pending,
      colleggtibleModifiers: getSimulationContext().colleggtibleModifiers,
      labUpgradeLevel: initialStateStore.epicResearchLevels['cheaper_research'] ?? 0,
      permitLevel: raw.game?.permitLevel ?? null,
    };
    const bare = calculateClothedTEForSet([], opts);
    const total = inv.earnings ? calculateClothedTEForSet(inv.earnings, opts) : bare;
    return {
      total,
      te: currentTE.value,
      pending,
      gear: total - bare,
      colleggtibles: cteFromColleggtibles(opts.colleggtibleModifiers),
      lab: cteFromLabUpgrade(opts.labUpgradeLevel),
      permit: opts.permitLevel === 1 ? 0 : multiplierToTE(0.5),
    };
  }

  /** What the panels show about the integrity check before a run: nothing when healthy. */
  const integrityNotice = computed(() => {
    const wait = integrityWait.value;
    if (wait === null || wait <= INTEGRITY_WARN_SECONDS) return null;
    const blocked = wait > INTEGRITY_BLOCK_SECONDS;
    return { blocked, text: integrityMessage(wait, blocked ? cteParts() : null) };
  });
  const integrityBlocked = computed(() => !!integrityNotice.value?.blocked);
  /** A start refused for the integrity block says exactly what the notice beside every Start already
   *  says; the panels show it once (a player saw the same paragraph twice, one above the other). */
  const errorIsIntegrityNotice = computed(
    () => !!error.value && errorBeforeStart.value && error.value === integrityNotice.value?.text
  );

  /** The player said to run on the older save anyway (see ui.ts `staleBackup`). Kept across a
   *  retry that fails the same way; a different failure asks again. */
  const staleBackupAccepted = ref(false);
  watch(
    () => useUIStore().staleBackup,
    () => (staleBackupAccepted.value = false)
  );
  const staleBackupBlocked = computed(() => !!useUIStore().staleBackup && !staleBackupAccepted.value);

  /** Why a result belongs on the flagged board rather than the main one. */
  function submissionFlags(): SubmissionFlag[] {
    const flags: SubmissionFlag[] = [];
    if ((integrityWait.value ?? 0) > INTEGRITY_WARN_SECONDS) flags.push('integrity-stall');
    if (bestDays.value > DECADES_LONG_DAYS) flags.push('decades-long');
    if (resultIssues.value.some(i => i.level === 'error')) flags.push('contradicts-itself');
    return flags;
  }
  let runFingerprint = '';
  /** Set at the top of `startExhaustive`/`start`, so `noteRate` can persist the first live-measured
   *  rate without every caller having to thread a player ID through it. */
  let currentPlayerId = '';

  /**
   * Recent-weighted s/chain, NOT a lifetime average, and measured per PHASE.
   *
   * Per-chain cost varies by stage rather than randomly: the coarse scan is one wide batch
   * with heavy prefix sharing (~1.5 s/chain measured), descent's early axes simulate every
   * trailing leg and its late axes simulate few (16-25 s/chain). A lifetime average lags
   * every transition.
   *
   * `reset` matters more than it looks. The coarse scan counts 0..372 and the driver then
   * starts its own counter at 1, so without a baseline reset the driver's first sample was
   * charged the WHOLE coarse scan - one observed run reported 552.4 s/chain and "~56d 16h
   * left" for work that actually runs at ~16 s/chain.
   */
  function noteRate(done: number, reset = false): void {
    const now = Date.now();
    if (reset) {
      lastRateAt = now;
      lastRateChains = done;
      return;
    }
    const d = done - lastRateChains;
    if (d <= 0) return;
    const observed = (now - lastRateAt) / 1000 / d;
    const wasUnset = !secondsPerChain.value;
    secondsPerChain.value = secondsPerChain.value
      ? secondsPerChain.value * (1 - RATE_ALPHA) + observed * RATE_ALPHA
      : observed;
    lastRateChains = done;
    lastRateAt = now;
    // The rate is wall-clock per chain WITH this many workers running; the estimate needs both.
    rateWorkers.value = workersInPool.value;

    // The first real measurement for this run beats whatever a pre-run benchmark guessed — record
    // where it came from, and persist it the same way `benchmarkMachine` does, so a live-measured
    // rate also survives a reload rather than only the button's own probe.
    // The chains it was measured on are this batch's (`d`), not `done`: a carried-on run's `done`
    // starts at its replayed chains, and "Measured on this machine · 4,394 chains" counted those.
    if (wasUnset) {
      rateSource.value = 'live';
      benchmarkedAt.value = now;
      benchmarkChainCount.value = d;
      if (currentPlayerId) {
        saveChainBenchmark(currentPlayerId, {
          secondsPerChain: secondsPerChain.value,
          source: 'live',
          at: now,
          chainCount: d,
          workers: workersInPool.value,
          currentTE: currentTE.value,
          finalTE: finalTE.value,
        });
      }
    }
  }

  /**
   * True when a run has finished (or stopped) having simulated chains, and none of them finishes.
   *
   * `bestDays` stays at 0 while nothing has been priced, and a run whose every candidate was
   * rejected never prices anything — so without this the panel would sit on "0.000 d" and look
   * like it was still starting up. It is a real outcome and deserves a real message.
   *
   * Not only a milestone outcome, which is what this first covered: an account whose first leg
   * never finishes building rejects every chain in any space. A run that failed has its own
   * message in `error`, so it is excluded here.
   */
  const noFeasibleChain = computed(
    () => !isRunning.value && !error.value && chainsDone.value > 0 && bestDays.value <= 0
  );

  function noteBatch(done: number, total: number): void {
    batchDone.value = done;
    batchTotal.value = total;
    noteSweepSample();
  }

  /** `[unix ms, fresh chains priced]` for a Full sweep's time left (search/sweepEstimate.ts): fresh is
   *  priced this session, not replayed from a checkpoint, so a carry-on's rate starts from nothing. */
  const sweepChainSamples = ref<[number, number][]>([]);
  function noteSweepSample(): void {
    if (!isRunning.value || !searchSpace.value) return;
    const next = addChainSample(
      sweepChainSamples.value,
      Date.now(),
      chainsDone.value + batchDone.value,
      chainsReplayed.value
    );
    if (next !== sweepChainSamples.value) sweepChainSamples.value = next;
  }
  /**
   * ONE time left for a Full sweep, for its panel's Est. wall clock and the progress bar on every
   * tab: the whole queue's (the chain running and the ones queued after it), over the rate of the
   * chains really priced this session. Null when no Full sweep is running.
   */
  const sweepLeft = computed<SweepTimeLeft | null>(() => {
    const space = searchSpace.value;
    if (!isRunning.value || !space) return null;
    const q = sweepQueue.value;
    const queued = q.at >= 0 && q.counts?.length === q.total && q.ascensions?.length === q.total;
    return sweepTimeLeft({
      samples: sweepChainSamples.value,
      done: chainsDone.value + batchDone.value,
      total: chainsEstimated.value,
      ascensions: space.maxAscensions,
      queue: queued ? { at: q.at, counts: q.counts!, ascensions: q.ascensions! } : null,
    });
  });

  /**
   * Bar fill, 0..1.
   *
   * FULL when the run finished, whatever the counter says. `chainsEstimated` is an UPPER BOUND —
   * coordinate descent stops the moment no checkpoint moves — so a run that starts from an already
   * converged chain legitimately ends after a fraction of it. An observed run showed
   * `DONE  99 / ~606 chains` with the bar at 16%, which reads as "it gave up", when in fact it had
   * finished and simply had nothing left to try.
   */
  const progressFraction = computed(() => {
    if (finishedCleanly.value) return 1;
    if (!chainsEstimated.value) return 0;
    return Math.min(1, chainsDone.value / chainsEstimated.value);
  });

  /** Live remaining-time estimate, seconds. Zero until at least one batch has been timed — an
   *  estimate with no measurement behind it is worse than no estimate. */
  const secondsRemaining = computed(() => {
    if (!secondsPerChain.value) return 0;
    return Math.max(0, chainsEstimated.value - chainsDone.value) * secondsPerChain.value;
  });

  /**
   * The TE every search starts from: the TE of the state the workers PRICE.
   *
   * Workers price from `createBaseEngineState(null)` (engine/adapter.ts), whose `teEarned` is the
   * initial-state store's `initialTeEarned` -- the loaded save, after any pending TE is rolled up.
   * This used to sum the action snapshot instead, and while the planner was rebuilding after a new
   * save landed (`clearAll(_, true)` keeps the old start action; the recalculation is async) the
   * two disagreed: board row 07e3dbf0 said it started from 135 TE and was priced from 196, and got
   * the tier-13 heuristic for a sub-190 start on top. Same store, same sum as `collectInputs`
   * (`pricedTE`), so the number on the screen is the number the run uses.
   */
  const currentTE = computed(() => sumTE(useInitialStateStore().initialTeEarned));

  /**
   * The TE the planner treats as NOW: its initial snapshot (what `setInitialSnapshot` and `importPlan`
   * build from the save), else the start action's end state. Never the last action's: with a plan in
   * the Manual Planner that is the plan's END TE, which is not a fault and must not block a search.
   * Not used for pricing; only compared against the save, to catch a planner that has not caught up
   * with a new save yet (`saveNotReady`): a rebuild in progress, or a reconcile refresh.
   */
  const plannerTE = computed(() => {
    const a = useActionsStore();
    const now = a._initialSnapshot ?? a.actions.find(x => x.type === 'start_ascension')?.endState ?? null;
    return sumTE(now?.teEarned);
  });

  /**
   * The TE the LOADED SAVE reports, as opposed to the TE the search will start from.
   *
   * `currentTE` above sums the action snapshot, which reflects whatever plan or action history is
   * loaded; this sums `initialTeEarned`, which the backup reader writes straight from the save.
   * They are normally the same number twice. When they are not, the search is planning from a
   * different account than the one you are looking at -- see the `te-mismatch` check in
   * search/health.ts, which is the fault that prompted all of this.
   */
  const backupTE = computed(() => sumTE(useInitialStateStore().initialTeEarned));

  /**
   * Why no search may start right now because the save is not settled, or '' when it is.
   *
   * A search reads the save and the planner in one go. While a fresh save is loading (the Auto
   * Planner tab, a Science card link, a new player id, a reconcile refresh) the stores are part
   * old, part new, and a run started then is priced on one save and labelled with another. So every
   * Find waits: while the page is loading, the planner is initialising or recalculating, or the
   * planner's TE still disagrees with the save's by more than the te-mismatch tolerance.
   */
  const saveNotReady = computed(() => {
    const actions = useActionsStore();
    if (useUIStore().loading || actions.isPlanInitializing || actions.isRecalculating || actions.pendingRecalculate) {
      return SAVE_STILL_LOADING;
    }
    if (useInitialStateStore().rawBackup && Math.abs(plannerTE.value - backupTE.value) > TE_MISMATCH_TOLERANCE) {
      return `Your planner (${plannerTE.value} TE) doesn't match your loaded save (${backupTE.value} TE) yet. Wait a moment, or reload your save, then try again.`;
    }
    return '';
  });
  /** Refuse a start while `saveNotReady` says so; true when refused. */
  function refuseUnsettledSave(): boolean {
    const why = saveNotReady.value;
    if (!why) return false;
    error.value = why;
    errorBeforeStart.value = true;
    return true;
  }

  /** Plan start, taken from the Auto Planner tab's own scheduling inputs so the two agree. A plan's
   *  duration depends on (chain, plan start) jointly — comparing chains scored from different
   *  starts is meaningless, which is why the whole run pins one. */
  const planStart = computed(() => {
    if (planStartPin.value) return planStartPin.value;
    return plannerStart.value ?? Math.floor(Date.now() / 1000);
  });

  /** The Auto Planner's own start, or null when it has none (the plan is then timed from now). */
  const plannerStart = computed<number | null>(() => {
    const s = useAutoPlannerStore();
    const tz = s.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!s.startDate || !s.startTime) return null;
    return getLocalTimestampInTimezone(s.startDate, s.startTime, tz);
  });

  /**
   * The plan start a resumed run was priced against, held to the SECOND.
   *
   * The Auto Planner's start boxes only hold minutes, and a run timed "from now" was fingerprinted
   * with seconds, so writing its start back into those boxes could never reproduce the fingerprint.
   * The pin carries the exact value; the boxes are set as well so every panel shows the same start.
   * Dropped the moment the boxes stop holding exactly what `pinPlanStart` wrote -- the player typed
   * or cleared a start, which is a new problem, not the resumed one. Compared as STRINGS, not by
   * reading the boxes back as a time: near a DST change that read-back is off by an hour, which
   * dropped the pin mid-resume and priced half a run from one start and half from another.
   */
  const planStartPin = ref(0);
  let pinnedBoxes: { date: string; time: string } | null = null;
  watch(
    () => [useAutoPlannerStore().startDate, useAutoPlannerStore().startTime] as const,
    ([date, time]) => {
      if (planStartPin.value && (!pinnedBoxes || date !== pinnedBoxes.date || time !== pinnedBoxes.time)) {
        planStartPin.value = 0;
        pinnedBoxes = null;
      }
    }
  );

  /**
   * The first-ascension setting a run from `start` prices under (search/firstAscension.ts): the
   * setting, except that a plan starting more than an hour from now has no ascension of the save's to
   * continue and starts fresh, as Classic offers continue only then. Not for a pinned start: that is
   * a run being carried on, which keeps the setting it was priced under (its stored inputs carry it).
   */
  function firstAscensionFor(start = planStart.value, mode = firstAscension.value): FirstAscension {
    if (planStartPin.value || !continueStartRule.value) return mode;
    return firstAscensionAt(mode, start, Math.floor(Date.now() / 1000));
  }
  /** Whether `firstAscensionFor` applies the one-hour rule. Off only on the command line
   *  (scripts/siteRun.ts), where the same command has to give the same answer whenever it runs. */
  const continueStartRule = ref(true);

  /** Put a run's own plan start back, in the store and in the Auto Planner's boxes. */
  function pinPlanStart(ts: number): void {
    if (!ts || ts === planStart.value) return;
    const planner = useAutoPlannerStore();
    const tz = planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [d, t] = formatInZone(ts, tz).split(' ');
    if (!d || !t) return;
    pinnedBoxes = { date: d, time: t };
    planner.startDate = d;
    planner.startTime = t;
    planStartPin.value = ts;
  }

  /** The run inputs that decide whether a checkpoint can resume -- the fingerprint without its
   *  plan start, which resuming restores. The panels re-check for a resumable run when it moves. */
  const resumeInputsKey = computed(() => withPlanStart(fingerprint(''), 0));

  /** "Plan start goes back to 2026-09-28 22:14" when resuming `fp` would move it, else null. */
  function planStartRestoreNote(fp: string | undefined): string | null {
    const ts = fingerprintPlanStart(fp);
    if (!ts || ts === planStart.value) return null;
    return showDateTime(ts, planTimezone());
  }

  /**
   * True when the Auto Planner has no start date/time and the plan is therefore timed from NOW.
   *
   * Quietly consequential, and it bit a real user twice in one evening. Plan start is part of the
   * run fingerprint, so an unset one moves every time the page reloads: a 778-chain checkpoint
   * became unreachable after a rebuild (start slid from 10:39 to 17:44), and the same chain then
   * reported 737.269 d instead of 737.564 d — not an improvement, just a stopwatch started seven
   * hours later. Both finish on the same instant, which is why the panel tells you to compare
   * finish dates.
   */
  /**
   * The plan start the CURRENT results were computed against, pinned when the run began.
   *
   * Needed because `planStart` falls back to "now" when the Auto Planner has no start set, and the
   * Auto Planner then restores a CACHED start on mount — so the two can silently disagree. Observed:
   * a search ran against Sep 9 19:04 while the plan built from its answer used Sep 3 21:29, six days
   * apart, which makes every date in the built plan answer a different question. `applyChain` pins
   * the planner to this value so the plan is built for the problem the search actually solved.
   */
  const planStartUsed = ref(0);

  /**
   * The settings a run STARTED with, for its record (BobSki's ee34f753, found 5 Oct): the search
   * prices with the inputs snapshotted at its start, but the submission, the recheck and the CSV used
   * to read these live, so switching playing hours off before sending labelled a scheduled run "any
   * time" while its legs carried the waits. Null until a run starts here (a run opened from the
   * library falls back to the live values, which opening it has just set from the run).
   */
  interface RunSettings {
    effort: EffortTier;
    /** As priced: Classic's one-hour rule already applied (`firstAscensionFor`). Saved runs and
     *  answers from before 9 Oct carry `forceContinue` instead; `settingsOf` reads either. */
    firstAscension: FirstAscension;
    availability: Availability | null;
    deferShifts: boolean;
    timeOff: TimeOffDates[];
  }
  const runSettingsUsed = ref<RunSettings | null>(null);
  function snapshotSettings(): RunSettings {
    return {
      effort: effort.value,
      firstAscension: firstAscensionFor(),
      availability: availability.value ? (JSON.parse(JSON.stringify(availability.value)) as Availability) : null,
      deferShifts: deferShifts.value,
      timeOff: JSON.parse(JSON.stringify(timeOff.value)) as TimeOffDates[],
    };
  }
  /** The finished or running search's own settings, else the live ones. */
  const usedSettings = (): RunSettings => runSettingsUsed.value ?? snapshotSettings();
  /** Stored settings (a saved run's, a saved answer's) as RunSettings: ones from before 9 Oct carry
   *  `forceContinue`, true for Continue Asc. and false for Fastest. */
  function settingsOf(st: unknown): RunSettings | null {
    if (!st || typeof st !== 'object') return null;
    const rest = { ...(st as RunSettings & { forceContinue?: boolean }) };
    delete rest.forceContinue;
    return { ...rest, firstAscension: readFirstAscension(st as { forceContinue?: boolean }) };
  }

  const planStartIsNow = computed(() => !planStartPin.value && plannerStart.value === null);

  /** The chain the search starts from: whatever the user has typed in the Auto Planner's Target TE
   *  field. `autoplan.py` reaches its own seed with a coarse subset scan (stage 2, measured 15 min
   *  for 372 chains) plus a ladder check; that stage is NOT ported yet, so the seed comes from the
   *  user instead. See the honesty note in ChainSearchPanel.vue. */
  /** Overrides the Auto Planner's Target TE field. The panel's own "starting chain" box writes
   *  here: it used to be a read-only readout, so the only way to change the seed was to find the
   *  Target TE field in a different card - and a seed of "206 490" cannot reach a 7-prestige
   *  answer, because descent only MOVES checkpoints and the probe adds at most one. */
  const seedOverride = ref('');

  /** The instant answer's fastest route inside the Limits box, as typed checkpoints, or ''. */
  const instantSeed = computed(() => {
    const fit = (instantRoutes.value ?? []).find(
      r => r.length >= minPrestiges.value && r.length <= maxPrestiges.value && r[r.length - 1] === finalTE.value
    );
    return fit ? fit.slice(0, -1).join(' ') : '';
  });

  const seedChain = computed(() => {
    const raw = (seedOverride.value.trim() || instantSeed.value || useAutoPlannerStore().targetTE || '')
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0);
    // A checkpoint at or below current TE is not an ascension anyone can perform, and asking the
    // simulator to reach a target already behind it is what produced the bare "Chain search worker
    // error": the seed box happily held "135" on a 159 TE account.
    const chain = usableCheckpoints(raw, currentTE.value, finalTE.value);
    if (chain.length) return [...chain, finalTE.value];

    // Nothing usable typed. Do NOT fall through to a bare `[finalTE]`: that is a one-ascension
    // chain, descent only moves checkpoints, and the count probe adds at most one, so the Limits
    // box asking for 5-8 could never be satisfied from it. Build a chain of the right length.
    return defaultSeedChain({
      currentTE: currentTE.value,
      finalTE: finalTE.value,
      minPrestiges: minPrestiges.value,
      maxPrestiges: maxPrestiges.value,
    });
  });

  /**
   * True when what was typed is nothing but the final target (or beyond it): a single ascension
   * straight to the end, which is not a chain to search. The seed builder above would quietly swap
   * in a chain of its own, so the run searched something nobody asked for; now the panel refuses
   * and points at the classic Auto-AP, which plans exactly that one ascension.
   */
  const singleAscensionAsked = computed(() => {
    const raw = (seedOverride.value.trim() || useAutoPlannerStore().targetTE || '')
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0);
    // "Find a starting chain for me" ignores what was typed, so there is nothing to refuse then.
    return !findSeedFirst.value && raw.length > 0 && raw.every(n => n >= finalTE.value);
  });

  /** Said when the typed starting chain was not in ascending order or repeated a value: the search
   *  sorts it and drops the repeats, and a seed it quietly rearranged is not the one typed. */
  const seedTidyNote = computed(() => {
    if (findSeedFirst.value) return '';
    const raw = (seedOverride.value.trim() || useAutoPlannerStore().targetTE || '')
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0);
    if (!seedTidied(raw, currentTE.value, finalTE.value)) return '';
    const chain = usableCheckpoints(raw, currentTE.value, finalTE.value);
    return `Your starting chain wasn't in order, or repeated a value, so it was sorted and the repeats dropped. It starts from ${[...chain, finalTE.value].join(' ')}.`;
  });

  /** Why the current seed cannot produce an answer inside the Limits box, or null when it can.
   *  Probe-aware: on Fast nothing in the run changes the seed's length at all. */
  const seedIssue = computed(() =>
    findSeedFirst.value
      ? null
      : seedChainIssue(seedChain.value, minPrestiges.value, maxPrestiges.value, {
          countProbe: EFFORT[effort.value].countProbe,
        })
  );

  /**
   * The saved run library. Separate from `resumable`, which is one crash-recovery slot tied to an
   * exact fingerprint; these are kept deliberately and reload at any time. See search/runLibrary.ts.
   */
  const savedRuns = ref<RunSummary[]>([]);

  async function refreshSavedRuns(playerId: string): Promise<void> {
    savedRuns.value = await listRuns(await hashID(playerId));
  }

  async function saveCurrentRun(playerId: string, label?: string): Promise<RunSummary | null> {
    if (!bestChain.value.length || bestDays.value <= 0) return null;
    const summary = await saveRun(await hashID(playerId), {
      label: label?.trim() || defaultRunLabel(finalTE.value, bestChain.value, bestDays.value),
      currentTE: runTEUsed ?? currentTE.value,
      // The run's own target -- its chain ends there -- not the target box as it reads now, which the
      // player may have changed since the run finished.
      finalTE: bestChain.value[bestChain.value.length - 1] ?? finalTE.value,
      effort: effort.value,
      seedChain: seedChain.value,
      bestChain: bestChain.value,
      bestDays: bestDays.value,
      entries: allEntries(),
      bestLegs: bestLegs.value,
      runLog: runLog.value,
      complete: finishedCleanly.value,
      // What it was searching and under what inputs. Without these a saved run can be LOOKED AT and
      // not picked back up -- which is how an interrupted overnight run became an afternoon of
      // re-pricing chains that were already sitting in the file.
      ...(searchSpace.value ? { space: searchSpace.value } : {}),
      ...(runNoteUsed ? { runNote: runNoteUsed } : {}),
      settings: usedSettings() as RunSummary['settings'],
      // An opened saved run keeps ITS identity; anything else is the run that just ran.
      fingerprint: openedRun.value?.fingerprint ?? (runFingerprint || fingerprint(playerId)),
      ...((openedRun.value ? openedRun.value.inputsKey : runInputsKey)
        ? { inputsKey: openedRun.value ? openedRun.value.inputsKey : runInputsKey }
        : {}),
    });
    await refreshSavedRuns(playerId);
    return summary;
  }

  /**
   * Reload a saved run into the panel as a finished result.
   *
   * Does NOT restart anything: the cache, the best chain and the log are restored and the panel
   * renders them exactly as it would at the end of the run that produced them. The shape chart and
   * the runners-up read the same cache, so both come back too.
   */
  async function openSavedRun(playerId: string, id: string): Promise<boolean> {
    // Recorded here as well as when a run starts. `resumeBlocker` compares the saved run's
    // fingerprint against the CURRENT inputs, and it needs a player id to compute one -- without
    // this it had none until a search had already run, so the guard silently passed and a run whose
    // plan start had since moved looked perfectly resumable. Measured: changing the start date
    // after opening a saved run left `canResumeOpenedRun` true.
    currentPlayerId = playerId;
    const summary = savedRuns.value.find(r => r.id === id);
    const body = await loadRun(await hashID(playerId), id);
    if (!summary || !body) return false;
    // Another run on screen: sending it must not replace the last run's best so far.
    setProvisional('fastest', null);

    resetChartData();
    liveCache = body.entries;
    coarseCache = [];
    // Restored so the panel can say what this run covered, and so Resume has a space to hand back
    // to `startExhaustive`. Absent on a staged run and on anything saved before library version 2.
    searchSpace.value = summary.space ? { ...summary.space } : null;
    runSweepTag = null;
    // Its own settings, so sending or downloading it after opening labels it with them (older saved
    // runs carry none and fall back to Your setup as it is now), never the last search's.
    runSettingsUsed.value = settingsOf(summary.settings);
    // Its own save's moment and TE when that save is still kept, so re-sending an opened run is not
    // filed as a what-if against whichever newer save the tab holds now (the rest of the account
    // fields still come from the loaded save; the gear rarely changes between the two).
    {
      const own = runSaveFor(summary.inputsKey);
      runBackupUsed = null;
      runTEUsed = summary.currentTE;
      accountUsed = own?.backupAt
        ? { ...accountFields(summary.currentTE), backupTime: own.backupAt, backupTE: own.te }
        : null;
    }
    runNoteUsed = summary.runNote;
    runNote.value = summary.runNote ?? '';
    integrityWait.value = null;
    openedRun.value = summary;
    // Its own start, for "Build this plan": that pins the planner to `planStartUsed`, which still
    // held whichever run last went in this tab. Unknown (no fingerprint): don't pin at all.
    planStartUsed.value = fingerprintPlanStart(summary.fingerprint) ?? 0;
    // Banners about the PREVIOUS results (a carry-on on an older save, its re-check) don't apply.
    resultsFromOlderSave.value = null;
    latestRecheck.value = null;
    bestChain.value = [...summary.bestChain];
    bestDays.value = summary.bestDays;
    bestLegs.value = body.bestLegs;
    runLog.value = [...body.runLog];
    chainsDone.value = body.entries.length;
    chainsEstimated.value = body.entries.length;
    csvRows.value = body.entries.length;
    error.value = null;
    errorBeforeStart.value = false;
    stoppedEarly.value = !summary.complete;
    stage.value = summary.complete ? 'done' : 'stopped';
    // A reloaded run took no time HERE, so its cost is not this machine's and must not be submitted
    // as though it were.
    runStartedAt.value = 0;
    runEndedAt.value = 0;
    refreshShortlist(true);
    return true;
  }

  /**
   * An interrupted exhaustive run this machine can carry straight on with.
   *
   * `resumable` is the raw checkpoint; this is the narrower question the panel asks: is there one,
   * did it not finish, and does it know what it was searching. The last part is what a checkpoint
   * written before `space` existed cannot answer -- it still replays if you happen to set up the
   * identical space by hand, but it cannot offer to do it for you.
   */
  const crashedRun = computed(() => {
    const cp = resumable.value;
    return cp && !cp.complete && cp.space ? cp : null;
  });

  /**
   * Put a run's settings back from its fingerprint: target, keep going, schedule (hours, days,
   * timezone, shift holding), milestones and time off. What carrying on needs so the player does
   * not have to set everything up again from memory.
   */
  function applyRunSettings(fp: string): void {
    const set = fingerprintSettings(fp);
    if (!set) return;
    finalTE.value = set.final;
    setFirstAscension(set.firstAscension);
    const planner = useAutoPlannerStore();
    if (set.availability) {
      scheduleEnabled.value = true;
      availableFrom.value = set.availability.fromHour;
      availableTo.value = set.availability.toHour;
      // As the run had them, none ticked included: filling in all seven fingerprints as a different
      // schedule (`avail0123456` against `availall`) and the carry-on was refused for it.
      availableDays.value = [...set.availability.days];
      if (set.availability.timezone && planner.timezone !== set.availability.timezone) {
        planner.timezone = set.availability.timezone;
      }
      if (set.deferShifts !== null) deferShifts.value = set.deferShifts;
    } else {
      scheduleEnabled.value = false;
    }
    milestones.value = set.milestones.map(m => ({ ...m }));
    const tz = planTimezone();
    timeOff.value = set.timeOff.map(w => ({
      from: formatInZone(w.from, tz).slice(0, 10),
      // Windows end at the start of the day after the last one away.
      to: formatInZone(w.to - 1, tz).slice(0, 10),
    }));
  }

  /** "Carrying on puts back: the final target; the time off" -- what a resume would change, if anything. */
  function settingsRestoreNote(fp: string | undefined): string {
    if (!fp || !currentPlayerId) return '';
    const changes = fingerprintChanges(fp, fingerprint(currentPlayerId)).filter(c => !c.startsWith('TE was'));
    return changes.length ? changes.join('; ') : '';
  }

  /**
   * Get a run ready to carry on, and return the exact inputs its workers should be given.
   *
   * With its save kept, the workers get that stored payload itself, so the carried-on half is priced
   * on precisely the farm the first half was. The planner is switched to that save as well, so
   * everything that describes the run -- the CSV header, the submission, Apply -- describes the same
   * save; target, shift handling and plan start are put back from it too.
   *
   * Without one (a run from before saves were kept, or a body that did not survive), it falls back
   * to the old rule: carry on onto the CURRENT save only if it still matches, under the run's clock.
   *
   * Returns the inputs, 'current' to carry on with the current save, or null (with `error` set) to
   * stop. The settings a save does not carry are checked BEFORE anything is switched, so a refusal
   * never leaves the planner quietly sitting on an older save.
   */
  async function prepareToCarryOn(
    playerId: string,
    record: { fingerprint?: string; inputsKey?: string; runNote?: string; provisional?: unknown }
  ): Promise<SearchInputs | 'current' | null> {
    // The run's own note comes back with it (the box is what the carried-on run captures).
    if (record.runNote !== undefined) runNote.value = record.runNote;
    // And its best so far on the board, which its final send must still replace (taken at its start).
    carriedProvisional = readProvisionalRow(record.provisional);
    partitionHash = partitionHash || (await hashID(playerId));
    // Never another account's run, whatever the player id says (see `accountOf`).
    if (await fromOtherAccount(partitionHash, record.inputsKey)) {
      error.value = `This run can't carry on: ${OTHER_ACCOUNT}.`;
      return null;
    }
    const inputs =
      record.inputsKey && runSaveFor(record.inputsKey) ? await loadRunInputs(partitionHash, record.inputsKey) : null;

    if (!inputs?.context?.rawBackup) {
      // No stored save: it can only carry on with the current one, so the TE must still match. The
      // settings it can put back itself.
      const locked = record.fingerprint ? lockedChanges(record.fingerprint, fingerprint(playerId)) : [];
      if (locked.length) {
        error.value = `This run's save isn't stored on this device, and ${locked.join('; ')}, so it can't carry on.`;
        return null;
      }
      if (record.fingerprint) applyRunSettings(record.fingerprint);
      const ts = fingerprintPlanStart(record.fingerprint);
      if (ts) pinPlanStart(ts);
      return 'current';
    }

    // The settings the save does not carry -- schedule, time off, milestones, target -- put back
    // from the run's own fingerprint, rather than asking the player to re-enter them.
    if (record.fingerprint) applyRunSettings(record.fingerprint);

    const stored = inputs.context.rawBackup as { approxTime?: number };
    const loaded = useInitialStateStore().rawBackup as { approxTime?: number } | null;
    // Already on that very save (a reload with nothing new synced): nothing to switch.
    const sameSave = !!loaded && loaded.approxTime === stored.approxTime && currentTE.value === inputs.currentTE;
    if (!sameSave) {
      try {
        // Loaded on demand: it pulls in the whole save loader, which only a carry-on needs.
        const { initPlanFuture } = await import('@/lib/modes/planFuture');
        await initPlanFuture(playerId, inputs.context.rawBackup);
      } catch (e) {
        error.value = `This run's stored save could not be loaded (${describeRunError(e)}). Reload your save and start again.`;
        return null;
      }
    }
    finalTE.value = inputs.final;
    // The run's own setting, from the inputs it was priced with: one started as forceContinue true
    // (before 9 Oct) carries on as Continue Asc., never as today's default.
    setFirstAscension(readFirstAscension(inputs));
    if (typeof inputs.deferShifts === 'boolean') deferShifts.value = inputs.deferShifts;
    pinPlanStart(inputs.planStart);
    const left = record.fingerprint ? settingsChanges(record.fingerprint, fingerprint(playerId)) : [];
    if (left.length) {
      // Should not happen now that the settings are put back; says which if it ever does.
      error.value = `Couldn't put this run's settings back exactly (${left.join('; ')}). Check them and try again.`;
      return null;
    }

    if (!sameSave) {
      const backupAt = runSaveFor(record.inputsKey)?.backupAt ?? stored.approxTime ?? 0;
      const ui = useUIStore();
      ui.runSaveLoaded = { te: inputs.currentTE, backupAt };
      // Deliberately older, not stale: the notice for this case is `runSaveLoaded`.
      ui.staleBackup = null;
      ownSaveBackup = toRaw(useInitialStateStore().rawBackup);
      resultsFromOlderSave.value = { te: inputs.currentTE, backupAt, planStart: inputs.planStart };
      latestRecheck.value = null;
    }
    return inputs;
  }

  /** Carry on an interrupted run from its checkpoint. The durations replay inside
   *  `startExhaustive`; this only has to hand back the space the checkpoint recorded. */
  async function resumeCrashedRun(playerId: string): Promise<boolean> {
    const cp = crashedRun.value;
    const sp = cp?.space;
    if (!cp || !sp || busy.value) return false;
    carryOnCount++;
    preparing.value = true;
    let own: SearchInputs | 'current' | null;
    try {
      own = await prepareToCarryOn(playerId, cp);
    } finally {
      preparing.value = false;
    }
    if (!own) return false;
    await startExhaustive(
      playerId,
      {
        lo: sp.range?.lo ?? 0,
        hi: sp.range?.hi ?? 0,
        step: sp.range?.step ?? 1,
        minAsc: sp.minAscensions,
        maxAsc: sp.maxAscensions,
        minGap: sp.minGap,
        ...(sp.mode === 'bands' && sp.bands?.length ? { bands: sp.bands.map(b => [...b]) } : {}),
      },
      { own: own === 'current' ? undefined : own }
    );
    return true;
  }

  /**
   * Why the loaded run can or cannot be continued, in a form the panel can print.
   *
   * Three separate reasons, kept separate on purpose. "Finished" and "saved before this was
   * possible" and "your settings have changed since" are different situations with different
   * answers, and collapsing them into a disabled button teaches the player nothing.
   */
  const resumeBlocker = computed<string | null>(() => {
    const run = openedRun.value;
    if (!run) return 'no run is loaded';
    if (run.complete) return 'this run finished, so there is nothing left to price';
    if (!run.space) {
      return 'this run was saved before the space was recorded, so there is nothing to continue from. Set the same bands and start again, and anything it already priced will be replayed';
    }
    if (!currentPlayerId) return 'no player id, so there is no way to check the run is still valid';
    // With its own save stored, the run carries on with that save, not the current one; only the
    // settings a save does not carry can stop it.
    if (runSaveFor(run.inputsKey)) {
      const locked = run.fingerprint ? lockedChanges(run.fingerprint, fingerprint(currentPlayerId)) : [];
      return locked.filter(c => !c.startsWith('TE was')).join('; ') || null;
    }
    if (run.fingerprint) {
      // Settings are put back on resume; only a different player or TE stops a run with no save.
      const locked = lockedChanges(run.fingerprint, fingerprint(currentPlayerId));
      if (!locked.length) return null;
      // The plan start is NOT a reason: resuming puts the run's own start back (`resumeOpenedRun`).
      // It used to be the commonest one -- with no start set, the plan is timed from the moment the
      // page loaded, so every reload "changed" it and no interrupted run could ever be picked up.
      return `${locked.join('; ')}, and its save isn't stored, so its durations describe a different farm. If a number looks wrong, your backup may not have loaded fresh: reload it and check. Otherwise start a new run`;
    }
    return null;
  });

  const canResumeOpenedRun = computed(() => resumeBlocker.value === null);

  /**
   * Continue an unfinished saved run where it stopped.
   *
   * The entries are already in `liveCache` from `openSavedRun`; `startExhaustive` replays anything
   * it finds there whose key is in the space, so this only has to hand back the SAME space the run
   * was enumerating. Handing back the panel's current form instead would be a different search that
   * happened to reuse a cache.
   */
  async function resumeOpenedRun(playerId: string): Promise<boolean> {
    const run = openedRun.value;
    if (!run?.space || !canResumeOpenedRun.value) return false;
    const sp = run.space;
    if (busy.value) return false;
    carryOnCount++;
    preparing.value = true;
    let own: SearchInputs | 'current' | null;
    try {
      own = await prepareToCarryOn(playerId, run);
    } finally {
      preparing.value = false;
    }
    if (!own) return false;
    await startExhaustive(
      playerId,
      {
        lo: sp.range?.lo ?? 0,
        hi: sp.range?.hi ?? 0,
        step: sp.range?.step ?? 1,
        minAsc: sp.minAscensions,
        maxAsc: sp.maxAscensions,
        minGap: sp.minGap,
        ...(sp.mode === 'bands' && sp.bands?.length ? { bands: sp.bands.map(b => [...b]) } : {}),
      },
      { own: own === 'current' ? undefined : own }
    );
    return true;
  }

  async function deleteSavedRun(playerId: string, id: string): Promise<void> {
    await deleteRun(await hashID(playerId), id);
    await refreshSavedRuns(playerId);
  }

  /** Rewrite the seed box so the chain sits inside the Limits box. Drives the panel's one-click fix. */
  function fitSeedToLimitsNow(): void {
    seedOverride.value = fitSeedToLimits(seedChain.value, minPrestiges.value, maxPrestiges.value)
      .slice(0, -1)
      .join(' ');
  }

  /** Chains the coarse scan will price, or 0 when it is not going to run. */
  const coarseChains = computed(() => {
    if (!findSeedFirst.value) return 0;
    try {
      return planCoarseGrid({
        currentTE: currentTE.value,
        final: finalTE.value,
        minPrestiges: minPrestiges.value,
        maxPrestiges: maxPrestiges.value,
      }).chains;
    } catch {
      return 0; // no room for a grid; findStartingChain will report it properly
    }
  });

  /** An UPPER BOUND, not a target. Descent stops when no axis moves, so a run routinely
   *  finishes well short of this - one measured run ended at 483 of an estimated 606. The
   *  coarse scan is added when it is enabled: without it the estimate was derived from the
   *  chain typed into Target TE and read "~101" for a run about to price 372 in stage 2. */
  const estimateForCurrentSettings = computed(() => {
    // With the coarse scan on, the post-scan chain length is what stages 4+ work on, and
    // that is the scan's ladder pick - unknown up front. Its own grid spans 5-8 prestiges,
    // so price stages 4+ against the middle of that rather than the typed chain.
    const n = findSeedFirst.value ? 6 : Math.max(1, seedChain.value.length - 1);
    return coarseChains.value + estimateChains(n, EFFORT[effort.value]);
  });

  function fingerprint(playerId: string): string {
    return fingerprintRun({
      playerId,
      planStart: planStart.value,
      currentTE: currentTE.value,
      final: finalTE.value,
      firstAscension: firstAscensionFor(),
      availability: availability.value,
      milestones: activeMilestones.value,
      deferShifts: deferShifts.value,
      timeOff: timeOffWindows(timeOff.value, planTimezone()),
    });
  }

  /** Drop stored saves nothing unfinished refers to: the checkpoint slot, the moved-aside runs, the
   *  saved runs, and the run in progress. They exist only to finish a run. */
  async function pruneSaves(slot: SearchCheckpoint | null, hash = partitionHash): Promise<void> {
    // One player's partition throughout, fixed at the call: `partitionHash` is store-wide, and a
    // player switch during these awaits used to build the keep-list from one player's runs and prune
    // the other's saves with it.
    const keep = new Set<string>();
    if (runInputsKey) keep.add(runInputsKey);
    if (slot && !slot.complete && slot.inputsKey) keep.add(slot.inputsKey);
    try {
      for (const r of await listInterrupted(hash)) if (r.inputsKey) keep.add(r.inputsKey);
      const dl = await loadDeadlineCheckpoint(hash);
      if (dl) keep.add(dl.inputsKey);
      // Read here rather than from `savedRuns`, which a panel may not have loaded yet -- pruning
      // against an empty list would delete the saves of every unfinished saved run.
      for (const r of await listRuns(hash)) if (!r.complete && r.inputsKey) keep.add(r.inputsKey);
      await pruneRunSaves(hash, keep);
      const list = await listRunSaves(hash);
      if (hash === partitionHash) runSaves.value = list;
    } catch (e) {
      console.warn('chain search: could not tidy stored saves', e);
    }
  }

  /**
   * Put a moved-aside run back in the checkpoint slot, ready to carry on. The unfinished run in the
   * slot now is moved aside in its place, so nothing is lost either way.
   */
  async function promoteInterrupted(playerId: string, index: number): Promise<boolean> {
    partitionHash = partitionHash || (await hashID(playerId));
    const picked = await restoreInterrupted(partitionHash, index);
    await checkResumable(playerId);
    return !!picked && !!resumable.value;
  }

  async function discardInterruptedRun(playerId: string, index: number): Promise<void> {
    partitionHash = partitionHash || (await hashID(playerId));
    await discardInterrupted(partitionHash, index);
    await checkResumable(playerId);
  }

  /** Look for a resumable checkpoint for the current inputs, and refresh the moved-aside list and
   *  the stored saves. Safe to call whenever the panel opens or the settings change. */
  /**
   * Stored saves' accounts, by key: read from the index when it has one, else once from the stored
   * save itself (older saves were written before the index kept it).
   */
  const accountByKey = new Map<string, string>();
  async function savedAccount(hash: string, key: string | null | undefined): Promise<string> {
    if (!key) return '';
    const listed = runSaves.value.find(r => r.key === key)?.account;
    if (listed) return listed;
    const held = accountByKey.get(key);
    if (held !== undefined) return held;
    let account = '';
    try {
      const inputs = await loadRunInputs(hash, key);
      account = inputs ? accountOf(inputs.context.rawBackup) : '';
    } catch {
      // unreadable: unknown, which does not block
    }
    accountByKey.set(key, account);
    return account;
  }
  /** A run whose stored save is another account's than the one loaded now. Unknown never counts. */
  async function fromOtherAccount(hash: string, key: string | null | undefined): Promise<boolean> {
    const now = accountOf(useInitialStateStore().rawBackup);
    if (!now || !key) return false;
    const then = await savedAccount(hash, key);
    return !!then && then !== now;
  }
  /** Stored-save keys of unfinished runs that belong to another account: never offered here. */
  const otherAccountKeys = shallowRef<Set<string>>(new Set());
  const OTHER_ACCOUNT = 'it was started on a different account (the save loaded now is another account)';

  async function checkResumable(playerId: string): Promise<void> {
    // Recorded here too: the panels' "puts your settings back" note compares against this player.
    if (playerId) currentPlayerId = playerId;
    void refreshRunElsewhere();
    resumable.value = null;
    blockedCheckpoint.value = null;
    if (!playerId) return;
    try {
      const hash = await hashID(playerId);
      partitionHash = hash;
      // Matched on everything EXCEPT the plan start, which resuming restores. An exact match here
      // meant a run timed "from now" was unreachable after any reload -- a crash included.
      const saves = await listRunSaves(hash);
      const aside = await listInterrupted(hash);
      const cp = await loadAnyCheckpoint(hash);
      // Another player's check started meanwhile: its answer is the one that counts.
      if (currentPlayerId !== playerId) return;
      runSaves.value = saves;
      // Whose runs these are, against the save loaded now (see `accountOf`).
      const other = new Set<string>();
      for (const r of [...(cp ? [cp] : []), ...aside])
        if (r.inputsKey && (await fromOtherAccount(hash, r.inputsKey))) other.add(r.inputsKey);
      if (currentPlayerId !== playerId) return;
      otherAccountKeys.value = other;
      interrupted.value = aside;
      if (cp && cp.inputsKey && other.has(cp.inputsKey)) {
        // Someone else's run: not this account's business, so nothing is shown for it at all.
      } else if (cp) {
        // A run with its own save carries on with that save, whatever is loaded now: only the
        // settings a save does not carry can stop it.
        // Settings never block: carrying on puts them back. Only a different player, or a
        // different TE with no stored save to go back to, can stop it.
        const own = !cp.complete && !!runSaveFor(cp.inputsKey);
        const locked = lockedChanges(cp.fingerprint, fingerprint(playerId));
        const changes = own ? locked.filter(c => !c.startsWith('TE was')) : locked;
        if (!changes.length) resumable.value = cp;
        else if (!cp.complete) blockedCheckpoint.value = { record: cp, changes };
      }
      await pruneSaves(cp, hash);
    } catch (e) {
      // A missing/blocked IndexedDB must not stop somebody running a search.
      console.warn('chain search: could not read checkpoint', e);
    }
  }

  /** Build the payload every worker is initialised with. Everything Pinia here, nothing beyond. */
  /**
   * Check the inputs a run is about to be initialised with, not the stores it could read later.
   *
   * Called with the object that actually goes to the workers. See `reviewContext`: when a backup is
   * still loading, this is the only place the incompleteness is visible -- every other diagnostic
   * re-reads the stores afterwards and sees a correct copy.
   */
  function reviewRunInputs(inputs: SearchInputs): HealthIssue[] {
    return reviewContext({
      hasBackup: !!inputs.context.rawBackup,
      hasFarmState: !!inputs.currentFarmState,
      // Read off the save itself, so a missing farm state can be told apart: still loading (the save
      // has a virtue farm, it just is not parsed yet) versus nothing to load (the save is on the home
      // farm or a contract, and waiting will never fix it).
      backupHasVirtueFarm: (inputs.context.rawBackup?.farms ?? []).some(
        (f: { eggType?: number | null }) => typeof f.eggType === 'number' && f.eggType >= 50 && f.eggType <= 54
      ),
      epicResearchCount: Object.keys(inputs.context.epicResearchLevels ?? {}).length,
    });
  }

  /**
   * Everything the run was GIVEN, as JSON, for diagnosing a result that looks wrong.
   *
   * WHY THE CSV IS NOT ENOUGH, and this is the whole reason it exists: the CSV is the run's OUTPUT.
   * It records what came out leg by leg, and its header re-reads the stores at export time -- which
   * is why a header can list a full inventory for a run that was handed nothing. Every diagnostic
   * so far has had that flaw. This dumps the INPUT side instead, captured from the same
   * `collectInputs()` object the worker pool is built from.
   *
   * THE RAW BACKUP IS NOT IN IT. It is megabytes, and it is the player's whole save; what matters
   * for this is the handful of derived numbers the simulator actually reads, all of which are here.
   * The player id is scrubbed for the same reason the submission scrubs it.
   */
  function buildRunDiagnostics(): string {
    const inputs = collectInputs();
    const ctx = inputs.context;
    const backup = ctx.rawBackup as
      | { approxTime?: number; userName?: string; virtue?: { eovEarned?: number[] } }
      | undefined;
    const inv = readInventory();
    return scrubIdentifiers(
      JSON.stringify(
        {
          note: 'Inputs handed to the chain-search workers. Output side is the CSV.',
          takenAt: new Date().toISOString(),
          backup: {
            present: !!backup,
            userName: backup?.userName,
            approxTime: backup?.approxTime,
            approxTimeISO: backup?.approxTime ? new Date(backup.approxTime * 1000).toISOString() : null,
            ageMinutes: backup?.approxTime ? Math.round((Date.now() / 1000 - backup.approxTime) / 60) : null,
            // The field every TE figure ultimately comes from. When a plan looks too long, this is
            // the first number to check against the game itself.
            eovEarned: backup?.virtue?.eovEarned ?? null,
            eovEarnedSum: (backup?.virtue?.eovEarned ?? []).reduce((a, b) => a + (b || 0), 0),
          },
          te: {
            searchStartsFrom: inputs.currentTE,
            initialTeEarned: { ...useInitialStateStore().initialTeEarned },
            target: inputs.final,
          },
          context: {
            epicResearchCount: Object.keys(ctx.epicResearchLevels ?? {}).length,
            epicResearchLevels: ctx.epicResearchLevels,
            colleggtibleModifiers: ctx.colleggtibleModifiers,
            assumeDoubleEarnings: ctx.assumeDoubleEarnings,
            deferForEarningsMode: ctx.deferForEarningsMode,
            ascensionStartTime: ctx.ascensionStartTime,
            planStartOffset: ctx.planStartOffset,
          },
          farmState: { present: !!inputs.currentFarmState },
          soulEggs: useInitialStateStore().soulEggs,
          loadout: {
            artifactCount: inv.artifacts.length,
            stoneCount: inv.stones.reduce((n, x) => n + x.count, 0),
            delivery: describeLoadoutSlots(inv.elr),
            earnings: describeLoadoutSlots(inv.earnings),
          },
          schedule: {
            planStart: inputs.planStart,
            planStartISO: new Date(inputs.planStart * 1000).toISOString(),
            availability: inputs.availability,
            deferShifts: inputs.deferShifts,
            firstAscension: readFirstAscension(inputs),
          },
          health: { setup: setupIssues.value, context: reviewRunInputs(inputs), result: resultIssues.value },
          result: bestChain.value.length
            ? {
                chain: [...bestChain.value],
                days: bestDays.value,
                legs: bestLegs.value.map((l, i) => ({
                  leg: i + 1,
                  endTE: l.endTE,
                  strategy: l.key,
                  tier13: l.tier13Unlocked,
                  days: l.durationSeconds / 86400,
                  peakDeliveryQph: (l.maxELR * 3600) / 1e15,
                })),
              }
            : null,
        },
        null,
        2
      )
    );
  }

  function collectInputs(): SearchInputs {
    const initialStateStore = useInitialStateStore();
    const baseState = createBaseEngineState(null);
    return {
      context: getSimulationContext(),
      baseState,
      currentFarmState: initialStateStore.currentFarmState,
      planStart: planStart.value,
      // From the state the workers price, never from a second source (see `currentTE`).
      currentTE: pricedTE(baseState),
      final: finalTE.value,
      firstAscension: firstAscensionFor(),
      availability: availability.value,
      milestones: activeMilestones.value,
      deferShifts: deferShifts.value,
      timeOff: timeOffWindows(timeOff.value, planTimezone()),
    };
  }

  /** The zone every date in the plan is read in: the planner's own setting, else this machine's. */
  function planTimezone(): string {
    return useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * The full cache, per-leg detail included, kept for the CSV export.
   *
   * A plain `let`, NOT a ref. This is thousands of entries with a leg array each, and wrapping it
   * in Vue's reactivity would deep-proxy the lot on every batch for data no template reads —
   * `csvRows` is the only thing the UI needs to know, and that is one number.
   */
  let liveCache: CacheEntry[] = [];
  /** The coarse scan's own results. Kept SEPARATELY because they never enter the driver's cache —
   *  stage 2 evaluates through the pool directly — so `liveCache` would otherwise replace them and
   *  the export would be missing the several hundred chains the scan priced. */
  let coarseCache: CacheEntry[] = [];
  const csvRows = ref(0);

  /**
   * The runners-up, recomputed on a timer rather than per batch.
   *
   * `pickShortlist` walks the whole cache, and `onCache` fires after every batch with thousands of
   * entries — recomputing there would put an O(n log n) pass plus a reactive write on the hot path
   * for a table nobody is watching second by second. Refreshed on the same beat as the checkpoint.
   */
  const shortlist = ref<ShortlistRow[]>([]);
  let lastShortlistAt = 0;

  /** Which preset view the runners-up table is showing. Persisted for the session only: it is a
   *  way of looking at one run's results, not a setting that should outlive the run. */
  const shortlistView = ref<ViewId>('balanced');

  /**
   * Every chain this run priced, flattened for the shape chart.
   *
   * Refreshed on the shortlist's beat rather than per batch for the same reason it is: `onCache`
   * fires with the whole cache after every batch, and a reactive write of thousands of points on
   * that path would cost more than the chart is worth.
   */
  //
  // A shallowRef holding a markRaw array: on a full sweep this is 100,000+ objects, and a plain ref
  // made every one of them (and its chain array) a reactive proxy the moment the chart read it.
  // Above CHART_AUTO_LIMIT it is left EMPTY until someone presses "Draw the charts" (`drawCharts`),
  // so a big run holds no second copy of its results for a chart nobody asked for.
  const pricedChains = shallowRef<PricedChain[]>(markRaw([]));
  /** How many chains have a duration. The panels test this, not `pricedChains.length`. */
  const pricedCount = ref(0);
  /** Set by "Draw the charts" on a big run; cleared when a new run starts. */
  const chartsWanted = ref(false);

  /**
   * Whether the player has the chart open. Hidden by default and remembered per browser. While it
   * is hidden NOTHING for the chart is built: no heat-map counts, no snapshot, no point list.
   * `pricedCount` (which the panels test) and the shortlist do not depend on any of it.
   */
  const chartShown = ref(loadChartShown());

  /**
   * The heat map's running counts (lib/chartThin.ts): a fixed grid fed only the chains priced since
   * the last feed, so it costs the same on a 100-chain run and a 120,000-chain one. `heat` is the
   * copy the chart draws, taken on the same 30-second beat as everything else here.
   */
  let heatGrid = createHeat();
  let heatFedLive = 0;
  let heatFedCoarse = 0;
  const heat = shallowRef<HeatSnapshot | null>(null);

  /** Forget the chart data: a new run, or a saved one opened. */
  function resetChartData(): void {
    heatGrid = createHeat();
    heatFedLive = 0;
    heatFedCoarse = 0;
    heat.value = null;
    pricedChains.value = markRaw([]);
    pricedCount.value = 0;
    chartsWanted.value = false;
  }

  /** Open or close the chart. Opening builds it from everything priced so far; closing frees it. */
  function setChartShown(on: boolean): void {
    if (chartShown.value === on) return;
    chartShown.value = on;
    saveChartShown(on);
    if (on) {
      refreshChartData();
    } else {
      heatGrid = createHeat();
      heatFedLive = 0;
      heatFedCoarse = 0;
      heat.value = null;
      pricedChains.value = markRaw([]);
      chartsWanted.value = false;
    }
  }

  /** Build the chart's data from the caches as they are. A no-op while the chart is hidden. */
  function refreshChartData(): void {
    if (!chartShown.value) return;
    feedHeat();
    heat.value = heatSnapshot(heatGrid);
    // Past the limit, no point list unless asked for: dropping it frees the old copy too.
    pricedChains.value =
      pricedCount.value <= CHART_AUTO_LIMIT || chartsWanted.value ? buildPricedChains(allEntries()) : markRaw([]);
  }

  function feedHeatFrom(list: CacheEntry[], from: number): number {
    for (let i = from; i < list.length; i++) {
      const e = list[i];
      if (!(e.seconds > 0)) continue;
      // The last checkpoint is the key's second-to-last number (or the only one).
      const end = e.key.lastIndexOf(',');
      const start = end > 0 ? e.key.lastIndexOf(',', end - 1) + 1 : 0;
      const last = end > 0 ? Number(e.key.slice(start, end)) : Number(e.key);
      addToHeat(heatGrid, last, e.seconds / 86400);
    }
    return list.length;
  }

  /**
   * Only what arrived since the last call. Both caches only ever grow at the end during a run (the
   * smart search hands over a fresh array each batch, but in the same order), so a length is enough
   * to know where to carry on. A cache that got SHORTER was replaced, and starts the map again.
   * (A smart search's coarse scan and driver can price the same chain; those few are counted twice.)
   */
  function feedHeat(): void {
    if (liveCache.length < heatFedLive || coarseCache.length < heatFedCoarse) {
      heatGrid = createHeat();
      heatFedLive = 0;
      heatFedCoarse = 0;
    }
    heatFedCoarse = feedHeatFrom(coarseCache, heatFedCoarse);
    heatFedLive = feedHeatFrom(liveCache, heatFedLive);
  }

  function buildPricedChains(entries: CacheEntry[]): PricedChain[] {
    const out: PricedChain[] = [];
    for (const e of entries) {
      if (!(e.seconds > 0)) continue;
      const chain = e.key.split(',').map(Number);
      out.push({
        chain,
        days: e.seconds / 86400,
        prestiges: chain.length,
        // The last checkpoint before the target: the axis every measured sawtooth is drawn
        // against, so the user's own run can be read the same way as the explainer's figures.
        lastCheckpoint: chain.length > 1 ? chain[chain.length - 2] : chain[0],
      });
    }
    return markRaw(out);
  }

  /** "Draw the charts" on a big run: build the point list now, and keep it on the usual beat. */
  function drawCharts(): void {
    if (!chartShown.value) return;
    chartsWanted.value = true;
    pricedChains.value = buildPricedChains(allEntries());
  }

  /** "Back to the heat map": stop keeping the dots' data. Past the limit this frees the point list. */
  function releaseCharts(): void {
    chartsWanted.value = false;
    if (pricedCount.value > CHART_AUTO_LIMIT) pricedChains.value = markRaw([]);
  }

  /**
   * How many chains keep their PER-LEG DETAIL in memory. 0 means all of them.
   *
   * This is the run's memory budget, expressed in the unit the run is actually made of. A priced
   * chain is two numbers -- its key and its duration -- plus a `legs` array that is most of its
   * weight: each leg carries its twelve shifts as objects, so the detail is on the order of
   * kilobytes per chain while the answer is on the order of tens of bytes.
   *
   * An overnight exhaustive run prices hundreds of thousands of chains, and keeping full detail
   * for every one of them is what makes a tab die at 4am with no error -- the renderer is killed,
   * which is why the page comes back as "This page is having a problem" rather than anything this
   * code could catch and report.
   *
   * THE CHECKPOINT HAS ALWAYS DONE THIS. `buildCheckpoint` writes `durations` for every chain and
   * `bestLegs` for one, and `restoreEntries` brings the rest back with `legs: []` -- so leg-less
   * entries are a shape this codebase already produces, already resumes from, and already renders
   * (the CSV prints blank per-leg cells and says why). All this does is stop the IN-MEMORY cache
   * being the one place that keeps everything.
   *
   * WHAT IS LOST, stated plainly: the runners-up table can only show per-leg timings for chains
   * still holding detail. The kept set is the FASTEST ones, which is what that table shows, so in
   * practice the loss lands on chains nobody was going to open.
   */
  const legDetailBudget = ref(DEFAULT_LEG_DETAIL_BUDGET);

  /** Chains currently holding per-leg detail, and a measured estimate of what that costs. */
  const legsHeld = ref(0);
  const legDetailBytes = ref(0);

  /**
   * Apply the budget to both caches.
   *
   * Runs on the shortlist's beat rather than per batch: the rule is an O(n log n) pass over the
   * whole cache, which is exactly what `pickShortlist` already costs there, and doing it per batch
   * would put that on the hot path for nothing -- memory freed a few seconds later is still freed
   * long before it matters.
   *
   * The rule itself, and why it keeps the fastest rather than the newest, is in search/legBudget.ts.
   */
  function pruneLegDetail(): void {
    const entries = [...liveCache, ...coarseCache];
    const { held } = applyLegBudget(entries, legDetailBudget.value);
    legsHeld.value = held;
    legDetailBytes.value = estimateLegBytes(entries, held);
  }

  function refreshShortlist(force = false): void {
    // Every call, not only on the beat: it reads just the chains that arrived since the last one.
    // (Nothing at all while the chart is hidden.)
    if (chartShown.value) feedHeat();
    const now = Date.now();
    if (!force && now - lastShortlistAt < SHORTLIST_INTERVAL_MS) return;
    lastShortlistAt = now;
    // Before the views are built, so the table is built from what is actually being kept rather
    // than from detail that is about to be dropped underneath it.
    pruneLegDetail();
    const entries = allEntries();
    shortlist.value = buildView(entries, shortlistView.value, {
      planStart: planStartUsed.value || planStart.value,
      timezone: useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    let priced = 0;
    for (const e of entries) if (e.seconds > 0) priced++;
    pricedCount.value = priced;
    if (chartShown.value) {
      heat.value = heatSnapshot(heatGrid);
      // Past the limit, no point list unless asked for: dropping it frees the old copy too.
      pricedChains.value = priced <= CHART_AUTO_LIMIT || chartsWanted.value ? buildPricedChains(entries) : markRaw([]);
    }
  }

  /** Coarse-scan results plus driver cache, de-duplicated by chain, driver winning. */
  function allEntries(): CacheEntry[] {
    const byKey = new Map<string, CacheEntry>();
    for (const e of coarseCache) byKey.set(e.key, e);
    for (const e of liveCache) byKey.set(e.key, e);
    return [...byKey.values()];
  }

  /**
   * The run's chain -> duration cache as CSV text.
   *
   * Built from this session's own results (per-leg detail intact), falling back to a resumable
   * checkpoint's flattened durations when nothing has run yet — that fallback is why
   * `buildChainsCsv` emits leg-less rows instead of skipping them.
   */
  /**
   * What the simulator has to work with: the virtue inventory, plus the best earnings set it can
   * build out of it.
   *
   * Computed ON DEMAND rather than as a computed ref, because `getOptimalEarningsSet` solves a
   * combinatorial set problem over the whole inventory and would run on every unrelated store
   * change. The panel calls this once when the section is first opened.
   *
   * NOTE ON WHAT THIS IS NOT. It is today's inventory, held fixed for a plan that runs two years.
   * The search never varies artifacts — see `inventoryCaveat` for why that matters and which way
   * it errs.
   */
  function readInventory(): {
    artifacts: InventoryCount[];
    stones: InventoryCount[];
    earnings: EquippedArtifact[] | null;
    elr: EquippedArtifact[] | null;
    equippedNow: EquippedArtifact[] | null;
  } {
    const context = getSimulationContext();
    const raw = context.rawBackup ?? null;
    const { artifacts, stones } = virtueInventory(raw);
    if (!raw) return { artifacts, stones, earnings: null, elr: null, equippedNow: null };

    const equippedNow = getArtifactLoadoutFromBackup(raw);
    // Exactly the two calls `buildContinueVariant` in search/leg.ts makes, with the same options,
    // so this shows the sets the search is actually running rather than a plausible-looking pair.
    // `assumeMaxHabsVehicles: false` and the CURRENT research levels are what make this leg 1's
    // set specifically; later legs re-solve against their own research and will differ.
    const farmState = useInitialStateStore().currentFarmState;
    const elr =
      getOptimalELRSet(raw, {
        commonResearch: farmState?.commonResearches,
        epicResearchLevels: context.epicResearchLevels,
        colleggtibleModifiers: context.colleggtibleModifiers,
        currentSet: equippedNow,
        assumeMaxHabsVehicles: false,
      }) ?? equippedNow;

    return { artifacts, stones, earnings: getOptimalEarningsSet(raw), elr, equippedNow };
  }

  /**
   * What this run will be given, checked before hours are spent on it.
   *
   * Reads the SAME `readInventory()` the submission and the CSV header use, so what the panel shows
   * before a run is literally what the run gets -- not a second, plausible-looking derivation that
   * can agree with the real one right up until the day it does not.
   */
  /**
   * The save's age against the plan start (lib/saveAge.ts): the farm is caught up to the start at
   * its current rate, up to what its silos hold. Past that, the sync is old or something was missed.
   */
  const saveAgeNote = computed(() => {
    const iss = useInitialStateStore();
    const farm = iss.currentFarmState as { lastStepTime?: number; numSilos?: number } | null;
    const approx = (iss.rawBackup as { approxTime?: number } | null)?.approxTime;
    const sync = farm?.lastStepTime && farm.lastStepTime > 1e9 ? farm.lastStepTime : (approx ?? null);
    return describeSaveAge(
      sync,
      planStart.value,
      siloSeconds(farm?.numSilos, iss.epicResearchLevels?.['silo_capacity']),
      !!farm
    );
  });

  const setupIssues = computed<HealthIssue[]>(() => {
    const blank = { artifacts: [], stones: [], delivery: [], earnings: [], currentTE: 0, backupTE: 0 };
    if (!getSimulationContext().rawBackup) return reviewSetup({ hasBackup: false, ...blank });
    const inv = readInventory();
    const stale: HealthIssue[] =
      saveAgeNote.value?.level === 'warning'
        ? [{ kind: 'save-past-silos', level: 'warning', message: saveAgeNote.value.text }]
        : [];
    return [
      ...stale,
      ...reviewSetup({
        hasBackup: true,
        artifacts: inv.artifacts,
        stones: inv.stones,
        delivery: describeLoadoutSlots(inv.elr),
        earnings: describeLoadoutSlots(inv.earnings),
        // The PLANNER's TE against the save's: every search now starts from the save (`currentTE`),
        // so the two can only disagree while the planner has not caught up -- which `saveNotReady`
        // refuses a start over, and this explains.
        currentTE: plannerTE.value,
        backupTE: backupTE.value,
      }),
    ];
  });

  /**
   * The economic inputs, for the panel to print next to the loadout.
   *
   * WHY THESE AND NOT MORE. The reported failure looked like the farm "could not buy things": leg 1
   * continued an already-built farm and was exactly right, while every later leg -- which has to
   * fund its own research and habs out of earnings -- came back at a fraction of the rate and never
   * unlocked tier 13. The same account's OFFICIAL planner showed the same wrong number until it was
   * refreshed, which puts the fault in the loaded state rather than in this search. These are the
   * numbers that state is made of, so showing them is how a bad load becomes visible before a run
   * instead of after one.
   */
  const setupFacts = computed(() => {
    const initialStateStore = useInitialStateStore();
    const raw = initialStateStore.rawBackup;
    const epic = summariseEpicResearch(
      epicResearchDefs.map(d => ({
        id: d.id,
        name: d.name,
        level: initialStateStore.epicResearchLevels[d.id] ?? 0,
        maxLevel: d.maxLevel,
      }))
    );
    return {
      soulEggs: initialStateStore.soulEggs,
      epicAtMax: epic?.atMax ?? 0,
      epicTotal: epic?.total ?? 0,
      colleggtibles: raw ? (summariseColleggtibles(getColleggtibleTiers(raw))?.total ?? 0) : 0,
      currentTE: currentTE.value,
      backupTE: backupTE.value,
    };
  });

  /** The same review applied to the winning chain's legs, once there is one. */
  const resultIssues = computed<HealthIssue[]>(() => (bestLegs.value.length ? reviewLegs(bestLegs.value) : []));
  /** The issues that say the numbers may be wrong, as opposed to the long-continue remark. */
  const resultContradictions = computed(() => resultIssues.value.filter(i => i.kind !== 'long-continue'));
  const continueWarning = computed(() => resultIssues.value.find(i => i.kind === 'long-continue')?.message ?? '');

  /**
   * Build the shareable summary of this run.
   *
   * Deliberately NOT the CSV. The CSV is the run's full working -- ten thousand rows, every
   * candidate, local timestamps on every leg -- and it exists so the player can audit their own
   * search. A submission is the handful of fields a leaderboard needs, assembled by whitelist in
   * `search/submission.ts`, so a field added to the CSV later cannot leak by being forgotten
   * about here.
   */
  /**
   * What a submission says about the ACCOUNT, rather than the run: gear, research, colleggtibles,
   * the save. The same for a fastest run and a deadline run from the same save. `te` is the TE the
   * search started from, which Clothed TE is worked out against.
   */
  /**
   * The loaded account's epic research and colleggtibles, summarised (search/progression.ts). Read
   * straight off the loaded backup. Null when there is no backup to read, never guessed: "all maxed"
   * asserted for an account nobody looked at would be worse than saying nothing.
   */
  function progression() {
    const initialStateStore = useInitialStateStore();
    return {
      epicResearch: summariseEpicResearch(
        epicResearchDefs.map(d => ({
          id: d.id,
          name: d.name,
          level: initialStateStore.epicResearchLevels[d.id] ?? 0,
          maxLevel: d.maxLevel,
        }))
      ),
      colleggtibles: initialStateStore.rawBackup
        ? summariseColleggtibles(getColleggtibleTiers(initialStateStore.rawBackup))
        : null,
    };
  }

  function accountFields(te: number) {
    const inv = readInventory();
    const initialStateStore = useInitialStateStore();
    const prog = progression();
    return {
      artifacts: inv.artifacts,
      stones: inv.stones,
      delivery: describeLoadoutSlots(inv.elr),
      earnings: describeLoadoutSlots(inv.earnings),
      epicResearch: prog.epicResearch,
      colleggtibles: prog.colleggtibles,
      // Leg 1's delivery set, the same one `delivery` above describes. Later legs re-solve, but
      // the gear they choose from is the same, so the score is the account's and not the leg's.
      deliveryScore: inv.elr ? deliveryScore(inv.elr) : null,
      // The same formula the Clothed TE panel shows, against the TE this search starts from.
      clothedTE: inv.earnings
        ? calculateClothedTEForSet(inv.earnings, {
            truthEggs: te,
            colleggtibleModifiers: getSimulationContext().colleggtibleModifiers,
            labUpgradeLevel: initialStateStore.epicResearchLevels['cheaper_research'] ?? 0,
            permitLevel: initialStateStore.rawBackup?.game?.permitLevel ?? null,
          })
        : null,
      teByEgg: initialStateStore.rawBackup?.virtue?.eovEarned ?? null,
      backupTime: initialStateStore.rawBackup?.approxTime ?? null,
      // Schema 7. The save's own TE only with a save loaded: `backupTE` reads 0 without one, which
      // would claim every plan was typed in from above it.
      backupTE: initialStateStore.rawBackup ? backupTE.value : null,
      build: appBuildId(),
    };
  }

  /**
   * The account as it was when the run (or its carry-on) started: the save, inventory and research
   * the run priced. A run carried on over days keeps its own save while the tab may load a newer
   * one (the watcher's reopen, Load latest save), and the submission read the newer one -- so the
   * board saw a plan starting 18 h "before the save it was made from" and filed it as a what-if
   * (Halceyx, 6 Oct). Same live-vs-run bug as runSettingsUsed; same fix.
   */
  type AccountSnapshot = ReturnType<typeof accountFields>;
  /** A plain-JSON copy of an account snapshot: what IndexedDB stores, free of store proxies. */
  function plainAccount(a: AccountSnapshot): AccountSnapshot {
    return JSON.parse(JSON.stringify(a)) as AccountSnapshot;
  }
  let accountUsed: ReturnType<typeof accountFields> | null = null;
  /** The TE the run (or the opened saved run) started from: its inputs' `currentTE`, not the live
   *  save's, which may have moved on since. Null before any run. */
  let runTEUsed: number | null = null;
  let deadlineAccount: ReturnType<typeof accountFields> | null = null;
  /** The save each run priced, for its CSV header (inventory, loadouts): the same snapshot rule. */
  let runBackupUsed: unknown = null;
  let deadlineBackup: unknown = null;

  function buildRunSubmission(nickname?: string): Submission | null {
    if (!bestChain.value.length || bestDays.value <= 0) return null;
    const sub = buildSubmission({
      nickname,
      note: runNoteUsed,
      chain: [...bestChain.value],
      seconds: bestDays.value * 86400,
      legs: bestLegs.value,
      planStart: planStartUsed.value || planStart.value,
      timezone: useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentTE: runTEUsed ?? currentTE.value,
      // The run's own target -- its chain ends there -- not the box as it reads now: a run finished
      // at 309 and sent after the box was changed to 308 was filed under 308 (b7c361cc).
      finalTE: bestChain.value[bestChain.value.length - 1] ?? finalTE.value,
      effort: usedSettings().effort,
      availability: isConstrained(usedSettings().availability) ? usedSettings().availability : null,
      holdShifts: usedSettings().deferShifts,
      firstAscension: usedSettings().firstAscension,
      chainsPriced: csvRows.value,
      // Null for a checkpoint replay, and left off entirely in that case, so the board never reads
      // "0 minutes for 400 chains" as a very fast machine.
      ...(runCost.value ? { run: runCost.value } : {}),
      // Omitted alongside a space, for the reason `seed` documents: an exhaustive run enumerates
      // rather than descends, so it has no starting guess to report and the typed chain would be
      // a starting point the search never used.
      ...(searchSpace.value ? {} : { seed: [...seedChain.value] }),
      ...(searchSpace.value ? { space: searchSpace.value } : {}),
      // Only alongside a space. The block describes the distribution over an ENUMERATED set, and
      // the same numbers taken from a staged run would be the distribution over whatever the
      // heuristic chose to look at -- a spread that says more about the pruning than the game.
      ...(searchSpace.value
        ? {
            proof: summariseProof(
              allEntries().map(e => ({ chain: e.key.split(',').map(Number), days: e.seconds / 86400 })),
              bestChain.value
            ),
          }
        : {}),
      ...(accountUsed ?? accountFields(runTEUsed ?? currentTE.value)),
      // The player's earlier plans priced again, once `prepareRechecks` (or the end of the run) has
      // worked them out for THIS result. Until then the preview simply has none, and the send adds
      // them if they arrive in time (see `sendSubmission`). Named plans for a named send, anonymous
      // ones for an anonymous send: see `rechecksFor`.
      rechecks: rechecksFor(safeResultKey(), !!nickname?.trim()),
      flags: submissionFlags(),
      integrityWaitSeconds: integrityWait.value,
      timeOff: usableTimeOff(usedSettings().timeOff),
    });
    // A run started from one of the Chain Explorer's "Run this sweep" links carries its preset, so it
    // counts toward that sweep's coverage there without anyone having to tag it by hand.
    return runSweepTag ? { ...sub, sweep: { ...runSweepTag } } : sub;
  }

  /** What a deadline send reads from its run: a finished result has all of it, a running one too. */
  type DeadlineSendBase = Pick<
    SavedDeadlineResult,
    'deadline' | 'planStart' | 'te' | 'note' | 'settings' | 'account' | 'simple' | 'priced'
  >;

  /** The running date search's best route as a submission, for Send best so far. */
  function deadlineBestSoFarSubmission(nickname: string): Submission | null {
    const best = deadlineProgress.value?.best;
    if (!deadlineRunning.value || !deadlineRun || !best) return null;
    return buildDeadlineSubmission(best, nickname, { ...deadlineRun, priced: deadlineProgress.value?.priced ?? 0 });
  }

  /**
   * A deadline route as a submission (schema 8): its chain ends at the highest last stop found
   * reachable by the date, so `finalTE` is that stop and the board ranks on it. Priced from the
   * run's own plan start and TE; the account half is the loaded save's, as for any send.
   */
  function buildDeadlineSubmission(
    route: DeadlineRoute,
    nickname?: string,
    /** The run the route came from: the result on screen, or (a best so far) the run still going. */
    r: DeadlineSendBase | null = deadlineResult.value
  ): Submission | null {
    if (!r || !route.chain.length || !(route.reachAt > r.planStart)) return null;
    return buildSubmission({
      nickname,
      note: r.note,
      chain: [...route.chain],
      seconds: route.reachAt - r.planStart,
      legs: route.legs ?? [],
      planStart: r.planStart,
      timezone: useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentTE: r.te,
      finalTE: route.chain[route.chain.length - 1],
      effort: 'deadline',
      availability: isConstrained((r.settings ?? usedSettings()).availability)
        ? (r.settings ?? usedSettings()).availability
        : null,
      holdShifts: (r.settings ?? usedSettings()).deferShifts,
      firstAscension: readFirstAscension(r.settings ?? usedSettings()),
      mode: r.simple ? 'simple' : 'advanced',
      chainsPriced: r.priced,
      // The run's own account, kept in its result; then the live run's; and only for a result saved
      // before results kept one, the loaded save (`sendSubmission` refuses it if that contradicts).
      ...((r.account as AccountSnapshot | undefined) ?? deadlineAccount ?? accountFields(r.te)),
      timeOff: usableTimeOff((r.settings ?? usedSettings()).timeOff),
      deadline: { at: r.deadline, ascendAt: route.ascendAt },
    });
  }

  /**
   * Where a submission is sent, or empty when nowhere is configured.
   *
   * Read from the build's environment rather than hardcoded, because this project is forked and
   * self-hosted and there is no single collector anyone should be posting to by default. With it
   * unset the UI falls back to "save the file and share it yourself", which needs no server at
   * all and is the only mode that works offline.
   *
   * The command line can name one with `--collector` (scripts/siteRun.ts sets `__AAP_SUBMIT_URL__`
   * before the store is first used): its build may have been made where no collector was configured.
   */
  const submitUrl =
    ((globalThis as { __AAP_SUBMIT_URL__?: string }).__AAP_SUBMIT_URL__ ?? '').trim() ||
    (import.meta.env.VITE_SUBMIT_URL as string | undefined)?.trim() ||
    '';

  /** The board itself, derived from the submit endpoint rather than configured separately: they
   *  are the same Worker, and two env vars that have to agree is one more thing to get wrong. */
  const leaderboardUrl = computed(() => submitUrl.replace(/\/submit\/?$/, '/'));

  /**
   * Ship it. Resolves to a short status string for the UI; never throws.
   *
   * The CSV goes as a SEPARATE request rather than as a field in the JSON, for two reasons: it is
   * megabytes of text that would have to be escaped into a string first, and the headline result
   * is worth keeping even when the bulky half fails. A failed CSV upload therefore downgrades the
   * message rather than failing the whole submission.
   */
  /**
   * RESULTS ALREADY ON THE BOARD, remembered per browser. The same result was being sent twice --
   * the automatic send and then the Send button, or anonymously and then with a name -- because a
   * finished send re-enabled the button (13 plans on the board had copies, 25 Sep 2026). The key is
   * what makes it the same result: target, chain, days to 1e-4 (the collector's own precision), plan
   * start, starting TE and the settings that change the answer.
   */
  function resultKey(): string {
    const sp = searchSpace.value;
    return [
      finalTE.value,
      bestChain.value.join(' '),
      Math.round(bestDays.value * 1e4),
      // The plan start the submission itself carries (see buildRunSubmission): a reopened saved run
      // has no planStartUsed.
      planStartUsed.value || planStart.value,
      currentTE.value,
      // 'fresh' was this key's tag for Fastest (the boolean off) before 9 Oct, so Fastest keeps it and
      // Prestige Now gets one of its own: results already sent still read as sent.
      { continue: 'fc', auto: 'fresh', fresh: 'now' }[usedSettings().firstAscension],
      deferShifts.value ? 'hold' : 'free',
      // What makes it a different ROW on the board even with the same answer: a different space or
      // sweep, or a partial run versus the finished one.
      sp ? JSON.stringify([sp.mode, sp.bands ?? sp.range, sp.minGap]) : 'staged',
      runSweepTag?.preset ?? '',
      stoppedEarly.value ? 'partial' : 'whole',
    ].join('|');
  }
  /** `resultKey()`, or null when the settings it reads cannot be read. */
  function safeResultKey(): string | null {
    try {
      return resultKey();
    } catch {
      return null;
    }
  }

  /**
   * What this browser knows about a result it sent: when, the row id the collector stored it under
   * (or, for a copy it already had, the id of that row), and the name it went with ('' for none).
   * The id and name are what "Put my name on it" needs. Stored as JSON under `aap-submitted:<key>`;
   * a value from before this was recorded is a bare ISO date, read as a send with no id.
   */
  interface SentRecord {
    at: string;
    id?: string;
    nickname?: string;
  }
  const SENT_PREFIX = 'aap-submitted:';
  function readSentRecord(raw: string | null): SentRecord {
    if (raw && raw.startsWith('{')) {
      try {
        const v = JSON.parse(raw) as Partial<SentRecord>;
        return {
          at: typeof v.at === 'string' ? v.at : '',
          ...(typeof v.id === 'string' ? { id: v.id } : {}),
          ...(typeof v.nickname === 'string' ? { nickname: v.nickname } : {}),
        };
      } catch {
        /* fall through */
      }
    }
    return { at: raw ?? '' };
  }
  const sentRecords = ref<Map<string, SentRecord>>(
    (() => {
      const out = new Map<string, SentRecord>();
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith(SENT_PREFIX)) out.set(k.slice(SENT_PREFIX.length), readSentRecord(localStorage.getItem(k)));
        }
      } catch {
        /* storage unavailable: nothing remembered */
      }
      return out;
    })()
  );
  /** True once this exact result has been sent from this browser: the Submit buttons lock. */
  const alreadySubmitted = computed(() => {
    if (!(bestDays.value > 0)) return false;
    const key = safeResultKey();
    // The settings it reads could not be read: never lock a button on a guess.
    return key != null && sentRecords.value.has(key);
  });
  /** The send of the result on screen, when it was sent from this browser. */
  const sentRecord = computed<SentRecord | null>(() => {
    if (!(bestDays.value > 0)) return null;
    const key = safeResultKey();
    return key != null ? (sentRecords.value.get(key) ?? null) : null;
  });
  function rememberSent(key: string | null, record: Omit<SentRecord, 'at'> = {}): void {
    // Never allowed to fail a send that has already landed.
    if (!key) return;
    const full: SentRecord = { at: new Date().toISOString(), ...record };
    const next = new Map(sentRecords.value);
    next.set(key, full);
    sentRecords.value = next;
    try {
      localStorage.setItem(SENT_PREFIX + key, JSON.stringify(full));
    } catch {
      // Not remembered past this visit; the button still locks until the page is reloaded.
    }
  }
  /** A name as the collector would store it: trimmed, any player id redacted, at most 40 characters. */
  function cleanName(name: string): string {
    const t = name.trim();
    return t ? scrubIdentifiers(t).slice(0, 40) : '';
  }
  /**
   * The name "Put my name on it" would put on the result on screen, or '' when there is nothing to
   * do: it was not sent from this browser, the collector gave no id, the box is empty, or the box
   * already says what was sent.
   */
  function nameToClaim(name: string): string {
    const rec = sentRecord.value;
    if (!rec?.id) return '';
    const clean = cleanName(name);
    return clean && clean !== (rec.nickname ?? '') ? clean : '';
  }

  // ------------------------------------------------------------------------- re-checks
  //
  // Schema 7's `rechecks` (search/rechecks.ts has the why): the player's best three current plans
  // already on the board, priced again from THIS run's save. Their routes come from GET /mine -- the
  // rows sent with this browser's code for the account -- or, from an older collector or for runs
  // sent before the code existed, from GET /all rows with this save's timezone and artifacts. Their
  // days come from this run's own table when it priced them, else from the run's workers in the last
  // seconds before it ends (only when the run is going to send itself, `recheck: true`), else not at
  // all. Nothing here may hold a send up by more than RECHECK_BUDGET_MS, or fail one.

  const RECHECK_BUDGET_MS = 10_000;
  /** How long a fetched set of plans is reused: a run's end and its send are seconds apart. */
  const RECHECK_REUSE_MS = 5 * 60_000;
  /**
   * Rechecks from the player's NAMED plans and from their ANONYMOUS ones, kept apart. `rechecks` is
   * public, and a re-check is by definition the same player's plan: sent with a named run it would
   * put the player's name on the routes of their anonymous plans, and sent with an anonymous run it
   * would spell out their named route -- either way tying an anonymous run to a name, which the
   * consent text promises an anonymous send never does. So a send carries only the set that matches
   * it, and both are worked out, since the name box can change after the run ends.
   */
  interface RecheckSets {
    named: Recheck[];
    anonymous: Recheck[];
  }
  const NO_RECHECKS: RecheckSets = { named: [], anonymous: [] };
  /** The rechecks worked out for one result, by `resultKey()`. */
  const recheckState = ref<{ key: string; rechecks: RecheckSets } | null>(null);
  /** Days the run's workers priced for rechecks at its end, by chain key. Cleared when a run starts. */
  let recheckPriced = new Map<string, number>();
  let recheckFetch: { key: string; at: number; plans: Promise<Plan[]> } | null = null;

  /** The rechecks for a send of this result, named or not; null when none are worked out yet. */
  function rechecksFor(key: string | null, named: boolean): Recheck[] | null {
    if (key == null || recheckState.value?.key !== key) return null;
    return recheckState.value.rechecks[named ? 'named' : 'anonymous'];
  }

  /** The loaded account's partition hash (lib/storage/db.ts `hashID`), or '' with no account. */
  async function accountPartition(): Promise<string> {
    return partitionHash || (currentPlayerId ? await hashID(currentPlayerId).catch(() => '') : '');
  }

  /** This save's "timezone + best artifact per family", as a row from it carries; null with no save. */
  function saveAccountKey(): string | null {
    const raw = useInitialStateStore().rawBackup;
    if (!raw) return null;
    const labels = bestPerFamily(keepVirtueArtifacts(virtueInventory(raw).artifacts)).map(a => a.label);
    return accountKeyOf({ timezone: planTimezone(), artifacts: labels });
  }

  /** Rows from a collector answer, loosely: a row without a route is not a row. */
  function boardRows(body: unknown): BoardRow[] {
    const rows = (body as { rows?: unknown } | null)?.rows;
    return Array.isArray(rows) ? (rows as BoardRow[]).filter(r => r && Array.isArray(r.chain)) : [];
  }

  async function fetchRecheckPlans(partition: string, target: number): Promise<Plan[]> {
    const base = submitUrl.replace(/\/submit\/?$/, '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RECHECK_BUDGET_MS);
    try {
      let rows: BoardRow[] = [];
      // Read-only: an account this browser never sent for has no code, and gets none minted here.
      const token = existingOwnerToken(partition);
      if (token) {
        try {
          const res = await fetch(`${base}/mine`, { headers: { 'x-owner-token': token }, signal: ctrl.signal });
          if (res.ok) rows = boardRows(await res.json()).map(r => ({ ...r, yours: true }));
        } catch {
          // An older collector has no /mine; the fallback below still works.
        }
      }
      let accountKey: string | null = null;
      if (!rows.some(r => r.finalTE === target && !r.flags?.length)) {
        accountKey = saveAccountKey();
        if (accountKey) {
          const res = await fetch(`${base}/all?final=${encodeURIComponent(String(target))}`, { signal: ctrl.signal });
          if (res.ok) rows = [...rows, ...boardRows(await res.json()).filter(r => accountKeyOf(r) === accountKey)];
        }
      }
      return currentPlans(rows, accountKey, target, Date.now());
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /** The player's current plans at this target, fetched once and shared by the run's end, the
   *  preview and the send. Empty with no collector or no account. */
  async function recheckPlans(): Promise<Plan[]> {
    if (!submitUrl) return [];
    const partition = await accountPartition();
    if (!partition) return [];
    const key = `${partition}|${finalTE.value}`;
    if (recheckFetch && recheckFetch.key === key && Date.now() - recheckFetch.at < RECHECK_REUSE_MS) {
      return recheckFetch.plans;
    }
    const plans = fetchRecheckPlans(partition, finalTE.value);
    recheckFetch = { key, at: Date.now(), plans };
    return plans;
  }

  /** The settings this run priced under, as `recheckChains` compares them. */
  function recheckRun(): RecheckRun {
    return {
      currentTE: runTEUsed ?? currentTE.value,
      finalTE: finalTE.value,
      winner: [...bestChain.value],
      window: isConstrained(usedSettings().availability) ? describeAvailability(usedSettings().availability) : null,
      holdShifts: usedSettings().deferShifts,
      firstAscension: usedSettings().firstAscension,
      timeOff: usableTimeOff(usedSettings().timeOff),
    };
  }

  /** Seconds this run knows for each chain: its own table first, then the end-of-run pricing. */
  function knownSeconds(chains: readonly number[][]): Map<string, number> {
    const want = new Set(chains.map(c => c.join(',')));
    const out = new Map<string, number>();
    for (const cache of [coarseCache, liveCache]) {
      for (const e of cache) if (want.has(e.key) && e.seconds > 0) out.set(e.key, e.seconds);
    }
    for (const k of want) {
      const s = recheckPriced.get(k);
      if (!out.has(k) && s && s > 0) out.set(k, s);
    }
    return out;
  }

  /** Resolves to the promise's value, or to null once `deadline` (ms since the epoch) passes. */
  function byDeadline<T>(promise: Promise<T>, deadline: number): Promise<T | null> {
    const wait = Math.max(0, deadline - Date.now());
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), wait);
      promise.then(
        v => {
          clearTimeout(timer);
          resolve(v);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        }
      );
    });
  }

  /**
   * Work out the rechecks for the result on screen within `budgetMs`, for a named send and for an
   * anonymous one (`RecheckSets`). `livePool` is the run's own pool while it still exists (the end of
   * a run); chains its table did not price are priced there. Never throws; empty lists when there is
   * nothing to re-check or no time to do it.
   */
  async function computeRechecks(budgetMs: number, livePool: ChainSearchPool | null = null): Promise<RecheckSets> {
    if (!submitUrl || !bestChain.value.length || !(bestDays.value > 0)) return NO_RECHECKS;
    const deadline = Date.now() + budgetMs;
    try {
      const plans = await byDeadline(recheckPlans(), deadline);
      if (!plans?.length) return NO_RECHECKS;
      const run = recheckRun();
      const isNamed = (p: Plan) => !!p.row.nickname?.trim();
      const wanted = {
        named: recheckChains(
          plans.filter(p => isNamed(p)),
          run
        ),
        anonymous: recheckChains(
          plans.filter(p => !isNamed(p)),
          run
        ),
      };
      const byKey = new Map([...wanted.named, ...wanted.anonymous].map(c => [c.join(','), c]));
      const chains = [...byKey.values()];
      if (!chains.length) return NO_RECHECKS;
      if (livePool) {
        const known = knownSeconds(chains);
        const missing = chains.filter(c => !known.has(c.join(',')));
        if (missing.length) {
          // Copies, not the arrays above: a worker cannot be posted a reactive proxy (see the
          // winner fill-in in startExhaustive).
          const got = await byDeadline(livePool.evaluate(missing.map(c => [...c])), deadline);
          for (const r of got?.results ?? []) if (r.seconds > 0) recheckPriced.set(r.chain.join(','), r.seconds);
        }
      }
      const known = knownSeconds(chains);
      const priced = (list: readonly number[][]): Recheck[] =>
        list.flatMap(c => {
          const s = known.get(c.join(','));
          return s ? [{ chain: [...c], days: Number((s / 86400).toFixed(4)) }] : [];
        });
      return { named: priced(wanted.named), anonymous: priced(wanted.anonymous) };
    } catch {
      return NO_RECHECKS;
    }
  }

  /**
   * Work the rechecks out ahead of the send, so "Show exactly what is sent" shows them. The panels
   * call this once the player has opted in to sharing -- it reads the board with this browser's
   * code, which is not something to do for a player who has not said they want to send anything.
   */
  async function prepareRechecks(): Promise<void> {
    const key = safeResultKey();
    if (key == null || recheckState.value?.key === key) return;
    const rechecks = await computeRechecks(RECHECK_BUDGET_MS);
    if (safeResultKey() === key) recheckState.value = { key, rechecks };
  }

  /** The end-of-run hook: price what the table did not, on the pool that is about to be terminated. */
  async function recheckBeforeTheEnd(livePool: ChainSearchPool): Promise<void> {
    const key = safeResultKey();
    if (key == null) return;
    const rechecks = await computeRechecks(RECHECK_BUDGET_MS, livePool);
    recheckState.value = { key, rechecks };
  }

  /** The reply of a POST /submit, read loosely: an older collector sends only the first three. */
  interface SubmitReply {
    id?: string;
    uploadToken?: string;
    flagged?: string[];
    duplicate?: 'exact' | 'result';
    firstAt?: string;
    renamed?: boolean;
    /** On an exact copy: the name the stored row is on the board under ('' for none). */
    nickname?: string;
    /** A send with `replaces`: the provisional row it took the place of, or why it could not. */
    replaced?: string;
    replaceRefused?: string;
  }

  async function sendSubmission(
    payload: Submission,
    csv?: string,
    /**
     * For a result sent later from a file (the command line's `submit --from`): no run is loaded, so
     * the account's partition hash and the result's own key come from the file instead of this
     * store. Without it, exactly the site's send.
     */
    saved?: { partition: string; resultKey: string | null }
  ): Promise<{
    ok: boolean;
    message: string;
    duplicate?: 'exact' | 'result';
    id?: string;
    tooSoon?: boolean;
    /** With `tooSoon`: seconds until the collector will take another best so far. */
    retryAfter?: number;
    /** With `tooSoon`: it was the collector's daily cap on progress sends, not its 25-minute gap. */
    dailyCap?: boolean;
    /** A provisional row's token for its CSV so far (`sendBestSoFar` posts it itself). */
    uploadToken?: string;
  }> {
    if (!submitUrl) return { ok: false, message: 'no collector configured' };
    // A payload whose start contradicts its own save is never sent, from any screen or the command
    // line: the board would file it under a TE the route was not priced from.
    const contradiction = startContradictsSave(payload);
    if (contradiction) return { ok: false, message: contradiction };
    // A deadline route (schema 8) is its own result: it must not mark the fastest run on screen as
    // sent, nor drop that run's pending table, nor pick up its rechecks.
    const deadlineSend = payload.deadline !== undefined;
    // The key of the result being SENT, taken now: the awaits below give the page time to change it.
    const sentKey = saved ? saved.resultKey : safeResultKey();
    // A best so far (Send best so far): no table, no rechecks, and the result is not "sent" -- the
    // run's final send is still to come, and must not be turned away as a copy.
    const provisional = payload.provisional === true;
    if (!deadlineSend && !provisional) pendingTable.value = null;
    // Schema 7's rechecks, when the payload is this run's result and has none yet. Bounded, and a
    // failure only means the send goes without them.
    // By the chain alone (it ends at the run's target): the target box may have changed since.
    const thisRun =
      !saved &&
      !deadlineSend &&
      payload.chain?.length === bestChain.value.length &&
      payload.chain.every((v, k) => v === bestChain.value[k]);
    // The run's final send takes the place of its best so far on the board (collector "Provisional
    // rows"): the result on screen, from this screen's run, never one sent from a file.
    const kind = deadlineSend ? 'deadline' : 'fastest';
    // A best so far still on its way (Stop pressed while one was sending, or the automatic one just
    // went) must land first: its row is the one this final send replaces. Without the wait, a final
    // sent before its reply had no `replaces` (or the older row's), and the best so far stayed on the
    // board beside the result. Every final send, whichever screen sends it, comes through here.
    if (!saved && !provisional) await bestSoFarSettled();
    const held = provisionalRows.value[kind];
    if (!saved && !provisional && held && payload.replaces === undefined && (deadlineSend || thisRun)) {
      payload = { ...payload, replaces: held.id };
    }
    if (thisRun && !provisional && !payload.rechecks?.length) {
      // Only the set that matches this send's name, or lack of one (see `RecheckSets`).
      const set = payload.nickname?.trim() ? 'named' : 'anonymous';
      const rechecks = rechecksFor(sentKey, set === 'named') ?? (await computeRechecks(RECHECK_BUDGET_MS))[set];
      if (rechecks.length) payload = { ...payload, rechecks };
    }
    let reply: SubmitReply;
    // The owner code (search/owner.ts): what lets this browser find the run again if it lands on
    // the flagged board, fold a repeated send, put a name on it later, and let this account's later
    // runs replace its older plans. Random, per account, never derived from the player id.
    const partition = saved ? saved.partition : await accountPartition();
    const owner = partition ? ownerToken(partition) : null;
    try {
      const res = await fetch(submitUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(owner ? { 'x-owner-token': owner } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Say WHY. The collector answers a rejection with the list of problems -- "unknown
        // schema 1", "chain must strictly increase" -- and reporting only the status code turned
        // an answerable message into a wall. A stale build submitting an old schema looked
        // exactly like a broken collector.
        const detail = (await res.json().catch(() => ({}))) as {
          problems?: string[];
          retryAfter?: number;
          tooSoon?: boolean;
          dailyCap?: boolean;
        };
        // The collector's daily cap on progress sends (collector "Provisional rows"): until UTC midnight.
        if (res.status === 429 && detail.tooSoon && detail.dailyCap) {
          const wait = Math.max(1, detail.retryAfter ?? 3600);
          return {
            ok: false,
            message: `the board takes at most 48 progress sends a day from one account; more after midnight UTC, in ${aboutIn(wait * 1000)}.`,
            tooSoon: true,
            dailyCap: true,
            retryAfter: wait,
          };
        }
        // A best so far sent too soon after the last one (the collector's own gap, collector "Provisional rows").
        if (res.status === 429 && detail.tooSoon) {
          const minutes = Math.max(1, Math.ceil((detail.retryAfter ?? 60) / 60));
          return {
            ok: false,
            message: `You can send again in ${minutes} min.`,
            tooSoon: true,
            retryAfter: Math.max(1, detail.retryAfter ?? 60),
          };
        }
        if (res.status === 429) return { ok: false, message: tooManySubmissionsMessage(detail.retryAfter) };
        const why = detail.problems?.length ? `: ${detail.problems.join('; ')}` : '';
        return { ok: false, message: `collector said ${res.status}${why}` };
      }
      reply = ((await res.json().catch(() => ({}))) ?? {}) as SubmitReply;
    } catch {
      // Ordinary: someone is offline, or the collector is down. It must not look like the run
      // broke, and "Failed to fetch" -- the browser's own words -- says neither what happened nor
      // that nothing is lost.
      return {
        ok: false,
        message:
          'could not reach the collector (check your connection). Your results are still here. Press Submit again once you are back online, or use Save the file instead to keep a copy.',
      };
    }
    const { id, uploadToken, flagged } = reply;
    const duplicate = reply.duplicate === 'exact' || reply.duplicate === 'result' ? reply.duplicate : undefined;

    // The summary is in: from here on this result is on the board, whatever happens to the table.
    // Remembered with the row it is on, which for a copy the collector already had is THAT row, and
    // with the name that row is on the board under: what was sent for a new row; for a copy, the
    // stored row's name as the collector says it (it renames only an anonymous row). An older
    // collector that does not say leaves the name unknown, so "Put my name on it" is offered whenever
    // the box holds a name, rather than never.
    const storedName =
      duplicate === 'exact'
        ? reply.renamed
          ? (payload.nickname ?? '')
          : typeof reply.nickname === 'string'
            ? reply.nickname
            : undefined
        : (payload.nickname ?? '');
    if (!deadlineSend && !provisional)
      rememberSent(sentKey, { ...(id ? { id } : {}), ...(storedName !== undefined ? { nickname: storedName } : {}) });
    // The final went: the best so far it carried `replaces` for is done with, replaced or not (a
    // refusal leaves that row up, and sending again cannot change that).
    if (!provisional && payload.replaces && provisionalRows.value[kind]?.id === payload.replaces)
      setProvisional(kind, null);
    // The board has a new row of this account's: the next run's rechecks should see it.
    recheckFetch = null;

    // Said with every success message, because a run that went to the flagged board will not appear
    // on the main one, and without this it looks lost.
    const replacedNote = reply.replaced
      ? provisional
        ? ' It replaced the best so far you sent before.'
        : ' It replaced the best so far you sent during the run.'
      : reply.replaceRefused
        ? ` The best so far you sent earlier is still on the board (${reply.replaceRefused}).`
        : '';
    const note =
      (flagged?.length
        ? ` It went to the flagged board (${flagged.join(', ')}), shown anonymously; the Chain Explorer shows it to you as yours in this browser.`
        : '') + replacedNote;
    // A copy the collector caught is said as a plain note, not an error and not a thank-you for
    // something that stored nothing (see `duplicateMessage`).
    const exactNote = {
      firstAt: reply.firstAt,
      renamed: reply.renamed ? payload.nickname : undefined,
      sent: payload.nickname ?? '',
      stored: typeof reply.nickname === 'string' ? reply.nickname : undefined,
    };
    const lead = duplicate ? duplicateMessage(duplicate, exactNote) : 'sent';
    const done = (message: string) => ({
      ok: true,
      message,
      ...(duplicate ? { duplicate } : {}),
      ...(id ? { id } : {}),
      // A provisional row's CSV so far follows from `sendBestSoFar`, never through `pendingTable`.
      ...(provisional && uploadToken ? { uploadToken } : {}),
    });
    if (!csv) return done(lead + note);
    // An exact copy stores nothing; the collector hands back a CSV token only when the stored row is
    // this browser's and has no table yet, so a table-less first send gets its table now.
    if (duplicate === 'exact' && !uploadToken) return done(lead + note);
    if (!id) return done(`${lead} (no id came back, so the CSV was skipped)${note}`);
    // The collector only accepts a CSV carrying the token its /submit answer signed for this id.
    if (!uploadToken) return done(`${lead} (the collector does not take CSVs, so it was skipped)${note}`);
    // A table's outcome is written to follow "sent". A result from another search IS a send, so it
    // reads on from that lead; for a result already on the board it is what happened to THAT row's
    // missing table ("its missing CSV was added"), never "nothing new stored - sent, with the CSV".
    const withTable = (t: { message: string; landed?: 'new' | 'already' | null; size?: string }): string => {
      if (duplicate === 'result') return t.message.replace(/^sent/, lead);
      if (duplicate !== 'exact') return t.message;
      if (t.landed) return duplicateMessage('exact', { ...exactNote, table: { landed: t.landed, size: t.size } });
      return `${lead}, but ${t.message.replace(/^sent,?\s*(but\s+)?/, '')}`;
    };
    try {
      pendingTable.value = {
        source: deadlineSend ? 'deadline' : 'fastest',
        url: `${submitUrl.replace(/\/submit\/?$/, '/csv')}?id=${encodeURIComponent(id)}`,
        token: uploadToken,
        body: await gzip(scrubIdentifiers(csv)),
      };
    } catch {
      return done(
        withTable({ message: 'sent, but the table could not be compressed in this browser, so it was skipped' }) + note
      );
    }
    const table = await postTable();
    return { ok: table.ok, message: withTable(table) + note, ...(duplicate ? { duplicate } : {}), id };
  }

  /**
   * The CSV so far of the run going now, a chunk at a time, its header marked "in progress, N of M"
   * (search/csv.ts `partial`); null with nothing priced. Fastest: every chain priced, as Download CSV
   * writes them. By a date: every route found so far, as its finished CSV would list them.
   */
  function progressCsvChunks(kind: 'fastest' | 'deadline', p: RunProgress): Iterable<string> | null {
    const partial = { done: p.done, total: p.total, unit: p.unit };
    if (kind === 'fastest') return allEntries().length ? exportCsvChunks({ partial }) : null;
    const routes = deadlineRunCsv?.routes() ?? [];
    if (!routes.length || !deadlineRun || !deadlineRunCsv) return null;
    return deadlineCsvChunks(routes, deadlineCsvMeta(deadlineRun, deadlineRunCsv.ceiling, partial), {
      deadline: deadlineRun.deadline,
      priced: deadlineProgress.value?.priced ?? 0,
      ascendNeeded: deadlineRunCsv.ascendNeeded,
    });
  }

  /**
   * The CSV so far after a progress send's row: compressed a chunk at a time (search/progressSend.ts),
   * stopped at the collector's 8 MB, and posted with the row's own token. Never throws: what happened
   * comes back as a `ProgressCsv` for the status line.
   */
  async function sendCsvSoFar(
    kind: 'fastest' | 'deadline',
    p: RunProgress,
    id: string | undefined,
    token: string | undefined
  ): Promise<ProgressCsv> {
    if (!useShareExtras().sendCsv.value) return { kind: 'off' };
    const chunks = progressCsvChunks(kind, p);
    if (!chunks) return { kind: 'none' };
    // A collector from before progress sends hands a provisional row no token.
    if (!id || !token || !submitUrl) return { kind: 'not-taken' };
    // In the black box's history only: a page that dies building it says so on the next visit,
    // without taking the run's own open beat away.
    blackBox.note(`progress send: building the CSV so far (${p.done} ${p.unit})`);
    let gz: Awaited<ReturnType<typeof gzipChunksCapped>>;
    try {
      gz = await gzipChunksCapped(chunks, PROGRESS_CSV_LIMIT_BYTES, scrubIdentifiers);
    } catch {
      return { kind: 'failed', why: 'it could not be compressed in this browser' };
    }
    if (!gz.ok) return { kind: 'too-big', bytes: gz.atLeast };
    try {
      const res = await fetch(`${submitUrl.replace(/\/submit\/?$/, '/csv')}?id=${encodeURIComponent(id)}`, {
        method: 'POST',
        // As `postTable`: gzip bytes posted as data, not a transfer encoding.
        headers: { 'content-type': 'application/gzip', 'x-upload-token': token },
        body: gz.body,
      });
      // 409: an earlier try landed and its answer was lost.
      if (res.ok || res.status === 409) return { kind: 'sent', bytes: gz.body.byteLength };
      if (res.status === 413) return { kind: 'too-big', bytes: gz.body.byteLength };
      return { kind: 'failed', why: `the board answered ${res.status}` };
    } catch {
      return { kind: 'failed', why: 'the connection dropped' };
    }
  }

  /**
   * Send best so far, which is now a PROGRESS SEND (10 Oct): the running search's best as a provisional
   * row its final send will replace, plus the run's data -- the CSV so far when "Send my CSV too" is
   * ticked, and the private diagnostics when "Also send diagnostics" is. The button and the automatic
   * option ("Send my progress every ...") both come here: a headline-only press would replace the last
   * progress send's row, and the collector deletes a replaced row's CSV with it, so the button sends
   * the data too rather than throw the saved work away. Needs the player's yes for this run
   * (`bestSoFar.consent`). No rechecks. A second send replaces the first row. Never throws.
   */
  async function sendBestSoFar(): Promise<{
    ok: boolean;
    text: string;
    tooSoon?: boolean;
    retryAfter?: number;
    dailyCap?: boolean;
  }> {
    const say = (
      ok: boolean,
      text: string,
      more: { tooSoon?: boolean; retryAfter?: number; dailyCap?: boolean } = {}
    ) => {
      // Too soon is a wait, not a failure: said in neither green nor red.
      bestSoFarStatus.value = { ok, text, ...(more.tooSoon ? { pending: true } : {}) };
      return { ok, text, ...more };
    };
    const run = bestSoFar.value;
    const p = runProgress.value;
    if (bestSoFarSending.value) return { ok: false, text: 'Already sending.' };
    if (!run) return say(false, 'This run cannot send its best so far.');
    if (!run.consent) return say(false, 'Not sent: tick the box under Find to agree first.');
    if (!p?.best || (p.kind === 'by-date') !== (run.kind === 'deadline'))
      return say(false, 'Nothing found yet to send.');
    // One every 30 minutes (BEST_SO_FAR_GAP_MS): each send costs the collector several KV writes.
    bestSoFarNow.value = Date.now();
    if (bestSoFarWait.value > 0)
      return say(false, `You can send again in ${bestSoFarWait.value} min.`, {
        tooSoon: true,
        retryAfter: bestSoFarWait.value * 60,
      });
    const kind = run.kind;
    bestSoFarSending.value = true;
    const go = (async () => {
      const base =
        kind === 'deadline'
          ? deadlineBestSoFarSubmission(run.consent!.nickname)
          : buildRunSubmission(run.consent!.nickname);
      if (!base) return say(false, 'Nothing found yet to send.');
      let payload = asProvisional(base, provisionalProgress(p.done, p.total), provisionalRows.value[kind]?.id);
      // "Also send diagnostics": a private field of the body, kept by the collector as `extra:<id>`.
      if (useShareExtras().sendDiagnostics.value) {
        try {
          const parsed = JSON.parse(diagnosticsLine());
          if (parsed && typeof parsed === 'object') payload = { ...payload, diagnostics: parsed };
        } catch {
          // sent without them
        }
      }
      const res = await sendSubmission(payload);
      if (!res.ok)
        return say(
          false,
          res.tooSoon && !res.dailyCap ? res.message : `Not sent: ${res.message}`,
          res.tooSoon ? { tooSoon: true, retryAfter: res.retryAfter, dailyCap: res.dailyCap } : {}
        );
      if (res.id) {
        // Remembered before the CSV is built: building it is the heaviest moment of the send, and a
        // page that dies there must still carry on replacing THIS row (into the run's checkpoint at its
        // next write, which is now rather than in a minute or two).
        setProvisional(kind, { id: res.id, nickname: payload.nickname ?? '', at: Date.now() });
        // The clock too, so the wait reads 30 min rather than 31 until the ticker's next beat.
        bestSoFarNow.value = Date.now();
        if (kind === 'fastest') lastCheckpointAt = 0;
        else deadlineSavedAt = 0;
      }
      // The data, after the row: the row is what must land, and the CSV follows it.
      const csv = await sendCsvSoFar(kind, p, res.id, res.uploadToken);
      // What the row on the board now carries, for the automatic option's "anything new since". A CSV
      // that did not upload leaves the key unset, so the next due time sends again even if nothing new
      // was priced: the point is the saved work.
      bestSoFarAuto.value = {
        ...bestSoFarAuto.value,
        lastKey: csvSettled(csv) ? progressKey(p) : null,
        lastBest: p.best ? bestLabel(kind, p.best.te, finishDay(p.best.at)) : null,
        lastDetail: progressDetail(p.done, p.unit, csv),
      };
      const flaggedNote = /flagged board/.test(res.message) ? ' It went to the flagged board.' : '';
      const as = payload.nickname ? ` as ${payload.nickname}` : ' anonymously';
      const carried = [
        csv.kind === 'sent' ? `the CSV so far (${sizeLabel(csv.bytes)})` : '',
        payload.diagnostics ? 'your diagnostics' : '',
      ].filter(Boolean);
      const withText = carried.length ? `, with ${carried.join(' and ')}` : '';
      return say(true, `Sent${as}${withText}. It will be replaced when the run finishes.${csvNote(csv)}${flaggedNote}`);
    })();
    bestSoFarInFlight = go;
    try {
      return await go;
    } catch (e) {
      // Never throws (the buttons do not wait on it): whatever went wrong is said where they are.
      return say(false, `Not sent: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      bestSoFarSending.value = false;
      if (bestSoFarInFlight === go) bestSoFarInFlight = null;
    }
  }

  /** A finish moment (unix seconds) as the day the player reads, in the plan's zone: "Feb 24, 2029". */
  function finishDay(at: number): string {
    if (!at || !Number.isFinite(at)) return '';
    return showDay(formatInZone(at, planTimezone()).slice(0, 10));
  }

  /** A claim this soon after its send that finds no row is the board catching up, not a lost run. */
  const CLAIM_CATCH_UP_MS = 5 * 60_000;

  /**
   * "Put my name on it": name a result this browser already sent, typically sent anonymously (the
   * Submit panel starts on "anonymous") and wanted in the race after all. POST /claim with the
   * account's owner code; the collector renames the row only when it was stored with that same code,
   * so nobody can put their name on another player's run. Resolves to a message; never throws.
   */
  async function claimName(id: string, nickname: string): Promise<{ ok: boolean; message: string }> {
    if (!submitUrl) return { ok: false, message: 'no collector configured' };
    const name = cleanName(nickname);
    if (!name) return { ok: false, message: 'type the name to put on it first.' };
    const partition = await accountPartition();
    const token = partition ? existingOwnerToken(partition) : null;
    if (!token) {
      return {
        ok: false,
        message:
          'this browser has no code for the account, so it cannot show the collector the run is yours (it was sent from another browser, or site data was cleared).',
      };
    }
    let res: Response;
    try {
      res = await fetch(submitUrl.replace(/\/submit\/?$/, '/claim'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-owner-token': token },
        body: JSON.stringify({ id, nickname: name }),
      });
    } catch {
      return {
        ok: false,
        message:
          'could not reach the collector (check your connection). Nothing changed. Try again once you are back online.',
      };
    }
    if (res.ok) {
      // Every result this browser remembers on that row now carries the name.
      const next = new Map(sentRecords.value);
      for (const [key, rec] of next) {
        if (rec.id !== id) continue;
        const full = { ...rec, nickname: name };
        next.set(key, full);
        try {
          localStorage.setItem(SENT_PREFIX + key, JSON.stringify(full));
        } catch {
          /* remembered for this visit only */
        }
      }
      sentRecords.value = next;
      // The collector puts the name on its board before it answers, and the Leaderboard never reads a
      // copy the browser kept, so a refresh shows it.
      return { ok: true, message: `your name is on it now: ${name}. Refresh the Leaderboard to see it there.` };
    }
    const detail = (await res.json().catch(() => ({}))) as { problems?: string[]; retryAfter?: number; error?: string };
    if (res.status === 403) {
      return {
        ok: false,
        message:
          "the board would not rename it: it was not stored with this browser's code for the account (sent from another browser, or before codes existed).",
      };
    }
    if (res.status === 404) {
      // Moments after the send, "not found" means the board has not caught up with it, not that the
      // run is lost; saying the latter sent people to send it again, which only adds a copy.
      const sentAt = [...sentRecords.value.values()].find(r => r.id === id)?.at;
      const age = sentAt ? Date.now() - Date.parse(sentAt) : NaN;
      if (age >= 0 && age < CLAIM_CATCH_UP_MS) {
        return {
          ok: false,
          message: 'the board has not caught up with that send yet. Nothing is lost. Try again in a minute.',
        };
      }
      return { ok: false, message: 'the board does not have that run (or this collector cannot rename runs yet).' };
    }
    if (res.status === 429)
      return { ok: false, message: tooManySubmissionsMessage(detail.retryAfter).replace('press Submit', 'press it') };
    const why = detail.problems?.length ? `: ${detail.problems.join('; ')}` : detail.error ? `: ${detail.error}` : '';
    return { ok: false, message: `collector said ${res.status}${why}` };
  }

  /**
   * A table the summary landed without: kept, with its one-time token, so "Retry the table" can send
   * just the table. Pressing Submit again instead would add a second row to the leaderboard to get
   * one CSV in. Cleared once the table is stored, or once retrying cannot help.
   *
   * `source` is the screen whose send left it: Fastest and By a date share this one slot, and each
   * screen offers (and runs) a retry only for its own table, never the other's.
   */
  const pendingTable = ref<{ source: 'fastest' | 'deadline'; url: string; token: string; body: ArrayBuffer } | null>(
    null
  );

  /** Send `pendingTable`, and word the outcome as what to do next rather than a status code. */
  /**
   * `landed`: whether a table is now stored for the row -- `new` when this upload stored it,
   * `already` when one was there before, null when it did not land -- and `size` in the words the
   * messages use. `sendSubmission` words an already-stored result's table from these rather than
   * from the message, which is written for a fresh send.
   */
  async function postTable(): Promise<{
    ok: boolean;
    message: string;
    landed?: 'new' | 'already' | null;
    size?: string;
  }> {
    const table = pendingTable.value;
    if (!table) return { ok: false, message: 'there is no table waiting to be sent' };
    // KB under a tenth of a megabyte: a small sweep's table read "0.0 MB", which looks like nothing was sent.
    const kb = table.body.byteLength / 1024;
    const mb = kb < 100 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
    // Past the collector's cap the upload can only be refused (413), and "Retry the table" would
    // send the same bytes again forever. Say so, without spending the upload. The largest table
    // so far (41,581 chains, 8 ascensions) is 3.3 MB compressed, so this takes ~100,000 chains of 8.
    if (table.body.byteLength > TABLE_LIMIT_BYTES) {
      pendingTable.value = null;
      return { ok: true, message: tableTooLargeMessage(mb) };
    }
    let res: Response;
    try {
      res = await fetch(table.url, {
        method: 'POST',
        // Deliberately not `content-encoding: gzip`, which would invite something in the path to
        // helpfully inflate the body before the Worker sees it. These are gzip bytes being posted
        // as data, not a transfer encoding, and the type says so.
        headers: { 'content-type': 'application/gzip', 'x-upload-token': table.token },
        body: table.body,
      });
    } catch {
      // Offline or dropped mid-upload: the token is still good and no table is stored yet.
      return {
        ok: true,
        message:
          'sent, but the table did not upload (the connection dropped). The summary is in. Press Retry the table to send just the table.',
      };
    }
    if (res.ok) {
      pendingTable.value = null;
      return { ok: true, message: `sent, with the full CSV (${mb} compressed)`, landed: 'new', size: mb };
    }
    if (res.status === 413) {
      pendingTable.value = null;
      return { ok: true, message: tableTooLargeMessage(mb) };
    }
    if (res.status === 409) {
      // Stored already -- most likely an earlier attempt that landed but whose answer was lost.
      pendingTable.value = null;
      return { ok: true, message: 'sent, and the table was already stored', landed: 'already', size: mb };
    }
    if (res.status === 403) {
      // The token does not match. In practice a tab running a build from before the collector
      // changed its upload rules; retrying from this tab cannot help, a reload can.
      pendingTable.value = null;
      return {
        ok: true,
        message:
          'sent, but the table was refused. Save your results first (Save this run, Save the file instead, or Download CSV) so nothing is lost, then reload the page (it may be an old version) and submit again.',
      };
    }
    // Anything else (a 5xx, a restart mid-deploy) is worth another go with the same token.
    return {
      ok: true,
      message: `sent, but the table did not upload (${res.status}). The summary is in. Press Retry the table to send just the table.`,
    };
  }

  /** The "Retry the table" button; `source` is the screen pressing it. */
  async function retryTable(source?: 'fastest' | 'deadline'): Promise<{ ok: boolean; message: string }> {
    if (source && pendingTable.value && pendingTable.value.source !== source) {
      return { ok: false, message: 'there is no table waiting to be sent' };
    }
    const { ok, message } = await postTable();
    return { ok, message };
  }

  /**
   * Compress the CSV in the browser rather than on the collector.
   *
   * Measured on real output: 11,000 chains is 15.3 MB of text and 0.66 MB gzipped, about 23x,
   * because a chain table is overwhelmingly repeated numbers and timestamps. That is the
   * difference between a submission that needs R2 (and a payment method on the Cloudflare
   * account) and one that fits KV's 25 MB per-value limit with room to spare.
   *
   * It has to happen HERE and not in the Worker: the free Workers plan allows roughly 10ms of CPU
   * per request, and compressing fifteen megabytes would spend that many times over. Doing it
   * client-side also means the upload itself is 23x smaller, which matters more on a home
   * connection than the CPU does.
   *
   * `scrubIdentifiers` runs BEFORE compression, because it cannot run after: the Worker's own
   * `EI\d{16}` sweep is a regex over text, and an opaque gzip stream is not text. The CSV never
   * carried a player id in the first place -- `buildChainsCsv` has no playerId in its metadata --
   * so this is the same belt-and-braces it always was, just enforced one step earlier.
   */
  async function gzip(text: string): Promise<ArrayBuffer> {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    void writer.write(new TextEncoder().encode(text));
    void writer.close();
    return await new Response(stream.readable).arrayBuffer();
  }

  /**
   * "Also send diagnostics": the black box summary as one line (search/blackBox.ts), for a CSV that is
   * being SENT. Only called when the player ticked the box; the collector keeps no field for it, so it
   * rides in the CSV's header comments (search/csv.ts `diagnostics`).
   */
  function diagnosticsLine(): string {
    try {
      const b = detectBrowser();
      return JSON.stringify(
        blackBox.diagnosticsSummary({
          browser: `${b.browser} on ${b.os}`,
          cores: machineThreads,
          workers: workerBudget.value,
          carryOns: carryOnCount,
          crashed: lastCrash.value?.last ?? null,
        })
      );
    } catch {
      return '';
    }
  }

  function exportCsv(opts: { diagnostics?: boolean } = {}): string {
    const own = allEntries();
    const entries = own.length ? own : resumable.value ? restoreEntries(resumable.value) : [];
    // Read off the backup here, on the main thread: `getSimulationContext()` is Pinia-bound. The
    // run's own save when it has one (a carried-on run keeps its save while the tab may load a newer).
    const raw = (runBackupUsed ?? getSimulationContext().rawBackup ?? null) as
      | ReturnType<typeof getSimulationContext>['rawBackup']
      | null;
    const equipped = raw ? getArtifactLoadoutFromBackup(raw) : null;
    return buildChainsCsv(entries, {
      planStart: planStartUsed.value || planStart.value,
      timezone: useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentTE: runTEUsed ?? currentTE.value,
      final: finalTE.value,
      effort: usedSettings().effort,
      firstAscension: usedSettings().firstAscension,
      availability: usedSettings().availability,
      timeOff: usableTimeOff(usedSettings().timeOff),
      seedChain: seedChain.value,
      runNote: runNoteUsed,
      ...(opts.diagnostics ? { diagnostics: diagnosticsLine() } : {}),
      // The ELR set is deliberately NOT listed. `getOptimalELRSet` re-solves the structure per leg
      // against that leg's research state (up to 495 combos, and the reason it is the hotspot in
      // leg.ts), so there is no single "ELR set for the run" to report — and running the search
      // here just to print one would block the main thread for seconds on a button click.
      inventory: raw ? describeVirtueInventory(raw) : undefined,
      loadouts: [
        { label: 'equipped in the backup', loadout: equipped },
        { label: 'best earnings set available', loadout: raw ? getOptimalEarningsSet(raw) : null },
      ],
    });
  }
  /**
   * The same CSV, yielded a chunk at a time, for the download path.
   *
   * The meta block is assembled identically -- it is the same run being described -- so this is
   * deliberately a thin sibling of `exportCsv` rather than a second source of truth for what the
   * file says. Only the delivery differs: see `chainsCsvChunks` for why the download must not go
   * through one giant string.
   */
  function* exportCsvChunks(opts: { partial?: CsvMeta['partial'] } = {}): Generator<string> {
    const own = allEntries();
    const entries = own.length ? own : resumable.value ? restoreEntries(resumable.value) : [];
    // Read off the backup here, on the main thread: `getSimulationContext()` is Pinia-bound. The run's
    // own save when it has one, as `exportCsv` does: the download read whatever save was loaded at
    // click time, so a carried-on run's file could list another save's inventory.
    const raw = (runBackupUsed ?? getSimulationContext().rawBackup ?? null) as
      | ReturnType<typeof getSimulationContext>['rawBackup']
      | null;
    const equipped = raw ? getArtifactLoadoutFromBackup(raw) : null;
    yield* chainsCsvChunks(entries, {
      ...(opts.partial ? { partial: opts.partial } : {}),
      planStart: planStartUsed.value || planStart.value,
      timezone: useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentTE: runTEUsed ?? currentTE.value,
      final: finalTE.value,
      effort: usedSettings().effort,
      firstAscension: usedSettings().firstAscension,
      availability: usedSettings().availability,
      timeOff: usableTimeOff(usedSettings().timeOff),
      seedChain: seedChain.value,
      runNote: runNoteUsed,
      // The ELR set is deliberately NOT listed. `getOptimalELRSet` re-solves the structure per leg
      // against that leg's research state (up to 495 combos, and the reason it is the hotspot in
      // leg.ts), so there is no single "ELR set for the run" to report — and running the search
      // here just to print one would block the main thread for seconds on a button click.
      inventory: raw ? describeVirtueInventory(raw) : undefined,
      loadouts: [
        { label: 'equipped in the backup', loadout: equipped },
        { label: 'best earnings set available', loadout: raw ? getOptimalEarningsSet(raw) : null },
      ],
    });
  }

  /** Suggested filename, so two exports from different runs do not collide in Downloads. */
  function csvFilename(): string {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return `chain-search-${effort.value}-${stamp}.csv`;
  }

  /** Keep the save a run is about to be priced under, so a crash can carry on with it. A storage
   *  failure only costs that ability; it never stops the run. */
  async function storeRunSave(inputs: SearchInputs, key: string): Promise<void> {
    // The key is the run's IDENTITY and goes into every checkpoint whether or not the body could be
    // stored: a checkpoint with no key merges with any run on the same fingerprint, which is the
    // two-farms mix this exists to prevent. `runSaveFor` answers the separate question of whether
    // the save itself is there to carry on with.
    runInputsKey = key;
    try {
      partitionHash = partitionHash || (await hashID(currentPlayerId));
      await saveRunInputs(partitionHash, inputs, key);
    } catch (e) {
      console.warn('chain search: could not store the save for this run', e);
    }
  }

  async function persist(entries: CacheEntry[], force = false, complete = false): Promise<void> {
    if (!partitionHash) return;
    // Nothing priced yet. start() seeds bestDays at 0, so persisting here would write the
    // typed chain with a zero duration and - before saveCheckpoint learned to merge - would
    // clobber a better answer from a previous run. saveCheckpoint now refuses to regress, but
    // there is still no reason to write a placeholder.
    if (bestDays.value <= 0) return;
    const now = Date.now();
    // Spaced out as the cache grows: each write copies the WHOLE cache, and at 40,000 chains doing
    // that every 20 s is steady churn on a tab Safari is already squeezing for memory. 2 ms a chain
    // is about 80 s at 40,000 -- still under two minutes of pricing lost to a crash.
    if (!force && now - lastCheckpointAt < Math.max(CHECKPOINT_INTERVAL_MS, entries.length * 2)) return;
    lastCheckpointAt = now;
    try {
      await saveCheckpoint(
        partitionHash,
        buildCheckpoint({
          // So a crash leaves something that can carry on, not just a cache nobody can aim at.
          space: searchSpace.value,
          fingerprint: runFingerprint,
          effort: effort.value,
          seedChain: seedChain.value,
          bestChain: bestChain.value,
          bestSeconds: bestDays.value * 86400,
          entries,
          stage: stage.value,
          detail: detail.value,
          chainsDone: chainsDone.value,
          complete,
          inputsKey: runInputsKey || null,
          runNote: runNoteUsed,
          provisional: provisionalRows.value.fastest,
        })
      );
    } catch (e) {
      console.warn('chain search: could not write checkpoint', e);
    }
  }

  /**
   * Start (or resume) a run.
   *
   * `resume` reuses the stored chain->duration cache. Because every stage is deterministic given
   * that cache, the driver simply re-runs from the top: already-priced chains come back as cache
   * hits with no simulation, and the run continues from where it stopped.
   */
  /**
   * Price EVERY chain over a pool. No staged search, no descent, no pruning.
   *
   * The browser twin of the CLI's `--exhaustive`. The staged search returns a strong local optimum
   * and says so; this returns the true optimum of the space it enumerates, because it prices all of
   * it. It shares the enumeration with the CLI (`search/exhaustive.ts`) so the two cannot drift
   * into covering different spaces.
   *
   * NO SAFETY CAP. The CLI refuses past 5,000 chains without `--yes`, which is right for a flag you
   * can typo. This is a form that shows the count and the estimate as you type, on a page reached
   * only by URL, so the guard would only ever be in the way of someone who already knows.
   *
   * Progress, cache, best-so-far and the stop button are the same state the staged search writes,
   * so every results panel works unchanged.
   */
  /** The ascension counts (chain lengths) of every chain priced so far, coarse scan included, for
   *  "a longer route might win" (lib/longerRouteHint.ts). A function, not a ref: the caches are plain
   *  arrays; call it where the run ending already re-renders (isRunning, bestChain). */
  function pricedCounts(): number[] {
    const counts = new Set<number>();
    for (const cache of [coarseCache, liveCache])
      for (const e of cache) if (e.seconds > 0) counts.add(e.key.split(',').length);
    return [...counts].sort((x, y) => x - y);
  }

  /** Best priced chain in `liveCache`, pushed into the fields the panels read. */
  function noteBest(): void {
    let bestSeconds = Infinity;
    let bestEntry: CacheEntry | null = null;
    for (const e of liveCache) {
      if (e.seconds > 0 && e.seconds < bestSeconds) {
        bestSeconds = e.seconds;
        bestEntry = e;
      }
    }
    if (!bestEntry) return;
    // Only when it changed: a new array every chunk re-ran everything that reads the best chain,
    // the run's chart included, every few seconds for the whole run.
    if (bestEntry.key !== bestChain.value.join(',') || bestDays.value !== bestEntry.seconds / 86400) {
      bestChain.value = bestEntry.key.split(',').map(Number);
    }
    bestDays.value = bestEntry.seconds / 86400;
    bestLegs.value = bestEntry.legs;
  }

  /**
   * Bands-vs-pool chain building, shared by `startExhaustive` and `benchmarkMachine` so the two can
   * never enumerate different spaces for what is supposed to be the same configuration.
   *
   * `limit` bounds the DFS walk itself (see exhaustive.ts), not a slice taken after the fact — the
   * benchmark passes one specifically so a space of billions of chains never gets enumerated just to
   * sample the first few dozen.
   */
  function buildChainsForSpec(spec: ExhaustiveSpec, limit = Infinity): { chains: number[][]; error: string | null } {
    const minGap = Math.max(0, Math.floor(spec.minGap ?? 0));

    // One ascension: no checkpoints at all, straight to the target. Asked for as a quick chain to
    // queue behind a bigger one; the pool form cannot express "zero values from the pool".
    if (!spec.bands?.length && spec.minAsc === 1 && spec.maxAsc === 1) {
      return { chains: [[finalTE.value]], error: null };
    }

    if (spec.bands?.length) {
      const chains = sortByPrefix(bandedChains(spec.bands, finalTE.value, currentTE.value, minGap, limit));
      if (!chains.length) {
        return {
          chains: [],
          error:
            'No chains: the bands leave nothing strictly increasing once the minimum gap and your current TE are applied.',
        };
      }
      return { chains, error: null };
    }

    const poolValues = buildPool({ lo: spec.lo, hi: spec.hi, step: spec.step }, currentTE.value, finalTE.value);
    if (!poolValues.length) {
      return {
        chains: [],
        error: `The pool is empty once values outside (${currentTE.value}, ${finalTE.value}) are dropped.`,
      };
    }
    const chains = sortByPrefix(
      exhaustiveChainsWithGap(poolValues, spec.minAsc, spec.maxAsc, finalTE.value, currentTE.value, minGap, limit)
    );
    if (!chains.length) {
      return {
        chains: [],
        error: minGap
          ? `No chains: nothing in the pool is ${minGap} TE apart at that ascension count.`
          : 'No chains: the ascension range asks for more checkpoints than the pool can supply.',
      };
    }
    return { chains, error: null };
  }

  /**
   * `options.recheck`: the run will send itself when it finishes (the sweep card's consent), so its
   * last seconds, while the workers still exist, go to pricing the player's best earlier plans for
   * the submission's `rechecks`. See "re-checks" above.
   */
  async function startExhaustive(
    playerId: string,
    spec: ExhaustiveSpec,
    /** `own`: the stored inputs of a run carried on with its own save (see `prepareToCarryOn`). */
    options: { recheck?: boolean; own?: SearchInputs } = {}
  ): Promise<void> {
    if (isRunning.value || preparing.value || recheckingLatest.value) return;
    // A carry-on brings its own stored inputs; anything else reads the live save, which must be settled.
    if (!options.own && refuseUnsettledSave()) return;
    currentPlayerId = playerId;
    recheckPriced = new Map();
    recheckFetch = null;

    const minGap = Math.max(0, Math.floor(spec.minGap ?? 0));
    const built = buildChainsForSpec(spec);
    if (built.error) {
      error.value = built.error;
      return;
    }
    const chains = built.chains;
    // A carry-on keeps its run's best so far on the board to replace; a fresh run has none.
    setProvisional('fastest', takeCarriedProvisional());

    runSweepTag = sweepTag.value ? { ...sweepTag.value } : null;
    runNoteUsed = cleanNote(runNote.value);
    // Stated before a single chain is priced, so the submission says what was ASKED for even when
    // the run is stopped halfway. chainsPriced and stoppedEarly are filled in at the end.
    searchSpace.value = {
      mode: spec.bands?.length ? 'bands' : 'range',
      ...(spec.bands?.length
        ? { bands: spec.bands.map(b => [...b]) }
        : { range: { lo: spec.lo, hi: spec.hi, step: spec.step } }),
      minGap,
      minAscensions: spec.bands?.length ? spec.bands.length + 1 : spec.minAsc,
      maxAscensions: spec.bands?.length ? spec.bands.length + 1 : spec.maxAsc,
      chains: chains.length,
      chainsPriced: 0,
      stoppedEarly: false,
    };

    error.value = null;
    errorBeforeStart.value = false;
    stopRequested.value = false;
    stoppedEarly.value = false;
    isRunning.value = true;
    startedAt.value = Date.now();
    chainsDone.value = 0;
    chainsReplayed.value = 0;
    runLog.value = spec.bands?.length
      ? [`--- exhaustive: ${spec.bands.length} bands, ${spec.bands.length + 1} ascensions`]
      : [`--- exhaustive: ${spec.minAsc}-${spec.maxAsc} ascensions`];
    if (minGap) runLog.value.push(`minimum gap ${minGap} TE between checkpoints`);
    runLog.value.push(`${chains.length.toLocaleString()} chains, no pruning`);
    secondsPerChain.value = 0;
    rateSource.value = null;

    // CARRY FORWARD WHAT IS ALREADY PRICED, rather than starting from an empty cache.
    //
    // This line used to be `liveCache = []` unconditionally, and that is what made an unfinished
    // saved run un-continuable: opening one fills `liveCache` with every chain it managed to price,
    // and pressing Start threw all of it away and re-simulated from nothing. The checkpoint was the
    // only thing that ever got replayed, and a checkpoint is one slot per player that any later run
    // overwrites -- so a run saved deliberately, by name, was the one kind that could not be picked
    // back up.
    //
    // Guarded by the FINGERPRINT, which is the whole reason it is safe. A cached duration only means
    // anything against the plan start, TE, schedule and shift handling it was measured under, and
    // every one of those is editable between saving a run and reopening it. Same fingerprint, the
    // numbers describe the same problem and replaying them is free; different, and they are dropped
    // rather than quietly mixed into a ranking with chains priced under another clock.
    //
    // And by the SAVE, when the opened run knows which one it was priced under: two saves at the
    // same TE are two farms, and the fingerprint cannot tell them apart.
    const startInputs = options.own ?? collectInputs();
    if (!options.own) resultsFromOlderSave.value = null;
    latestRecheck.value = null;
    const startKey = runSaveKey(startInputs);
    const carried = new Map<string, CacheEntry>();
    const currentFingerprint = fingerprint(playerId);
    const opened = openedRun.value;
    // With nothing opened, what is in memory is the LAST RUN's, held to the same test: it used to be
    // carried over unchecked, so a carry-on on an older save picked up the latest save's durations
    // for every chain the two spaces shared (and "Load my latest save" then Start did the reverse).
    const sameAsLastRun = runFingerprint === currentFingerprint && (!runInputsKey || runInputsKey === startKey);
    if (
      opened
        ? !opened.fingerprint ||
          (opened.fingerprint === currentFingerprint && (!opened.inputsKey || opened.inputsKey === startKey))
        : sameAsLastRun
    ) {
      for (const e of [...liveCache, ...coarseCache]) if (e.seconds > 0) carried.set(e.key, e);
    }
    liveCache = [];
    coarseCache = [];
    resetChartData();
    // Cleared once the carry-forward above has been taken: from here this is a LIVE run, not a
    // saved one sitting in the panel, and leaving it set would go on offering to resume something
    // that is already running.
    openedRun.value = null;
    csvRows.value = 0;
    shortlist.value = [];
    lastShortlistAt = 0;
    batchDone.value = 0;
    batchTotal.value = 0;
    suspendedSeconds.value = 0;
    longestStallSeconds.value = 0;
    runStartedAt.value = Date.now();
    runEndedAt.value = 0;
    lastRateAt = Date.now();
    lastRateChains = 0;

    planStartUsed.value = planStart.value;
    // The first ascension as the workers' inputs price it (a carry-on's stored ones keep their own).
    runSettingsUsed.value = { ...snapshotSettings(), firstAscension: readFirstAscension(startInputs) };
    runTEUsed = startInputs.currentTE;
    accountUsed = accountFields(startInputs.currentTE);
    runBackupUsed = getSimulationContext().rawBackup ?? null;
    chainsEstimated.value = chains.length;
    bestChain.value = [];
    bestDays.value = 0;
    bestLegs.value = [];
    stage.value = 'starting workers';
    detail.value = '';

    // Checkpointing, which this path did without for one release and should not have. An exhaustive
    // over a banded space is a six-to-eight hour commitment; the first version kept every priced
    // chain in memory and wrote nothing until the operator pressed Save, so an unattended machine
    // that restarted lost the lot. The staged search has always checkpointed on a timer. This now
    // does the same, and replays what it finds instead of re-simulating it.
    // Seeded from memory first, then topped up from the checkpoint. Order matters only in that the
    // checkpoint wins a tie, and a tie means the same chain priced under the same inputs twice --
    // identical numbers either way.
    const alreadyPriced = new Map<string, CacheEntry>(carried);
    // Before the try, so a storage failure cannot leave the previous run's fingerprint in place.
    runFingerprint = currentFingerprint;
    try {
      partitionHash = await hashID(playerId);
      const saved = await loadCheckpoint(partitionHash, runFingerprint);
      if (saved && (!saved.inputsKey || saved.inputsKey === startKey)) {
        for (const e of restoreEntries(saved)) if (e.seconds > 0) alreadyPriced.set(e.key, e);
      }
    } catch (e) {
      console.warn('chain search: could not prepare storage', e);
    }

    // Replay before pricing: a chain already in the checkpoint costs nothing to carry forward, and
    // the counter has to include it or a resumed run looks like it lost its progress.
    const toPrice: number[][] = [];
    for (const chain of chains) {
      const hit = alreadyPriced.get(chain.join(','));
      if (hit) liveCache.push(hit);
      else toPrice.push(chain);
    }
    chainsReplayed.value = liveCache.length;
    chainsDone.value = liveCache.length;
    csvRows.value = liveCache.length;
    // Start the clock AFTER the replay. Measured from zero, the first batch looked like it had
    // priced every replayed chain as well, and a resumed run promised to finish absurdly soon.
    noteRate(chainsDone.value, true);
    sweepChainSamples.value = [];
    if (chainsReplayed.value) {
      runLog.value.push(`replayed ${chainsReplayed.value.toLocaleString()} chains from a previous run`);
      noteBest();
      refreshShortlist(true);
    }

    // REFUSE rather than warn. A run started against a half-loaded save produces a complete,
    // confident, wrong answer after hours of CPU, and the operator cannot tell from the result --
    // which is how this was found in the first place, from a CSV rather than from the app.
    const review = reviewRunInputs(startInputs);
    runNotes.value = review.filter(i => i.level === 'warning').map(i => i.message);
    if (saveAgeNote.value?.level === 'warning') runNotes.value.push(saveAgeNote.value.text);
    const blocking = review.filter(i => i.level === 'error');
    // The inputs moved during the awaits above (a backup landing and rewriting the start boxes, say).
    // The replayed chains were priced under `runFingerprint`; pricing the rest under different
    // inputs would file two problems' durations as one.
    const moved = fingerprint(playerId) !== runFingerprint;
    if (blocking.length || moved) {
      error.value = blocking.length
        ? blocking[0].message
        : 'Your plan start or settings changed while the run was starting. Check them, then press Start again.';
      errorBeforeStart.value = true;
      isRunning.value = false;
      stage.value = 'idle';
      return;
    }
    await storeRunSave(startInputs, startKey);

    holdRunLock();
    void holdScreenLock();
    document.addEventListener('visibilitychange', onVisibilityChange);
    tabHidden.value = document.visibilityState === 'hidden';
    try {
      pool = await createChainSearchPool(startInputs, {
        size: workerBudget.value,
        onSuspend: gap => {
          suspendedSeconds.value += gap;
          longestStallSeconds.value = Math.max(longestStallSeconds.value, gap);
          runLog.value.push(`--- the browser suspended this tab for ${Math.round(gap / 60)} minutes`);
        },
      });
      workersInPool.value = pool.size;
      startWorkerClock();
      if (!(await checkIntegrity(pool))) return;
      stage.value = 'pricing every chain';
      // And again once the workers are up: starting them and the integrity check are not a chain's
      // cost, and the first batch's rate (the benchmark this machine keeps) was charged them.
      noteRate(chainsDone.value, true);
      sweepChainSamples.value = [];
      noteSweepSample();

      // Chunked so progress is visible and so the pool re-deals by prefix each time. Sorted above,
      // which is what makes the evaluator's prefix memo pay: siblings land in the same chunk.
      //
      // DELIBERATELY SMALLER THAN THE CLI'S `jobs * 8`. The chunk is the unit of both the progress
      // counter and the stop check, and at 19 workers `* 8` is 152 chains -- about two minutes
      // during which the bar reads "0 / 6,006" and Stop does nothing. In a terminal that is a
      // quiet stretch between printed lines; in a UI it looks broken. `* 2` keeps every worker fed
      // (the pool splits a batch by prefix internally) while checking the stop flag four times as
      // often, at the cost of a little prefix sharing across chunk boundaries.
      //
      // Re-read every chunk, not once: the worker count can change mid-run, and a chunk sized for 4
      // workers would leave 12 of 16 idle.
      for (let i = 0; i < toPrice.length && !stopRequested.value; ) {
        const chunk = Math.max(pool.size * 2, 32);
        const slice = toPrice.slice(i, i + chunk);
        const { results } = await pool.evaluate(slice, noteBatch);
        for (const r of results) liveCache.push({ key: r.chain.join(','), seconds: r.seconds, legs: r.legs });
        i += slice.length;

        chainsDone.value = chainsReplayed.value + i;
        // The chunk is in `chainsDone` now. Left at its last heartbeat, it was counted twice by
        // everything that adds the chunk in flight (`runProgress`, the panels' "priced so far")
        // until the next chunk's first heartbeat: 32 of 32 on a 16-chain sweep, at the end.
        batchDone.value = 0;
        csvRows.value = liveCache.length;
        noteRate(chainsDone.value);
        noteSweepSample();
        noteBest();
        detail.value = `${chainsDone.value.toLocaleString()} / ${chains.length.toLocaleString()}`;
        refreshShortlist();
        // On the checkpoint timer, not every chunk. Losing at most a few minutes of pricing to a
        // crash is the trade; losing eight hours is not.
        void persist(liveCache);
      }

      // A replayed winner has no per-leg detail. Entries carried over from an earlier run in
      // memory have usually had their legs trimmed by the leg budget (they were slow there), and
      // a checkpoint only keeps legs for its own best. A real submission arrived with a chain, a
      // total and `legs: []` -- every one of its 365 chains replayed -- which leaves it out of
      // every per-leg analysis. Re-pricing the one winning chain is seconds, and the simulation is
      // deterministic under an unchanged fingerprint, so the total does not move.
      //
      // OPTIONAL, so it cannot fail the run. Everything is priced by now; if this one extra chain
      // does not come back, the result stands without per-leg detail rather than the whole run
      // being reported as failed with nothing saved as complete.
      if (bestChain.value.length && !bestLegs.value.length && pool) {
        stage.value = 'filling in the winning chain';
        try {
          // A COPY, not `bestChain.value`: that is a Vue reactive proxy, and a proxy cannot be
          // posted to a worker. It failed every resumed run at its very last step with "Failed to
          // execute 'postMessage' on 'Worker': [object Object] could not be cloned" (2026-09-25).
          const { results } = await pool.evaluate([[...bestChain.value]]);
          const r = results[0];
          if (r) {
            const key = r.chain.join(',');
            const at = liveCache.findIndex(e => e.key === key);
            if (at >= 0) liveCache[at] = { key, seconds: r.seconds, legs: r.legs };
            noteBest();
          }
        } catch (e) {
          runLog.value.push(
            `--- could not fill in the winning chain's legs (${describeRunError(e)}); the result stands without them`
          );
        }
      }

      stoppedEarly.value = stopRequested.value;
      if (searchSpace.value) {
        searchSpace.value.chainsPriced = liveCache.length;
        searchSpace.value.stoppedEarly = stopRequested.value;
      }
      stage.value = stopRequested.value ? 'stopped' : 'done';
      refreshShortlist(true);
      await persist(liveCache, true, !stopRequested.value);
      if (options.recheck && !stopRequested.value && bestDays.value > 0 && pool) {
        const finalStage = stage.value;
        stage.value = 're-checking your earlier plans for the board';
        await recheckBeforeTheEnd(pool);
        stage.value = finalStage;
      }
    } catch (e) {
      error.value = describeRunError(e);
      stage.value = 'failed';
    } finally {
      runEndedAt.value = Date.now();
      pool?.terminate();
      pool = null;
      isRunning.value = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      dropRunLock();
      dropScreenLock();
    }
  }

  /**
   * Prices the same first chunk `startExhaustive` would, through a throwaway pool, and uses the
   * result to seed `secondsPerChain` before the operator commits to a real run.
   *
   * Deliberately not "a chain per worker" or any other synthetic probe shape: `secondsPerChain` is a
   * specific quantity (wall clock for one parallel batch ÷ chains it contained), and matching the
   * real run's own chunk size and prefix-sorted ordering is what makes this number mean the same
   * thing as "what the live rate would read after one chunk" rather than a differently-biased guess.
   */
  /**
   * Put the plan start back on the latest save after a run carried on with an older one: the pin
   * held the run's own start, and a new plan from it would begin before the save it uses existed.
   */
  function resetPlanStartTo(ts: number | null | undefined): void {
    planStartPin.value = 0;
    pinnedBoxes = null;
    if (!ts || !(ts > 1e9)) return;
    const planner = useAutoPlannerStore();
    const tz = planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [d, t] = formatInZone(Math.max(ts, Date.now() / 1000), tz).split(' ');
    if (d && t) {
      planner.startDate = d;
      planner.startTime = t;
    }
  }

  /**
   * Re-price the fastest few chains of results that came from an older save, on the latest save.
   *
   * Compared by FINISH DATE, never by days: the two runs start from different instants, so their
   * day counts answer different questions. A handful of chains on a throwaway pool, the same way
   * the benchmark prices its probe.
   */
  async function recheckOnLatestSave(n = 10): Promise<void> {
    const older = resultsFromOlderSave.value;
    if (busy.value || !older || useUIStore().runSaveLoaded) return;
    if (staleBackupBlocked.value) {
      error.value = "Your latest save didn't load, so there is nothing newer to re-check against yet.";
      return;
    }
    const top = [...liveCache]
      .filter(e => e.seconds > 0)
      .sort((a, b) => a.seconds - b.seconds)
      .slice(0, n);
    if (!top.length) return;
    recheckingLatest.value = true;
    error.value = null;
    let pool: ChainSearchPool | null = null;
    try {
      const inputs = collectInputs();
      const blocking = reviewRunInputs(inputs).filter(i => i.level === 'error');
      if (blocking.length) {
        error.value = blocking[0].message;
        return;
      }
      // Stops the latest save has already passed are dropped, as the board's own re-checks do:
      // asking the simulator for a TE already behind it fails the whole batch.
      const routes = top.map(e => {
        const chain = e.key.split(',').map(Number);
        const final = chain[chain.length - 1];
        return { e, chain: [...usableCheckpoints(chain.slice(0, -1), inputs.currentTE, final), final] };
      });
      const unique = [...new Map(routes.map(r => [r.chain.join(','), r.chain])).values()];
      pool = await createChainSearchPool(inputs, { size: Math.min(workerBudget.value, unique.length) });
      const { results } = await pool.evaluate(unique);
      const priced = new Map(results.map(r => [r.chain.join(','), r.seconds]));
      latestRecheck.value = {
        te: inputs.currentTE,
        at: Date.now(),
        rows: routes.map(({ e, chain }) => {
          const sec = priced.get(chain.join(','));
          return {
            chain,
            oldFinish: older.planStart + e.seconds,
            newFinish: sec && sec > 0 ? inputs.planStart + sec : null,
            newDays: sec && sec > 0 ? sec / 86400 : null,
          };
        }),
      };
    } catch (e) {
      error.value = describeRunError(e);
    } finally {
      pool?.terminate();
      recheckingLatest.value = false;
    }
  }

  // ------------------------------------------------------------------ highest TE by a deadline
  //
  // search/deadline.ts does the searching; this owns the workers, the progress and the result. Kept
  // apart from `isRunning` on purpose: the exhaustive panel reads that for its own progress, and a
  // deadline run is a different question with its own results.

  const deadlineRunning = ref(false);
  const deadlineProgress = ref<DeadlineProgress | null>(null);
  const deadlineResult = ref<SavedDeadlineResult | null>(null);
  /** A deadline run that stopped before finishing (crash, reload, Stop), ready to carry on. */
  const deadlineUnfinished = ref<{
    spec: DeadlineRunSpec;
    priced: number;
    te: number;
    updatedAt: number;
    saveKept: boolean;
  } | null>(null);
  let deadlineStop = false;
  let deadlineSavedAt = 0;
  /** The running date search's own start, for a best so far sent before it has a result. */
  let deadlineRun: DeadlineSendBase | null = null;
  /** What a progress send's CSV so far needs from the date search going now: its routes found so far
   *  (search/deadline.ts `routesSoFar`), its top target and whether it ascends in awake hours. */
  let deadlineRunCsv: { routes: () => DeadlineRoute[]; ceiling: number; ascendNeeded: boolean } | null = null;

  /** Saved By a date answers for this account (search/deadlineStore.ts `saveAnswer`). */
  const savedAnswers = ref<SavedAnswer[]>([]);
  async function refreshSavedAnswers(playerId: string): Promise<void> {
    if (!playerId) return;
    savedAnswers.value = await listSavedAnswers(await hashID(playerId));
  }
  /** Keep the answer on screen under a name. */
  async function saveCurrentAnswer(playerId: string, label: string): Promise<void> {
    if (!playerId || !deadlineResult.value) return;
    const hash = await hashID(playerId);
    await saveAnswer(hash, JSON.parse(JSON.stringify(deadlineResult.value)) as SavedDeadlineResult, label);
    savedAnswers.value = await listSavedAnswers(hash);
  }
  /** Show a saved answer as the current one (it doesn't re-run anything). */
  function openSavedAnswer(id: string): void {
    const a = savedAnswers.value.find(x => x.id === id);
    // Never during a run: the running search's account and save are what ITS submission sends, and
    // clearing them here (as this once did, before the guard) sent it with the live save instead.
    if (!a || deadlineRunning.value) return;
    deadlineAll = [];
    // Another answer on screen: sending it must not replace the last run's best so far.
    setProvisional('deadline', null);
    deadlineResult.value = JSON.parse(JSON.stringify(a.result)) as SavedDeadlineResult;
    restoreDeadlineAccount(deadlineResult.value);
  }
  /** The account a shown result was priced with: its own, when it kept one (results from 7 Oct). */
  function restoreDeadlineAccount(r: SavedDeadlineResult | null): void {
    deadlineAccount = r?.account ? (r.account as AccountSnapshot) : null;
    deadlineBackup = null;
  }
  async function removeSavedAnswer(playerId: string, id: string): Promise<void> {
    const hash = await hashID(playerId);
    await deleteSavedAnswer(hash, id);
    savedAnswers.value = await listSavedAnswers(hash);
  }

  /** The saved result and any unfinished run, for the panel to show on opening. */
  async function loadDeadlineState(playerId: string): Promise<void> {
    if (!playerId || deadlineRunning.value) return;
    restoreDeadlineAccount(null);
    try {
      partitionHash = await hashID(playerId);
      runSaves.value = await listRunSaves(partitionHash);
      deadlineAll = []; // the last run's full list, which may be another account's
      // A run may have started during the awaits above: its result and account are its own.
      if (deadlineRunning.value) return;
      deadlineResult.value = await loadDeadlineResult(partitionHash);
      if (deadlineRunning.value) return;
      restoreDeadlineAccount(deadlineResult.value);
      const loaded = await loadDeadlineCheckpoint(partitionHash);
      // Another account's unfinished deadline search is not offered on this one.
      const cp = loaded && (await fromOtherAccount(partitionHash, loaded.inputsKey)) ? null : loaded;
      deadlineUnfinished.value = cp
        ? {
            spec: cp.spec,
            priced: cp.entries.length,
            te: cp.te,
            updatedAt: cp.updatedAt,
            saveKept: !!runSaveFor(cp.inputsKey),
          }
        : null;
    } catch (e) {
      console.warn('chain search: could not read the saved deadline search', e);
    }
  }

  /**
   * Find the highest last stop reachable by `spec.deadline`, over routes of `minStops`-`maxStops`
   * stops. Uses the Insane panel's schedule, time off and machine settings like any run, and keeps
   * the save it is priced on so an interruption can carry on (`resumeDeadline`).
   */
  async function startDeadline(playerId: string, spec: DeadlineRunSpec): Promise<void> {
    if (busy.value) return;
    if (refuseUnsettledSave()) return;
    // Held until `runDeadline` takes over (it sets `deadlineRunning` before its first await): the
    // save below is an IndexedDB write of megabytes, and a second click in that gap started a
    // second run on top of the first.
    preparing.value = true;
    try {
      await prepareDeadline(playerId, spec);
    } finally {
      preparing.value = false;
    }
    if (deadlineReady) {
      const [s, inputs, key, account] = deadlineReady;
      deadlineReady = null;
      await runDeadline(s, inputs, key, [], account);
    }
  }

  let deadlineReady: [DeadlineRunSpec, SearchInputs, string, AccountSnapshot] | null = null;
  /** The running deadline search's note, for the black box. */
  let deadlineNote: string | undefined;
  /** The deadline run's own settings from its start, kept in its result for the record. */
  let deadlineSettings: RunSettings | null = null;

  async function prepareDeadline(playerId: string, spec: DeadlineRunSpec): Promise<void> {
    deadlineReady = null;
    currentPlayerId = playerId;
    error.value = null;
    const inputs = collectInputs();
    // The account the run is priced on, taken in the same tick as its inputs: the awaits below give a
    // newer save time to land.
    const account = plainAccount(accountFields(inputs.currentTE));
    // Dated milestones are Insane's filter on routes to its target, not this search's: a milestone
    // above the last stops rejected every route ("nothing reaches any stop"), and one inside their
    // range broke the assumption that a lower last stop is always the easier one, so the halving
    // walked away from the answer. The deadline IS the date here.
    inputs.milestones = [];
    const blocking = reviewRunInputs(inputs).filter(i => i.level === 'error');
    if (blocking.length) {
      error.value = blocking[0].message;
      return;
    }
    if (!(spec.deadline > inputs.planStart)) {
      error.value = 'The deadline is before the plan starts.';
      return;
    }
    const key = runSaveKey(inputs);
    try {
      partitionHash = partitionHash || (await hashID(playerId));
      await saveRunInputs(partitionHash, inputs, key);
    } catch (e) {
      console.warn('chain search: could not store the save for this deadline search', e);
    }
    // The account's own routes as starting points: the chain in the planner, and the last Insane
    // best. Every prefix of each, since a deadline route stops partway along a 490 one.
    const seeds: number[][] = [];
    for (const chain of [seedChain.value, bestChain.value]) {
      const stops = chain.filter(v => v > inputs.currentTE && v < spec.lastHi && v !== finalTE.value);
      for (let n = 1; n <= stops.length; n++) seeds.push(stops.slice(0, n));
    }
    // The worker count goes in with the run, so a carry-on on a different budget still makes the
    // same guesses in the same order and replays them all.
    const note = cleanNote(runNote.value);
    deadlineReady = [
      {
        ...spec,
        seedShapes: seeds,
        parallel: clampPoolSize(workerBudget.value),
        startedAt: Date.now(),
        ...(note ? { note } : {}),
      },
      inputs,
      key,
      account,
    ];
  }

  /** Carry on the unfinished deadline run, on the save it started with. */
  async function resumeDeadline(playerId: string): Promise<void> {
    if (busy.value) return;
    carryOnCount++;
    currentPlayerId = playerId;
    error.value = null;
    let ready: [DeadlineCheckpoint, SearchInputs, AccountSnapshot] | undefined;
    preparing.value = true; // see startDeadline: two Carry on buttons, two awaits before the run
    try {
      partitionHash = partitionHash || (await hashID(playerId));
      const cp = await loadDeadlineCheckpoint(partitionHash);
      if (!cp) return;
      runNote.value = cp.spec.note ?? '';
      carriedProvisional = readProvisionalRow(cp.provisional);
      if (await fromOtherAccount(partitionHash, cp.inputsKey)) {
        error.value = `This search can't carry on: ${OTHER_ACCOUNT}.`;
        return;
      }
      const inputs = await loadRunInputs(partitionHash, cp.inputsKey);
      if (!inputs) {
        error.value = "This search's save is no longer stored on this device, so it can't carry on. Start it again.";
        return;
      }
      ready = [cp, inputs, (cp.account as AccountSnapshot | undefined) ?? accountFromStoredSave(inputs)];
    } finally {
      preparing.value = false;
    }
    if (ready)
      await runDeadline(
        ready[0].spec,
        ready[1],
        ready[0].inputsKey,
        ready[0].entries,
        ready[2],
        ready[0].elapsedSeconds ?? 0
      );
  }

  /**
   * The account half for a carry-on whose checkpoint predates `account`: the save's moment, TE and
   * per-virtue TE from the run's OWN stored save, the rest (inventory, research) from the loaded one,
   * as `openSavedRun` does. It used to be all live, so a carry-on after a newer save landed sent the
   * newer save's time and TE with a route priced on the older one.
   */
  function accountFromStoredSave(inputs: SearchInputs): AccountSnapshot {
    const stored = inputs.context?.rawBackup as { approxTime?: number; virtue?: { eovEarned?: number[] } } | undefined;
    const live = accountFields(inputs.currentTE);
    if (!stored) return plainAccount(live);
    return plainAccount({
      ...live,
      backupTime: stored.approxTime ?? null,
      backupTE: pricedTE(inputs.baseState),
      teByEgg: (stored.virtue?.eovEarned ?? null) as AccountSnapshot['teByEgg'],
    });
  }

  async function discardDeadlineRun(playerId: string): Promise<void> {
    partitionHash = partitionHash || (await hashID(playerId));
    await clearDeadlineCheckpoint(partitionHash);
    deadlineUnfinished.value = null;
    await pruneSaves(await loadAnyCheckpoint(partitionHash));
  }

  async function runDeadline(
    spec: DeadlineRunSpec,
    inputs: SearchInputs,
    key: string,
    seed: PricedEntry[],
    /** The account the run is priced on (see `prepareDeadline`, `resumeDeadline`). */
    accountIn?: AccountSnapshot,
    /** Seconds an earlier session of this run already spent (a carry-on), for its "took". */
    priorSeconds = 0
  ): Promise<void> {
    const schedule = isConstrained(inputs.availability) ? inputs.availability : null;
    deadlineRunning.value = true;
    // The first ascension as these inputs price it: a carry-on's stored inputs keep their own.
    deadlineSettings = { ...snapshotSettings(), firstAscension: readFirstAscension(inputs) };
    // Held locally as well: the result and the checkpoint take THIS, whatever touches the shared one.
    const account = accountIn ?? plainAccount(accountFields(inputs.currentTE));
    deadlineAccount = account;
    deadlineBackup = inputs.context?.rawBackup ?? getSimulationContext().rawBackup ?? null;
    deadlineNote = spec.note;
    // A carry-on keeps its run's best so far on the board to replace; a fresh run has none.
    setProvisional('deadline', takeCarriedProvisional());
    deadlineRun = {
      deadline: spec.deadline,
      planStart: inputs.planStart,
      te: inputs.currentTE,
      ...(spec.note ? { note: spec.note } : {}),
      ...(deadlineSettings ? { settings: deadlineSettings } : {}),
      account: account as DeadlineAccount,
      ...(spec.simple ? { simple: true } : {}),
      priced: 0,
    };
    deadlineRunCsv = {
      routes: () => [],
      ceiling: spec.extend ? Math.max(spec.lastHi, MAX_LAST_STOP) : spec.lastHi,
      ascendNeeded: !!spec.ascendNeeded && !!schedule,
    };
    deadlineEstimate.value = Math.max(0, Math.floor(spec.estimate ?? 0));
    deadlineStop = false;
    deadlineResult.value = null;
    deadlineUnfinished.value = null;
    deadlineSavedAt = 0;
    deadlineProgress.value = {
      stage: seed.length ? `carrying on: replaying ${seed.length.toLocaleString()} routes` : 'starting workers',
      priced: 0,
      best: null,
      open: 0,
      shapes: 0,
      top: [],
    };
    deadlineStartedAt.value = Date.now();
    deadlineInBatch.value = 0;
    deadlineLegSims.value = 0;
    deadlineLegSamples.value = [];
    deadlineReplayed.value = 0;
    deadlineLaterLegs = { legs: 0, routes: 0, lastLegs: 0, lastRoutes: 0 };
    deadlineLaterPerRoute.value = 0;
    deadlineRunSimple.value = !!spec.simple;
    deadlineLegPlan.value = spec.legPlan ?? null;
    deadlineSets.value = spec.legPlan?.sets ?? spec.sets ?? 0;
    deadlineAll = [];
    holdRunLock();
    void holdScreenLock();
    // The same hidden-tab tracking the other runs have: without it "When this tab is in the
    // background" never slowed a deadline run, and the screen lock was not taken back on return.
    document.addEventListener('visibilitychange', onVisibilityChange);
    tabHidden.value = document.visibilityState === 'hidden';
    let pool: ChainSearchPool | null = null;
    let replayed: ReturnType<typeof replayingEvaluator> | null = null;
    const checkpoint = async (replay: ReturnType<typeof replayingEvaluator>, force = false) => {
      const now = Date.now();
      if (!force && now - deadlineSavedAt < 30_000) return;
      deadlineSavedAt = now;
      try {
        await saveDeadlineCheckpoint(partitionHash, {
          spec,
          inputsKey: key,
          planStart: inputs.planStart,
          te: inputs.currentTE,
          entries: replay.entries(),
          updatedAt: now,
          elapsedSeconds:
            priorSeconds + Math.max(0, (now - deadlineStartedAt.value) / 1000 - (pool?.suspendedSeconds ?? 0)),
          account: account as DeadlineAccount,
          ...(provisionalRows.value.deadline ? { provisional: { ...provisionalRows.value.deadline } } : {}),
        });
      } catch (e) {
        console.warn('chain search: could not save the deadline search', e);
      }
    };
    try {
      pool = await createChainSearchPool(inputs, { size: workerBudget.value });
      deadlinePool = pool;
      if (targetWorkers.value < workerBudget.value) pool.resize(targetWorkers.value);
      // The worker clock (the other runs have had it all along): seconds per leg is recorded at the
      // run's time-weighted worker count, not whatever the slider said at the end.
      deadlineWorkersInPool.value = pool.size;
      startDeadlineWorkerClock();
      const workers = pool;
      // Who prices which route (search/stickyDealer.ts): evenly, and each set back to the worker that
      // has its early legs in memory. One dealer for the run, so it remembers across rounds.
      const dealer = createStickyDealer();
      // ...and a memo big enough to keep them there from one round to the next, without each route's
      // own last leg, which nothing reads again (deadlineEstimate.ts `deadlineMemoCapacity`). Only how
      // much the workers remember, never what a route comes to.
      const memo = { keepLast: false, capacity: deadlineMemoFor(spec, inputs.currentTE) };
      const replay = replayingEvaluator(
        async (chains, onResult) => {
          // Many sets: dealt evenly and stickily, a few routes at a time per worker, streamed back.
          // A handful, each with several guesses at its last stop (deadline.ts `parallel`): every
          // guess on its own worker, or one worker gets them all and the rest wait.
          const shapes = new Set(chains.map(c => c.slice(0, -1).join(','))).size;
          const dealt = shapes >= workers.size;
          const r = dealt
            ? await workers.evaluate(chains, done => (deadlineInBatch.value = done), {
                workerOf: (cs, n) => dealer.deal(cs, n),
                onResult: (c, res) => {
                  onResult?.(c, res);
                  // A checkpoint inside a long batch too (at most every 30 s, as before).
                  void checkpoint(replay);
                },
                onLegs: n => (deadlineLegSims.value += n),
                shouldStop: () => deadlineStop,
                memo,
              })
            : await workers.evaluate(chains, done => (deadlineInBatch.value = done), { spreadOut: true, memo });
          if (!dealt) deadlineLegSims.value += r.legSims;
          deadlineInBatch.value = 0;
          return r.results;
        },
        seed,
        () => deadlineStop
      );
      replayed = replay;
      const out = await runDeadlineSearch(
        {
          currentTE: inputs.currentTE,
          planStart: inputs.planStart,
          deadline: spec.deadline,
          minStops: spec.minStops,
          maxStops: spec.maxStops,
          lastLo: Math.max(Math.floor(inputs.currentTE) + 1, spec.lastLo ?? 0),
          lastHi: spec.lastHi,
          step: spec.step,
          ...(spec.maxShapes ? { maxShapes: spec.maxShapes } : {}),
          seedShapes: spec.seedShapes ?? [],
          parallel: spec.parallel ?? 1,
          ...(spec.extend ? { extend: true } : {}),
          ...(spec.bands?.length ? { bands: spec.bands } : {}),
          ...(spec.bandSets?.length ? { bandSets: runBandSets(spec) } : {}),
          ...(spec.ascendNeeded && schedule ? { ascendAt: (t: number) => nextAvailable(t, schedule) } : {}),
        },
        {
          evaluate: async (chains, onResult) => {
            const r = await replay.evaluate(chains, onResult);
            // Counted once the batch is back, with the routes priced it reports next.
            deadlineReplayed.value = replay.replayed();
            void checkpoint(replay);
            return r;
          },
          onProgress: p => {
            deadlineProgress.value = p;
            noteLegSample();
            noteLaterLegs();
          },
          shouldStop: () => deadlineStop,
          // For a progress send's CSV so far: ranked only when one is sent.
          routesSoFar: get => {
            if (deadlineRunCsv) deadlineRunCsv.routes = get;
          },
        }
      );
      deadlineAll = out.routes;
      if (!out.stoppedEarly && spec.bandSets?.length)
        noteDeadlineRatio(deadlineProgress.value?.learn, spaceShapeKey(spec.bandSets));
      // Its own speed, for the next estimate: the legs this run simulated (replayed routes cost none),
      // over the time it ran less any time the page was suspended, at its time-weighted worker count.
      const endedAt = Date.now();
      bankDeadlineWorkerTime(endedAt);
      const sessionSeconds = (endedAt - deadlineStartedAt.value) / 1000 - (pool?.suspendedSeconds ?? 0);
      const avgWorkers = timeWeightedWorkers(
        deadlineWorkerMs.value,
        deadlineWorkersChangedAt.value,
        deadlineWorkersInPool.value,
        deadlineStartedAt.value,
        endedAt
      );
      noteDeadlineSpeed(deadlineLegSims.value, sessionSeconds, avgWorkers);
      deadlineResult.value = {
        routes: out.routes.slice(0, 50),
        byStops: [...out.byStops.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r),
        deadline: spec.deadline,
        planStart: inputs.planStart,
        te: inputs.currentTE,
        step: out.step,
        shapes: out.shapes,
        priced: out.priced,
        stoppedEarly: out.stoppedEarly,
        ascendNeeded: spec.ascendNeeded && !!schedule,
        lastHi: spec.lastHi,
        ceiling: spec.extend ? Math.max(spec.lastHi, MAX_LAST_STOP) : spec.lastHi,
        ...(spec.note ? { note: spec.note } : {}),
        ...(deadlineSettings ? { settings: deadlineSettings } : {}),
        account: account as DeadlineAccount,
        inputsKey: key,
        backupAt: account.backupTime ?? null,
        backupTE: account.backupTE ?? null,
        ...(spec.bandSets?.length ? { bandSets: spec.bandSets } : {}),
        ...(spec.instantSets?.length ? { instantSets: spec.instantSets } : {}),
        ...(spec.simple ? { simple: true } : {}),
        legSims: deadlineLegSims.value,
        elapsedSeconds: priorSeconds + Math.max(0, sessionSeconds),
        ...(avgWorkers > 0 ? { workers: Math.max(1, Math.round(avgWorkers)) } : {}),
        ...(priorSeconds > 0 || seed.length ? { carriedOn: true } : {}),
        lastLo: Math.max(Math.floor(inputs.currentTE) + 1, spec.lastLo ?? 0),
        at: Date.now(),
      };
      deadlineAccount = account;
      try {
        await saveDeadlineResult(partitionHash, deadlineResult.value);
        if (out.stoppedEarly) {
          await checkpoint(replay, true);
          runSaves.value = await listRunSaves(partitionHash);
          deadlineUnfinished.value = {
            spec,
            priced: replay.entries().length,
            te: inputs.currentTE,
            updatedAt: Date.now(),
            saveKept: !!runSaveFor(key),
          };
        } else {
          await clearDeadlineCheckpoint(partitionHash);
        }
      } catch (e) {
        console.warn('chain search: could not save the deadline result', e);
      }
    } catch (e) {
      // A crashed worker or a stall: keep what was priced and offer the carry-on now. The error text
      // says anything priced is saved -- true only if this writes it, and the box is what uses it
      // (Start begins afresh).
      if (replayed && replayed.entries().length) {
        await checkpoint(replayed, true);
        try {
          runSaves.value = await listRunSaves(partitionHash);
        } catch {
          // the box still shows; it just can't say whether the save is kept
        }
        deadlineUnfinished.value = {
          spec,
          priced: replayed.entries().length,
          te: inputs.currentTE,
          updatedAt: Date.now(),
          saveKept: !!runSaveFor(key),
        };
      }
      error.value = describeRunError(e);
    } finally {
      pool?.terminate();
      deadlinePool = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      dropRunLock();
      dropScreenLock();
      deadlineRunCsv = null;
      deadlineRunning.value = false;
    }
  }

  /**
   * What one LEG of a deadline run costs a worker, in seconds, measured on this machine by the last
   * deadline run that simulated enough legs to tell (remembered in this browser). The panel's
   * estimate starts from it. Counted in legs, not routes: a set's first route simulates its early
   * legs and every later one only its last, so a cost per route measured early in a run was the wrong
   * cost for the rest of it (deadlineEstimate.ts, "Counted in legs"). Recorded at the run's
   * time-weighted worker count (the slider stays live), from the time it ran less any suspension.
   * The old per-route figure (`aap.deadlineWorkerSeconds`) is not read: it is a different unit.
   */
  const DEADLINE_SPEED_KEY = 'aap.deadlineWorkerSecondsPerLeg';
  const deadlineWorkerSeconds = ref(
    (() => {
      try {
        const n = Number(localStorage.getItem(DEADLINE_SPEED_KEY));
        return Number.isFinite(n) && n > 0 ? n : 0;
      } catch {
        return 0;
      }
    })()
  );
  function noteDeadlineSpeed(legs: number, seconds: number, workers: number): void {
    if (legs < 50 || !(seconds > 0) || !(workers > 0)) return;
    const ws = (seconds * workers) / contention(workers) / legs;
    if (!Number.isFinite(ws) || ws <= 0) return;
    deadlineWorkerSeconds.value = ws;
    try {
      localStorage.setItem(DEADLINE_SPEED_KEY, String(ws));
    } catch {
      // a nicety
    }
  }

  /** When the current deadline run started, and routes finished inside the batch in flight. */
  const deadlineStartedAt = ref(0);
  /** The panel's estimate of routes to price (spec.estimate), for progress shown off its screen. */
  const deadlineEstimate = ref(0);
  const deadlineInBatch = ref(0);
  /** Legs the workers have simulated this session (pool `legSims`; replayed routes cost none). */
  const deadlineLegSims = ref(0);
  /** The run's own plan in legs (spec.legPlan), null for a run started without one. */
  const deadlineLegPlan = ref<import('@/search/deadlineStore').DeadlineLegPlan | null>(null);
  /** Sets of early stops in the run, for counting its legs when it has no plan. */
  const deadlineSets = ref(0);
  /** `[unix ms, real legs simulated this session]`, at most one every 5 s, for the live rate
   *  (deadlineEstimate.ts `liveLegRate`, `addLegSample`). Real legs, from the workers: what a route
   *  really costs (the memo, the first round's early legs) is in them, and a carried-on run's replayed
   *  routes are not, so its rate is "measuring…" until the workers have done real work. */
  const deadlineLegSamples = ref<[number, number][]>([]);
  /** Routes this run replayed from a checkpoint (a carry-on): priced, but at no cost. */
  const deadlineReplayed = ref(0);
  /** Real legs and fresh routes since the first round ended, for the legs a later route really costs
   *  (`deadlineLaterPerRoute`). Halved as they grow, so the figure follows the run as sets finish. */
  let deadlineLaterLegs = { legs: 0, routes: 0, lastLegs: 0, lastRoutes: 0 };
  /** Measured real legs per route after the first round; 0 until enough of them. */
  const deadlineLaterPerRoute = ref(0);
  /** The running (or last) date search came from By a date's Simple mode (`DeadlineRunSpec.simple`). */
  const deadlineRunSimple = ref(false);

  /**
   * The memo capacity each worker keeps in a By a date run, for a pool of `workers`: the run's sets
   * and the first round's legs with sharing (deadlineEstimate.ts `deadlineMemoCapacity`). Worked out
   * once per worker count (the slider stays live).
   */
  function deadlineMemoFor(spec: DeadlineRunSpec, currentTE: number): (workers: number) => number {
    const bandSets = runBandSets(spec);
    const sets = bandSets?.length
      ? spaceSets(
          bandSets.map(b => ({ asc: b.length + 1, bands: b })),
          currentTE,
          spec.lastHi
        )
      : null;
    const count = sets ? sets.length : (spec.legPlan?.sets ?? spec.sets ?? 0);
    const byWorkers = new Map<number, number>();
    return workers => {
      let n = byWorkers.get(workers);
      if (n === undefined) {
        const firstLegs = sets ? firstRouteLegs(sets, workers) : (spec.legPlan?.firstLegs ?? 2 * count);
        n = deadlineMemoCapacity({ sets: count, firstLegs, workers });
        byWorkers.set(workers, n);
      }
      return n;
    };
  }

  /**
   * The estimate now: the first guess until enough sets have been tried, then worked out from where
   * each set's search stands (deadlineEstimate.ts). Counted on the routes priced as of the search's
   * last report, which is when its sets were counted; never below priced + in flight + a route for
   * every set still open.
   */
  const deadlineEstimateNow = computed(() =>
    estimateRoutes(deadlineProgress.value?.priced ?? 0, deadlineEstimate.value, deadlineProgress.value?.learn)
  );
  /**
   * ONE route total for the run, for the panel's count and bar, the cross-tab bar and the time left,
   * so the three cannot disagree. 0 when there is no estimate. Never below the routes already done,
   * and, before the search reports its sets, a route for every set still open on top.
   */
  const deadlineRoutesTotal = computed(() => {
    const p = deadlineProgress.value;
    const est = deadlineEstimateNow.value.total;
    if (!est) return 0;
    const done = (p?.priced ?? 0) + deadlineInBatch.value;
    return Math.max(est, done + (p?.learn ? 0 : Math.max(0, p?.open ?? 0)));
  });
  /** The run's sets and first-round legs: its plan's, else one leg a route (a run with no plan). */
  function legShape(): { sets: number; firstLegs: number } {
    const plan = deadlineLegPlan.value;
    if (plan && plan.sets > 0) return { sets: plan.sets, firstLegs: plan.firstLegs };
    const sets = deadlineProgress.value?.learn?.sets || deadlineSets.value || 1;
    return { sets, firstLegs: sets };
  }
  function noteLegSample(): void {
    const next = addLegSample(deadlineLegSamples.value, Date.now(), deadlineLegSims.value);
    if (next !== deadlineLegSamples.value) deadlineLegSamples.value = next;
  }
  /** Fresh routes (not replayed) priced so far this session. */
  function freshRoutes(): number {
    return Math.max(0, (deadlineProgress.value?.priced ?? 0) + deadlineInBatch.value - deadlineReplayed.value);
  }
  /** Count real legs against fresh routes once every set has had its first route (after round 1). */
  function noteLaterLegs(): void {
    const c = deadlineLaterLegs;
    const legs = deadlineLegSims.value;
    const routes = freshRoutes();
    const dl = legs - c.lastLegs;
    const dr = routes - c.lastRoutes;
    c.lastLegs = legs;
    c.lastRoutes = routes;
    const l = deadlineProgress.value?.learn;
    if (!l || !((l.round ?? 0) >= 1) || (l.untouched ?? 1) > 0 || dl < 0 || dr <= 0) return;
    c.legs += dl;
    c.routes += dr;
    if (c.routes > 8000) {
      c.legs /= 2;
      c.routes /= 2;
    }
    if (c.routes >= 200) deadlineLaterPerRoute.value = Math.max(1, c.legs / c.routes);
  }
  /**
   * ONE estimate of time, for the panel's box, its progress line, the cross-tab bar and the command
   * line, in REAL legs (what the workers simulate, the steady unit): the routes left of the shared
   * total (`deadlineRoutesTotal`), a set's first route at the first round's legs and every later one
   * at the legs a later route has really cost this run (the plan's figure until it has measured it),
   * over the real legs a second of the last 12 minutes (deadlineEstimate.ts `liveLegRate`: the planned
   * rate, `measuring`, until the workers have done real work; then blended toward the measured one
   * over its first 2 minutes). `firstGuess` is the run's own estimate at its start.
   */
  const deadlineTimeLeft = computed<{
    seconds: number;
    legsLeft: number;
    firstGuess: number | null;
    measuring: boolean;
  } | null>(() => {
    if (!deadlineRunning.value) return null;
    const total = deadlineRoutesTotal.value;
    if (!total) return null;
    const p = deadlineProgress.value;
    const done = (p?.priced ?? 0) + deadlineInBatch.value;
    const { sets, firstLegs } = legShape();
    const plan = deadlineLegPlan.value;
    // Sets with no route priced yet: from the search once it reports them (less the routes of the batch
    // in flight, which in the first round are those sets' first ones), else every set past those done.
    const untouched =
      p?.learn?.untouched !== undefined
        ? Math.max(0, p.learn.untouched - deadlineInBatch.value)
        : Math.max(0, sets - done);
    const laterLegs =
      deadlineLaterPerRoute.value ||
      plan?.laterLegs ||
      laterRouteLegs({ sets, firstLegs, workers: Math.max(1, deadlineWorkersInPool.value) });
    const left = legsLeft({ routesLeft: total - done, untouched, sets, firstLegs, laterLegs });
    const samples = deadlineLegSamples.value;
    const at = samples.length ? samples[samples.length - 1][0] : Date.now();
    const w = Math.max(1, deadlineWorkersInPool.value);
    const planned = plan && plan.workerSecondsPerLeg > 0 ? w / (plan.workerSecondsPerLeg * contention(w)) : null;
    const { rate, measuring } = liveLegRate(samples, at, planned);
    if (!rate) return null;
    return {
      seconds: left / rate,
      legsLeft: left,
      firstGuess: plan ? plan.seconds : null,
      measuring,
    };
  });
  /** The run's progress, 0-100, for the panel's bar and the cross-tab bar (deadlineEstimate.ts
   *  `deadlinePercent`): never full while there is real time left. Null without a total. */
  const deadlineProgressPercent = computed<number | null>(() => {
    const total = deadlineRoutesTotal.value;
    if (!total) return null;
    const p = deadlineProgress.value;
    return deadlinePercent((p?.priced ?? 0) + deadlineInBatch.value, total, deadlineTimeLeft.value?.seconds ?? null);
  });
  /**
   * Routes per set the last finished space run needed, remembered per SPACE SHAPE (ascension counts,
   * each box's width and step: deadlineEstimate.ts `spaceShapeKey`) for the next run on a space like
   * it. It used to be one figure for every space, so a run on wide boxes set the guess for narrow ones.
   */
  const DEADLINE_RATIO_KEY = 'aap.deadlineRoutesPerSetByShape';
  const deadlineRoutesPerSetByShape = ref<Record<string, number>>(
    (() => {
      try {
        const raw = JSON.parse(localStorage.getItem(DEADLINE_RATIO_KEY) ?? '{}') as Record<string, unknown>;
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw ?? {})) if (usableRatio(v)) out[k] = usableRatio(v);
        return out;
      } catch {
        return {};
      }
    })()
  );
  /** The remembered routes per set for a space of this shape, or 0. */
  function deadlineRoutesPerSet(bandSets: number[][][]): number {
    return deadlineRoutesPerSetByShape.value[spaceShapeKey(bandSets)] ?? 0;
  }
  function noteDeadlineRatio(learn: SetsLearned | undefined, shapeKey: string): void {
    if (!learn || learn.sets < 200 || learn.finishedSets < learn.sets) return;
    const r = usableRatio(learn.finishedRoutes / learn.sets);
    if (!r) return;
    // The latest 20 shapes.
    const next = { ...deadlineRoutesPerSetByShape.value };
    delete next[shapeKey];
    next[shapeKey] = r;
    const keys = Object.keys(next);
    for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete next[k];
    deadlineRoutesPerSetByShape.value = next;
    try {
      localStorage.setItem(DEADLINE_RATIO_KEY, JSON.stringify(next));
    } catch {
      // a nicety
    }
  }
  /** Every route the last run found (each shape's best), for the CSV. Not persisted: large. */
  let deadlineAll: DeadlineRoute[] = [];

  /** The last deadline run as CSV: every route found, best first. */
  function deadlineCsv(opts: { diagnostics?: boolean } = {}): string {
    const r = deadlineResult.value;
    if (!r) return '';
    const routes = deadlineAll.length ? deadlineAll : r.routes;
    return buildDeadlineCsv(
      routes,
      { ...deadlineCsvMeta(r, r.ceiling ?? r.lastHi), ...(opts.diagnostics ? { diagnostics: diagnosticsLine() } : {}) },
      { deadline: r.deadline, priced: r.priced, stoppedEarly: r.stoppedEarly, ascendNeeded: r.ascendNeeded }
    );
  }

  /**
   * The By a date CSV's metadata: the same as the chain-search CSV's, read off the settings the run
   * started with (a saved result carries them), falling back to the current ones for results saved
   * before they were. `r` is a finished result, or the run going now (a progress send's CSV so far).
   */
  function deadlineCsvMeta(
    r: Pick<SavedDeadlineResult, 'planStart' | 'te' | 'note' | 'settings'>,
    final: number,
    partial?: CsvMeta['partial']
  ): CsvMeta {
    const raw = (deadlineBackup ?? getSimulationContext().rawBackup ?? null) as
      | ReturnType<typeof getSimulationContext>['rawBackup']
      | null;
    const equipped = raw ? getArtifactLoadoutFromBackup(raw) : null;
    const st = r.settings;
    return {
      ...(partial ? { partial } : {}),
      planStart: r.planStart,
      timezone: planTimezone(),
      currentTE: r.te,
      final,
      effort: st?.effort ?? usedSettings().effort,
      firstAscension: readFirstAscension(st ?? usedSettings()),
      availability: st ? st.availability : usedSettings().availability,
      timeOff: usableTimeOff(st ? st.timeOff : usedSettings().timeOff),
      seedChain: [],
      runNote: r.note,
      inventory: raw ? describeVirtueInventory(raw) : undefined,
      loadouts: [
        { label: 'equipped in the backup', loadout: equipped },
        { label: 'best earnings set available', loadout: raw ? getOptimalEarningsSet(raw) : null },
      ],
    };
  }

  // ------------------------------------------------------------------ the black box (search/blackBox.ts)

  /** What the previous page was doing when it stopped without finishing, read once at load. */
  const lastCrash = ref(typeof window !== 'undefined' ? blackBox.readUnfinished() : null);
  // Another tab with a run going holds the run lock, and its beat is in the shared box: that run is
  // alive, not crashed. Without this, opening a second tab said the browser had killed the first.
  if (lastCrash.value && typeof navigator !== 'undefined') {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    void locks
      ?.query()
      .then(state => {
        if (state.held?.some(l => l.name === 'ascension-planner:chain-search')) lastCrash.value = null;
      })
      .catch(() => {});
  }
  function dismissCrash(): void {
    blackBox.clearUnfinished();
    lastCrash.value = null;
  }
  /** The running pool's worker memory for a beat; nothing when no pool is up. Never throws. */
  function workerMemory(p: ChainSearchPool | null): Partial<
    ReturnType<typeof blackBox.summarizeWorkerHeaps> & {
      workersMemoEntries: number | null;
      workersMemoCapacity: number | null;
    }
  > {
    try {
      return p
        ? {
            ...blackBox.summarizeWorkerHeaps(p.workerHeaps()),
            workersMemoEntries: blackBox.sumMemoEntries(p.workerMemoEntries()),
            workersMemoCapacity: blackBox.sumMemoEntries(p.workerMemoCapacities?.() ?? []),
          }
        : {};
    } catch {
      return {};
    }
  }
  function blackBoxBeat(): void {
    let b: blackBox.Beat | null = null;
    // What the run is really using: the live pool's size, or before the pool exists the count it is about
    // to be built at (`workersInPool` still holds the last run's, or the machine's default, until then,
    // which made a carried-on run's first beat read the full count it was about to be started without).
    let workers = pool?.size ?? workerBudget.value;
    if (deadlineRunning.value) {
      const p = deadlineProgress.value;
      workers = deadlinePool?.size ?? workerBudget.value;
      b = blackBox.beat({
        phase: 'deadline search',
        detail: p?.stage,
        done: (p?.priced ?? 0) + deadlineInBatch.value,
        workers,
        ...workerMemory(deadlinePool),
        ...(deadlineNote ? { runNote: deadlineNote } : {}),
      });
    } else if (isRunning.value) {
      b = blackBox.beat({
        phase: 'search',
        detail: stage.value,
        done: chainsDone.value,
        total: chainsEstimated.value,
        workers,
        entries: liveCache.length,
        ...workerMemory(pool),
        ...(runNoteUsed ? { runNote: runNoteUsed } : {}),
      });
    }
    // The "Stepping away?" heartbeat and fewer-workers rule (composables/useStepAway.ts).
    if (b)
      stepAwayBeat({
        done: b.done ?? 0,
        workers,
        heapMB: b.heapMB,
        heapLimitMB: b.heapLimitMB,
        workersHeapMB: b.workersHeapMB,
      });
  }
  /**
   * Each kind of run that is going in ANOTHER tab or window of this browser right now
   * (search/stepAway.ts `runAliveElsewhere`): its panel then says so instead of offering to carry it
   * on, which would run the same search twice. Read from the run mark and the run lock: again every
   * 15 s, whenever another tab writes the mark (the `storage` event, so a beat or an end there shows
   * here at once), and when a panel looks for an unfinished run.
   */
  const runElsewhere = ref<Record<RunKind, boolean>>({ smart: false, sweep: false, deadline: false });
  let elsewhereAccount = '';
  async function refreshRunElsewhere(): Promise<void> {
    if (typeof window === 'undefined') return;
    let lockHeld = false;
    try {
      const locks = (navigator as Navigator & { locks?: LockManager }).locks;
      const state = await locks?.query();
      lockHeld = !!state?.held?.some(l => l.name === 'ascension-planner:chain-search');
    } catch {
      // no Web Locks here: the heartbeat alone decides
    }
    try {
      elsewhereAccount = currentPlayerId ? await hashID(currentPlayerId) : '';
    } catch {
      elsewhereAccount = '';
    }
    const mark = readRunMark();
    const now = Date.now();
    const runningHere = isRunning.value || deadlineRunning.value || preparing.value;
    const at = (kind: RunKind) =>
      runAliveElsewhere({ mark, kind, account: elsewhereAccount, now, lockHeld, runningHere });
    const next = { smart: at('smart'), sweep: at('sweep'), deadline: at('deadline') };
    const was = runElsewhere.value;
    if (next.smart !== was.smart || next.sweep !== was.sweep || next.deadline !== was.deadline)
      runElsewhere.value = next;
  }
  if (typeof window !== 'undefined') {
    setInterval(() => void refreshRunElsewhere(), 15_000);
    window.addEventListener('storage', e => {
      if (e.key === RUN_KEY) void refreshRunElsewhere();
    });
    void refreshRunElsewhere();
  }
  watch(
    () => isRunning.value || deadlineRunning.value,
    () => void refreshRunElsewhere()
  );

  installStepAway({
    workerBudget,
    machineThreads,
    account: async () => (currentPlayerId ? hashID(currentPlayerId) : ''),
    log: line => {
      if (isRunning.value) runLog.value.push(line);
    },
  });
  let blackBoxTimer: ReturnType<typeof setInterval> | null = null;
  watch(
    () => isRunning.value || deadlineRunning.value,
    running => {
      if (blackBoxTimer) clearInterval(blackBoxTimer);
      blackBoxTimer = null;
      if (running) {
        void stepAwayRunStarted(deadlineRunning.value ? 'deadline' : searchSpace.value ? 'sweep' : 'smart').then(
          blackBoxBeat
        );
        blackBoxBeat();
        blackBoxTimer = setInterval(blackBoxBeat, 15_000);
      } else {
        stepAwayRunEnded(stoppedEarly.value || deadlineStop);
        blackBox.end('search');
        blackBox.end('deadline search');
      }
    }
  );
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      blackBox.pageClosing();
      stepAwayPageClosing();
    });
    window.addEventListener('pageshow', e => {
      if (e.persisted) blackBox.pageShown();
    });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!isRunning.value && !deadlineRunning.value) return;
      blackBox.note(document.visibilityState === 'hidden' ? 'tab hidden' : 'tab visible');
      blackBoxBeat();
    });
  }
  /** For the panels' own risky steps (building and sending a submission). */
  function blackBoxMark(phase: string, detail?: string): void {
    blackBox.beat({
      phase,
      detail,
      entries: liveCache.length,
      workers: pool?.size ?? workerBudget.value,
      ...workerMemory(pool ?? deadlinePool),
    });
  }
  function blackBoxEnd(phase: string): void {
    blackBox.end(phase);
  }
  /** Everything worth sending in a bug report, as JSON text. */
  function blackBoxReport(): string {
    return JSON.stringify(
      {
        note: 'ascension-planner black box: what the page was doing when it stopped',
        unfinished: lastCrash.value,
        ...(runNoteUsed ? { runNote: runNoteUsed } : {}),
        userAgent: navigator.userAgent,
        cores: machineThreads,
        workers: workerBudget.value,
        at: new Date().toISOString(),
      },
      null,
      2
    );
  }

  function stopDeadline(): void {
    deadlineStop = true;
    stepAwayStopPressed();
  }

  async function benchmarkMachine(playerId: string, spec: ExhaustiveSpec): Promise<void> {
    if (isRunning.value || benchmarking.value) return;

    benchmarking.value = true;
    benchmarkError.value = null;
    let bench: ChainSearchPool | null = null;
    try {
      const chunkSize = Math.max(clampPoolSize(workerBudget.value) * 2, 32);
      const built = buildChainsForSpec(spec, chunkSize);
      if (built.error) {
        benchmarkError.value = built.error;
        return;
      }

      bench = await createChainSearchPool(collectInputs(), { size: workerBudget.value });
      const probeStartedAt = performance.now();
      const { results } = await bench.evaluate(built.chains);
      const elapsedSeconds = (performance.now() - probeStartedAt) / 1000;

      if (!results.length) {
        benchmarkError.value = 'No chains in this batch could be evaluated, so there is nothing to benchmark.';
        return;
      }

      secondsPerChain.value = elapsedSeconds / results.length;
      rateWorkers.value = bench.size;
      rateSource.value = 'benchmark';
      benchmarkedAt.value = Date.now();
      benchmarkChainCount.value = results.length;
      saveChainBenchmark(playerId, {
        secondsPerChain: secondsPerChain.value,
        source: 'benchmark',
        at: benchmarkedAt.value,
        chainCount: results.length,
        workers: workerBudget.value,
        currentTE: currentTE.value,
        finalTE: finalTE.value,
      });
    } catch (e) {
      benchmarkError.value = describeRunError(e);
    } finally {
      bench?.terminate();
      benchmarking.value = false;
    }
  }

  /**
   * Restores a rate measured in an earlier session, so the estimate does not fall back to the 15 s
   * assumption on every reload. Only ever applied on top of "nothing measured yet" — a rate this
   * session has already established, live or benchmarked, is never overwritten by a stale one.
   */
  function restoreBenchmark(playerId: string): void {
    if (isRunning.value || secondsPerChain.value) return;
    const cached = loadChainBenchmark(playerId);
    if (!cached) return;
    secondsPerChain.value = cached.secondsPerChain;
    rateWorkers.value = cached.workers || workerBudget.value;
    rateSource.value = cached.source;
    benchmarkedAt.value = cached.at;
    benchmarkChainCount.value = cached.chainCount;
  }

  /**
   * Keep the browser from freezing this tab while a run is in flight.
   *
   * Chromium's freezing policy has an explicit opt-out list, and one entry on it is a page "holding
   * a Web Lock or an IndexedDB transaction". So a lock held for the life of the run is not a
   * workaround -- it is the documented way to say "this tab is doing something". Without it, a
   * backgrounded tab that has been hidden and silent for five minutes is a candidate for freezing,
   * which is why a run left overnight can be found stopped in the morning with nothing in the log.
   *
   * WHAT THIS DOES NOT DO, and there is no API that does: it cannot prevent DISCARDING. Memory
   * Saver kills a background tab outright under memory pressure, there is no event before it, and
   * the page only learns about it afterwards via `document.wasDiscarded` on the reload. The
   * defences against that are the checkpoint and the memory budget, not this.
   *
   * Best-effort throughout. `navigator.locks` is absent in older browsers and the request can be
   * refused; a run that cannot take a lock still runs.
   */
  let releaseRunLock: (() => void) | null = null;

  function holdRunLock(): void {
    if (releaseRunLock) return;
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) return;
    try {
      // Resolved with a promise the lock is held until: `request` keeps the lock for as long as the
      // callback's promise is pending, so the release function is the resolver.
      void locks.request(
        'ascension-planner:chain-search',
        () =>
          new Promise<void>(resolve => {
            releaseRunLock = resolve;
          })
      );
    } catch {
      /* A run without a lock is a run that might get frozen, not a run that cannot start. */
    }
  }

  function dropRunLock(): void {
    releaseRunLock?.();
    releaseRunLock = null;
  }

  /**
   * Keep the SCREEN awake while a run is visible.
   *
   * A different problem from the Web Lock above, with a different owner. The lock argues with the
   * browser about freezing a backgrounded tab; this argues with the operating system about dimming
   * and locking the display, which on a desktop is usually the step before the machine suspends --
   * and a suspended machine stops everything, workers included. It is the difference between a run
   * that is slower in the morning and a run that did nothing for six hours.
   *
   * ONLY WORKS WHILE THE TAB IS VISIBLE, by design of the API: the lock is released automatically
   * when the tab is hidden or the window minimised, and cannot be taken again until it is back. So
   * it is re-requested on `visibilitychange` rather than taken once, and a run left with the tab in
   * the background genuinely has no screen lock -- there is no API that does.
   *
   * IT DOES NOT STOP THE MACHINE SLEEPING ON ITS OWN TERMS. A sleep timer that fires regardless of
   * display state, a lid close, or a manual sleep will still suspend everything; the run resumes
   * where it left off from the checkpoint, and `onSuspend` reports the gap rather than pretending it
   * did not happen. The README says which OS setting actually covers that.
   */
  let screenLock: WakeLockSentinel | null = null;

  async function holdScreenLock(): Promise<void> {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!keepAwake.value || !wakeLock || screenLock || document.visibilityState !== 'visible') return;
    try {
      screenLock = await wakeLock.request('screen');
      // The browser releases it on its own when the tab hides; drop our handle so the
      // visibilitychange path knows to ask again rather than believing it still holds one.
      screenLock.addEventListener('release', () => {
        screenLock = null;
      });
    } catch {
      /* Refused, unsupported, or the tab lost visibility mid-request. Not worth failing a run for. */
    }
  }

  function dropScreenLock(): void {
    void screenLock?.release().catch(() => {});
    screenLock = null;
  }

  /** Flipping the toggle mid-run takes effect immediately, rather than waiting for the next
   *  visibility change to notice. */
  watch(keepAwake, on => {
    if (!isRunning.value) return;
    if (on) void holdScreenLock();
    else dropScreenLock();
  });

  /**
   * Checkpoint when the tab is hidden, not only on the timer.
   *
   * `visibilitychange` is the last event a page is guaranteed to get: `beforeunload` and `unload`
   * do not fire when a tab is discarded, so anything that waits for them loses the run. Going
   * hidden is also the moment the tab becomes eligible for everything that can kill it, which makes
   * it the one point where a save is worth paying for off-schedule.
   */
  function onVisibilityChange(): void {
    // Read by `targetWorkers`, so the background setting slows a deadline run as well as the others.
    tabHidden.value = document.visibilityState === 'hidden';
    if (!isRunning.value && !deadlineRunning.value) return;
    if (document.visibilityState === 'hidden') {
      if (isRunning.value) void persist(liveCache, true);
    }
    // Coming back into view is the only moment a screen lock can be taken again.
    else void holdScreenLock();
  }

  /** `options.recheck`: as in `startExhaustive` -- the run will send itself when it finishes. */
  async function start(playerId: string, options: { resume?: boolean; recheck?: boolean } = {}): Promise<void> {
    if (isRunning.value || preparing.value || recheckingLatest.value) return;
    if (singleAscensionAsked.value && !options.resume) return;
    if (refuseUnsettledSave()) return;
    currentPlayerId = playerId;
    // Captured NOW: loading a stored save moves the TE, a panel watcher re-reads the checkpoint, and
    // `resumable` is briefly null while it does -- which made a resume quietly start from scratch.
    const resumeFrom = options.resume ? resumable.value : null;
    // Before anything reads `planStart`: the checkpoint only matches under its own clock -- and,
    // when it kept its save, only on that save.
    let own: SearchInputs | undefined;
    if (resumeFrom) {
      preparing.value = true;
      let got: SearchInputs | 'current' | null;
      try {
        got = await prepareToCarryOn(playerId, resumeFrom);
      } finally {
        preparing.value = false;
      }
      if (!got) return;
      if (got !== 'current') own = got;
    }
    recheckPriced = new Map();
    recheckFetch = null;
    // A carry-on keeps its run's best so far on the board to replace; a fresh run has none.
    setProvisional('fastest', takeCarriedProvisional());

    error.value = null;
    errorBeforeStart.value = false;
    stopRequested.value = false;
    stoppedEarly.value = false;
    isRunning.value = true;
    startedAt.value = Date.now();
    chainsDone.value = 0;
    chainsReplayed.value = 0;
    runLog.value = [];
    // A staged run proves nothing over a stated space, and must not inherit the last one's.
    searchSpace.value = null;
    runSweepTag = null;
    runNoteUsed = cleanNote(runNote.value);
    secondsPerChain.value = 0;
    rateSource.value = null;
    // A fresh run's export must not carry the previous run's rows: the settings that give every
    // duration its meaning (plan start, excluded hours, final target) may all have changed.
    liveCache = [];
    coarseCache = [];
    resetChartData();
    openedRun.value = null;
    csvRows.value = 0;
    shortlist.value = [];
    lastShortlistAt = 0;
    batchDone.value = 0;
    batchTotal.value = 0;
    suspendedSeconds.value = 0;
    longestStallSeconds.value = 0;
    runStartedAt.value = Date.now();
    runEndedAt.value = 0;
    lastCheckpointAt = 0;
    lastRateAt = Date.now();
    lastRateChains = 0;

    planStartUsed.value = planStart.value;
    const startInputs = own ?? collectInputs();
    // The first ascension as the workers' inputs price it (a carry-on's stored ones keep their own).
    runSettingsUsed.value = { ...snapshotSettings(), firstAscension: readFirstAscension(startInputs) };
    runTEUsed = startInputs.currentTE;
    accountUsed = accountFields(startInputs.currentTE);
    runBackupUsed = getSimulationContext().rawBackup ?? null;
    const chain = seedChain.value;
    chainsEstimated.value = estimateChains(Math.max(1, chain.length - 1), EFFORT[effort.value]);
    bestChain.value = [...chain];
    bestDays.value = 0;
    bestLegs.value = [];
    stage.value = 'starting workers';
    detail.value = '';

    if (!own) resultsFromOlderSave.value = null;
    latestRecheck.value = null;
    const startKey = runSaveKey(startInputs);
    let restoredCache: CacheEntry[] | undefined;
    let cacheAtEnd: CacheEntry[] = [];
    // Chains already priced before the driver starts, so its own 0-based counter does not
    // make the progress bar jump backwards after the coarse scan.
    let chainsBase = 0;
    try {
      partitionHash = await hashID(playerId);
      runFingerprint = fingerprint(playerId);
      // Checked again AFTER the await: anything that moved the inputs meanwhile (a backup landing
      // and rewriting the start boxes) would otherwise save old durations under a new fingerprint.
      if (
        resumeFrom &&
        resumeFrom.fingerprint === runFingerprint &&
        (!resumeFrom.inputsKey || resumeFrom.inputsKey === startKey)
      ) {
        restoredCache = restoreEntries(resumeFrom);
        bestChain.value = [...resumeFrom.bestChain];
        bestDays.value = resumeFrom.bestSeconds / 86400;
        bestLegs.value = resumeFrom.bestLegs;
        chainsReplayed.value = restoredCache.length;
        detail.value = `resumed with ${restoredCache.length} chains already priced`;
        // Seed the export with what we replayed, so a CSV taken before the first batch reports the
        // replayed chains (durations only - a checkpoint keeps legs for the best chain alone).
        liveCache = [...restoredCache];
        csvRows.value = liveCache.length;
        refreshShortlist(true);
      }
    } catch (e) {
      console.warn('chain search: could not prepare storage', e);
    }

    // REFUSE rather than warn. A run started against a half-loaded save produces a complete,
    // confident, wrong answer after hours of CPU, and the operator cannot tell from the result --
    // which is how this was found in the first place, from a CSV rather than from the app.
    const review = reviewRunInputs(startInputs);
    runNotes.value = review.filter(i => i.level === 'warning').map(i => i.message);
    if (saveAgeNote.value?.level === 'warning') runNotes.value.push(saveAgeNote.value.text);
    const blocking = review.filter(i => i.level === 'error');
    if (blocking.length) {
      error.value = blocking[0].message;
      errorBeforeStart.value = true;
      isRunning.value = false;
      stage.value = 'idle';
      return;
    }
    await storeRunSave(startInputs, startKey);

    holdRunLock();
    void holdScreenLock();
    document.addEventListener('visibilitychange', onVisibilityChange);
    tabHidden.value = document.visibilityState === 'hidden';
    try {
      pool = await createChainSearchPool(startInputs, {
        size: workerBudget.value,
        onSuspend: gap => {
          suspendedSeconds.value += gap;
          longestStallSeconds.value = Math.max(longestStallSeconds.value, gap);
          runLog.value.push(
            `--- the browser suspended this tab for ${Math.round(gap / 60)} minutes; nothing ran in that time`
          );
        },
      });
      workersInPool.value = pool.size;
      // The workers the first sweep (the last checkpoint's 25 values and the seed) will use start
      // while worker 0 checks the account, rather than all at once when that sweep is dealt.
      pool.warm(workersForBatch(FIRST_SWEEP_CHAINS, pool.size));
      startWorkerClock();
      if (!(await checkIntegrity(pool))) return;
      stage.value = 'running';

      // Stages 2-3. One wide batch, so it is also the stage that parallelises best.
      let seed = chain;
      if (findSeedFirst.value) {
        stage.value = 'coarse scan';
        coarseLog.value = [];
        const coarse = await findStartingChain({
          currentTE: startInputs.currentTE,
          final: finalTE.value,
          minPrestiges: minPrestiges.value,
          maxPrestiges: maxPrestiges.value,
          evaluateBatch: chains => pool!.evaluate(chains, noteBatch),
          shouldStop: () => stopRequested.value,
          onProgress: (done, total, d) => {
            chainsDone.value = done;
            chainsEstimated.value = total + estimateChains(Math.max(1, chain.length - 1), EFFORT[effort.value]);
            detail.value = d;
            noteRate(done);
          },
          onResults: results => {
            for (const r of results) coarseCache.push({ key: r.chain.join(','), seconds: r.seconds, legs: r.legs });
            csvRows.value = coarseCache.length;
          },
        });
        coarseLog.value = coarse.log;
        seed = coarse.seed;
        bestChain.value = [...seed];
        bestDays.value = (coarse.byCount.find(c => c.chain.length === seed.length)?.seconds ?? 0) / 86400;
        chainsEstimated.value =
          coarse.chainsEvaluated + estimateChains(Math.max(1, seed.length - 1), EFFORT[effort.value]);
        chainsBase = coarse.chainsEvaluated;
        noteRate(chainsBase, true);
      }

      stage.value = 'running';
      // The rate is measured from here: start-up (workers, the integrity check) is behind us and is
      // not what the rest of the run costs per chain. The first sample used to include it.
      noteRate(chainsBase, true);
      // Chains the driver has had priced, batch by batch, so the count moves WITHIN a batch (the
      // workers' heartbeats) instead of only when the driver next reports: the bar sat on "1 of
      // ~606" through the whole first sweep (9 Oct). Driver-relative, like `p.chainsDone`.
      let pricedBefore = 0;
      const evaluateLive = async (chains: number[][]) => {
        noteBatch(0, chains.length);
        try {
          return await pool!.evaluate(chains, (done, total) => {
            noteBatch(done, total);
            chainsDone.value = Math.max(chainsDone.value, pricedBefore + done);
          });
        } finally {
          pricedBefore += chains.length;
          // A rate sample per batch, so the first time estimate is the first real batch's pace
          // (every worker going) rather than whatever the driver's first report happened to cover.
          noteRate(chainsBase + pricedBefore);
        }
      };
      const outcome = await runChainSearch({
        seedChain: seed,
        final: finalTE.value,
        currentTE: startInputs.currentTE,
        effort: effort.value,
        pin: pin.value,
        // Normally the driver's own default (`final - 150`). Exposed so the cap can be tested
        // rather than assumed: it was measured against 490 targets, and this repo's own f1-f4
        // corpus contains a 320-target optimum whose last checkpoint sits at `final - 43`, which
        // the default would put out of reach. Null leaves the driver's behaviour untouched.
        ...(maxLastOverride.value !== null ? { maxLast: maxLastOverride.value } : {}),
        // Without these the probe defaulted to "one either side of the seed", which quietly
        // overrode whatever the user asked for in the range above.
        minCheckpoints: minPrestiges.value,
        maxCheckpoints: maxPrestiges.value,
        evaluateBatch: evaluateLive,
        restoredCache,
        shouldStop: () => stopRequested.value,
        onProgress: p => {
          if (p.stage !== stage.value) runLog.value.push(`--- ${p.stage}`);
          if (p.detail && p.detail !== detail.value) {
            runLog.value.push(p.detail);
            if (runLog.value.length > 2000) runLog.value.splice(0, runLog.value.length - 2000);
          }
          stage.value = p.stage;
          detail.value = p.detail;
          chainsDone.value = p.chainsDone;
          chainsEstimated.value = Math.max(p.chainsEstimated, p.chainsDone);
          bestChain.value = p.bestChain;
          bestDays.value = p.bestDays;
          // Keep whatever we had if this progress tick has not priced the leader yet,
          // so the table does not flicker empty between stages.
          if (p.bestLegs.length) bestLegs.value = p.bestLegs;
          noteRate(chainsBase + p.chainsDone);
        },
        onCache: entries => {
          cacheAtEnd = entries;
          liveCache = entries;
          csvRows.value = coarseCache.length + entries.length;
          refreshShortlist();
          void persist(entries);
        },
      });

      bestChain.value = outcome.chain;
      bestDays.value = outcome.seconds / 86400;
      bestLegs.value = outcome.legs;
      lastCompletedStage.value = outcome.lastCompletedStage;
      stoppedEarly.value = outcome.stoppedEarly;
      chainsDone.value = outcome.chainsEvaluated;
      // A run that evaluated nothing did not fail - it replayed a checkpoint that already
      // covered its whole trajectory, which is exactly what the resume banner promises. Saying
      // plain "done" next to "0 / ~404 chains" reads as a crash, so say what happened.
      secondsPerChain.value = 0;
      rateSource.value = null;
      // Force a final write marked complete, so the panel stops offering a finished run as
      // something to resume - which is what made it look like Resume had done nothing.
      //
      // AWAITED, not fire-and-forget. `finally` re-reads the checkpoint to refresh the
      // banner, and an un-awaited write lost that race every time: the banner kept showing
      // the pre-run record - "468 chains were already priced (1h ago)" next to a DONE line
      // reading 483 - so a finished run still advertised itself as unfinished.
      await persist(cacheAtEnd, true, !outcome.stoppedEarly);
      refreshShortlist(true);
      stage.value = outcome.stoppedEarly
        ? 'stopped'
        : outcome.chainsEvaluated === 0
          ? 'done - every chain it needed was already priced'
          : 'done';
      if (options.recheck && !outcome.stoppedEarly && bestDays.value > 0 && pool) {
        const finalStage = stage.value;
        stage.value = 're-checking your earlier plans for the board';
        await recheckBeforeTheEnd(pool);
        stage.value = finalStage;
      }
    } catch (e) {
      error.value = describeRunError(e);
      stage.value = 'failed';
    } finally {
      runEndedAt.value = Date.now();
      pool?.terminate();
      pool = null;
      isRunning.value = false;
      stopRequested.value = false;
      batchDone.value = 0;
      batchTotal.value = 0;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      dropRunLock();
      dropScreenLock();
      await checkResumable(playerId);
    }
  }

  /** Ask the run to stop at the next batch boundary. Because the stages are nested, whatever is on
   *  screen at that moment is already a usable answer — that is the property the UI advertises. */
  function stop(): void {
    stopRequested.value = true;
    stepAwayStopPressed();
    stage.value = 'stopping after the current batch...';
    // A queued Full sweep stops after this chain whichever Stop was pressed (the panel's, or the
    // progress bar's on another tab, where the panel isn't there to hear it).
    if (sweepQueue.value.at >= 0) sweepQueue.value.cancelled = true;
  }

  /**
   * Send a chain to the Auto Planner as the plan to generate.
   *
   * Until now the only route from a finished search to an actual plan was reading the winning
   * chain off the screen and retyping it into the Target TE box in a different card. That is a
   * transcription step between a three-hour computation and the thing it was computed for, and
   * `195 219 248 277 286 327` is exactly the kind of string a person fat-fingers.
   *
   * The WHOLE chain goes across, final target included. An earlier version stripped it here on the
   * assumption that the Auto Planner appends the goal itself — it does not. `getTargets()` in
   * useAscensionGenerator is a bare whitespace split of this field, so dropping 490 produced a plan
   * that stopped at 332: six ascensions instead of seven, and 158 truth eggs short of the goal the
   * search had just spent an hour optimising for.
   */
  /**
   * Bumped by `applyChain` when the caller wants the plan built too.
   *
   * A counter rather than a boolean because two applies in a row must both fire, and a signal
   * rather than a direct call because `useAscensionGenerator` is a COMPOSABLE: calling it from
   * here would create a second instance with its own `isGenerating`/`generateProgress`, so the
   * Auto Planner's own progress UI would sit idle while the work happened invisibly. AutomaticPlanner
   * watches this and calls the instance it already owns.
   */
  const generateRequested = ref(0);

  /**
   * `opts`, for a route that did not come from this store's last run (the instant answer's "Open this
   * plan"): `start`, the plan start it was priced from (instead of `planStartUsed`, the last run's),
   * and `legs`, its simulated ascensions (for time off), since it is in none of this run's caches.
   */
  function applyChain(chain: number[], alsoGenerate = false, opts?: { start?: number; legs?: LegSummary[] }): void {
    const planner = useAutoPlannerStore();
    // Results priced on a run's own older save, with the latest save loaded since ("Load my latest
    // save"): the old run's start is from before this save existed, and its time-off instants belong
    // to that start. The plan is built on the save that is loaded, from its own start, and says so.
    const olderResults = !opts?.start && !!resultsFromOlderSave.value && !useUIStore().runSaveLoaded;
    // Pin the planner to the start this answer was computed against. Without it the plan can be
    // built from a different instant entirely (see `planStartUsed`), and every date in it would be
    // answering a question the search never asked.
    const pinTo = opts?.start || planStartUsed.value;
    if (pinTo && !olderResults) {
      const tz = planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const [d, t] = formatInZone(pinTo, tz).split(' ');
      if (d && t) {
        planner.startDate = d;
        planner.startTime = t;
      }
    }
    // TIME OFF. The search priced this route with each stretch of time off cutting the ascension in
    // progress short and a rebuild after it (chain.ts `priceStep`), but the plan builder only knew
    // the chain -- so "Apply" produced a plan that farmed straight through the days off, with dates
    // that matched nothing the search had said. Now the plan gets the ascensions the search
    // actually simulated: the cut one ending when the time off starts, the next starting after it.
    const key = chain.join(',');
    const legs =
      opts?.legs ??
      (bestChain.value.join(',') === key && bestLegs.value.length
        ? bestLegs.value
        : ([...liveCache, ...coarseCache].find(e => e.key === key)?.legs ?? []));
    applyNote.value = '';
    olderSaveNote.value = null;
    if (olderResults) {
      planner.targetTE = key.split(',').join(' ');
      planner.timeOffCuts = null;
      olderSaveNote.value = { targets: planner.targetTE, text: '' };
      applyNote.value = `This route was priced on your older save (TE ${resultsFromOlderSave.value?.te}), and your latest save is loaded now, so the plan is built on the latest save from its own start: its dates can differ from the search's${legs.some(l => l.timeOff) ? ", and your time off isn't worked in" : ''}. Re-check on the latest save, or run again, for dates that match.`;
      olderSaveNote.value.text = applyNote.value;
    } else if (legs.some(l => l.timeOff)) {
      const targets = legs.map(l => l.endTE);
      const ends: Record<number, number> = {};
      const starts: Record<number, number> = {};
      legs.forEach((l, i) => {
        if (l.timeOff === 'stopped') ends[i] = l.endTime;
        if ((l.timeOff === 'restarted' || l.afterTimeOff) && l.startTime) starts[i] = l.startTime;
      });
      planner.targetTE = targets.join(' ');
      planner.timeOffCuts = {
        targets: targets.join(' '),
        ends,
        starts,
        ...(planner.startDate && planner.startTime ? { start: `${planner.startDate} ${planner.startTime}` } : {}),
      };
      const tz = planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const stops = Object.keys(ends).map(i => `A${+i + 1} ends ${showDateTime(ends[+i], tz)} at ${legs[+i].endTE} TE`);
      applyNote.value = `The plan includes your time off: ${stops.join('; ')}, and the ascension after each starts when the time off is over.`;
    } else {
      planner.targetTE = key.split(',').join(' ');
      planner.timeOffCuts = null;
      if (usableTimeOff(timeOff.value).length && !legs.length) {
        applyNote.value =
          "This route's leg detail isn't kept (only the fastest routes keep it), so the plan can't show where your time off cuts it. Use one of the top routes, or re-run to price it again.";
      }
    }
    // The seed box keeps the checkpoints WITHOUT the final target: `seedChain` appends `finalTE`
    // itself, so leaving it in would ask for it twice.
    seedOverride.value = chain.filter(v => v !== finalTE.value).join(' ');
    // The build the search took for A1, for Classic's pick under Prestige now (`classicFirstPick`).
    appliedFirstLeg = legs[0]?.key
      ? {
          targets: (planner.targetTE || '').trim().split(/\s+/).join(' '),
          key: legs[0].key,
          mode: usedSettings().firstAscension,
        }
      : null;
    patchAutoPlannerSchedule({
      targetTE: planner.targetTE,
      timeOffCuts: planner.timeOffCuts ? JSON.parse(JSON.stringify(planner.timeOffCuts)) : null,
      ...(pinTo ? { startDate: planner.startDate, startTime: planner.startTime } : {}),
    });
    if (alsoGenerate) generateRequested.value++;
  }

  /** What Apply did beyond copying the chain -- time off worked into the plan -- for the panels. */
  const applyNote = ref('');
  /** Apply's warning that it built on the latest save from results priced on an older one, for the
   *  Auto Planner (Insane's Build goes straight there), while its Target TE is still that chain. */
  const olderSaveNote = ref<{ targets: string; text: string } | null>(null);
  /** Set by Insane mode's "Build this plan": the Auto Planner is not on the page yet, so it builds
   *  the plan when it mounts rather than on the `generateRequested` signal it would miss. */
  const generateWhenPlannerOpens = ref(false);

  /**
   * Price `chain` from start times across the next `days` days, every `stepMinutes`, as fresh
   * ascensions (starting virtue), skipping hours outside the player's awake schedule. The results
   * are finish INSTANTS, which is what compares across start times.
   */
  async function findBestStart(chain: number[], opts: { days?: number; stepMinutes?: number } = {}): Promise<void> {
    if (busy.value || !chain.length) return;
    error.value = null;
    const inputs = collectInputs();
    const blocking = reviewRunInputs(inputs).filter(i => i.level === 'error');
    if (blocking.length) {
      error.value = blocking[0].message;
      return;
    }
    if (integrityBlocked.value) {
      error.value = integrityNotice.value?.text ?? "This account can't be planned yet.";
      return;
    }
    const step = Math.max(15, Math.floor(opts.stepMinutes ?? 60)) * 60;
    const days = Math.max(1, Math.min(14, opts.days ?? 7));
    const schedule = isConstrained(inputs.availability) ? inputs.availability : null;
    const first = Math.ceil(inputs.planStart / step) * step;
    const starts: number[] = [];
    for (let t = first; t < first + days * 86400; t += step) {
      // You can't start a run while you're asleep, so those hours aren't worth pricing.
      if (!schedule || nextAvailable(t, schedule) === t) starts.push(t);
    }
    startSweepRunning.value = true;
    startSweep.value = {
      chain: [...chain],
      step,
      done: 0,
      total: starts.length,
      results: [],
      stoppedEarly: false,
      at: Date.now(),
    };
    try {
      startSweepPool = await createChainSearchPool(inputs, { size: workerBudget.value });
      const secs = await startSweepPool.evaluateStarts(chain, starts, { fresh: true }, (done, total) => {
        if (startSweep.value) startSweep.value = { ...startSweep.value, done, total };
      });
      startSweep.value = {
        ...startSweep.value,
        done: starts.length,
        results: starts.map((s, i) => ({ start: s, finish: secs[i] === null ? null : s + (secs[i] as number) })),
      };
    } catch (e) {
      if (startSweep.value && !startSweepStopped) error.value = describeRunError(e);
      if (startSweep.value) startSweep.value = { ...startSweep.value, stoppedEarly: true };
    } finally {
      startSweepPool?.terminate();
      startSweepPool = null;
      startSweepStopped = false;
      startSweepRunning.value = false;
    }
  }
  let startSweepStopped = false;
  function stopStartSweep(): void {
    startSweepStopped = true;
    startSweepPool?.terminate();
  }

  /** Recompute the runners-up now — for the panel, when a run is not writing batches. */
  /** Switch view and rebuild immediately -- this reads the cache the run already has, so it is
   *  instant and costs no simulation. */
  function setShortlistView(view: ViewId): void {
    shortlistView.value = view;
    refreshShortlist(true);
  }

  function rebuildShortlist(): void {
    refreshShortlist(true);
  }

  async function discardCheckpoint(): Promise<void> {
    if (!partitionHash) return;
    await clearCheckpoint(partitionHash);
    resumable.value = null;
    blockedCheckpoint.value = null;
    await pruneSaves(null);
  }

  /**
   * One reading of whatever search is running, the same shape for all four kinds, for the progress
   * bar that follows the player across tabs (RunProgressBar.vue). They already shared this store,
   * the worker pool and the simulator; what differed was where each kept its count: Smart search and
   * the Full sweep in chainsDone/chainsEstimated (the sweep also counts the chunk in flight), a date
   * search in deadlineProgress with its estimate in its panel, and a start-time sweep in startSweep.
   * Time left is only here for the chain searches (a measured s/chain); the bar works the others out
   * from how fast they've gone so far. Null when nothing is running.
   */
  const runProgress = computed<RunProgress | null>(() => {
    if (startSweepRunning.value && startSweep.value) {
      const sw = startSweep.value;
      return {
        kind: 'start-times',
        stage: `trying ${sw.chain.join(' ')} from each start`,
        done: sw.done,
        total: sw.total || null,
        unit: 'start times',
        secondsLeft: null,
        startedAt: sw.at,
        stopping: false,
        best: null,
      };
    }
    if (deadlineRunning.value) {
      const p = deadlineProgress.value;
      const done = (p?.priced ?? 0) + deadlineInBatch.value;
      const best = p?.best ?? null;
      return {
        kind: 'by-date',
        stage: p?.stage ?? '',
        done,
        total: deadlineRoutesTotal.value || null,
        percent: deadlineProgressPercent.value,
        unit: 'routes',
        // The panel's own figure (legs left over the recent rate), not the bar's routes-so-far guess.
        secondsLeft: deadlineTimeLeft.value?.seconds ?? null,
        measuring: !!deadlineTimeLeft.value?.measuring,
        startedAt: deadlineStartedAt.value,
        stopping: false,
        best: best ? { chain: [...best.chain], te: best.chain[best.chain.length - 1], at: best.reachAt } : null,
      };
    }
    if (isRunning.value) {
      const full = !!searchSpace.value;
      const done = chainsDone.value + (full ? batchDone.value : 0);
      return {
        kind: full ? 'full' : 'smart',
        // Smart search: how far into this step's batch, so a long step (the first sweep, a wide
        // slice) visibly moves: "stage 4a: solving the last checkpoint · 12 of 26".
        stage:
          !full && batchTotal.value > 1 ? `${stage.value} · ${batchDone.value} of ${batchTotal.value}` : stage.value,
        done,
        total: chainsEstimated.value ? Math.max(chainsEstimated.value, done) : null,
        unit: 'chains',
        // A Full sweep: the one time left its panel shows too, the whole queue's, over fresh chains
        // only (`sweepLeft`); the count stays the chain running's, with "chain 1 of 3" beside it.
        secondsLeft: full ? (sweepLeft.value?.seconds ?? null) : secondsRemaining.value || null,
        // No rate until the first batch is back: say so rather than guess from the first chains,
        // which carry each worker's start (its shared early legs) and read hours too long.
        measuring: full ? !!sweepLeft.value?.measuring : !secondsPerChain.value,
        chain: full ? (sweepLeft.value?.chain ?? null) : null,
        startedAt: startedAt.value,
        stopping: stopRequested.value,
        best:
          bestDays.value > 0
            ? { chain: [...bestChain.value], te: finalTE.value, at: planStart.value + bestDays.value * 86400 }
            : null,
      };
    }
    return null;
  });

  /** Stop whatever is running, keeping its best so far: one Stop for the bar, whichever kind it is. */
  function stopRun(): void {
    if (startSweepRunning.value) stopStartSweep();
    else if (deadlineRunning.value) stopDeadline();
    else if (isRunning.value) stop();
  }

  // A run that isn't part of a Full sweep queue replaces the queue's table (the panel used to do this,
  // but only while it was on screen).
  watch(isRunning, running => {
    if (running && sweepQueue.value.at < 0) sweepQueue.value.results = [];
  });

  return {
    /** The coarse scan's chain count at the current limits (shown beside "Find a starting chain"). */
    coarseChains,
    lastAutoSend,
    errorIsIntegrityNotice,
    runProgress,
    stopRun,
    provisionalRows,
    runElsewhere,
    refreshRunElsewhere,
    bestSoFar,
    bestSoFarSending,
    bestSoFarStatus,
    bestSoFarWait,
    bestSoFarAutoLine,
    /** What the last progress send carried (read by the tests and the status line). */
    bestSoFarAuto,
    autoTick,
    beginBestSoFar,
    endBestSoFar,
    agreeBestSoFar,
    askBestSoFar,
    bestSoFarSettled,
    sendBestSoFar,
    sweepQueue,
    suggestedCount,
    suggestedRoute,
    instantRoutes,
    pricedCounts,
    instantSeed,
    submitsWhenDone,
    deadlineEstimate,
    deadlineEstimateNow,
    deadlineRoutesTotal,
    deadlineProgressPercent,
    deadlineRoutesPerSet,
    deadlineTimeLeft,
    deadlineRunSimple,
    deadlineLegSims,
    // settings
    effort,
    finalTE,
    firstAscension,
    firstAscensionChoice,
    firstAscensionFromClassic,
    setFirstAscension,
    firstAscensionFor,
    continueStartRule,
    firstAscensionState,
    restoreFirstAscension,
    classicFirstPick,
    classicFirstPickChanged,
    forceContinue,
    sweepTag,
    runNote,
    timeOff,
    errorBeforeStart,
    runNotes,
    pin,
    minPrestiges,
    maxLastOverride,
    maxPrestiges,
    scheduleEnabled,
    availableFrom,
    availableTo,
    availableDays,
    availability,
    availabilityLabel,
    deferShifts,
    planStartUsed,
    scheduleIsEmpty,
    milestones,
    activeMilestones,
    droppedMilestones,
    bestMissed,
    noFeasibleChain,
    // live state
    isRunning,
    stopRequested,
    error,
    stage,
    detail,
    chainsDone,
    chainsReplayed,
    batchDone,
    batchTotal,
    suspendedSeconds,
    runMinutes,
    runCost,
    alreadySubmitted,
    sentRecord,
    nameToClaim,
    chainsEstimated,
    bestChain,
    bestDays,
    bestLegs,
    lastCompletedStage,
    stoppedEarly,
    workersInPool,
    secondsPerChain,
    rateWorkers,
    rateSource,
    benchmarking,
    benchmarkError,
    benchmarkedAt,
    benchmarkChainCount,
    resumable,
    keepAwake,
    backgroundWorkers,
    tabHidden,
    // derived
    progressFraction,
    secondsRemaining,
    sweepLeft,
    currentTE,
    planStart,
    planStartIsNow,
    planStartRestoreNote,
    settingsRestoreNote,
    pinPlanStart,
    resumeInputsKey,
    blockedCheckpoint,
    preparing,
    busy,
    interrupted,
    runSaves,
    runSaveFor,
    promoteInterrupted,
    discardInterruptedRun,
    lastCrash,
    dismissCrash,
    blackBoxMark,
    blackBoxEnd,
    blackBoxReport,
    deadlineRunning,
    deadlineProgress,
    deadlineResult,
    savedAnswers,
    refreshSavedAnswers,
    saveCurrentAnswer,
    openSavedAnswer,
    removeSavedAnswer,
    deadlineUnfinished,
    deadlineStartedAt,
    deadlineInBatch,
    deadlineCsv,
    diagnosticsLine,
    loadDeadlineState,
    startDeadline,
    resumeDeadline,
    discardDeadlineRun,
    stopDeadline,
    resultsFromOlderSave,
    olderSaveNote,
    recheckingLatest,
    latestRecheck,
    recheckOnLatestSave,
    resetPlanStartTo,
    finishedCleanly,
    seedChain,
    seedIssue,
    seedTidyNote,
    fitSeedToLimitsNow,
    savedRuns,
    refreshSavedRuns,
    saveCurrentRun,
    openSavedRun,
    deleteSavedRun,
    seedOverride,
    estimateForCurrentSettings,
    findSeedFirst,
    coarseLog,
    runLog,
    csvRows,
    shortlist,
    pricedChains,
    pricedCount,
    chartsWanted,
    chartShown,
    setChartShown,
    refreshChartData,
    drawCharts,
    releaseCharts,
    heat,
    shortlistView,
    setShortlistView,
    // actions
    start,
    startExhaustive,
    benchmarkMachine,
    restoreBenchmark,
    stop,
    checkResumable,
    discardCheckpoint,
    runStartedAt,
    searchSpace,
    buildRunDiagnostics,
    setupIssues,
    setupFacts,
    backupTE,
    plannerTE,
    saveNotReady,
    resultIssues,
    resultContradictions,
    continueWarning,
    integrityWait,
    singleAscensionAsked,
    integrityChecking,
    integrityNotice,
    integrityBlocked,
    staleBackupAccepted,
    staleBackupBlocked,
    probeIntegrity,
    openedRun,
    crashedRun,
    resumeCrashedRun,
    canResumeOpenedRun,
    resumeBlocker,
    resumeOpenedRun,
    workerBudget,
    machineThreads,
    legDetailBudget,
    legsHeld,
    legDetailBytes,
    exportCsv,
    exportCsvChunks,
    buildRunSubmission,
    buildDeadlineSubmission,
    startSweep,
    startSweepRunning,
    findBestStart,
    stopStartSweep,
    cteParts,
    otherAccountKeys,
    deadlineWorkerSeconds,
    sendSubmission,
    safeResultKey,
    claimName,
    prepareRechecks,
    pendingTable,
    retryTable,
    submitUrl,
    leaderboardUrl,
    // The search's inputs as they stand: the precompute tool (scripts/precompute.ts) builds its
    // table from exactly what a search here would be given.
    collectInputs,
    submissionFilename,
    readInventory,
    progression,
    csvFilename,
    applyChain,
    generateRequested,
    applyNote,
    generateWhenPlannerOpens,
    rebuildShortlist,
  };
});
