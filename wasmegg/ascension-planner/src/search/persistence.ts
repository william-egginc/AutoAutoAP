/**
 * Checkpointing a chain search to IndexedDB, so a refresh in hour two of a three-hour run does not
 * throw the run away.
 *
 * Reuses lib/storage/db.ts's `metadata` store (the same partition-by-hashed-player-id scheme the
 * plan library and the active draft already use) rather than introducing a second storage layer.
 *
 * WHAT IS SAVED, AND WHY THAT IS ENOUGH TO RESUME. The expensive thing a run accumulates is the
 * chain -> duration cache: every entry in it is roughly fifteen seconds of CPU that never has to be
 * spent again. The driver itself is deterministic given that cache, so resuming does NOT need the
 * driver's internal loop position — restoring the cache and re-running from the top replays every
 * already-known chain as a cache hit (no simulation, no worker traffic) and then continues from
 * exactly where the run stopped. That is a fast replay, not a re-simulation, and it is far more
 * robust than serialising a half-finished nested loop.
 *
 * Per-leg summaries are kept ONLY for the current best chain. They exist to render the results
 * table; keeping them for every cached chain would multiply the record's size by roughly six for
 * information nothing reads.
 */
import type { TimeOffWindow } from './types';
import { loadMetadata, saveMetadata } from '@/lib/storage/db';
import type { CacheEntry } from './driver';
import type { SearchSpace } from './submission';
import { availabilityKey, type Availability } from './availability';
import { milestonesKey, type Milestone } from './milestones';
import type { EffortTier, LegSummary } from './types';

const METADATA_KEY = 'chainSearchRun';
/** Unfinished runs moved aside when a different run took the slot, newest first. */
const INTERRUPTED_KEY = 'chainSearchInterrupted';
/** How many moved-aside runs are kept. Each can be a couple of MB plus its save. */
export const MAX_INTERRUPTED = 3;

/** Bumped whenever the shape below changes, or whenever a simulator change would make old cached
 *  durations wrong. A mismatched version discards the checkpoint rather than resuming onto numbers
 *  produced by different code — a silently stale cache is worse than no cache. */
const RECORD_VERSION = 1;

export interface SearchCheckpoint {
  version: number;
  /** Identifies the run's inputs. A checkpoint only resumes onto an identical fingerprint: the plan
   *  start, the player's TE and the final target all change every duration in the cache. */
  fingerprint: string;
  effort: EffortTier;
  seedChain: number[];
  bestChain: number[];
  bestSeconds: number;
  bestLegs: LegSummary[];
  /** `key,seconds` pairs — the cache, without per-leg detail. */
  durations: [string, number][];
  stage: string;
  detail: string;
  chainsDone: number;
  /** True once a run returned normally. The record is still useful - a higher effort tier
   *  replays its cache - but it must not be advertised as an unfinished run to resume. */
  complete: boolean;
  updatedAt: number;

  /**
   * The space an exhaustive run was enumerating, when it was one.
   *
   * ADDED FOR THE CRASH CASE, which is the only case the checkpoint exists for and the one it could
   * not actually finish. Everything needed to carry on was already here -- every priced duration,
   * the fingerprint proving they are still valid -- except the one thing nobody can reconstruct
   * from the outside: WHICH chains the run was working through. So after a crash the cache was
   * replayable in principle and unreachable in practice, because resuming meant retyping the bands
   * exactly and any difference started a different search.
   *
   * Optional and unversioned on purpose. A record written before this field is still a valid
   * record; it simply cannot offer to resume itself, which is what it could do before. Bumping
   * RECORD_VERSION to add it would have deleted the in-flight run of anyone who reloaded mid-search
   * on the release that introduced it -- the exact accident this field is meant to prevent.
   */
  space?: SearchSpace;

  /**
   * The stored save this run was priced under (search/runSaves.ts), when it has one. With it, a
   * resume hands the workers that exact payload, whatever save is loaded now. Optional: a record
   * written before this existed resumes the old way, onto a matching current save only.
   */
  inputsKey?: string;
}

