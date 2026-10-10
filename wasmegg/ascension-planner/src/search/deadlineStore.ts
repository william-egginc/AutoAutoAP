/**
 * Keeping a deadline search (search/deadline.ts) across a reload: the finished result, and a
 * half-finished run's priced routes so it can carry on.
 *
 * WHY A REPLAY IS ENOUGH TO CARRY ON. The search makes the same choices from the same prices, so a
 * run restarted with the routes it already priced asks for exactly the same routes again, in the
 * same order -- `replayingEvaluator` answers those from the store instantly, and the first route it
 * has not seen is where the interrupted run stopped. No search position needs saving, the same
 * trick the Insane checkpoint uses (persistence.ts).
 *
 * The workers get the SAME inputs on a carry-on: the run's own stored save (search/runSaves.ts),
 * not whatever is loaded now, so both halves are priced on one farm.
 *
 * Browser only, per player, like everything else here.
 */
import { loadMetadata, loadMetadataPrefix, putMetadataRecords, saveMetadata } from '@/lib/storage/db';
import type { ChainResult, LegSummary } from './types';
import type { DeadlineRoute } from './deadline';
import type { ProvisionalRow } from './submission';

const RUN_KEY = 'chainSearchDeadlineRun';
const RESULT_KEY = 'chainSearchDeadlineResult';
/** One record holding every priced route, written whole every 30 s. Still read (`loadDeadlineCheckpoint`). */
const VERSION = 1;
/**
 * A small header record plus the priced routes in PARTS, one per checkpoint, each holding only the
 * routes priced since the last (`appendDeadlineCheckpoint`). Rewriting everything every 30 s copied
 * the whole run three times over (an entries() copy, a JSON round-trip, IndexedDB's own clone): at
 * 131,000 routes ~150 MB spikes and ~0.8 s stalls on the main thread (9 Oct).
 */
const VERSION_PARTS = 2;
/** Parts are keyed `${RUN_KEY}:part:${runId}:${n}`, n zero-padded so key order is write order. */
const PART_PREFIX = `${RUN_KEY}:part:`;
const partKey = (runId: string, n: number) => `${PART_PREFIX}${runId}:${String(n).padStart(7, '0')}`;

/** What the player asked for, as the panel sends it. */
export interface DeadlineRunSpec {
  deadline: number;
  minStops: number;
  maxStops: number;
  lastHi: number;
  step: number;
  /** "Pick them for me": how many sets of early stops the first look may try (deadline.ts
   *  `maxShapes`); the grid widens until it fits. Absent on runs saved before the slider. */
  maxShapes?: number;
  ascendNeeded: boolean;
  /** Shapes tried first (the account's current route). Kept with the run so a carry-on replays
   *  the very same search. */
  seedShapes?: number[][];
  /** The player's own space (one value list per early stop) and the last stop's lower bound. */
  bands?: number[][];
  /** Several chains' spaces, run as one (see deadline.ts `bandSets`). */
  bandSets?: number[][][];
  lastLo?: number;
  /** Routes priced at once (deadline.ts `parallel`), fixed at the start so a carry-on replays. */
  parallel?: number;
  /** The panel's estimate of routes to price, for the progress bar of a carried-on run. */
  estimate?: number;
  /** The last stop may go past its box (deadline.ts `extend`). Absent on runs saved before it. */
  extend?: boolean;
  /** The player's note on the run (submission.ts `cleanNote`). */
  note?: string;
  /** When the run first started (ms). A carry-on keeps it, so the offer says when the run began, not
   *  when it was last saved. Absent on runs saved before 6 Oct. */
  startedAt?: number;
  /** Sets of early stops the run was started with, for the offer to say how big it is. */
  sets?: number;
  /** Each chain row's Suggest-a-space sliders and whether its box was filled by Suggest, in the order
   *  of `bandSets`, so a carry-on puts the sliders back with the boxes. Absent on older checkpoints
   *  (see `rowSettingsFor`). */
  rows?: DeadlineRowSettings[];
  /**
   * The instant answer's own early stops, one list per ascension count it had a route for: tried as
   * extra sets on top of `bandSets` (deadline.ts drops any already in a box), so the instant answer's
   * route is always in the space whatever the boxes say. Kept apart from `bandSets` so a carry-on
   * puts back only the player's boxes. Absent on runs started before 8 Oct.
   */
  instantSets?: number[][];
  /** Started from By a date's Simple mode (batch 3): its boxes were picked around the instant answer,
   *  so a carry-on goes back to Simple. Absent on Advanced runs and runs from before 8 Oct. */
  simple?: boolean;
  /** The estimate the run started with, counted in legs (deadlineEstimate.ts `planLegs`): the first
   *  guess the progress line quotes, and what the live estimate counts down from. */
  legPlan?: DeadlineLegPlan;
}

