<!--
  "Share this result" for Light (Jordan, 15 Oct 2026), under Light's status and results in the Search nearby
  tab (StrongerBox.vue). Light is not a search: its result is the best of the instant answer's routes priced at
  once on your hours, your earlier routes priced on this save and, by a date, one TE lower
  (search/lightResult.ts). It goes to the board as the same row a Fast result or a By a date answer makes, with
  `level: 'light'` (stores/chainSearch.ts `buildLightSubmission`).

  The same box as Fast's (ShareResult.vue compact: the account's agreement in ConsentBox.vue, anonymous or
  "Credit me as", the CSV and diagnostics). Light starts by itself, so there is no Find and submit: only Send,
  and nothing goes without that press, whatever was remembered. Shown only once Light is done with a result
  (`lightShareShown`); a result already sent from this browser says Sent and can't go twice.
-->
<template>
  <ShareResult
    v-if="shown && result"
    compact
    :send-label="label"
    :goal-word="result.goal.kind === 'date' ? 'deadline' : 'target'"
    csv-detail="(for Light: the routes it priced, best first)"
    v-model:opt-in="optIn"
    v-model:anonymous="anonymous"
    v-model:nickname="nickname"
    v-model:note="note"
    data-testid="light-share"
    @nickname-typed="nicknameTouched = true"
  >
    <template #intro>
      <p class="text-[11px] text-indigo-900/80 leading-relaxed" data-testid="light-share-intro">
        Sends Light's best route, {{ result.best.chain.join(' → ') }}, to the {{ NAMES.compare
        }}<template v-if="shareTab"
          >'s <span class="font-bold">{{ shareTab }}</span> tab</template
        >, recorded as found by Light: {{ lightFromText(result) }}.
      </p>
    </template>
    <template #consent>
      <span data-testid="share-consent-text"
        >I acknowledge the following: I want to share this result on the leaderboard. I understand it sends the route,
        its dates and the {{ result.goal.kind === 'date' ? 'deadline' : 'target' }}, with my artifact inventory,
        timezone, local plan start and the random code this browser keeps for the account (not my player ID, and never
        shown), plus my CSV if ticked below and, if ticked, private diagnostics (never shown).</span
      >
    </template>
    <template #opted>
      <button
        type="button"
        :disabled="sharing || sent"
        class="px-4 py-2 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
        data-testid="light-send"
        @click="share(note)"
      >
        <SendingText v-if="sharing" />
        <template v-else>{{ sent ? 'Sent' : label }}</template>
      </button>
      <ShareStatus
        :message="shareMessage"
        :ok="shareOk"
        :partial="sharePartial"
        :pending-table="store.pendingTable?.source === 'light'"
        :retrying="retryingTable"
        @retry="retryTable"
      />
    </template>
  </ShareResult>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ShareResult from './ShareResult.vue';
import ShareStatus from './ShareStatus.vue';
import SendingText from './SendingText.vue';
import { NAMES } from '@/lib/siteNav';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useStrongerStore } from '@/stores/stronger';
import { useInitialStateStore } from '@/stores/initialState';
import { useLightShare, useShareIdentity } from '@/composables/useShareResult';
import { lightFromText, lightSendLabel, lightShareShown } from '@/search/lightResult';

const props = defineProps<{
  goal: 'fastest' | 'date';
  /** The header's player ID (for the account's name and choices); the loaded save's when not given. */
  playerId?: string;
}>();

const store = useChainSearchStore();
const stronger = useStrongerStore();
const initialState = useInitialStateStore();
const playerId = () => props.playerId || initialState.playerId || '';

const result = computed(() => stronger.lightResult[props.goal]);
const identity = useShareIdentity(playerId);
const { optIn, anonymous, nickname, nicknameTouched } = identity;
const {
  collectorConfigured,
  sharing,
  shareMessage,
  shareOk,
  sharePartial,
  sent,
  shareTab,
  retryingTable,
  retryTable,
  share,
} = useLightShare(store, identity, result);

const shown = computed(() =>
  lightShareShown({
    level: stronger.level,
    state: stronger.light.state,
    result: result.value,
    collector: collectorConfigured.value,
  })
);
const label = computed(() => (result.value ? lightSendLabel(result.value) : ''));
/** "Note on this run", sent with the result. A new result starts without one, and without the last status. */
const note = ref('');
watch(
  () => result.value?.best.chain.join(','),
  () => {
    shareMessage.value = '';
  }
);
</script>
