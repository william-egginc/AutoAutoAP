/**
 * The "Stepping away?" options at run time (rules in search/stepAway.ts, box in StepAwayOptions.vue).
 *
 * Module-level on purpose: the options and the run mark belong to the page, not to whichever panel
 * is on screen, and the chain-search store drives the run side (`installStepAway` and the
 * `stepAway*` calls from its black-box hooks) without importing any component.
 */
import { ref, watch, type Ref } from 'vue';
import * as blackBox from '@/search/blackBox';
import { environment } from '@/search/blackBox';
import * as sa from '@/search/stepAway';
import { consentAgreed, consentState } from './useConsent';

/** The options. All off unless the player ticks them. The three ticks (carry on, the watcher tab, send my
 *  progress) are the account's consents (composables/useConsent.ts, remembered per account) and follow
 *  them here; the interval stays a setting of this browser. */
export const stepAwayOptions = ref<sa.StepAwayOptions>(sa.readOptions());
watch(
  () =>
    [
      consentAgreed('carryOn'),
      consentAgreed('watchTab'),
      consentAgreed('autoSend'),
      consentState.account,
      consentState.loaded,
    ] as const,
  ([carryOn, watchTab, autoSend]) => {
    const o = stepAwayOptions.value;
    if (o.autoCarryOn !== carryOn) o.autoCarryOn = carryOn;
    if (o.watch !== watchTab) o.watch = watchTab;
    if (o.autoSendBest !== autoSend) o.autoSendBest = autoSend;
  },
  { flush: 'sync' }
);
/** The last thing the worker rules did, for the box to show ("Down to 6 workers at 3:07 am: ..."). */
export const stepAwayNote = ref('');

interface Deps {
  workerBudget: Ref<number>;
  machineThreads: number;
  /** The account's hashed id, '' when there is none. */
  account: () => Promise<string>;
  /** A line in the run's own log. */
  log: (line: string) => void;
  /** Whether this page holds the run lock (see search/stepAway.ts `markHeldElsewhere`). Absent: unknown. */
  runLock?: () => Promise<'ours' | 'other' | 'unknown'>;
}

let deps: Deps | null = null;
let channel: BroadcastChannel | null = null;
/** `startedAt` of the run mark THIS page wrote; 0 when this page has no run going. */
let ownStartedAt = 0;
let stopPressed = false;
/** The player's own worker count before these options changed it, and what they set it to. */
let ledger: sa.WorkerLedger = sa.EMPTY_LEDGER;
/** The worker ceiling an automatic carry-on set for this run; null when this run is not one. Held for
 *  the whole run: ticking another box, or option 3 going off, never lifts it. Cleared (with the
 *  player's own count put back) only when the run ends or is stopped. */
let carryOnCap: number | null = null;
/** Option 3 as the watcher last saw it, so only its going off undoes its own reduction. */
let fewerSeen = stepAwayOptions.value.fewerWorkers;
let samples: sa.RateSample[] = [];
let memory: sa.MemorySample[] = [];
let lastStepAt = 0;

function post(msg: unknown): void {
  try {
    channel ??= typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(sa.CHANNEL) : null;
    channel?.postMessage(msg);
  } catch {
    // no channel: the watcher reads localStorage anyway
  }
}

/** Called once by the chain-search store, as the page starts. */
export function installStepAway(d: Deps): void {
  deps = d;
  // "A planner page just loaded": how the watcher tells its reopen got through (it opens with
  // `noopener`, so it gets no window back to look at). src/watch/main.ts.
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(sa.RUN_PAGE_KEY, String(Date.now()));
  } catch {
    // the watcher then takes a reopen as blocked and goes to the run itself
  }
}

function setBudget(n: number): void {
  if (!deps) return;
  const r = sa.reduceWorkers(ledger, deps.workerBudget.value, n);
  ledger = r.ledger;
  deps.workerBudget.value = r.workers;
}

