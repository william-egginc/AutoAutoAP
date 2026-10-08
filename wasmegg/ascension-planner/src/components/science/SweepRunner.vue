<!--
  A sweep from Science's "What we need to check", run right there (the user, 30 Sept: "is it possible
  to just run the stuff there? Have a progress bar show up and everything? Upon clicking it can show
  them the statistics (How long it will take and then they can click submit)").

  It used to open the Full sweep in a new tab with the sweep filled in (search/sweepRequest.ts),
  which is two copies of the site, each with its own save and its own workers. This runs the same
  thing in place:

    1. Getting ready: the latest save is loaded and the planner set up from it, exactly as opening
       the Auto Planner does (App's `prepareAutoPlanner`), so the numbers below are this save's.
    2. The figures: how many chains, how many ascensions, about how long on this computer (the Full
       sweep's own estimate, search/speed.ts), and how much of the computer to give it.
    3. Start: the same run (`startExhaustive`, tagged with the preset) and, at the end, the same send
       as the Full sweep's sweep card (search/sendRun.ts). Stopped early, it sends what it has,
       marked partial on the board.

  The run outlives this window. Its state is in the UI store (`scienceRun`), so closing the window or
  leaving the tab loses nothing; the progress bar at the top of every tab carries on, and opening
  the window again shows where it got to.
-->
<template>
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 px-3 sm:px-4"
    style="
      padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
      padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.75rem);
    "
    @click.self="close"
  >
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="sweep-runner-title"
      class="w-full max-w-xl max-h-full overflow-y-auto rounded-2xl bg-white shadow-2xl p-4 sm:p-5 space-y-4"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-0.5">
          <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Run a sweep</p>
          <h2 id="sweep-runner-title" class="text-base font-black text-slate-900">{{ request.label }}</h2>
          <p class="text-[11px] text-slate-500">
            {{ bandsInWords
            }}<template v-if="request.minGap > 0"> · targets at least {{ request.minGap }} TE apart</template
            ><template v-if="request.forceContinue !== null">
              ·
              {{
                request.forceContinue ? 'finishing your current ascension first' : 'ascending straight away'
              }}</template
            >
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 px-2 py-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-lg leading-none"
          aria-label="Close"
          @click="close"
        >
          &times;
        </button>
      </div>

      <p class="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{{ SCIENCE_SWEEP_NOTE }}</p>

      <!-- Another search has the computer. Nothing here can start, and getting ready would reset
           the planner under it, so this waits. -->
      <div
        v-if="otherRunGoing"
        class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 space-y-1"
      >
        <p class="font-bold">Another search is running.</p>
        <p>
          One search at a time: they share this computer's workers. Let it finish, or stop it from the bar at the top of
          the page, then open this sweep again.
        </p>
      </div>

      <!-- 1. Getting ready -->
      <template v-else-if="phase === 'confirm'">
        <p class="text-[12px] text-slate-700 leading-relaxed">
          To work out the figures, this loads your latest save and sets the planner up from it, the same as opening the
          Auto Planner does. That clears the plan in the planner now
          <b>({{ planSteps }} step{{ planSteps === 1 ? '' : 's' }})</b>.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500"
            @click="getReady"
          >
            Load my save and continue
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
            @click="close"
          >
            Cancel
          </button>
        </div>
      </template>
      <p v-else-if="phase === 'preparing'" class="text-[12px] text-slate-600 flex items-center gap-2">
        <span class="inline-block w-3 h-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        Loading your latest save...
      </p>
      <div
        v-else-if="phase === 'not-ready'"
        class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 space-y-2"
      >
        <p>{{ notReadyText }}</p>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md bg-white border border-red-200 text-[10px] font-black uppercase tracking-widest hover:bg-red-100"
          @click="getReady"
        >
          Try again
        </button>
      </div>

      <!-- 2. The figures, and Start -->
      <template v-else-if="phase === 'ready'">
        <div class="grid gap-2 grid-cols-2 sm:grid-cols-4 text-[11px]">
          <div class="rounded-lg bg-slate-50 px-3 py-2">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Chains</div>
            <div class="font-bold text-slate-800">{{ chainCount.toLocaleString() }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 px-3 py-2">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Ascensions</div>
            <div class="font-bold text-slate-800">{{ ascensions }}</div>
          </div>
          <div class="rounded-lg bg-slate-50 px-3 py-2">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">From → to</div>
            <div class="font-bold text-slate-800">TE {{ Math.floor(store.currentTE) }} → {{ store.finalTE }}</div>
          </div>
          <div class="rounded-lg bg-indigo-50 px-3 py-2">
            <div class="text-[9px] font-black uppercase tracking-widest text-indigo-400">About how long</div>
            <div class="font-black text-indigo-900">{{ chainCount ? roughly(hours) : '—' }}</div>
          </div>
        </div>
        <p class="text-[10px] text-slate-400 -mt-2">
          The time is {{ measuredCost ? 'from this computer’s own measured speed' : speedSource }}, on the workers
          below. Real runs often go faster: plans that share their first ascensions share the work.
        </p>

        <p
          v-if="!chainCount"
          class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800"
        >
          {{ NO_FIT_TEXT }} From TE {{ Math.floor(store.currentTE) }} its ascension ranges leave no room above where
          your save is.
        </p>
        <p
          v-else-if="tooBig"
          class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800"
        >
          That is longer than most people will leave a tab open. It can still be run, and stopping it early sends what
          it has, marked partial.
        </p>

        <label class="block space-y-1">
          <span class="flex items-baseline justify-between text-[11px] font-bold text-slate-700">
            <span>How much of this computer to use</span>
            <span>{{ store.workerBudget }} of {{ store.machineThreads }} workers</span>
          </span>
          <input
            type="range"
            min="1"
            :max="store.machineThreads"
            :value="store.workerBudget"
            aria-label="Workers"
            class="w-full accent-indigo-600"
            @input="setWorkers(($event.target as HTMLInputElement).value)"
          />
          <span class="block text-[10px] text-slate-500">
            Fewer keep the computer usable and quieter; more finish sooner. It can be changed during the run too, from
            this window.
          </span>
        </label>

        <p v-if="timeOffText" class="text-[11px] text-slate-600">
          Planned around your time off (<b>{{ timeOffText }}</b
          >). It still prices every chain, but the result goes on the board with the time-off runs and won’t fill this
          gap.
        </p>

        <div class="rounded-lg border border-slate-200 px-3 py-2 space-y-2">
          <label class="flex items-start gap-2 text-[11px] text-slate-700">
            <input v-model="consent" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
            <span>
              I understand it takes about <b>{{ roughly(hours) }}</b
              >, that this tab has to stay open (and the computer awake) until it finishes, and that the result is then
              <b>sent to the board automatically</b>, tagged {{ request.preset }}.
              <button type="button" class="font-bold text-indigo-700 underline" @click="showWhat = !showWhat">
                What gets sent?
              </button>
            </span>
          </label>
          <p v-if="showWhat" class="pl-6 text-[11px] text-slate-500 leading-relaxed">
            The chain, its timings and the full CSV, with your artifact inventory, timezone and local plan start, plus a
            random code this browser keeps for the account (never your player ID, and never shown). The code folds
            repeated sends together, lets you put your name on a run sent anonymously, and lets your own later runs
            replace your older plans. In its last few seconds the sweep also re-prices your best three plans already on
            the board from this save, and those are sent too.
          </p>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 pl-6 text-[11px] font-bold text-slate-700">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="anonymous" type="radio" :value="true" class="text-indigo-600" />
              Submit anonymously
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="anonymous" type="radio" :value="false" class="text-indigo-600" />
              Credit me as
            </label>
            <input
              v-model="nickname"
              type="text"
              maxlength="40"
              placeholder="nickname"
              aria-label="Nickname"
              :disabled="anonymous"
              class="w-40 rounded-md border-indigo-200 text-[12px] font-normal text-slate-800 disabled:opacity-40"
              @input="nicknameTouched = true"
            />
          </div>
        </div>
        <RunNoteBox v-model="store.runNote" :disabled="store.isRunning" class="text-[11px] text-slate-700" />

        <IntegrityNotice />
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            :disabled="!canStart"
            class="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-40"
            @click="start"
          >
            Start and submit when done
          </button>
          <span v-if="!consent && chainCount" class="text-[10px] text-slate-500">Tick “I understand” first.</span>
          <span v-if="store.saveNotReady" class="text-[10px] font-semibold text-amber-700">{{
            store.saveNotReady
          }}</span>
        </div>
      </template>

      <!-- 3. Running, sending, done -->
      <template v-else-if="run">
        <div v-if="run.phase !== 'done'" class="space-y-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
            <span class="font-bold text-slate-800">
              <template v-if="run.phase === 'sending'">Sending the result...</template>
              <template v-else-if="run.phase === 'starting' || !store.chainsEstimated">Starting...</template>
              <template v-else>
                {{ pricedSoFar.toLocaleString() }} of {{ store.chainsEstimated.toLocaleString() }} chains
              </template>
            </span>
            <span v-if="run.phase === 'running' && leftLabel" class="text-[11px] text-slate-500"
              >about {{ leftLabel }} left</span
            >
          </div>
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              v-if="run.phase === 'running' && store.chainsEstimated"
              class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-500"
              :style="{ width: `${percent}%` }"
            ></div>
            <div v-else class="h-full w-1/3 rounded-full bg-indigo-400/70 animate-pulse"></div>
          </div>
          <p v-if="store.bestDays > 0 && run.phase === 'running'" class="text-[11px] text-slate-600">
            Best so far: <span class="font-mono-premium">{{ store.bestChain.join(' → ') }}</span
            >, done {{ finishDate }}.
          </p>

          <label v-if="run.phase === 'running'" class="block space-y-1">
            <span class="flex items-baseline justify-between text-[11px] font-bold text-slate-700">
              <span>Workers</span>
              <span>{{ store.workerBudget }} of {{ store.machineThreads }}</span>
            </span>
            <input
              type="range"
              min="1"
              :max="store.machineThreads"
              :value="store.workerBudget"
              aria-label="Workers"
              class="w-full accent-indigo-600"
              @input="setWorkers(($event.target as HTMLInputElement).value)"
            />
          </label>

          <div v-if="run.phase === 'running'" class="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              :disabled="stopping"
              class="px-4 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-50"
              @click="stop"
            >
              {{ stopping ? 'Stopping...' : 'Stop and send what it has' }}
            </button>
            <span class="text-[10px] text-slate-500">
              You can close this window and look around: it keeps going, with its progress at the top of every tab.
            </span>
          </div>
        </div>

        <div v-else class="space-y-3">
          <p v-if="store.bestDays > 0" class="text-[12px] text-slate-800">
            <template v-if="store.stoppedEarly"
              >Stopped early, after {{ store.chainsDone.toLocaleString() }} chains.
            </template>
            <template v-else>Done: every chain in the sweep was priced. </template>
            The fastest was <span class="font-mono-premium font-bold">{{ store.bestChain.join(' → ') }}</span
            >, done {{ finishDate }} ({{ store.bestDays.toFixed(2) }} days).
          </p>
          <p
            v-if="run.report"
            class="rounded-lg border px-3 py-2 text-[11px]"
            :class="
              !run.report.ok
                ? 'bg-red-50 border-red-200 text-red-800'
                : /\bbut\b/.test(run.report.text)
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            "
          >
            <b>{{ run.report.ok ? 'Submitted.' : 'Not submitted.' }}</b> {{ run.report.text }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500"
              @click="emit('show-result')"
            >
              See it in {{ NAMES.full }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
              @click="dismiss"
            >
              Close
            </button>
          </div>
          <p class="text-[10px] text-slate-400">
            {{ NAMES.fastest }} › {{ NAMES.fullFirst }} has the whole result: the table, the CSV, building the plan, and sending it again by
            hand if this send didn’t go through.
          </p>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useEidsStore } from 'lib';
import { useChainSearchStore } from '@/stores/chainSearch';
import RunNoteBox from '@/components/auto/RunNoteBox.vue';
import { useActionsStore } from '@/stores/actions';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import { NAMES } from '@/lib/siteNav';
import { countBanded, formatHours, parseBands } from '@/search/exhaustive';
import { NO_FIT_TEXT, SCIENCE_SWEEP_NOTE, presetBandsFor } from '@/explorer/needs';
import { sweepSeconds, workerSecondsFromRate, workerSecondsPerChain } from '@/search/speed';
import { describeTimeOff, usableTimeOff } from '@/search/timeOff';
import { sendRunResult } from '@/search/sendRun';
import type { SweepRequest } from '@/search/sweepRequest';
import IntegrityNotice from '@/components/auto/IntegrityNotice.vue';

const props = defineProps<{
  request: SweepRequest;
  playerId: string;
  /** Load the latest save and set the planner up from it (App's `prepareAutoPlanner`). Resolves to
   *  '' when ready, or why not. */
  prepare: () => Promise<string>;
}>();
const emit = defineEmits<{ 'show-result': [] }>();

/** One sweep: the force-continue pair shares a preset and differs only in how the plan starts. */
function sameSweep(a: SweepRequest, b: SweepRequest): boolean {
  return a.preset === b.preset && a.bands === b.bands && a.minGap === b.minGap && a.forceContinue === b.forceContinue;
}

const store = useChainSearchStore();
const ui = useUIStore();
const actions = useActionsStore();
const planner = useAutoPlannerStore();

/** The run started from here, if it is this sweep's (one at a time, so there is at most one). */
const run = computed(() => (ui.scienceRun && sameSweep(ui.scienceRun.request, props.request) ? ui.scienceRun : null));
/** A search going that this window didn't start: a Full sweep, a Smart search, a date search, or
 *  another sweep from here. */
const otherRunGoing = computed(
  () => !run.value && (store.busy || store.sweepQueue.at >= 0 || (!!ui.scienceRun && ui.scienceRun.phase !== 'done'))
);

type Phase = 'confirm' | 'preparing' | 'not-ready' | 'ready' | 'run';
const phase = ref<Phase>('preparing');
const notReadyText = ref('');
/** Steps in the planner beyond its start, which getting ready clears. */
const planSteps = computed(() => Math.max(0, actions.actions.length - 1));

async function getReady(): Promise<void> {
  phase.value = 'preparing';
  const why = await props.prepare();
  // A search started elsewhere while the save loaded: leave everything to it.
  if (otherRunGoing.value) return;
  if (why) {
    notReadyText.value = why;
    phase.value = 'not-ready';
    return;
  }
  // The rate a benchmark or an earlier run measured on this computer, for the estimate.
  store.restoreBenchmark(props.playerId);
  phase.value = 'ready';
}

onMounted(() => {
  if (run.value) {
    phase.value = 'run';
    return;
  }
  // A finished run from here, for another sweep, is replaced by this one.
  if (ui.scienceRun?.phase === 'done') ui.scienceRun = null;
  if (otherRunGoing.value) return;
  if (planSteps.value > 0) phase.value = 'confirm';
  else void getReady();
});

// ------------------------------------------------------------------ the figures

/** The preset's bands fitted to the save's own TE (the card fitted them to the TE typed on the page,
 *  which can differ). A request that is not a known preset keeps its own bands. */
const bandsText = computed(() => {
  if (phase.value === 'preparing' || phase.value === 'confirm' || phase.value === 'not-ready')
    return props.request.bands;
  return presetBandsFor(props.request.preset, store.currentTE, store.finalTE) || props.request.bands;
});
const bands = computed(() => parseBands(bandsText.value));
const ascensions = computed(() => bands.value.length + 1);
const chainCount = computed(() =>
  bands.value.length ? countBanded(bands.value, store.finalTE, store.currentTE, props.request.minGap) : 0
);

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
/** The bands as ranges per ascension, short: "1st at TE 181-250, 2nd at 276-300". */
const bandsInWords = computed(() =>
  bands.value
    .map((b, i) => {
      const where = b.length > 1 ? `${b[0]}-${b[b.length - 1]}` : `${b[0]}`;
      return i === 0 ? `1st ascension at TE ${where}` : `${ORDINAL[i] ?? `${i + 1}th`} at ${where}`;
    })
    .join(', ')
);

// The Full sweep's estimate (InsanePanel.vue), so the two screens give the same figure for the same
// sweep: this computer's measured speed when there is one, otherwise the typical speed for this
// chain length from players' runs.
const measuredCost = computed(() => (store.secondsPerChain > 0 ? store.secondsPerChain : 0));
const workerSeconds = computed(() =>
  measuredCost.value
    ? workerSecondsFromRate(measuredCost.value, store.rateWorkers || store.workerBudget)
    : workerSecondsPerChain(ascensions.value)
);
const speedSource = computed(() => `typical for ${ascensions.value}-ascension chains in players’ runs`);
const hours = computed(() => sweepSeconds(chainCount.value, store.workerBudget, workerSeconds.value) / 3600);
/** The Full sweep's line for "longer than anyone will wait": two weeks. */
const tooBig = computed(() => chainCount.value > 0 && hours.value > 24 * 14);

const timeOffText = computed(() => (usableTimeOff(store.timeOff).length ? describeTimeOff(store.timeOff) : ''));

/** `formatHours`, but a sweep of a few chains reads "under a minute", not "0 min". */
function roughly(h: number): string {
  return h * 60 < 1 ? 'under a minute' : formatHours(h);
}

function setWorkers(raw: string): void {
  const n = Number(raw);
  store.workerBudget = Number.isFinite(n) ? Math.max(1, Math.min(store.machineThreads, Math.floor(n))) : 1;
}

// ------------------------------------------------------------------ credit (as the sweep card's)

const consent = ref(false);
const showWhat = ref(false);
const anonymous = ref(true);
const eids = useEidsStore();
const accountName = computed(() => {
  const entry = eids.eids.get(props.playerId.trim());
  return entry?.nickname || entry?.username || '';
});
const nickname = ref(accountName.value);
const nicknameTouched = ref(false);
watch(accountName, name => {
  if (!nicknameTouched.value) nickname.value = name;
});
/** Anonymous wins over whatever is in the box; the collector keeps 40 characters. */
const effectiveNickname = computed(() => (anonymous.value ? '' : nickname.value.trim().slice(0, 40)));

const canStart = computed(
  () =>
    consent.value &&
    chainCount.value > 0 &&
    !store.busy &&
    store.sweepQueue.at < 0 &&
    !store.integrityBlocked &&
    !store.staleBackupBlocked &&
    !store.saveNotReady
);

// ------------------------------------------------------------------ the run

/**
 * Start, wait, send. Kept going after this window closes: everything it needs afterwards is in the
 * stores, and what it reports goes to `ui.scienceRun`, which the next window reads.
 */
async function start(): Promise<void> {
  if (!canStart.value) return;
  const request = props.request;
  const nick = effectiveNickname.value;
  const state = { request, phase: 'starting' as const, report: null };
  ui.scienceRun = state;
  phase.value = 'run';
  store.lastAutoSend = null;

  // The tag and the start choice are this run's, not the player's settings: the tag is copied by
  // `startExhaustive` before its first await, and put back straight after, so a later Full sweep of
  // their own isn't counted toward this preset. The start choice is read again when the result is
  // sent, so it waits until then.
  const tagBefore = store.sweepTag;
  const forceBefore = store.forceContinue;
  store.sweepTag = { preset: request.preset, bands: bandsText.value, minGap: request.minGap };
  if (request.forceContinue !== null) store.forceContinue = request.forceContinue;
  store.submitsWhenDone = true;

  const startedAt = Date.now();
  let finished: Promise<void>;
  try {
    finished = store.startExhaustive(
      props.playerId,
      {
        lo: 0,
        hi: 0,
        step: 1,
        minAsc: ascensions.value,
        maxAsc: ascensions.value,
        minGap: request.minGap,
        bands: bands.value.map(b => [...b]),
      },
      // Re-prices the player's best plans already on the board in the last seconds, as the sweep
      // card does when it is going to send.
      { recheck: true }
    );
  } finally {
    store.sweepTag = tagBefore;
  }
  if (ui.scienceRun) ui.scienceRun.phase = 'running';

  try {
    await finished;
  } finally {
    store.submitsWhenDone = false;
  }

  const current = ui.scienceRun;
  // Only this run's result is sent: `runStartedAt` is stamped when a run really starts, so a start
  // that was refused (another search, the integrity block) can't send whatever was on screen before.
  const ranHere = store.runStartedAt >= startedAt && !store.error && store.bestDays > 0;
  let report: { ok: boolean; text: string };
  if (ranHere) {
    if (current) current.phase = 'sending';
    report = await sendRunResult(store, nick, true);
    store.lastAutoSend = { kind: 'full', ok: report.ok, text: report.text };
  } else {
    report = {
      ok: false,
      text: store.error ? `The run stopped: ${store.error}` : 'Nothing was priced, so there was nothing to send.',
    };
  }
  store.forceContinue = forceBefore;
  if (ui.scienceRun) {
    ui.scienceRun.report = report;
    ui.scienceRun.phase = 'done';
  }
}

/** Chains finished, counting the chunk in flight (as the Full sweep counts them). */
const pricedSoFar = computed(() => store.chainsDone + (store.isRunning ? store.batchDone : 0));
/** Held under 100 while running: an estimate reached is not a run finished. */
const percent = computed(() =>
  store.chainsEstimated > 0 ? Math.min(99, (100 * pricedSoFar.value) / store.chainsEstimated) : 0
);

const now = ref(Date.now());
const ticker = setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => clearInterval(ticker));
const leftLabel = computed(() => {
  const done = pricedSoFar.value;
  if (!store.runStartedAt || done < 5) return '';
  const secs = (Math.max(0, store.chainsEstimated - done) * (now.value - store.runStartedAt)) / 1000 / done;
  return secs > 0 ? formatHours(secs / 3600) : '';
});

const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
const finishDate = computed(() =>
  store.bestDays > 0
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: zone.value,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date((store.planStart + store.bestDays * 86400) * 1000))
    : ''
);

const stopping = computed(() => !!store.runProgress?.stopping || store.stopRequested);
function stop(): void {
  store.stopRun();
}

/** Close the window; a run goes on. */
function close(): void {
  ui.scienceSweep = null;
}
/** Close, and forget a finished run's report (it is in the Full sweep too). */
function dismiss(): void {
  if (ui.scienceRun?.phase === 'done') ui.scienceRun = null;
  close();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>
