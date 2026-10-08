/**
 * Highest TE by a date, Simple mode (batch 3): the routes to try, picked for the player.
 *
 * For each number of ascensions the instant answer has a route for, one chain centred on that route:
 * every early stop gets its TE either side (`W`) at step 1, and the last stop is found by the usual
 * last-stop search (deadline.ts, `extend`), starting around the instant answer's own last stops. The
 * instant answer's own route is tried as well (the panel's `instantSets`), whatever the boxes say.
 *
 * W shrinks with the number of ascensions, since a chain of n stops has (2W + 1)^(n - 1) sets of early
 * stops: ±3 for up to 3, ±2 for 4-5, ±1 from 6 (`simpleWidth`). A chain still over `maxSetsPerRow`
 * narrows until it fits, down to the instant route alone (W = 0), and then the whole space narrows,
 * the biggest chain first, until the time on a typical machine (`secondsOf`) is under `maxSeconds`.
 */
import { formatBand } from './exhaustive';
import { countBandShapes } from './deadline';

/** The TE either side of each early stop for a chain of `n` stops, before any narrowing. */
export function simpleWidth(n: number): number {
  return n <= 3 ? 3 : n <= 5 ? 2 : 1;
}

/** One chain the Simple search tries. */
export interface SimpleRow {
  /** Stops, the last included (the panel's "ascensions"). */
  asc: number;
  /** One value list per early stop. */
  bands: number[][];
  /** The box as the chain editor writes it ("157-163:1; 190-196:1"). */
  text: string;
  /** The route it is centred on, the last stop included. */
  centre: number[];
  /** TE either side of each early stop. */
  width: number;
}

export interface SimpleSpace {
  rows: SimpleRow[];
  /** The last stop's box: where its search starts looking (it looks further either way). */
  lastLo: number;
  lastHi: number;
}

/** `c - w` to `c + w`, kept above the current TE and below 490. */
function band(c: number, w: number, te: number): number[] {
  const out: number[] = [];
  for (let v = Math.max(te + 1, c - w); v <= Math.min(489, c + w); v++) out.push(v);
  return out;
}

function rowOf(centre: number[], width: number, te: number): SimpleRow {
  const bands = centre.slice(0, -1).map(c => band(c, width, te));
  return {
    asc: centre.length,
    bands,
    text: bands.map(b => formatBand(b)).join('; '),
    centre: [...centre],
    width,
  };
}

function setsOf(r: SimpleRow, te: number, lastHi: number): number {
  return r.asc <= 1 ? 1 : countBandShapes(r.bands, te, lastHi);
}

/**
 * The Simple space around `routes` (a route per number of stops, the last stop included). Routes that
 * don't start above the current TE or don't climb are left out. `secondsOf` prices a candidate space
 * (the panel's leg-based estimate on a typical machine); without it only `maxSetsPerRow` applies.
 */
export function simpleByDateSpace(o: {
  currentTE: number;
  routes: Record<number, number[]>;
  widthFor?: (n: number) => number;
  maxSetsPerRow?: number;
  secondsOf?: (space: SimpleSpace) => number;
  maxSeconds?: number;
}): SimpleSpace | null {
  const te = Math.floor(o.currentTE);
  const widthFor = o.widthFor ?? simpleWidth;
  const maxSets = o.maxSetsPerRow ?? 1000;
  const centres = Object.entries(o.routes)
    .map(([k, r]) => [Number(k), r] as const)
    .filter(([k, r]) => r.length === k && r.length >= 1 && r[0] > te && r.every((v, i) => !i || v > r[i - 1]))
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => r);
  if (!centres.length) return null;
  const lasts = centres.map(r => r[r.length - 1]);
  const lastLo = Math.max(te + 1, Math.min(...lasts) - 5);
  const lastHi = Math.min(490, Math.max(...lasts) + 5);
  const widths = centres.map(r => Math.max(0, Math.floor(widthFor(r.length))));
  const build = (): SimpleSpace => ({ rows: centres.map((r, i) => rowOf(r, widths[i], te)), lastLo, lastHi });
  // Each chain on its own first.
  centres.forEach((r, i) => {
    while (widths[i] > 0 && setsOf(rowOf(r, widths[i], te), te, lastHi) > maxSets) widths[i]--;
  });
  let space = build();
  if (!o.secondsOf || !(o.maxSeconds! > 0)) return space;
  // Then the whole space against the time: narrow the chain with the most sets, until it fits or
  // every chain is down to its instant route.
  for (let guard = 0; guard < 64 && o.secondsOf(space) > o.maxSeconds!; guard++) {
    let pick = -1;
    let most = 0;
    space.rows.forEach((r, i) => {
      const n = setsOf(r, te, lastHi);
      if (widths[i] > 0 && n > most) {
        most = n;
        pick = i;
      }
    });
    if (pick < 0) break;
    widths[pick]--;
    space = build();
  }
  return space;
}
