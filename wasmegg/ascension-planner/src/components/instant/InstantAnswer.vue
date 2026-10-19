<!--
  The instant answer (ported in small from the AutoAutoAP fork): the best route for each number of
  ascensions from the precomputed table, to 490 TE or to the highest TE by a date, worked out on a
  worker in a few seconds. Each route opens in the Auto Planner ("Simulate this plan"), whose own
  simulator gives the exact dates. No exact check, hours or sharing here.
-->
<template>
  <div class="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4" data-testid="instant-answer">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-tight">Instant answer</h2>
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          From your TE {{ startTE }}, any hour
        </p>
      </div>
      <!-- Which goal, like Joo's Manual / Auto switch. -->
      <div class="bg-slate-50 p-1 rounded-2xl border border-slate-200/50 flex gap-1" role="tablist">
        <button
          v-for="g in goals"
          :key="g.value"
          type="button"
          class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-all"
          :class="goal === g.value ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'"
          :data-testid="`instant-goal-${g.value}`"
          @click="goal = g.value"
        >
          {{ g.label }}
        </button>
      </div>
    </div>

    <div v-if="goal === 'date'" class="flex items-center gap-2">
      <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest" for="instant-date">Date</label>
      <input
        id="instant-date"
        v-model="dateText"
        type="date"
        class="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700"
      />
      <span class="text-[10px] text-slate-400">9:00 am, your timezone</span>
    </div>

    <p v-if="staleNote" class="text-[11px] text-amber-700" data-testid="instant-stale">{{ staleNote }}</p>
    <NoInstantAnswer v-if="noAnswer" :reason="noAnswer" />
    <p v-else-if="status === 'loading'" class="text-xs text-slate-500" data-testid="instant-loading">{{ loadingText }}</p>
    <p v-else-if="status === 'error'" class="text-xs text-red-600">The instant answer couldn’t run: {{ errorText }}</p>
    <template v-else-if="status === 'done'">
      <p v-if="!rows.length" class="text-xs text-slate-500">No route reaches {{ goalWords }} on the table.</p>
      <InstantRows v-else :rows="rows" :dated="deadline !== undefined" :timezone="timezone" @simulate="simulate" />
      <p class="text-[10px] text-slate-500 leading-relaxed" data-testid="instant-caveat">
        Any hour: every ascension starts on the next whole hour after the last one ends, day or night.
        <template v-if="midAscension">
          The first is whichever is sooner: finishing your current ascension without buying anything (continue), or a
          fresh start (prestige now).
        </template>
        <template v-else>The first is a fresh start (prestige now) on your save’s eggs.</template>
        Fresh ascensions run at your delivery rate ({{ (scale * 100).toFixed(1) }}% of the table’s). The Auto Planner
        ascends at once, so “Simulate this plan” can finish a little sooner: its dates are the exact ones.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { formatUnixToDateInput } from '@/lib/format';
import type { FoundRoutes } from '@/instant/routeFinder';
import type { TableHeader } from '@/instant/precomputedTable';
import {
  eggDaySeconds,
  nextEggDayYear,
  noAnswerFor,
  rowsShown,
  saveStart,
  type AnswerRequest,
  type AnswerRow,
  type NoAnswer,
} from '@/instant/instantAnswer';
import { deliveryScale } from '@/instant/deliveryScale';
import { continueTail, hasVirtueFarm, siloSeconds, staleSaveNote } from '@/instant/continueTail';
import { createBaseEngineState, getSimulationContext } from '@/engine/adapter';
import type { BuildParams } from '@/instant/precomputedLeg';
import type { SimulateRequest } from '@/instant/simulatePlan';
import type { InstantWorkerRequest, InstantWorkerResponse } from '@/instant/instant.worker';
import NoInstantAnswer from './NoInstantAnswer.vue';
import InstantRows from './InstantRows.vue';

const emit = defineEmits<{ simulate: [req: SimulateRequest] }>();

const initialState = useInitialStateStore();
const planner = useAutoPlannerStore();

const TABLE_URL = `${import.meta.env.BASE_URL}precompute/table.bin`;

type Goal = 'fastest' | 'eggday' | 'date';
const eggDayYear = nextEggDayYear();
const goals: { value: Goal; label: string }[] = [
  { value: 'fastest', label: 'Fastest to 490' },
  { value: 'eggday', label: `Egg Day ${eggDayYear}` },
  { value: 'date', label: 'Another date' },
];
const goal = ref<Goal>('fastest');
const timezone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
const dateText = ref(formatUnixToDateInput(Date.now() / 1000 + 60 * 86400, timezone.value));

/** By a date: the unix second (9:00 am in the planner's timezone for another date). */
const deadline = computed<number | undefined>(() => {
  if (goal.value === 'eggday') return eggDaySeconds(eggDayYear);
  if (goal.value === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(dateText.value))
    return getLocalTimestampInTimezone(dateText.value, '09:00', timezone.value);
  return undefined;
});
const goalWords = computed(() => (deadline.value === undefined ? '490 TE' : 'any TE by then'));

