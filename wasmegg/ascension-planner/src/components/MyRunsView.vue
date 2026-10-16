<!--
  My runs (#/myruns): where you are now, from what is already saved (spec "myruns-now" v3, agreed 15 Oct 2026;
  build plan aaap-tools/specialists/ui-nowpage-build.md). NOTHING is calculated on this page: no instant answer,
  no Check exactly, no search. Top to bottom, one column at every width:

    1. Save-age strip (SaveAgeStrip.vue): every time below comes from the save, so its age comes first.
    2. Right now (RightNowCard.vue): the egg, on track or not, the next step, the gear, the next events with
       "+ Add to calendar", the whole route folded. From the instant answer kept after Check exactly.
    3. Your eggs (YourEggs.vue): each egg's TE and the farm's facts, from the save.
    4. Two saved-answer tiles (SavedTile.vue): Fastest to 490 and Egg Day, each with when it was calculated,
       from which save, How sure and where it stands on the board.
    5. Try next (TryNext.vue): a few runs, each opening its screen set up.
    6. Your runs: ONE section, opening on the latest run (LatestRunView.vue, was "Your latest run"), switched
       to the latest By a date run or all your runs: the board (filters at the top of its list, LeaderboardPanel
       mode="myruns"), saved on this device and not sent yet. Next steps and the six cards fold under it.
  Setup is the floating button in the corner (App.vue mounts SetupDock here too); there is no setup box.

  The data: composables/useNowPage.ts (reads only). "See the routes ›" on a tile and "Dig deeper into your
  plan ›" (lib/myRunsFocus.ts) land on Your runs.
