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
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
          <input v-model="anonymous" type="radio" :value="true" class="text-indigo-600 focus:ring-indigo-500" />
          Submit anonymously
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
          <input v-model="anonymous" type="radio" :value="false" class="text-indigo-600 focus:ring-indigo-500" />
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
      <ShareExtras :csv-detail="csvDetail" />
      <!-- The same note box as Find and submit's (FindBar.vue), holding the run's own note: what it
           says here is what is sent, and what the CSV's header carries. -->
      <RunNoteBox v-if="note !== undefined" v-model="note" class="text-[11px] text-indigo-900" />
      <slot name="opted" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import ShareExtras from './ShareExtras.vue';
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
  }>(),
  { heading: 'Share this result', csvDetail: '', nicknameMax: 40, goalWord: 'target', replacesBestSoFar: false }
);
const emit = defineEmits<{ nicknameTyped: [] }>();
const optIn = defineModel<boolean>('optIn', { required: true });
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });
/** "Note on this run": the run's note, sent with the result. Left unbound, the box isn't shown. */
const note = defineModel<string>('note');

function onNickname(e: Event): void {
  nickname.value = (e.target as HTMLInputElement).value;
  emit('nicknameTyped');
}
</script>
