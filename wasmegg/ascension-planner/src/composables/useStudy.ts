/**
 * "Help improve the planner" (lib/study.ts says what it is): the live state behind the box above the tabs
 * (components/StudyBox.vue) and its Setup section (components/auto/StudySetup.vue).
 *
 *  - The answer is per browser, under `aap.study`; the consents it sets are the account's own, written
 *    only through `setConsent` (composables/useConsent.ts), and the credit only through the account's
 *    "Credit me as" (stores/shareName.ts). So everything the share buttons already show (the folded
 *    ConsentBox line, Withdraw there) follows at once.
 *  - Yes is remembered for the account (`remember` on, `at` now). The per-visit "Also send diagnostics"
 *    tick (useShareExtras.ts) is seeded from its default only as an account loads, so Yes sets it too.
 *  - A withdraw owed by an account (withdrawn while another account was on screen) is done as it loads.
 *  - Module level, like useConsent.ts: no Pinia for the record. The credit needs the shareName store, so
 *    the actions that set it must run with Pinia active (they do, from the screens).
 *  - Storage in try/catch: blocked, the answer holds for this visit.
 */
import { computed, reactive, readonly, watch } from 'vue';
import { consentAgreed, consentState, setConsent, type ConsentId, type StorageLike } from './useConsent';
import { useShareExtras } from './useShareExtras';
import { useAccountName } from './useShareResult';
import { useShareNameStore } from '@/stores/shareName';
import {
  STUDY_KEY,
  WITHDRAW_CONSENTS,
  accountStep,
  afterNo,
  afterNotThisAccount,
  afterWithdraw,
  afterWithdrawApplied,
  afterYes,
  consentsFor,
  emptyStudy,
  parseStudy,
  storedStudy,
  type StudyCredit,
  type StudyRecord,
  type StudyTicks,
} from '@/lib/study';

/** The consent behind each tick. */
export const TICK_CONSENT: Record<keyof StudyTicks, ConsentId> = {
  share: 'leaderboard',
  csv: 'sendCsv',
  diag: 'diagnosticsDefault',
  checks: 'keepSharingChecks',
};

/** The collector keeps 40 characters of a name. */
export const STUDY_NAME_MAX = 40;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let storage: StorageLike | null = defaultStorage();
function read(): StudyRecord {
  try {
    return parseStudy(storage?.getItem(STUDY_KEY) ?? null);
  } catch {
    return emptyStudy();
  }
}

const state = reactive<{ rec: StudyRecord; thanked: boolean }>({ rec: read(), thanked: false });

/** The record and whether Yes was pressed this visit, read only. */
export const studyState = readonly(state);

function save(rec: StudyRecord): void {
  state.rec = rec;
  try {
    storage?.setItem(STUDY_KEY, storedStudy(rec));
  } catch {
    // for this visit only
  }
}

/** What the account on screen needs (lib/study.ts `accountStep`), once its consents are in. */
export const studyStep = computed(() =>
  consentState.account && consentState.loaded && consentState.hash ? accountStep(state.rec, consentState.hash) : 'none'
);

/** The name the account would be credited as with nothing more typed: its "Credit me as" name, else the
 *  name in the header's ID box (never the player ID: useShareResult.ts `useAccountName`). '' for none. */
export function knownName(playerId: string): string {
  const typed = useShareNameStore().nameFor(playerId);
  return (typed ?? useAccountName(() => playerId).value).trim();
}

/** The credit the box opens with: anonymous unless the account has a name and hasn't picked anonymous. */
export function defaultCredit(playerId: string): StudyCredit {
  if (useShareNameStore().anonymousFor(playerId) === true) return 'anon';
  return knownName(playerId) ? 'name' : 'anon';
}

function applyCredit(playerId: string, credit: StudyCredit, nickname: string): StudyCredit {
  const names = useShareNameStore();
  const name = nickname.trim().slice(0, STUDY_NAME_MAX);
  if (credit === 'name' && name) {
    names.setAnonymous(playerId, false);
    if (name !== knownName(playerId)) names.setName(playerId, name);
    return 'name';
  }
  // No name known: anonymous, whatever was asked (a name is never made up).
  names.setAnonymous(playerId, true);
  return 'anon';
}

/**
 * Yes writes every choice (Jordan, 21 Oct 2026, final): a ticked one as a yes, an unticked one as a no, all
 * remembered. Turned on later in Setup if wanted.
 */
function applyTicks(ticks: StudyTicks): void {
  for (const [id, v] of consentsFor(ticks)) setConsent(id, v, true);
  useShareExtras().sendDiagnostics.value = ticks.diag;
}

function turnOff(): void {
  for (const id of WITHDRAW_CONSENTS) if (consentAgreed(id)) setConsent(id, false, true);
  useShareExtras().sendDiagnostics.value = false;
}

/** Yes (the box, or Answer now in Setup): the ticks and the credit for the account on screen. */
export function answerYes(ticks: StudyTicks, credit: StudyCredit, nickname: string): void {
  const id = consentState.account;
  if (!id || !consentState.hash) return;
  applyTicks(ticks);
  const given = applyCredit(id, credit, nickname);
  save(afterYes(state.rec, consentState.hash, Date.now(), ticks, given));
  state.thanked = true;
}

/** No thanks: never asked again in this browser; no account's choices change. */
export function answerNo(): void {
  save(afterNo(state.rec, Date.now()));
}

/** The strip's "Yes, for this account": the browser's ticks, credited by this account's own name if any. */
export function useForThisAccount(): void {
  const id = consentState.account;
  if (!id || !consentState.hash) return;
  applyTicks(state.rec.ticks);
  const credit = state.rec.credit === 'name' && useShareNameStore().anonymousFor(id) !== true ? 'name' : 'anon';
  applyCredit(id, credit, credit === 'name' ? knownName(id) : '');
  save(afterYes(state.rec, consentState.hash, state.rec.at || Date.now()));
}

/** The strip's "Not this account". */
export function notThisAccount(): void {
  save(afterNotThisAccount(state.rec, consentState.hash));
}

/** Withdraw (Setup): off for this account now, and for every other that said yes as it next loads. The
 *  CSV choice and the name are left as they are (neither sends anything by itself). */
export function withdrawStudy(): void {
  turnOff();
  save(afterWithdraw(state.rec, consentState.hash, Date.now()));
}

/** One tick changed in Setup: applied to the account on screen at once (a decision either way), and kept for
 *  the strip. */
export function setStudyTick(k: keyof StudyTicks, v: boolean): void {
  const ticks = { ...state.rec.ticks, [k]: v };
  setConsent(TICK_CONSENT[k], v, true);
  if (k === 'diag') useShareExtras().sendDiagnostics.value = v;
  save({ ...state.rec, ticks });
}

/** The credit changed in Setup. */
export function setStudyCredit(credit: StudyCredit, nickname: string): void {
  const id = consentState.account;
  if (!id) return;
  save({ ...state.rec, credit: applyCredit(id, credit, nickname) });
}

/** The "Thank you" line closed. */
export function closeThanks(): void {
  state.thanked = false;
}

// A withdraw owed by the account just loaded: done before anything can send.
watch(
  () => studyStep.value,
  step => {
    if (step !== 'withdraw') return;
    turnOff();
    save(afterWithdrawApplied(state.rec, consentState.hash));
  },
  { flush: 'sync', immediate: true }
);

/** For specs: a fresh state read from `st`. */
export function resetStudy(st: StorageLike | null = defaultStorage()): void {
  storage = st;
  state.rec = read();
  state.thanked = false;
}
