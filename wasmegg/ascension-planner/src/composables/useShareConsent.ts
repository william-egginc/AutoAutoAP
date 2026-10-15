/**
 * The acknowledgement behind Find and submit and Share this result ("I acknowledge the following: I
 * want to share my run on the leaderboard ..."): the account's `leaderboard` consent
 * (composables/useConsent.ts), remembered per account once ticked with "Remember my choice" on (the
 * user, 12 Oct: ticking it every run was a chore; Jordan, 15 Oct: per account, not per browser). It used
 * to start unticked on every visit (FindBar.vue says why: a pre-ticked box let the board lookup that waits
 * for consent run on arrival). That is still true, so a remembered yes is shown, not hidden: the box
 * (ConsentBox.vue) folds it to one line that names what will go (CSV, diagnostics, name) with Change, and
 * Withdraw (or unticking) takes it back and stops what was armed on it (stores/chainSearch.ts
 * `withdrawShareConsent`).
 */
import { computed, type WritableComputedRef } from 'vue';
import { consentAgreed, setConsent } from './useConsent';

let shared: WritableComputedRef<boolean> | null = null;
/** The account's acknowledgement, live: reads and writes the account's `leaderboard` consent. */
export function useShareConsent(): WritableComputedRef<boolean> {
  return (shared ??= computed({
    get: () => consentAgreed('leaderboard'),
    set: v => setConsent('leaderboard', v),
  }));
}
