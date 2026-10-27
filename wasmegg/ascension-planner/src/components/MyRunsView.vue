<!--
  My runs (#/myruns): where you are now, from what is already saved (spec "myruns-now" v3, agreed 15 Oct 2026;
  build plan aaap-tools/specialists/ui-nowpage-build.md). NOTHING is calculated on this page: no instant answer,
  no search (one exception since 24 Oct 2026: a followed route with no timeline is priced on the instant answer's data
  in a route worker, lib/followEstimate.ts). Top to bottom, one column at every width:

    1. Save-age strip (SaveAgeStrip.vue): every time below comes from the save, so its age comes first.
    2. Right now (RightNowCard.vue): the egg, on track or not, the next step, the gear, the next events with
       "+ Add to calendar", the whole route folded. From the instant answer, or a Fast, Exact or Custom result for
       the same goal once one is better (lib/searchPlan.ts).
    3. Your eggs (YourEggs.vue): each egg's TE and the farm's facts, from the save.
    4. The saved-answer tile (SavedTile.vue) of the goal picked on Right now's switch (Fastest to 490, Egg Day or
       another date; was both, 24 Oct 2026): when it was calculated, from which save, How sure and where it stands.
    5. Try next (TryNext.vue): a few runs, each opening its screen set up.
       Then "Your routes at a glance" (RouteScatter.vue, Q9): the rows of 6 as points, folded (closed on a phone).
    6. Your runs: ONE section, opening on the latest run (LatestRunView.vue, was "Your latest run"), switched
       to the latest By a date run or all your runs: the board (filters at the top of its list, LeaderboardPanel
       mode="myruns"), saved on this device and not sent yet. Next steps fold under it (the six cards went, 24 Oct 2026).
  Setup is the floating button in the corner (App.vue mounts SetupDock here too); there is no setup box.

  The data: composables/useNowPage.ts (reads only). "See the routes ›" on a tile and "Dig deeper into your
  plan ›" (lib/myRunsFocus.ts) land on Your runs.
