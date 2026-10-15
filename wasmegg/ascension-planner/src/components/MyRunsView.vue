<!--
  My runs (#/myruns, 15 Oct 2026): every run of yours in one place, in three parts, each folded when it
  has nothing in it.

    1. Your runs on the board: LeaderboardPanel mode="myruns" (Compare's own load, "which runs are mine"
       and Hide from the public), every kind and target, hidden ones too. Was Compare's My plans, which
       listed one target's runs only: a tester who sent an Egg Day answer found nothing there.
    2. Saved on this computer: Saved runs (Fastest) and Saved answers (By a date), the same lists as under
       the searches (which keep theirs); Open shows the screen it opened on.
    3. Not sent yet: results this browser kept for sending (UnsentResults, every kind), with Send it now.

  Above them (16 Oct 2026, lib/myRunsDashboard.ts): Next steps (components/myruns/DashboardGaps.vue), then
  six cards (DashboardCards.vue), from the board's rows (LeaderboardPanel's `rows`) and this browser's
  saved runs and answers, unsent results and Your setup. A step's button opens its screen set up (App.vue
  `openFromMyRuns`) or scrolls to a part here.
-->
<template>
  <div class="space-y-4" data-testid="my-runs">
    <div>
      <h2 class="text-2xl font-black text-slate-900">{{ NAMES.myRuns }}</h2>
      <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
        Your runs on the board, the runs and answers saved on {{ thisDevice() }}, and results that weren't sent yet.
      </p>
    </div>

    <div class="space-y-3" data-testid="my-runs-summary">
      <DashboardGaps :state="steps" @act="act" />
      <DashboardCards :cards="cards" @act="act" />
    </div>

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
</template>

<script setup lang="ts">
import { thisDevice } from '@/search/device';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { NAMES, fastestName } from '@/lib/siteNav';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import type { BoardRow } from '@/lib/leaderboardRank';
import {
  buildCards,
  buildSteps,
  openFor,
  type DashAction,
  type DashInput,
  type MyRunsOpen,
} from '@/lib/myRunsDashboard';
import DashboardCards from './myruns/DashboardCards.vue';
import DashboardGaps from './myruns/DashboardGaps.vue';
import LeaderboardPanel from './auto/LeaderboardPanel.vue';
import SavedRuns from './auto/SavedRuns.vue';
import SavedAnswers from './auto/SavedAnswers.vue';
import UnsentResults from './auto/UnsentResults.vue';

defineProps<{ playerId: string }>();
const emit = defineEmits<{
  use: [chain: number[]];
  /** A saved run or answer was opened (the Auto Planner screen it is on), or a Next step's screen, set up. */
  open: [to: MyRunsOpen];
}>();

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

/**
 * Each part is open when it has something in it, folded when it is empty (the board's stays open while
 * it loads). A part opens or folds by itself only when it gains its first item or loses its last; in
 * between, the player's own click holds.
 */
const open = reactive({
  board: boardCount.value !== 0,
  saved: savedCount.value > 0,
  unsent: unsentCount.value > 0,
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
/** The viewer's board rows, null until the board's first load is in. */
const boardRows = ref<BoardRow[] | null>(null);
/** "Now" for the summary: when the page opened, and again whenever the rows arrive. */
const now = ref(Date.now());
watch(boardRows, () => (now.value = Date.now()));
// The board's own Egg Day (LeaderboardPanel's): an answer to that moment is Egg Day's.
const eggDayYear = nextEggDayYear();
const eggDayAt = eggDaySeconds(eggDayYear);

const dashInput = computed<DashInput>(() => ({
  rows: boardRows.value,
  now: now.value,
  eggDayAt,
  eggDayYear,
  zone: zone.value,
  teNow: initialState.rawBackup ? store.backupTE : 0,
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

/** A card's or a step's button: a part here (opened, then scrolled to), or a screen, set up. */
function act(to: DashAction): void {
  if (to.to === 'unsent' || to.to === 'board') {
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
