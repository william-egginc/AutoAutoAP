<!--
  "WHAT TO DO NOW" (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026): the region under the answer,
  always in the same place. A search running on this screen: its progress and "Show search ›", which opens More at the
  search. Else a route followed for this goal: that it is followed, and "Open My runs ›", where the next steps are.
  Else the hint to press Follow this route. Words: lib/layoutWords.ts (DRAFT).
-->
<template>
  <section
    class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-2 text-body text-slate-800"
    data-region="now"
    data-testid="now-line"
    :data-state="state"
  >
    <template v-if="state === 'running'">
      <span class="tabular-nums" data-testid="now-line-text">{{ nowSearchRunning(runningKind, runningPercent) }}</span>
      <button
        type="button"
        class="inline-flex items-center min-h-[44px] font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        data-testid="now-line-show-search"
        @click="emit('show-search')"
      >
        {{ NOW_SHOW_SEARCH }}
      </button>
    </template>
    <template v-else-if="state === 'following'">
      <span class="tabular-nums" data-testid="now-line-text">{{ FOLLOWING }}{{ ' ' }}<b>{{ followedChain }}</b></span>
      <a
        href="#/myruns"
        class="inline-flex items-center min-h-[44px] font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        data-testid="now-line-myruns"
        >{{ NOW_OPEN_MY_RUNS }}</a
      >
    </template>
    <span v-else data-testid="now-line-text">{{ NOW_BEFORE_FOLLOW }}</span>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FOLLOWING, NOW_BEFORE_FOLLOW, NOW_OPEN_MY_RUNS, NOW_SHOW_SEARCH, nowSearchRunning } from '@/lib/layoutWords';
import { NAMES } from '@/lib/siteNav';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';

const props = defineProps<{
  screen: 'fastest' | 'by-date';
  /** The goal this screen follows for (lib/follow.ts screenGoalKey). */
  goalKey: string;
}>();
const emit = defineEmits<{ 'show-search': [] }>();

const store = useChainSearchStore();
const follows = useFollowStore();

/** The run on this screen, by its progress bar's kind: Fastest's two searches, or By a date's. */
const progress = computed(() => {
  const p = store.runProgress;
  if (!p) return null;
  if (props.screen === 'fastest' ? p.kind === 'smart' || p.kind === 'full' : p.kind === 'by-date') return p;
  return null;
});
const runningKind = computed(() => {
  const p = progress.value;
  if (!p) return '';
  const custom = p.kind === 'full' || (p.kind === 'by-date' && !store.deadlineRunSimple);
  if (custom) return NAMES.full;
  return store.effort === 'quick' ? 'Fast' : 'Exact';
});
const runningPercent = computed(() => {
  const p = progress.value;
  if (!p) return 0;
  if (typeof p.percent === 'number') return p.percent;
  return p.total ? Math.min(100, (100 * p.done) / p.total) : 0;
});
const followedChain = computed(() => (follows.followed(props.goalKey)?.chain ?? []).join(' → '));
const state = computed<'running' | 'following' | 'hint'>(() =>
  progress.value ? 'running' : followedChain.value ? 'following' : 'hint'
);
</script>
