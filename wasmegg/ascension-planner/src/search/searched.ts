/**
 * What a search looked at, as one line of text (Jordan, 17 Oct 2026: "for any run, which routes were
 * looked at"). The same string goes three places, so they always agree:
 *
 *   - the CSV's header, as `# searched: ...` and `# ascensions: N-M; min gap: G` under the "routes
 *     priced" line (search/csv.ts `metaLines`; the command line writes its CSVs with the same code);
 *   - the submission's `searched` field (submission.ts), which the board keeps on the row;
 *   - My runs' "What was searched" line (`searchedWords`, LeaderboardRunDetail.vue).
 *
 * THE FORMAT. Tokens joined by "; ", in the command line's own box notation:
 *
 *   195-197:2; 209-240:1; 230-260:1; 255-300:1; last 300-320; ascensions: 5
 *
 *   `lo-hi:step` (or `215`, or `185-200:5, 210` for uneven values)   one early stop's box, in order
 *   ` | ` inside a token        a new set of boxes starts (By a date runs several, one per count);
 *                               `none` is a set with no early stop (one ascension)
 *   `last LO-HI` / `last up to HI`, then ` (could go to 490)`   the last stop's box (By a date)
 *   `plus N instant answer sets`   the instant answer's own early stops, tried on top of the boxes
 *   `grid step S`               early stops picked on an S-TE grid (no boxes: the quick scan, the
 *                               retired "Pick them for me")
 *   `range LO-HI:S`             one pool every stop draws from (Exhaustive's range mode, the CLI's
 *                               --exhaustive --range or --grid)
 *   `around A B C`              Nearby routes on Fastest: the route it started from
 *   `counts 4 5 6`              the ascension counts it searched from
 *   `routes: 8 instant answer, 3 earlier, 1 one TE lower`   Light: the routes it priced, by where from
 *   `ascensions: N-M` / `ascensions: N`   the count range
 *   `min gap: G`                least TE between stops (Exhaustive on Fastest)
 *   `…`                         cut to fit the board's cap (`cleanSearched`)
 *
 * Pure. Nothing here reads a store.
 */
import { formatBand } from './exhaustive';

/** What a search looked at, before it is written as text. Every part optional. */
export interface SearchedSpace {
  /** Boxes, one list of values per early stop, per set. An empty set is one ascension. */
  sets?: readonly (readonly (readonly number[])[])[];
  /** One pool every stop draws from, as values. */
  range?: readonly number[];
  /** The last stop's box. `lo` absent: only its top is known. `upTo`: the search could go past `hi`. */
  last?: { lo?: number; hi: number; upTo?: number };
  /** Sets of early stops the instant answer added on top of the boxes. */
  instantSets?: number;
  /** Grid step of early stops picked without boxes. */
  grid?: number;
  /** The route a Nearby routes search on Fastest started from. */
  around?: readonly number[];
  /** The ascension counts it searched from. */
  counts?: readonly number[];
  /** Light: routes priced, by where they came from. */
  light?: { instant: number; earlier: number; lower: number };
  ascensions?: { min: number; max: number };
  minGap?: number;
}

/** The longest `searched` the board is sent (the collector keeps it, and cuts anything longer). The
 *  boxes of a big By a date run fit easily. Also exported from submission.ts. */
export const MAX_SEARCHED = 600;

const SEP = '; ';
const SET_SEP = ' | ';
const CUT = '…';

const whole = (n: number) => Number.isFinite(n) && n >= 0;

function countsTokens(s: SearchedSpace): string[] {
  const out: string[] = [];
  const a = s.ascensions;
  if (a && whole(a.min) && whole(a.max) && a.max >= a.min)
    out.push(`ascensions: ${a.min === a.max ? a.min : `${a.min}-${a.max}`}`);
  if (s.minGap !== undefined && whole(s.minGap)) out.push(`min gap: ${s.minGap}`);
  return out;
}

