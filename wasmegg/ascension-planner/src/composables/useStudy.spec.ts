/**
 * "Help improve the planner" (composables/useStudy.ts): Yes sets the account's existing consents and nothing
 * more, only for the account on screen; another account waits for the strip; No changes nothing; Withdraw
 * turns sharing off (the CSV choice left alone) here now and on the other accounts as they load.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { hashID } from '@/lib/storage/db';
import { STUDY_KEY, afterNo, afterYes, emptyStudy, parseStudy, storedStudy } from '@/lib/study';
import {
  consentAgreed,
  consentDeclined,
  consentGivenThisVisit,
  consentKey,
  consentRemembered,
  consentWithdrawals,
  consentStorageEvent,
  parseConsents,
  resetConsents,
  storedConsents,
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
  studyStorageEvent,
  useForThisAccount,
  withdrawStudy,
} from './useStudy';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
const ALL_ON = { share: true, csv: true, diag: true, checks: true }; // every tick (the box now opens with none)

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
    answerYes({ ...ALL_ON }, 'anon', '');
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

  it('an unticked box is recorded off (a remembered no), even over an earlier yes; ticked later in Setup it is on', async () => {
    await setConsentAccount(A);
    setConsent('diagnosticsDefault', true); // an earlier yes, unticked in the box now
    answerYes({ share: true, csv: false, diag: false, checks: false }, 'anon', '');
    const kept = await storedFor(A);
    expect(Object.keys(kept).sort()).toEqual([...SHARING].sort());
    expect(kept.leaderboard?.agreed).toBe(true);
    for (const id of ['sendCsv', 'diagnosticsDefault', 'keepSharingChecks'] as const) {
      expect(kept[id]?.agreed).toBe(false);
      expect(kept[id]?.remember).toBe(true);
      expect(consentDeclined(id)).toBe(true);
    }
    expect(useShareExtras().sendDiagnostics.value).toBe(false);
    setStudyTick('csv', true);
    expect(consentAgreed('sendCsv')).toBe(true);
  });

  it('the strip offers the first account’s choices as they were, and writes all four (on and off) for the new one', async () => {
    await setConsentAccount(A);
    answerYes({ share: true, csv: true, diag: false, checks: false }, 'anon', '');
    await setConsentAccount(B);
    expect(await storedFor(B)).toEqual({});
    useForThisAccount();
    const kept = await storedFor(B);
    expect(Object.keys(kept).sort()).toEqual([...SHARING].sort());
    expect([
      kept.leaderboard?.agreed,
      kept.sendCsv?.agreed,
      kept.diagnosticsDefault?.agreed,
      kept.keepSharingChecks?.agreed,
    ]).toEqual([true, true, false, false]);
    expect(useShareExtras().sendDiagnostics.value).toBe(false);
    expect(studyStep.value).toBe('none');
  });

  it('a second account gets nothing until "Yes, for this account"', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON, checks: false }, 'anon', '');
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
    answerYes({ ...ALL_ON }, 'anon', '');
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
    answerYes({ ...ALL_ON }, 'anon', '');
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
    answerYes({ ...ALL_ON }, 'anon', '');
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
    answerYes({ ...ALL_ON }, 'name', '   ');
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
    answerYes({ ...ALL_ON }, 'name', 'Williamthe5thc');
    await setConsentAccount(B);
    useForThisAccount();
    const names = useShareNameStore();
    expect(names.anonymousFor(B)).toBe(true);
    expect(names.nameFor(B)).toBeUndefined();
  });
});

describe('a pasted long name (QA, 22 Oct 2026)', () => {
  it('is saved at 40 from the box, the strip and Setup', async () => {
    await setConsentAccount(A);
    const names = useShareNameStore();
    answerYes({ ...ALL_ON }, 'name', 'x'.repeat(500));
    expect(names.nameFor(A)).toBe('x'.repeat(40));
    setStudyCredit('name', 'y'.repeat(500));
    expect(names.nameFor(A)).toBe('y'.repeat(40));
    // The strip credits another account by its own name, capped the same way.
    names.setName(B, 'z'.repeat(500));
    await setConsentAccount(B);
    useForThisAccount();
    expect(names.nameFor(B)).toBe('z'.repeat(40));
  });
});

describe('storage', () => {
  it('keeps no player ID and no name', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'name', 'Williamthe5thc');
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
    expect(() => answerYes({ ...ALL_ON }, 'anon', '')).not.toThrow();
    expect(studyStep.value).toBe('none');
    expect(consentAgreed('leaderboard')).toBe(true);
  });
});

/**
 * Two tabs of one browser (21 Oct 2026, prelive; Jordan: "one Yes is enough", across tabs, reloads and
 * restarts). The "other tab" here writes straight to storage, as it would, and this tab gets the `storage`
 * event (or, for a stale tab, does not).
 */
