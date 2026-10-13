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
        Finds the stops that get you to {{ store.finalTE }} TE soonest, from your save and your setup. Plans
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
         Check exactly prices them on your save; its stronger check shows in the box below. -->
    <CollapsibleSection id="instant" title="Instant answer" :summary="lines.instant">
      <InstantRoute stronger-to="#stronger-check-results" @check="checkExactly" />
    </CollapsibleSection>
    <!-- The answers side by side (SearchCompare.vue): instant answer, stronger check, Exhaustive. -->
    <SearchCompare v-if="SHOW_COMPARE" goal="fastest" />

    <!-- A search running on another screen (By a date, a start-time sweep): greyed out under a line. -->
    <RunningElsewhere v-if="blockedBy" :running="blockedBy" :here="fastestName(store.finalTE)" />
    <div
      class="space-y-4"
      :class="blockedBy ? 'opacity-40 pointer-events-none select-none' : ''"
      :inert="blockedBy ? true : undefined"
    >
      <!-- Stronger check: the stronger check's results, and at Fast and above the search around the
           instant answer, its controls and results, in one box (StrongerBox.vue; the user, 12 Oct). -->
      <CollapsibleSection id="stronger" title="Stronger check" :summary="lines.stronger">
        <StrongerBox v-slot="{ level }" goal="fastest" :running="smartRunning" :estimates="levelEstimates">
          <ChainSearchPanel
            v-if="level !== 'light'"
            :player-id="playerId"
            embedded
            level-elsewhere
            @check-exactly="checkExactly"
          />
        </StrongerBox>
      </CollapsibleSection>

      <!-- Exhaustive, on the page as it is: its boxes, run controls and results (InsanePanel.vue). -->
      <CollapsibleSection id="exhaustive" :title="EXHAUSTIVE_TITLE" :summary="lines.exhaustive">
      <section id="exhaustive" class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 scroll-mt-24">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-base font-black text-slate-900">{{ EXHAUSTIVE_TITLE }}</h3>
          <span
            v-if="fullRunning"
            class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest"
            >Running</span
          >
        </div>
        <p class="text-[12px] text-slate-600 leading-relaxed">{{ EXHAUSTIVE_BLURB }}</p>
        <ExhaustivePromise goal="fastest" />
        <InsanePanel :player-id="playerId" goal="fastest" embedded @update:goal="onGoal" />
      </section>
      </CollapsibleSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { EXHAUSTIVE_TITLE, fastestName, type Depth } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';
import RunningElsewhere from './RunningElsewhere.vue';
import StrongerBox from './StrongerBox.vue';
import CollapsibleSection from './CollapsibleSection.vue';
import { useSearchSnapshots } from '@/composables/useSearchSnapshots';
import { routeLine } from '@/search/sectionSummary';
import { pick } from '@/search/compareAnswers';
import { showDateTime } from '@/lib/displayTime';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import SearchCompare from './SearchCompare.vue';
import { SHOW_COMPARE } from '@/lib/features';
import InstantRoute from './InstantRoute.vue';
import ExhaustivePromise from './ExhaustivePromise.vue';
import YourSetup from './YourSetup.vue';
import StartTimeCard from './StartTimeCard.vue';
import { useUIStore } from '@/stores/ui';
import { useStrongerStore, type LevelEstimate, type StrongerLevel } from '@/stores/stronger';
import { formatHours } from '@/search/exhaustive';
import { plural } from '@/lib/format';

defineProps<{
  playerId: string;
  /** The address's depth (#/auto/fastest/full): both searches are on the page now; it only says
   *  which one a link (or the progress bar's Jump to it) means. */
  depth: Depth;
  /** The screen a running search belongs to. */
  lockedTo: string | null;
  /** The running search's name when it runs on another screen: the searches are shown greyed out. */
  blockedBy: string;
}>();
const emit = defineEmits<{ 'update:depth': [depth: Depth]; goal: [goal: 'fastest' | 'deadline'] }>();

const store = useChainSearchStore();
const ui = useUIStore();
const stronger = useStrongerStore();

// The hidden sections' one-line results (CollapsibleSection.vue).
useSearchSnapshots('fastest');
const planner = useAutoPlannerStore();
const show = (u: number) => showDateTime(u, planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
const LEVEL_NAMES: Record<string, string> = { light: 'Light', quick: 'Fast', normal: 'Exact', thorough: 'Very high' };
const lines = computed(() => ({
  instant: routeLine('fastest', stronger.instant.fastest, show, 'working out…'),
  stronger: `${LEVEL_NAMES[stronger.level]}: ${routeLine(
    'fastest',
    pick('fastest', stronger.strongerBest.fastest, stronger.level === 'light' ? null : stronger.lastSearch.smart),
    show,
    'nothing beats the instant answer yet'
  )}`,
  exhaustive: routeLine('fastest', stronger.lastSearch.full, show),
}));
/** What each Nearby routes level would cost on this computer (store `smartEstimate`). */
const levelEstimates = computed<Partial<Record<StrongerLevel, LevelEstimate>>>(() => {
  const out: Partial<Record<StrongerLevel, LevelEstimate>> = {};
  for (const l of ['quick', 'normal', 'thorough'] as const) {
    const e = store.smartEstimate(l);
    const t = formatHours(e.seconds / 3600);
    out[l] = {
      short: `~${t}`,
      line: `Up to about ${t} on this computer (${plural(store.workerBudget, 'worker')}, ${
        e.measured ? "this computer's measured speed" : 'the typical speed'
      }): at most ~${e.chains.toLocaleString()} routes; it usually stops sooner.`,
    };
  }
  return out;
});
const smartRunning = computed(() => store.isRunning && store.chainRunKind === 'smart');
const fullRunning = computed(() => (store.isRunning && store.chainRunKind === 'full') || store.sweepQueue.at >= 0);

// The level bar and the Smart search's effort are one setting at Fast and above.
watch(
  () => stronger.level,
  l => {
    if ((l === 'quick' || l === 'normal' || l === 'thorough') && !store.isRunning) store.effort = l;
  },
  { immediate: true }
);

/** The instant answer's Check exactly: the route's checkpoints as one-value bands in the exhaustive
 *  search below, which prices exactly that route with the full simulator; the page goes there. */
function checkExactly(chain: number[]): void {
  ui.fullSweepBands = chain.slice(0, -1).join('; ');
  emit('update:depth', 'full');
  void nextTick(() => document.getElementById('exhaustive')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** The exhaustive search's own goal switch (carrying on a date run from here): App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}

const ChainSearchPanel = safeAsyncComponent(() => import('./ChainSearchPanel.vue'));
const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

const EXHAUSTIVE_BLURB =
  'You set a box of TEs for each ascension and it tries every route in them, so nothing inside is missed. In players\' runs that was about 1 minute per 70 routes on an 8-core computer (per 120 on 16), so big boxes take hours.';
</script>
