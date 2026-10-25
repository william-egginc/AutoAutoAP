<!--
  Find / Find and submit / Stop, and the share opt-in that Find and submit needs: the same bar on
  both depths of Fastest route (the unified layout, phase 3). Smart search used to have "Start
  search" and a remembered "submit when it finishes" box; the Full sweep had these two buttons. Two
  ways to do one thing, on two tabs of one screen, and players asked which one sent what.

  The parent owns what the buttons do and when they're allowed (each search has its own checks), and
  the opt-in: it is the same consent as Share this result's, the account's `leaderboard` consent
  (composables/useConsent.ts), shown in ConsentBox.vue like every consent box. Remembered per account
  with "Remember my choice"; a remembered yes only skips the tick and contacts nothing by itself (the
  board lookup that waits for consent waits for a tick this visit: useShareResult.ts, review 30 Sept).

  Send best so far (9 Oct): while a run is going, its best so far can go to the board as an "in
  progress" row that the run's final send replaces (stores/chainSearch.ts `sendBestSoFar`). Same
  consent: given already by Find and submit, or by the box ticked before the run; otherwise the
  first press opens the box below, and ticking it sends straight away (a second press nobody knew
  was needed left a best so far unsent, review 9 Oct). Agreeing there also has the run send its
  result when it finishes, which replaces that row. Since 10 Oct a send carries the run's data too
  (the CSV so far and diagnostics, by the two boxes below): a progress send.

  During a run the box stays open for what applies to the send at the end -- the CSV and diagnostics
  boxes, and the name once agreed -- and the consent wording comes back only when Send best so far
  asks for it.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        class="btn-premium btn-primary flex-1 min-w-[12rem] py-4 text-sm shadow-xl shadow-indigo-500/20 active:scale-[0.98]"
        :disabled="findDisabled || notReady || running"
        @click="emit('find', false)"
      >
        <!-- Dots in CSS (AnimatedDots.vue): moving, so a long run never looks stuck, at no cost per tick. -->
        <span v-if="running" :aria-label="runningLabel"
          >{{ runningWords }}<AnimatedDots /></span
        ><span v-else-if="blockedBy" :aria-label="`${blockedBy} is running...`" data-testid="find-blocked-label"
          >{{ blockedBy }} is running<AnimatedDots /></span
        ><template v-else>{{ findLabel }}</template>
      </button>
      <div v-if="showSubmit && !running" class="flex flex-col items-center gap-1">
        <!-- Never without the ticks. With the acknowledgement folded (lib/panelFold.ts), the button stays pressable
             without them, looks greyed out, and a press opens the fold and goes to the box instead of starting. -->
        <button
          type="button"
          class="px-6 py-4 rounded-xl bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
          :class="!optIn ? 'opacity-40' : ''"
          :disabled="findDisabled || notReady || (!optIn && !ACK_FOLDS)"
          :aria-disabled="!optIn ? 'true' : undefined"
          data-testid="find-and-submit"
          @click="findAndSubmit"
        >
          Find and submit
        </button>
        <!-- Whenever consent is unticked, even with Find itself blocked (no save yet): the full wording is
             in the box below, this only says where to look. -->
        <span v-if="!optIn" class="text-[10px] font-semibold text-slate-500 text-center" data-testid="acknowledge-hint"
          >To use Find and submit, please tick
          <!-- A link to the box, which can be a long way below on a phone. -->
          <button
            type="button"
            class="inline-flex items-center min-h-[44px] sm:min-h-0 underline decoration-dotted underline-offset-2 hover:text-indigo-700"
            data-testid="acknowledge-hint-link"
            @click="showConsent"
          >the box below</button
          >.</span
        >
      </div>
      <div v-if="bestSoFarHere" class="flex flex-col items-center gap-1">
        <button
          type="button"
          class="px-6 py-4 rounded-xl bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
          :disabled="!hasBest || store.bestSoFarSending || store.bestSoFarWait > 0 || (asking && !optIn)"
          data-testid="send-best-so-far"
          @click="sendBestSoFar"
        >
          <SendingText v-if="store.bestSoFarSending" /><template v-else>Send best so far</template>
        </button>
        <span class="text-[10px] font-semibold text-slate-500 text-center" data-testid="best-so-far-hint">{{
          asking && !optIn
            ? sendsOnTick
              ? 'Tick the box below and it sends straight away'
              : 'Tick the box below to agree'
            : store.bestSoFarWait > 0
              ? `You can send again in ${store.bestSoFarWait} min`
              : '(it will be replaced when the run finishes)'
        }}</span>
      </div>
      <button
        v-if="running"
        type="button"
        class="px-6 py-4 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50"
        :disabled="stopping"
        @click="emit('stop')"
      >
        <SendingText v-if="stopping" text="Stopping" /><template v-else>Stop &amp; keep best</template>
      </button>
    </div>
    <p v-if="running && stopping" class="text-[11px] text-slate-600" data-testid="stopping-note">{{ STOPPING_NOTE }}</p>
    <p
      v-if="bestSoFarHere && store.bestSoFarStatus"
      class="text-[11px] font-semibold"
      :class="
        store.bestSoFarStatus.pending
          ? 'text-amber-700'
          : store.bestSoFarStatus.ok
            ? 'text-emerald-700'
            : 'text-red-700'
      "
      data-testid="best-so-far-status"
    >
      {{ store.bestSoFarStatus.text }}
    </p>
    <!-- Greyed out because the other search on this screen is going (the user, 12 Oct: it said nothing). -->
    <p
      v-if="blockedBy && !running"
      class="text-[11px] font-semibold text-slate-600"
      data-testid="find-blocked"
    >
      {{ blockedBy }} is running, and one search runs at a time: Find comes back when it finishes or you stop it.
      <button
        v-if="blockedKind"
        type="button"
        class="ml-1 font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
        data-testid="find-blocked-jump"
        @click="jump"
      >
        Jump to it
      </button>
    </p>
    <!-- The save is still settling (a Science link, the Auto Planner tab, a new player id): every
         search reads it, so Find waits rather than pricing one save and labelling it with another. -->
    <p v-if="notReady" class="text-[11px] font-semibold text-amber-700">{{ store.saveNotReady }}</p>
    <!-- The acknowledgement, its ticks, the name and the note: folded under "Before you send" by default
         (lib/panelFold.ts `acknowledgement`), "ticks needed" in amber until ticked. It opens by itself when
         Send best so far asks, and when Find and submit is pressed without the ticks. -->
    <PanelFold
      v-if="showSubmit"
      ref="ackFold"
      section="acknowledgement"
      title="Before you send"
      :running="running"
      class="rounded-xl border border-indigo-200 bg-indigo-50/60 px-3"
      summary-class="text-[11px] text-indigo-900"
    >
      <!-- Only while the ticks are needed: before a run, or when Send best so far asks. -->
      <template v-if="!optIn && (!running || asking)" #extra
        ><span class="font-bold text-amber-700" data-testid="ticks-needed">ticks needed</span></template
      >
      <!-- Already said yes (Yes to all, the ticks, Setup): stays folded, one line, never opened by Find and submit. -->
      <template v-else-if="optIn" #extra
        ><span class="font-bold text-emerald-800" data-testid="sharing-on"
          >Sharing: on, {{ anonymous || !nickname.trim() ? 'anonymous' : `as ${nickname.trim()}` }} · Change</span
        ></template
      >
      <div
        class="pb-3 space-y-2 text-[11px] text-indigo-900"
        data-testid="share-box"
      >
        <!-- The account's agreement (composables/useConsent.ts, ConsentBox.vue). Agreed before and remembered:
             one line that says what goes with a run, and Change. Opened: the full text, the boxes, "Remember my
             choice", Withdraw and Done (before a run and during one: the user, 14 Oct, once opened there was no
             clear way to close it). Withdrawing stops what was armed on it at once (store `withdrawShareConsent`). -->
        <ConsentBox
          ref="consentBox"
          v-model="optIn"
          consent-id="leaderboard"
          :force-open="asking"
          :show-box="!running || asking"
          summary-class="text-[11px] text-indigo-900"
          withdrawn-text="Withdrawn: nothing more goes to the leaderboard from here until you agree again."
        >
          <template #summary>
            <ConsentSummary :anonymous="anonymous" :nickname="nickname" :nickname-max="nicknameMax" />
          </template>
          <template #before>
            <p v-if="(!running || asking) && !optIn" class="font-black text-indigo-800">
              To use {{ running ? 'Send best so far' : 'Find and submit' }}, please read this and tick the box to
              agree<template v-if="sendsOnTick"
                >. Your best so far is sent as soon as you tick it, anonymously or under the name you choose below</template
              >:
            </p>
            <!-- A run going and nothing asked: what still applies to the send at the end. -->
            <p v-else-if="running && !asking" class="font-black text-indigo-800" data-testid="share-during-run">
              {{
                store.submitsWhenDone
                  ? 'Sent with the result when the run finishes (you can still change these):'
                  : 'Sent with the result if you share it (you can still change these):'
              }}
            </p>
          </template>
          <template #text>
            <!-- The screen's own wording where it sends something else (Highest TE by a date sends a route
               and its deadline, not a chain's CSV). -->
            <slot v-if="$slots.consent" name="consent" />
            <span v-else
              >I acknowledge the following: I want to share my run on the leaderboard when the search finishes<template
                v-if="consentNote"
              >
                ({{ consentNote }})</template
              >. I understand it sends the route, its dates and the {{ goalWord }}, with my artifact inventory, timezone,
              local plan start and the random code this browser keeps for the account (not my player ID, and never shown),
              plus my CSV if ticked below and, if ticked, private diagnostics (never shown). Stop it early and it shares
              the best it found so far. Send best so far shares it while the run goes on, with the CSV so far and
              diagnostics if ticked below; that row and its CSV are replaced when the run finishes.</span
            >
          </template>
          <template #after>
            <template v-if="!running || asking">
              <p v-if="goalWord === 'target'" class="ml-7 text-[10px] text-indigo-900/70">
                It also sends your best three plans already on the board, re-priced from this save.
              </p>
              <!-- Asked for by "Send my progress every..." (Stepping away?): the yes, then it sends by itself. -->
              <div v-if="asking && optIn && autoSendOn" class="ml-7">
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800"
                  data-testid="agree-auto-best-so-far"
                  @click="agreeAutoSend"
                >
                  Agree, and send my progress by itself
                </button>
              </div>
            </template>
            <!-- The same two boxes as Share this result, on the same choices. -->
            <div class="ml-7"><ShareExtras :csv-detail="csvDetail" /></div>
            <!-- Before the tick too while Send best so far asks: ticking sends, so the name is chosen first. -->
            <ShareNameChoice
              v-if="optIn || asking"
              v-model:anonymous="anonymous"
              v-model:nickname="nickname"
              :nickname-max="nicknameMax"
              @nickname-typed="emit('nicknameTyped')"
            />
            <!-- The note goes with the run as it starts; a run already going keeps the one it started with. -->
            <RunNoteBox v-if="note !== undefined && !running" v-model="note" />
          </template>
        </ConsentBox>
      </div>
    </PanelFold>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { scrollToRun, type RunAnchorKind } from '@/lib/runAnchor';
