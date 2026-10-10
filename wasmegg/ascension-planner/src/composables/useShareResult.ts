/**
 * The state behind "Share this result" (ShareResult.vue) and the Find and submit bar (FindBar.vue),
 * shared by the three search screens. Each screen used to carry its own copy of these lines, so a
 * fix (the nickname that must never fall back to the raw EID, the "Sent, but ..." amber, the double
 * click that sent twice) had to be made two or three times.
 *
 *  - `createShareIdentity` / `useShareIdentity`: the consent tick, anonymous-or-named, and the name
 *    box that follows the account's own name until the player types in it. The consent starts
 *    unticked on every visit (FindBar.vue explains why it is not remembered).
 *  - `useBoardSubmit`: the race-to-the-target send (Smart search and the Full sweep): the status
 *    message, Put my name on it, Retry the table, the rechecks worked out once consent is given,
 *    and the guard against sending a result twice. Each screen still says HOW it sends (`send`).
 *  - `useByDateShare`: the By a date send, to Compare's Egg Day or By a date tab.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useEidsStore } from 'lib';
import { sentence } from '@/utils/errors';
import { NAMES } from '@/lib/siteNav';
import { eggDayYearOf } from '@/lib/eggDay';
import { useShareExtras } from './useShareExtras';
import type { useChainSearchStore } from '@/stores/chainSearch';
import type { DeadlineRoute } from '@/search/deadline';

type Store = ReturnType<typeof useChainSearchStore>;

export interface ShareIdentity {
  /** "Yes, share this result" / Find and submit's acknowledgement. */
  optIn: Ref<boolean>;
  /** Anonymous by default: crediting yourself should be a choice, not the fallback. */
  anonymous: Ref<boolean>;
  /** The "Credit me as" box. */
  nickname: Ref<string>;
  /** The player typed in the name box: it stops following the account's name. */
  nicknameTouched: Ref<boolean>;
}

/**
 * The name box starts from the account's own name and follows it (the username arrives when a
 * backup finishes loading, which can be after the screen mounts) until the player types in it.
 */
export function createShareIdentity(accountName: Ref<string>): ShareIdentity {
  const optIn = ref(false);
  const anonymous = ref(true);
  const nickname = ref(accountName.value);
  const nicknameTouched = ref(false);
  watch(accountName, name => {
    if (!nicknameTouched.value) nickname.value = name;
  });
  return { optIn, anonymous, nickname, nicknameTouched };
}

/**
 * The name already in the header's ID box. Deliberately not `displayName()`, which falls back to the
 * raw EID for an account with no username: that would put a player ID into a payload whose consent
 * text promises it is not there. Blank is the right default then.
 */
export function useAccountName(playerId: () => string): ComputedRef<string> {
  const eidsStore = useEidsStore();
  return computed(() => {
    const entry = eidsStore.eids.get(playerId().trim());
    return entry?.nickname || entry?.username || '';
  });
}

export function useShareIdentity(playerId: () => string): ShareIdentity {
  return createShareIdentity(useAccountName(playerId));
}

/** The parts of the chain search store the race-to-the-target send reads. */
export type BoardStore = Pick<
  Store,
  | 'alreadySubmitted'
  | 'retryTable'
  | 'nameToClaim'
  | 'claimName'
  | 'sentRecord'
  | 'prepareRechecks'
  | 'bestDays'
  | 'isRunning'
>;

