/**
 * MY RUNS ONLY WITH SOMETHING TO SHOW (Jordan, 24 Oct 2026): the My runs tab (the top tab and the Auto Planner's
 * sub-tab, App.vue) is hidden until the account has a followed route, a saved answer or instant answer snapshot, a kept
 * Fast, Exact or Custom result, or a run on the board. With the first answer becoming the follow (lib/followPolicy.ts)
 * it shows as soon as any answer exists. Never hidden while a search runs, and a player on it when it goes is taken to
 * the Auto Planner (`myRunsTab`).
 *
 * Once the account had something, this browser remembers it (`aap-myruns-seen:<account hash>`, lib/accountHash.ts,
 * never the player ID): the tab doesn't go again when a day-old snapshot is dropped, and a board run seen on My runs
 * keeps it for the next visit (the board itself is only read on My runs; nothing is fetched to decide this).
 */
import { ref } from 'vue';

export const MY_RUNS_SEEN_PREFIX = 'aap-myruns-seen:';

/** Moved on whenever something My runs shows may have been kept (an instant answer saved, a result kept, a follow):
 *  composables/useMyRunsShown.ts looks again. */
export const myRunsBump = ref(0);
export function noteMyRuns(): void {
  myRunsBump.value++;
}

/** This browser has seen something on My runs for the account (its partition hash). */
export function readMyRunsSeen(partition: string): boolean {
  if (!partition) return false;
  try {
    return localStorage.getItem(MY_RUNS_SEEN_PREFIX + partition) === '1';
  } catch {
    return false;
  }
}

/** Remember that the account has something on My runs. */
export function writeMyRunsSeen(partition: string): void {
  if (!partition) return;
  try {
    localStorage.setItem(MY_RUNS_SEEN_PREFIX + partition, '1');
  } catch {
    // A private window: worked out again on the next visit.
  }
}

/** What the account has that My runs shows. */
export interface MyRunsHas {
  followed: boolean;
  /** A saved By a date answer or an instant answer snapshot of the account. */
  answers: boolean;
  /** A Fast, Exact or Custom result kept for Right now (lib/searchPlan.ts `KEPT_SEARCH_KEY`). */
  kept: boolean;
  /** A saved run (search/runLibrary.ts). */
  saved: boolean;
  /** Remembered: a board run seen on My runs, or anything earlier (`readMyRunsSeen`). */
  seen: boolean;
}

export function myRunsHasSomething(h: MyRunsHas): boolean {
  return h.followed || h.answers || h.kept || h.saved || h.seen;
}

/** Whether the account has something: 'unknown' until worked out for the account loaded (or with none). */
export type MyRunsContent = 'unknown' | 'some' | 'none';

/**
 * The tab: shown while a search runs, when the account has something, and while that is still being worked out for a
 * player already on it (a reload of #/myruns isn't sent away before the answer is in). `leave`: the player is on My
 * runs and it is hidden: App takes them to the Auto Planner.
 */
export function myRunsTab(o: { content: MyRunsContent; running: boolean; onIt: boolean }): { shown: boolean; leave: boolean } {
  const shown = o.running || o.content === 'some' || (o.content === 'unknown' && o.onIt);
  return { shown, leave: o.onIt && !shown };
}