describe('two tabs', () => {
  const ALL_FOUR_ON = async (at: number) =>
    storedConsents(Object.fromEntries(SHARING.map(id => [id, { agreed: true, remember: true, at }])));

  /** What tab 1's Yes for A leaves in storage. */
  async function otherTabYes(): Promise<void> {
    const h = await hashID(A);
    st.map.set(consentKey(h), await ALL_FOUR_ON(Date.now()));
    st.map.set(STUDY_KEY, storedStudy(afterYes(emptyStudy(), h, Date.now(), { ...ALL_ON }, 'anon')));
  }

  it('a stale tab’s No thanks never replaces a Yes already given in another tab', async () => {
    await setConsentAccount(A);
    expect(studyStep.value).toBe('ask-box'); // this tab's box, still open
    await otherTabYes(); // tab 1 says yes; this tab missed the event
    expect(answerNo()).toBe(false);
    expect(parseStudy(st.map.get(STUDY_KEY) ?? null).answer).toBe('yes');
    expect(studyState.rec.answer).toBe('yes');
    expect(studyStep.value).toBe('none'); // the box goes
    // After a reload the record still says yes, so Setup shows the yes with its live consents.
    resetStudy(st);
    expect(studyState.rec.answer).toBe('yes');
    expect(studyState.rec.accounts[await hashID(A)]).toBe('yes');
  });

  it('No thanks is still written when no tab has said yes', async () => {
    await setConsentAccount(A);
    expect(answerNo()).toBe(true);
    expect(parseStudy(st.map.get(STUDY_KEY) ?? null).answer).toBe('no');
  });

  it('a Yes in another tab hides this tab’s box live, and its consents show here at once (no reload)', async () => {
    await setConsentAccount(A);
    expect(studyStep.value).toBe('ask-box');
    await otherTabYes();
    const h = await hashID(A);
    consentStorageEvent(consentKey(h), st.map.get(consentKey(h)) ?? null);
    studyStorageEvent(STUDY_KEY, st.map.get(STUDY_KEY) ?? null);
    expect(studyStep.value).toBe('none');
    expect(studyState.thanked).toBe(false); // the thank-you is the other tab's
    for (const id of SHARING) expect(consentAgreed(id)).toBe(true);
  });

  it('a No thanks in another tab hides this tab’s box live too', async () => {
    await setConsentAccount(A);
    studyStorageEvent(STUDY_KEY, storedStudy(afterNo(emptyStudy(), Date.now())));
    expect(studyStep.value).toBe('none');
    expect(studyState.rec.answer).toBe('no');
  });

  it('a Yes in another tab for another account: this tab’s box becomes the strip', async () => {
    await setConsentAccount(B);
    await otherTabYes();
    studyStorageEvent(STUDY_KEY, st.map.get(STUDY_KEY) ?? null);
    expect(studyStep.value).toBe('ask-strip');
  });

  it('events for other keys, or another account’s consents, change nothing here', async () => {
    await setConsentAccount(A);
    studyStorageEvent('aap.other', storedStudy(afterNo(emptyStudy(), 1)));
    expect(studyStep.value).toBe('ask-box');
    consentStorageEvent(consentKey(await hashID(B)), await ALL_FOUR_ON(Date.now()));
    expect(consentAgreed('leaderboard')).toBe(false);
  });

  it('a withdraw in another tab stops sends here at once (counted as a withdraw)', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'anon', '');
    const was = consentWithdrawals('keepSharingChecks');
    const h = await hashID(A);
    const later = Date.now() + 1000;
    const theirs = storedConsents({
      ...parseConsents(st.map.get(consentKey(h)) ?? null),
      keepSharingChecks: { agreed: false, remember: true, at: later },
    });
    consentStorageEvent(consentKey(h), theirs);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect(consentWithdrawals('keepSharingChecks')).toBe(was + 1);
    expect(consentAgreed('leaderboard')).toBe(true);
  });

  it('a stale tab’s save keeps the other tab’s newer choice on another box (re-read before writing)', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'anon', '');
    const h = await hashID(A);
    // Tab 1 turns checks off later; this tab misses the event, then changes the CSV.
    st.map.set(
      consentKey(h),
      storedConsents({
        ...parseConsents(st.map.get(consentKey(h)) ?? null),
        keepSharingChecks: { agreed: false, remember: true, at: Date.now() + 1000 },
      })
    );
    setConsent('sendCsv', false);
    const kept = await storedFor(A);
    expect(kept.keepSharingChecks?.agreed).toBe(false);
    expect(kept.sendCsv?.agreed).toBe(false);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
  });

  it('the credit choice changed in another tab is this tab’s at once', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'anon', '');
    const theirs = storedStudy({ ...parseStudy(st.map.get(STUDY_KEY) ?? null), credit: 'name' });
    studyStorageEvent(STUDY_KEY, theirs);
    expect(studyState.rec.credit).toBe('name');
  });

  it('listens for storage events from other tabs', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['./useStudy.ts', './useConsent.ts'])
      expect(readFileSync(new URL(f, import.meta.url), 'utf8')).toMatch(/window\.addEventListener\('storage'/);
  });
});
