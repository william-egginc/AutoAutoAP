<!--
  The four top tabs (lib/siteNav.ts), in the original buttons' style: the user asked to keep those
  (30 Sept), so the same pill, sizes, icons and colours, with the BETA badge on the Auto Planner.
  Sits where the tabs always sat, under the player ID in the header, and App shows the same row just
  below the header when it's folded away (the Auto Planner folds it).
-->
<template>
  <div class="space-y-1">
    <div class="flex justify-center">
      <!-- Narrow windows: a 2 x 2 grid of equal cells across the bar (four tabs in one row need about
           700px, and a free wrap left Science alone on a second row at ~700px and three ragged rows at
           375). Below sm the icons go, so each label fits its cell on one line at 375. From md up, one row;
           the wide padding only from lg, so the row fits at 768. -->
      <div
        class="bg-slate-50 p-1 sm:p-1.5 rounded-2xl border border-slate-200/50 shadow-sm grid grid-cols-2 w-full md:flex md:w-auto md:justify-center gap-1"
      >
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="min-w-0 px-2 sm:px-4 lg:px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider sm:tracking-[0.15em] transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 text-center leading-tight"
          :class="current === t.tab ? t.on : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'"
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
            class="shrink-0 bg-indigo-500 text-[8px] px-1.5 py-0.5 rounded-md sm:ml-1 border border-indigo-400/30"
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

/** The original tabs' icons (pencil, lightning, bag), and a flask for Science. */
const ICONS: Record<Section, string> = {
  manual:
    'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  auto: 'M13 10V3L4 14h7v7l9-11h-7z',
  compare: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  science: 'M9 3h6M10 3v6.5L4.6 18.2A2 2 0 006.3 21h11.4a2 2 0 001.7-2.8L14 9.5V3M7.5 15h9',
};
</script>
