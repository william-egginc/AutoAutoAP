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
    <h3 class="text-indigo-800 label">{{ heading }}</h3>
    <slot name="intro" />
    <!-- The run sent a best so far (Send best so far): this send takes its place on the board. -->
    <p v-if="replacesBestSoFar" class="text-body font-bold text-indigo-900 max-w-prose" data-testid="share-replaces">
      Your best so far from this run is on the Leaderboard as "in progress". Sending this result replaces it.
    </p>
    <!-- Compact (the user, 12 Oct: the same consent twice): not agreed yet, the screen's one button, which
         opens the consent (nothing is sent by that press); agreed (remembered for the account), the one-line
         summary with Change, the note folded, and the screen's button and status below it. -->
    <template v-if="compact && !optIn && sendLabel && !asking">
      <button
        type="button"
        class="px-4 py-2 rounded-lg bg-indigo-700 text-white text-body font-bold hover:bg-indigo-800"
        data-testid="share-ask"
        @click="asking = true"
      >
        {{ sendLabel }}
      </button>
      <p class="text-small text-indigo-900/70">This asks you to agree first; nothing is sent by that press.</p>
    </template>
    <!-- The account's agreement (ConsentBox.vue, composables/useConsent.ts): compact folds it to one line
         once agreed, with Change; opened, "Remember my choice", Withdraw and Done. -->
    <ConsentBox
      v-else
      v-model="optIn"
      consent-id="leaderboard"
      :foldable="compact"
      done-testid="share-done"
      box-testid="share-consent"
      label-class="text-body text-indigo-900"
      input-class="border-indigo-300 text-indigo-600 focus:ring-indigo-500"
      summary-class="text-body text-indigo-900"
      :footer-indent="false"
      withdrawn-text="Withdrawn: nothing more goes to the leaderboard from here until you agree again."
    >
      <template #summary>
        <ConsentSummary :anonymous="anonymous" :nickname="nickname" :nickname-max="nicknameMax" />
      </template>
      <template #text>
        <!-- OPT IN, UNCHECKED. Nothing leaves the machine until this is deliberately ticked. -->
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
      </template>
      <template #after>
        <!-- Credit, behind the opt-in like everything else that leaves the machine. -->
        <div v-if="optIn" class="space-y-2">
          <ShareNameChoice
            v-model:anonymous="anonymous"
            v-model:nickname="nickname"
            :nickname-max="nicknameMax"
            class="text-small text-indigo-900"
            @nickname-typed="emit('nicknameTyped')"
          />
          <ShareExtras :csv-detail="csvDetail" />
          <!-- The same note box as Find and submit's (FindBar.vue), holding the run's own note: what it
               says here is what is sent, and what the CSV's header carries. -->
          <RunNoteBox v-if="note !== undefined" v-model="note" class="text-small text-indigo-900" />
          <slot name="opted" />
        </div>
      </template>
      <template #aside="{ folded }">
        <template v-if="folded">
          <details v-if="note !== undefined" class="text-small text-indigo-900" data-testid="share-note-fold">
            <summary class="cursor-pointer font-bold text-indigo-800">
              {{ note ? 'Note on this run (added)' : 'Add a note on this run' }}
            </summary>
            <RunNoteBox v-model="note" class="mt-1 text-small text-indigo-900" />
          </details>
          <div class="space-y-2"><slot name="opted" /></div>
        </template>
      </template>
    </ConsentBox>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import ConsentBox from './ConsentBox.vue';
import ConsentSummary from './ConsentSummary.vue';
import ShareExtras from './ShareExtras.vue';
import ShareNameChoice from './ShareNameChoice.vue';
import RunNoteBox from './RunNoteBox.vue';

withDefaults(
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
/** The send button of a not-yet-agreed box asked for the consent. Change, Done and the fold are
 *  ConsentBox's. */
const asking = ref(false);
watch(optIn, v => {
  if (v) asking.value = false;
});
</script>
