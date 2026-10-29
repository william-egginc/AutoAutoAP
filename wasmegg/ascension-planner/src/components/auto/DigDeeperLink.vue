<!--
  "Dig deeper into your plan ›" under a search's result card (Fastest's two panels, By a date): to My runs
  (#/myruns), on its Your runs section (lib/myRunsFocus.ts, 17 Oct 2026), whose latest-run block (LatestRunView.vue) shows the newest search's routes with when each
  stop and egg happens, By a date's top routes, and for Fastest its other options and charts. It went to
  Leaderboard › Your latest run (#/compare/latest) until 16 Oct 2026; that address lands on My runs too.
-->
<template>
  <p class="text-body text-slate-600" data-testid="dig-deeper">
    <a :href="MY_RUNS_HASH" class="font-bold text-indigo-700 underline hover:text-indigo-900" @click="askYourRuns()"
      >Dig deeper into your plan ›</a
    >
    <span class="text-slate-500"> {{ detail }} ({{ NAMES.myRuns }} › Your runs)</span>
  </p>
</template>

<script setup lang="ts">
import { DEFAULT_ROUTE, NAMES, hashFor } from '@/lib/siteNav';
import { askYourRuns } from '@/lib/myRunsFocus';

withDefaults(defineProps<{ detail?: string }>(), { detail: 'when each stop and egg happens on its routes' });

const MY_RUNS_HASH = hashFor({ ...DEFAULT_ROUTE, section: 'myruns' });
</script>