/** `LegPlan` plus the speed and time it was priced at. */
export interface DeadlineLegPlan {
  sets: number;
  firstLegs: number;
  routes: number;
  /** Real legs a route after a set's first was planned at (deadlineEstimate.ts `laterRouteLegs`).
   *  Absent on runs started before it: 1. */
  laterLegs?: number;
  legs: number;
  workerSecondsPerLeg: number;
  /** Wall-clock seconds at the run's start: the first guess. */
  seconds: number;
}

/** The sets a run tries: the player's boxes, then the instant answer's own early stops as one set
 *  each (one value a band). */
export function runBandSets(spec: Pick<DeadlineRunSpec, 'bandSets' | 'instantSets'>): number[][][] | undefined {
  if (!spec.bandSets?.length) return undefined;
  return [...spec.bandSets, ...(spec.instantSets ?? []).filter(s => s.length).map(s => s.map(v => [v]))];
}

/** One chain row's Suggest-a-space state (DeadlinePanel's `widthIx`, `stepIx`, `auto`). */
export interface DeadlineRowSettings {
  widthIx: number;
  stepIx: number;
  auto: boolean;
}

/**
 * The saved slider state of chain row `i`, or null when the checkpoint has none for it (a run saved
 * before the rows were kept, or a malformed entry). The caller then leaves the sliders alone and
 * treats the restored box as typed by hand, not Suggest's.
 */
export function rowSettingsFor(spec: DeadlineRunSpec, i: number): DeadlineRowSettings | null {
  const r = spec.rows?.[i];
  if (!r || !Number.isInteger(r.widthIx) || !Number.isInteger(r.stepIx) || r.widthIx < 0 || r.stepIx < 0) return null;
  return { widthIx: r.widthIx, stepIx: r.stepIx, auto: r.auto === true };
}

/** The leg detail the results panel reads. The full LegSummary carries shifts and CSV detail
 *  nothing here shows, and would multiply the record for every priced route. */
type MiniLeg = Pick<LegSummary, 'endTE' | 'endTime' | 'durationSeconds' | 'key'>;

/** A priced route: chain key, seconds (-1 = could not be evaluated), and its legs. */
export type PricedEntry = [string, number, MiniLeg[]];

/**
 * Priced routes as a checkpoint part stores them: columns, with each route's legs packed into one
 * string (`packLegs`). Plain data, so it goes into IndexedDB without a JSON round-trip, and a few
 * strings a route instead of an object per leg once it is read back.
 */
export interface CheckpointPart {
  /** Chain keys. */
  k: string[];
  /** Seconds to the last stop; -1: could not be evaluated. */
  s: number[];
  /** `packLegs` of each route's legs. */
  l: string[];
}

/** `endTE:endTime:durationSeconds:key` per leg, `;` between legs. A strategy key never holds `:` or `;`. */
export function packLegs(legs: readonly MiniLeg[]): string {
  return legs.map(l => `${l.endTE}:${l.endTime}:${l.durationSeconds}:${l.key}`).join(';');
}

export function unpackLegs(text: string): MiniLeg[] {
  if (!text) return [];
  return text.split(';').map(part => {
    const [endTE, endTime, durationSeconds, key] = part.split(':');
    return {
      endTE: Number(endTE),
      endTime: Number(endTime),
      durationSeconds: Number(durationSeconds),
      key: key as MiniLeg['key'],
    };
  });
}

