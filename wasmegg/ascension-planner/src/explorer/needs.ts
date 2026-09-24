/**
 * @module explorer/needs
 * @description What the corpus is still short of, and what it would cost a volunteer to fill each
 * gap.
 *
 * WORKED OUT FROM THE ROWS, NOT A FIXED LIST. Each need is a coverage test over what has been
 * submitted -- accounts per sweep preset, starting TEs outside the measured range, the same save
 * run with force-continue on and off, weak delivery gear -- and it drops off the list once enough
 * accounts have covered it. A static "please run M2" banner would still be asking a year from now.
 *
 * TIMES COME FROM THE COLLECTOR'S OWN `run` FIELD (search/speed.ts), not a benchmark of the viewer's
 * machine (the planner's Re-benchmark button does that): worker-seconds per chain at this chain
 * length, the board's median where enough exhaustive runs agree, divided by the tier's workers.
 * They used to be one flat figure per machine size, which ignored chain length and came out 3-4x
 * short for 2-ascension sweeps (an 8-core desktop's M1: estimated 2 min, took 7).
 */
import { countBanded, parseBands } from '@/search/exhaustive';
import { sweepSeconds, workerSecondsPerChain } from '@/search/speed';
import { groupByAccount, gearOf } from './analysis';
import type { CollectorRow } from './collector';
import { SWEEP_PRESETS } from './upload';

export interface ComputeTier {
  id: string;
  label: string;
  detail: string;
  /** Workers the planner runs on this machine: one per core, less one for the page. */
  workers: number;
}

export const COMPUTE_TIERS: ComputeTier[] = [
  { id: 'laptop', label: 'Laptop', detail: '4 cores', workers: 3 },
  { id: 'desktop', label: 'Desktop', detail: '8 cores', workers: 7 },
  { id: 'workstation', label: 'Workstation', detail: '16-20 cores', workers: 17 },
];

/** Seconds a sweep of `chains` at this length takes on this tier, from the board's own speeds. */
export function estimateSeconds(
  chains: number,
  ascensions: number,
  tier: ComputeTier,
  measured?: Map<number, { seconds: number }>
): number {
  return sweepSeconds(chains, tier.workers, workerSecondsPerChain(ascensions, measured));
}

/** `under a minute`, `25 min`, `3.5 h`. Coarse on purpose; these are estimates. */
export function formatEstimate(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
}

export interface DataNeed {
  id: string;
  title: string;
  /** Why the corpus needs it, in a sentence. */
  why: string;
  /** Who can help: "anyone", "players at 200+ TE", ... */
  who: string;
  /** Accounts that already cover it. */
  have: number;
  /** Accounts wanted before it drops off the list. */
  want: number;
  /** Which sweep preset to run. */
  preset: string;
  /** How many times to run the preset (the force-continue pair is 2). */
  runs: number;
  /** Anything to change from the preset's defaults. */
  note?: string;
}

/** Accounts wanted per preset before that sweep stops being listed. */
const PRESET_WANT: Record<string, number> = { M1: 6, M2: 6, M3: 4, M4: 3 };

/** The measured corpus started between 126 and 198 TE. Outside that, the shape is a guess. */
const HIGH_TE = 200;
const LOW_TE = 125;

/** A delivery set under this share of perfect counts as weak gear. */
const WEAK_GEAR = 0.8;

