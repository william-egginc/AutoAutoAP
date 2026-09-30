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
          class="rounded-xl border-2 p-4 text-left transition-colors"
          :class="
            depth === d.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
          "
          @click="emit('update:depth', d.id)"
        >
          <span class="flex items-center gap-2 text-base font-black text-slate-900"
            >{{ d.label }}
            <span
              v-if="lockedTo === d.id"
              class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest"
              >Running</span
            ></span
          >
          <span class="block mt-1 text-[12px] text-slate-600 leading-relaxed">{{ d.blurb }}</span>
          <span class="block mt-2 text-[10px] font-black text-indigo-700 uppercase tracking-widest">{{ d.time }}</span>
        </button>
      </div>
    </div>

    <!-- A search running elsewhere: this depth greyed out under a line saying so (the cards above
         stay clickable, to switch back). -->
    <RunningElsewhere v-if="blockedBy" :running="blockedBy" :here="depth === 'smart' ? NAMES.smart : NAMES.full" />
    <div :class="blockedBy ? 'opacity-40 pointer-events-none select-none' : ''" :inert="blockedBy ? true : undefined">
      <ChainSearchPanel v-if="depth === 'smart'" :player-id="playerId" />
      <InsanePanel v-else :player-id="playerId" goal="fastest" @update:goal="onGoal" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { NAMES, type Depth } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';
import RunningElsewhere from './RunningElsewhere.vue';

defineProps<{
  playerId: string;
  depth: Depth;
  /** The screen a running search belongs to ('smart', 'full' or 'by-date'): its card says Running. */
  lockedTo: string | null;
  /** The running search's name when it isn't this depth's: the panel is shown greyed out. */
  blockedBy: string;
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
