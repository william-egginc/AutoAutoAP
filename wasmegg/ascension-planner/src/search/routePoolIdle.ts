/**
 * Let the instant answer's route workers go on every browser once nothing has asked them for a while: each holds a
 * decoded table (about 28 MB) and its sweeps. Asleep after `IDLE_SLEEP_MS` with no request pending, or after
 * `HIDDEN_SLEEP_MS` with the tab hidden; the next request spawns them again (search/routePool.ts `sleep`). Never while
 * a request is in flight: the clocks stop with the first and start again from the last one's end. Safari's own
 * earlier rule (search/device.ts `releaseRouteWorkers`) is unchanged.
 */
import type { RoutePool } from './routePool';

export const IDLE_SLEEP_MS = 2 * 60_000;
export const HIDDEN_SLEEP_MS = 60_000;

/** The part of the page this needs (the real `document`, or a stand-in in specs). */
export interface VisibilitySource {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

/** Start the clocks on `pool`; the result stops them and removes the listeners (also done when the pool is closed). */
export function sleepWhenIdle(
  pool: Pick<RoutePool, 'idle' | 'sleep' | 'watchBusy'>,
  options: { doc?: VisibilitySource | null; idleMs?: number; hiddenMs?: number } = {}
): () => void {
  const doc = options.doc === undefined ? (typeof document === 'undefined' ? null : document) : options.doc;
  const idleMs = options.idleMs ?? IDLE_SLEEP_MS;
  const hiddenMs = options.hiddenMs ?? HIDDEN_SLEEP_MS;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const clear = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (hiddenTimer) clearTimeout(hiddenTimer);
    idleTimer = hiddenTimer = null;
  };
  const hidden = () => doc?.visibilityState === 'hidden';
  const arm = () => {
    clear();
    if (stopped || !pool.idle) return;
    idleTimer = setTimeout(() => pool.idle && pool.sleep(), idleMs);
    if (hidden()) hiddenTimer = setTimeout(() => pool.idle && pool.sleep(), hiddenMs);
  };
  const onVisibility = () => {
    if (stopped || !pool.idle) return;
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = hidden() ? setTimeout(() => pool.idle && pool.sleep(), hiddenMs) : null;
  };
  const stop = () => {
    stopped = true;
    clear();
    unwatch();
    doc?.removeEventListener('visibilitychange', onVisibility);
  };
  const unwatch = pool.watchBusy(state => {
    if (state === 'closed') stop();
    else if (state === 'busy') clear();
    else arm();
  });
  doc?.addEventListener('visibilitychange', onVisibility);
  arm();
  return stop;
}
