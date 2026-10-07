/**
 * @module bandCheck
 * @description "Did you mean...?" for the band boxes (Full sweep, and the chains on By a date).
 *
 * `parseBands` reads leniently: a band it cannot read is dropped, and a reversed range comes out
 * empty, which quietly lowers the ascension count or shrinks the space. This reads the same text
 * and says what it noticed, with a fixed text to offer when the fix is obvious. It never changes
 * what runs; the player decides.
 *
 * Pure: no store, no DOM. The caller passes the player's TE and the target.
 */
import { formatBand, parseBandPiece, type BandPieceProblem } from './exhaustive';

export interface BandCheckContext {
  /** Where the player is now. A checkpoint at or below it is not an ascension they can perform. */
  currentTE: number;
  /** The target. A checkpoint at or above it is the target itself. */
  finalTE: number;
  /** The ascension count this chain is meant to have, when the caller knows it. */
  ascensions?: number;
  defaultStep?: number;
}

export type BandIssueCode =
  | 'unreadable'
  | 'reversed'
  | 'badStep'
  | 'stepTooWide'
  | 'empty'
  | 'outOfOrder'
  | 'belowCurrent'
  | 'aboveTarget'
  | 'outsideRange'
  | 'countMismatch';

export interface BandIssue {
  code: BandIssueCode;
  /** 1-based band the issue is about, or 0 when it is about the whole chain. */
  band: number;
  /** Plain words, ready to show. */
  message: string;
  /** The whole box's text with this one thing fixed, when there is an obvious fix. */
  fix?: string;
}

/** One `;`-separated segment of the box, as typed. */
interface Segment {
  text: string;
  values: number[];
  problems: { piece: string; problem: BandPieceProblem; lo?: number; hi?: number; step?: number }[];
  pieces: string[];
}

/** The box's segments, split the way `parseBands` splits them (`;` or a new line). */
function segments(text: string, defaultStep: number): Segment[] {
  return text
    .split(';')
    .flatMap(part => part.split('\n'))
    .map(raw => {
      const t = raw.trim();
      const set = new Set<number>();
      const problems: Segment['problems'] = [];
      const pieces = t ? t.split(',').map(p => p.trim()) : [];
      for (const piece of pieces) {
        const read = parseBandPiece(piece, defaultStep);
        read.values.forEach(v => set.add(v));
        if (read.problem && read.problem !== 'empty') {
          problems.push({ piece, problem: read.problem, lo: read.lo, hi: read.hi, step: read.step });
        }
      }
      return { text: t, values: [...set].sort((a, b) => a - b), problems, pieces };
    });
}

/** The text with segment `index` swapped for `replacement` (or removed, when it is null). */
function withSegment(segs: Segment[], index: number, replacement: string | null): string {
  const out = segs.map(s => s.text);
  if (replacement === null) out.splice(index, 1);
  else out[index] = replacement;
  return out.filter(Boolean).join('; ');
}

/** Same, with several pieces of one segment swapped. */
function withPieces(seg: Segment, replace: Map<string, string | null>): string {
  return seg.pieces
    .map(p => (replace.has(p) ? replace.get(p) : p))
    .filter((p): p is string => !!p)
    .join(', ');
}

const band = (n: number) => `Band ${n}`;

/**
 * Everything worth saying about the bands in this text, in the order the player would meet it.
 * An empty list means nothing looked wrong; it does not mean the space is a good one.
 */
