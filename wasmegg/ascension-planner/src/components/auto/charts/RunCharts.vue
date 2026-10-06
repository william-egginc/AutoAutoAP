<!--
  The run's charts, sized to the run. Up to CHART_AUTO_LIMIT priced chains: the point chart, as
  always. Past it: the heat map (constant cost), and the point chart only when asked for.
-->
<template>
  <div class="space-y-3">
    <template v-if="big">
      <RunHeatMap :heat="store.heat" />
      <div
        v-if="!store.chartsWanted"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
      >
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
          @click="store.drawCharts()"
        >
          Draw the charts
        </button>
        <span class="text-[11px] text-slate-500">
          Charts are paused for big runs so the page stays light; draw them whenever you like.
        </span>
      </div>
    </template>
    <SearchShapeChart
      v-if="!big || store.chartsWanted"
      :points="store.pricedChains"
      :best-chain="store.bestChain"
      :live="store.isRunning"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { CHART_AUTO_LIMIT } from '@/lib/chartThin';
import SearchShapeChart from './SearchShapeChart.vue';
import RunHeatMap from './RunHeatMap.vue';

const store = useChainSearchStore();
const big = computed(() => store.pricedCount > CHART_AUTO_LIMIT);
</script>
