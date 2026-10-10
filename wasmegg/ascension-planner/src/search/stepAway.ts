/**
 * "Stepping away?": opt-in helpers for runs left going for hours (StepAwayOptions.vue).
 *
 *  1. Carry on by itself after a crash: the next load of the page carries the run on without a click.
 *  2. Watch from a second tab (watch.html, src/watch/main.ts): a tiny page that reopens the run's page
 *     when its heartbeat stops.
 *  3. Use fewer workers: about half the cores, and one notch fewer when the page's own memory climbs
 *     or its speed falls well below its own recent pace.
 *  4. Send my progress every hour or 30 min (search/bestSoFarAuto.ts). Kept per browser like the
 *     rest, so it survives a carry-on after a crash.
 *
 * Everything here is pure or a plain localStorage read/write, so the watcher page can use it without
 * the planner's stores, and the rules can be tested. The run page writes a small "run mark" when a run
 * starts and on every black-box beat (~15 s, about once a minute in a hidden tab); the watcher reads
 * it. localStorage is shared by every tab of the same origin, and its writes are synchronous, so the
 * last heartbeat before a crash is on disk.
 */

export type RunKind = 'smart' | 'sweep' | 'deadline';

export interface StepAwayOptions {
  /** 1: carry on by itself after a crash. */
  autoCarryOn: boolean;
  /** 2: a second tab watches the run and reopens it if it stops. */
  watch: boolean;
  /** 3: about half the cores, and fewer still if the page struggles. */
  fewerWorkers: boolean;
  /** 4: send the run's progress on its own (best so far, CSV so far, diagnostics if ticked), every
   *  `autoSendEveryMin` minutes (search/bestSoFarAuto.ts). The field keeps its old name: it is stored. */
  autoSendBest: boolean;
  autoSendEveryMin: 30 | 60;
}

export const OPTIONS_KEY = 'aap.stepAway.options';
export const RUN_KEY = 'aap.stepAway.run';
/** BroadcastChannel name: the run page's heartbeat, and the watcher's "I'm here". */
export const CHANNEL = 'aap-step-away';
/** Where the watcher page writes when it last checked, ms (src/watch/main.ts). */
export const WATCHER_SEEN_KEY = 'aap.stepAway.watcherAt';
/** Where a planner page writes when it loads, ms: how the watcher knows its reopen got through.
 *  It opens the run with `noopener` (so the two tabs don't share a renderer and die together), and
 *  then `window.open` returns null whether or not the browser blocked it. */
export const RUN_PAGE_KEY = 'aap.stepAway.runPageAt';
/** How long the watcher waits for the reopened page to say it loaded before calling it blocked. */
export const REOPEN_CONFIRM_MS = 20_000;
/** How long the run page waits for a watcher it just opened to check in before calling it blocked. */
export const WATCHER_CONFIRM_MS = 5_000;

/** No heartbeat for this long, while the run is marked running, means the page is gone. */
export const STALE_MS = 2 * 60_000;
/** A reopened page needs time to load the save and count down before its first heartbeat. */
export const REOPEN_GRACE_MS = 3 * 60_000;
/** Crash-loop guard: at most this many reopens (or automatic carry-ons) per hour. */
export const MAX_REOPENS_PER_HOUR = 3;
export const HOUR_MS = 3600_000;
/** An unfinished run older than this is not carried on by itself: too surprising after a day away. */
export const AUTO_CARRY_ON_MAX_AGE_MS = 24 * HOUR_MS;
/** Seconds of visible countdown before an automatic carry-on. */
export const COUNTDOWN_SECONDS = 10;

export type RunStatus =
  /** Going (or the page died while it was going: the heartbeat says which). */
  | 'running'
  /** Its result was saved. Written only then, never for a run that ended any other way. */
  | 'finished'
  /**
   * It ended with an error (a crashed worker, a stall, a result that could not be saved) while the
   * page lived on. Treated as a crash: the watcher reopens it, and the reopened page carries it on
   * by itself with one fewer worker, within the same 3-an-hour guard.
   */
  | 'failed'
  /** The player pressed Stop, or cancelled an automatic carry-on. */
  | 'stopped'
  /** The page was reloaded or closed on purpose (pagehide). */
  | 'closed'
  /** A reopened page could not carry the run on (its save is not kept here, another account...). */
  | 'stuck';

