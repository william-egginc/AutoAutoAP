<!--
  Fastest route: one screen, two depths (the unified layout, phase 3). Smart search (was Chain
  Search) starts from a chain and homes in on faster ones; the Full sweep (was Insane mode's fastest
  goal) prices every route in a box. Same question, same setup, same Find bar and result card
  (FindBar.vue, RouteResultCard.vue); what differs is the middle, where Smart search asks how hard to
  look and the Full sweep asks for the box.

  The depth lives in the address (#/auto/fastest vs #/auto/fastest/full, lib/siteNav.ts), and App
  owns it with the lock that stops switching while a search runs: both depths drive one store, and
  one would show the other's progress as its own.
-->
<template>
  <div class="max-w-4xl mx-auto space-y-4">
    <div>
      <h2 class="text-2xl font-black text-slate-900">Fastest route to {{ store.finalTE }}</h2>
      <p class="text-sm text-slate-600">
        Finds the checkpoints that get you to {{ store.finalTE }} TE soonest, from your save and your setup.
      </p>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">How thorough</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="How thorough">
        <button
          v-for="d in DEPTHS"
          :key="d.id"
          type="button"
          role="radio"
          :aria-checked="depth === d.id"
          :disabled="!!lockedTo && lockedTo !== d.id"
          :title="
            lockedTo && lockedTo !== d.id ? 'A search is running on the other one. Stop it there first.' : undefined
          "
          class="rounded-xl border-2 p-4 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="
            depth === d.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
          "
          @click="emit('update:depth', d.id)"
        >
          <span class="block text-base font-black text-slate-900">{{ d.label }}</span>
          <span class="block mt-1 text-[12px] text-slate-600 leading-relaxed">{{ d.blurb }}</span>
          <span class="block mt-2 text-[10px] font-black text-indigo-700 uppercase tracking-widest">{{ d.time }}</span>
        </button>
      </div>
    </div>

    <ChainSearchPanel v-if="depth === 'smart'" :player-id="playerId" />
    <InsanePanel v-else :player-id="playerId" goal="fastest" @update:goal="onGoal" />
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { NAMES, type Depth } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';

defineProps<{
  playerId: string;
  depth: Depth;
  /** The screen a running search belongs to ('smart', 'full' or 'by-date'); any other card is
   *  locked until it stops. */
  lockedTo: string | null;
}>();
const emit = defineEmits<{ 'update:depth': [depth: Depth]; goal: [goal: 'fastest' | 'deadline'] }>();

const store = useChainSearchStore();

/** The Full sweep's own goal switch (carrying on a date run from here): App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}

const ChainSearchPanel = safeAsyncComponent(() => import('./ChainSearchPanel.vue'));
const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

const DEPTHS: { id: Depth; label: string; blurb: string; time: string }[] = [
  {
    id: 'smart',
    label: NAMES.smart,
    blurb: 'Starts from your chain and homes in on faster checkpoints. You pick how hard it looks.',
    time: 'Minutes to a few hours',
  },
  {
    id: 'full',
    label: NAMES.full,
    blurb:
      'Prices every route in a range you set, so the answer is the best in that range. Queue several chains in one click.',
    time: 'Hours, sometimes overnight',
  },
];
</script>
