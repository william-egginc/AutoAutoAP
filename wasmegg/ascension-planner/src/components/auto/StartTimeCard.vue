<!--
  "When should I start?" at the top of Fastest route, under Your setup and above the instant answer
  (the user, egg-beta review 11 Oct): the tool for a player coming back after a break, so it sits where
  they arrive, folded until opened. It prices the instant answer's best route by default; the other
  routes the instant answer lists, and the last search's best, are in the menu. The pricing is
  StartTimeFinder.vue's (stores/chainSearch.ts `findBestStart`), unchanged. The Fastest answer's
  "Check start times for this route" opens it on that route (stores/startTimes.ts).
-->
<template>
  <section
    id="start-times"
    class="rounded-xl border border-slate-200 bg-white scroll-mt-24"
    data-testid="start-times-card"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      :aria-expanded="st.open"
      data-testid="start-times-toggle"
      @click="st.open = !st.open"
    >
      <span class="min-w-0">
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">When should I start?</span>
        <span class="block sm:inline sm:ml-2 text-[11px] text-slate-500">For coming back after a break</span>
      </span>
      <span class="text-slate-400 text-sm" aria-hidden="true">{{ st.open ? '⌄' : '›' }}</span>
    </button>
    <div v-if="st.open" class="px-4 pb-4 space-y-3">
      <p v-if="!choices.length" class="text-[11px] text-slate-500 leading-relaxed">
        It prices the instant answer's best route, which shows here once the instant answer has loaded below.
      </p>
      <label v-else class="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span class="font-bold text-slate-700">Route</span>
        <select
          v-model="pick"
          :disabled="store.startSweepRunning"
          class="max-w-full rounded-md border-slate-300 py-1 text-[11px] font-bold text-slate-800"
          data-testid="start-times-route"
        >
          <option v-for="c in choices" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
      </label>
      <StartTimeFinder v-if="chosen" :chain="chosen.chain" bare />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import StartTimeFinder from './StartTimeFinder.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInstantSummaryStore } from '@/stores/instantSummary';
import { useStartTimesStore } from '@/stores/startTimes';
import { startTimeChoices } from '@/lib/startTimeChoices';

const store = useChainSearchStore();
const instant = useInstantSummaryStore();
const st = useStartTimesStore();

const choices = computed(() =>
  startTimeChoices({
    instant: instant.listed,
    search: store.bestDays > 0 && !store.isRunning ? store.bestChain : null,
    requested: st.requested,
  })
);
/** The route picked: a link's route when one asked, else the first (the instant answer's best). */
const pick = ref('');
watch(
  () => st.requested?.join(','),
  key => {
    if (key) pick.value = key;
  },
  { immediate: true }
);
const chosen = computed(() => choices.value.find(c => c.key === pick.value) ?? choices.value[0] ?? null);
watch(chosen, c => {
  if (c && c.key !== pick.value) pick.value = c.key;
});
</script>
