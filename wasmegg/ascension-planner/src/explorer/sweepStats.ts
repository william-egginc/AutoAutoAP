/**
 * @module explorer/sweepStats
 * @description What one sweep's table says about each checkpoint: the best plan through every TE
 * there, how wide the near-best stretch is, and what a coarser search would have cost.
 *
 * ONE TABLE, ONE SAVE. Every plan in a run's table was priced from the same save at the same start,
 * so days between two plans IN THE SAME TABLE are exact, and everything here is measured inside one
 * table: a gap to that table's own best, never a total against another run's.
 *
 * THE CHAIN COLUMN IS ENOUGH. `parseRunCsv` keeps each chain whole (every checkpoint's TE plus the
 * target) and drops only the per-leg columns, which none of this needs: the TE at checkpoint k is
 * `chain[k]`. It is called with no cap here (`parseAll`): the default cap keeps the fastest 60,000
 * and the "Whole range" view draws the slow tail too.
 *
 * CHECKPOINTS ARE COUNTED FROM 0 in code (0 = the first ascension's target) and from 1st in the UI.
 * A plan of n ascensions has n - 1 checkpoints before its final target, the last at index n - 2.
 */
import type { PricedChain } from '@/search/types';
import { parseBands } from '@/search/exhaustive';
import type { CollectorRow } from './collector';
import { parseRunCsv, type ParsedRunCsv } from './collector';

/** A run's table with every chain kept (see the module note on the cap). */
export function parseAll(text: string): ParsedRunCsv {
  return parseRunCsv(text, Infinity);
}

/** The best plan through one TE at one checkpoint. */
export interface EnvelopePoint {
  /** The TE at the checkpoint. */
  te: number;
  /** That plan's total days, counted from the table's own start. Compare only within one table. */
  days: number;
  chain: number[];
}

/**
 * For every TE the table priced at checkpoint `k` (0-based), the best plan with that TE there, in
 * TE order. Only plans of `ascensions` count: a table that priced several counts would otherwise
 * draw a saw between them, and the k-th checkpoint of a 3-plan and of a 6-plan are not one place.
 */
export function checkpointEnvelope(chains: readonly PricedChain[], ascensions: number, k: number): EnvelopePoint[] {
  const best = new Map<number, PricedChain>();
  for (const c of chains) {
    if (c.prestiges !== ascensions || k < 0 || k >= c.chain.length - 1) continue;
    const te = c.chain[k];
    const held = best.get(te);
    if (!held || c.days < held.days) best.set(te, c);
  }
  return [...best.entries()].sort(([a], [b]) => a - b).map(([te, c]) => ({ te, days: c.days, chain: c.chain }));
}

/** The lowest point of an envelope: the table's best plan at this count. Null when it is empty. */
export function envelopeBest(envelope: readonly EnvelopePoint[]): EnvelopePoint | null {
  let best: EnvelopePoint | null = null;
  for (const p of envelope) if (!best || p.days < best.days) best = p;
  return best;
}

/** The TEs at one checkpoint whose best plan finishes within some days of the table's best. */
export interface NearBestRange {
  /** The lowest and highest TE whose best plan comes within. */
  lo: number;
  hi: number;
  /** How many priced TEs come within. */
  within: number;
  /** How many TEs the table priced from `lo` to `hi`: more than `within` when the curve is a saw. */
  priced: number;
  /** The TEs from `lo` to `hi` that do NOT come within: the teeth of the saw. */
  gaps: number[];
  /** The unbroken stretch around the best TE that stays within throughout, as [low, high]. */
  stretch: [number, number];
  /**
   * `lo` (`hi`) is the lowest (highest) TE the table priced at this checkpoint, and not a wall (the
   * player's TE, the target): the true range may go further than the table can say.
   */
  loEdge: boolean;
  hiEdge: boolean;
}

/**
 * Where the plans within `withinDays` of the table's best put this checkpoint. Envelopes here are
 * saws, not bowls (on the 2-ascension sweeps one TE either side of the best is already 3 days or
 * more behind), so the range is every TE that comes within, with the ones between that do not as
 * `gaps`, and the unbroken stretch around the best alongside.
 *
 * `floor` and `ceiling` are the lowest and highest TE a plan could put at this checkpoint at all
 * (`checkpointWalls`): a range that ends there was not cut short by the box.
 */