export function useBoardSubmit(store: BoardStore, effectiveNickname: Ref<string>, optIn: Ref<boolean>) {
  const submitMessage = ref('');
  const submitOk = ref(false);
  /** "Sent, but ..." -- the summary is in and something about the table is not. Amber, not green. */
  const submitPartial = computed(() => /\bbut\b/.test(submitMessage.value));

  /** The summary landed but the table did not: send just the table, with the same one-time token. */
  const retryingTable = ref(false);
  async function retryTable(): Promise<void> {
    if (retryingTable.value) return;
    retryingTable.value = true;
    try {
      const res = await store.retryTable('fastest');
      submitOk.value = res.ok;
      submitMessage.value = res.ok ? `Thanks! ${sentence(res.message)}` : `Not sent: ${res.message}`;
    } finally {
      retryingTable.value = false;
    }
  }

  /** The name "Put my name on it" would put on the stored row, or '' when there is nothing to rename. */
  const nameToClaim = computed(() => store.nameToClaim(effectiveNickname.value));
  const claiming = ref(false);
  async function claim(): Promise<void> {
    const id = store.sentRecord?.id;
    if (!id || claiming.value) return;
    claiming.value = true;
    try {
      const res = await store.claimName(id, effectiveNickname.value);
      submitOk.value = res.ok;
      submitMessage.value = res.ok ? `Done: ${res.message}` : `Not renamed: ${res.message}`;
    } finally {
      claiming.value = false;
    }
  }

  /**
   * Already sent (automatically or by hand): a second send is only a duplicate row. Clicks made while
   * the page was frozen building the table arrive afterwards, and each one used to send another copy.
   * Returns true when the caller should go on and send.
   */
  function refuseDuplicate(): boolean {
    if (!store.alreadySubmitted) return false;
    submitOk.value = true;
    submitMessage.value = 'Already on the board: this result was sent from this browser.';
    return true;
  }

  // Once the player has said yes to sharing, work out the rechecks (their best earlier plans priced
  // again from this save), so the payload shows them before Submit is pressed.
  watch(
    () => optIn.value && store.bestDays > 0 && !store.isRunning,
    ready => {
      if (ready) void store.prepareRechecks();
    },
    { immediate: true }
  );

  return {
    submitMessage,
    submitOk,
    submitPartial,
    retryingTable,
    retryTable,
    nameToClaim,
    claiming,
    claim,
    refuseDuplicate,
  };
}

/**
 * By a date's send: the best route to Compare's Egg Day tab (an Egg Day deadline) or its By a date
 * tab. `best` and `result` are the answer on screen.
 */
export function useByDateShare(
  store: Store,
  identity: ShareIdentity,
  result: Ref<{ deadline: number; at: number } | null>,
  best: Ref<DeadlineRoute | null>
) {
  const { sendCsv, diagnosticsGo } = useShareExtras();
  const collectorConfigured = computed(() => store.leaderboardUrl.replace(/\/$/, '') !== '');
  const sharing = ref(false);
  const shareMessage = ref('');
  const shareOk = ref(true);
  /** Which answer was sent, so the button says so and a second click can't send it twice. */
  const resultKey = computed(() =>
    result.value && best.value ? `${result.value.deadline}|${result.value.at}|${best.value.chain.join(',')}` : ''
  );
  const sentKey = ref('');
  /** "Sent, but ..." -- the answer is in and its CSV is not. Amber, with Retry the table. */
  const sharePartial = computed(() => /\bbut\b/.test(shareMessage.value));
  const retryingTable = ref(false);
  async function retryTable(): Promise<void> {
    if (retryingTable.value) return;
    retryingTable.value = true;
    try {
      const res = await store.retryTable('deadline');
      shareOk.value = res.ok;
      shareMessage.value = res.ok ? `Thanks! ${sentence(res.message)}` : `Not sent: ${res.message}`;
    } finally {
      retryingTable.value = false;
    }
  }
  /** The leaderboard tab this answer goes on: Egg Day has its own. */
  const shareTab = computed(() => {
    const y = result.value ? eggDayYearOf(result.value.deadline) : null;
    return y ? `Egg Day ${y}` : 'By a date';
  });

  /** One send, worded for the status line: the store builds, remembers and sends it
   *  (stores/chainSearch.ts `sendDeadlineAnswer`), with the CSV streamed, never one big string. */
  async function sendWith(go: () => Promise<{ ok: boolean; message: string; duplicate?: 'exact' | 'result' }>) {
    if (!best.value || sharing.value) return;
    sharing.value = true;
    shareOk.value = true;
    shareMessage.value = '';
    try {
      const res = await go();
      shareOk.value = res.ok;
      if (res.ok) sentKey.value = resultKey.value;
      shareMessage.value = res.ok
        ? res.duplicate === 'exact'
          ? res.message
          : `Thanks! ${sentence(res.message)} It's on ${NAMES.compare}'s ${shareTab.value} tab.`
        : `Not sent: ${res.message}`;
    } finally {
      sharing.value = false;
    }
  }

  async function share(): Promise<void> {
    const route = best.value;
    if (!route) return;
    const name = identity.anonymous.value ? '' : identity.nickname.value.trim().slice(0, 40);
    await sendWith(() =>
      store.sendDeadlineAnswer({ route, nickname: name, sendCsv: sendCsv.value, diagnostics: diagnosticsGo.value })
    );
  }

  return {
    collectorConfigured,
    sharing,
    shareMessage,
    shareOk,
    sharePartial,
    retryingTable,
    retryTable,
    resultKey,
    sentKey,
    shareTab,
    share,
  };
}
