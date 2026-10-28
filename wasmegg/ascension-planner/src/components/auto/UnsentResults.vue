<!--
  "This result wasn't sent to the leaderboard: Send it now". Finished results this browser kept for
  sending (search/pendingSends.ts) that have not reached the board: the page went before the send
  landed, or nothing sent them. Each goes with its own payload and CSV, as the run left them, so it
  works after a reload and whatever save is loaded now. With the player's yes already given (Find and
  submit, or a send that began) one click sends it; otherwise they tick to agree first, and the sharing line's
  Change (SharingSummary.vue) holds the credit, the account's one setting as on every screen.
-->
<template>
  <p v-if="!shown.length && sentNote" class="text-body font-bold text-emerald-700" data-testid="unsent-sent">
    {{ sentNote }}
  </p>
  <div
    v-if="shown.length"
    class="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-body text-amber-900"
    data-testid="unsent-results"
  >
    <div v-for="p in shown" :key="p.id" class="space-y-1">
      <!-- Already on the board (the account's own rows, read on load; Jordan, 27 Oct 2026): said, with no Send it
           now and no consent to give. Dismiss takes it off the list. -->
      <div v-if="onBoard[p.id]" class="flex flex-wrap items-center gap-3" :data-testid="`unsent-on-board-${p.id}`">
        <span
          >{{ p.label }}, from {{ ago(p.createdAt) }}: <span class="font-bold">{{ onBoard[p.id] }}</span
          >.</span
        >
        <button
          type="button"
          class="min-h-[44px] sm:min-h-0 text-body font-bold text-amber-700/70 hover:text-amber-900"
          @click="store.dropPending(p.id)"
        >
          Dismiss
        </button>
      </div>
      <template v-else>
        <div class="flex flex-wrap items-center gap-3">
          <span
            ><span class="font-bold">This result wasn't sent to the leaderboard:</span> {{ p.label }}, from
            {{ ago(p.createdAt) }}.</span
          >
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-body font-bold hover:bg-amber-800 disabled:opacity-40"
            :disabled="sendingId !== null || store.busy || !consentFor(p)"
            :data-testid="`send-unsent-${p.id}`"
            @click="send(p)"
          >
            <SendingText v-if="sendingId === p.id" /><template v-else>Send it now</template>
          </button>
          <button
            type="button"
            class="text-body font-bold text-amber-700/70 hover:text-amber-900 disabled:opacity-40"
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
        <!-- A one-off yes for this result (ConsentBox.vue, no "Remember": it is about this result alone).
             Withdrawn (or never ticked), Send it now stays greyed out. -->
        <ConsentBox
          v-else
          :model-value="!!agreed[p.id]"
          :testid="`unsent-consent-${p.id}`"
          :box-testid="`agree-unsent-${p.id}`"
          input-class="border-amber-400"
          summary-class="text-amber-900"
          :footer-indent="false"
          @update:model-value="(v: boolean) => (agreed[p.id] = v)"
        >
          <template #summary><span>You agreed to share this result on the leaderboard</span></template>
          <template #text>
            <!-- Share this result's acknowledgement (ShareResult.vue), for a result already finished:
                 the name, or none, is chosen below once ticked, as there. -->
            <span data-testid="unsent-consent-text"
              >I acknowledge the following: I want to share this result on the leaderboard. I understand it sends the
              route, its dates and the {{ p.kind === 'deadline' ? 'deadline' : 'target' }}, with my artifact inventory,
              timezone, local plan start and the random code this browser keeps for the account (not my player ID, and
              never shown)<template v-if="p.csvGz">, plus its CSV</template>.</span
            >
          </template>
          <template #after>
            <!-- The one sharing line and its Change (SharingSummary.vue, ux29 #11): the account's credit, as on every
                 screen, rather than radios of this row's own. -->
            <SharingSummary
              v-if="agreed[p.id]"
              :anonymous="anonOf()"
              :nickname="nameOf()"
              :on="true"
              class="ml-6"
              :data-testid="`unsent-sharing-${p.id}`"
              @update:anonymous="(v: boolean) => sharedName.setAnonymous?.(v)"
              @update:nickname="(v: string) => sharedName.set(v)"
            />
            <p
              v-if="agreed[p.id] && namedButBlank()"
              class="ml-6 font-bold text-rose-700"
              :data-testid="`unsent-name-warning-${p.id}`"
            >
              Type a nickname to be credited (Change, above), or pick Stay anonymous there.
            </p>
            <div v-if="agreed[p.id]" class="ml-6 space-y-1">
              <label v-if="p.csvGz" class="flex items-start gap-2 cursor-pointer">
                <input
                  :checked="csvOf(p)"
                  type="checkbox"
                  class="mt-0.5 rounded border-amber-400"
                  :data-testid="`unsent-csv-${p.id}`"
                  @change="csvs[p.id] = ($event.target as HTMLInputElement).checked"
                />
                <span
                  ><span class="font-bold">Send my CSV too</span>: everything this search priced, best first (the same
                  file as Download CSV). It is compressed before it leaves your machine. Untick it to send the headline
                  alone.</span
                >
              </label>
              <label class="flex items-start gap-2 cursor-pointer">
                <input
                  :checked="diagOf(p.id)"
                  type="checkbox"
                  class="mt-0.5 rounded border-amber-400"
                  :data-testid="`unsent-diagnostics-${p.id}`"
                  @change="diags[p.id] = ($event.target as HTMLInputElement).checked"
                />
                <span
                  ><span class="font-bold">Also send diagnostics</span>: memory readings, how many workers ran, any
                  crash or carry-on, the run's size and time, the app version, and your browser and system. Sent
                  privately to the planner's maintainer, never shown on the Leaderboard; no player ID and no save.</span
                >
              </label>
            </div>
          </template>
        </ConsentBox>
        <p v-if="messages[p.id]" :class="okIds[p.id] ? 'text-emerald-700' : 'text-rose-700'" class="font-bold">
          {{ messages[p.id] }}
        </p>
        <p v-else-if="p.lastError" class="text-rose-700">Last try: {{ p.lastError }}</p>
      </template>
    </div>
    <p class="text-small text-amber-800/70">
      Kept on {{ thisDevice() }} until it is sent or dismissed (the newest {{ MAX_PENDING_SENDS }} at most).
    </p>
  </div>
</template>

<script setup lang="ts">
import { thisDevice } from '@/search/device';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { hashID } from '@/lib/storage/db';
import {
  MAX_PENDING_SENDS,
  chosenConsent,
  type PendingConsent,
  type PendingKind,
  type PendingSend,
} from '@/search/pendingSends';
import { useShareExtras } from '@/composables/useShareExtras';
import { useAccountName, useSharedName } from '@/composables/useShareResult';
import { sentence } from '@/utils/errors';
import { onBoardLine } from '@/search/sentOnBoard';
import SendingText from './SendingText.vue';
import ConsentBox from './ConsentBox.vue';
import SharingSummary from '../SharingSummary.vue';

const props = defineProps<{
  /** This screen's kind; every kind when left out (My runs' "Not sent yet"). */
  kind?: PendingKind;
  playerId: string;
  /** The screen's own "Credit me as" box, to start each name from; else the account's name. */
  nickname?: string;
}>();
const store = useChainSearchStore();

/** This screen's kept results; none while a run or its own end-of-run send is going. */
const shown = computed(() =>
  store.isRunning || store.deadlineRunning || (store.resultSending && !sendingId.value)
    ? []
    : store.pendingSends.filter(p => !props.kind || p.kind === props.kind)
);
/** What the last Send it now here said once its result left the list (sent). */
const sentNote = ref('');
const agreed = reactive<Record<string, boolean>>({});
const messages = reactive<Record<string, string>>({});
const okIds = reactive<Record<string, boolean>>({});
const sendingId = ref<string | null>(null);
/** Each one's "Send my CSV too" and "Also send diagnostics" ticks, once changed. */
const csvs = reactive<Record<string, boolean>>({});
const diags = reactive<Record<string, boolean>>({});
const extras = useShareExtras();
const accountName = useAccountName(() => props.playerId);

/** The account's one credit (stores/shareName.ts): anonymous until picked. A name typed under Change is the
 *  account's name everywhere, as in the screens' boxes. */
const sharedName = useSharedName(() => props.playerId);
const anonOf = (): boolean => sharedName.getAnonymous?.() ?? true;
/** The screen's name box, else the account's typed name, else its own name. */
const nameOf = (): string => props.nickname?.trim() || (sharedName.get() ?? accountName.value);
const csvOf = (p: PendingSend): boolean => csvs[p.id] ?? true;
/** Starts from the saved "Tick this by default" preference, as the main form does. */
const diagOf = (id: string): boolean => diags[id] ?? extras.diagnosticsByDefault.value;
/** "Credit me as" picked with no name typed. */
const namedButBlank = (): boolean => !anonOf() && !nameOf().trim();
const consentFor = (p: PendingSend): PendingConsent | undefined =>
  chosenConsent(p, {
    agreed: !!agreed[p.id],
    anonymous: anonOf(),
    nickname: nameOf(),
    sendCsv: csvOf(p),
    sendDiagnostics: diagOf(p.id),
  });

/** Each kept result already on the board: "Already on the Leaderboard (sent at 10:48 AM)" (the store's
 *  `pendingOnBoard` over the account's rows); none while the rows are not read. */
const onBoard = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {};
  for (const p of shown.value) {
    const row = store.pendingOnBoard(p);
    if (row) out[p.id] = onBoardLine(row);
  }
  return out;
});

async function send(p: PendingSend): Promise<void> {
  if (sendingId.value) return;
  sendingId.value = p.id;
  messages[p.id] = '';
  try {
    const res = await store.sendPending(p.id, consentFor(p));
    // Refused for the leaderboard but stored: off this list (it is stored), said with its code.
    okIds[p.id] = res.ok && !res.quarantined;
    messages[p.id] = res.quarantined
      ? res.message
      : res.ok
        ? `Thanks! ${sentence(res.message)}`
        : `Not sent: ${res.message}`;
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
    if (store.pendingSends.length) void store.loadMineRows();
  } catch {
    // nothing kept is shown
  }
}
onMounted(load);
watch(() => props.playerId, load);
</script>