-->
<template>
  <div class="space-y-3 pb-16" data-testid="my-runs">
    <div>
      <h1 class="text-headline font-black text-slate-900">{{ NAMES.myRuns }}</h1>
      <!-- One line (ux review 26 Oct, row 15): what the page holds is in its section headings below. -->
      <p class="text-body text-slate-600 max-w-prose" data-testid="my-runs-intro">
        From your save: where you are now, your next steps and your runs. Estimates are worked out here in the
        background; searches run on the {{ NAMES.auto }}.
      </p>
    </div>

    <SaveAgeStrip :strip="page.strip.value" :server="serverSave" :now="page.now.value" :loading="loading" @fresh="emit('fresh')" />
    <p v-if="page.saveWaiting.value" class="text-body text-slate-500" data-testid="now-save-waiting">
      {{ loading ? 'Reading your save: where you are, your eggs and your saved answers show once it is in.' : 'Load your save to see where you are, your eggs and your saved answers.' }}
    </p>

    <template v-if="page.hasSave.value">
      <RightNowCard
        :card="page.cardPlan.value"
        :soul-eggs-after="page.soulEggsAfter.value"
        :on-virtue="page.onVirtue.value"
        :current-egg="page.currentEgg.value"
        :te-so-far="page.teSoFar.value"
        :asc-now="page.ascNow.value"
        :track="page.track.value"
        :events="page.events.value"
        :shown-events="page.shownEvents.value"
        :ascensions="page.ascensions.value"
        :sim-working="page.simWorking.value"
        :sim-failure="page.simFailure.value"
        :sim-slow="page.simSlow.value"
        :next-step="page.nextStep.value"
        :next-shift-lines="page.nextShiftLines.value"
        :gear="page.gear.value"
        :now="page.now.value"
        :zone="page.zone.value"
        :save-seconds="page.saveSeconds.value"
        :egg-day-year="page.eggDayYear"
        :goals="page.goalChoices.value"
        :selected-goal="page.selectedGoal.value"
        :phase="page.phase.value"
        :start-info="page.startInfo.value"
        :follow="page.follow.value"
        :better-route="page.betterRoute.value"
        :follow-set-with="page.followSetWith.value"
        :follow-save-words="page.followSaveWords.value"
        :follow-not-saved="page.followNotSaved.value"
        :follow-cloud-unreachable="page.followCloudUnreachable.value"
        @save-online="page.saveFollowOnline"
        @retry-cloud="page.retryFollowCloud"
        @open="to => emit('open', to)"
        @select="page.selectGoal"
        @start-times="openStartTimes"
        @recalc="req => emit('recalc', req)"
        @go-back="page.goBackToInstant"
        @use-search="page.useSearchResult"
        @follow="followTyped"
        @unfollow="unfollowGoal"
      />

      <SoulEggWarning :shifts="page.plannedShifts.value?.count ?? null" :done="page.hasSave.value ? page.shiftsDone.value : null" :soul-eggs="page.soulEggs.value" />
      <YourEggs
        :eggs="page.eggs.value"
        :facts="page.facts.value"
        :after-shift="page.afterShift.value"
        :shifts-done="page.shiftsDone.value"
        :next-shift-cost="page.nextShiftCost.value"
        :planned-shifts="page.plannedShifts.value"
        :clothed-equipped="page.gear.value?.clothedEquipped ?? null"
        :clothed-earnings="page.gear.value?.clothedEarnings ?? null"
        :now="page.now.value"
        :save-seconds="page.saveSeconds.value"
        :zone="page.zone.value"
      />

      <!-- The saved answer for the goal picked on Right now's switch only (24 Oct 2026): the pill switches it. -->
      <div class="grid grid-cols-1 gap-3" data-testid="now-tiles" :data-goal="page.shownTile.value.key ?? ''">
        <SavedTile
          :key="page.shownTile.value.key ?? page.shownTile.value.goal"
          :goal="page.shownTile.value.goal"
          :title="page.shownTile.value.name ?? fastestName(page.shownTile.value.target)"
          :tile="page.shownTile.value.tile"
          :target="page.shownTile.value.target"
          :now="page.now.value"
          :zone="page.zone.value"
          :standing="standingWords(page.shownTile.value.stand)"
          :standing-label="page.shownTile.value.standingLabel"
          :open="page.shownTile.value.open ?? null"
          :soul-eggs-after="page.tileSoulEggsAfter.value"
          @open="to => emit('open', to)"
          @routes="showRuns(page.shownTile.value.goal)"
        />
      </div>

      <TryNext :pills="pills" :line="oneMore" @open="to => emit('open', to)" />
    </template>

    <!-- 5½. Your routes at a glance: the rows below as points (RouteScatter.vue, lib/routeScatter.ts). -->
    <RouteScatter
      :rows="boardRows"
      :saved-runs="store.savedRuns"
      :saved-answers="store.savedAnswers"
      :egg-day-at="page.eggDayAt"
      :egg-day-year="page.eggDayYear"
      :zone="zone"
      :board-failed="boardFailed"
    />

    <!-- 6. Your runs: one section. -->
    <section id="my-runs-your-runs" class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="my-runs-your-runs">
      <div>
        <p class="label text-slate-500">Your runs</p>
        <p class="text-body text-slate-500 max-w-prose" data-testid="my-runs-baseline-intro">
          Each run is compared with your <b>instant answer</b>: the one for your save on the day of the run.
        </p>
      </div>
      <!-- The baseline on the board (lib/instantBaseline.ts): a consent of its own, since the board is public and
           "Share my search results" sends privately. -->
      <label
        v-if="hasBoard"
        class="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-small text-slate-700"
        data-testid="my-runs-share-baseline"
      >
        <input v-model="shareBaseline.agreed.value" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>
          <b>Share my instant answer with my runs</b>
          <span class="block max-w-prose text-body text-slate-500"
            >Sends the instant answer's route and date beside each run you send, so the Leaderboard can show how much a search
            gained. Same rules as sending a run: never your player ID, never your save.</span
          >
        </span>
      </label>
      <div role="group" aria-label="Showing" class="grid grid-cols-1 sm:flex sm:flex-wrap gap-1.5" data-testid="my-runs-showing">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="min-h-[44px] sm:min-h-0 rounded-lg border px-3 py-1.5 text-body font-bold"
          :class="showing === m.id ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'"
          :aria-pressed="showing === m.id"
          :data-testid="`my-runs-show-${m.id}`"
          @click="pickShowing(m.id)"
        >
          {{ m.label }}
        </button>
      </div>

      <!-- The latest run, Fastest's or By a date's (LatestRunView.vue, self-contained). -->
      <div v-show="showing !== 'all'" data-testid="my-runs-part-latest">
        <LatestRunView
          :player-id="playerId"
          :want="showing === 'all' ? null : showing"
          @has="v => (latestHas = v)"
          @kinds="k => (latestKinds = k)"
        />
      </div>

      <!-- All my runs: the board (its filters at the top of its list), saved here, not sent yet. -->
      <div v-show="showing === 'all'" class="space-y-3" data-testid="my-runs-all">
        <!-- No collector (VITE_SUBMIT_URL unset): no board to read or send to, so its two parts give way to one
             line and nothing here reaches for the network (21 Oct 2026). -->
        <p v-if="!hasBoard" class="text-body text-slate-600" data-testid="my-runs-no-board">
          {{ noBoard() }}
        </p>
        <p v-if="hasBoard" class="text-body text-slate-500">The filters change this list only, not Right now above.</p>
        <details
          v-if="hasBoard"
          :open="open.board"
          class="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
          data-testid="my-runs-part-board"
          @toggle="sync('board', $event)"
        >
          <summary :class="SUMMARY">
            Your runs on the Leaderboard<span :class="COUNT" data-testid="board-count">{{ boardCountText }}</span>
          </summary>
          <div class="mt-3">
            <LeaderboardPanel
              mode="myruns"
              :player-id="playerId"
              @use="c => emit('use', c)"
              @count="n => (boardCount = n)"
              @rows="r => (boardRows = r)"
              @board="r => (allRows = r)"
              @failed="k => (boardFailed = k)"
            />
          </div>
        </details>

        <details
          :open="open.saved"
          class="rounded-xl border border-slate-200 bg-white p-4"
          data-testid="my-runs-part-saved"
          @toggle="sync('saved', $event)"
        >
          <summary :class="SUMMARY">
            Saved on {{ thisDevice() }}<span :class="COUNT">{{ countText(savedCount) }}</span>
          </summary>
          <div class="mt-3 space-y-3">
            <p class="text-body text-slate-500 max-w-prose">
              Kept in this browser for this account. Open puts one back on its screen in the {{ NAMES.auto }}: runs on
              {{ fastestName(store.finalTE) }}, answers on {{ NAMES.byDate }}.
            </p>
            <SavedRuns
              :player-id="playerId"
              list-only
              :pace-active="open.saved"
              @opened="r => emit('open', { auto: 'fastest', depth: r.full ? 'full' : 'smart' })"
            />
            <SavedAnswers
              :player-id="playerId"
              default-label=""
              :zone="zone"
              list-only
              :pace-active="open.saved"
              @opened="emit('open', { auto: 'by-date' })"
            />
          </div>
        </details>

        <details
          v-if="hasBoard"
          :open="open.unsent"
          class="rounded-xl border border-amber-200 bg-amber-50/40 p-4"
          data-testid="my-runs-part-unsent"
          @toggle="sync('unsent', $event)"
        >
          <summary :class="SUMMARY">
            Not sent yet<span :class="COUNT">{{ countText(unsentCount) }}</span>
          </summary>
          <div class="mt-3 space-y-2">
            <p class="text-body text-slate-500 max-w-prose">
              Finished results this browser kept because they didn't reach the Leaderboard (the page closed first, or nothing sent
              them). Each goes with its own route and CSV, whatever save is loaded now.
            </p>
            <p v-if="store.isRunning || store.deadlineRunning" class="text-body text-slate-500">
              A search is running: these show again when it ends.
            </p>
            <UnsentResults :player-id="playerId" />
          </div>
        </details>
      </div>

      <!-- Next steps, folded under the list (lib/myRunsDashboard.ts): only what changes what to do. -->
      <div class="space-y-2" data-testid="my-runs-summary">
        <details :open="open.steps" class="rounded-xl border border-slate-200 p-3" @toggle="sync('steps', $event)">
          <summary :class="SUMMARY">
            Next steps<span :class="COUNT">{{ steps.steps.length ? ` (${steps.steps.length} to look at)` : ' · nothing to look at' }}</span>
          </summary>
          <div class="mt-2"><DashboardGaps :state="steps" @act="act" /></div>
        </details>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { thisDevice } from '@/search/device';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { NAMES, fastestName } from '@/lib/siteNav';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import type { BoardRow } from '@/lib/leaderboardRank';
