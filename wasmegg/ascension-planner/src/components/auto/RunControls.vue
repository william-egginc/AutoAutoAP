<!--
  The run controls, the same block in the same order on every search screen (Fastest's Simple and
  Advanced, Highest TE by a date's Simple and Advanced), under the screen's own set-up:

    the notices (SafariNotice, RunSaveNotice, IntegrityNotice)
    anything the screen must say right above Find (`above-find`)
    Find / Find and submit / Send best so far / Stop & keep best, the acknowledge box, the name, the
      CSV and diagnostics boxes and the run note (FindBar.vue)
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
    <p v-if="phone" class="text-[11px] text-slate-500" data-testid="phone-note">{{ PHONE_NOTE }}</p>
    <!-- Many workers on a long run (the user, 12 Oct 2026): a warning, never a block. -->
    <p
      v-if="manyWorkers"
      class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900"
      data-testid="many-workers"
    >
      <span class="font-bold">{{ store.workerBudget }} workers.</span> {{ MANY_WORKERS_TEXT }}
    </p>

    <FindBar
      v-model:opt-in="optIn"
      v-model:anonymous="anonymous"
      v-model:nickname="nickname"
      v-model:note="note"
      :find-disabled="findDisabled"
      :running="running"
      :stopping="stopping"
      :find-label="findLabel"
      :running-label="runningLabel"
      :show-submit="showSubmit"
      :consent-note="consentNote"
      :goal-word="kind === 'by-date' ? 'deadline' : 'target'"
      :best-so-far-kind="kind === 'by-date' ? 'deadline' : 'fastest'"
      :blocked-by="otherRun?.name"
      :blocked-kind="otherRun?.kind"
      @find="andSubmit => emit('find', andSubmit)"
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
      :claiming="report.claiming"
      :pending-table="report.pendingTable"
      :retrying="report.retrying"
      :quiet="report.quiet"
      @claim="emit('claim')"
      @retry="emit('retry')"
    />
    <!-- Finished results kept until sent (search/pendingSends.ts): "This result wasn't sent: Send it now",
         for a run that finished (and sent) while this panel was closed for another tab. -->
    <UnsentResults :kind="kind === 'by-date' ? 'deadline' : 'fastest'" :player-id="playerId" :nickname="nickname" />

    <!-- Stepping away? Carry on by itself, a watcher tab, fewer workers (StepAwayOptions.vue). -->
    <StepAwayOptions
      ref="stepAway"
      :kind="kind === 'by-date' ? 'deadline' : kind === 'full' ? 'sweep' : 'smart'"
      :player-id="playerId"
      :can-carry-on="canCarryOn"
      :countdown-elsewhere="countdownElsewhere"
      @carry-on="emit('carryOn')"
      @countdown="n => emit('countdown', n)"
    />

    <!-- The run's progress, and on Fastest its answer so far, after the acknowledge box and Stepping away?
         (the user, 12 Oct: controls, Find, acknowledge, stepping away, then progress and results). -->
    <slot name="progress" />
    <slot name="after" />
  </div>
</template>

<script setup lang="ts">
import { MANY_WORKERS, MANY_WORKERS_TEXT } from '@/search/batch';
import { isPhone, PHONE_NOTE } from '@/search/device';
import { computed, ref } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { useChainSearchStore } from '@/stores/chainSearch';
import FindBar from './FindBar.vue';
import IntegrityNotice from './IntegrityNotice.vue';
import RunSaveNotice from './RunSaveNotice.vue';
import RunSendReport from './RunSendReport.vue';
import SafariNotice from './SafariNotice.vue';
import StepAwayOptions from './StepAwayOptions.vue';
import UnsentResults from './UnsentResults.vue';

/** RunSendReport's inputs: whether this panel made the automatic send, and how it went. */
interface SendReport {
  own: boolean;
  message?: string;
  ok?: boolean;
  partial?: boolean;
  nameToClaim?: string;
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
    /** Find can't start (the screen's own checks). Find and submit also needs the opt-in. */
    findDisabled: boolean;
    running: boolean;
    stopping?: boolean;
    findLabel?: string;
    /** What the run does while it goes: "Searching", "Pricing every chain". */
    runningWord?: string;
    /** Find and submit is offered (a collector is configured, and the run doesn't send itself anyway). */
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
  }>(),
  {
    stopping: false,
    findLabel: 'Find',
    runningWord: 'Searching',
    consentNote: '',
    countdownElsewhere: false,
    runSaveNotice: true,
    integrityNotice: true,
    deadlineOffer: false,
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
 *  set by every screen for the length of a Find and submit run, and by a sweep link). */
const runningLabel = computed(() => `${props.runningWord}${store.submitsWhenDone ? ', then submitting' : ''}...`);

/** Fastest's other search (Nearby routes or Exhaustive), while it runs and this one isn't: both are on one
 *  screen and one search runs at a time, so this Find is greyed out for it and says so. */
const otherRun = computed<{ name: string; kind: 'smart' | 'full' } | null>(() => {
  if (props.running || props.kind === 'by-date') return null;
  const k = store.runProgress?.kind;
  if (k !== 'smart' && k !== 'full') return null;
  if (k === props.kind) return null;
  return { name: k === 'smart' ? NAMES.smart : NAMES.full, kind: k };
});

const stepAway = ref<InstanceType<typeof StepAwayOptions> | null>(null);
/** Stepping away?'s Cancel for the automatic carry-on, for a screen that shows the countdown itself. */
defineExpose({ cancel: () => stepAway.value?.cancel() });
</script>
