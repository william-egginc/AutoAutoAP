/**
 * A flight recorder for long runs: what the page was doing when the browser took it away.
 *
 * Safari (and Chrome, less often) can kill a tab outright -- the white page, and in Activity Monitor
 * no process at all -- without the page getting a single event. Nothing can be saved AT the crash,
 * so this saves a small note all the time instead: every beat while a run or a submission is going,
 * and at every hide/show of the tab. A beat that never got its matching "done" means the page died
 * in the middle, and the next visit can say when, doing what, with the tab hidden or not, and with
 * how much memory where the browser reports it.
 *
 * localStorage, not IndexedDB, on purpose: its writes are synchronous, so the last beat before the
 * crash is on disk rather than in a queue the crash takes with it. The record is a few KB.
 */
const KEY = 'aap.blackBox';
const HISTORY = 40;

export interface Beat {
  at: number;
  phase: string;
  detail?: string;
  done?: number;
  total?: number;
  workers?: number;
  /** Priced chains held in memory. */
  entries?: number;
  hidden: boolean;
  /** JS heap in use, MB -- Chrome only; Safari and Firefox do not report it. This is the MAIN
   *  thread's heap only: every worker is a separate isolate with its own heap, not counted here.
   *  Chromium also quantises this value and refreshes it only now and then unless the browser runs
   *  with --enable-precise-memory-info, so a flat line is weak evidence. */
  heapMB?: number;
  /** The main thread's JS heap ceiling (`performance.memory.jsHeapSizeLimit`), MB. Chromium only. */
  heapLimitMB?: number;
  /** Sum of the search workers' own JS heaps, MB, as each last reported it (search/pool.ts). Null
   *  when workers exist but none could report (no `performance.memory` in the worker: everywhere
   *  but Chromium, and possibly Chromium too). Absent when no pool is running. */
  workersHeapMB?: number | null;
  /** The largest single worker heap, MB. Null/absent as `workersHeapMB`. */
  workerHeapMaxMB?: number | null;
  /** How many workers' heaps went into `workersHeapMB`. */
  workersReporting?: number;
  /** Prefixes held in the workers' chain memos, summed (search/chain.ts, at most `workersMemoCapacity`),
   *  as each last reported. Chrome gives a worker no `performance.memory`, so `workersHeapMB` is null
   *  there; this count is the stand-in: how full the workers' main cache was. Null when none has
   *  reported; absent when no pool is running. */
  workersMemoEntries?: number | null;
  /** Those memos' capacities, summed: 3000 a worker, or what a By a date run sized them to. Null or
   *  absent where the workers did not say (older builds). */
  workersMemoCapacity?: number | null;
  /** `performance.measureUserAgentSpecificMemory()` in MB: the whole page, workers included. Only
   *  where the API exists AND the page is cross-origin isolated (normally not on this site). It is
   *  async, so each beat carries the measurement the PREVIOUS beat started. */
  uaMemoryMB?: number;
  /** The page was reloaded, closed or navigated away from (`pagehide` fired): the player ended
   *  it, not the browser. A crash gives no such event, so this is never set by one. */
  pageClosed?: boolean;
  /** The player's note on the run (the open beat only; left out of the history to keep it small). */
  runNote?: string;
}

/** Facts about the machine and page, recorded once per box rather than per beat. */
export interface BoxEnv {
  /** `navigator.deviceMemory`: RAM in GB, rounded down to a power of two and capped by the browser
   *  (Chromium caps it at 8, so a 64 GB machine also reads 8). A bucket, not a measurement; Chromium
   *  only. Null where the browser does not say. */
  deviceMemoryGB: number | null;
  /** Whether the page is cross-origin isolated, which `measureUserAgentSpecificMemory` requires. */
  crossOriginIsolated: boolean | null;
}

interface Box {
  version: 1;
  env?: BoxEnv;
  /** The last beat of a phase that has not finished. Still set at the next load = it died there. */
  open: Beat | null;
  history: Beat[];
}

function read(): Box {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Box | null;
    if (raw && raw.version === 1 && Array.isArray(raw.history)) return raw;
  } catch {
    // unreadable or blocked: start fresh
  }
  return { version: 1, open: null, history: [] };
}

