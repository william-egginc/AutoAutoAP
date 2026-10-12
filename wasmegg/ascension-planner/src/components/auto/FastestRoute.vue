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
      <h2 class="text-2xl font-black text-slate-900">{{ fastestName(store.finalTE) }}</h2>
      <p class="text-sm text-slate-600">
        Finds the checkpoints that get you to {{ store.finalTE }} TE soonest, from your save and your setup. Plans
        include the weekly Research Sale and the Monday 2× earnings boost, the same as Your plan; other game events aren't
        simulated.
      </p>
    </div>

    <!-- One order on both search tabs: Your setup, the instant answer, How thorough, then the panel
         (How ... works, and the mode's content). By a date adds The deadline after Your setup. -->
    <YourSetup screen="fastest" />

    <!-- When should I start? For a player coming back after a break: folded, under Your setup
         (StartTimeCard.vue), on the instant answer's best route unless another is picked. -->
    <StartTimeCard />

    <!-- The instant answer from the precomputed table (the precompute fork): every route, at once.
         Check exactly hands a route to the Full sweep, which prices it with the full simulator. -->
    <InstantRoute @check="checkExactly" />

    <!-- Search around this answer (with its level bar) or the exhaustive search, right under the instant
         answer (SearchModeChooser.vue, decision A); the search and its results follow. -->
    <SearchModeChooser
      :model-value="depth"
      around="smart"
      exhaustive="full"
      levels
      :around-blurb="AROUND_BLURB"
      :exhaustive-blurb="EXHAUSTIVE_BLURB"
      :running="lockedTo === 'smart' || lockedTo === 'full' ? lockedTo : null"
      @update:model-value="pick"
    />

    <!-- A search running elsewhere: this depth greyed out under a line saying so (the cards above
         stay clickable, to switch back). -->
    <RunningElsewhere v-if="blockedBy" :running="blockedBy" :here="depth === 'smart' ? NAMES.smart : NAMES.full" />
    <div :class="blockedBy ? 'opacity-40 pointer-events-none select-none' : ''" :inert="blockedBy ? true : undefined">
      <ChainSearchPanel v-if="depth === 'smart'" :player-id="playerId" level-elsewhere @check-exactly="checkExactly" />
      <InsanePanel v-else :player-id="playerId" goal="fastest" @update:goal="onGoal" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { NAMES, fastestName, type Depth } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';
import RunningElsewhere from './RunningElsewhere.vue';
import SearchModeChooser from './SearchModeChooser.vue';
import InstantRoute from './InstantRoute.vue';
import YourSetup from './YourSetup.vue';
import StartTimeCard from './StartTimeCard.vue';
import { useUIStore } from '@/stores/ui';
import { writeSearchMode } from '@/lib/searchMode';

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
const ui = useUIStore();

/** The instant answer's Check exactly: the route's checkpoints as one-value bands in the Full sweep,
 *  so the sweep prices exactly that route with the full simulator. */
function checkExactly(chain: number[]): void {
  ui.fullSweepBands = chain.slice(0, -1).join('; ');
  emit('update:depth', 'full');
}

/** A card picked: that depth, remembered for the next visit (lib/searchMode.ts). */
function pick(d: Depth): void {
  writeSearchMode('fastest', d === 'full' ? 'advanced' : 'simple');
  emit('update:depth', d);
}

/** The Full sweep's own goal switch (carrying on a date run from here): App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}

const ChainSearchPanel = safeAsyncComponent(() => import('./ChainSearchPanel.vue'));
const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

/** What each way does, in the chooser (decision A, 12 Oct 2026). */
const AROUND_BLURB =
  "Starts from the instant answer's route and looks for a faster one nearby, with the full simulator on your save. Pick how hard it looks: Fast takes minutes.";
const EXHAUSTIVE_BLURB =
  'You set a box of TEs for each ascension and it tries every route in them, so nothing inside is missed. Hours, sometimes overnight.';
</script>