export interface DeadlineCheckpoint {
  version: number;
  spec: DeadlineRunSpec;
  /** The stored save the run is priced on (runSaves.ts). */
  inputsKey: string;
  planStart: number;
  te: number;
  /**
   * Every priced route, for a checkpoint written whole (version 1, and `saveDeadlineCheckpoint`'s
   * argument). Empty when they came back as `parts` instead.
   */
  entries: PricedEntry[];
  /** A parted checkpoint's routes as stored (version 2): handed to `replayingEvaluator` as they are. */
  parts?: CheckpointPart[];
  /** Routes priced: `entries.length`, or the parts' total. */
  count?: number;
  /** A parted checkpoint's id: its parts are keyed by it, so a run never reads another run's. */
  runId?: string;
  /** Parts written so far; the next is numbered this. */
  partsWritten?: number;
  updatedAt: number;
  /** Seconds the run has been going, this session and earlier ones, less any time the page was
   *  suspended: a carried-on run's "took" starts from it. Absent on checkpoints written before 8 Oct. */
  elapsedSeconds?: number;
  /** The account half of the run's submission (stores/chainSearch.ts `accountFields`), taken when it
   *  started, so a carry-on on a tab that has loaded a newer save still sends the run's own save
   *  time and TE. Absent on checkpoints written before 7 Oct. */
  account?: DeadlineAccount;
  /** The best so far this run has on the board ("Send best so far"), so a carry-on's final send
   *  still replaces it. Absent when it has none. */
  provisional?: ProvisionalRow;
  /** The run sends its result when it finishes (Find and submit, or a yes given during it), and on
   *  what choices: a carry-on, by hand or by itself, puts these back and sends at its end too. A
   *  carried-on Find and submit run of 9 Oct finished as a plain Find and sent nothing. Absent: it
   *  doesn't send. */
  submit?: DeadlineSubmitIntent;
  /** Times this run was carried on (each after its page died, reloaded or failed), for diagnostics. */
  carryOns?: number;
  /** About how many bytes its parts hold, for diagnostics. */
  bytes?: number;
}

/** About what a part holds in storage: its strings, and 8 bytes a number. */
export function partBytes(p: CheckpointPart): number {
  let n = 0;
  for (const k of p.k) n += k.length;
  for (const l of p.l) n += l.length;
  return n + 8 * p.s.length;
}

export interface DeadlineSubmitIntent {
  /** Started with Find and submit (the button reads "Searching, then submitting..."). */
  whenDone: boolean;
  /** '' for anonymous. */
  nickname: string;
  sendCsv: boolean;
  sendDiagnostics: boolean;
}

/** `accountFields` as stored: plain JSON. Typed loosely here; the store owns the shape. */
export type DeadlineAccount = Record<string, unknown> & { backupTime?: number | null; backupTE?: number | null };

