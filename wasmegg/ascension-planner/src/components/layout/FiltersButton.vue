<!--
  FILTERS (Jordan, 12 Nov 2026: "a Filters button that opens Setup, like Joo's page has"; his ask, so a visible slot, not
  in More). Opens or closes the floating Setup (auto/SetupDock.vue's panel, a dialog named Setup) as the pill's gear
  does. The bar's small-button style (layout/SaveLine.vue's Change player), 44 px at every width. After the Auto
  Planner tabs (App.vue) and beside My runs' title (MyRunsView.vue), only where SetupDock is mounted.
-->
<template>
  <button
    type="button"
    class="flex-none inline-flex min-h-[44px] items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    aria-haspopup="dialog"
    :aria-expanded="ui.setupOpen"
    data-testid="filters-button"
    @click="ui.setupOpen = !ui.setupOpen"
  >
    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h18M6 12h12M10 19h4" />
    </svg>
    {{ FILTERS }}
  </button>
</template>

<script setup lang="ts">
import { FILTERS } from '@/lib/layoutWords';
import { useUIStore } from '@/stores/ui';

const ui = useUIStore();
</script>
