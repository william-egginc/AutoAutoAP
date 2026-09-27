<!--
  A chart legend in HTML: every entry on screen, wrapping as far as it needs (legend.ts says why not
  ECharts' own). With `v-model:hidden`, each entry is a button that turns its series off and on, as
  ECharts' legend did; without it, the legend is a key and nothing more.
-->
<template>
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-slate-500"
    role="group"
    :aria-label="label"
  >
    <template v-for="e in entries" :key="e.id">
      <button
        v-if="hidden"
        type="button"
        class="inline-flex items-center gap-1 rounded -mx-0.5 px-0.5 py-0.5 text-left hover:bg-slate-100"
        :class="hidden.has(e.id) ? 'opacity-40' : ''"
        :aria-pressed="!hidden.has(e.id)"
        :title="e.title ?? (hidden.has(e.id) ? `Show ${e.label}` : `Hide ${e.label}`)"
        @click="emit('update:hidden', toggled(hidden, e.id))"
      >
        <AccountDot v-bind="markOf(e)" /><span :class="hidden.has(e.id) ? 'line-through' : ''">{{ e.label }}</span
        ><span v-if="e.note" class="text-slate-400">{{ e.note }}</span>
      </button>
      <span v-else class="inline-flex items-center gap-1" :title="e.title">
        <AccountDot v-bind="markOf(e)" /><span>{{ e.label }}</span
        ><span v-if="e.note" class="text-slate-400">{{ e.note }}</span>
      </span>
    </template>
    <button
      v-if="hidden && hiddenAmong(hidden, entries).size"
      type="button"
      class="rounded px-1 py-0.5 font-bold text-slate-600 underline decoration-dotted hover:bg-slate-100"
      @click="emit('update:hidden', new Set())"
    >
      show all
    </button>
  </div>
</template>

<script setup lang="ts">
import AccountDot from './AccountDot.vue';
import { hiddenAmong, toggled, type LegendEntry } from './legend';

withDefaults(
  defineProps<{
    entries: LegendEntry[];
    /** Ids turned off. Pass it (`v-model:hidden`) to make the entries buttons. */
    hidden?: ReadonlySet<string> | null;
    /** What a screen reader calls the group. */
    label?: string;
  }>(),
  { hidden: null, label: 'Legend' }
);

const emit = defineEmits<{ 'update:hidden': [hidden: Set<string>] }>();

function markOf(e: LegendEntry) {
  return { index: e.index, color: e.color, symbol: e.symbol, hollow: e.hollow, line: e.line, size: e.size };
}
</script>