function write(box: Box): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(box));
  } catch {
    // Storage full or blocked: the recorder is a nicety, never a reason to fail a run.
  }
}

type MemoryInfo = { usedJSHeapSize?: number; jsHeapSizeLimit?: number };

function memoryInfo(): MemoryInfo | undefined {
  try {
    return typeof performance !== 'undefined'
      ? (performance as Performance & { memory?: MemoryInfo }).memory
      : undefined;
  } catch {
    return undefined;
  }
}

function toMB(bytes: unknown): number | undefined {
  return typeof bytes === 'number' && Number.isFinite(bytes) ? Math.round(bytes / 1048576) : undefined;
}

function heapMB(): number | undefined {
  return toMB(memoryInfo()?.usedJSHeapSize);
}

function heapLimitMB(): number | undefined {
  return toMB(memoryInfo()?.jsHeapSizeLimit);
}

/** This thread's JS heap in MB, or null where the browser does not expose it. For the workers to
 *  report their own (workers/chainSearch.worker.ts): same `performance.memory`, feature-detected. */
export function ownHeapMB(): number | null {
  return heapMB() ?? null;
}

export function environment(): BoxEnv {
  let deviceMemoryGB: number | null = null;
  let isolated: boolean | null = null;
  try {
    const dm =
      typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
    if (typeof dm === 'number' && Number.isFinite(dm)) deviceMemoryGB = dm;
  } catch {
    // not exposed
  }
  try {
    const coi = (globalThis as { crossOriginIsolated?: unknown }).crossOriginIsolated;
    if (typeof coi === 'boolean') isolated = coi;
  } catch {
    // not exposed
  }
  return { deviceMemoryGB, crossOriginIsolated: isolated };
}

/** The last `measureUserAgentSpecificMemory` result, MB, and whether one is in flight. */
let uaMemory: number | undefined;
let uaMeasuring = false;

/** Start one whole-page measurement if the browser allows it (needs cross-origin isolation, which
 *  this site normally lacks; then this is a no-op). The result lands in the NEXT beat. */
function measureUaMemory(): void {
  if (uaMeasuring) return;
  try {
    if ((globalThis as { crossOriginIsolated?: unknown }).crossOriginIsolated !== true) return;
    const measure = (performance as Performance & { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> })
      .measureUserAgentSpecificMemory;
    if (typeof measure !== 'function') return;
    uaMeasuring = true;
    measure
      .call(performance)
      .then(r => {
        uaMemory = toMB(r?.bytes);
      })
      .catch(() => {})
      .finally(() => {
        uaMeasuring = false;
      });
  } catch {
    uaMeasuring = false;
  }
}

/** Add up worker heaps as reported (null = that worker could not say). Null sums when none could. */
export function summarizeWorkerHeaps(heaps: readonly (number | null | undefined)[]): {
  workersHeapMB: number | null;
  workerHeapMaxMB: number | null;
  workersReporting: number;
} {
  let sum = 0;
  let max = 0;
  let n = 0;
  for (const h of heaps) {
    if (typeof h !== 'number' || !Number.isFinite(h)) continue;
    sum += h;
    max = Math.max(max, h);
    n++;
  }
  return n
    ? { workersHeapMB: sum, workerHeapMaxMB: max, workersReporting: n }
    : { workersHeapMB: null, workerHeapMaxMB: null, workersReporting: 0 };
}

/** The workers' memo sizes added up; null when none has reported. */
export function sumMemoEntries(counts: readonly (number | null | undefined)[]): number | null {
  let sum = 0;
  let n = 0;
  for (const c of counts) {
    if (typeof c !== 'number' || !Number.isFinite(c)) continue;
    sum += c;
    n++;
  }
  return n ? sum : null;
}

/** "850 MB", "2.1 GB". */
export function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** The crash notice's memory clause, e.g. "73 MB on the page's main thread, 2.1 GB in 19 workers",
 *  or '' when nothing is known. */