/**
 * Everything that changes what a duration means. Used verbatim as the resume gate.
 *
 * The availability schedule belongs here — it delays every prestige and so changes every cached
 * duration — but it is APPENDED only when a schedule actually excludes something, so a run without
 * one produces the byte-identical fingerprint it always did and existing checkpoints still resume.
 * The key sorts its days, so reordering the checkboxes cannot invalidate a three-hour run. Dated
 * milestones are appended on the same terms and sorted for the same reason.
 */
export function fingerprintRun(args: {
  playerId: string;
  planStart: number;
  currentTE: number;
  final: number;
  forceContinue: boolean;
  availability?: Availability | null;
  milestones?: Milestone[] | null;
  deferShifts?: boolean;
  timeOff?: TimeOffWindow[] | null;
}): string {
  const parts = [args.playerId, args.planStart, args.currentTE, args.final, args.forceContinue ? 'fc' : 'auto'];
  const key = availabilityKey(args.availability);
  // `+shifts` only when a schedule is actually in force, so toggling it with no schedule set
  // cannot invalidate a checkpoint it could not have affected.
  if (key) parts.push(args.deferShifts ? `${key}+shifts` : key);
  const ms = milestonesKey(args.milestones);
  if (ms) parts.push(ms);
  // Only when set, so every checkpoint written before time off existed still matches.
  if (args.timeOff?.length) parts.push('off:' + args.timeOff.map(w => `${w.from}-${w.to}`).join(','));
  return parts.join('|');
}

/**
 * The plan start a fingerprint was written under, or null for one that does not parse.
 *
 * WHY THIS IS READ BACK OUT. With no start date set, the plan is timed from the moment the page
 * loaded, so a reload moved the start and the fingerprint with it. Every checkpoint and every
 * unfinished saved run then refused to resume -- after a crash, which is the one time resuming
 * matters. The start is not a setting the player chose, it is just a clock the run was priced
 * against, so resuming now puts THAT clock back (see the store's `pinPlanStart`) instead of refusing.
 */
