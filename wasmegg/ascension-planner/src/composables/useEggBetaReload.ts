/**
 * The egg-beta timed reload in a component (lib/eggBetaReload.ts has the rules and why). `busy` is true while a search
 * or run is going: the reload waits for it, and runs as soon as it turns false.
 */
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { OWN_BUILD_TIME } from '@/composables/useNewVersion';
import { startEggBetaReload, type EggBetaState } from '@/lib/eggBetaReload';

async function fetchLive(): Promise<unknown> {
  const res = await fetch(new URL(`version.json?t=${Date.now()}`, document.baseURI).href, { cache: 'no-store' });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function reloadPage(): void {
  window.location.reload();
}

export function useEggBetaReload(busy: Ref<boolean>, reload: () => void = reloadPage) {
  const state = ref<EggBetaState>({ kind: 'none' });
  let run: { check: () => void; stop: () => void } | null = null;
  onMounted(() => {
    run = startEggBetaReload({
      host: window.location.hostname,
      ownBuildTime: OWN_BUILD_TIME,
      busy: () => busy.value,
      fetchLive,
      reload,
      storage: sessionStore(),
      onState: s => (state.value = s),
    });
  });
  // A search ended: look again now rather than at the next 15 s poll.
  watch(busy, b => {
    if (!b) run?.check();
  });
  onUnmounted(() => run?.stop());
  return { state };
}
