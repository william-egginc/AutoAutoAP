/**
 * @module runLibrary
 * @description Named, reloadable chain-search runs, the way the plan library holds plans.
 *
 * WHAT THIS IS NOT. `persistence.ts` already checkpoints a run, but to ONE slot
 * (`METADATA_KEY = 'chainSearchRun'`) that only resumes onto an identical fingerprint. Change the
 * target TE, the plan start, or your current TE, and it is unusable. Finish a search, start a
 * different one, and the first is gone except whatever CSV was downloaded. That is a crash guard,
 * not a history.
 *
 * This keeps runs deliberately, under names, and reloads any of them at any time.
 *
 * WHAT IS STORED, AND THE SIZE PROBLEM. The valuable thing is the chain -> duration cache: every
 * entry is roughly fifteen seconds of CPU. It is also the big thing -- an 11,000-chain run is
 * megabytes. So the index is kept separately from the bodies: listing the library reads one small
 * record, and a run's cache is only loaded when it is opened. The library is capped by count and
 * the oldest is evicted, because the alternative is discovering the quota is full at the end of a
 * three-hour run.
 *
 * Per-leg summaries: the checkpoint in `persistence.ts` keeps them for the best chain only, because keeping
 * them for every cached chain multiplies the record by about six. A saved run is different: `saveRun` stores
 * the entries as they are in memory at that moment, so it keeps leg detail for whatever the 'Keep per-ascension
 * detail for N routes' limit (search/legBudget.ts) still held; routes past the limit are saved without it.
 */
import { loadMetadata, saveMetadata } from '@/lib/storage/db';
import type { CacheEntry } from './driver';
import type { SearchSpace } from './submission';
import type { EffortTier, LegSummary } from './types';

const INDEX_KEY = 'chainSearchLibraryIndex';
const BODY_PREFIX = 'chainSearchLibraryRun:';

/** Bumped when the shape below changes, or when a simulator change would make cached durations
 *  wrong. A mismatched entry is dropped rather than reloaded onto numbers from different code.
 *
 *  2: `space` and `fingerprint`, so an unfinished run can be PICKED BACK UP rather than only
 *     looked at. Purely additive -- a version 1 run is still a valid run that happens to carry
 *     neither, which is why `READABLE_VERSIONS` exists instead of this number being the filter. */
export const LIBRARY_VERSION = 2;

/**
 * Versions `listRuns` will still show.
 *
 * NOT just `LIBRARY_VERSION`, and the difference is somebody's afternoon. The index filtered on an
 * exact match, so bumping the number would have silently emptied every existing library -- the
 * failure mode being a list that is simply blank, with no way to tell a lost run from a run nobody
 * saved. Version 2 adds optional fields to version 1 and changes nothing about the entries, so a
 * version 1 run opens exactly as it always did; it just cannot offer Resume, because it never
 * recorded what it was searching.
 */
const READABLE_VERSIONS = new Set([1, 2]);

/** Runs kept per player. Past this the oldest is evicted on save. */
export const MAX_RUNS = 20;

/** What the list shows, and all that is read to render it. */
export interface RunSummary {
  id: string;
  version: number;
  label: string;
  savedAt: number;
  currentTE: number;
  finalTE: number;
  effort: EffortTier | string;
  seedChain: number[];
  bestChain: number[];
  bestDays: number;
  chainsPriced: number;
  /** Whether the run reached the end of its tier, for the list to say so without opening it. */
  complete: boolean;

  /**
   * The space an exhaustive run was enumerating. Absent on a staged run, which has no stated space,
   * and on anything saved before version 2.
   *
   * Kept in the SUMMARY rather than the body, because the list needs it to decide whether a run can
   * be resumed at all, and loading a multi-megabyte body to grey out a button would defeat the
   * point of splitting them.
   */
  space?: SearchSpace;

  /**
   * The run fingerprint its durations were measured under -- plan start, current TE, target,
   * availability, shift handling and the rest.
   *
   * THIS IS WHAT MAKES RESUME SAFE. A cached duration is only meaningful against the inputs that
   * produced it, and every one of those inputs is editable between saving a run and reopening it.
   * Without the fingerprint, resuming after nudging the plan start by an hour would silently mix
   * chains priced under two different clocks into one ranking, and the result would look completely
   * ordinary. With it, the mismatch is detectable and the panel can say so.
   */
  fingerprint?: string;

  /** The stored save it was priced under (search/runSaves.ts), kept while the run is unfinished so
   *  Resume can carry on with that exact save. Optional and additive, like `space`. */
  inputsKey?: string;

  /**
   * The save the run was priced from, kept in this browser for as long as the run is saved
   * (search/keptSaves.ts), unlike `inputsKey`'s, which goes when the run finishes. `null`: saved when
   * that save was no longer here. Absent: saved before saves were kept (10 Oct 2026). Additive.
   */
  save?: import('./keptSaves').EntrySave | null;

