/**
 * One way to put a caught error on the page (QA break-it and the Words audit's S76, 22 Oct 2026): known
 * failures in plain words, anything that reads like raw exception text -- a URL, a TypeError, "Cannot read
 * properties of undefined", an HTTP status with its body -- as one generic sentence. Messages our own code
 * wrote for players (a plain Error with a plain sentence) pass through as they are.
 *
 * No Vue, no stores: the Explorer page and the stores use it too. lib/saveLoad.ts's SaveLoadError is known by
 * its name, so this doesn't pull the game's API code in.
 */
import { boardErrorText, type BoardReadKind } from '@/search/myBoardRows';

/** Anything we can't put in better words. */
export const SOMETHING_WENT_WRONG = 'Something went wrong. Try again.';
/** No connection (the browsers' "Failed to fetch", "NetworkError…", "Load failed"). */
export const NO_CONNECTION = "Couldn't connect. Check your connection and try again.";
/** A request that was given up on. */
export const TOO_SLOW = "It took too long to answer. Try again in a minute.";

const NETWORK = /failed to fetch|networkerror|load failed|network ?request failed|internet connection appears to be offline|err_internet_disconnected/i;
const TIMEOUT = /timeout|timed out|aborted|abort ?error/i;
/** What raw exception text looks like: never shown to players. */
const RAW =
  /https?:\/\/|\bundefined\b|\bnull\b|is not a function|is not defined|cannot read propert|cannot set propert|unexpected token|unexpected end of|in json at position|json\.parse|is not valid json|HTTP \d{3}|\b(?:Type|Reference|Range|Syntax|Internal|Eval|URI|DOM)Error\b|\bat \S+ \(|\[object |<\/?\w+[^>]*>|\bindex out of range\b|invalid wire type/i;
const RAW_TYPES = [TypeError, ReferenceError, RangeError, SyntaxError, EvalError, URIError];

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : '';
}

/** The error's own message would show code, a URL or an exception to a player. */
export function isRawError(e: unknown): boolean {
  const m = messageOf(e).trim();
  if (!m) return true;
  if (RAW_TYPES.some(T => e instanceof T)) return true;
  return RAW.test(m);
}

/**
 * The words to show for `e`. `fallback` replaces the generic sentence where the caller knows what failed
 * ("Couldn't reset. Try again.").
 */
export function plainError(e: unknown, fallback = SOMETHING_WENT_WRONG): string {
  // Already in player words (lib/saveLoad.ts), or with its own (search/myBoardRows.ts).
  if (e instanceof Error && e.name === 'SaveLoadError') return e.message;
  if (e instanceof Error && e.name === 'BoardReadError')
    return boardErrorText((e as Error & { kind: BoardReadKind }).kind, 'compare');
  const m = messageOf(e);
  const text = e instanceof Error ? `${e.name}: ${m}` : m;
  if (NETWORK.test(text)) return NO_CONNECTION;
  if (TIMEOUT.test(text)) return TOO_SLOW;
  return isRawError(e) ? fallback : m.trim();
}
