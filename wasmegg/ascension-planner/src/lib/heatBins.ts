/**
 * My runs' "Your routes at a glance" as a heat map (RouteScatter.vue, Jordan 26 Oct 2026): the goal's routes
 * counted into cells. Pure: no Vue, no storage.
 *
 *   across  one column per ascension count present, fewest first; past `maxCols` (12) the longest counts share
 *           the last column ("12+")
 *   up      the route's finish (Fastest to N TE) or the TE it reaches (Highest TE by a date), in equal-width
 *           bins over the data's range, lowest at the bottom. The bin width is the smallest round step that
 *           keeps the rows at `maxRows` (10) or under: whole TE (1, 2, 5, 10, 20, 50 ...), or for a finish 1,
 *           2, 3, 6 or 12 hours, 1, 2, 3, 7 or 14 days, 1, 2, 3 or 6 calendar months, then whole years. So a
 *           spread-out goal gets 6 to 10 rows and a tight one fewer (3 TE values are 3 rows, not 6 half-TE
 *           rows); one value, or one route, is one row.
 *
 * A finish bin starts on the player's wall clock (a local midnight, the first of a month), read from `zone`'s
 * offset at the earliest finish; its label is that wall-clock moment ("Oct 12", "Oct 12, 2 PM", "Mar 2027"), in
 * the browser's own format (lib/clock.ts). Each cell keeps its routes, their count and its best (by `better`,
 * best first); the map keeps the goal's best and where it sits.
 */
import { formatMoment } from './clock';

export type HeatScale = 'te' | 'finish';

export interface HeatCol {
  /** Ascension counts in this column: one, or the last column's "12+" (lo to hi). */
  lo: number;
  hi: number;
  label: string;
}
export interface HeatRow {
  /** TE: lo to hi inclusive. Finish (ms): lo inclusive, hi exclusive. */
  lo: number;
  hi: number;
  /** The axis label, short: "277", "270–279"; "Oct 12", "Oct 12, 2 PM", "Mar 2027". */
  label: string;
  /** The whole bin in words, for the selected-cell line: "TE 270–279", "Oct 12 to Oct 13", "Mar 2027". */
  range: string;
}
export interface HeatCell<T> {
  row: number;
  col: number;
  count: number;
  /** The cell's routes, best first. */
  items: T[];
  best: T | null;
}
export interface HeatMap<T> {
  /** Nothing to count (no routes, or every level filtered out). */
  empty: boolean;
  cols: HeatCol[];
  /** Lowest first; draw them reversed so the lowest is at the bottom. */
  rows: HeatRow[];
  /** cells[row][col], rows lowest first like `rows`. */
  cells: HeatCell<T>[][];
  /** The most routes in one cell (0 when empty). */
  max: number;
  best: T | null;
  bestAt: { row: number; col: number } | null;
}

export interface HeatOptions<T> {
  scale: HeatScale;
  /** The route's ascension count. */
  asc: (t: T) => number;
  /** The route's TE or finish (ms); null or not finite: not counted. */
  y: (t: T) => number | null;
  /** Best first (lib/routeScatter.ts `bestOrder`). */
  better: (a: T, b: T) => number;
  /** IANA zone for finish bins; the browser's when unset. */
  zone?: string;
  maxCols?: number;
  maxRows?: number;
  /** Specs only: the language for labels; the browser's when unset. */
  locale?: string;
}

export const HEAT_MAX_COLS = 12;
export const HEAT_MAX_ROWS = 10;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Finish steps up to a fortnight, in ms; months and years are counted on the calendar. */
const TIME_STEPS = [1, 2, 3, 6, 12].map(h => h * HOUR).concat([1, 2, 3, 7, 14].map(d => d * DAY));
const MONTH_STEPS = [1, 2, 3, 6, 12];

const emptyMap = <T>(): HeatMap<T> => ({ empty: true, cols: [], rows: [], cells: [], max: 0, best: null, bestAt: null });

