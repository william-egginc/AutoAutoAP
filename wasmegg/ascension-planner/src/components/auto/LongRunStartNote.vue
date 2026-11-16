<!--
  The start line for a long search (spec-longstart, Jordan, 16 Nov 2026): a search expected to take 2 hours or more says,
  for the whole run, that the planner's server was told it started, so a planned update waits for it. Local, like
  ReloadPlannedBanner.vue (it reads `longRun`, lib/runBeacon.ts); only while the alert's sends are on (`beaconEnabled`),
  because the line says a message was sent. In the run controls' flow, above the planned-update banner. DRAFT words:
  lib/runBeaconWords.ts `longRunStartWords`.
-->
<template>
  <p
    v-if="text"
    class="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-body text-indigo-900 break-words"
    role="status"
    data-testid="long-run-start-note"
  >
    {{ text }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { beaconEnabled, longRun } from '@/lib/runBeacon';
import { longRunStartWords } from '@/lib/runBeaconWords';

const text = computed(() => (beaconEnabled() && longRun.value ? longRunStartWords(longRun.value.estimateSeconds) : ''));
</script>
