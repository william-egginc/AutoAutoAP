<!--
  My runs (#/myruns, 15 Oct 2026): every run of yours in one place, in three parts, each folded when it
  has nothing in it.

    1. Your runs on the board: LeaderboardPanel mode="myruns" (Compare's own load, "which runs are mine"
       and Hide from the public), every kind and target, hidden ones too. Was Compare's My plans, which
       listed one target's runs only: a tester who sent an Egg Day answer found nothing there.
    2. Saved on this computer: Saved runs (Fastest) and Saved answers (By a date), the same lists as under
       the searches (which keep theirs); Open shows the screen it opened on.
    3. Not sent yet: results this browser kept for sending (UnsentResults, every kind), with Send it now.
-->
<template>
  <div class="space-y-4" data-testid="my-runs">
    <div>
      <h2 class="text-2xl font-black text-slate-900">{{ NAMES.myRuns }}</h2>
      <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
        Your runs on the board, the runs and answers saved on {{ thisDevice() }}, and results that weren't sent yet.
      </p>
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
import { computed, reactive, ref, watch } from 'vue';
import { NAMES, fastestName, type AutoView, type Depth } from '@/lib/siteNav';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import LeaderboardPanel from './auto/LeaderboardPanel.vue';
import SavedRuns from './auto/SavedRuns.vue';
import SavedAnswers from './auto/SavedAnswers.vue';
import UnsentResults from './auto/UnsentResults.vue';

defineProps<{ playerId: string }>();
const emit = defineEmits<{
  use: [chain: number[]];
  /** A saved run or answer was opened: the Auto Planner screen it is on. */
  open: [to: { auto: AutoView; depth?: Depth }];
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
</script>
