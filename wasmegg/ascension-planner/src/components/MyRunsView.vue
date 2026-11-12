<!--
  My runs (#/myruns): where you are now, from what is already saved (spec "myruns-now" v3, agreed 15 Oct 2026;
  build plan aaap-tools/specialists/ui-nowpage-build.md). NOTHING is calculated on this page: no instant answer,
  no search (one exception since 24 Oct 2026: a followed route with no timeline is priced on the instant answer's data
  in a route worker, lib/followEstimate.ts). Top to bottom, one column at every width:

    1. Save-age banner: the save line at the top of the page (layout/SaveLine.vue, App.vue) since the simpler page
       (9 Nov 2026); since 12 Nov 2026 the strip and the silo line are small, beside Right now (layout/SaveSide.vue).
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
  <!-- THE LAYOUT CONTRACT (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026): the save line above
       (App.vue: whose save, its age, Load latest save; it replaced this page's own save strip and its intro line), then
       the title, Right now (the goal pills, the route, the next step) with the Build-up tracker, the soul-egg line, then
       the one closed More with everything else in its old order (Change route, your eggs, the saved answer, Try next,
       the routes at a glance, Your runs), then the footer. -->
  <div class="space-y-3 pb-16" data-testid="my-runs">
    <div data-region="title">
      <h1 class="text-headline font-black text-slate-900">{{ NAMES.myRuns }}</h1>
    </div>

    <!-- This account's starting-TE override, when it is on (TeOverrideBanner.vue): plans start from it, not the save. -->
    <TeOverrideBanner />
    <p v-if="page.saveWaiting.value" class="text-body text-slate-500" data-testid="now-save-waiting">
      {{ loading ? 'Reading your save: where you are, your eggs and your saved answers show once it is in.' : 'Load your save to see where you are, your eggs and your saved answers.' }}
    </p>

    <!-- The save strip, small (layout/SaveSide.vue), while the page waits for the save. -->
    <SaveSide v-if="!page.hasSave.value" />

    <template v-if="page.hasSave.value">
      <!-- Right now, and the save strip beside it from lg, under it on a phone (layout/SaveSide.vue, 12 Nov 2026). -->
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start" data-testid="now-grid">
      <RightNowCard
        data-region="right-now"
        change-route-to="more-myruns-route"
        detail-to="more-myruns-detail"
        timeline-to="myruns-timeline"
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
        :next-buy="nextBuy"
        :next-shift-lines="page.nextShiftLines.value"
        :a1-choice="page.a1Choice.value"
        :fresh-sooner="page.freshLine.value"
        :fastest-followed="!!page.fastestFollowed.value"
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
        :follow-save-off="page.followSaveOff.value"
        :follow-cloud-unreachable="page.followCloudUnreachable.value"
        :awake-hours="nightBuyHours"
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
        @pick-a1="page.pickA1"
        @switch-fastest="page.switchToFastest"
      >
        <!-- The player line above the egg, the silo line beside it (myruns/PlayerLine.vue). -->
        <template #player>
          <PlayerLine
            :name="playerName"
            :claimed="playerTe?.claimed ?? null"
            :pending="playerTe?.pending ?? null"
            :clothed="page.gear.value?.clothedEarnings ?? null"
            :silo="saveStrip.silo.value"
          />
        </template>
        <!-- The build-up, check-in by check-in (composables/useBuildUpTracker.ts): open while building; directly under
             Right now's Next step and Next shifts (30 Oct 2026, Jordan), not at the foot of the page. -->
        <template #buildUp>
          <BuildUpTracker
            :state="tracker.state.value"
            :open="tracker.open.value"
            :result="tracker.result.value"
            :ticks="tracker.ticks.value"
            :summary="tracker.summary.value"
            :silo-warnings="tracker.siloWarnings.value"
            :fail-reason="tracker.failReason.value"
            :fail-stopped="tracker.failStopped.value"
            :now="page.now.value"
            :zone="page.zone.value"
            :save-seconds="page.saveSeconds.value"
            :plan-save="tracker.plan.value?.saveSeconds ?? 0"
            :bought="tracker.bought.value?.lines ?? null"
            :tick-source="tracker.tickSource.value"
            :save-fit="tracker.bought.value?.fit ?? null"
            :replan="trackerReplan"
            :finish-chosen="tracker.finishChosen.value"
            :followed-for="trackerFollowedFor"
            :awake-hours="nightBuyHours"
            @toggle="tracker.playerToggle"
            @tick="tracker.toggleTick"
            @clear="tracker.clearTick"
            @replan="tracker.replan"
            @retry="retryTracker"
            @show-goal="page.selectGoal"
            @pick-route="pickRouteToFollow"
          />
        </template>
      </RightNowCard>
      <SaveSide :with-silo="false" />
      </div>

      <SoulEggWarning :shifts="page.plannedShifts.value?.count ?? null" :done="page.hasSave.value ? page.shiftsDone.value : null" :soul-eggs="page.soulEggs.value" />
      <!-- Your eggs and the Full timeline above More (Jordan, 9 Nov 2026); the timeline comes from Right now
           (RightNowCard `timelineTo`), closed by default and remembered. -->
      <YourEggs
        :eggs="page.eggs.value"
        :facts="page.facts.value"
        :after-shift="page.afterShift.value"
        :goal-lines="page.goalLines.value"
        :clock-lines="page.clockLines.value"
        :shifts-done="page.shiftsDone.value"
        :next-shift-cost="page.nextShiftCost.value"
        :planned-shifts="page.plannedShifts.value"
        :clothed-equipped="page.gear.value?.clothedEquipped ?? null"
        :clothed-earnings="page.gear.value?.clothedEarnings ?? null"
        :now="page.now.value"
        :save-seconds="page.saveSeconds.value"
        :zone="page.zone.value"
      />
      <div id="myruns-timeline" data-testid="myruns-timeline"></div>
    </template>

    <MoreFold ref="more" section="moreMyRuns" :line="MORE_LINE_MYRUNS">
    <!-- Change route: Right now's Earlier versions, Stop following and Follow another route (RightNowCard
         `changeRouteTo`, moved here by Teleports to this looked-up element). -->
    <section v-if="page.hasSave.value" class="rounded-2xl border border-slate-200 bg-white p-4 space-y-1" data-testid="more-myruns-change-route">
      <h2 class="text-body font-bold text-slate-900">{{ CHANGE_ROUTE }}</h2>
      <div id="more-myruns-route" class="space-y-1"></div>
    </section>
    <!-- Right now's gear (RightNowCard `detailTo`). -->
    <div v-if="page.hasSave.value" id="more-myruns-detail" class="space-y-2" data-testid="more-myruns-detail"></div>
    <template v-if="page.hasSave.value">


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

        <!-- Empty parts are hidden, not "· none yet" (spec-uxpass item 7, 8 Nov 2026); their lists load on this page
             (`loadKept`), so a part shows once it has something. -->
        <details
          v-if="savedCount > 0"
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

        <!-- Amber only with something unsent; "none yet" is the plain card (ux35-a, 28 Oct 2026). -->
        <details
          v-if="hasBoard && unsentCount > 0"
          :open="open.unsent"
          class="rounded-xl border p-4"
          :class="unsentCount > 0 ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'"
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
      <!-- Hidden with nothing to look at (spec-uxpass item 7, 8 Nov 2026). -->
      <div v-if="steps.steps.length" class="space-y-2" data-testid="my-runs-summary">
        <details :open="open.steps" class="rounded-xl border border-slate-200 p-3" @toggle="sync('steps', $event)">
          <summary :class="SUMMARY">
            Next steps<span :class="COUNT">{{ ` (${steps.steps.length} to look at)` }}</span>
          </summary>
          <div class="mt-2"><DashboardGaps :state="steps" @act="act" /></div>
        </details>
      </div>
    </section>
    </MoreFold>
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
import { pickRouteOpen, scrollToInstantAnswer } from '@/lib/pickRoute';
import { standingWords } from '@/lib/standing';
import { oneMoreLine, tryNextPills } from '@/lib/tryNext';
import { takeYourRunsAsk } from '@/lib/myRunsFocus';
import { nightBuyHours as nightBuyHoursOf } from '@/lib/nightBuyNote';
import MoreFold from '@/components/layout/MoreFold.vue';
import { CHANGE_ROUTE, MORE_LINE_MYRUNS } from '@/lib/layoutWords';
import { useNowPage } from '@/composables/useNowPage';
import { useConsent } from '@/composables/useConsent';
import { useStartTimesStore } from '@/stores/startTimes';
import { useFollowStore } from '@/stores/follow';
import type { RecalcRequest } from '@/lib/recalc';
import { markMyRunsSeen } from '@/composables/useMyRunsShown';
import DashboardGaps from './myruns/DashboardGaps.vue';
import BuildUpTracker from './myruns/BuildUpTracker.vue';
import { useBuildUpTracker } from '@/composables/useBuildUpTracker';
import { ascensionStartOf } from '@/lib/buildUpTracker';
import { nextBuyBefore } from '@/lib/nextAction';
import { isConstrained } from '@/search/availability';
import TeOverrideBanner from '@/components/auto/TeOverrideBanner.vue';
import SaveSide from '@/components/layout/SaveSide.vue';
import PlayerLine from './myruns/PlayerLine.vue';
import { playerTeOf } from '@/lib/playerTe';
import { useInitialStateStore } from '@/stores/initialState';
import { useMinuteClock } from '@/composables/useMinuteClock';
import { useAutoSaveStrip } from '@/composables/useAutoSaveStrip';
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
import { hashID } from '@/lib/storage/db';
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
  /** The Build-up tracker's Try again while the stores are not this save's: App sets the save up again, once. */
  setup: [];
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
/** The hours the night-buy note sees: none while the simulation holds its buys to them (lib/nightBuyNote.ts). */
const nightBuyHours = computed(() => nightBuyHoursOf(store.availability, store.deferShifts));
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
  return boardCount.value ? ` (${boardCount.value} · couldn't read the rest)` : " · not loaded";
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
/** The player line (myruns/PlayerLine.vue): the save's name, claimed and pending TE; the silo line from the save strip. */
const initial = useInitialStateStore();
const playerTe = computed(() => playerTeOf(initial.rawBackup));
/** The save's name; never the ID the store falls back to with no name in the save. */
const playerName = computed(() => (initial.nickname && !/^EI\d{16}$/.test(initial.nickname) ? initial.nickname : null));
const saveStrip = useAutoSaveStrip({ now: useMinuteClock() });
/** The Build-up tracker under Right now's Next step (composables/useBuildUpTracker.ts): the followed route's current ascension. */
const tracker = useBuildUpTracker({
  account: computed(() => page.account.value || null),
  hasSave: page.hasSave,
  onVirtue: page.onVirtue,
  followed: computed(() => !!page.follow.value),
  building: computed(() => page.phase.value?.phase === 'building'),
  ascensionStart: computed(() => ascensionStartOf(page.cardPlan.value?.plan ?? null, page.now.value)),
  saveSeconds: page.saveSeconds,
  zone: page.zone,
  hours: computed(() => (isConstrained(store.availability) ? store.availability : null)),
  now: page.now,
  fresh: page.buildUpPlan,
  sim: page.buildUpSim,
  simWorker: page.buildUpSimWorker,
  // A search really running here (spec-stuck3), or its result being sent: the busy useCurrentSim waits on (QA review
  // #3). A wait for a search with none running counts toward the stall.
  searchRunning: page.searchBusy,
  saveFarm: page.buildUpSave,
  // A newer save still coming in (the page's own "Reading your save" pair): the tracker says so (spec-anchornewer).
  saveLoading: computed(() => props.loading || page.saveWaiting.value),
  finishChosen: page.a1Finish,
});
/** The research buy still to do before Next step's own step, from the tracker's lines (M13, lib/nextAction.ts `nextBuyBefore`):
 *  Next step names it first. None while the tracker is not in (its fold shut, or still working out). */
