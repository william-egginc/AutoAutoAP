<!--
  The run controls, the same block in the same order on every search screen (Fastest's Simple and
  Advanced, Highest TE by a date's Simple and Advanced), under the screen's own set-up:

    the notices (SafariNotice, RunSaveNotice, IntegrityNotice)
    anything the screen must say right above Run (`above-find`)
    Run Fast / Exact / Custom and its send tick / Send best so far / Stop & keep best, the acknowledge box,
      the name, the CSV and diagnostics boxes and the run note (FindBar.vue)
    how the automatic send went (RunSendReport.vue)
    results kept until sent (UnsentResults.vue)
    Stepping away? (StepAwayOptions.vue)
    the run's progress, and on Fastest its answer so far (`progress`; below the boxes since 12 Oct)
    the run's warnings and error (`after`, RunErrorNotes.vue)

  The screen owns what the buttons do and when they're allowed (each search has its own checks); the
  wording that follows from the kind of run (target or deadline, which run Send best so far belongs
  to, "..., then submitting...") is worked out here, so it can't drift apart again.
-->
<template>
  <div class="space-y-4">
    <SafariNotice />
    <RunSaveNotice v-if="runSaveNotice" />
    <IntegrityNotice v-if="integrityNotice" :deadline-offer="deadlineOffer" />
    <slot name="above-find" />
    <!-- Phones only (the user, 12 Oct 2026). -->
    <p v-if="phone" class="text-body text-slate-500" data-testid="phone-note">{{ PHONE_NOTE }}</p>
    <!-- Many workers on a long run (the user, 12 Oct 2026): a warning, never a block. -->
    <p
      v-if="manyWorkers"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-body text-amber-900"
      data-testid="many-workers"
    >
      <span class="font-bold">{{ store.workerBudget }} workers.</span> {{ MANY_WORKERS_TEXT }}
    </p>

    <FindBar
      ref="findBar"
      v-model:opt-in="optIn"
      v-model:anonymous="anonymous"
      v-model:nickname="nickname"
      v-model:note="note"
      :find-disabled="findDisabled"
      :running="running"
      :stopping="stopping"
      :option="option"
      :find-label="findLabel"
      :running-label="runningLabel"
      :show-submit="showSubmit"
      :consent-note="consentNote"
      :goal-word="kind === 'by-date' ? 'deadline' : 'target'"
      :best-so-far-kind="kind === 'by-date' ? 'deadline' : 'fastest'"
      :blocked-by="otherRun?.name"
      :blocked-kind="otherRun?.kind"
      @find="onFind"
      @stop="emit('stop')"
      @nickname-typed="emit('nicknameTyped')"
    />

    <RunSendReport
      :kind="kind"
      :own="report.own"
      :running="running"
      :message="report.message"
      :ok="report.ok"
      :partial="report.partial"
      :name-to-claim="report.nameToClaim"
      :offer-name="report.offerName"
      :claiming="report.claiming"
      :pending-table="report.pendingTable"
      :retrying="report.retrying"
      :quiet="report.quiet"
      @claim="emit('claim')"
      @retry="emit('retry')"
      @name-it="findBar?.openForName()"
    />
    <!-- Finished results kept until sent (search/pendingSends.ts): "This result wasn't sent: Send it now",
         for a run that finished (and sent) while this panel was closed for another tab. -->
    <UnsentResults :kind="kind === 'by-date' ? 'deadline' : 'fastest'" :player-id="playerId" :nickname="nickname" />

    <!-- Stepping away? Carry on by itself, a watcher tab, fewer workers (StepAwayOptions.vue). -->
    <StepAwayOptions
      ref="stepAway"
      :kind="stepAwayKind"
      :player-id="playerId"
      :running="running"
      :can-carry-on="canCarryOn"
      :countdown-elsewhere="countdownElsewhere"
      @carry-on="emit('carryOn')"
      @countdown="n => emit('countdown', n)"
    />

    <!-- The run's progress, and on Fastest its answer so far, after the acknowledge box and Stepping away?
         (the user, 12 Oct: controls, Run, acknowledge, stepping away, then progress and results). -->
    <slot name="progress" />
    <slot name="after" />
  </div>
</template>

<script setup lang="ts">
import { MANY_WORKERS, MANY_WORKERS_TEXT } from '@/search/batch';
import { isPhone, PHONE_NOTE } from '@/search/device';
import { computed, ref } from 'vue';
import { NAMES } from '@/lib/siteNav';
import type { SearchOption } from '@/lib/searchOption';
import { useChainSearchStore } from '@/stores/chainSearch';
import FindBar from './FindBar.vue';
import IntegrityNotice from './IntegrityNotice.vue';
import RunSaveNotice from './RunSaveNotice.vue';
import RunSendReport from './RunSendReport.vue';
import SafariNotice from './SafariNotice.vue';
import StepAwayOptions from './StepAwayOptions.vue';
import { nudgeStepAway } from '@/composables/useStepAwayNudge';
import type { RunKind } from '@/search/stepAway';
import UnsentResults from './UnsentResults.vue';

/** RunSendReport's inputs: whether this panel made the automatic send, and how it went. */
interface SendReport {
  own: boolean;
  message?: string;
  ok?: boolean;
  partial?: boolean;
  nameToClaim?: string;
  /** Sent anonymously, no name chosen yet: Put my name on it opens the sharing setting (FindBar.vue `openForName`). */
  offerName?: boolean;
  claiming?: boolean;
  pendingTable?: boolean;
  retrying?: boolean;
  quiet?: boolean;
}

const props = withDefaults(
  defineProps<{
    /** Which screen: Smart search, the Full sweep, or By a date (both of its modes). */
    kind: 'smart' | 'full' | 'by-date';
    playerId: string;
    /** Run can't start (the screen's own checks). Sending also needs the opt-in. */
    findDisabled: boolean;
    running: boolean;
    stopping?: boolean;
    /** The strength picked (Fast, Exact or Custom): the button reads "Run Fast" (FindBar.vue). */
    option?: SearchOption;
    /** The button's words where they aren't "Run <strength>" (a sweep link's "Start this sweep"). */
    findLabel?: string;
    /** What the run does while it goes: "Searching", "Pricing every chain". */
    runningWord?: string;
    /** The send tick is offered (a collector is configured, and the run doesn't send itself anyway). */
    showSubmit: boolean;
    consentNote?: string;
    canCarryOn: boolean;
    /** The screen's own carry-on box shows Stepping away?'s countdown (By a date). */
    countdownElsewhere?: boolean;
    runSaveNotice?: boolean;
    integrityNotice?: boolean;
    deadlineOffer?: boolean;
    report: SendReport;
    /** A long run is about to start (By a date, Exhaustive, Very high, or over about 2 hours): with
     *  more than MANY_WORKERS workers, warn about the browser's memory. */
    longRun?: boolean;
    /** The run's estimate the screen shows, seconds (null or absent: none). Over an hour (useStepAwayNudge.ts
     *  LONG_RUN_SECONDS), Run also opens Stepping away? unless it is set up. */
    estimateSeconds?: number | null;
  }>(),
  {
    stopping: false,
    option: undefined,
    findLabel: '',
    runningWord: 'Searching',
    consentNote: '',
    countdownElsewhere: false,
    runSaveNotice: true,
    integrityNotice: true,
    deadlineOffer: false,
    estimateSeconds: null,
  }
);
const emit = defineEmits<{
  find: [andSubmit: boolean];
  stop: [];
  nicknameTyped: [];
  carryOn: [];
  countdown: [seconds: number];
  claim: [];
  retry: [];
}>();

const optIn = defineModel<boolean>('optIn', { required: true });
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });
const note = defineModel<string>('note', { required: true });

