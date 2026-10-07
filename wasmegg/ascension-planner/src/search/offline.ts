/**
 * @module offline
 * @description The pure half of the command line's offline workflow (scripts/fastsearch.ts and
 * scripts/siteRun.ts): everything that can be decided without a save, a worker or the network, so it
 * can be tested here rather than only by running a search.
 *
 *   - `--effort` names, with the retired Balanced tier mapped to Exact;
 *   - the file a run writes for a later `submit --from` (submission.json) and the checks on reading it
 *     back, since that file travels between machines;
 *   - the signature of a run's flags, which decides whether a re-run in the same `--out` directory is
 *     the same run (and so resumes) or another one (and so is refused);
 *   - a named Science preset fitted to the save's TE, and whether it fits at all;
 *   - the By a date chains suggested the way the panel's Suggest a space does;
 *   - the band checker's and the edge warning's words as printable lines.
 *
 * No player id is read, kept or written here. The one account-shaped field in the submission file is
 * the partition hash (SHA-256 of the id), which is what the owner code is filed under in the site
 * too, and which cannot be turned back into the id.
 */
import { EFFORT_NOTES, normalizeEffort } from './effort';
import { checkBandText, describeEdge, findBandEdges, widenEdges, type BandCheckContext } from './bandCheck';
import { formatBands, parseBands } from './exhaustive';
import { validateSubmission, type Submission } from './submission';
import { countBandShapes } from './deadline';
import { stopsByWidth } from './deadlineSuggest';
import { presetBandsFor, presetChains, NO_FIT_TEXT, SCIENCE_SWEEP_NOTE } from '@/explorer/needs';
import { SWEEP_PRESETS } from '@/explorer/upload';
import type { EffortTier } from './types';

/* ------------------------------------------------------------------------------------------- *
 * --effort
 * ------------------------------------------------------------------------------------------- */

export interface EffortChoice {
  tier: EffortTier;
  /** The slider's own label for the tier (Fast, Exact, Very high). */
  label: string;
  /** Said once when what was typed is not what runs (the retired Balanced). */
  note: string | null;
}

/**
 * The tier a `--effort` value means. The slider says Fast / Exact / Very high and the keys are
 * quick / normal / thorough; both spellings work. Balanced was retired on 6 Oct (it ran the same
 * steps as Exact), so it runs Exact and says so rather than refusing a command someone has in a
 * script. Nothing given is Exact, the site's default.
 */
