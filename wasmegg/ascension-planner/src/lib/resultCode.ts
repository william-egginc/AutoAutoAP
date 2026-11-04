/**
 * THE CODE A KEPT RESULT WAS WORKED OUT BY (Release 7, allanfieldhouse: after reloading onto a new build the page kept
 * the old code's answer, because his inputs had not changed). `resultCode()` is a hash of the code that decides
 * results (lib/resultCodeHash.ts, at build time; wording is left out, so a wording-only deploy keeps every kept
 * answer). Every kept result carries it, in its key (`withResultCode`) or as an `rc` field checked on read
 * (`sameResultCode`): one kept under another code, or with none (kept before this), is worked out again. User data
 * (saved runs and answers, follows, ticks, consent, Setup, names) never carries it and is never dropped for it.
 *
 * In dev the build's hash; in tests, where nothing defines it, 'dev', so specs are deterministic (`setResultCode` lets a
 * spec load a page "under another build").
 */
export const DEV_RESULT_CODE = 'dev';

let forced: string | null = null;

/** The code identity of this bundle. */
export function resultCode(): string {
  if (forced) return forced;
  return typeof __RESULT_CODE_HASH__ === 'string' && __RESULT_CODE_HASH__ ? __RESULT_CODE_HASH__ : DEV_RESULT_CODE;
}

/** Specs only: act as a bundle with code identity `c` (null: back to the bundle's own). */
export function setResultCode(c: string | null): void {
  forced = c;
}

/** `key` with the code identity in it: a key made by other code never matches. */
export function withResultCode(key: string): string {
  return `${key}|rc=${resultCode()}`;
}

/** A kept result's `rc` is this bundle's (absent: kept before results carried it, so older code). */
export function sameResultCode(rc: unknown): boolean {
  return typeof rc === 'string' && rc === resultCode();
}
