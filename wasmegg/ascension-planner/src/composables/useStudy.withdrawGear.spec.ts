/**
 * Withdraw from "Help improve the planner" (R10, 25 Nov 2026) also turns the gear fields off: after a re-ask Yes
 * (`shareGearDetail`), a Withdraw leaves it off, so a later "Share this result" for one result sends none of them.
 * Placeholder ID only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { WITHDRAW_CONSENTS } from '@/lib/study';
import { agreeGearDetail, gearReaskNeeded } from '@/lib/gearDetailConsent';
import { gearDetailOf } from '@/search/gearRecordSend';
import { consentAgreed, resetConsents, setConsentAccount, type StorageLike } from './useConsent';
import { answerYes, resetStudy, withdrawStudy } from './useStudy';

const A = 'EI1234567890123456';
function mem(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) };
}
const kept = { delivery: 'T4L-T4L-T4L-T4L', earnings: 'T4L-T4L-T4E-T3L', deliveryStones: 'Qu5-Ta5-Te1', earningsStones: 'Lu3', noTable: false };

beforeEach(() => {
  setActivePinia(createPinia());
  const st = mem();
  resetConsents(st);
  resetStudy(st);
});

describe('Withdraw and the gear fields', () => {
  it('the withdraw list names shareGearDetail', () => {
    expect(WITHDRAW_CONSENTS).toContain('shareGearDetail');
  });

  it('after a re-ask Yes, Withdraw leaves shareGearDetail off and a later one-result share sends no gear fields', async () => {
    await setConsentAccount(A);
    answerYes({ share: false, csv: false, diag: false, checks: true }, 'anon', '');
    expect(gearReaskNeeded()).toBe(true);
    agreeGearDetail();
    expect(consentAgreed('shareGearDetail')).toBe(true);
    withdrawStudy();
    expect(consentAgreed('keepSharingChecks')).toBe(false);
    expect(consentAgreed('shareGearDetail')).toBe(false);
    expect(gearDetailOf({ answer: 'gear', deliveryUsed: 'T4L-T4L-T4L-T4L', kept }, consentAgreed('shareGearDetail'))).toEqual({
      answer: 'gear',
    });
  });
});
