<!--
  Your setup, floating (the user, 30 Sept): a pill at the bottom right of every Auto Planner screen
  with a gear that opens the whole setup over the page, and the worker count, which stays adjustable
  while the setup is folded away. One copy of the setup (YourSetup.vue, docked); each screen keeps a
  one-line bar of the values, whose Edit setup opens this.
-->
<template>
  <div class="fixed z-50 right-3 sm:right-4" style="bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem)">
    <div
      v-if="ui.setupOpen"
      class="absolute bottom-full right-0 mb-2 w-[min(94vw,46rem)] max-h-[75vh] overflow-y-auto rounded-2xl border-2 border-indigo-200 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.3)]"
      role="dialog"
      aria-label="Your setup"
    >
      <div
        class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-2.5"
      >
        <span class="text-sm font-black text-indigo-900">Your setup</span>
        <button
          type="button"
          class="px-3 py-1 rounded-lg border border-indigo-300 bg-white text-[10px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50"
          @click="ui.setupOpen = false"
        >
          Done
        </button>
      </div>
      <YourSetup :screen="screen" docked />
    </div>

    <div class="flex items-center gap-1 rounded-full bg-indigo-600 text-white shadow-xl pl-1.5 pr-2 py-1.5">
      <button
        type="button"
        class="relative flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-white/15"
        :aria-expanded="ui.setupOpen"
        :title="ui.setupOpen ? 'Close your setup' : 'Open your setup'"
        @click="ui.setupOpen = !ui.setupOpen"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 002.6 1.1c1.5-1 3.4.9 2.4 2.4a1.7 1.7 0 001.1 2.6c1.8.4 1.8 3 0 3.4a1.7 1.7 0 00-1.1 2.6c1 1.5-.9 3.4-2.4 2.4a1.7 1.7 0 00-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 00-2.6-1.1c-1.5 1-3.4-.9-2.4-2.4a1.7 1.7 0 00-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 001.1-2.6c-1-1.5.9-3.4 2.4-2.4a1.7 1.7 0 002.6-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span class="text-[10px] font-black uppercase tracking-widest">Setup</span>
        <span
          v-if="errors"
          class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-400 ring-2 ring-indigo-600"
          :title="`${errors} problem${errors > 1 ? 's' : ''} with your save`"
        ></span>
      </button>
      <span class="w-px h-5 bg-white/30" aria-hidden="true"></span>
      <!-- Workers, adjustable folded: a running search resizes to it within about a minute. -->
      <button
        type="button"
        class="w-6 h-6 rounded-full hover:bg-white/15 font-black disabled:opacity-40"
        :disabled="store.workerBudget <= 1"
        aria-label="Fewer workers"
        @click="setWorkers(store.workerBudget - 1)"
      >
        −
      </button>
      <span class="text-[11px] font-bold tabular-nums" :title="'Workers this computer gives the searches'"
        >{{ store.workerBudget }}/{{ store.machineThreads }} workers</span
      >
      <button
        type="button"
        class="w-6 h-6 rounded-full hover:bg-white/15 font-black disabled:opacity-40"
        :disabled="store.workerBudget >= store.machineThreads"
        aria-label="More workers"
        @click="setWorkers(store.workerBudget + 1)"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import type { AutoView } from '@/lib/siteNav';
import YourSetup from './YourSetup.vue';

defineProps<{ screen: AutoView }>();
const store = useChainSearchStore();
const ui = useUIStore();

const errors = computed(() => store.setupIssues.filter(i => i.level === 'error').length);

function setWorkers(n: number): void {
  store.workerBudget = Math.max(1, Math.min(store.machineThreads, Math.floor(n)));
}

/** Asked from a panel (a sweep's "add time off"): open, and scroll to the time off. */
watch(
  () => ui.openSetupRequested,
  () => {
    ui.setupOpen = true;
    void nextTick(() =>
      document.getElementById('your-setup-time-off')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  }
);

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && ui.setupOpen) ui.setupOpen = false;
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  ui.setupOpen = false;
});
</script>