export function checkBandText(text: string, ctx: BandCheckContext): BandIssue[] {
  const defaultStep = ctx.defaultStep ?? 5;
  const cur = Math.floor(ctx.currentTE);
  const final = ctx.finalTE;
  if (!text.trim()) return [];

  const raw = segments(text, defaultStep);
  // A blank segment at the very end is a `;` just typed, not a mistake.
  let lastReal = raw.length - 1;
  while (lastReal >= 0 && !raw[lastReal].text) lastReal--;
  const segs = raw.slice(0, lastReal + 1);
  const issues: BandIssue[] = [];

  // Band numbers count the segments the player can see (blank ones included), which is what they
  // would point at on the screen.
  segs.forEach((seg, i) => {
    const n = i + 1;
    if (!seg.text) {
      issues.push({
        code: 'empty',
        band: n,
        message: `Band ${n} is empty, so it is skipped and the chain gets one ascension fewer.`,
        fix: withSegment(segs, i, null),
      });
      return;
    }

    for (const p of seg.problems) {
      const swap = (replacement: string | null) =>
        withSegment(segs, i, withPieces(seg, new Map([[p.piece, replacement]])) || null);
      const stepText = p.step !== undefined ? `:${Math.floor(p.step) >= 1 ? Math.floor(p.step) : defaultStep}` : '';
      if (p.problem === 'unreadable') {
        const only = seg.pieces.length === 1;
        issues.push({
          code: 'unreadable',
          band: n,
          message: only
            ? `${band(n)}: I can't read "${p.piece}", so it is skipped and the chain gets one ascension fewer.`
            : `${band(n)}: I can't read "${p.piece}", so that part is skipped.`,
          fix: only ? withSegment(segs, i, null) : swap(null),
        });
      } else if (p.problem === 'reversed' && p.lo !== undefined && p.hi !== undefined) {
        const fixed = `${p.hi}-${p.lo}${stepText}`;
        issues.push({
          code: 'reversed',
          band: n,
          message: `${band(n)}: "${p.piece}" runs backwards, so nothing is tried from it. Did you mean ${fixed}?`,
          fix: swap(fixed),
        });
      } else if (p.problem === 'badStep' && p.lo !== undefined && p.hi !== undefined) {
        const fixed = `${p.lo}-${p.hi}:${defaultStep}`;
        issues.push({
          code: 'badStep',
          band: n,
          message: `${band(n)}: a step of ${p.step} can't work in "${p.piece}", so ${defaultStep} is used. Did you mean ${fixed}?`,
          fix: swap(fixed),
        });
      } else if (p.problem === 'stepTooWide' && p.lo !== undefined && p.hi !== undefined) {
        const width = Math.floor(p.hi) - Math.floor(p.lo);
        const fixed = `${p.lo}-${p.hi}:${Math.max(1, Math.min(defaultStep, width))}`;
        issues.push({
          code: 'stepTooWide',
          band: n,
          message: `${band(n)}: the step in "${p.piece}" is wider than the band, so only ${p.lo} is tried. Did you mean ${fixed}?`,
          fix: swap(fixed),
        });
      }
    }
  });

  // Bands that read as something, in order, for the checks that compare them.
  const live = segs.map((seg, i) => ({ seg, i, n: i + 1 })).filter(x => x.seg.values.length);

  for (const { seg, i, n } of live) {
    const first = seg.values[0];
    const last = seg.values[seg.values.length - 1];
    const inRange = seg.values.filter(v => v > cur && v < final);
    if (!inRange.length) {
      issues.push({
        code: 'outsideRange',
        band: n,
        message: `${band(n)} has nothing between your TE (${cur}) and the target (${final}), so no chain can use it.`,
      });
      continue;
    }
    if (i === 0 && first <= cur) {
      issues.push({
        code: 'belowCurrent',
        band: n,
        message: `${band(n)} starts at ${first}, at or below the TE you're at now (${cur}). Those values can't be played. Did you mean ${formatBand(inRange)}?`,
        fix: withSegment(segs, i, formatBand(inRange)),
      });
    }
    if (last >= final) {
      issues.push({
        code: 'aboveTarget',
        band: n,
        message: `${band(n)} reaches ${last}, at or above the target (${final}). Those values can't be used. Did you mean ${formatBand(seg.values.filter(v => v < final))}?`,
        fix: withSegment(segs, i, formatBand(seg.values.filter(v => v < final))),
      });
    }
  }

  // A later band entirely below an earlier one: every pick of the later band is at or under every
  // pick of the earlier one, and checkpoints have to go up.
  const reported = new Set<number>();
  for (let b = 1; b < live.length; b++) {
    for (let a = 0; a < b; a++) {
      const early = live[a];
      const late = live[b];
      if (reported.has(late.n)) continue;
      if (late.seg.values[late.seg.values.length - 1] <= early.seg.values[0]) {
        reported.add(late.n);
        const sorted = [...live].sort((x, y) => x.seg.values[0] - y.seg.values[0]).map(x => x.seg.text);
        const ok = sorted.every((_, k) => {
          if (k === 0) return true;
          const prev = live.find(x => x.seg.text === sorted[k - 1]);
          const here = live.find(x => x.seg.text === sorted[k]);
          return !!prev && !!here && here.seg.values[here.seg.values.length - 1] > prev.seg.values[0];
        });
        issues.push({
          code: 'outOfOrder',
          band: late.n,
          message: `${band(late.n)} (${late.seg.text}) sits below band ${early.n} (${early.seg.text}), but checkpoints go up, so no chain can use both.${
            ok ? ' Did you mean them in this order?' : ''
          }`,
          fix: ok ? sorted.join('; ') : undefined,
        });
      }
    }
  }

  const count = live.length;
  if (ctx.ascensions !== undefined && ctx.ascensions >= 2 && count > 0 && count !== ctx.ascensions - 1) {
    issues.push({
      code: 'countMismatch',
      band: 0,
      message: `These bands make ${count + 1} ascensions, but this chain is set to ${ctx.ascensions}.`,
    });
  }

  return issues;
}