export interface SavedDeadlineResult {
  /** From By a date's Simple mode (`DeadlineRunSpec.simple`). */
  simple?: boolean;
  routes: DeadlineRoute[];
  byStops: DeadlineRoute[];
  deadline: number;
  planStart: number;
  te: number;
  step: number;
  shapes: number;
  priced: number;
  stoppedEarly: boolean;
  ascendNeeded: boolean;
  lastHi: number;
  /** The highest last stop the search could reach: `lastHi`, or 490 for an extended search. */
  ceiling?: number;
  /** The run's note, from its spec. */
  note?: string;
  /** The settings the run started with (stores/chainSearch.ts `RunSettings`), so its record says what
   *  it priced under even if Your setup changed since. Absent on results saved before 5 Oct. */
  settings?: {
    effort: string;
    /** A1's setting (firstAscension.ts). Absent before 9 Oct 2026, which recorded `forceContinue`. */
    firstAscension?: import('./firstAscension').FirstAscension;
    /** @deprecated Before 9 Oct 2026: true = 'continue', false = 'auto'. Read with `readFirstAscension`. */
    forceContinue?: boolean;
    availability: import('./availabilitySchedule').Availability | null;
    deferShifts: boolean;
    timeOff: import('./timeOff').TimeOffDates[];
  };
  /** The run's account snapshot (see `DeadlineCheckpoint.account`), so a saved answer sent later is
   *  sent with its own save, not whichever save the tab holds then. Absent before 7 Oct. */
  account?: DeadlineAccount;
  /** The stored save the run priced (runSaves.ts), and that save's moment and TE. Absent before 7 Oct. */
  inputsKey?: string;
  backupAt?: number | null;
  backupTE?: number | null;
  /** The player's boxes and the instant answer's extra sets the run tried, for the box-edge warning.
   *  Absent before 8 Oct. */
  bandSets?: number[][][];
  instantSets?: number[][];
  /** Legs the workers actually simulated this session (pool `legSims`). Absent before 8 Oct. */
  legSims?: number;
  /** How long the run took, in seconds: its time going, less any time the page was suspended, added
   *  up over the sessions of a carried-on run. Absent on results saved before 8 Oct. */
  elapsedSeconds?: number;
  /** Workers the run used, averaged over its time (the slider can move). Absent before 8 Oct. */
  workers?: number;
  /** The run was carried on from an earlier session's checkpoint. */
  carriedOn?: boolean;
  /** The last stop's box (`DeadlineRunSpec.lastLo`..`lastHi`). Absent before 8 Oct. */
  lastLo?: number;
  at: number;
}

/** Routes priced in a checkpoint, whichever way it holds them. */
export function checkpointCount(cp: Pick<DeadlineCheckpoint, 'entries' | 'parts' | 'count'>): number {
  if (typeof cp.count === 'number') return cp.count;
  return cp.entries.length + (cp.parts ?? []).reduce((n, p) => n + p.k.length, 0);
}

/** Entries as a part. */
export function toPart(entries: readonly PricedEntry[]): CheckpointPart {
  return { k: entries.map(e => e[0]), s: entries.map(e => e[1]), l: entries.map(e => packLegs(e[2])) };
}

/** A parted checkpoint's header record: everything but the routes. */
type Header = Omit<DeadlineCheckpoint, 'entries' | 'parts'> & { runId: string; partsWritten: number; count: number };

function newRunId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The whole checkpoint in one go: a new run id, every route in one part, any older parts deleted.
 * For a checkpoint built elsewhere (tests, a stored one written back); a running search appends
 * instead (`appendDeadlineCheckpoint`).
 */
export async function saveDeadlineCheckpoint(
  partitionHash: string,
  cp: Omit<DeadlineCheckpoint, 'version'>
): Promise<void> {
  const { entries, parts, ...rest } = cp;
  const all = [...(parts ?? []), ...(entries.length ? [toPart(entries)] : [])];
  const runId = newRunId();
  const header: Header & { version: number } = {
    ...rest,
    version: VERSION_PARTS,
    runId,
    partsWritten: all.length,
    count: all.reduce((n, p) => n + p.k.length, 0),
  };
  await putMetadataRecords(
    partitionHash,
    [...all.map((p, n) => ({ key: partKey(runId, n), value: p, raw: true })), { key: RUN_KEY, value: header }],
    [PART_PREFIX]
  );
}

/**
 * Where a running search's checkpoint goes: the run id its parts are keyed by, and how many it has
 * written. A carry-on continues its parted checkpoint's; a fresh run, or a carry-on from a version-1
 * record, starts a new one (`fresh`), whose first write deletes every older part.
 */
export interface CheckpointWriter {
  runId: string;
  partsWritten: number;
  fresh: boolean;
}

export function checkpointWriter(
  from?: Pick<DeadlineCheckpoint, 'runId' | 'partsWritten' | 'version'> | null
): CheckpointWriter {
  if (from && from.version === VERSION_PARTS && from.runId)
    return { runId: from.runId, partsWritten: from.partsWritten ?? 0, fresh: false };
  return { runId: newRunId(), partsWritten: 0, fresh: true };
}

