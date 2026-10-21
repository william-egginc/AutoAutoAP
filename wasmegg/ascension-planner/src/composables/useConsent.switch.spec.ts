/**
 * An account switch inside one visit (the header's Load, or a saved-account pill: App.vue's `watch(playerId)` calls
 * `setConsentAccount`): every share gate reads the account on screen NOW, never the last one. The sends read these
 * as they go (stores/chainSearch.ts: `useShareExtras().sendCsv/sendDiagnostics`, `consentDeclined('leaderboard')`;
 * useFastestShare.ts: `consentGivenThisVisit('leaderboard')`; InstantRoute.vue: `useInstantShare().on`), so a
 * send made for B reads B's consent.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  consentAgreed,
  consentDeclined,
  consentGivenThisVisit,
  consentState,
  resetConsents,
  setConsent,
  setConsentAccount,
} from './useConsent';
import { useShareConsent } from './useShareConsent';
import { useShareExtras } from './useShareExtras';
import { useInstantShare } from './useInstantShare';
import { answerYes, resetStudy, studyStep } from './useStudy';
import { DEFAULT_TICKS } from '@/lib/study';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';

function mem() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** Every gate a send reads, as it reads it. */
const gates = () => ({
  leaderboard: useShareConsent().value,
  givenThisVisit: consentGivenThisVisit('leaderboard'),
  declined: consentDeclined('leaderboard'),
  csv: useShareExtras().sendCsv.value,
  diagnostics: useShareExtras().sendDiagnostics.value,
  checks: useInstantShare().on.value,
});
const NOTHING = {
  leaderboard: false,
  givenThisVisit: false,
  declined: false,
  csv: true,
  diagnostics: false,
  checks: false,
};

beforeEach(() => {
  setActivePinia(createPinia());
  const st = mem();
  resetConsents(st);
  resetStudy(st);
});

describe('an account switch inside one visit', () => {
  it('A agreed to everything; B, loaded next, has nothing agreed in any gate', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    expect(gates()).toEqual({ ...NOTHING, leaderboard: true, givenThisVisit: true, diagnostics: true, checks: true });
    await setConsentAccount(B);
    expect(consentState.account).toBe(B);
    expect(gates()).toEqual(NOTHING);
    expect(studyStep.value).toBe('ask-strip');
  });

  it('nothing is agreed while B’s records are still loading (no window where A’s yes shows for B)', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    const loading = setConsentAccount(B);
    // The switch has begun; B's hash and stored records are not in yet.
    expect(consentState.account).toBe(B);
    expect(consentState.hash).toBe('');
    expect(gates()).toEqual(NOTHING);
    expect(studyStep.value).toBe('none');
    await loading;
    expect(gates()).toEqual(NOTHING);
  });

  it('B’s own no stops B’s sends, and A’s yes is back, unchanged, when A is loaded again', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    setConsent('keepSharingChecks', true);
    await setConsentAccount(B);
    setConsent('leaderboard', false);
    expect(consentDeclined('leaderboard')).toBe(true);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    await setConsentAccount(A);
    expect(consentAgreed('leaderboard')).toBe(true);
    expect(consentDeclined('leaderboard')).toBe(false);
    expect(useInstantShare().on.value).toBe(true);
    await setConsentAccount(B);
    expect(consentDeclined('leaderboard')).toBe(true);
    expect(useInstantShare().on.value).toBe(false);
  });

  it('B, which agreed on its own, sends with B’s choices (its CSV off), not A’s', async () => {
    await setConsentAccount(B);
    setConsent('leaderboard', true);
    setConsent('sendCsv', false);
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    expect(useShareExtras().sendCsv.value).toBe(true);
    await setConsentAccount(B);
    expect(useShareConsent().value).toBe(true);
    expect(useShareExtras().sendCsv.value).toBe(false);
    expect(useShareExtras().sendDiagnostics.value).toBe(false);
    expect(useInstantShare().on.value).toBe(false);
  });
});

describe('wiring', () => {
  it('App.vue re-keys the consents on every account load (the header’s Load and the saved-account pills both set playerId)', () => {
    const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
    expect(app).toContain('watch(playerId, id => void setConsentAccount(id), { immediate: true });');
    expect(app).toMatch(/async function submitPlayerId\(id: string\) \{\n {2}playerId\.value = id;/);
  });
});
