<!--
  EGG-BETA ONLY: "This page will reload at 2:00 pm Pacific" with a countdown and Reload now, then the reload itself,
  never during a search (lib/eggBetaReload.ts). Compiled in only for a build with AAP_EGG_BETA_RELOAD_AT (App.vue), and
  even then shows only on the egg-beta host. Same place and look as NewVersionBanner's reload ask, which App.vue hides
  while this shows. Words are DRAFTS (spec-eggbeta-reload, 1 Nov 2026).
-->
<template>
  <div
    v-if="shown"
    class="fixed top-3 left-1/2 -translate-x-1/2 z-[1100] w-[min(94vw,52rem)] flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-900 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-4 ring-black/5"
    role="status"
    data-testid="eggbeta-reload-banner"
  >
    <div class="min-w-0 flex-[1_1_14rem] text-body [overflow-wrap:anywhere]">
      <template v-if="state.kind === 'countdown'">
        <p class="font-bold">
          This page will reload at {{ at }} Pacific to get the latest version (save your results first).
        </p>
        <p class="mt-1">
          Reloads in{{ ' ' }}<span class="tabular-nums" data-testid="eggbeta-countdown">{{ left }}</span
          >.<template v-if="busy">{{ ' ' }}A search is running, so it will reload when your search ends.</template>
        </p>
      </template>
      <p v-else class="font-bold" data-testid="eggbeta-waiting">
        This page will reload to get the latest version (save your results first): it will reload when your search ends.
      </p>
    </div>
    <button
      type="button"
      class="inline-flex items-center justify-center min-h-[44px] px-3 py-1.5 rounded-lg bg-amber-600 text-white text-body font-bold hover:bg-amber-500"
      data-testid="eggbeta-reload-now"
      @click="reload"
    >
      Reload now
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, toRef, watch } from 'vue';
import { reloadPage, useEggBetaReload } from '@/composables/useEggBetaReload';
import { countdownText, pacificTime } from '@/lib/eggBetaReload';

const props = defineProps<{
  /** A search or run is going: the reload waits for it to end. */
  busy: boolean;
  /** For specs; the page's own reload otherwise. */
  reloadFn?: () => void;
}>();
const emit = defineEmits<{ active: [boolean] }>();

const reload = (): void => (props.reloadFn ?? reloadPage)();
const { state } = useEggBetaReload(toRef(props, 'busy'), reload);

const shown = computed(() => state.value.kind === 'countdown' || state.value.kind === 'waiting');
const at = computed(() => (state.value.kind === 'countdown' ? pacificTime(state.value.reloadAt) : ''));
const left = computed(() => (state.value.kind === 'countdown' ? countdownText(state.value.msLeft) : ''));
watch(shown, s => emit('active', s), { immediate: true });
</script>
