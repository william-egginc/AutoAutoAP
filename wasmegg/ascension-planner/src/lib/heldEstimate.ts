/**
 * THE ESTIMATE SHOWN LAST (cached answers first, then recheck: Jordan, 27 Oct 2026). A followed route's estimate on
 * the instant answer's data (lib/followEstimate.ts) is worked out in a route worker on every page load, so a reload of
 * My runs had "Working out your route's times…" and no times for a few seconds. The last one shown is kept here, per
 * account (a hash, never the player ID), goal and route, and shown at once, marked "From <time>, checking…", until the
 * fresh one is in (composables/useNowPage.ts).
 *
 * Small (a plan of a few stops), bounded (`HELD_MAX`), localStorage in try/catch: a convenience only.
 */
export const HELD_ESTIMATE_KEY = 'aap-follow-estimate-held';
export const HELD_MAX = 6;

export interface HeldEstimate<P = unknown, C = unknown> {
  /** search/runSaves.ts `accountOf`: a hash. */
  account: string;
  goalKey: string;
  /** The route as followed from the save (the estimate's own chain). */
  chain: number[];
  /** When the pricing it was made with was kept, ms: the mark's time. */
  at: number;
  plan: P;
  card: C;
}

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readAll(st: Store): HeldEstimate[] {
  try {
    const v = JSON.parse(st.getItem(HELD_ESTIMATE_KEY) ?? '[]') as HeldEstimate[];
    return Array.isArray(v)
      ? v.filter(h => h && typeof h.account === 'string' && typeof h.goalKey === 'string' && Array.isArray(h.chain) && typeof h.at === 'number' && !!h.plan)
      : [];
  } catch {
    return [];
  }
}

/** Keep `h` (replacing the same account and goal's), the newest HELD_MAX in all. False when not kept. */
export function keepHeld(h: HeldEstimate, st: Store | null = storage()): boolean {
  if (!st || !h.account || !h.chain.length) return false;
  try {
    const text = JSON.stringify(h);
    if (/EI\d{16}/i.test(text)) return false;
    const list = [JSON.parse(text) as HeldEstimate, ...readAll(st).filter(x => !(x.account === h.account && x.goalKey === h.goalKey))].slice(0, HELD_MAX);
    st.setItem(HELD_ESTIMATE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** The estimate kept for this account, goal and route, or null. */
export function readHeld<P = unknown, C = unknown>(
  account: string | null | undefined,
  goalKey: string,
  chain: readonly number[],
  st: Store | null = storage()
): HeldEstimate<P, C> | null {
  if (!st || !account) return null;
  const want = chain.join(',');
  return (readAll(st).find(h => h.account === account && h.goalKey === goalKey && h.chain.join(',') === want) as HeldEstimate<P, C> | undefined) ?? null;
}
