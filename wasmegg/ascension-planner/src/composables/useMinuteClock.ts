/**
 * One clock for My runs' "Right now" page: `now` (unix seconds) moves once a minute, only while the page is
 * visible (a hidden tab costs nothing), and catches up at once when it shows again. The useNewVersion.ts
 * pattern: one interval, stopped on `visibilitychange` to hidden and on unmount.
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue';

export const TICK_MS = 60_000;

interface DocLike {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}
interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  now(): number;
}

/** The clock without Vue (minuteClock.spec.ts drives it with a fake document and timers). */
export function createMinuteClock(doc: DocLike | null, timers: Timers): { now: Ref<number>; start(): void; stop(): void } {
  const now = ref(Math.floor(timers.now() / 1000));
  let id: unknown = null;
  const tick = () => (now.value = Math.floor(timers.now() / 1000));
  const run = () => {
    if (id !== null) return;
    tick();
    id = timers.setInterval(tick, TICK_MS);
  };
  const halt = () => {
    if (id === null) return;
    timers.clearInterval(id);
    id = null;
  };
  const onVisibility = () => (doc?.visibilityState === 'hidden' ? halt() : run());
  return {
    now,
    start() {
      doc?.addEventListener('visibilitychange', onVisibility);
      if (!doc || doc.visibilityState !== 'hidden') run();
    },
    stop() {
      doc?.removeEventListener('visibilitychange', onVisibility);
      halt();
    },
  };
}

export function useMinuteClock(): Ref<number> {
  const clock = createMinuteClock(typeof document === 'undefined' ? null : document, {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: id => clearInterval(id as ReturnType<typeof setInterval>),
    now: () => Date.now(),
  });
  onMounted(() => clock.start());
  onUnmounted(() => clock.stop());
  return clock.now;
}
