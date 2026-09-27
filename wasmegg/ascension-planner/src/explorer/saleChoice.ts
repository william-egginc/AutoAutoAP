/**
 * @module explorer/saleChoice
 * @description Which sale plan the planner picked for each leg of the plans that won, placed by
 * where the leg starts and how far it climbs.
 *
 * WHY THIS TRAVELS BETWEEN ACCOUNTS. A plan's total never compares across accounts (analysis.ts), but
 * the sale plan a leg uses is a choice the planner made for that leg alone: how many sales to wait for
 * before prestiging, given where the leg starts and where it has to get to. Two accounts making the
 * same climb face the same sale calendar, so the choice is a per-leg quantity and lines up across
 * accounts by position (TE), which is what THE RULE allows.
 *
 * LEG 1 IS LEFT OUT. It is the rest of the ascension in progress when the plan starts, so it starts
 * wherever the player happened to be, and its strategy is `continue` on most runs for that reason.
 * Legs 2 onward are whole ascensions, each starting at the previous leg's target.
 *
 * WHAT IT DOES NOT SAY. Only which plan won each leg of the chains that won, never by how much: the
 * stored runs keep the winning leg, not what the other sale plans would have cost there.
 *
 * WHICH RUNS. Every run at the target whose finish still stands (`judgeFinishes`): each account's best
 * standing plan at every count plus its other standing runs, which is every standing run. A run that
 * no longer stands (a what-if, an old save, a replaced or fallen-behind plan) is not a plan anyone is
 * on. Identical legs of one account (same start, same target, same strategy) are one mark, so an
 * account that sent a plan five times counts once for it.
 */
import type { CollectorRow } from './collector';
import { accountKey, type FinishJudgement } from './analysis';

/** The sale plan of one leg, without the tier-13 part. */
export type SalePlan = 'continue' | '1-sale' | '2-sale' | '3-sale';

/** In legend order. */
export const SALE_PLANS: readonly SalePlan[] = ['1-sale', '2-sale', '3-sale', 'continue'];

/**
 * Palette slot per plan (palette.ts `colorAt`). The three plans legs 2 onward actually use take the
 * first three slots, the only ones that stay apart from each other in every pairing (a scatter puts
 * every pair side by side; the fourth slot, yellow, sits too close to the second, orange). `continue`
 * takes the fourth: it is a leg-1 strategy and has not appeared in any leg 2 onward so far.
 */
export const SALE_SLOT: Readonly<Record<SalePlan, number>> = { '1-sale': 0, '2-sale': 1, '3-sale': 2, continue: 3 };

/** A second channel beside the hue, for readers who cannot tell the hues apart (ECharts symbols). */
export const SALE_SYMBOL: Readonly<Record<SalePlan, string>> = {
  '1-sale': 'triangle',
  '2-sale': 'diamond',
  '3-sale': 'rect',
  continue: 'circle',
};

/** The same shapes as text, for the legend and the summary table. */
export const SALE_GLYPH: Readonly<Record<SalePlan, string>> = {
  '1-sale': '▲',
  '2-sale': '◆',
  '3-sale': '■',
  continue: '●',
};

/** `2-sale-tier13` -> `2-sale`; null for anything this does not know. */
export function salePlanOf(strategy: string): SalePlan | null {
  const s = strategy.trim().toLowerCase();
  if (s === 'continue') return 'continue';
  const m = /^([123])-sale(?:$|-)/.exec(s);
  return m ? (`${m[1]}-sale` as SalePlan) : null;
}

/** Whether the leg's strategy includes the tier-13 sale. */
export function isTier13(strategy: string): boolean {
  return /(^|-)tier13$/i.test(strategy.trim());
}

/** One mark on the chart: a leg, or several identical legs of one account. */
export interface SaleLeg {
  /** account | start | target | strategy: what makes two legs the same leg. */
  key: string;
  accountKey: string;
  /** The TE the leg starts at (the previous leg's target). */
  start: number;
  /** The TE the leg reaches. */
  te: number;
  /** TE gained in the leg. */
  gain: number;
  plan: SalePlan;
  tier13: boolean;
  /** As the run stored it, e.g. `2-sale-tier13`. */
  strategy: string;
  /** The run shown for the mark: of the runs sharing this leg, the one that finishes first. */
  row: CollectorRow;
  /** 1-based, in `row`'s chain. */
  leg: number;
  /** `row`'s leg: its days and peak delivery (q/hr). */
  days: number;
  peakQph: number;
  /** Runs that share this leg, and the range of days they gave it (one save each, so they differ). */
  runs: number;
  daysLo: number;
  daysHi: number;
}

/**
 * Every leg from leg 2 on of the standing runs in `rows`, identical legs of one account merged.
 * Legs whose strategy is not a sale plan this knows, or that climb nothing, are left out. Ordered by
 * start, then gain, then key, so the chart draws the same way every time.
 */
