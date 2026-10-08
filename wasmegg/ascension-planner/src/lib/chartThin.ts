/**
 * Keeping the run charts light on big runs. Pure functions, no Vue.
 *
 * A full sweep prices 100,000+ chains. Drawing every one as its own point made the page's heap
 * jump by tens of MB each time it redrew, and the tab died. So:
 *
 * - THINNING: a point chart draws at most `MAX_DRAWN_POINTS`: the best ones (the part anyone
 *   reads) plus a uniform sample of the rest, which keeps the cloud's shape.
 * - HEAT MAP: a fixed grid of counts, fed one chain at a time. Its size never depends on the run,
 *   and adding a chain never re-reads the others.
 */

/** Above this many priced chains, the point charts wait for a button press. */
export const CHART_AUTO_LIMIT = 20_000;
/** The most points a point chart draws. */
export const MAX_DRAWN_POINTS = 5_000;
/** Of those, how many are the best by duration; the rest are a uniform sample. */
export const BEST_KEPT = 1_000;
/** While a run goes, charts redraw at most this often. */
export const REDRAW_MS = 30_000;

/** Indices of `values`, ascending by value (ties by index). */
export function sortedOrder(values: ArrayLike<number>): Uint32Array {
  const order = new Uint32Array(values.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((a, b) => values[a] - values[b] || a - b);
  return order;
}

/**
 * Which positions of a best-first list of `n` to draw: the first `best`, then an even stride over
 * the rest, `max` in all (or all of them when `n <= max`). Ascending, no repeats, and the last
 * position is always kept so the slow end of the cloud still shows.
 */
export function thinPositions(n: number, max = MAX_DRAWN_POINTS, best = BEST_KEPT): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const head = Math.min(best, max);
  const out: number[] = [];
  for (let i = 0; i < head; i++) out.push(i);
  const left = max - head;
  if (left <= 0) return out;
  const restStart = head;
  const restLen = n - head;
  if (left === 1) {
    out.push(n - 1);
    return out;
  }
  // `left` positions spread from restStart to n-1 inclusive.
  const step = (restLen - 1) / (left - 1);
  let prev = -1;
  for (let k = 0; k < left; k++) {
    const p = restStart + Math.round(k * step);
    if (p > prev) out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Which items to draw, as original indices in ascending index order: the `best` lowest `values`
 * plus a uniform sample of the rest (by rank), `max` in all.
 */
export function thinIndices(values: ArrayLike<number>, max = MAX_DRAWN_POINTS, best = BEST_KEPT): number[] {
  if (values.length <= max) return Array.from({ length: values.length }, (_, i) => i);
  const order = sortedOrder(values);
  return thinPositions(order.length, max, best)
    .map(p => order[p])
    .sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ heat map */

/**
 * A 2-D histogram that grows to fit what it is fed.
 *
 * The grid is always `cols x rows`. When a chain lands outside it, the cell width on that axis
 * doubles and neighbouring cells merge, so the counts stay exact for the coarser cells and memory
 * stays constant. `colBest` keeps the fastest duration seen in each column.
 */
export interface HeatGrid {
  cols: number;
  rows: number;
  x0: number;
  xw: number;
  y0: number;
  yw: number;
  /** Row-major: `counts[row * cols + col]`, row 0 at the low (fast) end. */
  counts: Uint32Array;
  colBest: Float64Array;
  total: number;
  started: boolean;
}

export function createHeat(cols = 40, rows = 30, xw = 1, yw = 0.05): HeatGrid {
  if (cols % 2 || rows % 2) throw new Error('heat grid needs an even number of columns and rows');
  return {
    cols,
    rows,
    x0: 0,
    xw,
    y0: 0,
    yw,
    counts: new Uint32Array(cols * rows),
    colBest: new Float64Array(cols).fill(Infinity),
    total: 0,
    started: false,
  };
}

/** Double the cell width on one axis. `left` grows the range downwards instead of upwards. */
function grow(h: HeatGrid, axis: 'x' | 'y', left: boolean): void {
  const { cols, rows } = h;
  const n = axis === 'x' ? cols : rows;
  const map = (i: number) => (left ? n / 2 : 0) + Math.floor(i / 2);
  const counts = new Uint32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = h.counts[r * cols + c];
      if (!v) continue;
      const nr = axis === 'y' ? map(r) : r;
      const nc = axis === 'x' ? map(c) : c;
      counts[nr * cols + nc] += v;
    }
  }
  h.counts = counts;
  if (axis === 'x') {
    const best = new Float64Array(cols).fill(Infinity);
    for (let c = 0; c < cols; c++) best[map(c)] = Math.min(best[map(c)], h.colBest[c]);
    h.colBest = best;
    if (left) h.x0 -= cols * h.xw;
    h.xw *= 2;
  } else {
    if (left) h.y0 -= rows * h.yw;
    h.yw *= 2;
  }
}

/** Count one chain at (x, y). Non-finite values are skipped. */
export function addToHeat(h: HeatGrid, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (!h.started) {
    // Centred on the first chain, so the grid has room to grow either way before it must coarsen.
    h.x0 = Math.floor(x / h.xw) * h.xw - (h.cols / 2) * h.xw;
    h.y0 = Math.floor(y / h.yw) * h.yw - (h.rows / 2) * h.yw;
    h.started = true;
  }
  while (x < h.x0) grow(h, 'x', true);
  while (x >= h.x0 + h.cols * h.xw) grow(h, 'x', false);
  while (y < h.y0) grow(h, 'y', true);
  while (y >= h.y0 + h.rows * h.yw) grow(h, 'y', false);
  const c = Math.min(h.cols - 1, Math.floor((x - h.x0) / h.xw));
  const r = Math.min(h.rows - 1, Math.floor((y - h.y0) / h.yw));
  h.counts[r * h.cols + c]++;
  if (y < h.colBest[c]) h.colBest[c] = y;
  h.total++;
}

/** A frozen copy for drawing, cropped to the cells that hold anything. */
export interface HeatSnapshot {
  cols: number;
  rows: number;
  x0: number;
  xw: number;
  y0: number;
  yw: number;
  counts: Uint32Array;
  colBest: Float64Array;
  total: number;
  max: number;
}

export function heatSnapshot(h: HeatGrid): HeatSnapshot | null {
  if (!h.total) return null;
  let c0 = h.cols,
    c1 = -1,
    r0 = h.rows,
    r1 = -1,
    max = 0;
  for (let r = 0; r < h.rows; r++) {
    for (let c = 0; c < h.cols; c++) {
      const v = h.counts[r * h.cols + c];
      if (!v) continue;
      if (c < c0) c0 = c;
      if (c > c1) c1 = c;
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
      if (v > max) max = v;
    }
  }
  const cols = c1 - c0 + 1;
  const rows = r1 - r0 + 1;
  const counts = new Uint32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) counts[r * cols + c] = h.counts[(r + r0) * h.cols + c + c0];
  }
  return {
    cols,
    rows,
    x0: h.x0 + c0 * h.xw,
    xw: h.xw,
    y0: h.y0 + r0 * h.yw,
    yw: h.yw,
    counts,
    colBest: h.colBest.slice(c0, c1 + 1),
    total: h.total,
    max,
  };
}

