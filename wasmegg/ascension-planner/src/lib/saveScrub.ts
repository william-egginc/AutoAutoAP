/**
 * Files the page hands the player carry no player ID (spec-savescrub, 29 Oct 2026). A downloaded save had the
 * player's ID in `eiUserId` and in every contract's `coopUserId` (hundreds of them in a real save); every
 * EI + 16 digits in a download now becomes the stand-in below.
 *
 * And a save read back takes its account from the page, never from the file (`idFromScreen`): a scrubbed file
 * loads for the account on screen exactly as the original would, and with no account on screen it loads with
 * none (own instant answer, Follow, Saved answers and everything kept online are then off).
 *
 * The stand-in is "no account" wherever an ID comes IN from outside (a file, the player ID box, a link). Inside
 * the stores it is not special: specs use it as their test account (test/syntheticSave.ts).
 */

/** What every player ID in a downloaded file becomes. */
export const PLACEHOLDER_ID = 'EI0000000000000000';

const ANY_ID = /EI\d{16}/gi;
const IS_ID = /^EI\d{16}$/i;

/** The stand-in from a downloaded file (any case, spaces around it): never an account. */
export function isPlaceholderId(id: string | null | undefined): boolean {
  return /^EI0{16}$/i.test(String(id ?? '').trim());
}

/** Every EI + 16 digits in `text` as the stand-in. */
export function scrubPlayerIds(text: string): string {
  return text.replace(ANY_ID, PLACEHOLDER_ID);
}

/**
 * The same over a file given in pieces (utils/export `downloadParts`): a string piece is scrubbed, and the end of
 * one that could be the start of an ID ("E", "EI", "EI123…") is held back and joined to the next, so an ID split
 * across two pieces is still caught. Anything that is not a string (a Blob, bytes) passes as it is.
 */
export function* scrubParts(parts: Iterable<BlobPart>): Generator<BlobPart> {
  let carry = '';
  for (const part of parts) {
    if (typeof part !== 'string') {
      if (carry) yield scrubPlayerIds(carry);
      carry = '';
      yield part;
      continue;
    }
    const text = carry + part;
    const tail = /E(?:I\d{0,15})?$/i.exec(text);
    const cut = tail ? tail.index : text.length;
    carry = text.slice(cut);
    if (cut > 0) yield scrubPlayerIds(text.slice(0, cut));
  }
  if (carry) yield scrubPlayerIds(carry);
}

/** The account fields of a save that the page reads (search/runSaves.ts `accountOf`, the stores' `eiUserId`). */
type SaveIds = { eiUserId?: string | null; userId?: string | null };

/**
 * A save read from a file, given the account on screen: 'ok' with its ID set to that account's (a scrubbed file, one
 * with no ID, or the same account's own); 'other' when it names a different real account (left as it is, for the
 * caller to refuse); 'none' with no account on screen, its IDs blanked, so nothing is keyed by a file's ID.
 * Everything else in the save is kept. Changes `raw`.
 */
export function idFromScreen(raw: SaveIds, screenId: string): 'ok' | 'other' | 'none' {
  const screen = isPlaceholderId(screenId) ? '' : (screenId ?? '').trim();
  const file = String(raw.eiUserId ?? '').trim();
  const userIdIsId = IS_ID.test(String(raw.userId ?? '').trim());
  if (!screen) {
    if (raw.eiUserId != null) raw.eiUserId = '';
    if (userIdIsId) raw.userId = '';
    return 'none';
  }
  if (file && !isPlaceholderId(file)) {
    // A real ID in the file: another account's when both are IDs and differ (the caller refuses it).
    return IS_ID.test(file) && IS_ID.test(screen) && file.toUpperCase() !== screen.toUpperCase() ? 'other' : 'ok';
  }
  raw.eiUserId = screen;
  if (userIdIsId && isPlaceholderId(raw.userId)) raw.userId = screen;
  return 'ok';
}

/** Said when a save is loaded with no account on screen (DRAFT wording, for Words). */
export const NO_ACCOUNT_LINE =
  'This save is loaded without an account, so your own instant answer, Follow, Saved answers and anything kept online or sent to the Leaderboard are off. Enter your player ID at the top to turn them on.';