/**
 * One checkpoint of a running search: the routes priced since the last, as a new part (or none:
 * then just the header), and the header with the new count, in ONE transaction. The part goes in as
 * it is, without a JSON round-trip. `w` moves on only once the write has landed.
 */
export async function appendDeadlineCheckpoint(
  partitionHash: string,
  w: CheckpointWriter,
  cp: Omit<DeadlineCheckpoint, 'version' | 'entries' | 'parts' | 'runId' | 'partsWritten' | 'count'> & {
    count: number;
  },
  part: CheckpointPart | null
): Promise<void> {
  const n = w.partsWritten;
  const withPart = !!part && part.k.length > 0;
  const header: Header & { version: number } = {
    ...cp,
    version: VERSION_PARTS,
    runId: w.runId,
    partsWritten: n + (withPart ? 1 : 0),
  };
  await putMetadataRecords(
    partitionHash,
    [...(withPart ? [{ key: partKey(w.runId, n), value: part, raw: true }] : []), { key: RUN_KEY, value: header }],
    w.fresh ? [PART_PREFIX] : []
  );
  w.partsWritten = header.partsWritten;
  w.fresh = false;
}

/** The checkpoint without its routes, for the offer to carry on: cheap for a parted one. */
export async function loadDeadlineCheckpointHeader(
  partitionHash: string
): Promise<(Omit<DeadlineCheckpoint, 'entries' | 'parts'> & { count: number }) | null> {
  const raw = (await loadMetadata(partitionHash, RUN_KEY)) as DeadlineCheckpoint | null;
  if (!raw) return null;
  if (raw.version === VERSION && Array.isArray(raw.entries)) {
    const { entries, ...rest } = raw;
    return { ...rest, count: entries.length };
  }
  if (raw.version === VERSION_PARTS && typeof raw.runId === 'string') {
    const { entries: _entries, parts: _parts, ...rest } = raw;
    return { ...rest, count: typeof raw.count === 'number' ? raw.count : 0 };
  }
  return null;
}

/**
 * The checkpoint with its routes. Reads both versions: a version-1 record (one record, every route
 * in `entries`, as builds before 10 Oct wrote it) comes back as it was, so a run saved by the
 * previous build still carries on; its first new write migrates it (`checkpointWriter` starts it a
 * parted checkpoint, and the carry-on's first part holds the routes it replayed).
 */
export async function loadDeadlineCheckpoint(partitionHash: string): Promise<DeadlineCheckpoint | null> {
  const raw = (await loadMetadata(partitionHash, RUN_KEY)) as DeadlineCheckpoint | null;
  if (!raw) return null;
  if (raw.version === VERSION) return Array.isArray(raw.entries) ? raw : null;
  if (raw.version !== VERSION_PARTS || typeof raw.runId !== 'string') return null;
  const parts = ((await loadMetadataPrefix(partitionHash, `${PART_PREFIX}${raw.runId}:`)) as CheckpointPart[]).filter(
    p => p && Array.isArray(p.k) && Array.isArray(p.s) && Array.isArray(p.l)
  );
  return { ...raw, entries: [], parts, count: parts.reduce((n, p) => n + p.k.length, 0) };
}

export async function clearDeadlineCheckpoint(partitionHash: string): Promise<void> {
  await putMetadataRecords(partitionHash, [{ key: RUN_KEY, value: null }], [PART_PREFIX]);
}

export async function saveDeadlineResult(partitionHash: string, result: SavedDeadlineResult): Promise<void> {
  await saveMetadata(partitionHash, RESULT_KEY, result);
}

export async function loadDeadlineResult(partitionHash: string): Promise<SavedDeadlineResult | null> {
  const raw = (await loadMetadata(partitionHash, RESULT_KEY)) as SavedDeadlineResult | null;
  return raw && Array.isArray(raw.routes) ? raw : null;
}

/** Streams each chain as it is priced (null: it could not be evaluated). */
export type OnResult = (chain: number[], result: ChainResult | null) => void;

