/**
 * The save on the server versus the save loaded here (Jordan, 25 Oct 2026: the amber "Your save is from Oct 25 at
 * 10:09 AM (12 hours ago) … Load a fresh save ›" offered a reload when the server had nothing newer). The game only
 * syncs to the server every few minutes while it is open, so the server's copy can be just as old as the one here.
 *
 * So the page learns the server's save time, quietly, once per page load per account:
 *   - every real load of a save (the Load button, entering the Auto Planner, My runs' own load) notes it
 *     (`noteServerSave`), so a page that just fetched never asks again;
 *   - otherwise `checkServerQuietly` makes the same request as Load (lib/saveLoad.ts `requestSave`, through the
 *     relay), once, with nothing on screen while it runs. It never puts the save it gets into the planner, never shows
 *     an error, never logs. It is skipped without a player ID, offline, and when the loaded save is under
 *     `QUIET_CHECK_MIN_AGE_S` old (nothing to gain).
 * What is kept is `{ checkedAt, serverBackupTime }` per account HASH (never the ID), in memory for this page load.
 */
import { reactive } from 'vue';
import type { ei } from 'lib';
import { ageAgo } from './saveAge';
import { backupSecondsOf } from './saveFreshness';
import { requestSave } from './saveLoad';
import { hashID } from './storage/db';

/** A loaded save younger than this (seconds) is not checked: the game would hardly have synced since. */
export const QUIET_CHECK_MIN_AGE_S = 10 * 60;

/** What is known of the server's save. `serverBackupTime` 0: the check failed. Unix seconds both. */
export interface ServerSaveCheck {
  checkedAt: number;
  serverBackupTime: number;
}

/** By account hash. Reactive, so the strip changes when a check lands. */
const known = reactive(new Map<string, ServerSaveCheck>());
/** Accounts (hashes) already asked about on this page load: the module-level once-only guard. */
const asked = new Set<string>();

/** What is known of this account's server save, or null. */
export function serverSaveFor(hash: string | null | undefined): ServerSaveCheck | null {
  return (hash && known.get(hash)) || null;
}

/** A save just loaded from the server: that is the server's save time now (no second request needed). */
export function noteServerSave(hash: string, backup: unknown, nowSeconds = Date.now() / 1000): void {
  const t = backupSecondsOf(backup);
  if (!hash || !t) return;
  asked.add(hash);
  known.set(hash, { checkedAt: Math.floor(nowSeconds), serverBackupTime: t });
}

export type QuietCheckOutcome = 'skipped' | 'checked' | 'failed';

/**
 * Ask the server for this account's save once per page load, quietly. Resolves to what happened; never throws,
 * never logs, never touches the stores.
 */
export async function checkServerQuietly(
  playerId: string | null | undefined,
  loadedSeconds: number,
  o: {
    nowSeconds: number;
    online?: boolean;
    request?: (id: string) => Promise<ei.IEggIncFirstContactResponse>;
    hash?: (id: string) => Promise<string>;
  }
): Promise<QuietCheckOutcome> {
  if (!playerId || !(loadedSeconds > 1e9)) return 'skipped';
  if (o.online === false) return 'skipped';
  if (o.nowSeconds - loadedSeconds < QUIET_CHECK_MIN_AGE_S) return 'skipped';
  let hash: string;
  try {
    hash = await (o.hash ?? hashID)(playerId);
  } catch {
    return 'skipped';
  }
  if (asked.has(hash)) return 'skipped';
  asked.add(hash);
  try {
    const { backup } = await requestSave(playerId, o.request ? { request: o.request } : {});
    const t = backupSecondsOf(backup);
    known.set(hash, { checkedAt: Math.floor(o.nowSeconds), serverBackupTime: t });
    return t ? 'checked' : 'failed';
  } catch {
    known.set(hash, { checkedAt: Math.floor(o.nowSeconds), serverBackupTime: 0 });
    return 'failed';
  }
}

export type ServerSaveState =
  /** The server has a newer save than the one loaded: offer it. */
  | { kind: 'newer'; serverSeconds: number }
  /** The loaded save is the newest the server has: a reload would change nothing. */
  | { kind: 'newest'; serverSeconds: number }
  /** Not checked (yet, or skipped), or the check failed: say nothing new. */
  | { kind: 'unknown' };

/** Compare the loaded save with the server's. Newer means more than a second newer. */
export function serverSaveState(loadedSeconds: number, check: ServerSaveCheck | null): ServerSaveState {
  if (!check || !(check.serverBackupTime > 1e9) || !(loadedSeconds > 1e9)) return { kind: 'unknown' };
  const s = check.serverBackupTime;
  return s - loadedSeconds > 1 ? { kind: 'newer', serverSeconds: s } : { kind: 'newest', serverSeconds: s };
}

/** The strip's button when the server has a newer save (it loads it as Load does). */
export const NEWER_ON_SERVER = 'A newer save is on the server · Load it';

/** The strip's line when the loaded save is the newest on the server: a reload would change nothing. */
export function newestOnServerLine(serverSeconds: number, nowSeconds: number): string {
  return `This is the newest save on the server (synced ${ageAgo(nowSeconds - serverSeconds)}). Open the game to update it.`;
}

/** The tip under it (as carpet's tools say it: the game syncs only while it is open). */
export const WHY_OUT_OF_DATE = {
  summary: 'Why is my save out of date?',
  body: 'The game sends your save to the server every few minutes while it is open, and not while it is closed. Force close the game and open it again so it syncs, then reload this page.',
} as const;

/** Tests only: forget every check, as a page reload does. */
export function resetServerSaveChecks(): void {
  known.clear();
  asked.clear();
}
