/**
 * The share box's one-time re-ask (R10, 24 Nov 2026, Jordan) before the gear fields are sent (search/gearRecordSend.ts,
 * which reads the `shareGearDetail` consent itself; off until chosen).
 *
 * A player who ticked the share box before these fields existed has no `shareGearDetail` record (`at` 0): they are asked
 * once more (`gearReaskNeeded`). A yes or a no is kept, so the question is not asked twice; a no keeps the box ticked and
 * the fields off. Ticking the box from now on answers both (composables/useInstantShare.ts), the box saying what is sent.
 */
import { consentAgreed, consentRecord, setConsent } from '@/composables/useConsent';

/** Ticked, and never asked about the gear fields. */
export function gearReaskNeeded(): boolean {
  return consentAgreed('keepSharingChecks') && consentRecord('shareGearDetail').at === 0;
}

export const agreeGearDetail = (): void => setConsent('shareGearDetail', true);
export const declineGearDetail = (): void => setConsent('shareGearDetail', false);
