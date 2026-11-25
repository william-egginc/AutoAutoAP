/**
 * `shareTableUse` (R10.1, 25 Nov 2026): the "which table answered" ping's consent. ON until the player says no, per
 * account, a stored No stays off, Withdraw turns it off (and only the ping: nothing else follows it). Placeholder IDs only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { WITHDRAW_CONSENTS, WITHDRAW_TURNS_OFF } from '@/lib/study';
import { consentAgreed, consentRecord, resetConsents, setConsent, setConsentAccount, CONSENT_DEFAULTS, type StorageLike } from './useConsent';
import { answerNo, answerYes, resetStudy, withdrawStudy } from './useStudy';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } satisfies StorageLike;
}
let st: StorageLike;
beforeEach(() => {
  setActivePinia(createPinia());
  st = mem();
  resetConsents(st);
  resetStudy(st);
});

describe('shareTableUse', () => {
  it('is on by default, remembered, with nothing chosen yet', async () => {
    expect(CONSENT_DEFAULTS.shareTableUse).toEqual({ agreed: true, remember: true });
    await setConsentAccount(A);
    expect(consentAgreed('shareTableUse')).toBe(true);
    expect(consentRecord('shareTableUse').at).toBe(0);
  });

  it('a No is stored for the account, stays off after a reload, and another account is not touched', async () => {
    await setConsentAccount(A);
    setConsent('shareTableUse', false);
    expect(consentAgreed('shareTableUse')).toBe(false);
    resetConsents(st);
    await setConsentAccount(A);
    expect(consentAgreed('shareTableUse')).toBe(false);
    await setConsentAccount(B);
    expect(consentAgreed('shareTableUse')).toBe(true);
  });

  it('Withdraw turns it off, but it is not one of the choices that make Withdraw appear', async () => {
    expect(WITHDRAW_TURNS_OFF).toContain('shareTableUse');
    expect(WITHDRAW_CONSENTS).not.toContain('shareTableUse');
    await setConsentAccount(A);
    answerYes({ share: false, csv: false, diag: false, checks: true }, 'anon', '');
    expect(consentAgreed('shareTableUse')).toBe(true);
    withdrawStudy();
    expect(consentAgreed('shareTableUse')).toBe(false);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
  });

  it('is independent of the two share ticks: on with both off, and unticking them leaves it', async () => {
    await setConsentAccount(A);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect(consentAgreed('shareGearDetail')).toBe(false);
    expect(consentAgreed('shareTableUse')).toBe(true);
    setConsent('keepSharingChecks', true);
    setConsent('keepSharingChecks', false);
    expect(consentAgreed('shareTableUse')).toBe(true);
  });

  it('No thanks on the first-visit banner is that No: it turns this account\u2019s ping off, and the other choices are untouched', async () => {
    await setConsentAccount(A);
    expect(answerNo()).toBe(true);
    expect(consentAgreed('shareTableUse')).toBe(false);
    expect(consentRecord('shareTableUse').at).toBeGreaterThan(0);
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect(consentAgreed('sendCsv')).toBe(true);
    resetConsents(st);
    await setConsentAccount(A);
    expect(consentAgreed('shareTableUse')).toBe(false);
  });

  it('a stale tab’s No thanks after a Yes changes nothing (the yes wins, as before)', async () => {
    await setConsentAccount(A);
    answerYes({ share: false, csv: false, diag: false, checks: true }, 'anon', '');
    expect(answerNo()).toBe(false);
    expect(consentAgreed('shareTableUse')).toBe(true);
  });

  it('No thanks with no account on screen yet writes no consent', () => {
    expect(answerNo()).toBe(true);
    expect(consentAgreed('shareTableUse')).toBe(true);
  });
});