  /** The player's note on the run (submission.ts `cleanNote`). Optional and additive. */
  runNote?: string;
  /** The settings the run started with (stores/chainSearch.ts `RunSettings`), so sending or
   *  downloading it after opening labels it with ITS hours and options. Optional and additive. */
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
}

/** The body, loaded only when a run is opened. */
export interface RunBody {
  version: number;
  entries: CacheEntry[];
  bestLegs: LegSummary[];
  /** The verbose stage log, so a reloaded run can still explain what it did. */
  runLog: string[];
}

export interface SaveRunInput {
  label: string;
  currentTE: number;
  finalTE: number;
  effort: EffortTier | string;
  seedChain: number[];
  bestChain: number[];
  bestDays: number;
  entries: CacheEntry[];
  bestLegs: LegSummary[];
  runLog: string[];
  complete: boolean;
  space?: SearchSpace;
  fingerprint?: string;
  inputsKey?: string;
  save?: RunSummary['save'];
  runNote?: string;
  settings?: RunSummary['settings'];
  /** Injectable so tests are not clock-dependent. */
  now?: number;
  /** Injectable for the same reason; ids are otherwise random (or the same run's, saved again). */
  id?: string;
  /** A name was typed for it: a re-save of the same run takes it (else keeps the name it had). */
  named?: boolean;
}

function bodyKey(id: string): string {
  return `${BODY_PREFIX}${id}`;
}

/**
 * Which saved runs are the same run (red team R7, 31 Oct 2026: "Save this run" three times listed it three times, and
 * 25 clicks pushed every other run out past the cap). The same rule as Saved answers (lib/savedAnswerIdentity.ts):
 * the same kind of search (Fast, Exact, ...; Custom with the same boxes), the same target and route, the same save
 * (the stored save's key, else when the game took it) and the same inputs (the fingerprint: plan start, TE, schedule).
 * Null for a run without a route (never merged).
 *
 * Following is per goal and route (stores/follow.ts), not per entry, so dropping a duplicate never loses a
 * Following ✓: the entry kept names the same goal and route.
 */
export function runIdentity(
  r:
    | Pick<RunSummary, 'finalTE' | 'effort' | 'bestChain' | 'space' | 'fingerprint' | 'inputsKey' | 'save'>
    | null
    | undefined
): string | null {
  if (!r || !r.bestChain?.length) return null;
  // The boxes a Custom run searched, without how far it got (a run carried on is still that run).
  const space = r.space
    ? JSON.stringify([r.space.mode, r.space.bands, r.space.minGap, r.space.minAscensions, r.space.maxAscensions])
    : '';
  const save = r.inputsKey || (r.save?.backupAt ? String(r.save.backupAt) : '');
  return [
    r.space ? 'custom' : 'smart',
    r.effort,
    space,
    r.finalTE,
    r.bestChain.join(' '),
    save,
    r.fingerprint ?? '',
  ].join('|');
}

/** `a` is the one to keep over `b`: finished, else more routes priced, else it has its save, else saved first. */
function betterRun(a: RunSummary, b: RunSummary): boolean {
  if (a.complete !== b.complete) return a.complete;
  if (a.chainsPriced !== b.chainsPriced) return a.chainsPriced > b.chainsPriced;
  if (!!a.save !== !!b.save) return !!a.save;
  return a.savedAt < b.savedAt;
}

/**
 * Each run once: of the entries for one run, the best (`betterRun`) is kept under the name the first saved one has;
 * the others are `dropped`. The list keeps its order.
 */
export function collapseRuns(list: readonly RunSummary[]): { kept: RunSummary[]; dropped: RunSummary[] } {
  const keeper = new Map<string, RunSummary>();
  const firstLabel = new Map<string, { label: string; savedAt: number }>();
  for (const r of list) {
    const k = runIdentity(r);
    if (k === null) continue;
    const cur = keeper.get(k);
    if (!cur || betterRun(r, cur)) keeper.set(k, r);
    const first = firstLabel.get(k);
    if (!first || r.savedAt < first.savedAt) firstLabel.set(k, { label: r.label, savedAt: r.savedAt });
  }
  const kept: RunSummary[] = [];
  const dropped: RunSummary[] = [];
  for (const r of list) {
    const k = runIdentity(r);
    if (k === null) kept.push(r);
    else if (keeper.get(k) === r) {
      const label = firstLabel.get(k)!.label;
      kept.push(label === r.label ? r : { ...r, label });
    } else dropped.push(r);
  }
  return { kept, dropped };
}

/** Newest first. Drops entries from an older version rather than showing something unopenable. Each run once
 *  (`collapseRuns`): duplicates kept before 1 Nov 2026 are removed here, index and bodies. */