/**
 * Widen one band's values by `amount` TE on one side, on the band's own step, never past the
 * player's TE, the target, or the band next to it. Returns the box's new text, or null when the
 * band can't go any further that way.
 */
export function widenBandText(
  text: string,
  bandNumber: number,
  side: 'low' | 'high',
  amount: number,
  ctx: BandCheckContext
): string | null {
  const segs = segments(text, ctx.defaultStep ?? 5);
  const i = bandNumber - 1;
  const seg = segs[i];
  if (!seg || !seg.values.length) return null;
  const cur = Math.floor(ctx.currentTE);
  const neighbours = segs.map((s, k) => ({ s, k })).filter(x => x.s.values.length);
  const pos = neighbours.findIndex(x => x.k === i);
  const prev = pos > 0 ? neighbours[pos - 1].s.values : null;
  const next = pos < neighbours.length - 1 ? neighbours[pos + 1].s.values : null;
  const lowest = Math.max(cur + 1, prev ? prev[0] + 1 : -Infinity);
  const highest = Math.min(Math.ceil(ctx.finalTE) - 1, next ? next[next.length - 1] - 1 : Infinity);

  const vals = seg.values;
  const step = vals.length > 1 ? Math.max(1, vals[1] - vals[0]) : 1;
  // At least one step, so a band on a wide grid still grows.
  const reach = Math.max(amount, step);
  const added: number[] = [];
  if (side === 'low') {
    for (let v = vals[0] - step; v >= vals[0] - reach && v >= lowest; v -= step) added.push(v);
  } else {
    for (let v = vals[vals.length - 1] + step; v <= vals[vals.length - 1] + reach && v <= highest; v += step) {
      added.push(v);
    }
  }
  if (!added.length) return null;
  const merged = [...new Set([...vals, ...added])].sort((a, b) => a - b);
  return withSegment(segs, i, formatBand(merged));
}

/* ------------------------------------------------------------------------------------------- *
 * The winner on the edge of what it was allowed
 * ------------------------------------------------------------------------------------------- */

export interface BandEdge {
  /** 1-based band the winning checkpoint sits on the edge of. */
  band: number;
  side: 'low' | 'high';
  /** The winning checkpoint, which is also the lowest (or highest) value that band allowed. */
  value: number;
}

