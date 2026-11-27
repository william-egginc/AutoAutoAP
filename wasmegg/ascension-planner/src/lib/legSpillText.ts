/**
 * The small, pure pieces of the leg spill's page side (QA pass of 26 Oct 2026,
 * aaap-tools/notes/qa-legspill-2026-10-26.md): the remembered detail setting, why a spill could not be
 * opened, what Setup > Memory says about it, its size in words, and the guard against downloading a run
 * that has not priced anything yet.
 */

/** Where "Keep per-ascension detail for N routes" is remembered, per browser (0 = keep everything). */
export const LEG_DETAIL_KEY = 'aap-leg-detail';

/** localStorage, or null where it is missing or blocked. */
export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The remembered setting, or null when none is (then the machine's default). */
export function readLegDetailBudget(storage: Pick<Storage, 'getItem'> | null): number | null {
  try {
    const raw = storage?.getItem(LEG_DETAIL_KEY);
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeLegDetailBudget(storage: Pick<Storage, 'setItem'> | null, n: number): void {
  if (!Number.isInteger(n) || n < 0) return;
  try {
    storage?.setItem(LEG_DETAIL_KEY, String(n));
  } catch {
    // Not remembered this time (blocked storage); the setting still holds for this visit.
  }
}

/** Why a screen's spill could not be opened: no OPFS sync access here (an old browser, a private
 *  window), another tab of this account holds the file, or something else went wrong. */
export type SpillUnavailable = 'no-opfs' | 'other-tab' | 'error';

export function spillOpenFailure(e: unknown): SpillUnavailable {
  const name = (e as { name?: string } | null)?.name ?? '';
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (name === 'NoModificationAllowedError' || /NoModificationAllowed|another .*handle|locked/i.test(msg)) return 'other-tab';
  if (name === 'NotSupportedError' || name === 'SecurityError' || /createSyncAccessHandle|getDirectory|not supported|not a function/i.test(msg))
    return 'no-opfs';
  if (name === 'UnknownError') return 'no-opfs';
  return 'error';
}

/** A spill's size as people read it: KB under a megabyte, one decimal under ten, whole above. */
export function spillSizeText(bytes: number): string {
  if (!(bytes > 0)) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / 1024 / 1024;
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb).toLocaleString('en-US')} MB`;
}

export interface SpillInfo {
  routes: number;
  bytes: number;
  stopped: string | null;
  /** Set when there is no spill this run, and why. */
  unavailable?: SpillUnavailable;
}

/**
 * Setup > Memory's line about the downloaded CSV's detail, or null when there is nothing to say. `device`
 * is `thisDevice()` ("this computer"); `kept` the detail setting (0: everything).
 */
export function spillNote(info: SpillInfo | null, device: string, kept: number): { text: string; warn: boolean } | null {
  if (!info) return null;
  const top = kept > 0 ? `the fastest ${kept.toLocaleString('en-US')} routes` : 'every route memory holds';
  if (info.unavailable === 'other-tab')
    return {
      text: `Another tab has this account's search detail file open, so this tab's downloaded CSV has per-ascension detail for ${top} only. Run big searches in one tab.`,
      warn: true,
    };
  if (info.unavailable)
    return {
      text: `This browser can't keep every route's detail on ${device}'s disk${info.unavailable === 'no-opfs' ? ' (no private file storage here, or a private window)' : ''}, so the downloaded CSV has per-ascension detail for ${top} only.`,
      warn: true,
    };
  const base = `The downloaded CSV still has every route's detail: it is kept on ${device}'s disk as the run goes (${info.routes.toLocaleString('en-US')} routes, ${spillSizeText(info.bytes)}).`;
  return info.stopped
    ? { text: `${base} The disk filled up ${info.stopped}: routes priced after that have detail only if they are among ${top}.`, warn: true }
    : { text: base, warn: false };
}

/**
 * A full download that would describe the wrong run: a new run has started (its spill emptied) and has no
 * route of its own yet, so the file would be the previous run's checkpoint without its legs. Null: fine.
 */
export function staleDownloadReason(o: { ownRoutes: number; running: boolean }): string | null {
  return o.running && o.ownRoutes === 0
    ? "The run you just started hasn't priced a route yet, so there is no CSV for it yet. Try again in a few seconds."
    : null;
}

/** An async stream of CSV text with the UTF-8 BOM first, as every other CSV download has (utils/export.ts). */
export async function* withBom(chunks: AsyncIterable<string>, bom = '﻿'): AsyncGenerator<string> {
  yield bom;
  yield* chunks;
}

/** How long a saved download's OPFS copy is kept before it is deleted (the browser has read it by then). */
export const DOWNLOAD_FILE_TTL_MS = 10 * 60_000;