function boxTokens(s: SearchedSpace): string[] {
  const out: string[] = [];
  if (s.sets?.length) {
    // Sets joined into one run of tokens: the first token of each later set carries ` | ` before it.
    const setTexts = s.sets.map(set => (set.length ? set.map(b => formatBand(b)).join(SEP) : 'none'));
    out.push(setTexts.join(SET_SEP));
  }
  if (s.range?.length) out.push(`range ${formatBand(s.range)}`);
  if (s.grid && whole(s.grid)) out.push(`grid step ${s.grid}`);
  if (s.around?.length) out.push(`around ${s.around.join(' ')}`);
  if (s.counts?.length) out.push(`counts ${[...new Set(s.counts)].sort((a, b) => a - b).join(' ')}`);
  if (s.instantSets && s.instantSets > 0) out.push(`plus ${s.instantSets} instant answer set${s.instantSets === 1 ? '' : 's'}`);
  if (s.last && whole(s.last.hi)) {
    const box = s.last.lo !== undefined && whole(s.last.lo) ? `last ${s.last.lo}-${s.last.hi}` : `last up to ${s.last.hi}`;
    out.push(s.last.upTo && s.last.upTo > s.last.hi ? `${box} (could go to ${s.last.upTo})` : box);
  }
  if (s.light) {
    const parts = [
      s.light.instant ? `${s.light.instant} instant answer` : '',
      s.light.earlier ? `${s.light.earlier} earlier` : '',
      s.light.lower ? `${s.light.lower} one TE lower` : '',
    ].filter(Boolean);
    if (parts.length) out.push(`routes: ${parts.join(', ')}`);
  }
  return out;
}

/**
 * The whole line: the boxes, then the counts. Undefined when nothing is known: a row then says "not
 * recorded", never a guess.
 */
export function searchedText(s: SearchedSpace | null | undefined): string | undefined {
  if (!s) return undefined;
  const text = [...boxTokens(s), ...countsTokens(s)].join(SEP);
  return text || undefined;
}

/** Splits a line into its box tokens and its count tokens (`ascensions:`, `min gap:`). */
function splitTokens(text: string): { boxes: string[]; counts: string[] } {
  const boxes: string[] = [];
  const counts: string[] = [];
  for (const t of text.split(';').map(x => x.trim())) {
    if (!t) continue;
    if (/^(ascensions|min gap):/.test(t)) counts.push(t);
    else boxes.push(t);
  }
  return { boxes, counts };
}

/**
 * The CSV's header lines for a `searched` line, without their leading `# `: `searched: <boxes>`, then
 * `ascensions: N-M; min gap: G` when either is known. Empty for nothing. Every CSV writer (the site's
 * Fastest and By a date, the command line's own) goes through this, so they write the same lines.
 */
export function searchedCsvLines(text: string | undefined): string[] {
  const clean = oneLine(text);
  if (!clean) return [];
  const { boxes, counts } = splitTokens(clean);
  const out: string[] = [];
  if (boxes.length) out.push(`searched: ${boxes.join(SEP)}`);
  if (counts.length) out.push(counts.join(SEP));
  return out;
}

