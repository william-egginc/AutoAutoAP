/**
 * What goes along with a shared result besides the summary: the player's CSV (default on) and the
 * black box diagnostics (default off). One set of choices per account: the same two boxes sit under
 * Find and submit and under Share this result, on all three screens, and move together.
 *
 *  - `sendCsv` is the account's `sendCsv` consent (composables/useConsent.ts), remembered per account.
 *    Unticking it is a choice worth keeping.
 *  - `sendDiagnostics` starts unticked on every visit (and for each account switched to), unless the
 *    player ticked "Tick this by default from now on" (`diagnosticsByDefault`, the account's
 *    `diagnosticsDefault`): then it starts ticked.
 *  - Diagnostics go as a private field of the submission body, not in the CSV (which is public), so
 *    they do not depend on the CSV box. `diagnosticsGo` is just `sendDiagnostics`.
 *  - Every send reads these as it goes (stores/chainSearch.ts), so unticking one stops it for the next
 *    send at once.
 */
import { computed, ref, watch, type Ref } from 'vue';
import { consentAgreed, consentState, setConsent } from './useConsent';

export interface ShareExtras {
  /** "Send my CSV too". */
  sendCsv: Ref<boolean>;
  /** "Also send diagnostics". */
  sendDiagnostics: Ref<boolean>;
  /** "Tick this by default from now on". */
  diagnosticsByDefault: Ref<boolean>;
  /** Diagnostics will really be sent (same as `sendDiagnostics`; kept for the screens that read it). */
  diagnosticsGo: Ref<boolean>;
}

export function createShareExtras(): ShareExtras {
  const sendCsv = computed({ get: () => consentAgreed('sendCsv'), set: v => setConsent('sendCsv', v, true) });
  const diagnosticsByDefault = computed({
    get: () => consentAgreed('diagnosticsDefault'),
    set: v => setConsent('diagnosticsDefault', v, true),
  });
  const sendDiagnostics = ref(diagnosticsByDefault.value);
  // Another account (or this one's records arriving): its own default, never the last account's tick.
  watch(
    () => [consentState.account, consentState.loaded] as const,
    () => (sendDiagnostics.value = diagnosticsByDefault.value),
    { flush: 'sync' }
  );
  return {
    sendCsv,
    sendDiagnostics,
    diagnosticsByDefault,
    diagnosticsGo: computed(() => sendDiagnostics.value),
  };
}

let shared: ShareExtras | null = null;
/** The site's one set of choices (created on first use). */
export function useShareExtras(): ShareExtras {
  return (shared ??= createShareExtras());
}
