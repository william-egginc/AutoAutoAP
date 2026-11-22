/**
 * One timeout for the follow and answers calls (code review 22 Nov 2026, C4.3): a stalled PUT hid "Save it online", and one
 * stalled list read blocked every answer save for the page load. A call that has not answered in CLOUD_TIMEOUT_MS is aborted
 * (when the browser has AbortController) and rejects with 'timeout'; the caller's own try/catch turns that into "offline".
 * (stores' prefs and synced-record calls keep their own copies of this, same 10 s.)
 */
export const CLOUD_TIMEOUT_MS = 10_000;

export async function timedCall<T>(run: (signal?: AbortSignal) => Promise<T>, ms: number = CLOUD_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    return await Promise.race([
      run(ctl?.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl?.abort();
          reject(new Error('timeout'));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
