<!--
  "Dig deeper into your plan ›" under a search's result card (Fastest's two panels, By a date): to
  Leaderboard › Your latest run (#/compare/latest, LatestRunView.vue), which shows the newest search's routes
  with when each stop and egg happens, and for Fastest its other options and charts.
-->
<template>
  <p class="text-[11px] text-slate-600" data-testid="dig-deeper">
    <a :href="LATEST_HASH" class="font-bold text-indigo-700 underline hover:text-indigo-900"
      >Dig deeper into your plan ›</a
    >
    <span class="text-slate-500"> {{ detail }} ({{ NAMES.compare }} › {{ NAMES.latest }})</span>
  </p>
</template>

<script setup lang="ts">
import { DEFAULT_ROUTE, NAMES, hashFor } from '@/lib/siteNav';

withDefaults(defineProps<{ detail?: string }>(), { detail: 'when each stop and egg happens on its routes' });

const LATEST_HASH = hashFor({ ...DEFAULT_ROUTE, section: 'compare', compare: 'latest' });
</script>
