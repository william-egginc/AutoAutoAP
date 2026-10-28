<!--
  The buttons under Share this result on both depths of Fastest route (composables/useFastestShare.ts):
  Show exactly what is sent, Submit result (or Put my name on it, once on the board and the name box
  differs from what went), Save the file instead, and the status line with Retry the table. Smart
  search had all of these; the Full sweep had a copy of the middle two only.

  Sending a player's data somewhere else is the one irreversible thing these screens do, so it is
  built to be refused easily: nothing happens without a click, the exact payload is inspectable BEFORE
  the click, and with no collector configured the only option is a file the player hands over.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-body font-bold hover:bg-white"
        :aria-expanded="showPayload"
        @click="showPayload = !showPayload"
      >
        {{ showPayload ? '&#8964; Hide' : '&#8250; Show' }} exactly what is sent
      </button>

      <!-- Already on the board and the name box now differs from what went (typically: sent
           anonymously, now "Credit me as ..."): the button renames the stored row, which only works
           from the browser that sent it. -->
      <button
        v-if="submitUrl && nameToClaim"
        type="button"
        :disabled="!optIn || claiming"
        class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-body font-bold hover:bg-indigo-700 disabled:opacity-40"
        :title="`Put ${nameToClaim} on the run already on the board, instead of sending it again`"
        @click="emit('claim')"
      >
        {{ claiming ? 'Renaming...' : 'Put my name on it' }}
      </button>
      <!-- Already on the board, known on load from the account's own rows (Jordan, 27 Oct 2026): said, with no
           Submit, rather than learnt from the press. -->
      <span
        v-else-if="submitUrl && onBoardLine && !sending"
        class="text-body font-bold text-emerald-700"
        data-testid="share-on-board"
        >{{ onBoardLine }}</span
      >
      <button
        v-else-if="submitUrl"
        type="button"
        :disabled="!optIn || sending || alreadySubmitted"
        class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-body font-bold hover:bg-indigo-700 disabled:opacity-40"
        @click="emit('submit')"
      >
        <SendingText v-if="sending" /><template v-else>{{
          alreadySubmitted ? 'On the board' : 'Submit result'
        }}</template>
      </button>

      <!-- Sent anonymously and the setting has no name for it yet: the same words, and the press opens the one
           sharing setting on "Credit me as" (SharingSummary.vue, ux29 #11); with a name chosen it is the rename above. -->
      <button
        v-if="submitUrl && !nameToClaim && offerName && openForName"
        type="button"
        class="inline-flex items-center min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-body font-bold hover:bg-white"
        data-testid="name-it"
        @click="openForName()"
      >
        Put my name on it
      </button>

      <button
        type="button"
        :disabled="!optIn"
        class="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-body font-bold hover:bg-white disabled:opacity-40"
        @click="emit('save')"
      >
        Save the file instead
      </button>

      <!-- The summary landed but the table did not: Retry the table sends just the table, with the
           same one-time token, rather than a second submission. -->
      <ShareStatus
        tag="span"
        :message="message"
        :ok="ok"
        :partial="partial"
        :pending-table="pendingTable"
        :retrying="retrying"
        @retry="emit('retry')"
      />
    </div>

    <pre
      v-if="showPayload"
      class="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-small text-slate-200"
      >{{ preview() }}</pre
    >

    <p v-if="!submitUrl" class="text-body text-indigo-900/70 max-w-prose">
      No collector is configured in this build, so there is nowhere to submit to and the button is not shown.
      <span class="font-bold">Save the file</span> and share it however you like. Self-hosting: set
      <span class="tabular-nums">VITE_SUBMIT_URL</span> at build time.
    </p>
  </div>
</template>

<script setup lang="ts">
import { inject, ref } from 'vue';
import { OPEN_SHARING_FOR_NAME } from '@/lib/sharingLine';
import SendingText from './SendingText.vue';
import ShareStatus from './ShareStatus.vue';

defineProps<{
  optIn: boolean;
  /** The collector's address; empty in a build without one. */
  submitUrl: string;
  /** The name Put my name on it would put on the stored row, or '' (useBoardSubmit `nameToClaim`). */
  nameToClaim: string;
  /** The row went anonymously and no name is chosen yet (useBoardSubmit `offerName`). */
  offerName?: boolean;
  claiming: boolean;
  sending: boolean;
  alreadySubmitted: boolean;
  /** "Already on the Leaderboard (sent at 10:48 AM)" for a result whose row is already there (the store's
   *  `fastestOnBoard`), or '' / absent: Submit as before. */
  onBoardLine?: string;
  message: string;
  ok: boolean;
  partial: boolean;
  pendingTable: boolean;
  retrying: boolean;
  /** The payload as it would go, pretty-printed; called only while it is shown. */
  preview: () => string;
}>();
const emit = defineEmits<{ claim: []; submit: []; save: []; retry: [] }>();
const showPayload = ref(false);
/** Share this result's sharing setting, opened on "Credit me as" (ShareResult.vue); absent outside it. */
const openForName = inject(OPEN_SHARING_FOR_NAME, null);
</script>
