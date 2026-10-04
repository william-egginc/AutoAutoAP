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
}

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