export function dataNeeds(rows: CollectorRow[]): DataNeed[] {
  const accounts = groupByAccount(rows);
  const needs: DataNeed[] = [];

  for (const preset of SWEEP_PRESETS) {
    const want = PRESET_WANT[preset.id];
    if (!want) continue;
    // A tagged upload counts, and so does any finished exhaustive run at the same ascension count
    // on a 490 target: the planner's own Insane-mode submissions carry `space` but no preset tag,
    // and they measure the same thing.
    const covers = (r: CollectorRow) =>
      r.sweep?.preset === preset.id ||
      (!!r.space && !r.space.stoppedEarly && r.ascensions === preset.ascensions && r.finalTE === 490);
    const have = accounts.filter(a => a.rows.some(covers)).length;
    if (have >= want) continue;
    needs.push({
      id: `sweep-${preset.id}`,
      title: `${preset.label}, from more accounts`,
      why:
        preset.ascensions <= 2
          ? 'The baseline every other sweep is compared against: it pins down how your final leg scales with your gear.'
          : `Lets the ${preset.ascensions}-ascension shape be compared across accounts, which is what a suggested chain for a new player would be built from.`,
      who: 'anyone',
      have,
      want,
      preset: preset.id,
      runs: 1,
    });
  }

  const highAccounts = accounts.filter(a => a.rows.some(r => r.currentTE >= HIGH_TE)).length;
  if (highAccounts < 2) {
    needs.push({
      id: 'te-high',
      title: `Accounts already past ${HIGH_TE} TE`,
      why: 'Every measured run so far started below 200 TE, so nobody knows yet whether the checkpoint near 280 TE holds from higher up.',
      who: `players at ${HIGH_TE}+ TE`,
      have: highAccounts,
      want: 2,
      preset: 'M2',
      runs: 1,
    });
  }

  const lowAccounts = accounts.filter(a => a.rows.some(r => r.currentTE < LOW_TE)).length;
  if (lowAccounts < 2) {
    needs.push({
      id: 'te-low',
      title: `Accounts below ${LOW_TE} TE`,
      why: 'The suggested first checkpoint is a guess below 126 TE: no clean run has started that low.',
      who: `players under ${LOW_TE} TE`,
      have: lowAccounts,
      want: 2,
      preset: 'M2',
      runs: 1,
    });
  }

  const pairs = accounts.filter(
    a => a.rows.some(r => r.forceContinue === true) && a.rows.some(r => r.forceContinue === false)
  ).length;
  if (pairs < 3) {
    needs.push({
      id: 'force-continue',
      title: 'The same save, with force-continue on and then off',
      why: 'Finishing the current run first moved one account’s best plan by 135 days. Pairs from one save show when prestiging now is better.',
      who: 'anyone',
      have: pairs,
      want: 3,
      preset: 'M1',
      runs: 2,
      note: 'Run it once with "Continue current ascension" ticked and once without, on the same backup.',
    });
  }

  const weak = accounts.filter(a => a.rows.some(r => (gearOf(r).delivery ?? 1) < WEAK_GEAR)).length;
  if (weak < 2) {
    needs.push({
      id: 'weak-gear',
      title: 'Accounts with weaker delivery gear',
      why: 'Tests whether weaker gear really wants more ascensions, as the few such accounts so far suggest.',
      who: `players under ${Math.round(WEAK_GEAR * 100)}% delivery score`,
      have: weak,
      want: 2,
      preset: 'M2',
      runs: 1,
    });
  }

  return needs;
}

/**
 * A preset's bands, fitted to where this player is.
 *
 * The presets were written for a ~180 TE account, so their first band starts at 189-190. A 133 TE
 * player running them as written would skip 134-189 -- exactly where a low account's first
 * checkpoint may belong (a 133 TE account's best 4-ascension chain starts at 150). So the first band
 * is pulled down to start just above the player's TE, keeping its step; every band then drops the
 * values the player has already passed. Returned as text, ready to paste into the planner.
 */
export function presetBandsFor(presetId: string, currentTE: number, final = 490): string {
  const preset = SWEEP_PRESETS.find(p => p.id === presetId);
  if (!preset || !preset.bands) return '';
  const start = Math.floor(currentTE) + 1;
  return preset.bands
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map((part, i) => {
      const m = part.match(/^(\d+)\s*-\s*(\d+)(?::(\d+))?$/);
      if (!m) return part;
      const step = m[3] ? Number(m[3]) : 5;
      const hi = Math.min(Number(m[2]), final - 1);
      const lo = i === 0 ? Math.min(Number(m[1]), start) : Math.max(Number(m[1]), start);
      return `${Math.min(lo, hi)}-${hi}:${step}`;
    })
    .join('; ');
}

/** Chains one run of a preset prices from this TE toward `final`, with the bands fitted as above. */
export function presetChains(presetId: string, currentTE: number, final = 490): { chains: number; ascensions: number } {
  const preset = SWEEP_PRESETS.find(p => p.id === presetId);
  const text = presetBandsFor(presetId, currentTE, final);
  if (!preset || !text) return { chains: 0, ascensions: 0 };
  const bands = parseBands(text).map(band => band.filter(v => v > currentTE && v < final));
  return { chains: countBanded(bands, final, currentTE, preset.minGap), ascensions: preset.ascensions };
}