export function memoryPhrase(b: Pick<Beat, 'heapMB' | 'workersHeapMB' | 'workersReporting' | 'uaMemoryMB'>): string {
  const parts: string[] = [];
  if (b.heapMB !== undefined) parts.push(`${formatMB(b.heapMB)} on the page's main thread`);
  if (typeof b.workersHeapMB === 'number' && b.workersReporting) {
    parts.push(`${formatMB(b.workersHeapMB)} in ${b.workersReporting} worker${b.workersReporting === 1 ? '' : 's'}`);
  }
  if (b.uaMemoryMB !== undefined) parts.push(`${formatMB(b.uaMemoryMB)} for the whole page by the browser's count`);
  return parts.join(', ');
}

/**
 * What the crash notice says about the workers when the browser gave no figure for their memory
 * (Chrome never does from a worker): that it doesn't, and how full their caches were instead.
 * '' when the workers' memory is known, or there were no workers.
 */
export function workersNote(
  b: Pick<Beat, 'workers' | 'workersHeapMB' | 'workersMemoEntries' | 'workersMemoCapacity'>
): string {
  if (typeof b.workersHeapMB === 'number' || !b.workers) return '';
  const n = b.workers;
  const workers = `${n} worker${n === 1 ? '' : 's'}`;
  const memo =
    typeof b.workersMemoEntries === 'number'
      ? `; their caches held ${b.workersMemoEntries.toLocaleString('en-US')} partial routes (${(
          b.workersMemoCapacity ?? 3000 * n
        ).toLocaleString('en-US')} when full)`
      : '';
  return `The browser doesn't report how much memory the ${workers} used${memo}.`;
}

/** The memory fields every beat carries, read on the main thread. Browsers do not expose the
 *  machine's free system memory at all, so there is no field for it. */
function pageMemory(): Pick<Beat, 'heapMB' | 'heapLimitMB' | 'uaMemoryMB'> {
  measureUaMemory();
  const out: Pick<Beat, 'heapMB' | 'heapLimitMB' | 'uaMemoryMB'> = { heapMB: heapMB() };
  const limit = heapLimitMB();
  if (limit !== undefined) out.heapLimitMB = limit;
  if (uaMemory !== undefined) out.uaMemoryMB = uaMemory;
  return out;
}

/** Whether THIS page wrote the open beat. The box is one key shared by every tab, and a second
 *  tab closing must not mark the first tab's run as closed by the player. */
let mine = false;
/** `pagehide` has fired: the page is going away on purpose. Beats written after it (the
 *  visibilitychange that follows a reload, a last timer tick) keep `pageClosed`, or a plain reload
 *  would read as a crash. Cleared by `pageShown` if the page comes back from the back/forward cache. */
let closing = false;

/** Record that `phase` is going on right now, with whatever progress is known. Returns the beat as
 *  written (the "Stepping away?" worker rule reads its memory figures, composables/useStepAway.ts). */
export function beat(b: Omit<Beat, 'at' | 'hidden' | 'heapMB' | 'heapLimitMB' | 'uaMemoryMB'>): Beat {
  mine = true;
  const box = read();
  const full: Beat = {
    ...b,
    at: Date.now(),
    hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
    ...pageMemory(),
    ...(closing ? { pageClosed: true } : {}),
  };
  box.env ??= environment();
  box.open = full;
  const kept = { ...full };
  delete kept.runNote;
  box.history = [...box.history, kept].slice(-HISTORY);
  write(box);
  return full;
}

/** A tab hide/show, noted in the history without opening a phase. */
export function note(detail: string): void {
  const box = read();
  const b: Beat = {
    at: Date.now(),
    phase: 'tab',
    detail,
    hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
    heapMB: heapMB(),
  };
  box.history = [...box.history, b].slice(-HISTORY);
  write(box);
}

/** The phase finished normally: nothing to report next time. */
export function end(phase: string): void {
  const box = read();
  if (box.open && box.open.phase === phase) {
    box.open = null;
    mine = false;
  }
  box.history = [
    ...box.history,
    {
      at: Date.now(),
      phase,
      detail: 'finished',
      hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
      heapMB: heapMB(),
    },
  ].slice(-HISTORY);
  write(box);
}

