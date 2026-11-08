/**
 * THE MASTER "SAVE ONLINE" SWITCH (Jordan, 7 Nov 2026, spec-syncclient-a): one tick in Setup › Sharing, per browser,
 * ON by default, so nothing changes for anyone until a player turns it off. Everything saved online under the
 * account's code obeys it: the followed routes (stores/follow.ts, /follow), Setup and sharing choices (stores/prefs.ts,
 * /prefs), the instant answers saved online (stores/answers.ts, /answers) and the synced records (lib/syncedRecords.ts,
 * /sync: the starting TE typed, later the Build-up tracker). OFF: none of them reads or writes anything; what is kept
 * in this browser keeps working. "Delete everything saved online for this account" (/forget) works either way, and
 * turns the switch off on this device afterwards (components/auto/SaveOnlineSetup.vue).
 *
 * THE GATE is one function, `cloudSubmitUrl`: each of those modules derives its endpoint from the chain-search store's
 * submit URL through it, and off it is '' (no collector), which every one of them already treats as "nothing online".
 * A reactive ref, so the stores' account watches (they watch the URL) read again when the switch comes back on.
 *
 * Its default is SAVE_ONLINE_DEFAULT, read in one place (`readSwitch`); saveOnline.spec.ts pins it. This browser's own
 * (localStorage SAVE_ONLINE_KEY, '1' / '0'; absent or unreadable: the default). Words: lib/syncWords.ts SAVE_ONLINE_*.
 */
import { ref, type Ref } from 'vue';

/** Save online starts ON (Jordan, 7 Nov 2026). One line to change. */
export const SAVE_ONLINE_DEFAULT = true;
/** Where this browser keeps the switch ('1' on, '0' off). */
export const SAVE_ONLINE_KEY = 'aap.saveOnline';

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The ONE place SAVE_ONLINE_DEFAULT is read. */
function readSwitch(): boolean {
  try {
    const v = storage()?.getItem(SAVE_ONLINE_KEY);
    return v === '1' ? true : v === '0' ? false : SAVE_ONLINE_DEFAULT;
  } catch {
    return SAVE_ONLINE_DEFAULT;
  }
}

let shared: Ref<boolean> | null = null;

/** The switch (Setup binds it). Writing it keeps it in this browser. */
export function saveOnlineSwitch(): Ref<boolean> {
  if (shared) return shared;
  const on = ref(readSwitch());
  // A setter, not a watch: a spec or a store reads the value back at once, and it holds with storage that throws.
  return (shared = {
    get value() {
      return on.value;
    },
    set value(v: boolean) {
      on.value = v;
      try {
        storage()?.setItem(SAVE_ONLINE_KEY, v ? '1' : '0');
      } catch {
        // this visit only
      }
    },
  } as Ref<boolean>);
}

/** Whether anything may be read from or written to the account's records saved online. Reactive. */
export function saveOnlineOn(): boolean {
  return saveOnlineSwitch().value;
}

export function setSaveOnline(on: boolean): void {
  saveOnlineSwitch().value = on;
}

/**
 * THE GATE: the submit URL a saved-online module derives /follow, /prefs, /answers or /sync from; '' while Save online
 * is off (or without a collector). Reading it inside a computed or a watch follows the switch.
 */
export function cloudSubmitUrl(submitUrl: string | null | undefined): string {
  return saveOnlineOn() ? (submitUrl ?? '').trim() : '';
}

/** Specs: read the switch from storage again (a new page load). */
export function resetSaveOnline(): void {
  shared = null;
}