/** Put the player's own worker count back, unless they moved it themselves since. Only for the end of
 *  the run (or a carry-on that will not happen): never while this page's run is going. */
function restoreBudget(): void {
  carryOnCap = null;
  if (!deps) {
    ledger = sa.EMPTY_LEDGER;
    return;
  }
  const r = sa.restoreWorkers(ledger, deps.workerBudget.value);
  ledger = r.ledger;
  deps.workerBudget.value = r.workers;
}

function applyCap(): void {
  if (!deps) return;
  const cap = sa.fewerWorkersCap(deps.machineThreads);
  if (deps.workerBudget.value > cap) {
    setBudget(cap);
    stepAwayNote.value = `Using ${cap} of ${deps.machineThreads} workers, to leave the computer some room.`;
  }
}

function ownMark(): sa.RunMark | null {
  const m = sa.readRunMark();
  return m && ownStartedAt && m.startedAt === ownStartedAt ? m : null;
}

watch(
  stepAwayOptions,
  o => {
    // The ticks are kept per account (useConsent.ts), not in this browser's options.
    sa.writeOptions({ ...o, autoCarryOn: false, watch: false, autoSendBest: false });
    const fewerChanged = o.fewerWorkers !== fewerSeen;
    fewerSeen = o.fewerWorkers;
    const m = ownMark();
    if (m && m.status === 'running') {
      sa.writeRunMark({ ...m, autoCarryOn: o.autoCarryOn || o.watch, watch: o.watch, fewerWorkers: o.fewerWorkers });
      // Only option 3 itself touches the count. Any other tick (the watcher, the carry-on box) used to
      // run the "off" branch too and put the player's own count back in the middle of a carried-on run.
      if (!fewerChanged) return;
      if (o.fewerWorkers) applyCap();
      else if (deps) {
        const r = sa.workersWhenFewerOff(ledger, deps.workerBudget.value, carryOnCap);
        ledger = r.ledger;
        deps.workerBudget.value = r.workers;
        stepAwayNote.value = '';
      }
    }
  },
  { deep: true }
);

/** A run started on this page. */
export async function stepAwayRunStarted(kind: sa.RunKind): Promise<void> {
  if (!deps || typeof window === 'undefined') return;
  const startedAt = Date.now();
  ownStartedAt = startedAt;
  stopPressed = false;
  samples = [];
  memory = [];
  lastStepAt = startedAt;
  const o = stepAwayOptions.value;
  if (o.fewerWorkers) applyCap();
  let account = '';
  try {
    account = await deps.account();
  } catch {
    // no account: a carry-on is then never automatic
  }
  if (ownStartedAt !== startedAt) return; // ended (or another started) while hashing
  let lock: 'ours' | 'other' | 'unknown' = 'unknown';
  try {
    lock = deps.runLock ? await deps.runLock() : 'unknown';
  } catch {
    // unknown: the heartbeat decides
  }
  if (ownStartedAt !== startedAt) return;
  const prev = sa.readRunMark();
  // Another tab's run is alive and its mark is its own: this run goes unwatched rather than take it.
  if (sa.markHeldElsewhere({ mark: prev, now: Date.now(), ownStartedAt: 0, lock })) {
    ownStartedAt = 0;
    blackBox.note('run mark: another tab has a run going, so this run is not marked for the watcher');
    return;
  }
  const same = prev && prev.kind === kind && prev.account === account;
  sa.writeRunMark({
    version: 1,
    kind,
    url: window.location.href,
    account,
    startedAt,
    beatAt: Date.now(),
    status: 'running',
    autoCarryOn: o.autoCarryOn || o.watch,
    watch: o.watch,
    fewerWorkers: o.fewerWorkers,
    workers: deps.workerBudget.value,
    // The crash-loop guard counts across a carry-on.
    reopens: same ? sa.lastHour(prev.reopens, startedAt) : [],
    autoCarries: same ? sa.lastHour(prev.autoCarries, startedAt) : [],
  });
}