/**
 * Wrap the pool's `evaluate` so routes already priced are answered from memory, and everything
 * newly priced is recorded for the next checkpoint -- as it streams in, when the pool streams, so a
 * checkpoint taken in the middle of a long batch keeps what that batch has priced so far.
 *
 * `stopped`, when given and true as a batch returns, means the batch may have been cut short: a chain
 * that was neither returned nor streamed was never priced, so it is NOT recorded as unreachable (a
 * carry-on prices it). Without a stop, a chain missing from the reply could not be evaluated.
 */
export function replayingEvaluator(
  evaluate: (chains: number[][], onResult?: OnResult) => Promise<ChainResult[]>,
  seed: PricedEntry[] = [],
  stopped?: () => boolean,
  opts: {
    /** A parted checkpoint's routes, as loaded (`DeadlineCheckpoint.parts`): replayed like `seed`. */
    parts?: CheckpointPart[];
    /**
     * The seed is already in the checkpoint this run appends to (a parted one), so `drain` leaves it
     * out, and a seed route is forgotten once replayed. Otherwise (a version-1 checkpoint being
     * migrated, a test) the first `drain` hands the seed over too.
     */
    seedSaved?: boolean;
  } = {}
): {
  evaluate: (chains: number[][], onResult?: OnResult) => Promise<ChainResult[]>;
  /** Routes not yet handed to a checkpoint by `drain` (with no drain: the seed and everything priced). */
  entries: () => PricedEntry[];
  /** Routes priced since the last drain (and the seed, the first time, unless `seedSaved`), as a part;
   *  forgotten here. Hand them back with `undrain` if the write fails. */
  drain: () => CheckpointPart;
  undrain: (part: CheckpointPart) => void;
  /** Every distinct route priced: replayed and new. */
  count: () => number;
  replayed: () => number;
} {
  // [seconds, packed legs]: a few strings a route, not an object per leg (`packLegs`).
  type Known = [number, string];
  const known = new Map<string, Known>();
  for (const e of seed) known.set(e[0], [e[1], packLegs(e[2])]);
  for (const p of opts.parts ?? []) for (let i = 0; i < p.k.length; i++) known.set(p.k[i], [p.s[i], p.l[i]]);
  const seedCount = known.size;
  /** What the next drain hands over. Fresh routes live only here until then, never in `known`: the
   *  search asks for each route once, so nothing new is ever looked up again. */
  let pending = new Map<string, Known>(opts.seedSaved ? [] : known);
  let fresh = 0;
  let replayed = 0;
  const toResult = (key: string, e: Known): ChainResult | null =>
    e[0] < 0
      ? null
      : {
          chain: key.split(',').map(Number),
          seconds: e[0],
          // The checkpoint keeps no tier-13 flag, only the strategy (`2-sale-tier13`), so that is what the
          // CSV's tier13 column is read from; peak delivery and the start time stay unknown.
          legs: unpackLegs(e[1]).map(l => ({ ...l, maxELR: 0, tier13Unlocked: /-tier13$/.test(l.key) }) as LegSummary),
        };
  return {
    async evaluate(chains, onResult) {
      const out: ChainResult[] = [];
      const todo: number[][] = [];
      const answered: string[] = [];
      for (const c of chains) {
        const key = c.join(',');
        const e = known.get(key);
        if (!e) {
          todo.push(c);
          continue;
        }
        replayed++;
        answered.push(key);
        const r = toResult(key, e);
        if (r) out.push(r);
        onResult?.(c, r);
      }
      // Replayed and already in the checkpoint: nothing will ask for these again.
      if (opts.seedSaved) for (const key of answered) known.delete(key);
      if (todo.length) {
        /** Recorded in this batch: a chain listed twice is counted once. */
        const seen = new Set<string>();
        const record = (key: string, r: ChainResult | null) => {
          if (!seen.has(key)) {
            seen.add(key);
            fresh++;
          }
          pending.set(key, [r ? r.seconds : -1, r ? packLegs(r.legs) : '']);
        };
        const reached = new Set<string>();
        const priced = await evaluate(todo, (c, r) => {
          const key = c.join(',');
          reached.add(key);
          record(key, r);
          onResult?.(c, r);
        });
        const byKey = new Map(priced.map(r => [r.chain.join(','), r]));
        const cut = !!stopped?.();
        for (const c of todo) {
          const key = c.join(',');
          const r = byKey.get(key);
          if (!r && cut && !reached.has(key)) continue;
          // Streamed already: that is what the search used (deadline.ts reads the reply, then the stream).
          if (!r && reached.has(key)) continue;
          record(key, r ?? null);
          if (r) out.push(r);
        }
      }
      return out;
    },
    entries: () => [...pending.entries()].map(([key, e]) => [key, e[0], unpackLegs(e[1])] as PricedEntry),
    drain: () => {
      const part: CheckpointPart = { k: [], s: [], l: [] };
      for (const [key, e] of pending) {
        part.k.push(key);
        part.s.push(e[0]);
        part.l.push(e[1]);
      }
      pending = new Map();
      return part;
    },
    undrain: part => {
      const back = new Map<string, Known>();
      for (let i = 0; i < part.k.length; i++) back.set(part.k[i], [part.s[i], part.l[i]]);
      for (const [key, e] of pending) back.set(key, e);
      pending = back;
    },
    count: () => seedCount + fresh,
    replayed: () => replayed,
  };
}