export function nearBestRange(
  envelope: readonly EnvelopePoint[],
  withinDays: number,
  floor = -Infinity,
  ceiling = Infinity
): NearBestRange | null {
  const best = envelopeBest(envelope);
  if (!best) return null;
  const cutoff = best.days + withinDays;
  const at = envelope.indexOf(best);
  let a = at;
  let b = at;
  while (a > 0 && envelope[a - 1].days <= cutoff) a--;
  while (b < envelope.length - 1 && envelope[b + 1].days <= cutoff) b++;
  let first = at;
  let last = at;
  envelope.forEach((p, i) => {
    if (p.days > cutoff) return;
    first = Math.min(first, i);
    last = Math.max(last, i);
  });
  const span = envelope.slice(first, last + 1);
  const gaps = span.filter(p => p.days > cutoff).map(p => p.te);
  return {
    lo: envelope[first].te,
    hi: envelope[last].te,
    within: span.length - gaps.length,
    priced: span.length,
    gaps,
    stretch: [envelope[a].te, envelope[b].te],
    loEdge: first === 0 && envelope[0].te > floor,
    hiEdge: last === envelope.length - 1 && envelope[last].te < ceiling,
  };
}

/**
 * The TEs a run's box allowed at each checkpoint, for plans of `ascensions`: its own record
 * (`space.bands`, or one shared `space.range` pool), or the bands an upload was tagged with. Null
 * when the run recorded no box, or one that does not line up checkpoint by checkpoint with plans of
 * this length (a box over several counts).
 */
export function boxOf(row: Pick<CollectorRow, 'space' | 'sweep'>, ascensions: number): number[][] | null {
  const checkpoints = ascensions - 1;
  if (checkpoints < 1) return null;
  const sp = row.space;
  if (sp?.mode === 'range' && sp.range && sp.range.step > 0) {
    const { lo, hi, step } = sp.range;
    const pool = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
    return Array.from({ length: checkpoints }, () => pool);
  }
  const bands = sp?.bands?.length ? sp.bands : row.sweep?.bands ? parseBands(row.sweep.bands) : null;
  return bands && bands.length === checkpoints ? bands : null;
}

/** The steps the coarse-step columns try: every 2nd, 5th and 10th TE. */
export const COARSE_STEPS = [2, 5, 10] as const;

/** Coarsen one checkpoint (0-based) and leave the rest as the box had them, or every checkpoint. */
export type CoarseScope = number | 'all';

export type CoarseCost =
  | {
      ok: true;
      step: number;
      /** Days the best plan on the coarse grid finishes after the table's best. 0 when it is the best. */
      lost: number;
      /** That plan. */
      days: number;
      chain: number[];
      /** Plans in the table that fall on the grid: what the coarse search would have priced. */
      tried: number;
    }
  | { ok: false; step: number; why: string };

/** The band's usable TEs: above the player's TE and below the target, ascending. */
function usable(band: readonly number[], currentTE: number, finalTE: number): number[] {
  return [...band].filter(v => v > currentTE && v < finalTE).sort((a, b) => a - b);
}

