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
        include the weekly Research Sale and the Monday 2× earnings boost, the same as {{ NAMES.classic }}; other game events aren't
        simulated.
      </p>
    </div>

    <!-- One order on both search screens: the instant answer, then the two ways to search, one shown at a
         time (SearchTabs.vue; Allan, 14 Oct: "too many boxes, use one at a time"). Your setup is the
         floating Setup button (SetupDock.vue): here only the save's problems, if any. "When should I
         start?" is in Science (#/science/start). -->
    <YourSetup screen="fastest" issues-only />

    <!-- The instant answer from the precomputed table (the precompute fork): every route, at once.
         Check exactly prices them on your save; its stronger check shows in the Search nearby tab. -->
    <CollapsibleSection id="instant" title="Instant answer" :summary="lines.instant">
      <InstantRoute stronger-to="#stronger-check-results" @check="checkExactly" />
    </CollapsibleSection>
    <!-- The answers side by side (SearchCompare.vue): instant answer, stronger check, Exhaustive. -->
    <SearchCompare v-if="SHOW_COMPARE" goal="fastest" />

    <!-- A search running on another screen (By a date, a start-time sweep): greyed out under a line. -->
    <div
      class="space-y-4"
      :class="blockedBy ? 'opacity-40 pointer-events-none select-none' : ''"
      :inert="blockedBy ? true : undefined"
    >
      <!-- Both tabs stay mounted (v-show): a run, its progress block and #stronger-check-results (the
           instant answer teleports the stronger check there) live on in the hidden one. -->
      <SearchTabs
        screen="fastest"
        :intro="TAB_INTRO"
        :running="{ nearby: smartRunning, exhaustive: fullRunning }"
        @pick="t => emit('update:depth', t === 'exhaustive' ? 'full' : 'smart')"
      >
        <template #nearby>
          <!-- The stronger check's results, and at Fast and above the search around the instant answer,
               its controls and results (StrongerBox.vue; the user, 12 Oct). -->
          <StrongerBox v-slot="{ level }" goal="fastest" in-tab :running="smartRunning" :estimates="levelEstimates">
            <ChainSearchPanel
              v-if="level !== 'light'"
              :player-id="playerId"
              embedded
              level-elsewhere
              @check-exactly="checkExactly"
            />
          </StrongerBox>
        </template>
        <template #exhaustive>
          <!-- Exhaustive: its boxes, run controls and results (InsanePanel.vue). -->
          <section id="exhaustive" class="space-y-3 scroll-mt-24">
            <ExhaustivePromise goal="fastest" />
            <InsanePanel :player-id="playerId" goal="fastest" embedded @update:goal="onGoal" />
          </section>
        </template>
      </SearchTabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { thisDevice } from '@/search/device';
import { computed, nextTick, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { NAMES, fastestName, type Depth } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';
import StrongerBox from './StrongerBox.vue';
import CollapsibleSection from './CollapsibleSection.vue';
import SearchTabs from './SearchTabs.vue';
import { revealRunTab, selectSearchTab, type SearchTabId } from '@/lib/searchTab';
import { useSearchSnapshots } from '@/composables/useSearchSnapshots';
import { routeLine } from '@/search/sectionSummary';
import { showDateTime } from '@/lib/displayTime';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import SearchCompare from './SearchCompare.vue';
import { SHOW_COMPARE } from '@/lib/features';
import InstantRoute from './InstantRoute.vue';
import ExhaustivePromise from './ExhaustivePromise.vue';
import YourSetup from './YourSetup.vue';
import { useUIStore } from '@/stores/ui';
import { useStrongerStore, type LevelEstimate, type StrongerLevel } from '@/stores/stronger';
import { formatHours } from '@/search/exhaustive';
import { plural } from '@/lib/format';

const props = defineProps<{
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
const lines = computed(() => ({
  instant: routeLine('fastest', stronger.instant.fastest, show, 'working out…'),
}));
/** What each Nearby routes level would cost on this computer (store `smartEstimate`). */
const levelEstimates = computed<Partial<Record<StrongerLevel, LevelEstimate>>>(() => {
  const out: Partial<Record<StrongerLevel, LevelEstimate>> = {};
  for (const l of ['quick', 'normal', 'thorough'] as const) {
    const e = store.smartEstimate(l);
    const t = formatHours(e.seconds / 3600);
    out[l] = {
      short: `~${t}`,
      line: `Up to about ${t} on ${thisDevice()} (${plural(store.workerBudget, 'worker')}, ${
        e.measured ? `${thisDevice()}'s measured speed` : 'the typical speed'
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
  // The Exhaustive tab first: a hidden tab has no place on the page to scroll to.
  selectSearchTab('fastest', 'exhaustive');
  void nextTick(() => document.getElementById('exhaustive')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** The exhaustive search's own goal switch (carrying on a date run from here): App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}

const ChainSearchPanel = safeAsyncComponent(() => import('./ChainSearchPanel.vue'));
const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

/** The first lines of each tab (SearchTabs.vue): what it does, when to use it, how long it takes. The
 *  Exhaustive one is the old section's blurb, with when to use it in front. */
const TAB_INTRO: Record<SearchTabId, string> = {
  nearby:
    `Start here. It checks the instant answer on your save and, at Fast and above, searches the routes near it. Light takes seconds to a few minutes; each other level's time on ${thisDevice()} is under its name.`,
  exhaustive:
    "For proving an answer, not for finding a much better one: it proves the best inside the boxes you set, and in players' runs so far it added minutes to hours, not days. You set a box of TEs for each ascension and it tries every route in them. In players' runs that was about 1 minute per 70 routes on an 8-core computer, so big boxes take hours.",
};

/** The address and the tab: #/auto/fastest/full (a sweep link, an old ?insane=1 link, Check exactly)
 *  opens Exhaustive, and a tab picked by hand changes the address (@pick above). Opened on the plain
 *  address, the tab remembered from last time wins (the address is left alone then: changing it
 *  counts as picking a tab in App.vue, which would drop a link's hold on the page while a save loads). */
watch(
  () => props.depth,
  (d, before) => {
    if (d === 'full') selectSearchTab('fastest', 'exhaustive');
    else if (before !== undefined) selectSearchTab('fastest', 'nearby');
  },
  { immediate: true }
);

/** A run that starts (a carry-on, a link) or is going when the screen opens shows its own tab; what the
 *  player picked last is still what the next visit opens on. */
watch(
  () => (smartRunning.value ? 'smart' : fullRunning.value ? 'full' : null),
  k => {
    if (k) revealRunTab(k, false);
  },
  { immediate: true }
);
</script>