/**
 * Saved By a date answers (the user, 5 Oct: "Egg Day doesn't have a save button"). The result slot
 * above holds only the LAST answer, so a new search replaced it; these are kept under names until
 * deleted. Each holds the compact result the panel shows (top 50 routes and the best per count), not
 * the priced cache, so twenty of them are small.
 */
const SAVED_KEY = 'chainSearchDeadlineSaved';
export const MAX_SAVED_ANSWERS = 20;

export interface SavedAnswer {
  id: string;
  label: string;
  savedAt: number;
  result: SavedDeadlineResult;
}

export async function listSavedAnswers(partitionHash: string): Promise<SavedAnswer[]> {
  const raw = (await loadMetadata(partitionHash, SAVED_KEY)) as SavedAnswer[] | null;
  if (!Array.isArray(raw)) return [];
  return raw.filter(a => a && a.result && Array.isArray(a.result.routes)).sort((a, b) => b.savedAt - a.savedAt);
}

/** Save an answer under a name (newest first, the oldest past the cap dropped). */
export async function saveAnswer(
  partitionHash: string,
  result: SavedDeadlineResult,
  label: string,
  now = Date.now()
): Promise<SavedAnswer> {
  const answer: SavedAnswer = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim().slice(0, 80) || 'Untitled answer',
    savedAt: now,
    result,
  };
  const kept = [answer, ...(await listSavedAnswers(partitionHash))].slice(0, MAX_SAVED_ANSWERS);
  await saveMetadata(partitionHash, SAVED_KEY, kept);
  return answer;
}

export async function deleteSavedAnswer(partitionHash: string, id: string): Promise<void> {
  const kept = (await listSavedAnswers(partitionHash)).filter(a => a.id !== id);
  await saveMetadata(partitionHash, SAVED_KEY, kept);
}

/**
 * A checkpoint left behind by a run whose result was saved since: the result is at least as new, for
 * the same save, start and deadline, and finished (not stopped early). Offering it as "Carry on the
 * unfinished search" would run a finished search again; after the 9 Oct crash the page showed both.
 */
export function checkpointFinished(
  cp: Pick<DeadlineCheckpoint, 'inputsKey' | 'planStart' | 'updatedAt' | 'spec'>,
  result: Pick<SavedDeadlineResult, 'inputsKey' | 'planStart' | 'at' | 'stoppedEarly' | 'deadline'> | null
): boolean {
  if (!result || result.stoppedEarly) return false;
  return (
    result.at >= cp.updatedAt &&
    result.planStart === cp.planStart &&
    result.deadline === cp.spec.deadline &&
    (!result.inputsKey || result.inputsKey === cp.inputsKey)
  );
}