export function chooseEffort(raw: string | undefined): EffortChoice {
  const word = (raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const known: Record<string, EffortTier> = {
    '': 'normal',
    fast: 'quick',
    quick: 'quick',
    exact: 'normal',
    normal: 'normal',
    veryhigh: 'thorough',
    thorough: 'thorough',
  };
  if (word === 'balanced') {
    return {
      tier: normalizeEffort('balanced'),
      label: EFFORT_NOTES.normal.label,
      note: 'Balanced was retired (it ran the same steps as Exact), so this runs Exact.',
    };
  }
  const tier = known[word];
  if (!tier) throw new Error(`--effort must be fast, exact or thorough (Very high); got "${raw}"`);
  return { tier, label: EFFORT_NOTES[tier].label, note: null };
}

/* ------------------------------------------------------------------------------------------- *
 * The file a run leaves for `submit --from`
 * ------------------------------------------------------------------------------------------- */

export const OFFLINE_FORMAT = 1;
export const SUBMISSION_FILE = 'submission.json';
export const CSV_FILE = 'run.csv.gz';

export type OfflineKind = 'smart' | 'full' | 'by-date';

export interface OfflineSubmission {
  format: typeof OFFLINE_FORMAT;
  kind: OfflineKind;
  /** When the file was written (ISO 8601). */
  createdAt: string;
  /** SHA-256 of the account the run was priced for, which the owner code is filed under. '' if unknown. */
  partition: string;
  /** The site's key for "the same result" (chainSearch `resultKey`), so a send from here and from the
   *  site's own button do not file one result twice. Null when it could not be worked out. */
  resultKey: string | null;
  /** The table's file name next to this one, or null for a summary-only send. */
  csv: string | null;
  /** The run was stopped before it finished (the board marks such a row partial). */
  stoppedEarly: boolean;
  /** Exactly what the site would POST to /submit. */
  payload: Submission;
}

export function buildOfflineSubmission(o: {
  kind: OfflineKind;
  payload: Submission;
  partition: string;
  resultKey: string | null;
  csv: boolean;
  stoppedEarly: boolean;
  now?: Date;
}): OfflineSubmission {
  return {
    format: OFFLINE_FORMAT,
    kind: o.kind,
    createdAt: (o.now ?? new Date()).toISOString(),
    partition: o.partition,
    resultKey: o.resultKey,
    csv: o.csv ? CSV_FILE : null,
    stoppedEarly: o.stoppedEarly,
    payload: o.payload,
  };
}

export type ReadOffline = { ok: true; value: OfflineSubmission } | { ok: false; error: string };

/**
 * The file read back. It crosses machines (and gets copied about by hand), so every field is
 * checked, the payload goes through the same validator the collector's rules are written from, and
 * the table's name must be a plain file name: a path in it would make the sender read any file.
 */
export function readOfflineSubmission(text: string): ReadOffline {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  const o = raw as Partial<OfflineSubmission> | null;
  if (!o || typeof o !== 'object') return { ok: false, error: 'not an object' };
  if (o.format !== OFFLINE_FORMAT) return { ok: false, error: `unknown format ${String(o.format)} (this build reads ${OFFLINE_FORMAT})` };
  if (o.kind !== 'smart' && o.kind !== 'full' && o.kind !== 'by-date') return { ok: false, error: `unknown kind ${String(o.kind)}` };
  if (typeof o.partition !== 'string' || !(o.partition === '' || /^[a-f0-9]{64}$/.test(o.partition))) {
    return { ok: false, error: 'partition must be a SHA-256 hex string' };
  }
  if (o.resultKey !== null && typeof o.resultKey !== 'string') return { ok: false, error: 'resultKey must be text or null' };
  if (o.csv !== null && (typeof o.csv !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(o.csv) || o.csv.startsWith('.'))) {
    return { ok: false, error: 'csv must be a plain file name next to submission.json' };
  }
  if (typeof o.stoppedEarly !== 'boolean') return { ok: false, error: 'stoppedEarly must be true or false' };
  const problems = validateSubmission(o.payload);
  if (problems.length) return { ok: false, error: `the payload would be refused: ${problems.join('; ')}` };
  return {
    ok: true,
    value: {
      format: OFFLINE_FORMAT,
      kind: o.kind,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
      partition: o.partition,
      resultKey: o.resultKey ?? null,
      csv: o.csv ?? null,
      stoppedEarly: o.stoppedEarly,
      payload: o.payload as Submission,
    },
  };
}

/** A name as the collector stores it: trimmed, a player id redacted, at most 40 characters. */
export function cleanNickname(name: string): string {
  return name.trim().replace(/EI\d{16}/g, 'EI[redacted]').slice(0, 40);
}

/* ------------------------------------------------------------------------------------------- *
 * Is this re-run the same run?
 * ------------------------------------------------------------------------------------------- */

/** Flags that change where or how fast a run goes, or what happens after it, but not what it prices. */
export const NON_RUN_FLAGS = new Set([
  'jobs',
  'out',
  'csv',
  'no-csv',
  'top',
  'submit',
  'nickname',
  'no-submit-csv',
  'collector',
  'state',
  'fresh',
  'help',
  'plain-csv',
  'widen',
  'backup',
  'player-id',
  'save-backup',
]);

/**
 * The flags that define a run, as one comparable string: name=value pairs, sorted (so order does not
 * matter), repeated flags kept (two `--chain` boxes are two chains). The save is not in it: the run's
 * own fingerprint (plan start, TE, schedule) and stored save already tell a different save apart, and
 * a copied-over save file has another path on another machine. `--start-date` / `--start-time` are in
 * only when typed; otherwise the directory pins the first run's start (see `pinnedStart`).
 */
export function runSignature(argv: readonly string[]): string {
  const pairs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const name = t.slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith('--') ? next : '';
    if (value) i++;
    if (NON_RUN_FLAGS.has(name)) continue;
    pairs.push(`${name}=${value}`);
  }
  return pairs.sort().join(' ');
}

/* ------------------------------------------------------------------------------------------- *
 * A named Science preset
 * ------------------------------------------------------------------------------------------- */

export type PresetFit =
  | { ok: true; id: string; label: string; bands: string; minGap: number; chains: number; ascensions: number; note: string }
  | { ok: false; reason: string };

/**
 * `--preset F4`: the preset's bands fitted to this save's TE, as the Science tab fits them, or why it
 * cannot run (unknown name, or it prices no chain from this TE: the tab hides those).
 */