export function fingerprintPlanStart(fp: string | undefined): number | null {
  const n = Number(fp?.split('|')[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The fingerprint with its plan start replaced: what `fp` would read had it been priced from `planStart`. */
export function withPlanStart(fp: string, planStart: number): string {
  const parts = fp.split('|');
  if (parts.length < 2) return fp;
  parts[1] = String(planStart);
  return parts.join('|');
}

/**
 * What differs between the inputs a run was priced under and the current ones, in words a player
 * can check against their save -- IGNORING the plan start, which resuming restores.
 *
 * Empty means the run can carry on. Anything else is a real reason its durations describe a
 * different problem, and "TE was 147, now 170" tells the player whether that is a stale backup or
 * their own edit; "the plan start, TE or schedule has changed" told them neither.
 */
export function fingerprintChanges(saved: string, current: string): string[] {
  const a = saved.split('|');
  const b = current.split('|');
  const out: string[] = [];
  if (a[0] !== b[0]) return ['it belongs to a different player'];
  if (a[2] !== b[2]) out.push(`TE was ${a[2]}, now ${b[2]}`);
  if (a[3] !== b[3]) out.push(`the final target was ${a[3]}, now ${b[3]}`);
  if (a[4] !== b[4]) out.push('the "keep going past the target" setting changed');
  return [...out, ...tailChanges(a, b)];
}

/**
 * Only the settings a stored save does NOT carry -- schedule, milestones, time off. A run that
 * carries on with its own save gets TE, target and plan start from that save; these three the
 * player has to put back, and they must be checked BEFORE the planner is switched to the old save.
 */
export function settingsChanges(saved: string, current: string): string[] {
  const a = saved.split('|');
  const b = current.split('|');
  if (a[0] !== b[0]) return ['it belongs to a different player'];
  return tailChanges(a, b);
}

function tailChanges(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const tail = (parts: string[], pick: (p: string) => boolean) => parts.slice(5).filter(pick).join('|');
  const isOff = (p: string) => p.startsWith('off:');
  const isMs = (p: string) => p.startsWith('ms');
  const isAvail = (p: string) => !isOff(p) && !isMs(p);
  if (tail(a, isAvail) !== tail(b, isAvail)) out.push('the availability schedule changed');
  if (tail(a, isMs) !== tail(b, isMs)) out.push('the TE milestones changed');
  if (tail(a, isOff) !== tail(b, isOff)) out.push('the time off changed');
  return out;
}

/**
 * Write a checkpoint, and NEVER let one go backwards.
 *
 * There is one checkpoint per fingerprint, so starting a second run on the same inputs used to
 * overwrite the first run's answer with its own starting point. Observed in the wild: a saved best
 * of `196 232 278 318 490` at 744.355 d was replaced by `195 226 277 317 490` at 752.975 d simply
 * because a new run began from the chain in the Target TE box. Eight and a half days of search,
 * silently discarded, while the 1172 priced chains that found it sat there in the same record.
 *
 * A checkpoint is a high-water mark, so this merges rather than replaces:
 *   - the better `bestChain` wins, and brings its own seconds and legs with it
 *   - `durations` are unioned, so priced chains are never lost either
 * `bestSeconds <= 0` means "no result yet" and can never win.
 */
export async function saveCheckpoint(partitionHash: string, record: SearchCheckpoint): Promise<void> {
  let merged = record;
  try {
    const prior = (await loadMetadata(partitionHash, METADATA_KEY)) as SearchCheckpoint | null;
    if (prior && prior.version === RECORD_VERSION && sameRun(prior, record)) {
      const priorWins = prior.bestSeconds > 0 && (record.bestSeconds <= 0 || prior.bestSeconds < record.bestSeconds);

      const durations = new Map<string, number>(prior.durations);
      for (const [key, seconds] of record.durations) durations.set(key, seconds);

      merged = {
        ...record,
        // Kept from whichever record has one. A merge that dropped the space would quietly turn a
        // resumable checkpoint back into an unresumable one on the next periodic write.
        ...((record.space ?? prior.space) ? { space: record.space ?? prior.space } : {}),
        ...((record.inputsKey ?? prior.inputsKey) ? { inputsKey: record.inputsKey ?? prior.inputsKey } : {}),
        bestChain: priorWins ? [...prior.bestChain] : record.bestChain,
        bestSeconds: priorWins ? prior.bestSeconds : record.bestSeconds,
        bestLegs: priorWins ? prior.bestLegs : record.bestLegs,
        durations: [...durations.entries()],
        chainsDone: Math.max(prior.chainsDone, record.chainsDone),
        complete: prior.complete || record.complete,
      };
    } else if (prior && prior.version === RECORD_VERSION && !prior.complete && prior.durations.length) {
      // A DIFFERENT run is taking the slot. This used to overwrite an unfinished one without a
      // word -- 39,904 priced chains gone the moment the next run wrote its first checkpoint.
      // If moving it aside fails, the write below must not happen either: throw instead.
      await setAside(partitionHash, prior).catch(e => {
        throw Object.assign(new Error('could not move the unfinished run aside'), { cause: e, setAside: true });
      });
    }
  } catch (e) {
    if ((e as { setAside?: boolean }).setAside) throw e;
    // A read failure must not stop the write. Losing the merge is survivable; losing the
    // checkpoint entirely is what this whole module exists to prevent.
  }
  await saveMetadata(partitionHash, METADATA_KEY, merged);
}

/**
 * Whether two records are the same run, whose caches may be merged. Same fingerprint, and -- when
 * both know it -- the same stored save: two saves at the same TE are two different farms.
 */
function sameRun(a: SearchCheckpoint, b: SearchCheckpoint): boolean {
  if (a.fingerprint !== b.fingerprint) return false;
  return !a.inputsKey || !b.inputsKey || a.inputsKey === b.inputsKey;
}

async function setAside(partitionHash: string, record: SearchCheckpoint): Promise<void> {
  const list = await listInterrupted(partitionHash);
  const rest = list.filter(r => !sameRun(r, record));
  await saveMetadata(partitionHash, INTERRUPTED_KEY, [record, ...rest].slice(0, MAX_INTERRUPTED));
}

/** Unfinished runs a later run moved out of the slot, newest first. */
export async function listInterrupted(partitionHash: string): Promise<SearchCheckpoint[]> {
  const raw = (await loadMetadata(partitionHash, INTERRUPTED_KEY)) as SearchCheckpoint[] | null;
  return Array.isArray(raw) ? raw.filter(r => r && r.version === RECORD_VERSION) : [];
}

/**
 * Put a moved-aside run back in the slot so it can carry on. Whatever unfinished run is in the slot
 * now goes into the list in its place (via `saveCheckpoint`), so swapping never loses either.
 */
export async function restoreInterrupted(partitionHash: string, index: number): Promise<SearchCheckpoint | null> {
  const list = await listInterrupted(partitionHash);
  const picked = list[index];
  if (!picked) return null;
  // Slot first, THEN out of the list: a failed write leaves it listed rather than nowhere. The
  // write may itself move the slot's run into the list, so remove by identity, not position.
  await saveCheckpoint(partitionHash, picked);
  const after = await listInterrupted(partitionHash);
  await saveMetadata(
    partitionHash,
    INTERRUPTED_KEY,
    after.filter(r => !(sameRun(r, picked) && r.updatedAt === picked.updatedAt))
  );
  return picked;
}

export async function discardInterrupted(partitionHash: string, index: number): Promise<void> {
  const list = await listInterrupted(partitionHash);
  await saveMetadata(
    partitionHash,
    INTERRUPTED_KEY,
    list.filter((_, i) => i !== index)
  );
}

export async function loadCheckpoint(partitionHash: string, fingerprint: string): Promise<SearchCheckpoint | null> {
  const raw = await loadAnyCheckpoint(partitionHash);
  if (!raw || raw.fingerprint !== fingerprint) return null;
  return raw;
}

/** The checkpoint whatever its fingerprint, for the caller to compare with `fingerprintChanges`:
 *  an unfinished run that CANNOT resume should say why rather than silently not appear. */
export async function loadAnyCheckpoint(partitionHash: string): Promise<SearchCheckpoint | null> {
  const raw = (await loadMetadata(partitionHash, METADATA_KEY)) as SearchCheckpoint | null;
  if (!raw || raw.version !== RECORD_VERSION) return null;
  return raw;
}

export async function clearCheckpoint(partitionHash: string): Promise<void> {
  await saveMetadata(partitionHash, METADATA_KEY, null);
}

/** Build the record to persist. `entries` is the driver's whole cache; legs are dropped for
 *  everything except the best chain (see the module comment). */
export function buildCheckpoint(args: {
  fingerprint: string;
  effort: EffortTier;
  seedChain: number[];
  bestChain: number[];
  bestSeconds: number;
  entries: CacheEntry[];
  stage: string;
  detail: string;
  chainsDone: number;
  complete?: boolean;
  space?: SearchSpace | null;
  inputsKey?: string | null;
}): SearchCheckpoint {
  const bestKey = args.bestChain.join(',');
  return {
    version: RECORD_VERSION,
    fingerprint: args.fingerprint,
    effort: args.effort,
    seedChain: [...args.seedChain],
    bestChain: [...args.bestChain],
    bestSeconds: args.bestSeconds,
    bestLegs: args.entries.find(e => e.key === bestKey)?.legs ?? [],
    durations: args.entries.map(e => [e.key, e.seconds] as [string, number]),
    stage: args.stage,
    detail: args.detail,
    chainsDone: args.chainsDone,
    complete: args.complete ?? false,
    updatedAt: Date.now(),
    ...(args.space ? { space: args.space } : {}),
    ...(args.inputsKey ? { inputsKey: args.inputsKey } : {}),
  };
}

/** Turn a checkpoint's flat `durations` back into driver cache entries. Legs come back empty for
 *  every chain but the best one, which is all the driver needs — it only reads `legs` for the chain
 *  it finally returns, and any chain it re-visits it will simply find already priced. */
export function restoreEntries(record: SearchCheckpoint): CacheEntry[] {
  const bestKey = record.bestChain.join(',');
  return record.durations.map(([key, seconds]) => ({
    key,
    seconds,
    legs: key === bestKey ? record.bestLegs : [],
  }));
}