export function heatBins<T>(items: readonly T[], o: HeatOptions<T>): HeatMap<T> {
  const maxCols = Math.max(1, o.maxCols ?? HEAT_MAX_COLS);
  const maxRows = Math.max(1, o.maxRows ?? HEAT_MAX_ROWS);
  const ok = items.filter(t => {
    const y = o.y(t);
    const a = o.asc(t);
    return y != null && Number.isFinite(y) && Number.isFinite(a);
  });
  if (!ok.length) return emptyMap<T>();

  // Columns: each ascension count present; the longest share the last column past the cap.
  const ascs = [...new Set(ok.map(o.asc))].sort((a, b) => a - b);
  const cols: HeatCol[] = ascs.slice(0, maxCols).map(a => ({ lo: a, hi: a, label: String(a) }));
  if (ascs.length > maxCols) {
    const last = cols[maxCols - 1];
    last.hi = ascs[ascs.length - 1];
    last.label = `${last.lo}+`;
  }
  const colOf = (a: number) => {
    const k = cols.findIndex(c => a >= c.lo && a <= c.hi);
    return k < 0 ? cols.length - 1 : k;
  };

  const ys = ok.map(t => o.y(t) as number);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const rows = o.scale === 'te' ? teRows(lo, hi, maxRows) : finishRows(lo, hi, maxRows, o.zone, o.locale);
  const rowOf = (y: number) => {
    if (o.scale === 'te') {
      const v = Math.round(y);
      const k = rows.findIndex(r => v >= r.lo && v <= r.hi);
      return k < 0 ? (v < rows[0].lo ? 0 : rows.length - 1) : k;
    }
    const k = rows.findIndex(r => y >= r.lo && y < r.hi);
    return k < 0 ? (y < rows[0].lo ? 0 : rows.length - 1) : k;
  };

  const cells: HeatCell<T>[][] = rows.map((_, row) =>
    cols.map((__, col) => ({ row, col, count: 0, items: [] as T[], best: null as T | null }))
  );
  for (const t of ok) cells[rowOf(o.y(t) as number)][colOf(o.asc(t))].items.push(t);
  let max = 0;
  let best: T | null = null;
  let bestAt: { row: number; col: number } | null = null;
  for (const line of cells)
    for (const c of line) {
      c.items.sort(o.better);
      c.count = c.items.length;
      c.best = c.items[0] ?? null;
      max = Math.max(max, c.count);
      if (c.best && (!best || o.better(c.best, best) < 0)) {
        best = c.best;
        bestAt = { row: c.row, col: c.col };
      }
    }
  return { empty: false, cols, rows, cells, max, best, bestAt };
}

// ------------------------------------------------------------------------------------------------ TE rows

function teRows(lo: number, hi: number, maxRows: number): HeatRow[] {
  const a = Math.round(lo);
  const b = Math.round(hi);
  let step = 1;
  for (let mag = 1; ; mag *= 10) {
    const s = [1, 2, 5].map(m => m * mag).find(s => Math.floor(b / s) - Math.floor(a / s) + 1 <= maxRows);
    if (s) {
      step = s;
      break;
    }
    if (mag > 1e15) {
      step = Math.max(1, Math.ceil((b - a + 1) / maxRows));
      break;
    }
  }
  const out: HeatRow[] = [];
  for (let s = Math.floor(a / step) * step; s <= b; s += step) {
    const e = s + step - 1;
    const label = step === 1 ? String(s) : `${s}–${e}`;
    out.push({ lo: s, hi: e, label, range: `TE ${label}` });
  }
  return out;
}

// -------------------------------------------------------------------------------------------- finish rows

/** `zone`'s offset from UTC at `ms`, in ms (wall clock minus UTC); 0 for an unknown zone. */
export function zoneOffset(ms: number, zone?: string): number {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    const p: Record<string, number> = {};
    for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
    const off = wall - Math.floor(ms / 60_000) * 60_000;
    return Number.isFinite(off) ? off : 0;
  } catch {
    return 0;
  }
}

