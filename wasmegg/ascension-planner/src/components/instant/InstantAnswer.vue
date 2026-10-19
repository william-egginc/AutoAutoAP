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
      <div class="bg-slate-50 p-1 rounded-2xl border border-slate-200/50 flex flex-wrap gap-1" role="tablist">
        <button
          v-for="g in goals"
          :key="g.value"
          type="button"
          class="px-3 py-1.5 max-sm:min-h-[44px] rounded-xl text-[10px] font-black uppercase tracking-[0.12em] transition-all"
          :class="goal === g.value ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-600'"
          :data-testid="`instant-goal-${g.value}`"
          @click="goal = g.value"
        >
          {{ g.label }}
        </button>
      </div>
    </div>

    <div v-if="goal === 'date'" class="flex flex-wrap items-center gap-2">
      <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest" for="instant-date">Date</label>
      <input
        id="instant-date"
        v-model="dateText"
        type="date"
        class="bg-white border border-slate-200 rounded-xl px-3 py-1.5 max-sm:min-h-[44px] text-xs font-bold text-slate-700"
        data-testid="instant-date"
      />
      <span class="text-[10px] text-slate-400">9:00 am, your timezone</span>
    </div>

    <p v-if="staleNote" class="text-[11px] text-amber-700" data-testid="instant-stale">{{ staleNote }}</p>
    <NoInstantAnswer v-if="noAnswer" :reason="noAnswer" />
    <p v-else-if="status === 'loading'" class="text-xs text-slate-500" data-testid="instant-loading">{{ loadingText }}</p>
    <p v-else-if="status === 'error'" class="text-xs text-red-600">The instant answer couldn’t run: {{ errorText }}</p>
    <template v-else-if="status === 'done' && shown">
      <p v-if="!rows.length" class="text-xs text-slate-500">No route reaches {{ goalWords }} on the table.</p>
      <InstantRows v-else :rows="rows" :dated="shown.dated" :timezone="timezone" @simulate="simulate" />
      <p
        v-if="gearCaveat"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
        data-testid="instant-gear-differs"
      >
        {{ gearCaveat }}
      </p>
      <p class="text-[10px] text-slate-500 leading-relaxed" data-testid="instant-caveat">
        Any hour: every ascension starts on the next whole hour after the last one ends, day or night.
        <template v-if="midAscension">
          The first is whichever is sooner: finishing your current ascension without buying anything (continue), or a
          fresh start (prestige now).
        </template>
        <template v-else>The first is a fresh start (prestige now) on your save’s eggs.</template>
        Fresh ascensions run at your delivery rate ({{ (scale * 100).toFixed(1) }}% of the table’s). The Auto Planner
        is the exact check (“Simulate this plan”)<template v-if="gearCaveat">.</template
        ><template v-else>: its dates can differ from these by a fraction of a percent, earlier or later.</template>
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
  answerFits,
  eggDaySeconds,
  nextEggDayYear,
  noAnswerFor,
  rowsShown,
  saveStart,
  type AnsweredGoal,
  type AnswerRequest,
  type AnswerRow,
  type NoAnswer,
} from '@/instant/instantAnswer';
import { deliveryScale } from '@/instant/deliveryScale';
import { earningsBonus, gearDiffers, gearDiffersText } from '@/instant/gearDiffers';
import { continueTail, hasVirtueFarm, siloSeconds, staleSaveNote } from '@/instant/continueTail';
import { baseStateFromBackup, eggsDeliveredFromBackup, farmFromBackup, saveSyncSeconds } from '@/instant/saveFarm';
import { answer, isNewest, newRequestId, tableHeader } from '@/instant/instantClient';
import { getSimulationContext } from '@/engine/adapter';
import type { BuildParams } from '@/instant/precomputedLeg';
import type { SimulateRequest } from '@/instant/simulatePlan';
import { entryFromRow, type PlanEntry } from '@/instant/plansOnDevice';
import NoInstantAnswer from './NoInstantAnswer.vue';
import InstantRows from './InstantRows.vue';

