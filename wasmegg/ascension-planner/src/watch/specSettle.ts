/**
 * Spec helper for the watch specs: wait until the WebCrypto work the code under test started has
 * really finished, instead of a fixed number of event-loop ticks (which a slow WebCrypto, as on the
 * PC under WSL, outlasts). Every `crypto.subtle` call is counted while it is in flight; `settle`
 * returns once none is, and the code that followed them has had a few turns to run. Not a timer
 * (setImmediate), so fake timers don't stop it. Times out after 5 s of real time.
 *
 * Opt-in slow crypto for checking this: run with WATCH_SPEC_CRYPTO_DELAY_MS=50 in the environment.
 */
let inflight = 0;
let installed = false;
const DELAY_MS = Number(process.env.WATCH_SPEC_CRYPTO_DELAY_MS ?? 0) || 0;
const realSetTimeout = globalThis.setTimeout;

function install(): void {
  if (installed) return;
  installed = true;
  const subtle = crypto.subtle as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const name of ['importKey', 'encrypt', 'decrypt', 'digest', 'deriveKey', 'deriveBits']) {
    const real = subtle[name];
    if (typeof real !== 'function') continue;
    subtle[name] = function (this: unknown, ...args: unknown[]) {
      inflight++;
      const run = async () => {
        if (DELAY_MS) await new Promise<void>(r => realSetTimeout(r, DELAY_MS));
        return real.apply(crypto.subtle, args);
      };
      return run().finally(() => {
        inflight--;
      });
    };
  }
}
install();

const turn = () => new Promise<void>(r => setImmediate(r));
const nowMs = () => Number(process.hrtime.bigint() / 1_000_000n);

export async function settle(timeoutMs = 5000): Promise<void> {
  install();
  const t0 = nowMs();
  let quiet = 0;
  // Quiet = no crypto in flight for several turns in a row (the fetch and the code after it follow).
  while (quiet < 5) {
    await turn();
    if (inflight > 0) {
      quiet = 0;
      if (nowMs() - t0 > timeoutMs) throw new Error(`watch spec: crypto still pending after ${timeoutMs} ms`);
      if (DELAY_MS) await new Promise<void>(r => realSetTimeout(r, 5));
    } else quiet++;
  }
}