const start = computed(() => saveStart(initialState.initialEggsDelivered));
const startTE = computed(() => start.value.te);

const status = ref<'idle' | 'loading' | 'done' | 'error'>('idle');
const loadingText = ref('');
const errorText = ref('');
const header = ref<TableHeader | null>(null);
/** Set once the header was asked for and the table is missing, unreadable or from another simulator. */
const noTable = ref(false);
const found = ref<FoundRoutes | null>(null);
const foundFor = ref<number | undefined>(undefined);

const noAnswer = computed<NoAnswer | null>(() => {
  if (noTable.value) return { kind: 'no-table' };
  if (!header.value) return null;
  return noAnswerFor(header.value, startTE.value, deadline.value);
});

const scale = computed(() =>
  header.value
    ? deliveryScale(
        initialState.rawBackup,
        header.value.k3,
        initialState.epicResearchLevels,
        initialState.colleggtibleModifiers
      )
    : 1
);

/** On a virtue farm: leg 1 can be continue (continueTail.ts). */
const midAscension = computed(() => hasVirtueFarm(initialState.currentFarmState));
/** The save's age, said in one line when it is over an hour. */
const staleNote = computed(() => {
  const farm = initialState.currentFarmState;
  const sync = hasVirtueFarm(farm) ? farm!.lastStepTime : initialState.lastBackupTime;
  return staleSaveNote(
    sync,
    Date.now() / 1000,
    siloSeconds(farm?.numSilos, initialState.epicResearchLevels?.['silo_capacity'])
  );
});

/** Continue's tail from `start` on the save as loaded, or null (no farm, or it can't be worked out). */
function contAt(start: number, delivered: number[]): BuildParams | null {
  if (!midAscension.value) return null;
  try {
    return continueTail({
      farm: initialState.currentFarmState,
      backup: initialState.rawBackup,
      base: createBaseEngineState(null),
      context: getSimulationContext(),
      start,
      delivered,
    });
  } catch {
    return null;
  }
}

const rows = computed<AnswerRow[]>(() => (found.value ? rowsShown(found.value, foundFor.value) : []));

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (m: InstantWorkerResponse) => void>();

function ask(m: InstantWorkerRequest): Promise<InstantWorkerResponse> {
  if (!worker) {
    worker = new Worker(new URL('../../instant/instant.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<InstantWorkerResponse>) => {
      const r = e.data;
      if (r.kind === 'progress') {
        if (r.id === nextId) loadingText.value = `Working out every route: ${r.done} of ${r.of} ascension counts done…`;
        return;
      }
      waiting.get(r.id)?.(r);
      waiting.delete(r.id);
    };
  }
  return new Promise(resolve => {
    waiting.set(m.id, resolve);
    worker!.postMessage(m);
  });
}

/** Work the answer out for the save and the goal now chosen (the newest call wins). */
async function run(): Promise<void> {
  if (!initialState.hasData) return;
  const id = ++nextId;
  status.value = 'loading';
  loadingText.value = header.value ? 'Working out every route…' : 'Loading the instant answer (a few MB, once)…';
  if (!header.value) {
    const h = await ask({ kind: 'header', id, url: TABLE_URL });
    if (id !== nextId) return;
    if (h.kind !== 'header') {
      noTable.value = true;
      status.value = 'idle';
      return;
    }
    header.value = h.header;
  }
  if (noAnswer.value) {
    status.value = 'idle';
    return;
  }
  const dl = deadline.value;
  const now = Math.floor(Date.now() / 1000);
  const cont = contAt(now, start.value.delivered);
  const req: AnswerRequest = {
    startTE: startTE.value,
    start: now,
    delivered: [...start.value.delivered],
    deliveryScale: scale.value,
    // A plain copy: it goes to the worker.
    ...(cont ? { cont: JSON.parse(JSON.stringify(cont)) as BuildParams } : {}),
    ...(dl !== undefined ? { deadline: dl } : {}),
  };
  const a = await ask({ kind: 'answer', id: ++nextId, url: TABLE_URL, req });
  if (a.id !== nextId) return;
  if (a.kind === 'answer') {
    found.value = a.found;
    foundFor.value = dl;
    status.value = 'done';
  } else {
    errorText.value = a.kind === 'error' ? a.message : 'unexpected reply';
    status.value = 'error';
  }
}

function simulate(row: AnswerRow): void {
  const first = row.route.legs[0];
  emit('simulate', { chain: [...row.route.chain], start: first?.start ?? Date.now() / 1000, a1: first?.label ?? '' });
}

onMounted(() => {
  void run();
  watch([deadline, () => initialState.initialEggsDelivered, () => initialState.rawBackup], () => void run(), {
    deep: false,
  });
});
onBeforeUnmount(() => {
  worker?.terminate();
  worker = null;
});
</script>
