/**
 * A "Working out…" note that gives up (UX review 26 Oct 2026, item 7): true while `status()` is 'running' and for at
 * most `ms` of it; past that false until the status changes and runs again. A note that sits there for minutes, or
 * ends in nothing, reads as broken. Cleared with its scope (the component).
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue';

export function useStillWorking(status: () => string, ms: number): Ref<boolean> {
  const showing = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  watch(
    status,
    s => {
      stop();
      showing.value = s === 'running';
      if (showing.value) timer = setTimeout(() => (showing.value = false), ms);
    },
    { immediate: true }
  );
  onScopeDispose(stop);
  return showing;
}