-->
<template>
  <div class="space-y-3 pb-16" data-testid="my-runs">
    <div>
      <h2 class="text-2xl font-black text-slate-900">{{ NAMES.myRuns }}</h2>
      <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
        Where you are now, from your save and the answers already worked out, then your runs: the latest, the ones on
        the board, the runs and answers saved on {{ thisDevice() }} and results not sent yet. Nothing is calculated on
        this page.
      </p>
    </div>

    <SaveAgeStrip :strip="page.strip.value" :loading="loading" @fresh="emit('fresh')" />
    <p v-if="page.saveWaiting.value" class="text-[12px] text-slate-500" data-testid="now-save-waiting">
      {{ loading ? 'Reading your save: where you are, your eggs and your saved answers show once it is in.' : 'Load your save to see where you are, your eggs and your saved answers.' }}
    </p>

    <template v-if="page.hasSave.value">
      <RightNowCard
        :card="page.cardPlan.value"
        :on-virtue="page.onVirtue.value"
        :current-egg="page.currentEgg.value"
        :te-so-far="page.teSoFar.value"
        :asc-now="page.ascNow.value"
        :track="page.track.value"
        :events="page.events.value"
        :shown-events="page.shownEvents.value"
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
        @open="to => emit('open', to)"
        @select="page.selectGoal"
        @start-times="openStartTimes"
        @recalc="req => emit('recalc', req)"
        @follow="followTyped"
        @unfollow="unfollowGoal"
        @simulate="simulateFollowed"
      />

      <YourEggs
        :eggs="page.eggs.value"
        :facts="page.facts.value"
        :shifts-done="page.shiftsDone.value"
        :next-shift-cost="page.nextShiftCost.value"
        :planned-shifts="page.plannedShifts.value"
        :clothed-equipped="page.gear.value?.clothedEquipped ?? null"
        :clothed-earnings="page.gear.value?.clothedEarnings ?? null"
        :now="page.now.value"
        :save-seconds="page.saveSeconds.value"
      />

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="now-tiles">
        <SavedTile
          goal="fastest"
          :title="`Fastest to ${page.fastestTile.value.target}`"
          :tile="page.fastestTile.value.tile"
          :target="page.fastestTile.value.target"
          :now="page.now.value"
          :zone="page.zone.value"
          :standing="standingWords(page.raceStand.value)"
          :standing-label="`Race to ${page.fastestTile.value.target}`"
          @open="to => emit('open', to)"
          @routes="showRuns('fastest')"
        />
        <SavedTile
          goal="date"
          :title="`Egg Day ${page.eggDayYear}`"
          :tile="page.eggDayTile.value"
          :target="store.finalTE"
          :now="page.now.value"
          :zone="page.zone.value"
          :standing="standingWords(page.eggDayStand.value)"
          standing-label="Egg Day"
          @open="to => emit('open', to)"
          @routes="showRuns('date')"
        />
      </div>

      <TryNext :pills="pills" :line="oneMore" @open="to => emit('open', to)" />
    </template>

    <!-- 6. Your runs: one section. -->
    <section id="my-runs-your-runs" class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="my-runs-your-runs">
      <div>
        <p class="text-[11px] font-black uppercase tracking-widest text-slate-500">Your runs</p>
        <p class="text-[11px] text-slate-500">"Dig deeper into your plan ›" and "See the routes ›" land here.</p>
      </div>
      <div role="group" aria-label="Showing" class="grid grid-cols-1 sm:flex sm:flex-wrap gap-1.5" data-testid="my-runs-showing">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="rounded-lg border px-3 py-1.5 text-[12px] font-bold"
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
        <p class="text-[11px] text-slate-500">The filters change this list only, not Right now above.</p>
        <details
          :open="open.board"
          class="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
          data-testid="my-runs-part-board"
          @toggle="sync('board', $event)"
        >
          <summary :class="SUMMARY">
            Your runs on the board<span :class="COUNT">{{ countText(boardCount) }}</span>
          </summary>
          <div class="mt-3">
            <LeaderboardPanel
              mode="myruns"
              :player-id="playerId"
              @use="c => emit('use', c)"
              @count="n => (boardCount = n)"
              @rows="r => (boardRows = r)"
              @board="r => (allRows = r)"
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
            <p class="text-[11px] text-slate-500 leading-relaxed">
              Kept in this browser for this account. Open puts one back on its screen in the {{ NAMES.auto }}: runs on
              {{ fastestName(store.finalTE) }}, answers on {{ NAMES.byDate }}.
            </p>
            <SavedRuns
              :player-id="playerId"
              list-only
              @opened="r => emit('open', { auto: 'fastest', depth: r.full ? 'full' : 'smart' })"
            />
            <SavedAnswers
              :player-id="playerId"
              default-label=""
              :zone="zone"
              list-only
              @opened="emit('open', { auto: 'by-date' })"
            />
          </div>
        </details>

        <details
          :open="open.unsent"
          class="rounded-xl border border-amber-200 bg-amber-50/40 p-4"
          data-testid="my-runs-part-unsent"
          @toggle="sync('unsent', $event)"
        >
          <summary :class="SUMMARY">
            Not sent yet<span :class="COUNT">{{ countText(unsentCount) }}</span>
          </summary>
          <div class="mt-3 space-y-2">
            <p class="text-[11px] text-slate-500 leading-relaxed">
              Finished results this browser kept because they didn't reach the board (the page closed first, or nothing sent
              them). Each goes with its own route and CSV, whatever save is loaded now.
            </p>
            <p v-if="store.isRunning || store.deadlineRunning" class="text-[11px] text-slate-500">
              A search is running: these show again when it ends.
            </p>
            <UnsentResults :player-id="playerId" />
          </div>
        </details>
      </div>

      <!-- Next steps and the six cards, folded under the list (lib/myRunsDashboard.ts). -->
      <div class="space-y-2" data-testid="my-runs-summary">
        <details :open="open.steps" class="rounded-xl border border-slate-200 p-3" @toggle="sync('steps', $event)">
          <summary :class="SUMMARY">
            Next steps<span :class="COUNT">{{ steps.loading ? ' · checking' : ` (${steps.steps.length} to look at)` }}</span>
          </summary>
          <div class="mt-2"><DashboardGaps :state="steps" @act="act" /></div>
        </details>
        <details class="rounded-xl border border-slate-200 p-3">
          <summary :class="SUMMARY">Six cards<span :class="COUNT"> (board, saved on {{ thisDevice() }}, not sent yet)</span></summary>
          <div class="mt-2"><DashboardCards :cards="cards" @act="act" /></div>
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
import { useInitialStateStore } from '@/stores/initialState';
import type { BoardRow } from '@/lib/leaderboardRank';
import {
  buildCards,
  buildSteps,
  openFor,
  type DashAction,
  type DashInput,
  type MyRunsOpen,
} from '@/lib/myRunsDashboard';
import { standingWords } from '@/lib/standing';
import { oneMoreLine, tryNextPills } from '@/lib/tryNext';
import { takeYourRunsAsk } from '@/lib/myRunsFocus';
import { useNowPage } from '@/composables/useNowPage';
import { useStartTimesStore } from '@/stores/startTimes';
import { useFollowStore } from '@/stores/follow';
import { simulateRoute } from '@/search/simulateRoute';
import type { RecalcRequest } from '@/lib/recalc';
import { saveTEOf } from '@/lib/saveFreshness';
import DashboardCards from './myruns/DashboardCards.vue';
import DashboardGaps from './myruns/DashboardGaps.vue';
import SaveAgeStrip from './myruns/SaveAgeStrip.vue';
import RightNowCard from './myruns/RightNowCard.vue';
import YourEggs from './myruns/YourEggs.vue';
import SavedTile from './myruns/SavedTile.vue';
import TryNext from './myruns/TryNext.vue';
import LeaderboardPanel from './auto/LeaderboardPanel.vue';
import SavedRuns from './auto/SavedRuns.vue';
import SavedAnswers from './auto/SavedAnswers.vue';
import UnsentResults from './auto/UnsentResults.vue';
import LatestRunView from './auto/LatestRunView.vue';

