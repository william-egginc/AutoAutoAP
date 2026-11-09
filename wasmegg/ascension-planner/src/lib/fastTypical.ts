/**
 * @module fastTypical
 * @description What a Smart search (Fast, Exact) really prices on this device, as a share of its upper bound.
 *
 * A Smart search's route count (search/effort.ts `estimateChains`) is an UPPER bound: descent stops as soon as nothing
 * moves. A Fast run priced 492-602 of ~915 in the browser repro of the tester's R7 report (aaap-tools/notes/
 * eta-swing-2026-11-09.md), so How long priced at the bound read about twice the real time, and the time left ended a
 * run with ~15 min still showing. Decision (9 Nov 2026): estimate from what the search really prices, the bound only
 * when nothing better is known.
 *
 * Kept like the measured speed (lib/chainBenchmarkCache.ts): per player, in this browser, per level. Each finished run
 * (not stopped, nothing replayed) adds its routes priced over its bound; the last `KEEP` are kept. A SHARE, not a
 * count, so it carries over to a route of another length or other counts (another bound). Nothing kept (a device's
 * first run, or a level never finished here): the bound.
 *
 * In src/lib, not src/search: it decides no result, so it stays out of the result code hash (lib/resultCodeHash.ts).
 */

const STORAGE_KEY_PREFIX = 'chain_typical_v1';
/** Runs kept per level. */
export const KEEP = 5;

export type TypicalShares = Record<string, number[]>;

function storageKey(playerId: string): string {
  return `${STORAGE_KEY_PREFIX}:${playerId}`;
}

export function loadTypicalShares(playerId: string): TypicalShares {
  if (!playerId) return {};
  try {
    const raw = localStorage.getItem(storageKey(playerId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: TypicalShares = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v.filter(x => typeof x === 'number' && x > 0 && x <= 1).slice(-KEEP);
    }
    return out;
  } catch {
    return {};
  }
}

/** The shares after one more finished run of `level` that priced `priced` of `bound`, kept for next time. */
export function noteTypicalShare(
  playerId: string,
  shares: TypicalShares,
  level: string,
  priced: number,
  bound: number
): TypicalShares {
  if (!(priced > 0) || !(bound > 0)) return shares;
  const share = Math.min(1, priced / bound);
  const next = { ...shares, [level]: [...(shares[level] ?? []), share].slice(-KEEP) };
  if (playerId) {
    try {
      localStorage.setItem(storageKey(playerId), JSON.stringify(next));
    } catch {
      // Quota or privacy mode: the estimate falls back to the bound, as on a first run.
    }
  }
  return next;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length / 2;
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2;
}

/** Routes this search typically prices against `bound`: the kept runs' median share of it; the bound with none. */
export function typicalCount(bound: number, shares: readonly number[] | undefined): number {
  if (!shares?.length || !(bound > 0)) return bound;
  return Math.min(bound, Math.max(1, Math.round(bound * median(shares))));
}

/**
 * The count a running search's time left counts down to: the typical count while the run is under it, then the most
 * any kept run priced (a longer run than usual), then the bound.
 */
export function typicalTotal(bound: number, shares: readonly number[] | undefined, done: number): number {
  const steps = [typicalCount(bound, shares)];
  if (shares?.length) steps.push(Math.min(bound, Math.round(bound * Math.max(...shares))));
  steps.push(bound);
  // At the typical count itself, nothing left (the run usually ends there); one route past it, the next step.
  return steps.find(n => n >= done) ?? Math.max(bound, done);
}