/** Every TE from its low end to its high end, one apart. */
function isEveryTE(values: readonly number[]): boolean {
  return values.every((v, i) => i === 0 || v - values[i - 1] === 1);
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/**
 * The best plan a search at every `step`-th TE would have found, out of a table that tried every TE:
 * the plans whose checkpoints all sit on the coarse grid, the grid anchored at each band's low end
 * the way the presets anchor theirs (the first TE above the player's, e.g. 125, 127, 129 … for
 * every 2nd TE from TE 124). Such a search prices exactly those plans, so this is not an estimate.
 *
 * `scope` is one checkpoint (0-based), coarsened alone with the others kept as the box had them, or
 * `'all'`. Only a checkpoint whose box was every TE can be coarsened: from every 5th TE, "every
 * 2nd" is a grid the table never priced. Another anchor can land nearer or further from the best;
 * this is the one a preset would have used.
 */
export function coarseStepCost(
  chains: readonly PricedChain[],
  ascensions: number,
  box: readonly (readonly number[])[] | null,
  currentTE: number,
  finalTE: number,
  step: number,
  scope: CoarseScope
): CoarseCost {
  const checkpoints = ascensions - 1;
  if (!box || box.length !== checkpoints) {
    return { ok: false, step, why: 'This run recorded no box that lines up checkpoint by checkpoint.' };
  }
  const scoped = scope === 'all' ? box.map((_, i) => i) : [scope];
  const anchors = new Map<number, number>();
  for (const i of scoped) {
    const values = usable(box[i] ?? [], currentTE, finalTE);
    if (!values.length) return { ok: false, step, why: `The box left no TE at the ${ordinal(i + 1)} checkpoint.` };
    if (!isEveryTE(values)) {
      return {
        ok: false,
        step,
        why: `The box did not try every TE at the ${ordinal(i + 1)} checkpoint, so a coarser grid is not a subset of it.`,
      };
    }
    // One value is its own grid at any step: nothing to coarsen, and no loss to report as a finding.
    if (scope !== 'all' && values.length < 2) {
      return { ok: false, step, why: `The box tried only one TE at the ${ordinal(i + 1)} checkpoint.` };
    }
    anchors.set(i, values[0]);
  }

  let best: PricedChain | null = null;
  let onGrid: PricedChain | null = null;
  let tried = 0;
  for (const c of chains) {
    if (c.prestiges !== ascensions) continue;
    if (!best || c.days < best.days) best = c;
    let fits = true;
    for (const [i, anchor] of anchors) {
      if ((c.chain[i] - anchor) % step !== 0) {
        fits = false;
        break;
      }
    }
    if (!fits) continue;
    tried++;
    if (!onGrid || c.days < onGrid.days) onGrid = c;
  }
  if (!best) return { ok: false, step, why: 'The table has no plans at this count.' };
  if (!onGrid) return { ok: false, step, why: `No plan in the table falls on the every-${ordinal(step)}-TE grid.` };
  return { ok: true, step, lost: onGrid.days - best.days, days: onGrid.days, chain: onGrid.chain, tried };
}

/** Everything the sweep chart and its table need from one run's table, kept once it is read. */
export interface SweepRunStats {
  /** The table's own starting TE (its header), which the x axis measures "above the start" from. */
  currentTE: number;
  finalTE: number;
  ascensions: number;
  /** Plans of this count in the table. */
  plans: number;
  /** The table's best plan at this count. */
  bestDays: number;
  bestChain: number[];
  /** Per checkpoint (0 = first): the best plan through every TE the table priced there. */
  envelopes: EnvelopePoint[][];
  /** Per checkpoint, per `COARSE_STEPS` entry: that checkpoint alone coarsened. */
  coarseAt: CoarseCost[][];
  /** Per `COARSE_STEPS` entry: every checkpoint coarsened at once. */
  coarseAll: CoarseCost[];
}

/**
 * One run's table boiled down to what the sweep view draws, so the chains themselves (tens of
 * thousands) need not stay in memory. Null when the table holds no plan of the run's count.
 */
export function summariseSweepRun(
  parsed: Pick<ParsedRunCsv, 'chains' | 'currentTE' | 'finalTE'>,
  row: Pick<CollectorRow, 'ascensions' | 'currentTE' | 'finalTE' | 'space' | 'sweep'>
): SweepRunStats | null {
  const ascensions = row.ascensions;
  const currentTE = parsed.currentTE || row.currentTE;
  const finalTE = parsed.finalTE || row.finalTE;
  const atCount = parsed.chains.filter(c => c.prestiges === ascensions);
  if (!atCount.length) return null;
  const best = atCount.reduce((a, b) => (b.days < a.days ? b : a));
  const box = boxOf(row, ascensions);
  const checkpoints = Array.from({ length: Math.max(0, ascensions - 1) }, (_, k) => k);
  return {
    currentTE,
    finalTE,
    ascensions,
    plans: atCount.length,
    bestDays: best.days,
    bestChain: best.chain,
    envelopes: checkpoints.map(k => checkpointEnvelope(atCount, ascensions, k)),
    coarseAt: checkpoints.map(k =>
      COARSE_STEPS.map(step => coarseStepCost(atCount, ascensions, box, currentTE, finalTE, step, k))
    ),
    coarseAll: COARSE_STEPS.map(step => coarseStepCost(atCount, ascensions, box, currentTE, finalTE, step, 'all')),
  };
}

/**
 * The lowest and highest TE any plan could put at checkpoint `k`: one above the player's TE per
 * checkpoint before it, and one below the target per checkpoint after it. A near-best stretch that
 * ends there was not cut short by the box (`nearBestRange`).
 */
export function checkpointWalls(currentTE: number, finalTE: number, ascensions: number, k: number) {
  return { floor: Math.floor(currentTE) + 1 + k, ceiling: finalTE - (ascensions - 1 - k) };
}

/** `1st`, `2nd`, … `last` for the checkpoint picker and the axis (a 2-ascension plan's one checkpoint
 *  is its last, as the chart has always called it). */
export function checkpointName(k: number, ascensions: number): string {
  return k === ascensions - 2 ? 'last' : ordinal(k + 1);
}
