<!--
  "A longer route might win": the note under a finished Fastest result, on Smart search and the Full
  sweep alike (lib/longerRouteHint.ts decides; this draws). Fastest never searches outside the chosen
  limits; Smart search settles the count inside them itself (`run`), so there this is left for a count
  outside them or one a stopped run never reached. It says when another count may be faster:
    - the instant answer has a faster route (InstantRoute.vue, through stores/instantSummary.ts), or
    - the best route uses the most ascensions that were searched, so it sits at the edge.
  Each note has a button that sets up that ascension count (the screen says how: a chain on the Full
  sweep, a starting chain on Smart search), and the instant answer's note also has "Price this route" (was "Check exactly" until 23 Oct 2026).
  Nothing runs by itself: the player presses Find.
-->
<template>
  <div
    v-if="hints.length"
    class="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3 text-body text-amber-900"
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
          {{ mode === 'start' ? `Start from ${h.count} ascensions` : `Add a box with ${h.count} ascensions` }}
        </button>
        <button
          v-if="h.kind === 'instant' && h.chain && h.chain.length > 1"
          type="button"
          :disabled="disabled"
          class="px-3 py-1.5 rounded-lg border border-amber-700 text-amber-900 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 disabled:opacity-40"
          title="Prices this route with the full simulator, in Exhaustive"
          @click="check(h.chain)"
        >
          Price this route
        </button>
      </div>
      <p v-if="done[h.count]" class="text-small text-amber-800/90" data-test="longer-route-done">
        {{ done[h.count] }}
      </p>
      <p v-if="h.kind === 'instant' && checked" class="text-small text-amber-800/90">{{ checked }}</p>
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
    /** Smart search: the counts its run searched and its limits (store `runCounts`); null elsewhere. */
    run?: { counts: number[]; min: number; max: number } | null;
  }>(),
  { disabled: false, canAdd: true, run: null }
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
    run: props.run,
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
    checked.value = 'Set the first box to this route. Press Run Custom to price it with the full simulator.';
}

function add(count: number): void {
  done[count] = props.onAdd(count);
}
</script>
