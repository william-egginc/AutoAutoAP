<!--
  The five top tabs (lib/siteNav.ts), in the original buttons' style: the user asked to keep those
  (30 Sept), so the same pill, sizes, icons and colours, with the BETA badge on the Auto Planner.
  Sits where the tabs always sat, under the player ID in the header, and App shows the same row just
  below the header when it's folded away (the Auto Planner folds it).
-->
<template>
  <div class="space-y-1">
    <div class="flex justify-center">
      <!-- Narrow windows: two rows on a 6-column grid, the two planners on the first (3 columns each) and
           Compare, My runs and Science on the second (2 each), so no tab is left alone on a row (five tabs
           in one row need about 900px with the icons; a free wrap left ragged rows). Below sm the icons go,
           so each label fits its cell at 375. From lg up, one row. The second row's tabs share its six columns
           (SECOND_ROW), however many are shown: My runs always, Leaderboard and Science when turned on in Setup.
           Each tab is at least 44 px tall below sm (Jordan, 21 Oct 2026); from sm up, the old size. -->
      <div
        class="bg-slate-50 p-1 sm:p-1.5 rounded-2xl border border-slate-200/50 shadow-sm grid grid-cols-6 w-full lg:flex lg:w-auto lg:justify-center gap-1"
      >
        <button
          v-for="(t, i) in tabs"
          :key="t.id"
          type="button"
          :class="[
            i < 2 ? 'col-span-3' : (SECOND_ROW[tabs.length - 2] ?? 'col-span-2'),
            current === t.tab ? t.on : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
          ]"
          class="min-w-0 min-h-[44px] sm:min-h-0 px-2 sm:px-4 lg:px-6 py-2.5 rounded-xl label transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 text-center leading-tight"
          :aria-current="current === t.tab ? 'page' : undefined"
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
          <span
            v-if="t.id === 'auto'"
            class="shrink-0 bg-indigo-500 text-small px-1.5 py-0.5 rounded-md sm:ml-1 border border-indigo-400/30"
            :class="current === t.tab ? 'text-white' : 'text-white/90'"
            >BETA</span
          >
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Section } from '@/lib/siteNav';

defineProps<{
  tabs: { id: Section; tab: string; label: string; on: string }[];
  /** The ui store's plannerTab. */
  current: string;
}>();
const emit = defineEmits<{ select: [section: Section] }>();
/** The second row's span per tab, by how many tabs it has (written out whole so Tailwind keeps the classes). */
const SECOND_ROW: Record<number, string> = { 1: 'col-span-6', 2: 'col-span-3', 3: 'col-span-2' };

/** The original tabs' icons (pencil, lightning, bag), a list for My runs and a flask for Science. */
const ICONS: Record<Section, string> = {
  manual:
    'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  auto: 'M13 10V3L4 14h7v7l9-11h-7z',
  compare: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  myruns: 'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01',
  science: 'M9 3h6M10 3v6.5L4.6 18.2A2 2 0 006.3 21h11.4a2 2 0 001.7-2.8L14 9.5V3M7.5 15h9',
};
</script>
