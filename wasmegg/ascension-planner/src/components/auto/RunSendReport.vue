<!--
  How a Find and submit run's automatic send went, beside the run controls on every search screen.

  When this panel did the sending (`own`): "Submitted automatically." and the send's own words, with
  Put my name on it (sent anonymously, and the name box now says who to credit: name the stored row
  rather than sending a second copy) and Retry the table (the summary landed, the table did not).
  Otherwise the store's record of a send made by a panel that has since closed (AutoSendReport.vue).

  Smart search used to show its own line without Retry the table, the Full sweep only inside a sweep
  link's card, and By a date nowhere but in Share this result.
-->
<template>
  <div
    v-if="own && message && !running"
    class="rounded-lg border px-3 py-2 text-[11px] space-y-2"
    :class="
      !ok
        ? 'bg-red-50 border-red-200 text-red-800'
        : partial
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
    "
    data-testid="run-send-report"
  >
    <p><b>Submitted automatically.</b> {{ message }}</p>
    <div v-if="nameToClaim || pendingTable" class="flex flex-wrap gap-2">
      <button
        v-if="nameToClaim"
        type="button"
        :disabled="claiming"
        class="px-3 py-1.5 rounded-lg border border-current text-[10px] font-black uppercase tracking-widest hover:bg-white/60 disabled:opacity-40"
        @click="emit('claim')"
      >
        {{ claiming ? 'Renaming...' : 'Put my name on it' }}
      </button>
      <button
        v-if="pendingTable"
        type="button"
        :disabled="retrying"
        class="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 disabled:opacity-40"
        @click="emit('retry')"
      >
        <SendingText v-if="retrying" text="Sending the table" /><template v-else>Retry the table</template>
      </button>
    </div>
  </div>
  <AutoSendReport v-else-if="!own && !quiet" :kind="kind" />
</template>

<script setup lang="ts">
import AutoSendReport from './AutoSendReport.vue';
import SendingText from './SendingText.vue';

withDefaults(
  defineProps<{
    kind: 'smart' | 'full' | 'by-date';
    /** This panel made the automatic send (it has the message and the buttons). */
    own: boolean;
    running: boolean;
    message?: string;
    ok?: boolean;
    partial?: boolean;
    nameToClaim?: string;
    claiming?: boolean;
    pendingTable?: boolean;
    retrying?: boolean;
    /** Hide the store's report too (By a date: its Share this result already says how a send went). */
    quiet?: boolean;
  }>(),
  {
    message: '',
    ok: true,
    partial: false,
    nameToClaim: '',
    claiming: false,
    pendingTable: false,
    retrying: false,
    quiet: false,
  }
);
const emit = defineEmits<{ claim: []; retry: [] }>();
</script>
