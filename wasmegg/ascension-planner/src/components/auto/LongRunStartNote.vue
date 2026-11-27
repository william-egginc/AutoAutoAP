<!--
  The long-search line (spec-longstart, Jordan, 16 Nov 2026): while a player sets up a search the screen expects to take
  2 hours or more, before Run, it says what starting it will do: the planner's server is told, so a planned update waits.
  Shown at selection time only, never during or after the run (RunControls.vue passes `v-if="!running"`, and it also stays quiet while
  ANY search runs, `store.busy`: another option's panel is kept mounted but hidden, and must not show it beside a run). The estimate is
  the one beside Run (QA, 16 Nov 2026), written as data-estimate-seconds so it can be compared with the chip. Only while the
  alert's sends are on (`beaconEnabled`), because the line promises a message. Nothing is sent from here. Words' text:
  lib/runBeaconWords.ts `longRunStartWords`.
-->
<template>
  <p
    v-if="text"
    :data-estimate-seconds="Math.round(estimateSeconds ?? 0)"
    class="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-body text-indigo-900 break-words"
    role="status"
    data-testid="long-run-start-note"
  >
    {{ text }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { BEACON_MIN_SECONDS, beaconEnabled } from '@/lib/runBeacon';
import { longRunStartWords } from '@/lib/runBeaconWords';
import { useChainSearchStore } from '@/stores/chainSearch';

const props = defineProps<{ estimateSeconds?: number | null }>();
const store = useChainSearchStore();

const text = computed(() => {
  const s = props.estimateSeconds;
  if (store.busy) return '';
  return beaconEnabled() && typeof s === 'number' && Number.isFinite(s) && s >= BEACON_MIN_SECONDS ? longRunStartWords(s) : '';
});
</script>
