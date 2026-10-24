/**
 * Loading a player's save from the game's server (through the forwarder), with every way it can go
 * wrong turned into one of two plain answers.
 *
 * QA's break-it run (22 Oct 2026, #1 and #1b): the forwarder answering 200 with an empty body, or not
 * answering at all, decoded to a response with no `backup`. `data.backup!` then threw "Cannot read
 * properties of undefined (reading 'contracts')", that text went onto the page, and the stores -- already
 * cleared for the new load -- rendered a made-up default account (C1, IHR 30.000K/hr) as if it were the
 * player's. Now an empty, unreadable or missing save is an error like any other, a load gives up after
 * SAVE_TIMEOUT_MS (a save is a few hundred KB; the shared request's own limit is 30 s, and the hang
 * came back with nothing at 45 s), and the caller leaves the stores alone until a save is in hand.
 */
import { requestFirstContact, type ei } from 'lib';

/** How long a save load waits before giving up. */
export const SAVE_TIMEOUT_MS = 20_000;

/** The server could not be reached, timed out, or sent back nothing usable. */
export const SAVE_UNREACHABLE = "Couldn't load your save. Check your connection and try again.";
/** The server answered, and has no account under that player ID. */
export const ID_NOT_FOUND = "That player ID wasn't found. Check it and try again.";

export type SaveLoadKind = 'unreachable' | 'not-found';

/** A failed save load. Its message is already in player words. */
export class SaveLoadError extends Error {
  constructor(
    readonly kind: SaveLoadKind,
    options?: { cause?: unknown }
  ) {
    super(kind === 'not-found' ? ID_NOT_FOUND : SAVE_UNREACHABLE, options);
    this.name = 'SaveLoadError';
  }
}

/** The game's "no such user" code (ei.EggIncFirstContactResponse.ErrorCodes.USER_NOT_FOUND). */
const USER_NOT_FOUND = 2;

/**
 * The response's save, or why there is none. An empty body decodes to a response with nothing in it
 * (no backup, no user ID, no error): that is the connection, not the ID. A response that names an
 * error, or echoes the ID back without a save, is the server saying it has no such account.
 */
export function saveFrom(data: ei.IEggIncFirstContactResponse | null | undefined): ei.IBackup {
  const backup = data?.backup;
  // A save with neither a game nor a time in it is no save.
  if (backup && (backup.game || backup.approxTime)) return backup;
  if (data && (data.errorCode === USER_NOT_FOUND || !!data.errorMessage || (!backup && !!data.eiUserId)))
    throw new SaveLoadError('not-found');
  throw new SaveLoadError('unreachable');
}

/**
 * Fetch a player's save: the save itself, or a SaveLoadError. A request that never settles is given
 * up on after `timeoutMs` (the request itself is aborted by the shared code's own, longer, timer).
 */
export async function requestSave(
  playerId: string,
  o: {
    request?: (id: string) => Promise<ei.IEggIncFirstContactResponse>;
    timeoutMs?: number;
  } = {}
): Promise<{ data: ei.IEggIncFirstContactResponse; backup: ei.IBackup }> {
  const request = o.request ?? requestFirstContact;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SaveLoadError('unreachable')), o.timeoutMs ?? SAVE_TIMEOUT_MS);
  });
  let data: ei.IEggIncFirstContactResponse;
  try {
    data = await Promise.race([request(playerId), timeout]);
  } catch (e) {
    if (e instanceof SaveLoadError) throw e;
    // A 4xx from the server for this ID is the ID; anything else (a dropped connection, a 5xx, a body
    // that isn't a save) is the connection.
    const msg = e instanceof Error ? e.message : String(e);
    throw new SaveLoadError(/HTTP 40[04]\b/.test(msg) ? 'not-found' : 'unreachable', { cause: e });
  } finally {
    clearTimeout(timer);
  }
  return { data, backup: saveFrom(data) };
}
