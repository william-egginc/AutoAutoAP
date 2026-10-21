/**
 * "Help improve the planner" (composables/useStudy.ts): Yes sets the account's existing consents and nothing
 * more, only for the account on screen; another account waits for the strip; No changes nothing; Withdraw
 * turns sharing off (the CSV choice left alone) here now and on the other accounts as they load.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { hashID } from '@/lib/storage/db';
import { STUDY_KEY, DEFAULT_TICKS, parseStudy } from '@/lib/study';
import {
  consentAgreed,
  consentGivenThisVisit,
  consentKey,
  consentRemembered,
  consentWithdrawals,
  parseConsents,
  resetConsents,
  setConsent,
  setConsentAccount,
} from './useConsent';
import { useShareExtras } from './useShareExtras';
import { useShareNameStore } from '@/stores/shareName';
import {
  answerNo,
  answerYes,
  defaultCredit,
  notThisAccount,
  resetStudy,
  setStudyCredit,
  setStudyTick,
  studyState,
  studyStep,
  tickStatus,
  useForThisAccount,
  withdrawStudy,
} from './useStudy';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}
let st: ReturnType<typeof mem>;
const storedFor = async (id: string) => parseConsents(st.map.get(consentKey(await hashID(id))) ?? null);
const SHARING = ['leaderboard', 'sendCsv', 'diagnosticsDefault', 'keepSharingChecks'] as const;

beforeEach(() => {
  setActivePinia(createPinia());
  st = mem();
  resetConsents(st);
  resetStudy(st);
});

describe('the box', () => {
  it('asks once an account is in, and not before', async () => {
    expect(studyStep.value).toBe('none');
    await setConsentAccount(A);
    expect(studyStep.value).toBe('ask-box');
  });

  it('Yes sets exactly the four consents, remembered, for this account only, and this visit’s diagnostics', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    for (const id of SHARING) {
      expect(consentAgreed(id)).toBe(true);
      expect(consentRemembered(id)).toBe(true);
    }
    expect(consentGivenThisVisit('leaderboard')).toBe(true);
    expect(useShareExtras().sendDiagnostics.value).toBe(true);
    for (const id of ['carryOn', 'watchTab', 'watchPhone', 'autoSend', 'scienceSweep'] as const)
      expect(consentAgreed(id)).toBe(false);
    const kept = await storedFor(A);
    expect(Object.keys(kept).sort()).toEqual([...SHARING].sort());
    expect(studyStep.value).toBe('none');
    expect(studyState.rec.answer).toBe('yes');
    expect(studyState.thanked).toBe(true);
  });

  it('an unticked box stays undecided: nothing written for it, and an earlier yes or no is kept', async () => {
    await setConsentAccount(A);
    setConsent('keepSharingChecks', false); // an earlier explicit no
    setConsent('diagnosticsDefault', true); // an earlier explicit yes
    const before = await storedFor(A);
    answerYes({ share: true, csv: false, diag: false, checks: false }, 'anon', '');
    const after = await storedFor(A);
    expect(after.leaderboard?.agreed).toBe(true);
    // Never chosen: still no record (the site's own default applies), so Setup says not decided.
    expect(after.sendCsv).toBeUndefined();
    expect(tickStatus('csv')).toBe('undecided');
    // Chosen before: exactly as it was.
    expect(after.keepSharingChecks).toEqual(before.keepSharingChecks);
    expect(after.diagnosticsDefault).toEqual(before.diagnosticsDefault);
    expect(tickStatus('checks')).toBe('off');
    expect(tickStatus('diag')).toBe('on');
    expect(tickStatus('share')).toBe('on');
    // Ticked later in Setup: a yes then.
    setStudyTick('csv', true);
    expect(tickStatus('csv')).toBe('on');
  });

  it('the strip offers the first account’s ticks; the rest stay undecided for the new account', async () => {
    await setConsentAccount(A);
    answerYes({ share: true, csv: true, diag: false, checks: false }, 'anon', '');
    await setConsentAccount(B);
    useForThisAccount();
    expect(tickStatus('share')).toBe('on');
    expect(tickStatus('csv')).toBe('on');
    expect(tickStatus('diag')).toBe('undecided');
    expect(tickStatus('checks')).toBe('undecided');
    expect(useShareExtras().sendDiagnostics.value).toBe(false);
  });

  it('a second account gets nothing until "Yes, for this account"', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS, checks: false }, 'anon', '');
    await setConsentAccount(B);
    expect(studyStep.value).toBe('ask-strip');
    for (const id of SHARING) expect(consentAgreed(id)).toBe(id === 'sendCsv'); // the CSV's own default
    expect(await storedFor(B)).toEqual({});
    useForThisAccount();
    expect(consentAgreed('leaderboard')).toBe(true);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect(studyStep.value).toBe('none');
  });

  it('"Not this account" sets nothing and stops asking it', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    await setConsentAccount(B);
    notThisAccount();
    expect(studyStep.value).toBe('none');
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(await storedFor(B)).toEqual({});
  });

  it('No thanks changes nothing, keeps an agreement given under a share button, and never asks again', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    const before = await storedFor(A);
    answerNo();
    expect(await storedFor(A)).toEqual(before);
    expect(consentAgreed('leaderboard')).toBe(true);
    expect(studyStep.value).toBe('none');
    await setConsentAccount(B);
    expect(studyStep.value).toBe('none');
    resetStudy(st);
    expect(studyState.rec.answer).toBe('no');
  });
});

describe('withdraw', () => {
  it('turns sharing off now (a withdraw the sends see), leaves the CSV, and the other accounts as they load', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    await setConsentAccount(B);
    useForThisAccount();
    const was = consentWithdrawals('leaderboard');
    withdrawStudy();
    expect(consentWithdrawals('leaderboard')).toBe(was + 1);
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(consentAgreed('diagnosticsDefault')).toBe(false);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect(useShareExtras().sendDiagnostics.value).toBe(false);
    expect(consentAgreed('sendCsv')).toBe(true);
    expect(studyState.rec.answer).toBe('withdrawn');
    // A: still yes in storage until it loads; then turned off, once.
    expect((await storedFor(A)).leaderboard?.agreed).toBe(true);
    await setConsentAccount(A);
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect((await storedFor(A)).leaderboard?.agreed).toBe(false);
    expect(studyState.rec.accounts).toEqual({});
    expect(studyStep.value).toBe('none');
  });
});

describe('Setup changes', () => {
  it('a tick applies to the account at once and is kept for the strip', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    setStudyTick('checks', false);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    setStudyTick('diag', false);
    expect(useShareExtras().sendDiagnostics.value).toBe(false);
    expect(studyState.rec.ticks).toEqual({ share: true, csv: true, diag: false, checks: false });
  });

  it('credit: a name typed is the account’s "Credit me as"; with no name it stays anonymous', async () => {
    await setConsentAccount(A);
    const names = useShareNameStore();
    expect(defaultCredit(A)).toBe('anon');
    answerYes({ ...DEFAULT_TICKS }, 'name', '   ');
    expect(names.anonymousFor(A)).toBe(true);
    expect(studyState.rec.credit).toBe('anon');
    setStudyCredit('name', 'Williamthe5thc');
    expect(names.anonymousFor(A)).toBe(false);
    expect(names.nameFor(A)).toBe('Williamthe5thc');
    expect(studyState.rec.credit).toBe('name');
    expect(defaultCredit(A)).toBe('name');
  });

  it('the strip credits a new account only by its own name, anonymous when it has none', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'name', 'Williamthe5thc');
    await setConsentAccount(B);
    useForThisAccount();
    const names = useShareNameStore();
    expect(names.anonymousFor(B)).toBe(true);
    expect(names.nameFor(B)).toBeUndefined();
  });
});

describe('storage', () => {
  it('keeps no player ID and no name', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'name', 'Williamthe5thc');
    const raw = st.map.get(STUDY_KEY) ?? '';
    expect(raw).not.toMatch(/EI\d{16}/);
    expect(raw).not.toContain('Williamthe5thc');
    expect(parseStudy(raw).accounts).toEqual({ [await hashID(A)]: 'yes' });
  });

  it('blocked storage does not throw; the answer holds for this visit', async () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    resetConsents(blocked);
    resetStudy(blocked);
    await setConsentAccount(A);
    expect(studyStep.value).toBe('ask-box');
    expect(() => answerYes({ ...DEFAULT_TICKS }, 'anon', '')).not.toThrow();
    expect(studyStep.value).toBe('none');
    expect(consentAgreed('leaderboard')).toBe(true);
  });
});