import type { BoardReadKind } from '@/search/myBoardRows';
import { buildSteps, openFor, type DashAction, type MyRunsOpen } from '@/lib/myRunsDashboard';
import { standingWords } from '@/lib/standing';
import { oneMoreLine, tryNextPills } from '@/lib/tryNext';
import { takeYourRunsAsk } from '@/lib/myRunsFocus';
import { useNowPage } from '@/composables/useNowPage';
import { useConsent } from '@/composables/useConsent';
import { useStartTimesStore } from '@/stores/startTimes';
import { useFollowStore } from '@/stores/follow';
import type { RecalcRequest } from '@/lib/recalc';
import { markMyRunsSeen } from '@/composables/useMyRunsShown';
import { useServerSave } from '@/composables/useServerSave';
import DashboardGaps from './myruns/DashboardGaps.vue';
import SaveAgeStrip from './myruns/SaveAgeStrip.vue';
import RightNowCard from './myruns/RightNowCard.vue';
import YourEggs from './myruns/YourEggs.vue';
import SoulEggWarning from './SoulEggWarning.vue';
import SavedTile from './myruns/SavedTile.vue';
import TryNext from './myruns/TryNext.vue';
import RouteScatter from './myruns/RouteScatter.vue';
import LeaderboardPanel from './auto/LeaderboardPanel.vue';
import SavedRuns from './auto/SavedRuns.vue';
import SavedAnswers from './auto/SavedAnswers.vue';
import UnsentResults from './auto/UnsentResults.vue';
import LatestRunView from './auto/LatestRunView.vue';

