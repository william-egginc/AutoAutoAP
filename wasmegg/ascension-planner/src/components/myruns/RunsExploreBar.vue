<!--
  My runs › Your runs: the chip buttons above the list (lib/runsExplore.ts). One row per group that has two values or
  more among the player's runs (Goal, Ascensions, Level, Hours, Sent), then Sort and the stops box, then "N of M runs"
  and Clear filters. Each chip toggles on tap; within a group they are "or". Chips wrap, nothing scrolls sideways,
  and every button is 44 px tall on a phone (32 px from sm up). A thin shell: the list (MyRunsList.vue) holds the
  selection and does the filtering.
-->
<template>
  <div class="space-y-2 rounded-lg border border-indigo-100 bg-white/60 px-3 py-2" role="group" aria-label="Explore your runs" data-testid="runs-explore">
    <div v-for="g in groups" :key="g.id" class="flex flex-wrap items-center gap-1.5" :data-testid="`runs-explore-${g.id}`">
      <span :class="LABEL">{{ g.label }}</span>
      <button
        v-for="c in g.chips"
        :key="c.value"
        type="button"
        :class="[CHIP, c.on ? ON : OFF]"
        :aria-pressed="c.on"
        :aria-label="ariaFor(g.id, c.label, c.count)"
        :data-testid="`runs-chip-${g.id}-${c.value}`"
        @click="emit('toggle', g.id, c.value)"
      >
        {{ c.label }}{{ ' ' }}<span class="font-semibold opacity-60">{{ c.count }}</span>
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5" data-testid="runs-explore-sort">
      <span :class="LABEL">Sort</span>
      <button
        v-for="s in SORTS"
        :key="s.id"
        type="button"
        :class="[CHIP, sort === s.id ? ON : OFF]"
        :aria-pressed="sort === s.id"
        :data-testid="`runs-sort-${s.id}`"
        @click="emit('sort', s.id)"
      >
        {{ s.label }}
      </button>
    </div>
    <label class="flex flex-wrap items-center gap-1.5">
      <span :class="LABEL">Stops</span>
      <input
        :value="stops"
        type="text"
        inputmode="numeric"
        placeholder="200 250"
        class="min-h-[44px] sm:min-h-[32px] w-32 rounded-lg border-slate-300 py-1 text-[12px] font-mono"
        data-testid="runs-explore-stops"
        @input="emit('stops', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <div class="flex flex-wrap items-center gap-2 border-t border-indigo-50 pt-2">
      <span class="text-[12px] font-bold text-indigo-900" aria-live="polite" data-testid="runs-explore-count">{{ countWords(shown, total) }}</span>
      <button
        v-if="active"
        type="button"
        class="min-h-[44px] sm:min-h-[32px] rounded-lg border border-indigo-300 bg-white px-3 text-[12px] font-bold text-indigo-700 hover:bg-indigo-50"
        data-testid="runs-explore-clear"
        @click="emit('clear')"
      >
        Clear filters
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SORTS, countWords, type ChipGroup, type ExploreGroup, type ExploreSort } from '@/lib/runsExplore';

defineProps<{
  groups: ChipGroup[];
  sort: ExploreSort;
  stops: string;
  /** Runs listed, and runs in all. */
  shown: number;
  total: number;
  /** How many picks narrow the list (Clear filters shows from 1). */
  active: number;
}>();
const emit = defineEmits<{
  toggle: [group: ExploreGroup, value: string];
  sort: [sort: ExploreSort];
  stops: [text: string];
  clear: [];
}>();

const LABEL = 'mr-1 sm:min-w-[5.5rem] text-[9px] font-black uppercase tracking-widest text-indigo-700/70';
const CHIP = 'min-h-[44px] sm:min-h-[32px] rounded-full border px-3 text-[12px] font-bold';
const ON = 'border-indigo-400 bg-indigo-50 text-indigo-900';
const OFF = 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300';

function ariaFor(g: ExploreGroup, label: string, count: number): string {
  const what = g === 'asc' ? `${label} ${label === '1' ? 'ascension' : 'ascensions'}` : label;
  return `${what}: ${count} ${count === 1 ? 'run' : 'runs'}`;
}
</script>