const store = useChainSearchStore();
const phone = isPhone();
const manyWorkers = computed(() => !!props.longRun && !props.running && store.workerBudget > MANY_WORKERS);
/** "Searching, then submitting..." for a run that sends itself when it finishes (store `submitsWhenDone`,
 *  set by every screen for the length of a run started with the send ticked, and by a sweep link). */
const runningLabel = computed(() => `${props.runningWord}${store.submitsWhenDone ? ', then submitting' : ''}...`);

/** Fastest's other search (Nearby routes or Exhaustive), while it runs and this one isn't: both are on one
 *  screen and one search runs at a time, so this Run is greyed out for it and says so. */
const otherRun = computed<{ name: string; kind: 'smart' | 'full' } | null>(() => {
  if (props.running || props.kind === 'by-date') return null;
  const k = store.runProgress?.kind;
  if (k !== 'smart' && k !== 'full') return null;
  if (k === props.kind) return null;
  return { name: k === 'smart' ? NAMES.smart : NAMES.full, kind: k };
});

/** Stepping away?'s name for this screen's runs. */
const stepAwayKind = computed<RunKind>(() => (props.kind === 'by-date' ? 'deadline' : props.kind === 'full' ? 'sweep' : 'smart'));
/** Run pressed: the screen starts the run, then a long one opens Stepping away? (never holding the run up). */
function onFind(andSubmit: boolean): void {
  emit('find', andSubmit);
  nudgeStepAway(stepAwayKind.value, props.estimateSeconds);
}

const stepAway = ref<InstanceType<typeof StepAwayOptions> | null>(null);
const findBar = ref<InstanceType<typeof FindBar> | null>(null);
/** Stepping away?'s Cancel for the automatic carry-on, for a screen that shows the countdown itself. */
defineExpose({ cancel: () => stepAway.value?.cancel() });
</script>
