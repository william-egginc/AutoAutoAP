<!--
  Find a run's body (the instant answer, ported in small from the AutoAutoAP fork): "I want to…" (reach
  490 TE, or the most TE by a date, Egg Day by default), the setup line, the Filters (built, disabled
  for now), then the best route for each number of ascensions from the precomputed table, worked out on
  a worker in a few seconds. A row opens to its ascensions' starts and ends (estimates) and the buttons
  Import into the planner (Joo's Auto Planner on that route, whose own simulator gives exact dates) and
  Save this plan (the Auto Planner tab's Saved runs).
-->
<template>
  <div class="space-y-4" data-testid="instant-answer">
    <!-- I want to… -->
    <section
      class="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 sm:p-6 space-y-3"
      data-testid="find-goal"
    >
      <h2 class="text-sm font-black text-slate-900 uppercase tracking-tight">I want to…</h2>
      <div class="flex flex-wrap items-center gap-2">
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
        <template v-if="goal === 'date'">
          <label class="sr-only" for="instant-date">Date</label>
          <input
            id="instant-date"
            v-model="dateText"
            type="date"
            class="bg-white border border-slate-200 rounded-xl px-3 py-1.5 max-sm:min-h-[44px] text-xs font-bold text-slate-700"
            data-testid="instant-date"
          />
          <span class="text-[10px] text-slate-400">{{ deadlineHint }}</span>
        </template>
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed" data-testid="find-setup">
        {{ saveWords }} · setup: any hour, no time off ·
        <button
          type="button"
          class="underline text-indigo-600 font-bold max-sm:min-h-[44px]"
          data-testid="find-edit-setup"
          @click="emit('editSetup')"
        >
          Edit setup
        </button>
      </p>
      <p v-if="tableLine" class="text-[11px] text-slate-500" data-testid="find-table">{{ tableLine }}</p>
    </section>

    <FindFilters />

    <!-- The rows -->
    <section
      class="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 sm:p-6 space-y-3"
      data-testid="find-results"
    >
      <div>
        <h2 class="text-sm font-black text-slate-900 uppercase tracking-tight" data-testid="find-heading">
          {{ heading }}
        </h2>
        <p v-if="rows.length" class="text-[11px] text-slate-500" data-testid="find-sub">
          {{ countsText(rows) }} ascensions · times are estimates until you check a route exactly
        </p>
      </div>

      <p v-if="staleNote" class="text-[11px] text-amber-700" data-testid="instant-stale">{{ staleNote }}</p>
      <NoInstantAnswer v-if="noAnswer" :reason="noAnswer" />
      <p v-else-if="status === 'loading'" class="text-xs text-slate-500" data-testid="instant-loading">
        {{ loadingText }}
      </p>
      <p v-else-if="status === 'error'" class="text-xs text-red-600">
        The instant answer couldn’t run: {{ errorText }}
      </p>
      <template v-else-if="status === 'done' && shown">
        <p v-if="!rows.length" class="text-xs text-slate-500">No route reaches {{ goalWords }} on the table.</p>
        <InstantRows
          v-else
          :rows="rows"
          :dated="shown.dated"
          :timezone="timezone"
          :saved="savedOfGoal"
          :key-of="rowKey"
          :save-when="saveTime ? atText(saveTime, timezone) : 'your loaded save'"
          :start-te="startTE"
          :deadline="shown.deadline"
          @simulate="simulate"
          @save="save"
          @checked="checked"
        />
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
          <template v-if="by === 'maxed'"
            >Fresh ascensions run at your delivery rate ({{ (scale * 100).toFixed(1) }}% of the table’s).</template
          >
          The Auto Planner is the exact check (“Import into the planner”)<template v-if="gearCaveat">.</template
          ><template v-else>: its dates can differ from these by a fraction of a percent, earlier or later.</template>
        </p>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { getLocalTimestampInTimezone } from '@/lib/events';
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
import { answer, isNewest, newRequestId, probeHeader, tableHeader } from '@/instant/instantClient';
import { answeredBy, chooseTable, choiceFor, ownRange, shiftWords, tableLineFor, type TableChoice } from '@/instant/tableChoice';
import { deliverySetAt, gearStamp, tableName } from '@/instant/tableGear';
import { earningsCTE } from '@/instant/earningsShift';
import { tableIndex } from '@/instant/deliveryTables';
import { getSimulationContext } from '@/engine/adapter';
import type { BuildParams } from '@/instant/precomputedLeg';
import type { SimulateRequest } from '@/instant/simulatePlan';
import { SIM_VERSION } from '@/instant/simVersion';
import { atText, countsText, dayText, gearLabel, rowsByBest, whenAgo } from '@/instant/findRun';
import { entryFromRow, planId, RACE_GOAL, type PlanEntry } from '@/instant/plansOnDevice';
import { checkKey, withExact, type ExactResult } from '@/instant/exactCheck';
import { checkResult } from '@/instant/exactClient';
import NoInstantAnswer from './NoInstantAnswer.vue';
import InstantRows from './InstantRows.vue';
import FindFilters from './FindFilters.vue';

const props = defineProps<{
  /** The saved runs' ids (plansOnDevice.ts planId): those rows say "Saved ✓". */
  savedIds?: string[];
}>();
const emit = defineEmits<{
  simulate: [req: SimulateRequest];
  save: [plan: PlanEntry];
  editSetup: [];
}>();

const initialState = useInitialStateStore();
const planner = useAutoPlannerStore();

const MAXED_TABLE = 'table.bin';
/** The site's own copies, and the shared table storage (Cloudflare) when the build names one. The
 *  storage is tried first; if its maxed table can't be read, the page falls back to its own copies. */
const LOCAL_TABLE_BASE = `${import.meta.env.BASE_URL}precompute/`;
const REMOTE_TABLE_BASE = (import.meta.env.VITE_TABLES_BASE as string | undefined) || '';
let TABLE_BASE = REMOTE_TABLE_BASE || LOCAL_TABLE_BASE;
let TABLE_URL = TABLE_BASE + MAXED_TABLE;

type Goal = 'race' | 'date';
const eggDayYear = nextEggDayYear();
const goals: { value: Goal; label: string }[] = [
  { value: 'race', label: 'Reach 490 TE' },
  { value: 'date', label: 'Get the most TE by a date' },
];
/** Egg Day by default. */
const goal = ref<Goal>('date');
const timezone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
const EGG_DAY = /^(\d{4})-07-14$/;
const dateText = ref(`${eggDayYear}-07-14`);
/** Now, to the minute: a date whose 9:00 am has gone by is said to have passed. */
const nowSeconds = ref(Math.floor(Date.now() / 1000));
let clock: ReturnType<typeof setInterval> | undefined;

/** Egg Day's year when the date picked is an Egg Day (14 July: 9:00 am Pacific). */
const eggDayPicked = computed(() => {
  const m = EGG_DAY.exec(dateText.value);
  return m ? Number(m[1]) : null;
});
/** By a date: the unix second (Egg Day 9:00 am Pacific; another date 9:00 am in the planner's timezone). */
const deadline = computed<number | undefined>(() => {
  if (goal.value !== 'date') return undefined;
  if (eggDayPicked.value !== null) return eggDaySeconds(eggDayPicked.value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateText.value))
    return getLocalTimestampInTimezone(dateText.value, '09:00', timezone.value);
  return undefined;
});
const deadlineHint = computed(() =>
  eggDayPicked.value !== null ? `Egg Day ${eggDayPicked.value}, 9:00 am Pacific` : '9:00 am, your timezone'
);
/** The goal now chosen, as answers are matched to it. */
const chosen = computed<AnsweredGoal>(() => ({
  dated: goal.value === 'date',
  ...(deadline.value !== undefined ? { deadline: deadline.value } : {}),
}));
/** The goal as the heading and the saved runs say it. */
function labelFor(g: AnsweredGoal): string {
  if (!g.dated) return RACE_GOAL;
  if (g.deadline === undefined) return 'By a date';
  for (const y of [eggDayYear - 1, eggDayYear, eggDayYear + 1, eggDayYear + 2])
    if (g.deadline === eggDaySeconds(y)) return `Egg Day ${y}`;
  return `By ${dayText(g.deadline, timezone.value)}`;
}
const heading = computed(() => {
  const g = shown.value ?? chosen.value;
  if (!g.dated) return 'Your best runs to 490 TE';
  const l = labelFor(g);
  return l === 'By a date' ? 'Your best runs by a date' : `Your best runs by ${l.replace(/^By /, '')}`;
});
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
/** When the loaded save was made (unix seconds; 0 unknown). */
const saveTime = computed(() => saveSyncSeconds(backup.value) || initialState.lastBackupTime || 0);
const saveWords = computed(() =>
  saveTime.value
    ? `Using your save of ${whenAgo(saveTime.value, nowSeconds.value, timezone.value)}`
    : 'Using your loaded save'
);

const status = ref<'idle' | 'loading' | 'done' | 'error'>('idle');
const loadingText = ref('');
const errorText = ref('');
/** The maxed table's header (its k3 and cteBonus price the save's gear against it). */
const header = ref<TableHeader | null>(null);
/** Which table answers this save (tableChoice.ts): the account's own, its exact gear's, a delivery
 *  table like the save's read with the earnings shift, or the maxed one (read with the shift when only
 *  the earnings differ). */
const choice = ref<TableChoice | null>(null);
/** Set once the header was asked for and the table is missing, unreadable or from another simulator. */
const noTable = ref(false);
const found = ref<FoundRoutes | null>(null);
/** The goal `found` was worked out for. */
const foundGoal = ref<AnsweredGoal | null>(null);
/** The answer on hand, only when it is for the goal now chosen. */
const shown = computed<AnsweredGoal | null>(() =>
  found.value && answerFits(foundGoal.value, chosen.value) ? foundGoal.value : null
);

/** The header the save is checked against: the maxed table's, with the chosen table's range joined
 *  in (the worker answers from both, per leg). */
const checkHeader = computed<TableHeader | null>(() => {
  const h = header.value;
  const own = choice.value ? ownRange(choice.value) : null;
  return h && own ? { ...h, from: Math.min(h.from, own.from), to: Math.max(h.to, own.to) } : h;
});

const noAnswer = computed<NoAnswer | null>(() => {
  const r = noAnswerFor(checkHeader.value, startTE.value, deadline.value, {
    dated: chosen.value.dated,
    now: nowSeconds.value,
  });
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

/** How far the save's gear is from the table's (null before the table's header is read). */
const gap = computed(() =>
  header.value ? { bonusShort: header.value.cteBonus - earningsBonus(backup.value), scale: scale.value } : null
);
/** The table the first ascension starts on (tableChoice.ts answeredBy). */
const by = computed(() => (choice.value ? answeredBy(choice.value, startTE.value) : 'maxed'));
/** Which table answered, in one line. */
const tableLine = computed(() => (choice.value?.header ? tableLineFor(choice.value, startTE.value) : ''));
/** Below TE 340 with gear other than the table's: the answer can be a few percent off (gearDiffers.ts).
 *  Not on a table built on the save's own gear, nor on one read with the earnings shift for it. */
const gearCaveat = computed(() =>
  by.value === 'maxed' && gap.value && gearDiffers(startTE.value, gap.value) ? gearDiffersText(gap.value) : null
);

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

/** The rows shown, the best first. */
const rows = computed<AnswerRow[]>(() =>
  found.value && shown.value ? rowsByBest(rowsShown(found.value, shown.value.deadline), shown.value.dated) : []
);
/** The rows of this goal already saved (by their route). */
const savedOfGoal = computed<string[]>(() => {
  const g = shown.value;
  if (!g) return [];
  const goalLabel = labelFor(g);
  return rows.value
    .filter(r => props.savedIds?.includes(planId({ goal: goalLabel, chain: r.route.chain })))
    .map(r => r.route.chain.join(' '));
});

/** The account table's name (tableGear.ts tableName: a slow hash of the player id, worked out once
 *  per id; the id never leaves the page). Null without an id. */
let accountName: { id: string; name: Promise<string | null> } | null = null;
function accountTable(): Promise<string | null> {
  const id = (backup.value as { eiUserId?: string } | null)?.eiUserId;
  if (!id) return Promise.resolve(null);
  if (accountName?.id !== id) accountName = { id, name: tableName(id).catch(() => null) };
  return accountName.name;
}

/** The table for the loaded save, probed once per save (the account's hashed name and its time). */
async function tableFor(): Promise<TableChoice> {
  const name = await accountTable();
  return choiceFor(JSON.stringify([name, saveTime.value]), async () => {
    const c = await chooseFrom(name);
    if (c.maxed || TABLE_BASE === LOCAL_TABLE_BASE) return c;
    TABLE_BASE = LOCAL_TABLE_BASE;
    TABLE_URL = TABLE_BASE + MAXED_TABLE;
    return chooseFrom(name);
  });
}

/** The table choice from the current base (TABLE_BASE). */
function chooseFrom(name: string | null): Promise<TableChoice> {
  const base = TABLE_BASE;
  const stampInputs = () => ({
    rawBackup: backup.value,
    epicResearchLevels: initialState.epicResearchLevels,
    colleggtibleModifiers: initialState.colleggtibleModifiers,
  });
  return chooseTable(
    { base, maxed: MAXED_TABLE, accountName: name },
    {
      header: url => (url === TABLE_URL ? tableHeader(url) : probeHeader(url)),
      stampAt: research => gearStamp(stampInputs(), research),
      deliveryAt: research => deliverySetAt(stampInputs(), research),
      earningsCTE: () => earningsCTE(backup.value),
      // The storage's list of tables, once per page (deliveryTables.ts).
      index: () => tableIndex(base),
    }
  );
}

/** The account, gear or delivery table joined to the maxed one, when one was chosen (for
 *  'maxed-shift', the maxed table itself, read with the shift). */
const ownUrl = computed(() => (choice.value && choice.value.kind !== 'maxed' ? choice.value.url : undefined));
/** The earnings shift `ownUrl` is read with (0: none). */
const ownShift = computed(() => (ownUrl.value ? (choice.value?.shift ?? 0) : 0));

/** What an answer is kept under for a moment (instantClient.ts): the tables, the save and the goal. */
function answerKey(dl: number | undefined): string {
  return JSON.stringify([
    TABLE_URL,
    ownUrl.value ?? null,
    ownShift.value,
    saveSyncSeconds(backup.value),
    start.value.delivered,
    dl ?? null,
    scale.value,
  ]);
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
  // Probed once per save (tableChoice.ts choiceFor); later runs get the kept choice at once.
  const c = await tableFor();
  if (!isNewest(id)) return;
  if (!c.maxed) {
    noTable.value = true;
    status.value = 'idle';
    return;
  }
  noTable.value = false;
  header.value = c.maxed;
  choice.value = c;
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
  const a = await answer(
    id,
    TABLE_URL,
    req,
    answerKey(g.deadline),
    (done, of) => {
      if (isNewest(id)) loadingText.value = `Working out every route: ${done} of ${of} ascension counts done…`;
    },
    ownUrl.value,
    ownShift.value
  );
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

/** Import into the planner: the route into Joo's Auto Planner (nothing is recorded). */
function simulate(row: AnswerRow): void {
  // Only rows of the goal now chosen (they are the only ones shown); never a race row as a date plan.
  if (!shown.value) return;
  const first = row.route.legs[0];
  emit('simulate', { chain: [...row.route.chain], start: first?.start ?? Date.now() / 1000, a1: first?.label ?? '' });
}

/** The exact check's memory key for a row: the save, the goal shown, the route and its first build. */
function rowKey(row: AnswerRow): string {
  const g = shown.value ?? chosen.value;
  return checkKey({
    saveTime: saveTime.value,
    goal: labelFor(g),
    chain: row.route.chain,
    a1: row.route.legs[0]?.label ?? '',
  });
}

/** Save this plan: the row with its times (exact when it was checked, else estimates), into the Saved runs. */
function save(row: AnswerRow): void {
  const entry = entryOf(row);
  if (!entry) return;
  const r = checkResult(rowKey(row));
  emit('save', r ? withExact(entry, r, Math.floor(Date.now() / 1000), saveTime.value || undefined) : entry);
}

/** A check finished: a row already saved gets its exact times in the Saved runs too. */
function checked(row: AnswerRow, r: ExactResult): void {
  const entry = entryOf(row);
  if (entry && props.savedIds?.includes(planId(entry)))
    emit('save', withExact(entry, r, Math.floor(Date.now() / 1000), saveTime.value || undefined));
}

/** The Saved runs entry for a row, with its estimate times. */
function entryOf(row: AnswerRow): PlanEntry | null {
  const g = shown.value;
  if (!g) return null;
  return entryFromRow(row, {
    goal: labelFor(g),
    dated: g.dated,
    ...(g.deadline !== undefined ? { deadline: g.deadline } : {}),
    a1: row.route.legs[0]?.label ?? '',
    simVersion: SIM_VERSION,
    gear:
      by.value === 'account'
        ? 'built for your account'
        : by.value === 'gear'
          ? 'built for your exact gear'
          : by.value === 'delivery'
            ? `built for gear like yours, ${shiftWords(choice.value?.shift)}`
            : by.value === 'maxed-shift'
              ? `maxed gear, ${shiftWords(choice.value?.shift)}`
              : gearLabel(gap.value),
    ...(saveTime.value ? { saveTime: saveTime.value } : {}),
  });
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
