/**
 * Best-so-far rows ("in progress" on the board) that a final send has already dealt with: replaced, or
 * refused for good (collector "provisional rows"). A Fastest run's checkpoint keeps the row id it sent
 * (so a crash still replaces it), and nothing took the id back out once the run's own final send had
 * replaced it. So Show its result, Run at Exact or a carry-on of that run took the dead id again, owed
 * the board a send it never agreed to, and sent it with a `replaces` the collector refused ("The best so
 * far you sent earlier is still on the board", which was not true). A carried-on run now skips an id
 * listed here (stores/chainSearch.ts `prepareToCarryOn`, `resumeDeadline`).
 *
 * Row ids only (8 hex from the collector), never a player ID; the last few, in this browser. Storage
 * is wrapped in try/catch: a private window remembers them for this visit only.
 */
export const DONE_PROVISIONAL_KEY = 'aap.doneProvisional';
const KEEP = 30;

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** This visit's, for when storage throws. */
const inMemory: string[] = [];

function read(storage: StorageLike | null): string[] {
  try {
    const raw = storage?.getItem(DONE_PROVISIONAL_KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** A final send carried `replaces: id` and has its answer: that row is done with. */
export function markProvisionalDone(id: string, storage: StorageLike | null = defaultStorage()): void {
  if (!id) return;
  if (!inMemory.includes(id)) inMemory.unshift(id);
  inMemory.splice(KEEP);
  const list = [id, ...read(storage).filter(x => x !== id)].slice(0, KEEP);
  try {
    storage?.setItem(DONE_PROVISIONAL_KEY, JSON.stringify(list));
  } catch {
    // remembered for this visit only
  }
}

export function isProvisionalDone(id: string, storage: StorageLike | null = defaultStorage()): boolean {
  return !!id && (inMemory.includes(id) || read(storage).includes(id));
}

/** A carried-on run's row, unless a final send already dealt with it. */
export function stillOpen<T extends { id: string }>(row: T | null, storage: StorageLike | null = defaultStorage()): T | null {
  return row && !isProvisionalDone(row.id, storage) ? row : null;
}
