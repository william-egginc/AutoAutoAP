/**
 * @file left.ts
 * @description "What's left": for a run that tried a fixed box of TEs, how much of the same box at
 * EVERY TE it did not price.
 *
 * An exhaustive run stores the TEs it tried at each ascension (`space.bands`, or one shared pool in
 * `space.range`). Most sweeps step through them -- every 5th TE for M3 and M4, every 2nd for M2 --
 * and a 1-TE move can cost days (the audit's median is 17), so the TEs between the steps are where
 * a better plan can still be hiding. Widening every band to step 1, keeping its ends, its gap and its
 * ascension count, gives the same box at every TE. Everything the run priced sits inside it, so what
 * is left is simply that count minus what was priced; a run stopped early leaves the rest of its own
 * box too. Counted by the same DPs the planner uses to refuse a space before building it
 * (`countBanded`, `countChainsWithGap`), which reproduce every stored run's own chain count exactly.
 *
 * Per run, never across runs: two runs of one account were priced from different saves, so the
 * plans one priced are not the plans the other left.
 *
 * A staged search (balanced, thorough, ...) improved a seed chain instead of trying a fixed box, so
 * there is nothing to measure against, and `leftOf` says so with null.
 */
import { buildPool, countBanded, countChainsWithGap } from '@/search/exhaustive';
import { boxPriced } from './analysis';
import type { CollectorRow } from './collector';
import { COMPUTE_TIERS, estimateSeconds, formatEstimate } from './needs';

/** The machine "how long" is quoted for: the biggest tier Data needs asks for, 16-20 cores. */
const TIER = COMPUTE_TIERS.find(t => t.id === 'workstation') ?? COMPUTE_TIERS[COMPUTE_TIERS.length - 1];

export interface Left {
  /** Plans in the run's box at every TE: same ends, gap and ascension count. Infinity if uncountable. */
  everyTE: number;
  /** Of those, the ones the run priced. */
  priced: number;
  /** The rest: the TEs between its steps, plus any of its own box it never reached. */
  left: number;
  /** The every-TE box in the notation typed into the planner, cut where a line may wrap. */
  pieces: string[];
  /** Seconds to price what is left on a 16-20 core machine. */
  seconds: number;
  /** The machine those seconds are for, in words. */
  machine: string;
  /** Timed at the board's measured speed for this length, or at the planner's fallback table. */
  measuredSpeed: boolean;
  /** The run finished its own box. When it did not, part of what is left is its own box. */
  finishedBox: boolean;
}

/** `lo..hi` as every TE. */
function everyValue(lo: number, hi: number): number[] {
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
}

/**
 * What a run left of its box at every TE, or null when there is nothing to measure against: a
 * staged search (no box), or a row whose box cannot be reproduced -- recounted from the row, its
 * own box must come to the `space.chains` the run stored, or the every-TE count built the same way
 * would not be comparable either. `measured` is the board's worker-seconds per plan by ascension
 * count (`measuredWorkerSeconds`); without it the planner's fallback speeds are used.
 */
