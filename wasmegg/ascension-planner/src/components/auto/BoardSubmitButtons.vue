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
        class="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-white"
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
        class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-40"
        :title="`Put ${nameToClaim} on the run already on the board, instead of sending it again`"
        @click="emit('claim')"
      >
        {{ claiming ? 'Renaming...' : 'Put my name on it' }}
      </button>
      <button
        v-else-if="submitUrl"
        type="button"
        :disabled="!optIn || sending || alreadySubmitted || npBlocked"
        class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-40"
        @click="emit('submit')"
      >
        <SendingText v-if="sending" /><template v-else>{{
          alreadySubmitted ? 'On the board' : 'Submit result'
        }}</template>
      </button>

      <button
        type="button"
        :disabled="!optIn"
        class="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-white disabled:opacity-40"
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
      class="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-slate-200"
      >{{ preview() }}</pre
    >

    <p v-if="!submitUrl" class="text-[11px] text-indigo-900/70 leading-relaxed">
      No collector is configured in this build, so there is nowhere to submit to and the button is not shown.
      <span class="font-semibold">Save the file</span> and share it however you like. Self-hosting: set
      <span class="font-mono">VITE_SUBMIT_URL</span> at build time.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { sendBlockedByNoPrestige } from '@/lib/npGuard';
import type { TimeOffDates } from '@/search/timeOff';
import SendingText from './SendingText.vue';
import ShareStatus from './ShareStatus.vue';

const props = defineProps<{
  optIn: boolean;
  /** The collector's address; empty in a build without one. */
  submitUrl: string;
  /** The name Put my name on it would put on the stored row, or '' (useBoardSubmit `nameToClaim`). */
  nameToClaim: string;
  claiming: boolean;
  sending: boolean;
  alreadySubmitted: boolean;
  message: string;
  ok: boolean;
  partial: boolean;
  pendingTable: boolean;
  retrying: boolean;
  /** The payload as it would go, pretty-printed; called only while it is shown. */
  preview: () => string;
  /** The no-prestige days (store `noPrestige`): set, Submit result is greyed out (lib/npGuard.ts); the note is
   *  ShareResult's, above. */
  noPrestigeDays?: readonly TimeOffDates[];
}>();
const npBlocked = computed(() => sendBlockedByNoPrestige(props.noPrestigeDays));
const emit = defineEmits<{ claim: []; submit: []; save: []; retry: [] }>();
const showPayload = ref(false);
</script>