import AnimatedDots from './AnimatedDots.vue';
import RunNoteBox from './RunNoteBox.vue';
import SendingText from './SendingText.vue';
import { STOPPING_NOTE } from '@/search/stopNote';
import ShareExtras from './ShareExtras.vue';
import ConsentSummary from './ConsentSummary.vue';
import ConsentBox from './ConsentBox.vue';
import PanelFold from './PanelFold.vue';
import { PANEL_FOLD } from '@/lib/panelFold';
import ShareNameChoice from './ShareNameChoice.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { stepAwayOptions } from '@/composables/useStepAway';

const props = withDefaults(
  defineProps<{
    /** Find can't start (each search's own checks). Find and submit also needs the opt-in. */
    findDisabled: boolean;
    running: boolean;
    stopping?: boolean;
    findLabel?: string;
    runningLabel?: string;
    /** Off where the run sends itself anyway (a sweep link). */
    showSubmit?: boolean;
    /** Added after "when the search finishes", e.g. what a multi-chain click sends. */
    consentNote?: string;
    /** What this screen's send is about: Fastest has a target, By a date a deadline. */
    goalWord?: 'target' | 'deadline';
    csvDetail?: string;
    nicknameMax?: number;
    /** Which run this screen starts, for Send best so far (store `bestSoFar.kind`). Unset: none. */
    bestSoFarKind?: 'fastest' | 'deadline';
    /** The other search on this screen, by name, while it runs (Find is greyed out for it). */
    blockedBy?: string;
    /** Its progress block, for Jump to it (lib/runAnchor.ts). */
    blockedKind?: RunAnchorKind;
  }>(),
  {
    stopping: false,
    findLabel: 'Find',
    runningLabel: 'Searching...',
    showSubmit: true,
    consentNote: '',
    goalWord: 'target',
    csvDetail: '',
    nicknameMax: 40,
  }
);
const store = useChainSearchStore();
/** The running label without its "...": the dots are drawn (AnimatedDots). */
const runningWords = computed(() => props.runningLabel.replace(/(\.\.\.|…)$/, ''));
function jump(): void {
  if (props.blockedKind) void scrollToRun(props.blockedKind);
}
const emit = defineEmits<{ find: [andSubmit: boolean]; stop: []; nicknameTyped: [] }>();

