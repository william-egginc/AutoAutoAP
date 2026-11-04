/**
 * BUILD-UP TRACKER BREADCRUMBS (spec-buildcache, 30 Oct 2026: a live "working it out…" over 80 s with nothing in the
 * console). One `[buildup] …` line per state change of the tracker's plan (wanted on/off, a kept record restored with or
 * without a plan, a run started / finished, a plan kept / read / dropped, planFailed, retry, the fold opened / closed),
 * so the next live check shows where it stops.
 *
 * OFF by default (no console noise for players). On with localStorage `aap-debug` = '1' or `?debug=1` in the address.
 * No IDs: anything shaped like EI + 16 digits is masked. Never throws.
 */
export const DEBUG_KEY = 'aap-debug';

export function buildUpDebugOn(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_KEY) === '1') return true;
  } catch {
    /* no storage */
  }
  try {
    const search = typeof location !== 'undefined' ? location.search : '';
    return /[?&]debug=1(&|$)/.test(search ?? '');
  } catch {
    return false;
  }
}

/** A key or text with no ID in it (EI + 16 digits masked). */
export function maskIds(text: string): string {
  return text.replace(/EI\d{16}/gi, 'EI…');
}

/** One breadcrumb line when the flag is on; nothing otherwise. */
export function buildUpLog(message: string): void {
  if (!buildUpDebugOn()) return;
  try {
    console.info(`[buildup] ${maskIds(message).replace(/\s*\n\s*/g, ' ')}`);
  } catch {
    /* no console */
  }
}

/** A sim key for a breadcrumb: short, no ID (the account part is a hash already; masked anyway). */
export function shortKey(key: string): string {
  const k = maskIds(key);
  return k.length > 60 ? `${k.slice(0, 57)}…` : k;
}

/**
 * PERF BREADCRUMBS (spec-mainfreeze, 31 Oct 2026: Jordan's live tab froze 45 s or more on the main thread right after
 * "[buildup] run scheduled (leg)", while the Build-up tracker was worked out). Behind the same flag as the lines above,
 * read ONCE per page load: off (the default), each helper is one boolean test and nothing else (no performance.mark, no
 * clock read, no observer). On: every step of a My runs sim request gets a performance.mark + performance.measure named
 * `aap:<step>` (they show in the browser's own Performance panel), a `[buildup] perf <step> <ms> ms` line when it took
 * 50 ms or more, and a long-task observer says `[buildup] longtask <ms> ms` with the nearest step marked before it.
 */
export const PERF_LOG_MS = 50;
let perfFlag: boolean | null = null;
/** Whether the perf breadcrumbs are on (the flag, read once per page load). */
export function perfOn(): boolean {
  if (perfFlag === null) perfFlag = buildUpDebugOn();
  return perfFlag;
}
/** Specs: read the flag again (null), or force it. */
export function setPerfFlag(on: boolean | null): void {
  perfFlag = on;
  marks.length = 0;
}
/** The last few steps begun, for the long-task line (newest last). */
const marks: { step: string; at: number }[] = [];
const MARKS_KEPT = 40;
function clock(): number {
  return performance.now();
}
/** A step begins: its start time, or null with the flag off (then `perfEnd` does nothing). `quiet`: a step that comes
 *  often (each worker reply): measured, but neither marked nor kept as the nearest step of a long task. */
export function perfStart(step: string, quiet = false): number | null {
  if (!perfOn()) return null;
  try {
    const at = clock();
    if (quiet) return at;
    performance.mark(`aap:${step}:start`);
    marks.push({ step, at });
    if (marks.length > MARKS_KEPT) marks.splice(0, marks.length - MARKS_KEPT);
    ensureLongTaskWatch();
    return at;
  } catch {
    return null;
  }
}
/** A step ends: measured, and said when it took `PERF_LOG_MS` or more. */
export function perfEnd(step: string, start: number | null, detail = ''): void {
  if (start === null) return;
  try {
    const end = clock();
    const ms = end - start;
    try {
      if (ms >= PERF_LOG_MS || marks.some(m => m.at === start && m.step === step)) performance.measure(`aap:${step}`, { start, end });
    } catch {
      /* an older browser: the line below is enough */
    }
    if (ms >= PERF_LOG_MS) console.info(maskIds(`[buildup] perf ${step} ${Math.round(ms)} ms${detail ? ` (${detail})` : ''}`));
  } catch {
    /* no clock or console */
  }
}
/** `fn()` measured as `step` (just `fn()` with the flag off). */
export function perfStep<T>(step: string, fn: () => T): T {
  if (!perfOn()) return fn();
  const t0 = perfStart(step);
  try {
    return fn();
  } finally {
    perfEnd(step, t0);
  }
}
/** The step marked last at or before `at` (a long task's start), with how long before. */
export function nearestMark(at: number): string {
  let best: { step: string; at: number } | null = null;
  for (const m of marks) if (m.at <= at + 1 && (!best || m.at >= best.at)) best = m;
  return best ? `${best.step} (${Math.round(Math.max(0, at - best.at))} ms before)` : 'none';
}
let longTaskWatch: { disconnect(): void } | null = null;
/** The long-task observer, once, while the flag is on (Chrome; elsewhere there is none). */
export function ensureLongTaskWatch(): void {
  if (longTaskWatch || !perfOn()) return;
  try {
    if (typeof PerformanceObserver === 'undefined') return;
    const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: readonly string[] }).supportedEntryTypes;
    if (supported && !supported.includes('longtask')) return;
    const obs = new PerformanceObserver(list => {
      for (const e of list.getEntries())
        console.info(maskIds(`[buildup] longtask ${Math.round(e.duration)} ms, nearest mark ${nearestMark(e.startTime)}`));
    });
    obs.observe({ type: 'longtask', buffered: true });
    longTaskWatch = obs;
  } catch {
    /* no observer */
  }
}
/** Specs: the observer let go. */
export function stopLongTaskWatch(): void {
  try {
    longTaskWatch?.disconnect();
  } catch {
    /* gone */
  }
  longTaskWatch = null;
}
