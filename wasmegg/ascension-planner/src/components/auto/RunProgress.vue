<!--
  A run's progress under the Find buttons, the same frame on every search screen: what it is doing
  (left) and how far through it is (right), the bar, then the screen's own lines (default slot):
  batches and time left on Smart search, the measured rate on the Full sweep, legs and the estimate on
  By a date. The App-level bar on every tab is RunProgressBar.vue.

  Each screen puts its `data-run-progress` anchor on this element (lib/runAnchor.ts scrolls to it).
-->
<template>
  <div>
    <div
      class="flex flex-wrap items-center justify-between gap-x-3 text-[10px] font-black uppercase tracking-widest mb-1.5"
    >
      <span class="text-slate-500 min-w-0 break-words">{{ stage }}</span>
      <span class="text-slate-400 tabular-nums">{{ count }}</span>
    </div>
    <ProgressBar :tone="tone" :thin="thin" :percent="percent" />
    <div v-if="$slots.default" class="mt-1.5 space-y-1.5"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import ProgressBar from './ProgressBar.vue';

withDefaults(
  defineProps<{
    /** The stage the run is in, in the store's words. */
    stage: string;
    /** "12 / ~340 chains". */
    count: string;
    /** 0 to 100. */
    percent: number;
    tone?: 'smart' | 'exhaustive';
    thin?: boolean;
  }>(),
  { tone: 'exhaustive', thin: false }
);
</script>
