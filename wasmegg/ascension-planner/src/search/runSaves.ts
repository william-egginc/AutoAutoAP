/**
 * The exact inputs a run was priced under -- the save, research, gear, farm state, plan start and
 * schedule -- kept in this browser so an interrupted run can carry on under THOSE, not under
 * whatever save happens to be loaded now.
 *
 * WHY THE WHOLE THING AND NOT A FINGERPRINT. The run fingerprint (persistence.ts) is a handful of
 * numbers: TE, target, plan start, schedule. Two saves at the same TE can still differ in egg
 * progress, silo time, research or gear, and a resume across them silently prices half a run on
 * one farm and half on another. Keeping the workers' own payload makes the match exact by
 * construction: a resumed run's workers are handed the very object the first half's were.
 *
 * TEMPORARY BY DESIGN. A stored save only exists to finish a run, so it is dropped as soon as no
 * unfinished run (or the last finished result of each kind, or a run running in any tab) refers to
 * it (`pruneRunSaves`). Saved answers and saved runs keep their save for good in keptSaves.ts
 * instead. It never leaves the browser -- not in the CSV, not in a submission.
 *
 * Keyed by a hash of the payload, so the many runs of one session on one save share one copy.
 */
import { loadMetadata, saveMetadata } from '@/lib/storage/db';
// workerCopy: sanitizeLongs's copy read under the store proxies (spec-mainfreeze): the same result, without the traps.
import { workerCopy } from './workerCopy';
import type { SearchInputs } from './types';

const INDEX_KEY = 'chainSearchRunSaveIndex';
const BODY_PREFIX = 'chainSearchRunSave:';

/** What the panels show about a stored save without loading it. */
export interface RunSaveSummary {
  key: string;
  savedAt: number;
  /** TE the run searched from (pending TE rolled in). */
  te: number;
  /** When the game took the save, unix seconds; 0 when it carries none. */
  backupAt: number;
  /** Whose save it is: a hash of the game's own user id (`accountOf`). Absent on older saves. */
  account?: string;
}

/**
 * The account a save belongs to, as a short hash of the game's own user id in it (never the id
 * itself). '' when the save has none. What an unfinished run is checked against before it is
 * offered: the player id in the box can disagree with the save actually loaded, and a run carrying
 * on with its own save skips the TE check -- so another account's run could be offered and carried
 * on (Kelli's account showed someone else's run, 30 Sept).
 */
export function accountOf(rawBackup: unknown): string {
  const b = rawBackup as { eiUserId?: string | null; userId?: string | null } | null | undefined;
  const id = String(b?.eiUserId || b?.userId || '').trim();
  return id ? hash53(`account:${id}`) : '';
}

/**
 * JSON with the numbers JSON cannot carry. `saveMetadata` stores through a JSON round-trip, which
 * would turn an Infinity anywhere in the context into null -- a different input, silently.
 */
export function encode(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? { __num: String(v) } : v));
}
/** `encode`'s numbers back (a JSON.parse reviver). */
export function reviveNumbers(_k: string, v: unknown): unknown {
  return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { __num?: unknown }).__num === 'string'
    ? Number((v as { __num: string }).__num)
    : v;
}
export function decode<T>(text: string): T {
  return JSON.parse(text, reviveNumbers) as T;
}

/**
 * The key a payload is stored under. Leaves out the two context fields the workers overwrite per
 * leg (see SearchInputs.context), which are stamped from the clock at load and would otherwise
 * give the same save a new key on every visit.
 */
export function runSaveKey(inputs: SearchInputs): string {
  const plain = workerCopy(inputs) as SearchInputs;
  const context: Record<string, unknown> = { ...(plain.context as unknown as Record<string, unknown>) };
  delete context.ascensionStartTime;
  delete context.planStartOffset;
  return hash53(encode({ ...plain, context }));
}

/** cyrb53: a fast 53-bit string hash. Synchronous on purpose -- the key is compared in the same
 *  tick as the in-memory cache it guards. Not cryptographic, and does not need to be. */
export function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '-' + text.length.toString(36);
}

export async function listRunSaves(partitionHash: string): Promise<RunSaveSummary[]> {
  const raw = (await loadMetadata(partitionHash, INDEX_KEY)) as RunSaveSummary[] | null;
  return Array.isArray(raw) ? raw : [];
}

