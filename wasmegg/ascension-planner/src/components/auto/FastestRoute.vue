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
      <h1 class="text-headline font-black text-slate-900">{{ fastestName(store.finalTE) }}</h1>
      <p class="text-body text-slate-600 max-w-prose">
        Finds the stops that get you to {{ store.finalTE }} TE soonest, from your save and Setup. Plans
        include the weekly Research Sale and the Monday 2× earnings boost, the same as {{ NAMES.classic }}; other game events aren't
        simulated.
      </p>
    </div>

    <!-- One order on both search screens: the instant answer, then the two ways to search, one shown at a
         time (SearchPanel.vue: Fast | Exact | Custom, 22 Oct; was two tabs, Allan, 14 Oct). Your setup is the
         floating Setup button (SetupDock.vue): here only the save's problems, if any. "When should I
         start?" is in Science (#/science/start). -->
    <YourSetup screen="fastest" issues-only />

    <!-- The instant answer from the precomputed table (the precompute fork): every route, at once, instant
         numbers only. The search panel below prices routes on your save; the answer points to its result. -->
    <CollapsibleSection id="instant" title="Instant answer" :summary="lines.instant">
      <!-- No instant answer for the player's TE: it points to By a date's quick estimate (`by-date`). Never nothing:
           a card that can't be drawn says so (InstantGuard.ts). -->
      <InstantGuard>
        <InstantRoute
          share-to="#search-share-fastest"
          @check="checkExactly"
          @state="st => (instantLoad = st)"
          @unloaded="u => (instantUnloaded = u)"
          @by-date="emit('by-date')"
        />
      </InstantGuard>
    </CollapsibleSection>
    <!-- The answers side by side (SearchCompare.vue): instant answer, stronger check, Exhaustive. -->
    <SearchCompare v-if="SHOW_COMPARE" goal="fastest" />

    <!-- A search running on another screen (By a date, a start-time sweep): greyed out under a line. -->
    <div
      class="space-y-4"
      :class="blockedBy ? 'opacity-40 pointer-events-none select-none' : ''"
      :inert="blockedBy ? true : undefined"
    >
      <!-- The search panel (SearchPanel.vue, 22 Oct): Fast | Exact | Custom. Both of its parts stay mounted
           (v-show): a run and its progress block live on in the hidden one. -->
      <SearchPanel
        screen="fastest"
        :player-id="playerId"
        :running="smartRunning || fullRunning"
        :stopping="store.isRunning && store.stopRequested"
        :estimates="levelEstimates"
        @pick="o => emit('update:depth', o === 'custom' ? 'full' : 'smart')"
      >
        <template #nearby>
          <!-- Fast and Exact: what they do, and the search around the instant answer, its controls and
               results (StrongerBox.vue). -->
          <StrongerBox goal="fastest" :running="smartRunning" :estimates="levelEstimates">
            <ChainSearchPanel
              :player-id="playerId"
              embedded
              level-elsewhere
              @check-exactly="checkExactly"
              @open-custom="openCustom"
            />
          </StrongerBox>
        </template>
        <template #custom>
          <!-- Custom is Exhaustive: its boxes, run controls and results (InsanePanel.vue), unchanged. -->
          <section id="exhaustive" class="space-y-3 scroll-mt-24">
            <p class="text-body text-slate-700" data-testid="custom-intro">{{ CUSTOM_INTRO }}</p>
            <ExhaustivePromise goal="fastest" />
            <InsanePanel :player-id="playerId" goal="fastest" embedded @update:goal="onGoal" />
          </section>
        </template>
      </SearchPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { thisDevice } from '@/search/device';
import { computed, nextTick, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { NAMES, fastestName, type Depth } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';
import StrongerBox from './StrongerBox.vue';
import CollapsibleSection from './CollapsibleSection.vue';
import InstantGuard from './InstantGuard';
import SearchPanel from './SearchPanel.vue';
import { revealRunTab, selectSearchTab } from '@/lib/searchTab';
import { useSearchSnapshots } from '@/composables/useSearchSnapshots';
import { routeLine } from '@/search/sectionSummary';
import { NO_INSTANT_SUMMARY, UNLOADED_INSTANT_SUMMARY, type InstantState } from '@/search/autoWiden';
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
const emit = defineEmits<{
  'update:depth': [depth: Depth];
  goal: [goal: 'fastest' | 'deadline'];
  /** No instant answer here: By a date, for its quick estimate (NoInstantAnswer.vue). */
  'by-date': [];
}>();

const store = useChainSearchStore();
const ui = useUIStore();
const stronger = useStrongerStore();

// The hidden sections' one-line results (CollapsibleSection.vue).
useSearchSnapshots('fastest');
const planner = useAutoPlannerStore();
const show = (u: number) => showDateTime(u, planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
/** InstantRoute's `state`: still being worked out, in, or settled with none (then the summary says so). */
const instantLoad = ref<InstantState>('loading');
/** InstantRoute's `unloaded`: its file couldn't be loaded. */
const instantUnloaded = ref(false);
const lines = computed(() => ({
  instant: routeLine(
    'fastest',
    stronger.instant.fastest,
    show,
    instantLoad.value === 'none'
      ? instantUnloaded.value
        ? UNLOADED_INSTANT_SUMMARY
        : NO_INSTANT_SUMMARY
      : 'working out…'
  ),
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

// Fast / Exact (and Very high) and the Nearby routes search's effort are one setting.
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
  openCustom(chain.slice(0, -1).join('; '));
}

/** Custom with these boxes filled in (Check exactly, or a finished run's "Go further: open in Custom"):
 *  nothing starts until the player presses Find. */
function openCustom(bands: string): void {
  ui.fullSweepBands = bands;
  emit('update:depth', 'full');
  // Custom (the Exhaustive tab) first: a hidden part has no place on the page to scroll to.
  selectSearchTab('fastest', 'exhaustive');
  void nextTick(() => document.getElementById('exhaustive')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** The exhaustive search's own goal switch (carrying on a date run from here): App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}

const ChainSearchPanel = safeAsyncComponent(() => import('./ChainSearchPanel.vue'));
const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));

/** Custom's first line (it is the Exhaustive search, unchanged): what it is for and how long it takes. */
const CUSTOM_INTRO =
  "For proving an answer, not for finding a much better one: it tries every route in the boxes you set (Custom), and nothing outside them, so its answer is proven for that space. In players' runs so far it found routes minutes to hours sooner, not days, at about 1 minute per 70 routes on an 8-core computer, so big boxes take hours.";

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