export function saleLegs(rows: readonly CollectorRow[], judged: FinishJudgement): SaleLeg[] {
  const merged = new Map<string, SaleLeg>();
  const finishOf = (r: CollectorRow) => judged.byId.get(r.id)?.finish ?? Infinity;
  for (const row of rows) {
    const j = judged.byId.get(row.id);
    if (!j?.standing) continue;
    const legs = Array.isArray(row.legs) ? row.legs : [];
    const account = accountKey(row);
    for (let i = 1; i < legs.length; i++) {
      const leg = legs[i];
      const start = legs[i - 1].te;
      const plan = salePlanOf(leg.strategy ?? '');
      if (!plan || !Number.isFinite(start) || !Number.isFinite(leg.te) || !(leg.te > start)) continue;
      const key = `${account}|${start}|${leg.te}|${leg.strategy}`;
      const held = merged.get(key);
      if (!held) {
        merged.set(key, {
          key,
          accountKey: account,
          start,
          te: leg.te,
          gain: leg.te - start,
          plan,
          tier13: isTier13(leg.strategy),
          strategy: leg.strategy,
          row,
          leg: i + 1,
          days: leg.days,
          peakQph: leg.peakDeliveryQph,
          runs: 1,
          daysLo: leg.days,
          daysHi: leg.days,
        });
        continue;
      }
      held.runs += 1;
      held.daysLo = Math.min(held.daysLo, leg.days);
      held.daysHi = Math.max(held.daysHi, leg.days);
      if (finishOf(row) < finishOf(held.row)) {
        held.row = row;
        held.leg = i + 1;
        held.days = leg.days;
        held.peakQph = leg.peakDeliveryQph;
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.start - b.start || a.gain - b.gain || a.key.localeCompare(b.key));
}

/** A band of TE, inclusive at both ends; `hi` Infinity for an open top. */
export interface Band {
  lo: number;
  hi: number;
  label: string;
}

/** Leg length bands for the summary: short hops, the middle climbs, and the long final stretches. */
export const GAIN_BANDS: readonly Band[] = [
  { lo: 1, hi: 15, label: '1–15' },
  { lo: 16, hi: 30, label: '16–30' },
  { lo: 31, hi: 50, label: '31–50' },
  { lo: 51, hi: 80, label: '51–80' },
  { lo: 81, hi: Infinity, label: '81+' },
];

/** Start-TE bands every `step` TE covering `starts`: 180–199, 200–219, ... */
export function startBands(starts: readonly number[], step = 20): Band[] {
  if (!starts.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of starts) {
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  const out: Band[] = [];
  for (let b = Math.floor(lo / step) * step; b <= hi; b += step) {
    out.push({ lo: b, hi: b + step - 1, label: `${b}–${b + step - 1}` });
  }
  return out;
}

/** One cell of the summary: the legs starting in one band and climbing by one band's worth. */
export interface SaleCell {
  /** Marks in the cell (identical legs of one account count once). */
  n: number;
  /** Distinct accounts behind them. */
  accounts: number;
  counts: Record<SalePlan, number>;
  /** The commonest plan, or several on a tie, in legend order. */
  top: SalePlan[];
  /** The commonest plan's share of `n`, 0-1. */
  share: number;
}

export interface SaleSummary {
  starts: Band[];
  gains: Band[];
  /** `cells[startIndex][gainIndex]`, null where no leg falls. */
  cells: (SaleCell | null)[][];
}

const inBand = (v: number, b: Band) => v >= b.lo && v <= b.hi;

/** The table under the chart: per start band and leg-length band, the commonest sale plan. */
export function saleSummary(
  legs: readonly SaleLeg[],
  { startStep = 20, gains = GAIN_BANDS }: { startStep?: number; gains?: readonly Band[] } = {}
): SaleSummary {
  const starts = startBands(
    legs.map(l => l.start),
    startStep
  );
  const cells = starts.map(sb =>
    gains.map((gb): SaleCell | null => {
      const here = legs.filter(l => inBand(l.start, sb) && inBand(l.gain, gb));
      if (!here.length) return null;
      const counts: Record<SalePlan, number> = { '1-sale': 0, '2-sale': 0, '3-sale': 0, continue: 0 };
      for (const l of here) counts[l.plan]++;
      const most = Math.max(...Object.values(counts));
      return {
        n: here.length,
        accounts: new Set(here.map(l => l.accountKey)).size,
        counts,
        top: SALE_PLANS.filter(p => counts[p] === most),
        share: most / here.length,
      };
    })
  );
  return { starts, gains: [...gains], cells };
}

/** `2-sale 67% (n 12)`, or `2-/3-sale 40% each (n 10)` on a tie. */
export function saleCellText(cell: SaleCell): string {
  const pct = Math.round(cell.share * 100);
  if (cell.top.length === 1) return `${cell.top[0]} ${pct}% (n ${cell.n})`;
  const names = cell.top.map(p => (p === 'continue' ? p : p.replace('-sale', ''))).join('/');
  return `${names}${cell.top.every(p => p !== 'continue') ? '-sale' : ''} ${pct}% each (n ${cell.n})`;
}

/** Every plan in the cell with its count, for the cell's title: `3-sale 8, 2-sale 3, 1-sale 1`. */
export function saleCellBreakdown(cell: SaleCell): string {
  return SALE_PLANS.filter(p => cell.counts[p] > 0)
    .sort((a, b) => cell.counts[b] - cell.counts[a])
    .map(p => `${p} ${cell.counts[p]}`)
    .join(', ');
}

/**
 * Marks drawn on top of each other: same start, same gain, same plan and tier. They get small pixel
 * offsets in a ring (`symbolOffset`), so every one can be hovered and none hides another, while the
 * value each is drawn at stays exact. Returns the offset per mark key.
 */
export function overlapOffsets(legs: readonly SaleLeg[], radiusPx = 4): Map<string, [number, number]> {
  const groups = new Map<string, SaleLeg[]>();
  for (const l of legs) {
    const k = `${l.start}|${l.gain}`;
    const g = groups.get(k);
    if (g) g.push(l);
    else groups.set(k, [l]);
  }
  const out = new Map<string, [number, number]>();
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.set(g[0].key, [0, 0]);
      continue;
    }
    g.forEach((l, i) => {
      const a = (2 * Math.PI * i) / g.length - Math.PI / 2;
      out.set(l.key, [Number((radiusPx * Math.cos(a)).toFixed(2)), Number((radiusPx * Math.sin(a)).toFixed(2))]);
    });
  }
  return out;
}
