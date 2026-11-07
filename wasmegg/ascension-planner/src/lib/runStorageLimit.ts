/**
 * A TIME LIMIT ON A RUN'S STORAGE AT ITS START AND ITS END (spec-stuck3, 7 Nov 2026). Between setting the running flags
 * (the store's isRunning / deadlineRunning) and clearing them, a run awaits the browser's storage: the account's hash,
 * the checkpoint read (IndexedDB), the leg spill's open and restore (OPFS, through its worker) and the save kept for
 * the run, and at its end the last checkpoint and the result. If one of those never answers, the flags stay set for
 * good: the page reads as busy (My runs' simulation waits for a search to end, Run stays greyed). Each such stretch now
 * gets `RUN_STORAGE.ms` without an answer; past it the caller is told (`StorageTimeout`) and `onExpire` runs once.
 *
 * 40 s WITHOUT AN ANSWER, not 40 s in all. IndexedDB already gives up on one transaction after 30 s (5 s once known
 * stuck; lib/storage/db.ts), so a stuck database fails there first and the run goes on as before (without the
 * checkpoint): this limit catches only what nothing else bounds. A large spill's restore reads gigabytes in chunks;
 * every chunk the spill worker sends back counts as an answer (`progress`, lib/legSpillOpfs.ts `lastSpillAnswerAt`), so
 * a restore that keeps answering is never cut, however long it takes.
 */
export const RUN_STORAGE = { ms: 40_000 };
/** Specs: another limit (null: back to the default). */
export function setRunStorageMs(ms: number | null): void {
  RUN_STORAGE.ms = ms ?? 40_000;
}

export class StorageTimeout extends Error {
  constructor(what: string, ms: number) {
    super(`${what}: the browser's storage did not answer within ${Math.round(ms / 1000)} s`);
    this.name = 'StorageTimeout';
  }
}

export interface StorageLimit {
  /** `p`, or a StorageTimeout once the limit has passed (for every call after it too). */
  within<T>(p: Promise<T>): Promise<T>;
  /** Stop the clock (the stretch is over). */
  done(): void;
  /** Whether it ran out. */
  readonly expired: boolean;
}

/**
 * One stretch's limit: `ms` without an answer, the clock started now and set back by every `progress()` time (ms) later
 * than the last one seen. `onExpire` runs once, when it runs out.
 */
export function storageLimit(
  what: string,
  opts: { ms?: number; progress?: () => number; onExpire?: (e: StorageTimeout) => void } = {}
): StorageLimit {
  const ms = opts.ms ?? RUN_STORAGE.ms;
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let error: StorageTimeout | null = null;
  let fail: (e: StorageTimeout) => void = () => {};
  const out = new Promise<never>((_, reject) => (fail = reject));
  // Nobody may be waiting when it runs out.
  out.catch(() => {});
  const lastAnswer = () => Math.max(started, opts.progress?.() ?? 0);
  const arm = (): void => {
    timer = setTimeout(
      () => {
        timer = null;
        if (Date.now() - lastAnswer() < ms) return arm();
        error = new StorageTimeout(what, ms);
        try {
          opts.onExpire?.(error);
        } finally {
          fail(error);
        }
      },
      Math.max(0, lastAnswer() + ms - Date.now())
    );
  };
  arm();
  return {
    within<T>(p: Promise<T>): Promise<T> {
      if (error) return Promise.reject(error);
      return Promise.race([p, out]);
    },
    done(): void {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    get expired() {
      return !!error;
    },
  };
}