export async function listRuns(partitionHash: string): Promise<RunSummary[]> {
  const raw = (await loadMetadata(partitionHash, INDEX_KEY)) as RunSummary[] | null;
  if (!Array.isArray(raw)) return [];
  const readable = raw.filter(r => r && READABLE_VERSIONS.has(r.version)).sort((a, b) => b.savedAt - a.savedAt);
  const { kept, dropped } = collapseRuns(readable);
  if (dropped.length) {
    for (const r of dropped) await saveMetadata(partitionHash, bodyKey(r.id), null);
    await saveMetadata(partitionHash, INDEX_KEY, [
      ...kept,
      ...raw.filter(r => !(r && READABLE_VERSIONS.has(r.version))),
    ]);
  }
  return kept;
}

/**
 * Save a run under a name and return its summary.
 *
 * Writes the body FIRST, then the index. If the quota blows partway, the worst case is an orphaned
 * body that nothing lists, rather than an index entry pointing at a run that cannot be opened.
 */
export async function saveRun(partitionHash: string, input: SaveRunInput): Promise<RunSummary> {
  const existing = await listRuns(partitionHash);
  // The same run saved again (`runIdentity`) replaces its entry, under its id and name unless a name is typed
  // (`named`), saved now: never a second row, so repeated saves can't push other runs out past the cap.
  const key = runIdentity(input);
  const same = key === null ? undefined : existing.find(r => runIdentity(r) === key && r.id !== input.id);
  const id = input.id ?? same?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const label = same && !input.named ? same.label : input.label;
  const save = input.save ?? same?.save ?? input.save;
  const priced = input.entries.filter(e => e.seconds > 0);

  const body: RunBody = {
    version: LIBRARY_VERSION,
    entries: priced,
    bestLegs: input.bestLegs,
    runLog: input.runLog,
  };
  await saveMetadata(partitionHash, bodyKey(id), body);

  const summary: RunSummary = {
    id,
    version: LIBRARY_VERSION,
    label: label.trim().slice(0, 80) || 'Untitled run',
    savedAt: input.now ?? Date.now(),
    currentTE: input.currentTE,
    finalTE: input.finalTE,
    effort: input.effort,
    seedChain: [...input.seedChain],
    bestChain: [...input.bestChain],
    bestDays: input.bestDays,
    chainsPriced: priced.length,
    complete: input.complete,
    // Spread so an absent space leaves the key off rather than storing `undefined`, which
    // `structuredClone` into IndexedDB would keep as a present-but-empty field.
    ...(input.space ? { space: input.space } : {}),
    ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    ...(input.inputsKey ? { inputsKey: input.inputsKey } : {}),
    ...(save !== undefined ? { save } : {}),
    ...(input.runNote ? { runNote: input.runNote } : {}),
    ...(input.settings ? { settings: input.settings } : {}),
  };

  // A re-save under the same id replaces rather than duplicates; so does the same run under another id.
  const next = [summary, ...existing.filter(r => r.id !== id && r !== same)];
  if (same && same.id !== id) await saveMetadata(partitionHash, bodyKey(same.id), null);

  // Evict oldest past the cap, and delete their bodies too. An index that forgets a run while its
  // megabytes stay in IndexedDB is how a quota fills up with nothing to show for it.
  const kept = next.slice(0, MAX_RUNS);
  for (const dropped of next.slice(MAX_RUNS)) {
    await saveMetadata(partitionHash, bodyKey(dropped.id), null);
  }
  await saveMetadata(partitionHash, INDEX_KEY, kept);
  return summary;
}

/** The body for a saved run, or null when it is missing or from an older version. */
export async function loadRun(partitionHash: string, id: string): Promise<RunBody | null> {
  const raw = (await loadMetadata(partitionHash, bodyKey(id))) as RunBody | null;
  // Same READABLE_VERSIONS rule as the index. An exact-match check here would have made every
  // existing run open to nothing the moment the version was bumped -- the index would list them and
  // clicking one would silently do nothing, which is worse than not listing them at all.
  if (!raw || !READABLE_VERSIONS.has(raw.version) || !Array.isArray(raw.entries)) return null;
  return raw;
}

/** Remove a run and its body. Safe to call for an id that is already gone. */
export async function deleteRun(partitionHash: string, id: string): Promise<void> {
  await saveMetadata(partitionHash, bodyKey(id), null);
  const existing = await listRuns(partitionHash);
  await saveMetadata(
    partitionHash,
    INDEX_KEY,
    existing.filter(r => r.id !== id)
  );
}

/** A default name, so saving does not require thinking of one: `490 TE · 6 asc · 741.9 d`. */
export function defaultRunLabel(finalTE: number, bestChain: number[], bestDays: number): string {
  const asc = bestChain.length ? `${bestChain.length} asc` : 'no result';
  const days = bestDays > 0 ? `${bestDays.toFixed(1)} d` : 'unpriced';
  return `${finalTE} TE · ${asc} · ${days}`;
}
