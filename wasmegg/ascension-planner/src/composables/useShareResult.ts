/**
 * The state behind "Share this result" (ShareResult.vue) and the Find and submit bar (FindBar.vue),
 * shared by the three search screens. Each screen used to carry its own copy of these lines, so a
 * fix (the nickname that must never fall back to the raw EID, the "Sent, but ..." amber, the double
 * click that sent twice) had to be made two or three times.
 *
 *  - `createShareIdentity` / `useShareIdentity`: the consent tick, anonymous-or-named, and the name
 *    box that follows the account's own name until the player types in it. The name and the
 *    anonymous-or-named choice are one per account across the site (stores/shareName.ts): picked in
 *    one screen, they are in the others, and remembered in this browser. The consent is the
 *    account's (useShareConsent.ts over composables/useConsent.ts: remembered per account with "Remember
 *    my choice", shown folded by ConsentBox.vue, Withdraw or unticking takes it back).
 *  - `useBoardSubmit`: the race-to-the-target send (Smart search and the Full sweep): the status
 *    message, Put my name on it, Retry the table, the rechecks worked out once consent is given,
 *    and the guard against sending a result twice. Each screen still says HOW it sends (`send`).
 *  - `useByDateShare`: the By a date send, to Compare's Egg Day or By a date tab.
 */
import { computed, ref, watch, type ComputedRef, type Ref, type WritableComputedRef } from 'vue';
import { useShareNameStore } from '@/stores/shareName';
import { useEidsStore } from 'lib';
import { sentence } from '@/utils/errors';
import { NAMES } from '@/lib/siteNav';
import { eggDayYearOf } from '@/lib/eggDay';
import { useShareConsent } from './useShareConsent';
import { useShareExtras } from './useShareExtras';
import type { useChainSearchStore } from '@/stores/chainSearch';
import type { DeadlineRoute } from '@/search/deadline';
import type { LightResult } from '@/search/lightResult';

type Store = ReturnType<typeof useChainSearchStore>;

export interface ShareIdentity {
  /** "Yes, share this result" / Find and submit's acknowledgement. */
  optIn: Ref<boolean>;
  /** Anonymous by default: crediting yourself should be a choice, not the fallback. Once picked, the
   *  account's choice on every screen (stores/shareName.ts). */
  anonymous: WritableComputedRef<boolean>;
  /** The "Credit me as" box. */
  nickname: WritableComputedRef<string>;
  /** The player typed in the name box: it stops following the account's name. Set it true after
   *  each keystroke (the boxes' `nicknameTyped`): what is in the box becomes the shared name. */
  nicknameTouched: WritableComputedRef<boolean>;
}

/** The account's shared name (stores/shareName.ts): undefined until one is typed. */
export interface SharedName {
  get(): string | undefined;
  set(name: string): void;
  /** Anonymous or "Credit me as", undefined until picked; without these, each identity keeps its own. */
  getAnonymous?(): boolean | undefined;
  setAnonymous?(v: boolean): void;
}

/**
 * The name box starts from the account's own name and follows it (the username arrives when a
 * backup finishes loading, which can be after the screen mounts) until a name is typed: in this box,
 * or in any other screen's, as they share it (`shared`; without one, this box's own).
 *
 * Writes before the player types (a carried-on run putting back the name it was started with) stay
 * this screen's alone; once typed here, what is in the box is the shared name.
 */