withDefaults(defineProps<{ playerId: string; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{
  use: [chain: number[]];
  /** A saved run or answer was opened (the Auto Planner screen it is on), or a Next step's screen, set up. */
  open: [to: MyRunsOpen];
  /** "Load a fresh one": App fetches the save again (and stays here). */
  fresh: [];
  /** Right now's "Recalculate": App opens the goal's screen with the save and runs Check exactly (lib/recalc.ts). */
  recalc: [req: RecalcRequest];
}>();

/** Right now's "When should I start?" (not on virtue yet): Science › When should I start?, on the plan's route when
 *  there is one (stores/startTimes.ts; App goes there). */
const startTimes = useStartTimesStore();
function openStartTimes(chain: number[] | null): void {
  if (chain && chain.length) startTimes.show(chain);
  else startTimes.open();
}

/** Right now's followed route (lib/follow.ts): typed in its box, back to the checked route, or opened in Single run. */
const follows = useFollowStore();
function followTyped(chain: number[]): void {
  const g = page.selectedGoal.value;
  if (g) void follows.follow(g, chain, 'typed');
}
function unfollowGoal(): void {
  const g = page.selectedGoal.value;
  if (g) void follows.unfollow(g);
}
function simulateFollowed(chain: number[]): void {
  const date = page.cardPlan.value?.goal.goal === 'date' || !(page.selectedGoal.value ?? 'fastest').startsWith('fastest');
  simulateRoute(chain, date ? 'by-date' : 'fastest', { from: 'the route you follow (My runs)' });
}

const store = useChainSearchStore();
const planner = useAutoPlannerStore();
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

const SUMMARY = 'cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-700';
const COUNT = 'ml-2 font-semibold normal-case tracking-normal text-slate-500';

/** The board's count, null while its first load is out. */
const boardCount = ref<number | null>(null);
const savedCount = computed(() => store.savedRuns.length + store.savedAnswers.length);
const unsentCount = computed(() => store.pendingSends.length);

function countText(n: number | null): string {
  if (n == null) return ' · loading';
  return n ? ` (${n})` : ' · none yet';
}

/** The viewer's board rows, null until the board's first load is in; every public row, for where you stand. */
const boardRows = ref<BoardRow[] | null>(null);
const allRows = ref<BoardRow[] | null>(null);

// ------------------------------------------------------------------------------- the Right now page

const page = useNowPage({ myRows: boardRows, boardRows: allRows });
const pills = computed(() => tryNextPills(page.fastestTile.value, page.eggDayTile.value));
/** "One more TE by Egg Day … would come …, after the deadline, so it isn't counted.": saved legs only, the laid
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
watch(boardCount, n => (open.board = n !== 0));
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

// ------------------------------------------------------------------ the summary (cards, Next steps)

const initialState = useInitialStateStore();
/** "Now" for the summary: when the page opened, and again whenever the rows arrive. */
const now = ref(Date.now());
watch(boardRows, () => (now.value = Date.now()));
const eggDayYear = page.eggDayYear;
const eggDayAt = page.eggDayAt;

const dashInput = computed<DashInput>(() => ({
  rows: boardRows.value,
  now: now.value,
  eggDayAt,
  eggDayYear,
  zone: zone.value,
  // The save's own TE, never a restored Manual draft's (lib/saveFreshness.ts `saveTEOf`).
  teNow: saveTEOf(initialState.rawBackup),
  setup: {
    availability: store.availability,
    timeOff: store.timeOff,
    rememberedAt: store.setupRemembered?.at || null,
  },
  local: {
    answers: store.savedAnswers.map(a => ({
      savedAt: a.savedAt,
      deadline: a.result.deadline,
      chain: a.result.routes[0]?.chain ?? null,
      spare: a.result.routes[0]?.spare ?? null,
    })),
    runs: store.savedRuns.map(r => ({ savedAt: r.savedAt })),
    pending: store.pendingSends.map(p => ({
      createdAt: p.createdAt,
      deadline: p.kind === 'deadline' && typeof p.payload?.deadline === 'number' ? p.payload.deadline : null,
    })),
  },
}));
const cards = computed(() => buildCards(dashInput.value));
const steps = computed(() => buildSteps(dashInput.value));
watch(
  () => steps.value.steps.some(s => s.kinds.includes('unsent')),
  urgent => {
    if (urgent) open.steps = true;
  },
  { immediate: true }
);

/** A card's or a step's button: a part here (opened, then scrolled to), or a screen, set up. */
function act(to: DashAction): void {
  if (to.to === 'unsent' || to.to === 'board') {
    pickShowing('all');
    open[to.to] = true;
    void nextTick(() => {
      if (typeof document === 'undefined') return;
      document
        .querySelector(`[data-testid="my-runs-part-${to.to}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }
  emit('open', openFor(to, zone.value));
}
</script>
