/**
 * The acknowledgement behind Find and submit and Share this result ("I acknowledge the following: I
 * want to share my run on the leaderboard ..."), remembered in this browser once ticked (the user,
 * 12 Oct: ticking it every run was a chore). It used to start unticked on every visit (FindBar.vue
 * says why: a pre-ticked box let the board lookup that waits for consent run on arrival). That is
 * still true, so a remembered yes is shown, not hidden: FindBar folds it to one line that names what
 * will go (CSV, diagnostics, name) with Change, and unticking withdraws it.
 *
 * One flag for the whole site, like useShareExtras. Storage is wrapped in try/catch everywhere:
 * private windows and blocked site data throw, and the yes then lasts for this visit only.
 */
import { ref, watch, type Ref } from 'vue';

export const CONSENT_KEY = 'aap.share.agreed';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createShareConsent(storage: StorageLike | null = defaultStorage()): Ref<boolean> {
  let initial = false;
  try {
    initial = storage?.getItem(CONSENT_KEY) === '1';
  } catch {
    /* unticked */
  }
  const agreed = ref(initial);
  watch(
    agreed,
    v => {
      try {
        storage?.setItem(CONSENT_KEY, v ? '1' : '0');
      } catch {
        /* remembered for this visit only */
      }
    },
    { flush: 'sync' }
  );
  return agreed;
}

let shared: Ref<boolean> | null = null;
/** The site's one acknowledgement (created on first use, so each page load reads storage once). */
export function useShareConsent(): Ref<boolean> {
  return (shared ??= createShareConsent());
}
