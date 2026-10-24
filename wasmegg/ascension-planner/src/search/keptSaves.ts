/**
 * The saves that Saved answers (By a date) and Saved runs (Fastest route) were priced from, kept in
 * this browser for as long as an entry refers to them.
 *
 * WHY. The game only ever serves the CURRENT save. Once the player prestiges, the save an answer was
 * priced from is gone for good, so a saved answer could be looked at but never simulated, checked or
 * searched from again. On 9 Oct the user lost exactly that for a 19.5 h run. Each saved entry now
 * names the save it was priced from (`EntrySave`), and the save itself is kept here.
 *
 * NOT runSaves.ts. That store keeps a run's whole worker payload (save, research, schedule) only
 * while an unfinished run needs it, keyed by the payload, so it is dropped as soon as the run ends.
 * This one keeps only the game's backup, keyed by the backup itself, so the many answers and runs
 * priced from one save share one copy whatever their settings, and it stays while any saved entry
 * names it. It is the FULL backup the planner loads (`initPlanFuture`), not the trimmed copy the
 * workers get (workerBackup.ts): Your plan, Simulate this plan and a new search all need all of it.
 *
 * SIZE. A real save is about 1.4 MB of JSON (most of it the artifact database and the contract
 * archive) and about 150 KB gzipped, which is how it is stored. At most MAX_KEPT_SAVES saves and
 * MAX_KEPT_BYTES are kept; past either, the save whose newest entry is oldest is dropped first, and
 * its entries say so (they still open: only "Use the save" goes).
 *
 * Plain data in IndexedDB (lib/storage/db.ts): one small index record, and one record per save
 * holding the gzipped bytes (no JSON round-trip, which an ArrayBuffer does not survive).
 */
import type { ei } from 'lib';
import { loadMetadata, putMetadataRecords } from '@/lib/storage/db';
import { sanitizeLongs } from '@/lib/artifacts/utils';
import { accountOf, decode, encode, hash53 } from './runSaves';

const INDEX_KEY = 'keptSaveIndex';
const BODY_PREFIX = 'keptSave:';

/** Saved answers (20) + saved runs (20) could name 40 saves; in practice a handful. */
export const MAX_KEPT_SAVES = 30;
/** Gzipped bytes, all kept saves together. About 200 saves of a typical account: the count binds first. */
export const MAX_KEPT_BYTES = 40 * 1024 * 1024;
/** A save kept in the last quarter hour stays even with no entry naming it yet: another tab may be
 *  between keeping it and writing the entry (the same rule as runSaves' `pruneRunSaves`). */
const FRESH_MS = 15 * 60_000;

/** What a saved entry records about its save. */
export interface EntrySave {
  key: string;
  /** The TE the entry was priced from. */
  te: number;
  /** When the game took the save, unix seconds (0 when it carries none). */
  backupAt: number;
}

/** The index's line for one kept save: enough to list it without reading the bytes. */
export interface KeptSaveSummary extends EntrySave {
  keptAt: number;
  /** `accountOf` the save: a hash, never the game's id. Absent when the save has none. */
  account?: string;
  /** Stored (gzipped) size, and the JSON's size, in bytes. */
  bytes: number;
  rawBytes: number;
}

interface Body {
  /** Gzipped JSON (`encode`), or the JSON itself where the browser has no CompressionStream. */
  gz?: ArrayBuffer;
  text?: string;
}

/** The backup as the file and the store hold it: plain JSON, Longs as numbers, Infinity kept. */
export function backupText(raw: unknown): string {
  return encode(sanitizeLongs(raw));
}

/** A save's key: the same backup always gets the same one, whoever keeps it. */
export function keptSaveKey(text: string): string {
  return hash53(`save:${text}`);
}

async function gzip(text: string): Promise<ArrayBuffer | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
async function gunzip(bytes: ArrayBuffer): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function listKeptSaves(partitionHash: string): Promise<KeptSaveSummary[]> {
  const raw = (await loadMetadata(partitionHash, INDEX_KEY)) as KeptSaveSummary[] | null;
  return Array.isArray(raw) ? raw.filter(s => s && typeof s.key === 'string') : [];
}

/**
 * Keep `raw` (the game's backup) and return its summary; one already kept is returned as it is.
 * `te` is the TE the entry was priced from (pending TE rolled in), which the backup alone does not say.
 */
