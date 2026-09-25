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
  /** Which list it belongs in (see SweepPreset.group). Unset is the main list. */
  group?: 'main' | 'big' | 'end';
}

/** Accounts wanted per preset before that sweep stops being listed. */
const PRESET_WANT: Record<string, number> = { M1: 6, M2: 6, M3: 4, M4: 3, F2: 6 };

/** The widest step inside any band, or null for a band set with nothing to measure. */
function coarsestStep(bands: number[][] | undefined): number | null {
  let worst = 0;
  for (const b of bands ?? []) for (let i = 1; i < b.length; i++) worst = Math.max(worst, b[i] - b[i - 1]);
  return bands?.length ? Math.max(1, worst) : null;
}

/** The bands a run actually priced: its own record, or the text an upload was tagged with. */
function runBands(r: CollectorRow): number[][] | undefined {
  if (r.space?.bands?.length) return r.space.bands;
  return r.sweep?.bands ? parseBands(r.sweep.bands) : undefined;
}

/** A run whose grid is at least as fine as `step` everywhere. */
function atLeastAsFine(r: CollectorRow, step: number): boolean {
  const worst = coarsestStep(runBands(r));
  return worst !== null && worst <= step;
}

/** A finished exhaustive run that checked EVERY TE in every band (step 1 throughout). */
function everyTE(r: CollectorRow): boolean {
  return !!r.space?.bands?.length && atLeastAsFine(r, 1);
}

/** Days between two runs' plan starts, from their `YYYY-MM-DD HH:MM` local stamps. */
function daysApart(a: CollectorRow, b: CollectorRow): number {
  const t = (r: CollectorRow) => Date.parse(`${(r.startLocal ?? '').slice(0, 10)}T00:00:00Z`);
  return Math.abs(t(a) - t(b)) / 86400000;
}

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
    // A fine preset is only covered by a run at least as fine: an old every-2-TE M2 answers a
    // coarser question than F2. Checked on tagged runs too, since an upload can be tagged with any
    // preset whatever grid it actually ran.
    const presetStep = coarsestStep(parseBands(preset.bands.replace(/\+(\d+)\s*-\s*\+(\d+)/, '$1-$2')));
    const fineEnough = (r: CollectorRow) => !preset.fine || (presetStep !== null && atLeastAsFine(r, presetStep));
    const covers = (r: CollectorRow) =>
      fineEnough(r) &&
      (r.sweep?.preset === preset.id ||
        (!!r.space && !r.space.stoppedEarly && r.ascensions === preset.ascensions && r.finalTE === 490));
    const have = accounts.filter(a => a.rows.some(covers)).length;
    if (have >= want) continue;
    needs.push({
      id: `sweep-${preset.id}`,
      title: `${preset.label}, from more accounts`,
      why:
        preset.id === 'F2'
          ? 'The best plans are very sharp: ascending just one TE off can cost 2 to 22 days. This checks every single TE where the best 3-ascension plans have landed so far.'
          : preset.ascensions <= 2
            ? 'The 2-ascension baseline everything else is compared against: it shows how fast your delivery set finishes the last stretch to 490.'
            : `Lets the ${preset.ascensions}-ascension shape be compared across accounts, which is what a suggested chain for a new player would be built from.`,
      who: 'anyone',
      have,
      want,
      preset: preset.id,
      runs: 1,
      group: preset.group ?? 'main',
    });
  }

  const highAccounts = accounts.filter(a => a.rows.some(r => r.currentTE >= HIGH_TE)).length;
  if (highAccounts < 2) {
    needs.push({
      id: 'te-high',
      title: `Accounts already past ${HIGH_TE} TE`,
      why: 'Every run so far started below 200 TE, so we do not know yet whether ascending at about 280 TE is still right from higher up.',
      who: `players at ${HIGH_TE}+ TE`,
      have: highAccounts,
      want: 2,
      preset: 'F2',
      runs: 1,
    });
  }

  const lowAccounts = accounts.filter(a => a.rows.some(r => r.currentTE < LOW_TE)).length;
  if (lowAccounts < 2) {
    needs.push({
      id: 'te-low',
      title: `Accounts under ${LOW_TE} TE with a strong earnings set`,
      why: 'Plans only start working at about 225 Clothed TE (CTE). From 125 TE that needs an earnings set worth +100 TE, for example a T4L Lunar totem plus two other T4L earnings artifacts (Demeters necklace, Tungsten ankh or Puzzle cube), all with T4 Lunar stones. One account like this so far.',
      who: `players under ${LOW_TE} TE with CTE 225+`,
      have: lowAccounts,
      want: 2,
      preset: 'F2',
      runs: 1,
    });
  }

  const pairs = accounts.filter(
    a => a.rows.some(r => r.forceContinue === true) && a.rows.some(r => r.forceContinue === false)
  ).length;
  if (pairs < 3) {
    needs.push({
      id: 'force-continue',
      title: 'The same save twice: finishing your current ascension first, then ascending straight away',
      why: 'Finishing the current ascension first moved one account’s best plan by 135 days. Both from the same save show when ascending right away is better.',
      who: 'anyone',
      have: pairs,
      want: 3,
      preset: 'M1',
      runs: 2,
      note: 'Run it once with "Continue current ascension" ticked and once without, on the same backup.',
    });
  }

  // Does the needle move with the date? The jagged final leg differs between two saves of the same
  // account, and nobody knows yet whether that is the save or the calendar. Two fine runs from one
  // account, planned days apart, answer it -- and decide whether a chain can be reused next week.
  const later = accounts.filter(a => {
    const fine = a.rows.filter(r => r.ascensions === 3 && !!r.space && !r.space.stoppedEarly && everyTE(r));
    return fine.some(x => fine.some(y => daysApart(x, y) >= 3));
  }).length;
  if (later < 3) {
    needs.push({
      id: 'later-start',
      title: 'The same account again, a few days later',
      why: 'Shows whether the best chain moves when the plan starts later. If it does, a chain has to be re-searched before each ascension; if not, it can be reused.',
      who: 'anyone who ran F2',
      have: later,
      want: 3,
      preset: 'F2',
      runs: 2,
      note: 'Run F2 now, then again after a sync at least three days later, changing nothing else.',
    });
  }

  const weak = accounts.filter(a => a.rows.some(r => (gearOf(r).delivery ?? 1) < WEAK_GEAR)).length;
  if (weak < 2) {
    needs.push({
      id: 'weak-gear',
      title: 'Accounts with a weaker delivery set',
      why: 'For example an epic or rare Quantum metronome, Interstellar compass or Gusset, or missing Tachyon and Quantum stones. Tests whether weaker delivery gear wants more ascensions, as the few such accounts so far suggest.',
      who: `players whose delivery set is under ${Math.round(WEAK_GEAR * 100)}% of the best (all T4L with T4 stones)`,
      have: weak,
      want: 2,
      preset: 'F2',
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
      // `+a-+b:step`, first band only: the player's TE plus a to plus b.
      const rel = i === 0 ? part.match(/^\+(\d+)\s*-\s*\+(\d+)(?::(\d+))?$/) : null;
      if (rel) {
        const step = rel[3] ? Number(rel[3]) : 5;
        const lo = Math.floor(currentTE) + Number(rel[1]);
        const hi = Math.min(Math.floor(currentTE) + Number(rel[2]), final - 1);
        return `${Math.min(lo, hi)}-${hi}:${step}`;
      }
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