export interface RunMark {
  version: 1;
  kind: RunKind;
  /** The run page's address, hash route included, for the watcher to reopen. */
  url: string;
  /** The account's hashed id (never the player id), so a carry-on is only for the same account. */
  account: string;
  startedAt: number;
  /** The last heartbeat. */
  beatAt: number;
  status: RunStatus;
  endedAt?: number;
  /** Carry on by itself after a crash (option 1, or option 2, which implies it for its reopen). */
  autoCarryOn: boolean;
  watch: boolean;
  fewerWorkers: boolean;
  /** Workers the run had at its last heartbeat. */
  workers: number;
  /** When the watcher reopened the page, ms. Carried over to a carried-on run, for the guard. */
  reopens: number[];
  /** When a page carried the run on by itself, ms. The same guard. */
  autoCarries: number[];
}

export const DEFAULT_OPTIONS: StepAwayOptions = {
  autoCarryOn: false,
  watch: false,
  fewerWorkers: false,
  autoSendBest: false,
  autoSendEveryMin: 60,
};

type KV = Pick<Storage, 'getItem' | 'setItem'>;

function store(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readOptions(s: KV | null = store()): StepAwayOptions {
  try {
    const raw = JSON.parse(s?.getItem(OPTIONS_KEY) || 'null') as Partial<StepAwayOptions> | null;
    if (raw && typeof raw === 'object') {
      return {
        autoCarryOn: raw.autoCarryOn === true,
        watch: raw.watch === true,
        fewerWorkers: raw.fewerWorkers === true,
        autoSendBest: raw.autoSendBest === true,
        autoSendEveryMin: raw.autoSendEveryMin === 30 ? 30 : 60,
      };
    }
  } catch {
    // unreadable or blocked: all off
  }
  return { ...DEFAULT_OPTIONS };
}

export function writeOptions(o: StepAwayOptions, s: KV | null = store()): void {
  try {
    s?.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // blocked or full: the options just aren't remembered
  }
}

export function readRunMark(s: KV | null = store()): RunMark | null {
  try {
    const raw = JSON.parse(s?.getItem(RUN_KEY) || 'null') as RunMark | null;
    if (raw && raw.version === 1 && typeof raw.beatAt === 'number' && typeof raw.url === 'string') {
      return { ...raw, reopens: raw.reopens ?? [], autoCarries: raw.autoCarries ?? [] };
    }
  } catch {
    // unreadable
  }
  return null;
}

export function writeRunMark(m: RunMark, s: KV | null = store()): void {
  try {
    s?.setItem(RUN_KEY, JSON.stringify(m));
  } catch {
    // a nicety, never a reason to fail a run
  }
}

/** Only the times within the last hour. */
export function lastHour(times: readonly number[], now: number): number[] {
  return times.filter(t => now - t < HOUR_MS && t <= now + 60_000);
}

/** The crash-loop guard: another reopen (or automatic carry-on) is allowed. */
export function canReopen(times: readonly number[], now: number, max = MAX_REOPENS_PER_HOUR): boolean {
  return lastHour(times, now).length < max;
}

/** When the guard allows the next one, ms; `now` when it already does. */
export function nextReopenAllowedAt(times: readonly number[], now: number, max = MAX_REOPENS_PER_HOUR): number {
  const recent = lastHour(times, now).sort((a, b) => a - b);
  return recent.length < max ? now : recent[recent.length - max] + HOUR_MS;
}

/** Milliseconds since the run's last sign of life: its heartbeat, or a reopen still in its grace. */
export function heartbeatAge(m: Pick<RunMark, 'beatAt' | 'reopens'>, now: number): number {
  const lastReopen = m.reopens.length ? Math.max(...m.reopens) : 0;
  // A reopened page gets REOPEN_GRACE_MS before it is called stale again.
  const alive = Math.max(m.beatAt, lastReopen ? lastReopen + REOPEN_GRACE_MS - STALE_MS : 0);
  return Math.max(0, now - alive);
}

export type WatchState =
  /** No run with the watcher on. */
  | 'idle'
  /** An old run, not this watcher's: marked running but already quiet when this watcher began (an
   *  old crash, not its to reopen), or ended (finished, stopped, closed, stuck) without this watcher
   *  ever seeing it run. Waiting for a run to start. */
  | 'waiting'
  | 'watching'
  /** Stale, and the guard allows a reopen: reopen it now. */
  | 'reopen'
  /** Stale, but it was reopened too often in the last hour. */
  | 'guarded'
  | 'finished'
  | 'stopped'
  | 'closed'
  | 'stuck';

/**
 * What the watcher should do about the run mark right now. `watchingSince` is when this watcher
 * started: a run whose heartbeat was already stale then (never fresh while this tab watched) is an
 * old crash, and reopening it on sight would surprise the player.
 *
 * Likewise "the run finished / was stopped / was closed" is only news about a run this watcher
 * watched: one it saw running (`seenRunning`, that run's `startedAt`), or one that started after it
 * opened. Any other ended run is history (the last run before the box was ticked), so it waits.
 */
export function watchVerdict(
  m: RunMark | null,
  now: number,
  staleMs = STALE_MS,
  watchingSince = -Infinity,
  seenRunning?: number
): WatchState {
  if (!m || !m.watch) return 'idle';
  if (m.status === 'failed') {
    const watched = m.startedAt === seenRunning || m.startedAt >= watchingSince;
    if (!watched) return 'waiting';
    // Reopened since it failed: give that page its time to load and carry on (a new run mark),
    // rather than opening another every check.
    const lastReopen = m.reopens.length ? Math.max(...m.reopens) : 0;
    if (lastReopen >= (m.endedAt ?? m.beatAt) && now - lastReopen < REOPEN_GRACE_MS) return 'watching';
    return canReopen(m.reopens, now) ? 'reopen' : 'guarded';
  }
  if (m.status !== 'running') {
    const watched = m.startedAt === seenRunning || m.startedAt >= watchingSince;
    return watched ? m.status : 'waiting';
  }
  if (heartbeatAge(m, now) <= staleMs) return 'watching';
  if (m.beatAt < watchingSince - staleMs) return 'waiting';
  return canReopen(m.reopens, now) ? 'reopen' : 'guarded';
}

/** Option 3's ceiling: about half the cores, at least one. */
export function fewerWorkersCap(threads: number): number {
  return Math.max(1, Math.floor(Math.max(1, threads) / 2));
}

/** One notch down: about a quarter fewer, at least one fewer, never below `floor` (at least 1). */
export function stepDown(current: number, floor = 1): number {
  const f = Math.max(1, Math.floor(floor));
  if (current <= f) return Math.max(1, current);
  return Math.max(f, Math.min(current - 1, Math.floor(current * 0.75)));
}

/** Workers for an automatic carry-on after a crash: a notch fewer than the run that crashed had,
 *  and with option 3 also no more than its ceiling. */
export function carryOnWorkers(crashedWith: number, threads: number, fewerOn: boolean): number {
  const n = stepDown(Math.max(1, Math.floor(crashedWith) || 1), 1);
  return fewerOn ? Math.min(n, fewerWorkersCap(threads)) : n;
}

/**
 * The player's own worker count and what the step-away rules set it to, so the count can be put back
 * when the run ends. `before` is null while nothing has been changed.
 */
export interface WorkerLedger {
  before: number | null;
  setTo: number | null;
}

export const EMPTY_LEDGER: WorkerLedger = { before: null, setTo: null };

/** The rules take the count down to `to`. The player's own count is remembered the first time; when the
 *  player has moved the slider since the last change (the count is no longer what the rules set), their
 *  new count is the one to remember. */
export function reduceWorkers(
  ledger: WorkerLedger,
  current: number,
  to: number
): { ledger: WorkerLedger; workers: number } {
  const moved = ledger.setTo !== null && current !== ledger.setTo;
  const before = ledger.before === null || moved ? current : ledger.before;
  return { ledger: { before, setTo: to }, workers: to };
}

/** The run is over: the player's own count goes back, unless they moved the slider themselves. */
export function restoreWorkers(ledger: WorkerLedger, current: number): { ledger: WorkerLedger; workers: number } {
  const workers = ledger.before !== null && current === ledger.setTo ? ledger.before : current;
  return { ledger: EMPTY_LEDGER, workers };
}

/**
 * Option 3 was switched off mid-run. Only its own reduction is undone: a carried-on run keeps the
 * ceiling the carry-on set (`carryOnCap`, null when this run is not a carry-on) for the whole run. Any
 * other tick in the box (the watcher, the carry-on option) never touches the count at all.
 */
export function workersWhenFewerOff(
  ledger: WorkerLedger,
  current: number,
  carryOnCap: number | null
): { ledger: WorkerLedger; workers: number } {
  if (carryOnCap === null) return restoreWorkers(ledger, current);
  if (ledger.before === null || current !== ledger.setTo) return { ledger, workers: current };
  const to = Math.min(ledger.before, carryOnCap);
  return { ledger: { before: ledger.before, setTo: to }, workers: to };
}

/** What the page can see of its own memory at one beat. Not other programs': no browser says. */
export interface MemorySample {
  heapMB?: number;
  heapLimitMB?: number;
  workersHeapMB?: number | null;
}

/** A sensible ceiling for this page's own memory, MB: half the RAM bucket the browser reports
 *  (`navigator.deviceMemory`, capped at 8 by Chromium), else 4 GB. */
export function sensibleMemoryMB(deviceMemoryGB: number | null | undefined): number {
  return typeof deviceMemoryGB === 'number' && deviceMemoryGB > 0 ? (deviceMemoryGB * 1024) / 2 : 4096;
}

export const MEMORY_SHARE = 0.7;

/** The page's measurable memory is past ~70% of what's sensible: main heap plus the workers'
 *  heaps (when they report), against `sensibleMemoryMB`, or the main heap against its own limit. */
export function memoryHigh(s: MemorySample, sensibleMB: number): boolean {
  const main = s.heapMB ?? 0;
  const total = main + (typeof s.workersHeapMB === 'number' ? s.workersHeapMB : 0);
  if (total > MEMORY_SHARE * sensibleMB) return true;
  return !!s.heapLimitMB && main > MEMORY_SHARE * s.heapLimitMB;
}

/** One heartbeat's progress, for the speed rule. */
export interface RateSample {
  at: number;
  /** Chains (or routes) done so far this run. */
  done: number;
  workers: number;
}

export const SLOW_SHARE = 0.4;
export const SLOW_FOR_MS = 5 * 60_000;
/** The median is taken over this much recent history, before the slow stretch. */
export const MEDIAN_WINDOW_MS = 30 * 60_000;
/** Below this much history before the slow stretch, there is no "own pace" to compare against. */
export const MIN_HISTORY_MS = 10 * 60_000;
/** A gap between beats longer than this is a frozen or sleeping tab, not a slow one. */
export const MAX_GAP_MS = 3 * 60_000;

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-worker chains per minute between consecutive samples; gaps (frozen tab) and resets dropped. */
export function rates(samples: readonly RateSample[]): { at: number; from: number; rate: number }[] {
  const out: { at: number; from: number; rate: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = b.at - a.at;
    if (dt <= 0 || dt > MAX_GAP_MS || b.done < a.done) continue;
    out.push({ at: b.at, from: a.at, rate: (b.done - a.done) / (dt / 60_000) / Math.max(1, a.workers) });
  }
  return out;
}

/**
 * Speed well below its own pace: every rate in the last SLOW_FOR_MS (at least four of them, back to
 * back, covering the whole stretch) under SLOW_SHARE of the median over the MEDIAN_WINDOW_MS before.
 * Per worker, so a smaller pool (the background-tab setting, the slider) is not "slow".
 */
export function rateSlow(samples: readonly RateSample[], now: number): boolean {
  const rs = rates(samples);
  const recent = rs.filter(r => r.at > now - SLOW_FOR_MS);
  if (recent.length < 4) return false;
  // Back to back across the whole stretch: no gap inside it, and it starts at its beginning.
  if (recent[0].from > now - SLOW_FOR_MS + 60_000) return false;
  for (let i = 1; i < recent.length; i++) if (recent[i].from !== recent[i - 1].at) return false;
  const before = rs.filter(r => r.at <= now - SLOW_FOR_MS && r.at > now - SLOW_FOR_MS - MEDIAN_WINDOW_MS);
  if (!before.length || now - SLOW_FOR_MS - before[0].from < MIN_HISTORY_MS) return false;
  const pace = median(before.map(r => r.rate));
  if (pace <= 0) return false;
  return recent.every(r => r.rate < SLOW_SHARE * pace);
}

/** Wait at least this long after a step-down before the next. */
export const STEP_COOLDOWN_MS = 5 * 60_000;

export type StepReason = 'memory' | 'slow';

/**
 * Option 3, during a run: step down a notch? Memory high on the last two beats, or the speed rule.
 * Never below half the ceiling, and not within STEP_COOLDOWN_MS of the last change.
 */
export function stepDownDecision(args: {
  now: number;
  workers: number;
  cap: number;
  lastStepAt: number;
  memory: readonly MemorySample[];
  sensibleMB: number;
  samples: readonly RateSample[];
}): { to: number; reason: StepReason } | null {
  const { now, workers, cap, lastStepAt, memory, sensibleMB, samples } = args;
  if (now - lastStepAt < STEP_COOLDOWN_MS) return null;
  const to = stepDown(workers, Math.ceil(cap / 2));
  if (to >= workers) return null;
  const lastTwo = memory.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every(m => memoryHigh(m, sensibleMB))) return { to, reason: 'memory' };
  if (rateSlow(samples, now)) return { to, reason: 'slow' };
  return null;
}

