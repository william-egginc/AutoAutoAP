<!--
  A search's progress bar: the same bar on Smart search (green), the Full sweep and By a date (rose).
  The words around it differ on purpose (chains, chains priced, routes priced and legs simulated), so
  they stay with each screen.
-->
<template>
  <div class="rounded-full bg-slate-100 overflow-hidden" :class="thin ? 'h-1.5' : 'h-2'">
    <div
      class="h-full rounded-full transition-all duration-500"
      :class="tone === 'smart' ? 'bg-emerald-500' : 'bg-rose-500'"
      :style="{ width: `${Math.round(percent)}%` }"
    ></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 0 to 100. */
    percent: number;
    /** Smart search's bar is green; the exhaustive searches' rose. */
    tone?: 'smart' | 'exhaustive';
    thin?: boolean;
  }>(),
  { tone: 'exhaustive', thin: false }
);
</script>