export function fitPreset(id: string, currentTE: number, final: number): PresetFit {
  const want = id.trim().toLowerCase();
  const preset = SWEEP_PRESETS.find(p => p.id.toLowerCase() === want && p.id !== 'custom' && p.bands);
  if (!preset) {
    const names = SWEEP_PRESETS.filter(p => p.id !== 'custom' && p.bands).map(p => p.id);
    return { ok: false, reason: `unknown preset "${id}". Known: ${names.join(', ')}` };
  }
  const bands = presetBandsFor(preset.id, currentTE, final);
  const { chains, ascensions } = presetChains(preset.id, currentTE, final);
  if (!chains) {
    return {
      ok: false,
      reason: `${NO_FIT_TEXT} From TE ${Math.floor(currentTE)} ${preset.id}'s ascension ranges leave no room above where your save is.`,
    };
  }
  return { ok: true, id: preset.id, label: preset.label, bands, minGap: preset.minGap, chains, ascensions, note: SCIENCE_SWEEP_NOTE };
}

/* ------------------------------------------------------------------------------------------- *
 * By a date: the chains, as the panel's Suggest a space would fill them
 * ------------------------------------------------------------------------------------------- */

export interface SuggestedChain {
  asc: number;
  /** One band per early stop; empty for "no ascension: keep going on this farm". */
  text: string;
}

/**
 * A chain of `asc` ascensions for By a date, spaced evenly from your TE to the guessed last stop
 * (the panel has no answer or route of its own to start from here), each early stop tried
 * `halfWidth` TE either side, the first at every TE and the later ones every `step`. The panel's
 * defaults are 10 and 2. Null when the stops do not fit.
 */
export function suggestDeadlineChain(
  currentTE: number,
  asc: number,
  opts: { halfWidth?: number; step?: number; lastGuess?: number } = {}
): { chain: SuggestedChain; lastRange: [number, number]; sets: number } | null {
  const te = Math.floor(currentTE);
  const n = Math.max(1, Math.min(8, Math.floor(asc)));
  const lastGuess = opts.lastGuess ?? Math.min(490, te + 110);
  const lastRange: [number, number] = [Math.max(te + 2, lastGuess - 20), Math.min(490, lastGuess + 20)];
  if (n === 1) return { chain: { asc: 1, text: '' }, lastRange, sets: 1 };
  const early = Array.from({ length: n - 1 }, (_, i) => Math.round(te + ((i + 1) * (lastGuess - te)) / n));
  const sug = stopsByWidth(te, early, lastRange[1], opts.halfWidth ?? 10, opts.step ?? 2);
  if (!sug) return null;
  return { chain: { asc: n, text: sug.text }, lastRange, sets: countBandShapes(sug.bands, te, lastRange[1]) };
}

/* ------------------------------------------------------------------------------------------- *
 * Printable lines
 * ------------------------------------------------------------------------------------------- */

/**
 * What the band checker says about a `--bands` text, as lines to print: each thing it noticed, and
 * the fixed text when it has one. Empty when nothing looks wrong. Never changes what runs.
 */
export function bandCheckLines(text: string, ctx: BandCheckContext, flag = '--bands'): string[] {
  const out: string[] = [];
  for (const issue of checkBandText(text, ctx)) {
    out.push(`  check: ${issue.message}`);
    if (issue.fix) out.push(`         fixed text: ${flag} "${issue.fix}"`);
  }
  return out;
}

/**
 * The edge warning for a finished Full sweep, as the panel words it: where the winner sits on the
 * first or last value of a band with room to go further, the widened bands, and what the wider
 * space costs. Null `widened` when no edge has room to grow.
 */
export function edgeLines(o: {
  bands: number[][];
  chain: number[];
  currentTE: number;
  finalTE: number;
  minGap: number;
  countChains: (bands: number[][]) => number;
  /** What to do to run the wider space; the default points at `--widen`. */
  hint?: string;
}): { lines: string[]; widened: { text: string; bands: number[][]; chains: number } | null } {
  const edges = findBandEdges(o.bands, o.chain, { currentTE: o.currentTE, finalTE: o.finalTE, minGap: o.minGap });
  if (!edges.length) return { lines: [], widened: null };
  const lines = edges.map(e => `  warning: ${describeEdge(e)}`);
  const text = widenEdges(o.bands, edges, { currentTE: o.currentTE, finalTE: o.finalTE });
  if (!text) return { lines, widened: null };
  const bands = parseBands(text);
  const widened = { text: formatBands(bands), bands, chains: o.countChains(bands) };
  lines.push(
    `  The wider space is ${widened.chains.toLocaleString()} chains: --bands "${widened.text}"` +
      ` (${o.hint ?? 'or add --widen to run it straight away'}; chains already priced are reused).`
  );
  return { lines, widened };
}