/**
 * Where the winning chain's checkpoints sit on the first or last value of their band while the band
 * could have gone further. "Could have gone further" leaves out an edge that is a hard limit: the
 * player's own TE, the target, or the neighbouring checkpoint of that same chain (a step or the
 * minimum gap away). A band of one value is a pinned checkpoint, not an edge.
 *
 * `chain` is the winner as the store keeps it: one checkpoint per band, then the target.
 */
export function findBandEdges(
  bands: readonly (readonly number[])[],
  chain: readonly number[],
  ctx: { currentTE: number; finalTE: number; minGap?: number }
): BandEdge[] {
  const out: BandEdge[] = [];
  const cur = Math.floor(ctx.currentTE);
  const final = chain.length ? chain[chain.length - 1] : ctx.finalTE;
  const gap = Math.max(1, ctx.minGap ?? 0);
  if (chain.length !== bands.length + 1) return out;
  bands.forEach((band, i) => {
    const values = band.filter(v => v > cur && v < final);
    if (values.length < 2) return;
    const v = chain[i];
    const lowestPossible = i === 0 ? cur + 1 : chain[i - 1] + gap;
    // The next checkpoint is the target for the last band, which has no gap rule.
    const highestPossible = i === bands.length - 1 ? final - 1 : chain[i + 1] - gap;
    if (v === values[0] && v > lowestPossible) out.push({ band: i + 1, side: 'low', value: v });
    else if (v === values[values.length - 1] && v < highestPossible) out.push({ band: i + 1, side: 'high', value: v });
  });
  return out;
}

/** How far to widen a band on its edge: its own width, never under 10 TE or over 30. */
export function widenAmount(values: readonly number[]): number {
  const width = values.length ? values[values.length - 1] - values[0] : 0;
  return Math.min(30, Math.max(10, width));
}

/**
 * The bands widened on the edges the winner sat on, as text the bands box reads back, or null when
 * no edge has room to grow.
 */
export function widenEdges(
  bands: readonly (readonly number[])[],
  edges: readonly BandEdge[],
  ctx: BandCheckContext
): string | null {
  let text = bands.map(b => formatBand(b)).join('; ');
  let changed = false;
  for (const e of edges) {
    const next = widenBandText(text, e.band, e.side, widenAmount(bands[e.band - 1]), ctx);
    if (next !== null) {
      text = next;
      changed = true;
    }
  }
  return changed ? text : null;
}

/** What to tell the player when the winner sits on a band's edge. One wording for the Full sweep's
 *  panel and the command line. */
export function describeEdge(e: BandEdge): string {
  return `The best route sits on the edge of band ${e.band} (${e.value} is the ${e.side === 'low' ? 'lowest' : 'highest'} you allowed). There may be a better one just outside.`;
}

const ascWord = (n: number) => (n === 1 ? '1 ascension' : `${n} ascensions`);
/** `4`, `4 and 5`, `4, 5 and 6`. */
function countList(counts: readonly number[]): string {
  const c = counts.map(String);
  return c.length < 2 ? c.join('') : `${c.slice(0, -1).join(', ')} and ${c[c.length - 1]}`;
}

/** Before a Full sweep: which ascension counts it will try, and that no other is looked at. */
export function coverageBeforeText(
  counts: readonly number[],
  /** What to do to try another count: the panel says "add a chain below", the command line names its flag. */
  hint = 'add a chain below to try another count'
): string {
  if (!counts.length) return '';
  return counts.length === 1
    ? `This sweep only tries ${ascWord(counts[0])}. A route with more or fewer isn't looked at; ${hint}.`
    : `This sweep tries ${countList(counts)} ascensions, and no other count.`;
}

/** After (or during) a Full sweep: what it covered. */
export function coverageAfterText(minAscensions: number, maxAscensions: number): string {
  return minAscensions === maxAscensions
    ? `This sweep only tried ${ascWord(minAscensions)}.`
    : `This sweep tried ${minAscensions} to ${maxAscensions} ascensions.`;
}