export async function keepSave(
  partitionHash: string,
  raw: unknown,
  te: number,
  now = Date.now()
): Promise<KeptSaveSummary> {
  const text = backupText(raw);
  const key = keptSaveKey(text);
  const index = await listKeptSaves(partitionHash);
  const known = index.find(s => s.key === key);
  if (known) return known;
  const gz = await gzip(text);
  const at = (raw as { approxTime?: number } | null)?.approxTime;
  const account = accountOf(raw);
  const summary: KeptSaveSummary = {
    key,
    te,
    backupAt: typeof at === 'number' && Number.isFinite(at) ? at : 0,
    keptAt: now,
    ...(account ? { account } : {}),
    bytes: gz ? gz.byteLength : text.length,
    rawBytes: text.length,
  };
  const body: Body = gz ? { gz } : { text };
  // One transaction: a listed save is always readable, and a failed write lists nothing.
  await putMetadataRecords(partitionHash, [
    { key: BODY_PREFIX + key, value: body, raw: true },
    { key: INDEX_KEY, value: [summary, ...index] },
  ]);
  return summary;
}

/** The kept backup, ready for `initPlanFuture`, or null when it is not (or no longer) here. */
export async function loadKeptSave(partitionHash: string, key: string): Promise<ei.IBackup | null> {
  const body = (await loadMetadata(partitionHash, BODY_PREFIX + key)) as Body | null;
  if (!body) return null;
  try {
    const text = body.gz ? await gunzip(body.gz) : body.text;
    return typeof text === 'string' ? decode<ei.IBackup>(text) : null;
  } catch {
    return null;
  }
}

/** A save named by a saved entry, and when that entry was saved. */
export interface SaveRef {
  key: string;
  at: number;
}

/**
 * Which kept saves stay: those a saved entry names, the save of the newest entry first, up to
 * MAX_KEPT_SAVES and MAX_KEPT_BYTES; plus any kept in the last quarter hour. Pure, for the tests.
 */
export function keptToKeep(
  index: readonly KeptSaveSummary[],
  refs: readonly SaveRef[],
  now = Date.now(),
  limits = { saves: MAX_KEPT_SAVES, bytes: MAX_KEPT_BYTES }
): Set<string> {
  const newest = new Map<string, number>();
  for (const r of refs) if (r.key) newest.set(r.key, Math.max(newest.get(r.key) ?? 0, r.at));
  const byKey = new Map(index.map(s => [s.key, s]));
  const keep = new Set<string>();
  let bytes = 0;
  const fresh = index.filter(s => now - s.keptAt < FRESH_MS);
  for (const s of fresh) {
    keep.add(s.key);
    bytes += s.bytes;
  }
  const named = [...newest.entries()].filter(([k]) => byKey.has(k) && !keep.has(k)).sort((a, b) => b[1] - a[1]);
  for (const [k] of named) {
    const s = byKey.get(k)!;
    if (keep.size >= limits.saves || bytes + s.bytes > limits.bytes) break;
    keep.add(k);
    bytes += s.bytes;
  }
  return keep;
}

/** Drop every kept save `keptToKeep` does not keep. Returns the summaries that remain. */
export async function pruneKeptSaves(
  partitionHash: string,
  refs: readonly SaveRef[],
  now = Date.now()
): Promise<KeptSaveSummary[]> {
  const index = await listKeptSaves(partitionHash);
  const keep = keptToKeep(index, refs, now);
  const kept = index.filter(s => keep.has(s.key));
  if (kept.length === index.length) return index;
  await putMetadataRecords(partitionHash, [
    { key: INDEX_KEY, value: kept },
    ...index.filter(s => !keep.has(s.key)).map(s => ({ key: BODY_PREFIX + s.key, value: null })),
  ]);
  return kept;
}

/**
 * The file name for a downloaded save: the TE and the save's own date, never the player's id
 * (`egg-inc-save-TE230-2026-10-03-2112.json`). `zone` is the planner's time zone.
 */
export function saveFileName(save: Pick<EntrySave, 'te' | 'backupAt'>, zone?: string): string {
  let stamp = 'unknown-date';
  if (save.backupAt > 0) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(save.backupAt * 1000));
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
      stamp = `${get('year')}-${get('month')}-${get('day')}-${get('hour')}${get('minute')}`;
    } catch {
      stamp = new Date(save.backupAt * 1000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    }
  }
  const te = Number.isFinite(save.te) ? Math.round(save.te) : 0;
  return `egg-inc-save-TE${te}-${stamp}.json`;
}

/**
 * A save file read back: the game's backup as JSON (what "Download this save" writes, and what the
 * command-line search's `--backup` reads). Throws, in player words, for anything that is not one.
 */
export function parseSaveFile(text: string): ei.IBackup {
  let value: unknown;
  try {
    value = decode<unknown>(text);
  } catch {
    throw new Error("This file isn't a save: it isn't JSON.");
  }
  const b = value as { game?: unknown; farms?: unknown; approxTime?: unknown } | null;
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.game !== 'object' || !Array.isArray(b.farms)) {
    throw new Error("This file isn't an Egg, Inc. save (it has no game or farms).");
  }
  return value as ei.IBackup;
}