/* ------------------------------------------------------------------ axis range */

/** What the heat map's axes span, after padding a range too narrow to draw. */
export interface HeatView {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** A y range narrower than this many days is padded out to it, centred. */
export const MIN_Y_SPAN_DAYS = 1;

/**
 * The axis ranges the heat map draws. A snapshot of one column (every chain ending at the same
 * checkpoint, or a single chain) spans one cell, which used to fill the whole plot: pad it by one
 * cell each side. Likewise a y range under `MIN_Y_SPAN_DAYS` is centred and widened to it. Cells
 * are then sized as one bin of this range (`xw / (xMax - xMin)`), never as the whole range.
 */
export function heatView(h: Pick<HeatSnapshot, 'cols' | 'rows' | 'x0' | 'xw' | 'y0' | 'yw'>): HeatView {
  let xMin = h.x0;
  let xMax = h.x0 + h.cols * h.xw;
  if (h.cols < 3) {
    xMin -= h.xw;
    xMax += h.xw;
  }
  let yMin = h.y0;
  let yMax = h.y0 + h.rows * h.yw;
  const span = yMax - yMin;
  if (span < MIN_Y_SPAN_DAYS) {
    const pad = (MIN_Y_SPAN_DAYS - span) / 2;
    yMin -= pad;
    yMax += pad;
  }
  return { xMin, xMax, yMin, yMax };
}

/** Whole-number ticks across [lo, hi], at most about `n + 1` of them. */
export function integerTicks(lo: number, hi: number, n = 4): number[] {
  const step = Math.max(1, Math.ceil((hi - lo) / n));
  const out: number[] = [];
  for (let v = Math.ceil(lo); v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

/** "1 chain", "90 chains". */
export function chainCount(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'chain' : 'chains'}`;
}
