<!--
  How many workers a run uses. One store value (chainSearch.workerBudget) for every kind of run:
  Chain Search, Insane and Highest TE by a date all read it, and a running search resizes to it.
-->
<template>
  <label class="block space-y-1">
    <span class="flex items-baseline justify-between text-[11px] font-bold text-slate-700">
      <span>How much of this computer to use</span>
      <span>{{ store.workerBudget }} of {{ store.machineThreads }} workers</span>
    </span>
    <input
      type="range"
      min="1"
      :max="store.machineThreads"
      :value="store.workerBudget"
      class="w-full accent-indigo-600"
      @input="setWorkers(($event.target as HTMLInputElement).value)"
    />
    <span class="block text-[10px] text-slate-500">
      Fewer workers keep the computer usable and quieter; more finish sooner. You can move it during a run too: the
      change takes effect within about a minute, and no chain in progress is lost.
    </span>
    <span
      v-if="store.longRunWorkers"
      class="block text-[10px] font-semibold text-amber-800"
      data-testid="long-run-workers"
    >
      {{ longRunLine(store.longRunWorkers) }}
    </span>
  </label>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { longRunLine } from '@/search/deadlineEstimate';

const store = useChainSearchStore();

/** Held to 1..the machine's threads, as the store's pool would clamp it anyway. Set by hand: the store
 *  no longer picks the count for a long run (`fitWorkersToRun`). */
function setWorkers(raw: string): void {
  const n = Number(raw);
  store.setWorkersByHand(Number.isFinite(n) ? Math.max(1, Math.min(store.machineThreads, Math.floor(n))) : 1);
}
</script>
