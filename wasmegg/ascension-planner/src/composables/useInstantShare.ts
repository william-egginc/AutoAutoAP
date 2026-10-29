/**
 * "Share my search results" (was "Keep sharing my checks" until 23 Oct 2026): the opt-in for instant answer
 * records (search/instantRecord.ts), OFF by default. With it ticked, every Fast, Exact or Custom result found in
 * the visit sends one record beside the instant answer; without it, the player can still tick "Share this result"
 * for one result, at the bottom of the search panel.
 *
 * The account's `keepSharingChecks` consent (composables/useConsent.ts): remembered per account, not
 * per browser. The box under a search's result (InstantShareCheck.vue) and the mirror in Your setup ›
 * Sharing are the same consent. A result reads it as it lands, so a withdraw stops the next send.
 */
import { computed, type WritableComputedRef } from 'vue';
import { consentAgreed, setConsent } from './useConsent';

export interface InstantShare {
  /** Ticked: each search result found in the visit sends one record. */
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
