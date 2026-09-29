<!--
  Which save the results on screen belong to, when it is not the latest.

  Carrying on an interrupted run loads the save it started with, so its two halves are priced on one
  farm. That is right for comparing its plans, but the player has usually moved on since -- so this
  says so, offers the latest save back, and then re-prices the fastest few on it, by finish date.
-->
<template>
  <div
    v-if="ui.runSaveLoaded"
    class="p-3 rounded-xl border border-violet-200 bg-violet-50 text-[11px] text-violet-900 leading-relaxed space-y-2"
  >
    <p>
      <span class="font-black uppercase tracking-wide">On the save this run started with.</span>
      The planner is using your save from {{ when(ui.runSaveLoaded.backupAt) }} (TE {{ ui.runSaveLoaded.te }}), so the
      run carries on with the farm it began on. Your latest save may differ; load it again when the run is done.
    </p>
    <button
      type="button"
      :disabled="ui.loading || store.isRunning"
      class="px-3 py-1.5 rounded-lg bg-violet-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-40"
      @click="ui.backupRetryRequested++"
    >
      Load my latest save
    </button>
  </div>

  <div
    v-else-if="store.resultsFromOlderSave && !store.isRunning"
    class="p-3 rounded-xl border border-violet-200 bg-violet-50 text-[11px] text-violet-900 leading-relaxed space-y-2"
  >
    <p>
      <span class="font-black uppercase tracking-wide">These results are from an older save</span>
      ({{ when(store.resultsFromOlderSave.backupAt) }}, TE {{ store.resultsFromOlderSave.te }}). Before following one,
      re-price the fastest few on your latest save<template v-if="store.currentTE > 0">
        (TE {{ store.currentTE }})</template
      >. Compare finish dates, not days: the two start from different times.
    </p>
    <button
      type="button"
      :disabled="store.recheckingLatest"
      class="px-3 py-1.5 rounded-lg bg-violet-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 disabled:opacity-40"
      @click="store.recheckOnLatestSave(10)"
    >
      {{ store.recheckingLatest ? 'Re-checking…' : 'Re-check the top 10 on my latest save' }}
    </button>
    <div v-if="store.latestRecheck" class="overflow-x-auto">
      <table class="w-full text-[11px] tabular-nums">
        <thead>
          <tr class="text-left text-[9px] font-black uppercase tracking-widest text-violet-700">
            <th class="py-1 pr-3">Route</th>
            <th class="py-1 pr-3">Finish on the older save</th>
            <th class="py-1 pr-3">Finish on your latest save</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sortedRows" :key="row.chain.join(',')" class="border-t border-violet-100">
            <td class="py-1 pr-3 font-bold">{{ row.chain.join(' ') }}</td>
            <td class="py-1 pr-3">{{ when(row.oldFinish) }}</td>
            <td class="py-1 pr-3">
              <template v-if="row.newFinish">{{ when(row.newFinish) }} ({{ row.newDays?.toFixed(2) }} d)</template>
              <template v-else>could not be priced</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { formatInZone } from '@/search/csv';

const store = useChainSearchStore();
const ui = useUIStore();
const planner = useAutoPlannerStore();

function when(unixSeconds: number): string {
  if (!unixSeconds) return 'an unknown time';
  return formatInZone(unixSeconds, planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/** Fastest on the latest save first; the ones that could not be priced last. */
const sortedRows = computed(() =>
  [...(store.latestRecheck?.rows ?? [])].sort((a, b) => (a.newFinish ?? Infinity) - (b.newFinish ?? Infinity))
);
</script>
