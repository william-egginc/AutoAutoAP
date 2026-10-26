/**
 * The tick under Run Fast / Run Exact / Run Custom (FindBar.vue; Jordan's glossary answer Q2, 25 Oct 2026): "Send the
 * result to the Leaderboard when it finishes". It replaced the second button, Find and submit: ticked, Run is what
 * Find and submit was (the run sends its result when it finishes); unticked, it only finds (for debugging and
 * testing). What gets sent, and when, is unchanged.
 *
 * Before the player touches it, it is on for a player who said yes to sharing (the account's `leaderboard` consent,
 * the same one "Sharing: on" reads) and off otherwise. The player's own tick or untick is remembered in this browser
 * and wins from then on, but it only sends with sharing on: with sharing off it starts unticked, and ticking it (or
 * pressing Run with it ticked) opens Before you send instead of starting.
 */
import { ref } from 'vue';

export const RUN_SENDS_KEY = 'aap.runSends';

function read(): boolean | null {
  try {
    const v = globalThis.localStorage?.getItem(RUN_SENDS_KEY);
    if (v === '1' || v === '0') return v === '1';
  } catch {
    /* nothing remembered */
  }
  return null;
}

/** The player's own last tick or untick in this browser, or null if never. Shared by every Run on the page. */
export const runSendsChoice = ref<boolean | null>(read());

/** Remember the player's tick or untick (this browser; this visit only if storage fails). Never throws. */
export function rememberRunSends(on: boolean): void {
  runSendsChoice.value = on;
  try {
    globalThis.localStorage?.setItem(RUN_SENDS_KEY, on ? '1' : '0');
  } catch {
    /* this visit only */
  }
}

/** Whether the tick shows ticked, given sharing: never with sharing off; else the player's own choice, or on. */
export function runSendsTicked(sharing: boolean, choice: boolean | null = runSendsChoice.value): boolean {
  return sharing && (choice ?? true);
}

/** For specs: read storage again. */
export function reloadRunSends(): void {
  runSendsChoice.value = read();
}