const nextBuy = computed(() =>
  nextBuyBefore(page.nextStep.value, tracker.state.value === 'ready' ? tracker.result.value?.lines : null, tracker.ticks.value, page.now.value)
);
/**
 * The Build-up tracker's Try again: the tracker's bounds started again and the simulation asked again. With the stores
 * not this save's (useNowPage `storeReady` false) no simulation is asked, so App is asked to set the save up again
 * (QA review 7 Nov 2026 #5): once per press, never from a watcher.
 */
function retryTracker(): void {
  tracker.retry();
  page.retryBuildUp();
  if (!page.storeReady.value) emit('setup');
}
/** R7 red-team #3 (31 Oct 2026): the tracker is the shown goal's; with no route followed for it but one for another
 *  goal, the tracker names that goal (and shows it on a press) instead of "follow a route first". */
const trackerFollowedFor = computed(() => {
  if (page.follow.value) return null;
  const g = page.goalChoices.value.find(o => o.following && o.key !== page.selectedGoal.value);
  return g ? { key: g.key, name: g.label } : null;
});
/** The tracker's Re-plan strip (Phase 2): shown when the save is over 1 h behind the plan or bought things off-plan. */
const trackerReplan = computed(() =>
  tracker.replanShown.value
    ? {
        shown: true,
        working: tracker.replanning.value,
        error: tracker.replanError.value,
        behind: tracker.offer.value?.behind ?? 0,
        offPlan: tracker.offPlanWords.value,
        keepsTicks: tracker.hasOverrides.value,
      }
    : null
);
/* The save on the server versus the one loaded here: asked by the save line at the top since the simpler page
   (layout/SaveLine.vue, 9 Nov 2026), which shows this page's save age now. */
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
/** The page's More (layout/MoreFold.vue). */
const more = ref<InstanceType<typeof MoreFold> | null>(null);
function showRuns(kind: Showing | null): void {
  if (kind) pickShowing(kind);
  // Your runs is inside More (the simpler page, 9 Nov 2026): open it first, not remembered.
  more.value?.show();
  void nextTick(() => {
    if (typeof document === 'undefined') return;
    document.getElementById('my-runs-your-runs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
onMounted(() => {
  if (takeYourRunsAsk()) showRuns(null);
});

/** The saved runs and answers and the unsent results, loaded here as their lists did on mount: those parts are only
 *  shown once they have something (spec-uxpass item 7), so their lists aren't mounted to load them. */
async function loadKept(): Promise<void> {
  const id = props.playerId;
  if (!id) return;
  void store.refreshSavedRuns(id);
  void store.refreshSavedAnswers(id);
  if (!hasBoard) return;
  try {
    await store.refreshPendingSends(await hashID(id));
    if (store.pendingSends.length) void store.loadMineRows();
  } catch {
    // nothing kept is shown
  }
}
onMounted(() => void loadKept());
watch(() => props.playerId, () => void loadKept());

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

/** The Build-up tracker's "Pick a route to follow" (nothing followed; Kenzie, 9 Nov 2026): the goal Right now shows,
 *  on its screen (Fastest, or By a date for a dated goal), scrolled to its instant answer and Follow this route. */
function pickRouteToFollow(): void {
  emit('open', pickRouteOpen(page.goalChoices.value, page.selectedGoal.value));
  scrollToInstantAnswer();
}

/** A step's button: a part here (opened, then scrolled to), Right now on a goal, a fresh save, or a screen, set up. */
function act(to: DashAction): void {
  if (to.to === 'unsent') {
    pickShowing('all');
    open.unsent = true;
    more.value?.show();
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