export function createShareIdentity(
  accountName: Ref<string>,
  shared?: SharedName,
  /** The acknowledgement; the real screens pass the account's (useShareConsent). */
  optIn: Ref<boolean> = ref(false)
): ShareIdentity {
  const ownAnonymous = ref<boolean | undefined>(undefined);
  const anonymous = computed<boolean>({
    get: () => (shared?.getAnonymous ? shared.getAnonymous() : ownAnonymous.value) ?? true,
    set: v => (shared?.setAnonymous ? shared.setAnonymous(v) : (ownAnonymous.value = v)),
  });
  const own = ref<string | undefined>(undefined);
  const name: SharedName = shared ?? { get: () => own.value, set: v => (own.value = v) };
  /** This screen's own name, set by code, until the player types. */
  const local = ref<string | null>(null);
  const typed = ref(false);
  const nickname = computed<string>({
    get: () => local.value ?? name.get() ?? accountName.value,
    set: v => {
      if (typed.value) {
        local.value = null;
        name.set(v);
      } else local.value = v;
    },
  });
  const nicknameTouched = computed<boolean>({
    get: () => typed.value || local.value !== null || name.get() !== undefined,
    set: v => {
      typed.value = v;
      if (v && local.value !== null) {
        name.set(local.value);
        local.value = null;
      }
    },
  });
  return { optIn, anonymous, nickname, nicknameTouched };
}

/** The account's shared "Credit me as" name (stores/shareName.ts), loaded from this browser. */
export function useSharedName(playerId: () => string): SharedName {
  const names = useShareNameStore();
  watch(playerId, id => void names.load(id), { immediate: true });
  return {
    get: () => names.nameFor(playerId()),
    set: v => names.setName(playerId(), v),
    getAnonymous: () => names.anonymousFor(playerId()),
    setAnonymous: v => names.setAnonymous(playerId(), v),
  };
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

/**
 * Every name this account may be credited as from another browser, for My runs' "looks like yours" (lib/myRuns.ts
 * `isMyRun`): the header's nickname AND the in-game username (a browser sends under `nickname || username`, and
 * the other browser may have no nickname, or another one). Blank ones dropped.
 */
export function useAccountNames(playerId: () => string): ComputedRef<string[]> {
  const eidsStore = useEidsStore();
  return computed(() => {
    const entry = eidsStore.eids.get(playerId().trim());
    return [entry?.nickname, entry?.username].filter((n): n is string => !!n?.trim());
  });
}

export function useShareIdentity(playerId: () => string): ShareIdentity {
  return createShareIdentity(useAccountName(playerId), useSharedName(playerId), useShareConsent());
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

export function useBoardSubmit(
  store: BoardStore,
  effectiveNickname: Ref<string>,
  optIn: Ref<boolean>,
  /** The yes now is a tick given this visit (composables/useConsent.ts `consentGivenThisVisit`): with the
   *  consent per account, a remembered yes arrives a moment after load, or with an account switch, and must
   *  not count as a tick. Left out: every change to true counts. */
  tickedNow: () => boolean = () => true
) {
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
  // again from this save), so the payload shows them before Submit is pressed. That reads the board
  // with this browser's code, so it waits for a yes given in this visit: a yes remembered from an
  // earlier visit (useShareConsent.ts) only skips the tick, and contacts nothing by itself. The send
  // works the rechecks out for itself when they are missing (`sendSubmission`).
  const tickedThisVisit = ref(false);
  watch(
    optIn,
    v => {
      if (v && tickedNow()) tickedThisVisit.value = true;
    },
    { flush: 'sync' }
  );
  watch(
    () => optIn.value && tickedThisVisit.value && tickedNow() && store.bestDays > 0 && !store.isRunning,
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
  async function sendWith(
    go: () => Promise<{
      ok: boolean;
      message: string;
      duplicate?: 'exact' | 'result';
      quarantined?: boolean;
      blocked?: boolean;
    }>
  ) {
    if (!best.value || sharing.value) return;
    sharing.value = true;
    shareOk.value = true;
    shareMessage.value = '';
    try {
      const res = await go();
      // Refused for the leaderboard but stored: counted as sent (not offered again), said with its code.
      shareOk.value = res.ok && !res.quarantined;
      if (res.ok) sentKey.value = resultKey.value;
      shareMessage.value = res.quarantined || res.blocked
        ? res.message
        : res.ok
        ? res.duplicate === 'exact'
          ? res.message
          : `Thanks! ${sentence(res.message)} It's on the ${NAMES.compare}'s ${shareTab.value} tab.`
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

/** The parts of the chain search store Light's send reads (stores/chainSearch.ts). */
