<!--
  "Share this result": the box under every search's answer (Smart search, the Full sweep and By a
  date). One frame for all three: the heading, the screen's own words on what is sent and where
  (`intro`), the consent tick with the screen's own wording (`consent`), and once ticked, anonymous
  or "Credit me as", the CSV and diagnostics boxes (ShareExtras.vue) and anything else the screen
  asks (`opted`). The buttons and the status line are the screen's (default slot, ShareStatus.vue):
  what a send does differs (the race to the target vs Compare's By a date tabs).

  The consent and name live in the screen (composables/useShareResult.ts), since Find and submit's
  bar (FindBar.vue) shows the same choices.
-->
<template>
  <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3 scroll-mt-4">
    <h3 class="text-[10px] font-black text-indigo-800 uppercase tracking-widest">{{ heading }}</h3>
    <slot name="intro" />
    <!-- The run sent a best so far (Send best so far): this send takes its place on the board. -->
    <p v-if="replacesBestSoFar" class="text-[11px] font-semibold text-indigo-900" data-testid="share-replaces">
      Your best so far from this run is on the board as "in progress". Sending this result replaces it.
    </p>
    <!-- Compact (the user, 12 Oct: the same consent twice): not agreed yet, the screen's one button, which
         opens the consent (nothing is sent by that press); agreed (remembered in this browser), the one-line
         summary with Change, the note folded, and the screen's button and status below it. -->
    <template v-if="compact && !optIn && sendLabel && !asking">
      <button
        type="button"
        class="px-4 py-2 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800"
        data-testid="share-ask"
        @click="asking = true"
      >
        {{ sendLabel }}
      </button>
      <p class="text-[10px] text-indigo-900/70">This asks you to agree first; nothing is sent by that press.</p>
    </template>
    <template v-else-if="folded">
      <ConsentSummary :anonymous="anonymous" :nickname="nickname" :nickname-max="nicknameMax" @change="expanded = true" />
      <details v-if="note !== undefined" class="text-[11px] text-indigo-900" data-testid="share-note-fold">
        <summary class="cursor-pointer font-bold text-indigo-800">
          {{ note ? 'Note on this run (added)' : 'Add a note on this run' }}
        </summary>
        <RunNoteBox v-model="note" class="mt-1 text-[11px] text-indigo-900" />
      </details>
      <div class="space-y-2"><slot name="opted" /></div>
    </template>
    <template v-else>
    <!-- OPT IN, UNCHECKED. Nothing leaves the machine until this is deliberately ticked. -->
    <label class="flex items-start gap-3 cursor-pointer text-xs text-indigo-900">
      <input
        v-model="optIn"
        type="checkbox"
        class="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
        data-testid="share-consent"
      />
      <!-- The same acknowledgement as Find and submit's (FindBar.vue), first person, on every screen:
           only the target/deadline word differs. A screen can still replace it (`consent`). -->
      <slot name="consent"
        ><span data-testid="share-consent-text"
          >I acknowledge the following: I want to share this result on the leaderboard. I understand it sends the route,
          its dates and the {{ goalWord }}, with my artifact inventory, timezone, local plan start and the random code
          this browser keeps for the account (not my player ID, and never shown), plus my CSV if ticked below and, if
          ticked, private diagnostics (never shown).<template v-if="goalWord === 'target'">
            It also sends my best three plans already on the board, re-priced from this save.</template
          ></span
        ></slot
      >
    </label>
    <!-- Credit, behind the opt-in like everything else that leaves the machine. -->
    <div v-if="optIn" class="space-y-2">
      <ShareNameChoice
        v-model:anonymous="anonymous"
        v-model:nickname="nickname"
        :nickname-max="nicknameMax"
        class="text-[11px] text-indigo-900"
        @nickname-typed="emit('nicknameTyped')"
      />
      <ShareExtras :csv-detail="csvDetail" />
      <!-- The same note box as Find and submit's (FindBar.vue), holding the run's own note: what it
           says here is what is sent, and what the CSV's header carries. -->
      <RunNoteBox v-if="note !== undefined" v-model="note" class="text-[11px] text-indigo-900" />
      <p v-if="compact && optIn" class="text-[10px] text-indigo-900/70" data-testid="share-fold">
        Remembered in this browser; untick the box to withdraw it.
      </p>
      <slot name="opted" />
      <!-- Opened (Change, or just ticked): Done folds it back to the one line (the user, 14 Oct: once
           opened there was no clear way to close it). -->
      <div v-if="compact && expanded">
        <button
          type="button"
          class="px-4 py-1.5 rounded-lg border border-indigo-300 bg-white text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50"
          data-testid="share-done"
          @click="expanded = false"
        >
          Done
        </button>
      </div>
    </div>
    </template>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ConsentSummary from './ConsentSummary.vue';
import ShareExtras from './ShareExtras.vue';
import ShareNameChoice from './ShareNameChoice.vue';
import RunNoteBox from './RunNoteBox.vue';

const props = withDefaults(
  defineProps<{
    heading?: string;
    /** After "(the same file as Download CSV)" in the CSV box: what this screen's CSV holds. */
    csvDetail?: string;
    nicknameMax?: number;
    /** What the route is measured against, in the acknowledgement: 'target' (Fastest) or 'deadline'. */
    goalWord?: 'target' | 'deadline';
    /** The run sent a best so far that this send replaces (store `provisionalRows`). */
    replacesBestSoFar?: boolean;
    /** Show the agreed consent as one line (ConsentSummary.vue) instead of the full box. */
    compact?: boolean;
    /** With `compact`, and not agreed yet: the screen's one send button, which asks for the consent. */
    sendLabel?: string;
  }>(),
  {
    heading: 'Share this result',
    csvDetail: '',
    nicknameMax: 40,
    goalWord: 'target',
    replacesBestSoFar: false,
    compact: false,
    sendLabel: '',
  }
);
const emit = defineEmits<{ nicknameTyped: [] }>();
const optIn = defineModel<boolean>('optIn', { required: true });
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });
/** "Note on this run": the run's note, sent with the result. Left unbound, the box isn't shown. */
const note = defineModel<string>('note');
/** Change opened the folded consent; the send button of a not-yet-agreed box asked for it. */
const expanded = ref(false);
const asking = ref(false);
const folded = computed(() => props.compact && optIn.value && !expanded.value);
// Ticked now (not remembered from before): its choices stay open for this visit; it folds next time.
watch(optIn, v => {
  if (v) asking.value = false;
  expanded.value = v;
});
</script>
