/**
 * "Now", ticking once a second while a run is going, for the elapsed and time-left figures beside a
 * search's progress bar (the Full sweep and By a date). Immediate: coming back to a run that's going
 * (the planner's tabs) is the normal case. Stops with the run and when the screen closes.
 */
import { onUnmounted, ref, watch, type Ref } from 'vue';

export function useRunClock(running: () => boolean): Ref<number> {
  const now = ref(Date.now());
  let ticker: ReturnType<typeof setInterval> | null = null;
  watch(
    running,
    on => {
      if (ticker) clearInterval(ticker);
      ticker = on ? setInterval(() => (now.value = Date.now()), 1000) : null;
    },
    { immediate: true }
  );
  onUnmounted(() => ticker && clearInterval(ticker));
  return now;
}

/** `45 s`, `12 min`, `2.5 h`. */
export function durationLabel(sec: number): string {
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}
