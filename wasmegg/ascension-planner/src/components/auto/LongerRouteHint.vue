<!--
  "A longer route might win": the note under a finished Fastest result, on Smart search and the Full
  sweep alike (lib/longerRouteHint.ts decides; this draws). Fastest is meant to be fast, not best, so
  it never searches more ascensions than were chosen; this says when one more may be faster:
    - the instant answer has a faster route (InstantRoute.vue, through stores/instantSummary.ts), or
    - the best route uses the most ascensions that were searched, so it sits at the edge.
  Each note has a button that sets up that ascension count (the screen says how: a chain on the Full
  sweep, a starting chain on Smart search), and the instant answer's note also has "Check exactly".
  Nothing runs by itself: the player presses Find.
-->
<template>
  <div
    v-if="hints.length"
    class="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3 text-[11px] text-amber-900 leading-relaxed"
    data-test="longer-route-hint"
  >
    <div v-for="h in hints" :key="h.kind" class="space-y-1.5" :data-test="`longer-route-${h.kind}`">
      <p>{{ h.text }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="canAdd"
          type="button"
          :disabled="disabled"
          class="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800 disabled:opacity-40"
          @click="add(h.count)"
        >
          {{ mode === 'start' ? `Start from ${h.count} ascensions` : `Add a chain with ${h.count} ascensions` }}
        </button>
        <button
          v-if="h.kind === 'instant' && h.chain && h.chain.length > 1"
          type="button"
          :disabled="disabled"
          class="px-3 py-1.5 rounded-lg border border-amber-700 text-amber-900 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 disabled:opacity-40"
          title="Sends this route to the Full sweep, which prices it with the full simulator"
          @click="check(h.chain)"
        >
          Check exactly
        </button>
      </div>
      <p v-if="done[h.count]" class="text-[10px] text-amber-800/90" data-test="longer-route-done">
        {{ done[h.count] }}
      </p>
      <p v-if="h.kind === 'instant' && checked" class="text-[10px] text-amber-800/90">{{ checked }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInstantSummaryStore } from '@/stores/instantSummary';
import { longerRouteHints } from '@/lib/longerRouteHint';

const props = withDefaults(
  defineProps<{
    /** The result is still being worked on: no notes until it stops. */
    running: boolean;
    /** The buttons are off while something else is busy. */
    disabled?: boolean;
    /** The screen can set up another count (the Full sweep, unless it was opened from a sweep link). */
    canAdd?: boolean;
    /** 'chain': "Add a chain with N ascensions" (Full sweep). 'start': "Start from N ascensions" (Smart search). */
    mode: 'chain' | 'start';
    /** Sets up that count and says what it did (shown under the note). */
    onAdd: (count: number) => string;
  }>(),
  { disabled: false, canAdd: true }
);
const emit = defineEmits<{ check: [chain: number[]] }>();

const store = useChainSearchStore();
const instant = useInstantSummaryStore();
/** What each button said it did, by count. */
const done = reactive<Record<number, string>>({});
/** What Check exactly said it did (on the Full sweep; Smart search moves to the Full sweep itself). */
const checked = ref('');

const hints = computed(() => {
  if (props.running || !(store.bestDays > 0) || !store.bestChain.length) return [];
  // The priced chains are plain arrays, so read again whenever the best changes or a run ends.
  return longerRouteHints({
    bestChain: store.bestChain,
    bestSeconds: store.bestDays * 86400,
    searchedCounts: store.pricedCounts(),
    instant: instant.fastest,
  });
});

// A new run: what the buttons said last time no longer holds.
watch(
  () => props.running,
  r => {
    if (!r) return;
    for (const k of Object.keys(done)) delete done[Number(k)];
    checked.value = '';
  }
);

function check(chain: number[]): void {
  emit('check', chain);
  if (props.mode === 'chain')
    checked.value = 'Set the first chain to this route. Press Find to price it with the full simulator.';
}

function add(count: number): void {
  done[count] = props.onAdd(count);
}
</script>
