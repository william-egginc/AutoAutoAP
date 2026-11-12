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
  <!-- THE LAYOUT CONTRACT (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026): the save line and the
       goal tabs above (App.vue), then here, always in this order: the title and its one line, the answer with Follow this
       route as its one main button, what to do now, then the one closed More (everything else, in its old order), then
       the footer (App.vue). A new control goes inside More unless Jordan gives it a place. -->
  <div class="max-w-4xl mx-auto space-y-4">
    <div data-region="title">
      <h1 class="text-headline font-black text-slate-900">{{ fastestName(store.finalTE) }}</h1>
      <p class="text-body text-slate-600 max-w-prose" data-testid="fastest-line">{{ fastestLine }}</p>
    </div>

    <!-- This account's starting-TE override, when it is on (TeOverrideBanner.vue): plans start from it, not the save. -->
    <TeOverrideBanner />

    <!-- One order on both search screens: the instant answer, then the two ways to search, one shown at a
         time (SearchPanel.vue: Fast | Exact | Custom, 22 Oct; was two tabs, Allan, 14 Oct). Your setup is the
         floating Setup button (SetupDock.vue): here only the save's problems, if any. "When should I
         start?" is in Science (#/science/start). -->
    <YourSetup screen="fastest" issues-only />

    <!-- Filters opens Setup (layout/FiltersButton.vue): right above the instant answer card (Jordan, 13 Nov 2026), only
         where the Setup pill is mounted (a player ID). Left on phones, right from sm up: the fixed Setup pill (bottom-right) covered it at 390 px. -->
    <div v-if="initialState.playerId" class="flex justify-start sm:justify-end">
      <FiltersButton />
    </div>
    <!-- The instant answer from the precomputed table (the precompute fork): every route, at once, instant
         numbers only. The search panel below prices routes on your save; the answer points to its result. -->
    <!-- The answer, always shown: no Hide since the simpler page (the section's old id kept for the tracker's "Pick a route
         to follow", lib/pickRoute.ts). Its filters, every number of ascensions and How this is worked out go into More
         (`more-to`). -->
    <div data-testid="section-instant" data-region="answer">
      <!-- No instant answer for the player's TE: it points to By a date's quick estimate (`by-date`). Never nothing:
           a card that can't be drawn says so (InstantGuard.ts). -->
      <InstantGuard>
        <InstantRoute
          share-to="#search-share-fastest"
          more-to="more-fastest-answer"
          now-to="now-offer-fastest"
          @check="checkExactly"
          @state="st => (instantLoad = st)"
          @unloaded="u => (instantUnloaded = u)"
          @by-date="emit('by-date')"
          @more-changes="c => (moreChanges = c)"
        />
      </InstantGuard>
    </div>

    <NowLine screen="fastest" :goal-key="goalKey" @show-search="showSearch" />

    <!-- Help improve the planner, below the answer on this screen (Jordan, 9 Nov 2026, Q2; App.vue draws it at the top of
         the other screens), until answered. Its words are unchanged (StudyBox.vue, lib/aboutPage.spec.ts). -->
    <StudyBox v-if="store.submitUrl" />

    <MoreFold
      ref="more"
      section="moreFastest"
      :line="moreLineWithChanges(MORE_LINE_AUTO, moreChanges)"
      :running="smartRunning || fullRunning"
      :unfinished="!!store.crashedRun"
    >
    <div id="more-fastest-answer" class="space-y-3"></div>
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
            <!-- One line (UX fluff review 2, 5 Nov 2026, item C-pre1); the evidence and how it works are in the one fold
                 under it, "How Custom works" (item C-pre2). DRAFT (Words). -->
            <p class="max-w-prose text-body text-slate-700" data-testid="custom-intro">{{ CUSTOM_LEAD }}</p>
            <ExhaustivePromise goal="fastest">
              <CustomHowItWorks />
            </ExhaustivePromise>
            <InsanePanel :player-id="playerId" goal="fastest" embedded @update:goal="onGoal" />
          </section>
        </template>
      </SearchPanel>
    </div>
    <div id="more-fastest-answer-how"></div>
    <a href="#/science/how" class="inline-flex min-h-[44px] items-center text-body font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900" data-testid="how-it-works-link">{{ HOW_IT_WORKS_LINK }}</a>
    </MoreFold>
  </div>
</template>

<script setup lang="ts">
import { thisDevice } from '@/search/device';
import { computed, nextTick, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { fastestName, type Depth } from '@/lib/siteNav';
import { safeAsyncComponent } from 'lib/planners/import';
import StrongerBox from './StrongerBox.vue';
import MoreFold from '@/components/layout/MoreFold.vue';
import NowLine from '@/components/layout/NowLine.vue';
import StudyBox from '@/components/StudyBox.vue';
import { fastestLine as fastestLineWords, HOW_IT_WORKS_LINK, MORE_LINE_AUTO, moreLineWithChanges } from '@/lib/layoutWords';
import { screenGoalKey } from '@/lib/follow';
import { revealMore } from '@/composables/useMoreReveal';
import InstantGuard from './InstantGuard';
import SearchPanel from './SearchPanel.vue';
import { revealRunTab, selectSearchTab } from '@/lib/searchTab';
import { useSearchSnapshots } from '@/composables/useSearchSnapshots';
import type { InstantState } from '@/search/autoWiden';
import SearchCompare from './SearchCompare.vue';
import { SHOW_COMPARE } from '@/lib/features';
import InstantRoute from './InstantRoute.vue';
import FiltersButton from '@/components/layout/FiltersButton.vue';
import { useInitialStateStore } from '@/stores/initialState';
import ExhaustivePromise from './ExhaustivePromise.vue';
import CustomHowItWorks from './CustomHowItWorks.vue';
import YourSetup from './YourSetup.vue';
import TeOverrideBanner from '@/components/auto/TeOverrideBanner.vue';
import { useUIStore } from '@/stores/ui';
import { useStrongerStore, type LevelEstimate, type StrongerLevel } from '@/stores/stronger';
import { formatHours } from '@/search/exhaustive';
import { plural } from '@/lib/format';
import { typicalHowLongLine } from '@/lib/fastEstimateWords';

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
const initialState = useInitialStateStore();
const stronger = useStrongerStore();

// The hidden sections' one-line results (CollapsibleSection.vue).
useSearchSnapshots('fastest');
/** The line under the tabs, for the player's own target (490 or another). */
const fastestLine = computed(() => fastestLineWords(store.finalTE));
/** The goal this screen follows for (Follow this route, the What to do now line). */
const goalKey = computed(() => screenGoalKey(null, store.finalTE));
/** The values in More not at their default (InstantRoute `more-changes`), named in its line. */
const moreChanges = ref<string[]>([]);
const more = ref<InstanceType<typeof MoreFold> | null>(null);
/** What to do now's "Show search ›": More open, at the search. */
function showSearch(): void {
  revealMore('fastest');
  void more.value?.show();
  void nextTick(() => document.querySelector('[data-testid="search-panel-fastest"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
/** InstantRoute's `state`: still being worked out, in, or settled with none (then the summary says so). */
const instantLoad = ref<InstantState>('loading');
/** InstantRoute's `unloaded`: its file couldn't be loaded. */
const instantUnloaded = ref(false);

/** What each Nearby routes level would cost on this computer (store `smartEstimate`). */
const levelEstimates = computed<Partial<Record<StrongerLevel, LevelEstimate>>>(() => {
  const out: Partial<Record<StrongerLevel, LevelEstimate>> = {};
  for (const l of ['quick', 'normal', 'thorough'] as const) {
    const e = store.smartEstimate(l);
    const t = formatHours(e.seconds / 3600);
    const workers = plural(store.workerBudget, 'worker');
    const speed = e.measured ? `${thisDevice()}'s measured speed` : 'the typical speed';
    out[l] = {
      short: `~${t}`,
      // What the level really prices (lib/fastTypical.ts): this device's runs, or Fast's built-in share on a first run.
      // Only Exact with nothing kept is priced at the bound.
      line:
        e.typical !== null && e.typicalFrom
          ? typicalHowLongLine({
              time: t,
              device: thisDevice(),
              workers,
              speed,
              typical: e.typical,
              bound: e.chains,
              from: e.typicalFrom,
            })
          : `Up to about ${t} on ${thisDevice()} (${workers}, ${speed}): at most ~${e.chains.toLocaleString()} routes; it usually stops sooner.`,
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
  revealMore('fastest');
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

/** Custom's one line (it is the Exhaustive search, unchanged); its bullets are in the fold (ExhaustivePromise.vue). DRAFT. */
const CUSTOM_LEAD =
  'Tries every route in your boxes, so it proves the best inside them. It rarely beats Fast by more than hours, and big boxes take hours.';

/** The address and the tab: #/auto/fastest/full (a sweep link, an old ?insane=1 link, Check exactly)
 *  opens Exhaustive, and a tab picked by hand changes the address (@pick above). Opened on the plain
 *  address, the tab remembered from last time wins (the address is left alone then: changing it
 *  counts as picking a tab in App.vue, which would drop a link's hold on the page while a save loads). */
watch(
  () => props.depth,
  (d, before) => {
    if (d === 'full') {
      // Custom is inside More: a link to #/auto/fastest/full opens it.
      revealMore('fastest');
      selectSearchTab('fastest', 'exhaustive');
    }
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
