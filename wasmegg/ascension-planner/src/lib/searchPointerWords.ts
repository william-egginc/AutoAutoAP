/**
 * The pointer's words for a result priced on ANOTHER save of the account (17 Nov 2026): the final text from Words. A
 * *Words.ts file: wording only, never part of the result code hash.
 */
import type { FoundLevel } from './searchPointer';

/** "Exact found 312 TE on your save from Nov 16, 9:10 AM. Run Exact again to check it on this save." `value` is the bold part. */
export function otherSavePointer(level: FoundLevel, value: string, saveWhen: string): string {
  return `${level} found ${value} on your save from ${saveWhen}. Run ${level} again to check it on this save.`;
}