const props = withDefaults(defineProps<{ playerId: string; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{
  use: [chain: number[]];
  /** A saved run or answer was opened (the Auto Planner screen it is on), or a Next step's screen, set up. */
  open: [to: MyRunsOpen];
  /** "Load a fresh one": App fetches the save again (and stays here). */
  fresh: [];
  /** Right now's "Run Fast": App opens the goal's screen with the save and Fast selected (lib/recalc.ts). */
  recalc: [req: RecalcRequest];
}>();

/** Right now's "When should I start?" (not on virtue yet): Science › When should I start?, on the plan's route when
 *  there is one (stores/startTimes.ts; App goes there). */
const startTimes = useStartTimesStore();
function openStartTimes(chain: number[] | null): void {
  if (chain && chain.length) startTimes.show(chain);
  else startTimes.open();
}

/** Right now's followed route (lib/follow.ts): typed in its box, or back to the checked route. */
const follows = useFollowStore();
function followTyped(chain: number[]): void {
  const g = page.selectedGoal.value;
  if (g) void follows.follow(g, chain, 'typed');
}
function unfollowGoal(): void {
  const g = page.selectedGoal.value;
  if (g) void follows.unfollow(g);
}

const store = useChainSearchStore();
const planner = useAutoPlannerStore();
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

const SUMMARY = 'min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0 cursor-pointer label text-slate-700';
const COUNT = 'ml-2 font-bold normal-case tracking-normal text-slate-500';

/** This build has a collector, so a board to read and send to. Without one the board's parts are one line and
 *  their rows are empty from the start (never "loading"). */
const hasBoard = !!store.submitUrl;
/** That line, word for word (MyRunsView.spec.ts); "this phone" or "this computer" as everywhere (search/device.ts). */
function noBoard(): string {
  return `This build of the site has no leaderboard, so your runs stay on ${thisDevice()} and nothing is sent anywhere.`;
}

/** The board's count, null while its first load is out. */
const boardCount = ref<number | null>(hasBoard ? null : 0);
const savedCount = computed(() => store.savedRuns.length + store.savedAnswers.length);
const unsentCount = computed(() => store.pendingSends.length);

function countText(n: number | null): string {
  if (n == null) return ' · loading';
  return n ? ` (${n})` : ' · none yet';
}

/** Why the board's last read failed (LeaderboardPanel's `failed`), null when it answered. */
const boardFailed = ref<BoardReadKind | null>(null);
/**
 * The board part's count. A read that failed is never "none yet" (QA break-it #3, 22 Oct 2026): that read as
 * if the player's runs had gone. The part stays open, so the panel's message and Retry show.
 */
const boardCountText = computed(() => {
  if (!boardFailed.value) return countText(boardCount.value);
  return boardCount.value ? ` (${boardCount.value} · couldn't read the rest)` : " · couldn't read the leaderboard";
});

// A run of the account's on the board: remembered, so the tab stays for the next visit (lib/myRunsShown.ts; the board is
// only read here, never to decide whether the tab shows).
watch(boardCount, n => {
  if (n) void markMyRunsSeen(props.playerId);
});
/** The viewer's board rows, null until the board's first load is in; every public row, for where you stand. */
const boardRows = ref<BoardRow[] | null>(hasBoard ? null : []);
const allRows = ref<BoardRow[] | null>(hasBoard ? null : []);

// ------------------------------------------------------------------------------- the Right now page

const page = useNowPage({ myRows: boardRows, boardRows: allRows });
/** The save on the server versus the one loaded here: asked quietly once per page load (lib/serverSave.ts). */
const serverSave = useServerSave({
  playerId: computed(() => props.playerId),
  loadedSeconds: page.saveSeconds,
  ready: computed(() => page.hasSave.value && !props.loading),
  now: page.now,
});
/** Try next's runs, all of them: Right now has no Run Fast button of its own since 25 Oct 2026 (one path per card). */
const pills = computed(() => tryNextPills(page.fastestTile.value, page.eggDayTile.value));
/** "One more TE by Egg Day … would come …, after Egg Day starts, so it isn’t counted.": saved legs only, the laid
 *  egg's next TE (lib/tryNext.ts `oneMoreLine`, from endEggsOf's `next`). */
const oneMore = computed(() => {
  const card = page.cardPlan.value;
  const a = page.eggDayTile.value.answer;
  const legs = card?.goal.goal === 'date' && card.state === 'this-save' ? card.plan.legs : (a?.legs ?? null);
  if (!a) return '';
  return oneMoreLine({
    chain: a.chain,
    legs,
    deadline: page.eggDayAt,
    what: `Egg Day ${page.eggDayYear}`,
    nowSeconds: page.now.value,
    zone: page.zone.value,
  });
});

// ------------------------------------------------------------------------------------- Your runs

/** Your latest run has a run of this account's to show (LatestRunView's `has`), and which kinds. */
const latestHas = ref(false);
const latestKinds = ref({ fastest: false, date: false });
type Showing = 'fastest' | 'date' | 'all';
/** Opens on the latest Fastest run; with none, By a date's; with neither, all your runs. */
const showing = ref<Showing>('fastest');
/** Set once the player (or a tile's "See the routes ›") picks; until then it follows which runs there are. */
let showingTouched = false;
watch(
  latestKinds,
  k => {
    if (!showingTouched) showing.value = k.fastest ? 'fastest' : k.date ? 'date' : 'all';
  },
  { deep: true }
);
function pickShowing(m: Showing): void {
  showing.value = m;
  showingTouched = true;
}
const modes = computed<{ id: Showing; label: string }[]>(() => [
  { id: 'fastest', label: `Latest ${fastestName(store.finalTE)} run` },
  { id: 'date', label: store.deadlineResult?.deadline === page.eggDayAt ? 'Latest Egg Day run' : `Latest ${NAMES.byDate} run` },
  { id: 'all', label: `All my runs${boardCount.value ? ` (${boardCount.value})` : ''}` },
]);

/** A tile's "See the routes ›" (or Dig deeper): Your runs, on that run. */
function showRuns(kind: Showing | null): void {
  if (kind) pickShowing(kind);
  void nextTick(() => {
    if (typeof document === 'undefined') return;
    document.getElementById('my-runs-your-runs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
onMounted(() => {
  if (takeYourRunsAsk()) showRuns(null);
});

/**
 * Each part of All my runs is open when it has something in it, folded when it is empty (the board's stays open
 * while it loads). A part opens or folds by itself only when it gains its first item or loses its last; in
 * between, the player's own click holds. Next steps open when one is urgent.
 */
const open = reactive({
  board: boardCount.value !== 0,
  saved: savedCount.value > 0,
  unsent: unsentCount.value > 0,
  steps: false,
});
type Part = keyof typeof open;
watch([boardCount, boardFailed], ([n, failed]) => (open.board = n !== 0 || !!failed));
watch(
  () => savedCount.value > 0,
  has => (open.saved = has)
);
watch(
  () => unsentCount.value > 0,
  has => (open.unsent = has)
);
function sync(part: Part, e: Event): void {
  open[part] = (e.target as HTMLDetailsElement).open;
}

// ------------------------------------------------------------------------------- Next steps

/**
 * Next steps (lib/myRunsDashboard.ts `buildSteps`, reworked 24 Oct 2026): only what changes what to do: a followed
 * route a priced result beats by about a day, time off or a no-prestige day on its prestiges, a save over about 3 days
 * old, results not sent. The six cards that repeated Right now and the saved answers are gone.
 */
const steps = computed(() =>
  buildSteps({
    now: page.now.value,
    zone: page.zone.value,
    pending: store.pendingSends.length,
    saveSeconds: page.hasSave.value ? page.saveSeconds.value : 0,
    follows: page.followsForSteps.value,
    windows: page.stepWindows.value,
  })
);
watch(
  () => steps.value.steps.some(s => s.kinds.includes('unsent') || s.kinds.includes('beaten')),
  urgent => {
    if (urgent) open.steps = true;
  },
  { immediate: true }
);

/** A step's button: a part here (opened, then scrolled to), Right now on a goal, a fresh save, or a screen, set up. */
function act(to: DashAction): void {
  if (to.to === 'unsent') {
    pickShowing('all');
    open.unsent = true;
    void nextTick(() => {
      if (typeof document === 'undefined') return;
      document.querySelector('[data-testid="my-runs-part-unsent"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }
  if (to.to === 'right-now') {
    page.selectGoal(to.goalKey);
    void nextTick(() => {
      if (typeof document === 'undefined') return;
      document.querySelector('[data-testid="now-card"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }
  if (to.to === 'fresh') {
    emit('fresh');
    return;
  }
  emit('open', openFor(to, zone.value));
}

/** "Share my instant baseline with my runs" (the `shareBaseline` consent, per account; chainSearch `withBaseline`). */
const shareBaseline = useConsent('shareBaseline');
</script>
