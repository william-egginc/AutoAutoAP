<!--
  What a send said ("Thanks! ...", "Not sent: ...", or amber "Sent, but ..."), and when the summary
  landed but the table did not, "Retry the table". The same line under Share this result on every
  search screen (ShareResult.vue).
-->
<template>
  <component
    :is="tag"
    v-if="message"
    class="text-[11px] font-semibold"
    :class="!ok ? 'text-rose-700' : partial ? 'text-amber-700' : 'text-emerald-700'"
  >
    <SendingText v-if="inProgress" :text="message.replace(/\.\.\.$/, '')" />
    <template v-else>{{ message }}</template>
  </component>
  <button
    v-if="pendingTable"
    type="button"
    :disabled="retrying"
    class="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 disabled:opacity-40"
    @click="emit('retry')"
  >
    <SendingText v-if="retrying" text="Sending the table" /><template v-else>Retry the table</template>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SendingText from './SendingText.vue';

const props = withDefaults(
  defineProps<{
    message: string;
    ok: boolean;
    /** "Sent, but ...": shown amber. */
    partial?: boolean;
    /** The table is still to send (store `pendingTable`): offer Retry the table. */
    pendingTable?: boolean;
    retrying?: boolean;
    /** `span` inside a row of buttons, `p` on a line of its own. */
    tag?: 'p' | 'span';
  }>(),
  { partial: false, pendingTable: false, retrying: false, tag: 'p' }
);
const emit = defineEmits<{ retry: [] }>();
/** A step of a send still going ("Preparing your result...", "Sending..."): its dots move. */
const inProgress = computed(() => /^(Sending|Preparing)[^.]*\.\.\.$/.test(props.message));
</script>
