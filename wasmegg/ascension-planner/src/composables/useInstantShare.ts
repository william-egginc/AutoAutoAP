/**
 * "Keep sharing my checks": the opt-in for instant answer records (search/instantRecord.ts), OFF by
 * default. With it ticked, every finished Check exactly sends one record; without it, the player can
 * still tick "Share this check" for one check, on the instant answer.
 *
 * The account's `keepSharingChecks` consent (composables/useConsent.ts): remembered per account, not
 * per browser. The box under the instant answer (InstantShareCheck.vue) and the mirror in Your setup ›
 * Sharing are the same consent. A check reads it as it finishes, so a withdraw stops the next send.
 */
import { computed, type WritableComputedRef } from 'vue';
import { consentAgreed, setConsent } from './useConsent';

export interface InstantShare {
  /** Ticked: each finished Check exactly sends one record. */
  on: WritableComputedRef<boolean>;
}

export function createInstantShare(): InstantShare {
  return {
    on: computed({ get: () => consentAgreed('keepSharingChecks'), set: v => setConsent('keepSharingChecks', v) }),
  };
}

let shared: InstantShare | null = null;
/** The account's one choice (created on first use). */
export function useInstantShare(): InstantShare {
  return (shared ??= createInstantShare());
}