/** `plan`: what "Your plans on this device" keeps of the row (goal, finish or TE). */
const emit = defineEmits<{ simulate: [req: SimulateRequest, plan: PlanEntry] }>();

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
/** Now, to the minute: a date whose 9:00 am has gone by is said to have passed. */
const nowSeconds = ref(Math.floor(Date.now() / 1000));
let clock: ReturnType<typeof setInterval> | undefined;

/** By a date: the unix second (9:00 am in the planner's timezone for another date). */
const deadline = computed<number | undefined>(() => {
  if (goal.value === 'eggday') return eggDaySeconds(eggDayYear);
  if (goal.value === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(dateText.value))
    return getLocalTimestampInTimezone(dateText.value, '09:00', timezone.value);
  return undefined;
});
/** The goal now chosen, as answers are matched to it. */
const chosen = computed<AnsweredGoal>(() => ({
  dated: goal.value !== 'fastest',
  ...(deadline.value !== undefined ? { deadline: deadline.value } : {}),
}));
/** The goal as the plans list says it. */
function labelFor(g: AnsweredGoal): string {
  if (!g.dated) return 'Race to 490';
  if (g.deadline === eggDaySeconds(eggDayYear)) return `Egg Day ${eggDayYear}`;
  return g.deadline === undefined
    ? 'By a date'
    : `By ${new Intl.DateTimeFormat('en-US', { timeZone: timezone.value, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(g.deadline * 1000))}`;
}
const goalWords = computed(() => (shown.value?.dated ? 'any TE by then' : '490 TE'));

/*
 * The save's inputs come from the raw backup, never from the store's live farm or egg counts: Joo's
 * Continue Current load rewrites those in place (lib/modes/utils.ts catchUpFarmState), so the answer
 * would change with whether his Auto tab was opened (instant/saveFarm.ts).
 */
const backup = computed(() => initialState.rawBackup);
const start = computed(() =>
  saveStart(backup.value ? eggsDeliveredFromBackup(backup.value) : initialState.initialEggsDelivered)
);
const startTE = computed(() => start.value.te);
const farm = computed(() => farmFromBackup(backup.value));

const status = ref<'idle' | 'loading' | 'done' | 'error'>('idle');
const loadingText = ref('');
const errorText = ref('');
const header = ref<TableHeader | null>(null);
/** Set once the header was asked for and the table is missing, unreadable or from another simulator. */
const noTable = ref(false);
const found = ref<FoundRoutes | null>(null);
/** The goal `found` was worked out for. */
const foundGoal = ref<AnsweredGoal | null>(null);
/** The answer on hand, only when it is for the goal now chosen. */
const shown = computed<AnsweredGoal | null>(() =>
  found.value && answerFits(foundGoal.value, chosen.value) ? foundGoal.value : null
);

const noAnswer = computed<NoAnswer | null>(() => {
  const r = noAnswerFor(header.value, startTE.value, deadline.value, { dated: chosen.value.dated, now: nowSeconds.value });
  if (r && (r.kind === 'pick-date' || r.kind === 'date-passed')) return r;
  if (noTable.value) return { kind: 'no-table' };
  if (!header.value) return null;
  return r;
});

const scale = computed(() =>
  header.value
    ? deliveryScale(backup.value, header.value.k3, initialState.epicResearchLevels, initialState.colleggtibleModifiers)
    : 1
);

/** Below TE 340 with gear other than the table's: the answer can be a few percent off (gearDiffers.ts). */
const gearCaveat = computed(() => {
  if (!header.value) return null;
  const gap = { bonusShort: header.value.cteBonus - earningsBonus(backup.value), scale: scale.value };
  return gearDiffers(startTE.value, gap) ? gearDiffersText(gap) : null;
});

