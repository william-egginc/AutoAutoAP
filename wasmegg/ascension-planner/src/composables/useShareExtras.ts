/**
 * What goes along with a shared result besides the summary: the player's CSV (default on) and the
 * black box diagnostics (default off). One set of choices for the whole site: the same two boxes sit
 * under Find and submit and under Share this result, on all three screens, and move together.
 *
 *  - `sendCsv` is remembered per browser (localStorage). Unticking it is a choice worth keeping.
 *  - `sendDiagnostics` starts unticked on every visit, unless the player ticked "Tick this by default
 *    from now on" (`diagnosticsByDefault`, remembered per browser): then it starts ticked.
 *  - Diagnostics go as a private field of the submission body, not in the CSV (which is public), so
 *    they do not depend on the CSV box. `diagnosticsGo` is just `sendDiagnostics`.
 *
 * Storage is wrapped in try/catch everywhere: private windows and blocked site data throw.
 */
import { computed, ref, watch, type Ref } from 'vue';

export const CSV_KEY = 'aap.share.sendCsv';
export const DIAGNOSTICS_DEFAULT_KEY = 'aap.share.diagnosticsByDefault';

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

function readFlag(st: StorageLike | null, key: string, fallback: boolean): boolean {
  try {
    const v = st?.getItem(key);
    return v === '1' ? true : v === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

function writeFlag(st: StorageLike | null, key: string, on: boolean): void {
  try {
    st?.setItem(key, on ? '1' : '0');
  } catch {
    /* remembered for this visit only */
  }
}

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

export function createShareExtras(storage: StorageLike | null = defaultStorage()): ShareExtras {
  const sendCsv = ref(readFlag(storage, CSV_KEY, true));
  const diagnosticsByDefault = ref(readFlag(storage, DIAGNOSTICS_DEFAULT_KEY, false));
  const sendDiagnostics = ref(diagnosticsByDefault.value);
  watch(sendCsv, v => writeFlag(storage, CSV_KEY, v), { flush: 'sync' });
  watch(diagnosticsByDefault, v => writeFlag(storage, DIAGNOSTICS_DEFAULT_KEY, v), { flush: 'sync' });
  return {
    sendCsv,
    sendDiagnostics,
    diagnosticsByDefault,
    diagnosticsGo: computed(() => sendDiagnostics.value),
  };
}

let shared: ShareExtras | null = null;
/** The site's one set of choices (created on first use, so each page load reads storage once). */
export function useShareExtras(): ShareExtras {
  return (shared ??= createShareExtras());
}