export function leftOf(row: CollectorRow, measured?: Map<number, { seconds: number }>): Left | null {
  const sp = row.space;
  if (!sp) return null;
  const asc = sp.minAscensions === sp.maxAscensions ? `${sp.minAscensions}` : `${sp.minAscensions}-${sp.maxAscensions}`;
  let everyTE: number;
  const pieces: string[] = [];
  let own: number;
  if (sp.mode === 'range' && sp.range) {
    const { lo, hi, step } = sp.range;
    // The pool the run built (`buildPool`): nothing at or below the account's TE, nothing at or past
    // the target, which is where every chain ends anyway.
    const count = (by: number) =>
      countChainsWithGap(
        buildPool({ lo, hi, step: by }, row.currentTE, row.finalTE),
        sp.minAscensions,
        sp.maxAscensions,
        sp.minGap
      );
    own = count(step);
    everyTE = count(1);
    pieces.push(`${lo}-${hi}:1 for every target`, `· ${asc} asc`);
  } else if (sp.bands?.length && sp.bands.every(b => b.length)) {
    own = countBanded(sp.bands, row.finalTE, row.currentTE, sp.minGap);
    const wide = sp.bands.map(b => everyValue(Math.min(...b), Math.max(...b)));
    everyTE = countBanded(wide, row.finalTE, row.currentTE, sp.minGap);
    wide.forEach((b, i) => {
      const text = b.length === 1 ? `${b[0]}` : `${b[0]}-${b[b.length - 1]}:1`;
      pieces.push(text + (i < wide.length - 1 ? ';' : ''));
    });
    if (sp.minAscensions !== sp.maxAscensions) pieces.push(`· ${asc} asc`);
  } else {
    return null;
  }
  if (own !== sp.chains || !(everyTE >= own)) return null;
  if (sp.minGap > 0) pieces.push(`· gap ${sp.minGap}`);
  const priced = Math.min(boxPriced(row), everyTE);
  const left = everyTE - priced;
  // A range of counts is timed at its longest: most of a multi-count box is long chains, so this
  // stays "about" without underselling it.
  const seconds = Number.isFinite(left) ? estimateSeconds(left, sp.maxAscensions, TIER, measured) : Infinity;
  return {
    everyTE,
    priced,
    left,
    pieces,
    seconds,
    machine: `a machine with ${TIER.detail}`,
    measuredSpeed: !!measured?.has(sp.maxAscensions),
    finishedBox: priced >= sp.chains && !sp.stoppedEarly,
  };
}

/** `49`, `7,308`, `240K`, `11M`, `1B`: exact while it fits, then two significant figures. */
export function plansText(n: number): string {
  if (!Number.isFinite(n)) return 'too many to count';
  if (n < 10_000) return n.toLocaleString('en-US');
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 2 }).format(n);
}

/** The share of the every-TE box left, never rounded up to 100% while anything was priced. */
export function leftShareText(l: Left): string {
  if (!Number.isFinite(l.everyTE) || l.everyTE <= 0) return '';
  const pct = (l.left / l.everyTE) * 100;
  if (l.left === l.everyTE) return '100%';
  if (l.left > 0 && pct < 0.1) return '<0.1%';
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.floor(pct)}%`;
}

/** Data needs' coarse estimate, stretched to the lengths a box at every TE can reach. */
export function longEstimate(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'too long to estimate';
  const hours = seconds / 3600;
  if (hours < 48) return formatEstimate(seconds);
  const days = hours / 24;
  if (days < 60) return `${Math.round(days)} days`;
  if (days < 730) return `${Math.round(days / 30.4)} months`;
  return `${Math.round(days / 365).toLocaleString('en-US')} years`;
}

/** A count in full for the tooltip, where there is room: `242,307`. */
const exact = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'too many to count');

/** The tooltip: the every-TE box, what was priced of it, what is left and how long the rest takes. */
export function leftTitle(l: Left): string {
  const box = l.pieces.join(' ');
  if (!Number.isFinite(l.everyTE)) return `The same box at every TE (${box}) holds more plans than can be counted.`;
  if (l.left === 0) {
    return `It tried every TE in its box (${box}) and priced all ${l.everyTE.toLocaleString('en-US')} plans: nothing is left in this box. A better plan can only be outside it.`;
  }
  const parts = [
    `The same box at every TE (${box}) holds ${exact(l.everyTE)} plans.`,
    `This run priced ${l.priced.toLocaleString('en-US')} of them, so ${exact(l.left)} are left (${leftShareText(l)}): the TEs between its steps${l.finishedBox ? '' : ', and the part of its own box it never reached'}.`,
    `Pricing the rest on ${l.machine} would take about ${longEstimate(l.seconds)}, at ${l.measuredSpeed ? "the board's own speed for plans this long" : "the planner's usual speed (the board has too few runs this long to measure)"}.`,
    'Plans from another run of this account are not taken off: they were priced from a different save.',
  ];
  return parts.join(' ');
}
