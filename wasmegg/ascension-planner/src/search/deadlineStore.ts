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
import { loadMetadata, saveMetadata } from '@/lib/storage/db';
import type { ChainResult, LegSummary } from './types';
import type { DeadlineRoute } from './deadline';

const RUN_KEY = 'chainSearchDeadlineRun';
const RESULT_KEY = 'chainSearchDeadlineResult';
const VERSION = 1;

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

export interface DeadlineCheckpoint {
  version: number;
  spec: DeadlineRunSpec;
  /** The stored save the run is priced on (runSaves.ts). */
  inputsKey: string;
  planStart: number;
  te: number;
  entries: PricedEntry[];
  updatedAt: number;
  /** The account half of the run's submission (stores/chainSearch.ts `accountFields`), taken when it
   *  started, so a carry-on on a tab that has loaded a newer save still sends the run's own save
   *  time and TE. Absent on checkpoints written before 7 Oct. */
  account?: DeadlineAccount;
}

/** `accountFields` as stored: plain JSON. Typed loosely here; the store owns the shape. */
export type DeadlineAccount = Record<string, unknown> & { backupTime?: number | null; backupTE?: number | null };

export interface SavedDeadlineResult {
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
    forceContinue: boolean;
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
  at: number;
}

export async function saveDeadlineCheckpoint(
  partitionHash: string,
  cp: Omit<DeadlineCheckpoint, 'version'>
): Promise<void> {
  await saveMetadata(partitionHash, RUN_KEY, { ...cp, version: VERSION });
}

export async function loadDeadlineCheckpoint(partitionHash: string): Promise<DeadlineCheckpoint | null> {
  const raw = (await loadMetadata(partitionHash, RUN_KEY)) as DeadlineCheckpoint | null;
  return raw && raw.version === VERSION && Array.isArray(raw.entries) ? raw : null;
}

export async function clearDeadlineCheckpoint(partitionHash: string): Promise<void> {
  await saveMetadata(partitionHash, RUN_KEY, null);
}

export async function saveDeadlineResult(partitionHash: string, result: SavedDeadlineResult): Promise<void> {
  await saveMetadata(partitionHash, RESULT_KEY, result);
}

export async function loadDeadlineResult(partitionHash: string): Promise<SavedDeadlineResult | null> {
  const raw = (await loadMetadata(partitionHash, RESULT_KEY)) as SavedDeadlineResult | null;
  return raw && Array.isArray(raw.routes) ? raw : null;
}

/**
 * Wrap the pool's `evaluate` so routes already priced are answered from memory, and everything
 * newly priced is recorded for the next checkpoint.
 */
export function replayingEvaluator(
  evaluate: (chains: number[][]) => Promise<ChainResult[]>,
  seed: PricedEntry[] = []
): {
  evaluate: (chains: number[][]) => Promise<ChainResult[]>;
  entries: () => PricedEntry[];
  replayed: () => number;
} {
  const known = new Map<string, PricedEntry>(seed.map(e => [e[0], e]));
  let replayed = 0;
  const toResult = (e: PricedEntry): ChainResult | null =>
    e[1] < 0
      ? null
      : {
          chain: e[0].split(',').map(Number),
          seconds: e[1],
          legs: e[2].map(l => ({ ...l, maxELR: 0, tier13Unlocked: false }) as LegSummary),
        };
  return {
    async evaluate(chains) {
      const out: ChainResult[] = [];
      const fresh: number[][] = [];
      for (const c of chains) {
        const e = known.get(c.join(','));
        if (!e) {
          fresh.push(c);
          continue;
        }
        replayed++;
        const r = toResult(e);
        if (r) out.push(r);
      }
      if (fresh.length) {
        const priced = await evaluate(fresh);
        const byKey = new Map(priced.map(r => [r.chain.join(','), r]));
        for (const c of fresh) {
          const key = c.join(',');
          const r = byKey.get(key);
          known.set(key, [
            key,
            r ? r.seconds : -1,
            r
              ? r.legs.map(l => ({
                  endTE: l.endTE,
                  endTime: l.endTime,
                  durationSeconds: l.durationSeconds,
                  key: l.key,
                }))
              : [],
          ]);
          if (r) out.push(r);
        }
      }
      return out;
    },
    entries: () => [...known.values()],
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