/** "3:07 am", in the viewer's own zone. */
export function clock12(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** "45 s", "3 min", "2 h". */
export function agoShort(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** Whether a page that just loaded should carry the run on by itself. Pure: the caller supplies
 *  what it found (the black box's unfinished beat, the lock, whether the run can carry on at all). */
export function autoCarryOnVerdict(a: {
  mark: RunMark | null;
  kind: RunKind;
  account: string;
  now: number;
  /** The black box's unfinished beat from the previous page, if any. */
  crash: { phase: string; at: number; pageClosed?: boolean } | null;
  /** Another tab holds the run lock: the run is alive there. */
  lockHeld: boolean;
  /** The panel has an unfinished run here that it can carry on (its save is kept, etc.). */
  canCarryOn: boolean;
}):
  | { go: true }
  | { go: false; why: 'off' | 'no-crash' | 'other-kind' | 'other-account' | 'too-old' | 'alive' | 'cannot' | 'guard' } {
  const { mark, kind, account, now, crash, lockHeld, canCarryOn } = a;
  // A run that failed with an error is a crash whatever the black box says: the page that saw it
  // fail lived on (it may since have been closed or reloaded), and its mark says what happened.
  const failed = mark?.status === 'failed';
  if (!mark || !mark.autoCarryOn || (mark.status !== 'running' && !failed)) return { go: false, why: 'off' };
  if (!failed && (!crash || crash.pageClosed)) return { go: false, why: 'no-crash' };
  const phase = kind === 'deadline' ? 'deadline search' : 'search';
  if (mark.kind !== kind || (!failed && crash?.phase !== phase)) return { go: false, why: 'other-kind' };
  if (!account || mark.account !== account) return { go: false, why: 'other-account' };
  if (now - mark.beatAt > AUTO_CARRY_ON_MAX_AGE_MS) return { go: false, why: 'too-old' };
  if (lockHeld) return { go: false, why: 'alive' };
  if (!canCarryOn) return { go: false, why: 'cannot' };
  if (!canReopen(mark.autoCarries, now)) return { go: false, why: 'guard' };
  return { go: true };
}

/**
 * The run a panel would offer to carry on is still going in another tab or window of this browser
 * (review, 9 Oct: a second tab showed "Carry on the unfinished run — 2,186 chains already priced"
 * while the run was live in the first; pressing it would have run the same search twice, both writing
 * the checkpoint, and two final sends racing to replace one best-so-far row).
 *
 * Alive when the run mark says a run of this kind, on this account, is going and either the run lock
 * is held (a page holds it for the whole run, and the browser drops it when that page dies) or its
 * heartbeat is fresher than STALE_MS. Carry on comes back once neither holds: the other page was
 * closed, crashed, or has not beaten for two minutes. Never this page's own run (`runningHere`).
 */
export function runAliveElsewhere(a: {
  mark: RunMark | null;
  kind: RunKind;
  /** This page's hashed account; '' when not known yet (then any account's run counts). */
  account: string;
  now: number;
  lockHeld: boolean;
  /** This page is running a search itself: the mark and the lock are its own. */
  runningHere: boolean;
}): boolean {
  const { mark, kind, account, now, lockHeld, runningHere } = a;
  if (runningHere || !mark || mark.status !== 'running' || mark.kind !== kind) return false;
  if (account && mark.account && mark.account !== account) return false;
  return lockHeld || heartbeatAge(mark, now) < STALE_MS;
}

/**
 * A run starting on this page must not write over another tab's run mark while that run is alive:
 * the watcher would lose the run it watches, and that run's next beat would find the mark no longer
 * its own and stop beating. Any kind and any account, since there is one mark for the browser.
 *
 * `lock`: whether this page was granted the run lock ('ours': nobody else holds it, so no other run
 * is alive), is still waiting for it ('other': another page holds it, and a page holds it for its
 * whole run), or cannot tell ('unknown': no Web Locks), when a fresh heartbeat decides.
 */
export function markHeldElsewhere(a: {
  mark: RunMark | null;
  now: number;
  /** `startedAt` of this page's own run, whose mark it may always rewrite. */
  ownStartedAt: number;
  lock: 'ours' | 'other' | 'unknown';
}): boolean {
  const { mark, now, ownStartedAt, lock } = a;
  if (!mark || mark.startedAt === ownStartedAt || lock === 'ours') return false;
  return runAliveElsewhere({ mark, kind: mark.kind, account: '', now, lockHeld: lock === 'other', runningHere: false });
}