// eslint-disable-next-line no-control-regex
const oneLine = (text: string | undefined) => (text ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').trim();

/**
 * `searched` as it is sent: one line, no player ids, at most `MAX_SEARCHED` characters. Too long, box
 * tokens are dropped from the end (the counts are kept) and `…` marks the cut. Undefined when empty.
 */
export function cleanSearched(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const one = oneLine(text).replace(/EI\d{16}/g, 'EI[redacted]');
  if (!one) return undefined;
  if (one.length <= MAX_SEARCHED) return one;
  const { boxes, counts } = splitTokens(one);
  const tail = counts.join(SEP);
  const room = MAX_SEARCHED - (tail ? tail.length + SEP.length : 0) - (CUT.length + SEP.length);
  const kept: string[] = [];
  let used = 0;
  for (const b of boxes) {
    const add = (kept.length ? SEP.length : 0) + b.length;
    if (used + add > room) break;
    kept.push(b);
    used += add;
  }
  const out = [...kept, CUT, ...(tail ? [tail] : [])].join(SEP);
  return out.slice(0, MAX_SEARCHED);
}

/** The words a row says when its run sent no `searched` (rows from before 18 Oct 2026). */
export const SEARCHED_NOT_RECORDED = 'not recorded (older run)';

/** `195-197:2` -> `195-197 (every 2)`; `209-240:1` -> `209-240`; pieces joined by commas kept. */
function bandWords(band: string): string | null {
  const pieces = band.split(',').map(p => p.trim());
  const out: string[] = [];
  for (const p of pieces) {
    const m = /^(\d+)(?:-(\d+)(?::(\d+))?)?$/.exec(p);
    if (!m) return null;
    if (!m[2]) out.push(m[1]);
    else out.push(m[3] && m[3] !== '1' ? `${m[1]}-${m[2]} (every ${m[3]})` : `${m[1]}-${m[2]}`);
  }
  return out.join(', ');
}

/**
 * A `searched` line in words, for My runs: "Stops: 195-197 (every 2), 209-240, 230-260, 255-300;
 * last stop 300-320; 5 ascensions". A line it cannot read comes back as it is; none at all, as
 * `SEARCHED_NOT_RECORDED`.
 */
export function searchedWords(text: string | null | undefined): string {
  const raw = oneLine(text ?? undefined);
  if (!raw) return SEARCHED_NOT_RECORDED;
  const sets: string[][] = [];
  const rest: string[] = [];
  let m: RegExpExecArray | null;
  for (const token of raw.split(';').map(t => t.trim())) {
    if (!token) continue;
    if (token === CUT) {
      rest.push('and more');
      continue;
    }
    if ((m = /^last (?:(\d+)-(\d+)|up to (\d+))(?: \(could go to (\d+)\))?$/.exec(token))) {
      const box = m[3] ? `up to ${m[3]}` : `${m[1]}-${m[2]}`;
      rest.push(`last stop ${box}${m[4] ? ` (could go to ${m[4]})` : ''}`);
    } else if ((m = /^range (.+)$/.exec(token))) {
      const w = bandWords(m[1]);
      if (w === null) return raw;
      rest.push(`every stop from ${w}`);
    } else if ((m = /^grid step (\d+)$/.exec(token))) {
      rest.push(`early stops on a ${m[1]}-TE grid`);
    } else if ((m = /^around ([\d ]+)$/.exec(token))) {
      rest.push(`Nearby routes around ${m[1].trim()}`);
    } else if ((m = /^counts ([\d ]+)$/.exec(token))) {
      rest.push(`ascension counts tried ${m[1].trim().split(/\s+/).join(', ')}`);
    } else if ((m = /^plus (\d+) instant answer sets?$/.exec(token))) {
      rest.push(`plus the instant answer's ${m[1]} set${m[1] === '1' ? '' : 's'} of early stops`);
    } else if ((m = /^routes: (.+)$/.exec(token))) {
      rest.push(`routes priced: ${m[1]}`);
    } else if ((m = /^ascensions: (\d+)(?:-(\d+))?$/.exec(token))) {
      rest.push(!m[2] || m[1] === m[2] ? `${m[1]} ascension${m[1] === '1' ? '' : 's'}` : `${m[1]} to ${m[2]} ascensions`);
    } else if ((m = /^min gap: (\d+)$/.exec(token))) {
      rest.push(m[1] === '0' ? 'no minimum gap' : `at least ${m[1]} TE between stops`);
    } else {
      // Box tokens: ` | ` starts a new set.
      const parts = token.split('|').map(p => p.trim());
      for (let k = 0; k < parts.length; k++) {
        if (k > 0 || !sets.length) sets.push([]);
        const p = parts[k];
        if (p === 'none') continue;
        const w = bandWords(p);
        if (w === null) return raw;
        sets[sets.length - 1].push(w);
      }
    }
  }
  const stops = sets.map(s => (s.length ? s.join(', ') : 'none (one ascension)'));
  const head = stops.length ? [`Stops: ${stops.join('; or ')}`] : [];
  const all = [...head, ...rest];
  return all.length ? all.join('; ') : raw;
}

// ------------------------------------------------------------------ each search's own

/**
 * By a date (Nearby routes and Exhaustive both): the boxes the run priced, the instant answer's extra
 * sets, the last stop's box, and the count range. Nearby routes' boxes are generated (around the
 * instant answer, or widened by the fallback's rounds), and this is read off the run's own spec, so
 * the line is what that run used: after widening, the last round's.
 */
export function deadlineSearched(r: {
  bandSets?: readonly (readonly (readonly number[])[])[];
  bands?: readonly (readonly number[])[];
  instantSets?: readonly (readonly number[])[];
  lastLo?: number;
  lastHi: number;
  /** The highest last stop the search could reach (490 for an extended run). */
  ceiling?: number;
  /** Grid step, read only without boxes. */
  step?: number;
  minStops?: number;
  maxStops?: number;
}): SearchedSpace {
  const sets = r.bandSets?.length ? r.bandSets : r.bands?.length ? [r.bands] : null;
  const s: SearchedSpace = {};
  if (sets) {
    s.sets = sets;
    const counts = sets.map(b => b.length + 1);
    for (const set of r.instantSets ?? []) counts.push(set.length + 1);
    s.ascensions = { min: Math.min(...counts), max: Math.max(...counts) };
  } else {
    if (r.step && r.step > 0) s.grid = r.step;
    if (r.minStops && r.maxStops) s.ascensions = { min: r.minStops, max: r.maxStops };
  }
  if (r.instantSets?.length) s.instantSets = r.instantSets.length;
  s.last = {
    ...(r.lastLo !== undefined && r.lastLo > 0 ? { lo: r.lastLo } : {}),
    hi: r.lastHi,
    ...(r.ceiling && r.ceiling > r.lastHi ? { upTo: r.ceiling } : {}),
  };
  return s;
}

/** `lo..hi` by `step` as values (at most a thousand: no TE is that far apart). */
function rangeValues(r: { lo: number; hi: number; step: number }): number[] {
  const out: number[] = [];
  const step = Math.max(1, Math.floor(r.step) || 1);
  for (let v = Math.floor(r.lo); v <= r.hi && out.length < 1000; v += step) out.push(v);
  return out;
}

/** Fastest's Exhaustive (the Full sweep): its space as stated (submission.ts `SearchSpace`). */
export function sweepSearched(space: {
  mode: 'range' | 'bands';
  range?: { lo: number; hi: number; step: number };
  bands?: number[][];
  minGap: number;
  minAscensions: number;
  maxAscensions: number;
}): SearchedSpace {
  return {
    ...(space.mode === 'bands' && space.bands?.length ? { sets: [space.bands] } : {}),
    ...(space.mode === 'range' && space.range ? { range: rangeValues(space.range) } : {}),
    ascensions: { min: space.minAscensions, max: space.maxAscensions },
    minGap: space.minGap,
  };
}

/** Nearby routes on Fastest: the route it started from, the counts it searched from, its limits. */
export function nearbySearched(o: {
  seed: readonly number[];
  counts?: readonly number[] | null;
  limits?: { min: number; max: number } | null;
}): SearchedSpace {
  return {
    ...(o.seed.length ? { around: o.seed } : {}),
    ...(o.counts?.length ? { counts: o.counts } : {}),
    ...(o.limits && o.limits.min > 0 && o.limits.max >= o.limits.min ? { ascensions: o.limits } : {}),
  };
}

/** Light: the routes it priced, counted by where they came from, and the counts they span. */
export function lightSearched(routes: readonly { chain: readonly number[]; from: string }[]): SearchedSpace {
  if (!routes.length) return {};
  const n = (f: string) => routes.filter(r => r.from === f).length;
  const lens = routes.map(r => r.chain.length);
  return {
    light: { instant: n('instant'), earlier: n('earlier'), lower: n('lower-te') },
    ascensions: { min: Math.min(...lens), max: Math.max(...lens) },
  };
}