/** On a virtue farm: leg 1 can be continue (continueTail.ts). */
const midAscension = computed(() => hasVirtueFarm(farm.value));
/** The save's age, said in one line when it is over an hour. */
const staleNote = computed(() =>
  staleSaveNote(
    saveSyncSeconds(backup.value) || initialState.lastBackupTime,
    nowSeconds.value,
    siloSeconds(farm.value?.numSilos, initialState.epicResearchLevels?.['silo_capacity'])
  )
);

/** Continue's tail from `start` on the save as loaded, or null (no farm, or it can't be worked out). */
function contAt(at: number, delivered: number[]): BuildParams | null {
  if (!midAscension.value || !backup.value) return null;
  try {
    return continueTail({
      farm: farm.value,
      backup: backup.value,
      base: baseStateFromBackup(backup.value),
      context: getSimulationContext(),
      start: at,
      delivered,
    });
  } catch {
    return null;
  }
}

const rows = computed<AnswerRow[]>(() =>
  found.value && shown.value ? rowsShown(found.value, shown.value.deadline) : []
);

/** What an answer is kept under for a moment (instantClient.ts): the save and the goal. */
function answerKey(dl: number | undefined): string {
  return JSON.stringify([saveSyncSeconds(backup.value), start.value.delivered, dl ?? null, scale.value]);
}

/** Work the answer out for the save and the goal now chosen (the newest call wins). */
async function run(): Promise<void> {
  if (!initialState.hasData) return;
  const id = newRequestId();
  nowSeconds.value = Math.floor(Date.now() / 1000);
  // A date to pick, or one gone by: no run.
  if (noAnswer.value) {
    status.value = 'idle';
    return;
  }
  status.value = 'loading';
  loadingText.value = header.value ? 'Working out every route…' : 'Loading the instant answer (a few MB, once)…';
  if (!header.value) {
    const h = await tableHeader(TABLE_URL);
    if (!isNewest(id)) return;
    if (!h) {
      noTable.value = true;
      status.value = 'idle';
      return;
    }
    header.value = h;
  }
  if (noAnswer.value) {
    status.value = 'idle';
    return;
  }
  const g = chosen.value;
  const now = nowSeconds.value;
  const cont = contAt(now, start.value.delivered);
  const req: AnswerRequest = {
    startTE: startTE.value,
    start: now,
    delivered: [...start.value.delivered],
    deliveryScale: scale.value,
    // A plain copy: it goes to the worker.
    ...(cont ? { cont: JSON.parse(JSON.stringify(cont)) as BuildParams } : {}),
    ...(g.deadline !== undefined ? { deadline: g.deadline } : {}),
  };
  const a = await answer(id, TABLE_URL, req, answerKey(g.deadline), (done, of) => {
    if (isNewest(id)) loadingText.value = `Working out every route: ${done} of ${of} ascension counts done…`;
  });
  if (!isNewest(id)) return;
  if (a.kind === 'answer') {
    found.value = a.found;
    foundGoal.value = { ...g };
    status.value = 'done';
  } else if (a.kind !== 'dropped') {
    errorText.value = a.kind === 'error' ? a.message : 'unexpected reply';
    status.value = 'error';
  }
}

function simulate(row: AnswerRow): void {
  // Only rows of the goal now chosen (they are the only ones shown); never a race row as a date plan.
  const g = shown.value;
  if (!g) return;
  const first = row.route.legs[0];
  const a1 = first?.label ?? '';
  emit(
    'simulate',
    { chain: [...row.route.chain], start: first?.start ?? Date.now() / 1000, a1 },
    entryFromRow(row, labelFor(g), g.dated, a1)
  );
}

onMounted(() => {
  void run();
  clock = setInterval(() => (nowSeconds.value = Math.floor(Date.now() / 1000)), 60_000);
  watch([deadline, goal, () => start.value.delivered.join(), backup], () => void run());
});
onBeforeUnmount(() => {
  // The worker stays (instantClient.ts: one per page); only this card's clock stops.
  if (clock) clearInterval(clock);
});
</script>
