<!--
  The Start line (R11, Jordan 21 Nov 2026): "Right now, from your save" under the target or date row on both goal screens, and a small
  button that opens Setup (where the start is set). No Hypothetical switch. When a start is set the line says that moment instead.
  Words: lib/startLineWords.ts (placeholders).
-->
<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="start-line">
    <span class="text-slate-600 label">{{ START_LABEL }}</span>
    <span class="text-body font-bold text-slate-800">{{ line }}</span>
    <button
      type="button"
      class="min-h-[44px] sm:min-h-0 text-body font-bold text-indigo-700 underline hover:text-indigo-900"
      data-testid="start-change"
      @click="ui.setupOpen = true"
    >
      {{ START_CHANGE }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import { showDateTime } from '@/lib/displayTime';
import { START_CHANGE, START_LABEL, START_NOW, startAt } from '@/lib/startLineWords';

const store = useChainSearchStore();
const planner = useAutoPlannerStore();
const ui = useUIStore();
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
/** The app fills the start boxes from the save by itself; only a start the player set in Setup is said as a date. */
const line = computed(() => (planner.startTimeOverride ? startAt(showDateTime(store.planStart, zone.value)) : START_NOW));
</script>
