<!--
  Find / Find and submit / Stop, and the share opt-in that Find and submit needs: the same bar on
  both depths of Fastest route (the unified layout, phase 3). Smart search used to have "Start
  search" and a remembered "submit when it finishes" box; the Full sweep had these two buttons. Two
  ways to do one thing, on two tabs of one screen, and players asked which one sent what.

  The parent owns what the buttons do and when they're allowed (each search has its own checks), and
  the opt-in: it is the same consent as Share this result's "Yes, share", so it starts unticked
  on every visit like that one. (It was remembered for a while; that pre-ticked the Share consent
  too, and let the board lookup that waits for consent run on arrival. Review, 30 Sept.)

  Send best so far (9 Oct): while a run is going, its best so far can go to the board as an "in
  progress" row that the run's final send replaces (stores/chainSearch.ts `sendBestSoFar`). Same
  consent: given already by Find and submit; otherwise the first press opens the box below, and
  agreeing there also has the run send its result when it finishes, which replaces that row.
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
        {{ running ? runningLabel : findLabel }}
      </button>
      <div v-if="showSubmit && !running" class="flex flex-col items-center gap-1">
        <button
          type="button"
          class="px-6 py-4 rounded-xl bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
          :disabled="findDisabled || notReady || !optIn"
          @click="emit('find', true)"
        >
          Find and submit
        </button>
        <!-- Whenever consent is unticked, even with Find itself blocked (no save yet): the full wording is
             in the box below, this only says where to look. -->
        <span
          v-if="!optIn"
          class="text-[10px] font-semibold text-slate-500 text-center"
          data-testid="acknowledge-hint"
          >Please tick the box below</span
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
          {{ store.bestSoFarSending ? 'Sending...' : 'Send best so far' }}
        </button>
        <span class="text-[10px] font-semibold text-slate-500 text-center">{{
          asking && !optIn
            ? 'Please tick the box below'
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
        {{ stopping ? 'Stopping...' : 'Stop & keep best' }}
      </button>
    </div>
    <p
      v-if="bestSoFarHere && store.bestSoFarStatus"
      class="text-[11px] font-semibold"
      :class="store.bestSoFarStatus.ok ? 'text-emerald-700' : 'text-red-700'"
      data-testid="best-so-far-status"
    >
      {{ store.bestSoFarStatus.text }}
    </p>
    <!-- The save is still settling (a Science link, the Auto Planner tab, a new player id): every
         search reads it, so Find waits rather than pricing one save and labelling it with another. -->
    <p v-if="notReady" class="text-[11px] font-semibold text-amber-700">{{ store.saveNotReady }}</p>

    <div
      v-if="showSubmit && (!running || asking)"
      class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2 text-[11px] text-indigo-900"
    >
      <p v-if="!optIn" class="font-black text-indigo-800">
        To use {{ running ? 'Send best so far' : 'Find and submit' }}, please read this and tick the box to agree:
      </p>
      <label class="flex items-start gap-3">
        <input v-model="optIn" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
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
          plus my CSV if ticked below and, if ticked, private diagnostics (never shown). Stop it early and it shares the
          best it found so far. Send best so far shares it while the run goes on, without the CSV; that row is replaced
          when the run finishes.</span
        >
      </label>
      <p v-if="goalWord === 'target'" class="ml-7 text-[10px] text-indigo-900/70">
        It also sends your best three plans already on the board, re-priced from this save.
      </p>
      <!-- The same two boxes as Share this result, on the same choices. -->
      <div class="ml-7"><ShareExtras :csv-detail="csvDetail" /></div>
      <div v-if="optIn" class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer font-bold">
          <input v-model="anonymous" type="radio" :value="true" class="text-indigo-600" />
          Submit anonymously
        </label>
        <label class="flex items-center gap-2 cursor-pointer font-bold">
          <input v-model="anonymous" type="radio" :value="false" class="text-indigo-600" />
          Credit me as
        </label>
        <input
          :value="nickname"
          type="text"
          :maxlength="nicknameMax"
          :disabled="anonymous"
          placeholder="nickname"
          aria-label="Nickname"
          class="rounded-lg border-indigo-200 text-sm font-bold text-slate-800 w-48 disabled:opacity-40"
          @input="onNickname"
        />
      </div>
      <!-- The note goes with the run as it starts; a run already going keeps the one it started with. -->
      <RunNoteBox v-if="note !== undefined && !running" v-model="note" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RunNoteBox from './RunNoteBox.vue';
import ShareExtras from './ShareExtras.vue';
import { useChainSearchStore } from '@/stores/chainSearch';

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

/** First press without consent opens the box; with the box ticked, it agrees and sends. */
function sendBestSoFar(): void {
  const run = store.bestSoFar;
  if (!run) return;
  if (!run.consent) {
    if (!run.asked) {
      store.askBestSoFar();
      return;
    }
    if (!optIn.value) return;
    store.agreeBestSoFar(anonymous.value ? '' : nickname.value.trim().slice(0, props.nicknameMax));
  }
  void store.sendBestSoFar();
}
const emit = defineEmits<{ find: [andSubmit: boolean]; stop: []; nicknameTyped: [] }>();

const optIn = defineModel<boolean>('optIn', { required: true });
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });
/** The run note (store `runNote`). Left unbound, the box isn't shown. */
const note = defineModel<string>('note');

function onNickname(e: Event): void {
  nickname.value = (e.target as HTMLInputElement).value;
  emit('nicknameTyped');
}
</script>
