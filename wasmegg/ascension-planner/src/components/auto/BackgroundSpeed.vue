<!--
  How hard a run works while its tab is in the background.

  The search never pauses itself. Two things decide what happens when someone switches away: this
  setting, which drops to fewer workers while hidden and comes back to full speed on return, and
  the browser, which may freeze a hidden tab whatever the page wants. The second cannot be
  prevented from a page, so it is said plainly here rather than left to look like a bug.
-->
<template>
  <div class="space-y-1.5">
    <label class="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
      <span class="font-bold text-slate-800">When this tab is in the background:</span>
      <select
        :value="store.backgroundWorkers < store.workerBudget ? store.backgroundWorkers : 0"
        class="rounded-md border-slate-300 py-1 text-[11px] font-bold text-slate-800"
        @change="set(($event.target as HTMLSelectElement).value)"
      >
        <option :value="0">keep full speed ({{ store.workerBudget }} workers)</option>
        <option v-for="n in slower" :key="n" :value="n">slow to {{ n }} worker{{ n === 1 ? '' : 's' }}</option>
      </select>
    </label>
    <p class="text-[10px] text-slate-500 leading-relaxed">
      Lets the search keep going at a lower draw while you use the computer for something else, and go back to full
      speed when you return. Takes effect within about a minute, and no chain in progress is lost. Some browsers
      freeze a background tab entirely whatever this says (Safari, and Chrome or Edge with memory saving or sleeping
      tabs on): in Chrome or Edge, add this site under Settings, Performance, "Always keep these sites active"; in
      Safari, give the run its own window and leave it open rather than minimised.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';

const store = useChainSearchStore();

/** Every count below the current worker budget, largest first. */
const slower = computed(() => Array.from({ length: Math.max(0, store.workerBudget - 1) }, (_, i) => store.workerBudget - 1 - i));

function set(raw: string): void {
  const n = Math.floor(Number(raw));
  store.backgroundWorkers = Number.isFinite(n) && n > 0 ? n : 0;
}
</script>