/** The page is going away on purpose (reload, close, another URL). Called from `pagehide`, which
 *  a crash never fires -- so an unfinished beat without this is the browser's doing. */
export function pageClosing(): void {
  closing = true;
  if (!mine) return;
  const box = read();
  if (!box.open) return;
  box.open = { ...box.open, pageClosed: true };
  write(box);
}

/** `pageshow` from the back/forward cache: the page is back, and its beats are live again. */
export function pageShown(): void {
  closing = false;
}

/** What the previous page was in the middle of when it stopped, or null. Read once, at load. */
export function readUnfinished(): { last: Beat; history: Beat[]; env?: BoxEnv } | null {
  const box = read();
  return box.open ? { last: box.open, history: box.history, ...(box.env ? { env: box.env } : {}) } : null;
}

/** Forget the previous page's unfinished phase (dismissed, or a new run started). */
export function clearUnfinished(): void {
  const box = read();
  box.open = null;
  // The next run records its own machine facts afresh.
  delete box.env;
  write(box);
}

/** What a player who ticks "Also send diagnostics" shares: see `diagnosticsSummary`. */
export interface DiagnosticsExtra {
  /** "chrome on windows" (lib/browserHelp.ts detectBrowser): a family and an OS, never the user agent. */
  browser: string;
  /** `navigator.hardwareConcurrency` and the worker budget now. */
  cores: number;
  workers: number;
  /** Carried-on runs this visit (a crashed or unfinished run picked up again). */
  carryOns: number;
  /** The previous page's unfinished phase (`readUnfinished().last`), or null. */
  crashed: Beat | null;
}

/**
 * A compact, non-identifying summary of the black box, for the player who ticks "Also send
 * diagnostics": the memory readings (peaks over the recorded beats), how many workers, whether the
 * last visit died mid-run and in what phase, carry-ons, and the browser family and OS.
 *
 * NEVER in it: the player id, the save, the run note (free text), the user agent string, the beats'
 * timestamps. Numbers and a few short labels only, so it is one line of JSON that fits a CSV comment.
 */
export function diagnosticsSummary(x: DiagnosticsExtra): Record<string, string | number | boolean | null | object> {
  const box = read();
  const beats = [...box.history, ...(box.open ? [box.open] : [])];
  const peak = (pick: (b: Beat) => number | null | undefined): number | undefined => {
    let m: number | undefined;
    for (const b of beats) {
      const v = pick(b);
      if (typeof v === 'number' && Number.isFinite(v)) m = m === undefined ? v : Math.max(m, v);
    }
    return m;
  };
  const env = box.env ?? environment();
  const out: Record<string, string | number | boolean | null | object> = {
    browser: x.browser,
    cores: x.cores,
    workers: x.workers,
    carryOns: x.carryOns,
    lastVisitCrashed: !!x.crashed,
  };
  const set = (k: string, v: number | null | undefined) => {
    if (v !== undefined && v !== null) out[k] = v;
  };
  set('peakWorkers', peak(b => b.workers));
  set('deviceMemoryGB', env.deviceMemoryGB);
  set('peakHeapMB', peak(b => b.heapMB));
  set('heapLimitMB', peak(b => b.heapLimitMB));
  set('peakWorkersHeapMB', peak(b => b.workersHeapMB));
  set('peakWorkerHeapMaxMB', peak(b => b.workerHeapMaxMB));
  set('peakMemoEntries', peak(b => b.workersMemoEntries));
  set('peakPageMemoryMB', peak(b => b.uaMemoryMB));
  if (x.crashed) {
    const c = x.crashed;
    out.crash = {
      phase: c.phase.slice(0, 40),
      ...(c.detail ? { detail: c.detail.slice(0, 60) } : {}),
      hidden: c.hidden,
      ...(c.pageClosed ? { pageClosed: true } : {}),
      ...(c.heapMB !== undefined ? { heapMB: c.heapMB } : {}),
      ...(c.workers !== undefined ? { workers: c.workers } : {}),
    };
  }
  return out;
}