/** Every black-box beat while the run goes: the heartbeat, and option 3's step-down rule. */
export function stepAwayBeat(b: {
  done: number;
  workers: number;
  heapMB?: number;
  heapLimitMB?: number;
  workersHeapMB?: number | null;
}): void {
  const m = ownMark();
  if (!m || !deps) return;
  const now = Date.now();
  sa.writeRunMark({ ...m, beatAt: now, workers: b.workers });
  post({ type: 'beat', at: now });
  if (!stepAwayOptions.value.fewerWorkers) return;
  samples = [...samples, { at: now, done: b.done, workers: b.workers }].filter(
    s => s.at > now - sa.MEDIAN_WINDOW_MS - sa.SLOW_FOR_MS - 60_000
  );
  memory = [...memory, { heapMB: b.heapMB, heapLimitMB: b.heapLimitMB, workersHeapMB: b.workersHeapMB }].slice(-4);
  const step = sa.stepDownDecision({
    now,
    workers: deps.workerBudget.value,
    cap: sa.fewerWorkersCap(deps.machineThreads),
    lastStepAt,
    memory,
    sensibleMB: sa.sensibleMemoryMB(environment().deviceMemoryGB),
    samples,
  });
  if (!step) return;
  const from = deps.workerBudget.value;
  setBudget(step.to);
  lastStepAt = now;
  // A fresh pace for the new count: the old one says nothing about it.
  samples = [];
  memory = [];
  const why = step.reason === 'memory' ? "this page's memory got high" : 'it slowed to well under its own recent pace';
  stepAwayNote.value = `Down to ${step.to} workers at ${sa.clock12(now)}: ${why}.`;
  deps.log(`--- workers: ${from} -> ${step.to} (fewer workers: ${why})`);
}

/** Stop pressed: the watcher stands down at once, not when the batch ends. */
export function stepAwayStopPressed(): void {
  stopPressed = true;
  const m = ownMark();
  if (m && m.status === 'running') sa.writeRunMark({ ...m, status: 'stopped', endedAt: Date.now() });
}

/**
 * The run on this page ended: `finished` only once its result was saved, `stopped` by the player, or
 * `failed` with an error (the watcher reopens a failed run, and the reopened page carries it on).
 * Stop pressed during a run that then failed still reads stopped: the player asked for it to end.
 */
export function stepAwayRunEnded(how: 'finished' | 'stopped' | 'failed'): void {
  const m = ownMark();
  if (m) {
    const status: sa.RunStatus = m.status !== 'running' ? m.status : how === 'stopped' || stopPressed ? 'stopped' : how;
    sa.writeRunMark({ ...m, status, endedAt: m.endedAt ?? Date.now() });
    post({ type: 'ended', status });
  }
  runOver();
}

/**
 * The run on this page never started: its storage did not answer at its start (stores/chainSearch.ts
 * `abandonRunStart`; review 7 Nov 2026, finding 9). Not the player's Stop, and not a crash to carry on into the same
 * wait: its mark goes (if the start's limit has not already removed it) and nothing is marked ended.
 */
export function stepAwayRunNeverStarted(why: string): void {
  if (ownMark()) stepAwayDropRunMark(why);
  runOver();
}

function runOver(): void {
  ownStartedAt = 0;
  stopPressed = false;
  restoreBudget();
  if (!stepAwayOptions.value.fewerWorkers) stepAwayNote.value = '';
}

/** `pagehide`: closed or reloaded on purpose, so nothing is reopened or carried on by itself. */
export function stepAwayPageClosing(): void {
  const m = ownMark();
  if (m && m.status === 'running') sa.writeRunMark({ ...m, status: 'closed', endedAt: Date.now() });
}

/** When the countdown last carried a run on (`stepAwayBeginCarryOn`), for the black box's carry-on
 *  entry: taken once by the carry-on it started (`stepAwayTakeAutoCarryOn`). */
