/**
 * When IndexedDB last answered this page (review 7 Nov 2026, finding 7): any open or transaction that answered,
 * with a value or with an error, not one cut by its own time limit. The run's start limit (lib/runStorageLimit.ts,
 * stores/chainSearch.ts `runStorageLimit`) counts it as an answer, as it does the spill worker's messages
 * (lib/legSpillOpfs.ts `lastSpillAnswerAt`). Its own module, not db.ts: specs mock db.ts whole.
 */
let lastAnswerAt = 0;

export function noteDbAnswer(): void {
  lastAnswerAt = Date.now();
}

export function lastDbAnswerAt(): number {
  return lastAnswerAt;
}
