<!--
  The top tabs (lib/siteNav.ts; six since Chain Finder, 12 Nov 2026), in the original buttons' style: the user asked to keep those
  (30 Sept), so the same pill, sizes, icons and colours, with the BETA badge on the Auto Planner.
  Sits where the tabs always sat, under the player ID in the header, and App shows the same row just
  below the header when it's folded away (the Auto Planner folds it).
-->
<template>
  <div class="space-y-1">
    <div class="flex justify-center">
      <!-- Narrow windows: two tabs a row (Chain Finder, 12 Nov 2026: Manual Planner and Auto Planner, then Chain
           Finder and My runs, then Leaderboard and Science when ticked), and an odd last tab across its row, so no
           row is ragged (six tabs in one row need about 1000px with the icons). Below sm the icons go, so each label
           fits its cell at 375. From lg up, one row (wrapping, centred, if a window is just too narrow). Each tab is
           at least 44 px tall below sm (Jordan, 21 Oct 2026); from sm up, the old size. -->
      <div
        class="bg-slate-50 p-1 sm:p-1.5 rounded-2xl border border-slate-200/50 shadow-sm grid grid-cols-2 w-full lg:flex lg:flex-wrap lg:w-auto lg:justify-center gap-1"
      >
        <button
          v-for="(t, i) in tabs"
          :key="t.id"
          type="button"
          :class="[
            i === tabs.length - 1 && tabs.length % 2 === 1 ? 'col-span-2' : 'col-span-1',
            current === t.id ? t.on : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
          ]"
          class="min-w-0 min-h-[44px] sm:min-h-0 px-2 sm:px-4 lg:px-6 py-2.5 rounded-xl label transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 text-center leading-tight"
          :aria-current="current === t.id ? 'page' : undefined"
          @click="emit('select', t.id)"
        >
          <svg
            class="hidden sm:block w-3.5 h-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="ICONS[t.id]" />
          </svg>
          {{ t.label }}
          <!-- White on indigo-600 (6.29:1), selected or not: white (90 % unselected) on indigo-500 was 4.47:1 and less,
               under WCAG AA's 4.5 (red team R7, axe, 1 Nov 2026; SiteTabs.betaContrast.spec.ts). -->
          <span
            v-if="t.id === 'auto'"
            class="shrink-0 bg-indigo-600 text-white text-small px-1.5 py-0.5 rounded-md sm:ml-1 border border-indigo-400/30"
            >BETA</span
          >
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TopTab } from '@/lib/siteNav';

defineProps<{
  tabs: { id: TopTab; label: string; on: string }[];
  /** The tab lit: App.vue's currentTopTab (lib/siteNav.ts topTabOf), as the Auto Planner and Chain Finder share the
   *  store's plannerTab. */
  current: TopTab;
}>();
const emit = defineEmits<{ select: [tab: TopTab] }>();

/** The original tabs' icons (pencil, lightning, bag), a chain link for Chain Finder (as on Joo's tab), a list for My
 *  runs and a flask for Science. */
const ICONS: Record<TopTab, string> = {
  manual:
    'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  auto: 'M13 10V3L4 14h7v7l9-11h-7z',
  chain:
    'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  compare: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  myruns: 'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01',
  science: 'M9 3h6M10 3v6.5L4.6 18.2A2 2 0 006.3 21h11.4a2 2 0 001.7-2.8L14 9.5V3M7.5 15h9',
};
</script>
