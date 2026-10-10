<!--
  "This result wasn't sent to the leaderboard: Send it now". Finished results this browser kept for
  sending (search/pendingSends.ts) that have not reached the board: the page went before the send
  landed, or nothing sent them. Each goes with its own payload and CSV, as the run left them, so it
  works after a reload and whatever save is loaded now. With the player's yes already given (Find and
  submit, or a send that began) one click sends it; otherwise they tick to agree first.
-->
<template>
  <p v-if="!shown.length && sentNote" class="text-[11px] font-semibold text-emerald-700" data-testid="unsent-sent">
    {{ sentNote }}
  </p>
  <div
    v-if="shown.length"
    class="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-[11px] text-amber-900"
    data-testid="unsent-results"
  >
    <div v-for="p in shown" :key="p.id" class="space-y-1">
      <div class="flex flex-wrap items-center gap-3">
        <span
          ><span class="font-bold">This result wasn't sent to the leaderboard:</span> {{ p.label }}, from
          {{ ago(p.createdAt) }}.</span
        >
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800 disabled:opacity-40"
          :disabled="sendingId !== null || store.busy || (!p.consent && !agreed[p.id])"
          :data-testid="`send-unsent-${p.id}`"
          @click="send(p)"
        >
          <SendingText v-if="sendingId === p.id" /><template v-else>Send it now</template>
        </button>
        <button
          type="button"
          class="text-[10px] font-black uppercase tracking-widest text-amber-700/70 hover:text-amber-900 disabled:opacity-40"
          :disabled="sendingId === p.id"
          @click="store.dropPending(p.id)"
        >
          Dismiss
        </button>
      </div>
      <p v-if="p.consent" class="text-amber-800/80">
        {{ p.consent.nickname ? `As ${p.consent.nickname}` : 'Anonymously'
        }}{{ p.consent.sendCsv && p.csvGz ? ', with its CSV' : ''
        }}{{ p.consent.sendDiagnostics ? ' and diagnostics' : '' }}, as you chose when it was going to be sent.
      </p>
      <label v-else class="flex items-start gap-2">
        <input v-model="agreed[p.id]" type="checkbox" class="mt-0.5 rounded border-amber-400" />
        <span
          >I agree to share it on the leaderboard anonymously<template v-if="p.csvGz">, with its CSV</template>: the
          route, its dates and the {{ p.kind === 'deadline' ? 'deadline' : 'target' }}, with my artifact inventory,
          timezone, local plan start and the random code this browser keeps for the account (not my player ID).</span
        >
      </label>
      <p v-if="messages[p.id]" :class="okIds[p.id] ? 'text-emerald-700' : 'text-rose-700'" class="font-semibold">
        {{ messages[p.id] }}
      </p>
      <p v-else-if="p.lastError" class="text-rose-700">Last try: {{ p.lastError }}</p>
    </div>
    <p class="text-[10px] text-amber-800/70">
      Kept on this computer until it is sent or dismissed (the newest {{ MAX_PENDING_SENDS }} at most).
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { hashID } from '@/lib/storage/db';
import { MAX_PENDING_SENDS, type PendingKind, type PendingSend } from '@/search/pendingSends';
import { sentence } from '@/utils/errors';
import SendingText from './SendingText.vue';

const props = defineProps<{ kind: PendingKind; playerId: string }>();
const store = useChainSearchStore();

/** This screen's kept results; none while a run or its own end-of-run send is going. */
const shown = computed(() =>
  store.isRunning || store.deadlineRunning || (store.resultSending && !sendingId.value)
    ? []
    : store.pendingSends.filter(p => p.kind === props.kind)
);
/** What the last Send it now here said once its result left the list (sent). */
const sentNote = ref('');
const agreed = reactive<Record<string, boolean>>({});
const messages = reactive<Record<string, string>>({});
const okIds = reactive<Record<string, boolean>>({});
const sendingId = ref<string | null>(null);

async function send(p: PendingSend): Promise<void> {
  if (sendingId.value) return;
  sendingId.value = p.id;
  messages[p.id] = '';
  try {
    const res = await store.sendPending(
      p.id,
      p.consent ?? (agreed[p.id] ? { nickname: '', sendCsv: !!p.csvGz, sendDiagnostics: false } : undefined)
    );
    okIds[p.id] = res.ok;
    messages[p.id] = res.ok ? `Thanks! ${sentence(res.message)}` : `Not sent: ${res.message}`;
    if (res.ok) sentNote.value = `${p.label}: ${messages[p.id]}`;
  } finally {
    sendingId.value = null;
  }
}

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return m <= 1 ? 'just now' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} days ago`;
}

async function load(): Promise<void> {
  if (!props.playerId) return;
  try {
    await store.refreshPendingSends(await hashID(props.playerId));
  } catch {
    // nothing kept is shown
  }
}
onMounted(load);
watch(() => props.playerId, load);
</script>
