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
 * unfinished run refers to it (`pruneRunSaves`). It never leaves the browser -- not in the CSV,
 * not in a submission.
 *
 * Keyed by a hash of the payload, so the many runs of one session on one save share one copy.
 */
import { loadMetadata, saveMetadata } from '@/lib/storage/db';
import { sanitizeLongs } from '@/lib/artifacts/utils';
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
}

/**
 * JSON with the numbers JSON cannot carry. `saveMetadata` stores through a JSON round-trip, which
 * would turn an Infinity anywhere in the context into null -- a different input, silently.
 */
function encode(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? { __num: String(v) } : v));
}
function decode<T>(text: string): T {
  return JSON.parse(text, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.__num === 'string'
      ? Number(v.__num)
      : v
  ) as T;
}

/**
 * The key a payload is stored under. Leaves out the two context fields the workers overwrite per
 * leg (see SearchInputs.context), which are stamped from the clock at load and would otherwise
 * give the same save a new key on every visit.
 */
export function runSaveKey(inputs: SearchInputs): string {
  const plain = sanitizeLongs(inputs) as SearchInputs;
  const context: Record<string, unknown> = { ...(plain.context as unknown as Record<string, unknown>) };
  delete context.ascensionStartTime;
  delete context.planStartOffset;
  return hash53(encode({ ...plain, context }));
}

/** cyrb53: a fast 53-bit string hash. Synchronous on purpose -- the key is compared in the same
 *  tick as the in-memory cache it guards. Not cryptographic, and does not need to be. */
function hash53(text: string): string {
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
  const index = await listRunSaves(partitionHash);
  const known = index.find(s => s.key === key);
  if (known) return known;
  const rawBackup = inputs.context.rawBackup as { approxTime?: number } | null | undefined;
  const summary: RunSaveSummary = {
    key,
    savedAt: Date.now(),
    te: inputs.currentTE,
    backupAt: typeof rawBackup?.approxTime === 'number' ? rawBackup.approxTime : 0,
  };
  // Body first, then the index: a quota failure leaves an orphan nothing lists, not a listed save
  // that cannot be read.
  await saveMetadata(partitionHash, BODY_PREFIX + key, encode(sanitizeLongs(inputs)));
  await saveMetadata(partitionHash, INDEX_KEY, [summary, ...index]);
  return summary;
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

/** Drop every stored save no unfinished run refers to. */
export async function pruneRunSaves(partitionHash: string, keep: Set<string>, now = Date.now()): Promise<void> {
  const index = await listRunSaves(partitionHash);
  // Anything stored in the last quarter hour is kept regardless: a run in ANOTHER tab stores its
  // save at start but only names it in a checkpoint on its first write, and this tab cannot see it.
  const fresh = (s: RunSaveSummary) => now - s.savedAt < 15 * 60_000;
  const kept = index.filter(s => keep.has(s.key) || fresh(s));
  if (kept.length === index.length) return;
  await saveMetadata(partitionHash, INDEX_KEY, kept);
  for (const s of index) if (!kept.includes(s)) await saveMetadata(partitionHash, BODY_PREFIX + s.key, null);
}