const monthYear = new Map<string, Intl.DateTimeFormat | null>();
function monthLabel(wallMs: number, locale?: string): string {
  const key = locale ?? '';
  if (!monthYear.has(key)) {
    try {
      monthYear.set(key, new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', year: 'numeric' }));
    } catch {
      monthYear.set(key, null);
    }
  }
  return monthYear.get(key)?.format(new Date(wallMs)) ?? new Date(wallMs).toISOString().slice(0, 7);
}

function finishRows(lo: number, hi: number, maxRows: number, zone?: string, locale?: string): HeatRow[] {
  const off = zoneOffset(lo, zone);
  // Work on the wall clock (UTC fields = the player's), then shift back.
  const wLo = lo + off;
  const wHi = hi + off;
  const spansYears = new Date(wLo).getUTCFullYear() !== new Date(wHi).getUTCFullYear();
  for (const step of TIME_STEPS) {
    const start = Math.floor(wLo / step) * step;
    const n = Math.floor((wHi - start) / step) + 1;
    if (n > maxRows) continue;
    const year = spansYears ? ('always' as const) : ('never' as const);
    const at = (w: number) =>
      step < DAY
        ? formatMoment(w, { zone: 'UTC', year, shortTime: true, locale })
        : formatMoment(w, { zone: 'UTC', year, dateOnly: true, locale });
    const out: HeatRow[] = [];
    for (let k = 0; k < n; k++) {
      const w = start + k * step;
      const label = at(w);
      // A day bin names its last day; an hour bin its end.
      const range = step === DAY ? label : `${label} to ${at(step < DAY ? w + step : w + step - DAY)}`;
      out.push({ lo: w - off, hi: w + step - off, label, range });
    }
    return out;
  }
  // Calendar months, then whole years.
  const d0 = new Date(wLo);
  const d1 = new Date(wHi);
  const m0 = d0.getUTCFullYear() * 12 + d0.getUTCMonth();
  const m1 = d1.getUTCFullYear() * 12 + d1.getUTCMonth();
  let months = MONTH_STEPS.find(s => Math.floor(m1 / s) - Math.floor(m0 / s) + 1 <= maxRows);
  if (!months) {
    const years = Math.ceil((Math.floor(m1 / 12) - Math.floor(m0 / 12) + 1) / maxRows);
    months = [1, 2, 5, 10, 20, 50, 100].map(y => y * 12).find(s => s >= years * 12) ?? years * 12;
  }
  const out: HeatRow[] = [];
  for (let m = Math.floor(m0 / months) * months; m <= m1; m += months) {
    const w = Date.UTC(Math.floor(m / 12), m % 12, 1);
    const e = Date.UTC(Math.floor((m + months) / 12), (m + months) % 12, 1);
    const label = months >= 12 ? String(Math.floor(m / 12)) : monthLabel(w, locale);
    const lastM = m + months - 1;
    const last =
      months >= 12 ? String(Math.floor(lastM / 12)) : monthLabel(Date.UTC(Math.floor(lastM / 12), lastM % 12, 1), locale);
    out.push({ lo: w - off, hi: e - off, label, range: months === 1 || (months === 12 && last === label) ? label : `${label} to ${last}` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ colour

/** The scale's steps, light to dark: one blue (the app's indigo-blue family), each with text that reads on it. */
export const HEAT_STEPS: readonly { fill: string; ink: string }[] = [
  { fill: '#dbe8fa', ink: '#0f2747' },
  { fill: '#a9c9f1', ink: '#0f2747' },
  { fill: '#6fa3e6', ink: '#0b1f3a' },
  { fill: '#2a78d6', ink: '#ffffff' },
  { fill: '#104281', ink: '#ffffff' },
];

/** A count's step on the scale (0-based), null for an empty cell. Steps are spread over 1..max. */
export function heatStep(count: number, max: number): number | null {
  if (count <= 0 || max <= 0) return null;
  const n = HEAT_STEPS.length;
  if (max === 1) return n - 1;
  return Math.min(n - 1, Math.max(0, Math.ceil((count / max) * n) - 1));
}
