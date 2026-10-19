<!--
  Check exactly and Add shifts to calendar, for one route (Find a run's opened row, a Saved run):
  the buttons (after the parent's own, passed in the slot), then the check's line: the progress while it
  runs (elapsed, ascension N of M, Cancel), the exact finish against the instant estimate when done, or
  the error with Retry. The check is Joo's simulator on this route in a worker (instant/exactCheck.ts);
  one at a time on the page. The calendar offers the current ascension's shifts still ahead only; with
  no exact check yet, its button runs the check first and then offers them (a second tap).
-->
<template>
  <div class="space-y-2" data-testid="exact-check">
    <div class="flex flex-col sm:flex-row sm:flex-wrap gap-2">
      <slot />
      <button
        v-if="showCheck && state.kind !== 'running' && !result"
        type="button"
        class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest"
        :class="
          busyElsewhere
            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            : 'bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600'
        "
        :disabled="busyElsewhere"
        :title="busyElsewhere ? 'Another check is running' : undefined"
        data-testid="find-check-exactly"
        @click="check(false)"
      >
        Check exactly
      </button>
      <CalendarButton
        v-if="result && events.length"
        :events="events"
        :label="`Add ${events.length} ${events.length === 1 ? 'shift' : 'shifts'} to calendar`"
        :timezone="timezone"
        :start-open="calendarOpen"
      />
      <button
        v-else
        type="button"
        class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest"
        :class="
          calendarDisabled
            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            : 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50'
        "
        :disabled="calendarDisabled"
        :title="busyElsewhere ? 'Another check is running' : undefined"
        :data-testid="calendarTestid"
        @click="check(true)"
      >
        {{ result ? 'No shifts ahead in this ascension' : 'Add shifts to calendar' }}
      </button>
    </div>

    <div v-if="state.kind === 'running'" class="space-y-1.5" data-testid="exact-running" role="status">
      <p class="text-[11px] text-slate-700 font-bold">
        Checking exactly: about a minute on a computer, a few minutes on a phone<template v-if="device === 'phone'">
          (keep this page open)</template
        >.
      </p>
      <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
        <div class="h-full bg-indigo-500 transition-all" :style="{ width: `${barPercent}%` }" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[11px] text-slate-500" data-testid="exact-progress">{{ runningLine }}</span>
        <button
          type="button"
          class="min-h-[44px] px-3 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
          data-testid="exact-cancel"
          @click="cancelCheck(checkKey)"
        >
          Cancel
        </button>
      </div>
      <p v-if="calendarWanted" class="text-[11px] text-slate-500">The calendar is offered when the check is done.</p>
    </div>

    <div v-else-if="state.kind === 'error'" class="flex flex-wrap items-center gap-2" data-testid="exact-error" role="alert">
      <span class="text-[11px] text-red-700">{{ errorText(state.message) }}</span>
      <button
        type="button"
        class="min-h-[44px] px-3 rounded-xl border border-red-200 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-50"
        :disabled="busyElsewhere"
        data-testid="exact-retry"
        @click="check(calendarWanted)"
      >
        Retry
      </button>
    </div>

    <p v-else-if="state.kind === 'cancelled' && !result" class="text-[11px] text-slate-500" data-testid="exact-cancelled">
      Check cancelled.
    </p>

    <p v-if="result && estimateFinish" class="text-[11px] text-slate-600" data-testid="exact-finish">
      <span class="text-emerald-800 bg-emerald-50 rounded px-1.5 py-0.5 font-bold">exact</span>
      finish {{ atText(exactFinish(result), timezone, { year: true }) }}
      <span class="text-[10px] text-slate-400" data-testid="exact-estimate">
        · instant estimate: {{ atText(estimateFinish, timezone, { year: true }) }} ({{
          diffText(estimateFinish, exactFinish(result))
        }})</span
      >
    </p>
    <p
      v-if="result && deadline && exactFinish(result) > deadline"
      class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      data-testid="exact-misses"
    >
      On the exact check this route ends after the date you picked ({{ atText(deadline, timezone, { year: true }) }}).
    </p>
    <p class="text-[10px] text-slate-400" data-testid="calendar-note">{{ ONLY_THIS_ASCENSION }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  diffText,
  errorText,
  exactFinish,
  futureShifts,
  runningText,
  type ExactResult,
} from '@/instant/exactCheck';
import { cancelCheck, checkResult, checkState, nowMs, runningKey, startCheck } from '@/instant/exactClient';
import { exactInputsFromStores } from '@/instant/exactInputs';
import { ONLY_THIS_ASCENSION, shiftEvents } from '@/instant/calendarEvents';
import { atText } from '@/instant/findRun';
import { deviceWord } from '@/instant/device';
import CalendarButton from './CalendarButton.vue';

const props = withDefaults(
  defineProps<{
    /** The check's memory key (exactCheck.ts checkKey). */
    checkKey: string;
    /** The route to check: its stops, A1's build, and when it starts (unix seconds). */
    route: { chain: number[]; a1: string; start: number };
    timezone: string;
    /** "Oct 19 at 7:03 am": the save, for the calendar's words. */
    saveWhen: string;
    /** The TE at the start, for the calendar titles (optional). */
    startTE?: number;
    /** The instant estimate's finish, said beside the exact one. */
    estimateFinish?: number;
    /** By a date: the deadline (unix seconds); the exact finish is compared with it. */
    deadline?: number;
    /** Exact times already kept (a Saved run's). */
    known?: ExactResult | null;
    /** Show the Check exactly button (Saved runs: only the calendar, which checks first). */
    showCheck?: boolean;
    /** Called with the result when a check started here finishes (even if this closed meanwhile). */
    onDone?: (r: ExactResult) => void;
    /** Unix seconds now (specs). */
    now?: number;
  }>(),
  { showCheck: true, known: null, startTE: undefined, deadline: undefined, estimateFinish: undefined, onDone: undefined, now: undefined }
);

const device = deviceWord();
const state = computed(() => checkState(props.checkKey));
const result = computed<ExactResult | null>(() => checkResult(props.checkKey) ?? props.known ?? null);
const busyElsewhere = computed(() => runningKey.value !== null && runningKey.value !== props.checkKey);
/** The calendar was asked for before a check: it opens when the check is done. */
const calendarWanted = ref(false);
const calendarOpen = computed(() => calendarWanted.value && !!result.value);
const calendarDisabled = computed(() => (result.value ? true : state.value.kind === 'running' || busyElsewhere.value));
const calendarTestid = computed(() => (props.showCheck ? 'find-calendar' : 'saved-calendar'));

const nowSeconds = computed(() => props.now ?? Math.floor(nowMs.value / 1000));
const events = computed(() =>
  result.value
    ? shiftEvents(futureShifts(result.value.ascensions[0]?.shifts, nowSeconds.value), {
        nowSeconds: nowSeconds.value,
        ...(props.startTE ? { startTE: props.startTE } : {}),
        chain: props.route.chain,
        saveWhen: props.saveWhen,
      })
    : []
);

const runningLine = computed(() => (state.value.kind === 'running' ? runningText(state.value, nowMs.value) : ''));
const barPercent = computed(() => {
  const s = state.value;
  if (s.kind !== 'running' || !s.progress) return 3;
  return Math.max(3, Math.round(((s.progress.ascension - 1) / s.progress.of) * 100));
});

function check(forCalendar: boolean): void {
  if (forCalendar) calendarWanted.value = true;
  const done = props.onDone;
  const route = { chain: [...props.route.chain], a1: props.route.a1, start: props.route.start };
  const run = startCheck(props.checkKey, () => exactInputsFromStores(route));
  if (run) void run.then(r => r && done?.(r));
}
</script>
