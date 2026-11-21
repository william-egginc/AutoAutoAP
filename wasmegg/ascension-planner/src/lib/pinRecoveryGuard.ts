/**
 * A recovery code is held in memory only (composables/usePinAccount.ts `recovery`, cleared by `ackRecovery`), so a reload or a closed tab
 * before "I saved it" loses it for good. While one is waiting, the page asks before it unloads (R10 PIN card, QA 21 Nov 2026). Closing
 * Setup does not lose it: the account is the page's, and the card shows the step again when Setup reopens.
 * The flag is set by the PIN card (components/auto/PinCard.vue); the listener is installed once by App.vue.
 */
import { ref } from 'vue';

/** True while a recovery code is shown and not yet acknowledged. */
export const recoveryPending = ref(false);
export function setRecoveryPending(on: boolean): void {
  recoveryPending.value = on;
}

const INSTALLED = Symbol.for('aap.recoveryGuardInstalled');

/** Ask before unloading while a code is waiting. Once per window; returns the remover. Never throws. */
export function installRecoveryLeaveGuard(win: Window | undefined = typeof window === 'undefined' ? undefined : window): () => void {
  try {
    const w = win as (Window & { [INSTALLED]?: boolean }) | undefined;
    if (!w || w[INSTALLED]) return () => {};
    const handler = (e: BeforeUnloadEvent): void => {
      if (!recoveryPending.value) return;
      e.preventDefault();
      e.returnValue = '';
    };
    w.addEventListener('beforeunload', handler);
    w[INSTALLED] = true;
    return () => {
      w.removeEventListener('beforeunload', handler);
      w[INSTALLED] = false;
    };
  } catch {
    return () => {};
  }
}
