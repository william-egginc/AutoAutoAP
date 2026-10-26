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
  capName,
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

export { STUDY_NAME_MAX } from '@/lib/study';

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

/**
 * Two tabs (21 Oct 2026, prelive; Jordan: "one Yes is enough", across tabs, reloads and restarts). Every
 * action starts from the record as stored NOW, not as this tab read it when it loaded, and a `storage`
 * event from another tab replaces this tab's copy at once (so its box or strip goes without a reload).
 * Blocked storage: this tab's own copy stands.
 */
function fresh(): StudyRecord {
  try {
    if (storage) state.rec = parseStudy(storage.getItem(STUDY_KEY));
  } catch {
    // blocked: this visit's own record
  }
  return state.rec;
}

/** Another tab wrote `key` (a `storage` event). Exported for the specs. */
export function studyStorageEvent(key: string | null, newValue: string | null): void {
  if (key === STUDY_KEY) state.rec = parseStudy(newValue);
}
try {
  if (typeof window !== 'undefined')
    window.addEventListener('storage', e => {
      if (e.storageArea === null || e.storageArea === storage) studyStorageEvent(e.key, e.newValue);
    });
} catch {
  // no window events: one tab only
}

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
  const name = capName(nickname.trim()).trim();
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
  save(afterYes(fresh(), consentState.hash, Date.now(), ticks, given));
  state.thanked = true;
}

/**
 * No thanks: never asked again in this browser; no account's choices change.
 * Two tabs: a Yes already recorded (in any tab) wins. A box left open in a stale tab must not turn this
 * browser's yes into a no while the consents that yes set stay on (Setup would then say nothing is shared),
 * so the stored record is read first and No thanks is only written when there is no yes at that moment.
 * A stale tab's No thanks then just hides its box, and Setup shows the yes. Returns whether it was written.
 */
export function answerNo(): boolean {
  if (fresh().answer === 'yes') return false;
  save(afterNo(state.rec, Date.now()));
  return true;
}

/** The strip's "Yes, for this account": the browser's ticks, credited by this account's own name if any. */
export function useForThisAccount(): void {
  const id = consentState.account;
  if (!id || !consentState.hash) return;
  applyTicks(fresh().ticks);
  const credit = state.rec.credit === 'name' && useShareNameStore().anonymousFor(id) !== true ? 'name' : 'anon';
  applyCredit(id, credit, credit === 'name' ? knownName(id) : '');
  save(afterYes(state.rec, consentState.hash, state.rec.at || Date.now()));
}

/** The strip's "Not this account". */
export function notThisAccount(): void {
  save(afterNotThisAccount(fresh(), consentState.hash));
}

/** Withdraw (Setup): off for this account now, and for every other that said yes as it next loads. The
 *  CSV choice and the name are left as they are (neither sends anything by itself). */
export function withdrawStudy(): void {
  turnOff();
  save(afterWithdraw(fresh(), consentState.hash, Date.now()));
}

/** One tick changed in Setup: applied to the account on screen at once (a decision either way), and kept for
 *  the strip. */
export function setStudyTick(k: keyof StudyTicks, v: boolean): void {
  const ticks = { ...fresh().ticks, [k]: v };
  setConsent(TICK_CONSENT[k], v, true);
  if (k === 'diag') useShareExtras().sendDiagnostics.value = v;
  save({ ...state.rec, ticks });
}

/** The credit changed in Setup. */
export function setStudyCredit(credit: StudyCredit, nickname: string): void {
  const id = consentState.account;
  if (!id) return;
  const given = applyCredit(id, credit, nickname);
  save({ ...fresh(), credit: given });
}

/**
 * The account's answer read back from its choices saved online (stores/prefs.ts, newer than this browser's): the box
 * isn't asked again for it in a new browser or a private window. Nothing is sent and no consent is set here (the
 * caller sets the saved ticks with `applySavedConsent`). Yes: this browser's answer when it had none, else this
 * account's yes. No (or "later"): this browser's no when it had none; after a yes here, "not this account".
 */
export function applySavedStudy(
  hash: string,
  answer: 'yes' | 'no',
  at: number,
  ticks: Partial<StudyTicks> = {},
  credit?: StudyCredit
): void {
  if (!hash) return;
  const rec = fresh();
  if (answer === 'yes') {
    if (rec.answer === null) save(afterYes(rec, hash, at, { ...rec.ticks, ...ticks }, credit ?? rec.credit));
    else if (rec.accounts[hash] !== 'yes') save({ ...rec, accounts: { ...rec.accounts, [hash]: 'yes' } });
    return;
  }
  if (rec.answer === null) save({ ...rec, answer: 'no', at });
  else if (rec.answer === 'yes' && rec.accounts[hash] !== 'no') save({ ...rec, accounts: { ...rec.accounts, [hash]: 'no' } });
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
    save(afterWithdrawApplied(fresh(), consentState.hash));
  },
  { flush: 'sync', immediate: true }
);

/** For specs: a fresh state read from `st`. */
export function resetStudy(st: StorageLike | null = defaultStorage()): void {
  storage = st;
  state.rec = read();
  state.thanked = false;
}
