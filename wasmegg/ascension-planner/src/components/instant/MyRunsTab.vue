<!--
  My runs: the instant answer for the loaded save, then the account's runs on the AutoAutoAP board,
  read-only (instant/myRuns.ts: GET /all, kept to the rows that look like this account's).
-->
<template>
  <div class="max-w-4xl mx-auto mt-4 space-y-6 pb-24" data-testid="my-runs-tab">
    <InstantAnswer @simulate="req => emit('simulate', req)" />

    <div class="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 sm:p-6 space-y-3">
      <div>
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-tight">My runs on the board</h2>
        <p class="text-[10px] text-slate-500 leading-relaxed">
          Runs on the board with your timezone and artifacts (and, for a run sent with a name, your in-game name). Read
          only: nothing is sent from here.
        </p>
      </div>
      <p v-if="!root" class="text-xs text-slate-500" data-testid="my-runs-no-board">This site has no board to read.</p>
      <p v-else-if="state === 'loading'" class="text-xs text-slate-500">Reading the board…</p>
      <p v-else-if="state === 'error'" class="text-xs text-red-600">The board couldn’t be read: {{ errorText }}</p>
      <p v-else-if="!runs.length" class="text-xs text-slate-500" data-testid="my-runs-empty">
        No runs on the board look like yours.
      </p>
      <ul v-else class="divide-y divide-slate-100" data-testid="my-runs-list">
        <li v-for="(r, i) in runs" :key="r.id ?? i" class="py-2 text-xs flex flex-wrap gap-x-4 gap-y-1" data-testid="my-run">
          <span class="font-black text-slate-800 w-28">{{ goalOf(r) }}</span>
          <span class="font-mono text-slate-700">{{ r.chain.join(' → ') }}</span>
          <span class="text-slate-600">{{ resultOf(r) }}</span>
          <span v-if="r.level || r.effort" class="text-slate-400 uppercase text-[10px] font-black tracking-widest">{{
            r.level || r.effort
          }}</span>
          <span v-if="sent(r)" class="text-slate-400">sent {{ sent(r) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { eggDaySeconds, saveStart } from '@/instant/instantAnswer';
import {
  accountKey,
  bestVirtueArtifacts,
  collectorRoot,
  fetchBoardRows,
  finishMs,
  myRuns,
  runGoal,
  sentMs,
  type BoardRow,
} from '@/instant/myRuns';
import type { SimulateRequest } from '@/instant/simulatePlan';
import InstantAnswer from './InstantAnswer.vue';

const props = defineProps<{
  /** Rows to show instead of reading the board (specs). */
  rows?: BoardRow[];
}>();
const emit = defineEmits<{ simulate: [req: SimulateRequest] }>();

const initialState = useInitialStateStore();
const planner = useAutoPlannerStore();
const root = props.rows ? 'given' : collectorRoot();

const timezone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
const all = ref<BoardRow[]>(props.rows ?? []);
const state = ref<'idle' | 'loading' | 'done' | 'error'>(props.rows ? 'done' : 'idle');
const errorText = ref('');

const runs = computed(() => {
  const raw = initialState.rawBackup;
  return myRuns(all.value, {
    key: raw ? accountKey(timezone.value, bestVirtueArtifacts(raw)) : null,
    te: saveStart(initialState.initialEggsDelivered).te,
    name: raw?.userName ?? '',
  });
});

function fmt(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone.value,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms));
}
function goalOf(r: BoardRow): string {
  return runGoal(r, eggDaySeconds);
}
function resultOf(r: BoardRow): string {
  const f = finishMs(r);
  const at = f === null ? '' : fmt(f);
  return typeof r.deadline === 'number'
    ? `${r.finalTE} TE${at ? `, last ascension ${at}` : ''}`
    : `${r.durationDays.toFixed(1)} d${at ? `, finishes ${at}` : ''}`;
}
function sent(r: BoardRow): string {
  const t = sentMs(r);
  return t === null ? '' : fmt(t);
}

onMounted(async () => {
  if (props.rows || !root) return;
  state.value = 'loading';
  try {
    all.value = await fetchBoardRows(root);
    state.value = 'done';
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err);
    state.value = 'error';
  }
});
</script>