/** Store the payload a run is about to be priced under. Returns its key; a copy already there is kept. */
export async function saveRunInputs(
  partitionHash: string,
  inputs: SearchInputs,
  /** Pass the key already computed for these inputs: hashing a multi-MB payload twice is waste. */
  knownKey?: string
): Promise<RunSaveSummary> {
  const key = knownKey ?? runSaveKey(inputs);
  // All under the index lock, the index read inside it: another tab may store or prune at the same
  // time, and a copy of the index read outside could be written back over its change (or found
  // "already there" just before a prune there deleted it).
  return withIndexLock(partitionHash, async () => {
    const index = await listRunSaves(partitionHash);
    const known = index.find(s => s.key === key);
    if (known) return known;
    const rawBackup = inputs.context.rawBackup as { approxTime?: number } | null | undefined;
    const summary: RunSaveSummary = {
      key,
      savedAt: Date.now(),
      te: inputs.currentTE,
      backupAt: typeof rawBackup?.approxTime === 'number' ? rawBackup.approxTime : 0,
      ...(accountOf(rawBackup) ? { account: accountOf(rawBackup) } : {}),
    };
    // Body first, then the index: a quota failure leaves an orphan nothing lists, not a listed save
    // that cannot be read.
    await saveMetadata(partitionHash, BODY_PREFIX + key, encode(workerCopy(inputs)));
    await saveMetadata(partitionHash, INDEX_KEY, [summary, ...index]);
    return summary;
  });
}

export async function loadRunInputs(partitionHash: string, key: string): Promise<SearchInputs | null> {
  const text = (await loadMetadata(partitionHash, BODY_PREFIX + key)) as string | null;
  if (typeof text !== 'string') return null;
  try {
    return decode<SearchInputs>(text);
  } catch {
    return null;
  }
}

/**
 * PRUNING SEES EVERY TAB'S RUNS, NOT ONLY THIS ONE'S. The keep-list the store builds is what this
 * browser has written down (checkpoints, moved-aside runs, saved runs, pending sends) plus the run in
 * progress in THIS tab, which it knows from memory. A run in another tab stores its save when it
 * starts, but names it in a checkpoint only on its first write, and a long run's writes are spaced
 * out; until then nothing in storage refers to it, and a prune here would delete the save from under
 * it. So a running run also holds a shared Web Lock named after its save (`holdRunSave`), and a
 * prune asks the browser which of those are held in any tab of this site (`liveRunSaveKeys`). A tab
 * that crashes or is closed drops its locks with it, so nothing stale is kept.
 *
 * The quarter-hour window stays as the fallback for browsers without `navigator.locks`.
 */
const LOCK_PREFIX = 'ascension-planner:run-save:';
const runSaveLock = (partitionHash: string, key: string) => `${LOCK_PREFIX}${partitionHash}:${key}`;

function lockManager(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManager }).locks;
}

/** Mark a stored save as in use by a run in this tab until the returned release is called. Shared,
 *  so two tabs on one save both hold it. Best-effort: without Web Locks it does nothing. */
export function holdRunSave(partitionHash: string, key: string): () => void {
  const locks = lockManager();
  if (!locks || !key) return () => {};
  let release: () => void = () => {};
  let released = false;
  try {
    void locks
      .request(
        runSaveLock(partitionHash, key),
        { mode: 'shared' },
        () =>
          new Promise<void>(resolve => {
            release = resolve;
            if (released) resolve();
          })
      )
      .catch(() => {});
  } catch {
    return () => {};
  }
  return () => {
    released = true;
    release();
  };
}

/** The saves a run in any tab of this site is using now (held or still being granted). */
export async function liveRunSaveKeys(partitionHash: string): Promise<Set<string>> {
  const live = new Set<string>();
  const locks = lockManager();
  if (!locks) return live;
  try {
    const snap = await locks.query();
    const prefix = `${LOCK_PREFIX}${partitionHash}:`;
    for (const l of [...(snap.held ?? []), ...(snap.pending ?? [])])
      if (l.name?.startsWith(prefix)) live.add(l.name.slice(prefix.length));
  } catch {
    /* No answer: the quarter-hour window is all there is. */
  }
  return live;
}

/** One tab at a time reads and rewrites the index, so two tabs' writes don't undo each other. */
async function withIndexLock<T>(partitionHash: string, fn: () => Promise<T>): Promise<T> {
  const locks = lockManager();
  if (!locks) return fn();
  return locks.request(`ascension-planner:run-save-index:${partitionHash}`, fn) as Promise<T>;
}

/** Drop every stored save no unfinished run refers to, in this tab or any other. */
export async function pruneRunSaves(partitionHash: string, keep: Set<string>, now = Date.now()): Promise<void> {
  // Anything stored in the last quarter hour is kept regardless: the fallback for a browser that
  // cannot say which saves other tabs' runs hold (see above).
  const fresh = (s: RunSaveSummary) => now - s.savedAt < 15 * 60_000;
  await withIndexLock(partitionHash, async () => {
    // Asked inside the lock: a run that takes its save's lock before storing it (as the store does)
    // is then either seen here, or stores after this prune and puts its save back.
    const live = await liveRunSaveKeys(partitionHash);
    const index = await listRunSaves(partitionHash);
    const kept = index.filter(s => keep.has(s.key) || live.has(s.key) || fresh(s));
    if (kept.length === index.length) return;
    await saveMetadata(partitionHash, INDEX_KEY, kept);
    for (const s of index) if (!kept.includes(s)) await saveMetadata(partitionHash, BODY_PREFIX + s.key, null);
  });
}