const optIn = defineModel<boolean>('optIn', { required: true });
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });
/** The run note (store `runNote`). Left unbound, the box isn't shown. */
const note = defineModel<string>('note');
/** Find waits for the save to settle; a run already going is left alone. */
const notReady = computed(() => !props.running && !!store.saveNotReady);

/** This screen's run is going and may Send best so far. */
const bestSoFarHere = computed(
  () => props.running && !!props.bestSoFarKind && store.bestSoFar?.kind === props.bestSoFarKind
);
/** It has found something to send. */
const hasBest = computed(() => !!store.runProgress?.best);
/** The button was pressed (here or on the progress bar) before the player agreed: the box is open. */
const asking = computed(() => bestSoFarHere.value && !store.bestSoFar?.consent && !!store.bestSoFar?.asked);

/** Ticking the box sends: the box was opened by a Send best so far press, not the automatic option. */
const sendsOnTick = computed(() => asking.value && !!store.bestSoFar?.sendOnAgree);

/** The name the best so far goes under, from the choices here. */
function chosenName(): string {
  return anonymous.value ? '' : nickname.value.trim().slice(0, props.nicknameMax);
}

/** Without consent and the box unticked, the press opens the box (ticking it then sends); with the
 *  box ticked it agrees and sends. */
function sendBestSoFar(): void {
  const run = store.bestSoFar;
  if (!run) return;
  if (!run.consent) {
    if (!optIn.value) {
      store.askBestSoFar(true);
      return;
    }
    store.agreeBestSoFar(chosenName());
  }
  void store.sendBestSoFar();
}
// The box ticked after a press asked for it (here or on the bar): agree and send, no second press.
watch(
  () => sendsOnTick.value && optIn.value,
  go => {
    if (!go) return;
    store.agreeBestSoFar(chosenName());
    void store.sendBestSoFar();
  },
  { immediate: true }
);
// A name changed during a run that already has the yes: later best-so-far sends go under it, as the
// final send will.
watch([anonymous, nickname], () => {
  if (bestSoFarHere.value && store.bestSoFar?.consent && optIn.value) store.agreeBestSoFar(chosenName());
});
/** Automatic best so far is ticked (Stepping away?). */
const autoSendOn = computed(() => stepAwayOptions.value.autoSendBest);
/** The yes for the automatic sends: agree under the name chosen here, then look at the schedule. */
function agreeAutoSend(): void {
  if (!optIn.value) return;
  store.agreeBestSoFar(chosenName());
  store.autoTick();
}

/** The acknowledgement can fold (lib/panelFold.ts): Find and submit then stays pressable without the ticks. */
const ACK_FOLDS = PANEL_FOLD.acknowledgement === 'folded';
const ackFold = ref<InstanceType<typeof PanelFold> | null>(null);

/** The hint under Find and submit: open the fold, bring the acknowledge box into view and put the focus on it. */
const consentBox = ref<InstanceType<typeof ConsentBox> | null>(null);
async function showConsent(): Promise<void> {
  await ackFold.value?.show(false);
  consentBox.value?.focusBox();
}
/** Find and submit: only with the ticks; without them, to the box. */
function findAndSubmit(): void {
  if (!optIn.value) {
    void showConsent();
    return;
  }
  emit('find', true);
}
// Send best so far asking for the yes (here or on the run bar): the box must be in sight.
watch(
  asking,
  a => {
    // Only when the ticks are actually needed: a player who already said yes never has it popped open.
    if (a && !optIn.value) void ackFold.value?.show(false);
  },
  { immediate: true, flush: 'post' }
);
</script>