let autoCarryAt = 0;
/** How long after the countdown's carry-on the run's own start still counts as that carry-on. */
const AUTO_CARRY_TAKE_MS = 60_000;

/** Whether the carry-on starting now is the countdown's (true once, then forgotten) or a click. */
export function stepAwayTakeAutoCarryOn(now = Date.now()): boolean {
  const auto = autoCarryAt > 0 && now - autoCarryAt <= AUTO_CARRY_TAKE_MS;
  autoCarryAt = 0;
  return auto;
}

/** About to carry a crashed run on by itself: count it for the guard and take fewer workers. */
export function stepAwayBeginCarryOn(): number | null {
  autoCarryAt = Date.now();
  const m = sa.readRunMark();
  if (!m || !deps) return null;
  const now = Date.now();
  sa.writeRunMark({ ...m, autoCarries: [...sa.lastHour(m.autoCarries, now), now] });
  const n = sa.carryOnWorkers(m.workers || deps.workerBudget.value, deps.machineThreads, m.fewerWorkers);
  const from = deps.workerBudget.value;
  carryOnCap = Math.min(n, from);
  setBudget(carryOnCap);
  // Into the black box too, so the run's first beats say why the count is not the player's own.
  blackBox.note(`carry-on workers: ${from} -> ${deps.workerBudget.value} (the crashed run had ${m.workers || from})`);
  return deps.workerBudget.value;
}

/** The crashed run will not be carried on by itself (cancelled, can't, or the guard): the watcher
 *  stands down too. */
export function stepAwayGiveUp(status: 'stopped' | 'stuck'): void {
  const m = sa.readRunMark();
  if (m && (m.status === 'running' || m.status === 'failed') && !ownMark())
    sa.writeRunMark({ ...m, status, endedAt: Date.now() });
  // A run going on this page keeps its count; only a carry-on that is not going to happen gives it back.
  if (!ownStartedAt) restoreBudget();
}

/**
 * A run whose storage did not answer at its start or end (stores/chainSearch.ts `storageLimit`, spec-stuck3): its run
 * mark is removed, so neither this page's next load, the watcher nor the carry-on box takes it up again (a carry-on
 * whose restore never answers would only hang again). Only that mark: this page's own, or one no other tab's live run
 * holds (a fresh heartbeat). True when one was removed.
 */
export function stepAwayDropRunMark(why: string): boolean {
  const m = sa.readRunMark();
  if (!m) return false;
  if (m.startedAt !== ownStartedAt && sa.markHeldElsewhere({ mark: m, now: Date.now(), ownStartedAt, lock: 'unknown' })) return false;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(sa.RUN_KEY);
  } catch {
    return false;
  }
  console.warn(`Removed the stored run mark (${m.kind}, ${m.status}): ${why}.`);
  if (m.startedAt === ownStartedAt) ownStartedAt = 0;
  return true;
}

/** The watcher page's address. */
export function watcherUrl(): string {
  return `${import.meta.env.BASE_URL || '/'}watch.html`;
}

/**
 * Open the watcher tab. From a click only: browsers block it otherwise.
 *
 * `noopener`, so the watcher gets a renderer process of its own: a tab opened with its opener shares
 * the opener's process in Chromium, and the crash the watcher is there for would kill it too. That
 * also means `window.open` returns null whether or not it was blocked, so whether it opened is told
 * by the watcher checking in (`watcherCheckedInSince`), not by the return value.
 */
export function openWatcher(): void {
  try {
    window.open(watcherUrl(), '_blank', 'noopener');
  } catch {
    // blocked outright: the watcher never checks in, and the box says so
  }
  pingWatcher();
}

/** A watcher already open answers this by checking in at once. */
export function pingWatcher(): void {
  post({ type: 'ping', at: Date.now() });
}

/** When the watcher tab last checked in, ms; 0 when never. */
export function watcherSeenAt(): number {
  try {
    return Number(localStorage.getItem(sa.WATCHER_SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
