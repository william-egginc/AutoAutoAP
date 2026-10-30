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
