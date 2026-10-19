/**
 * The site's "ask before a big box starts" (search/bigBox.ts `confirmBigBoxFlow`): one question shown at
 * a time in BigBoxConfirm.vue, which App.vue mounts once. Every start that can launch an Exhaustive box
 * calls `confirmBigBox` first and starts nothing when it resolves false: Fastest's Find / Find and
 * submit (InsanePanel.vue `start`, which a sweep link's Start and a queue of boxes go through) and its
 * Widen and run again (`widenAndRun`), By a date's Exhaustive Find and its Widen and run again
 * (DeadlinePanel.vue `start`, `widenAndRun`), and a Science sweep run in place (SweepRunner.vue `start`).
 * A carry-on (Carry on, Resume, the automatic carry-on after Stepping away?) does not ask: its box was
 * asked about when it started, and the automatic one is for a player who is not there to answer.
 *
 * Module state rather than a store: one question at a time for the whole page, and nothing to keep.
 */
import { shallowRef } from 'vue';
import { confirmBigBoxFlow, type BigBoxInput, type BigBoxQuestion } from '@/search/bigBox';

/** The question on screen, null when none. */
export interface BigBoxAsk extends BigBoxQuestion {
  answer: (yes: boolean) => void;
}

/** Shallow: the question is compared by identity when answered (a deep ref would hand back a proxy). */
export const bigBoxAsk = shallowRef<BigBoxAsk | null>(null);

/** Dialogs mounted (BigBoxConfirm.vue): with none, a question falls back to the browser's own box
 *  rather than waiting for an answer nobody can give. */
let hosts = 0;
export function bigBoxHostMounted(): () => void {
  hosts++;
  return () => {
    hosts = Math.max(0, hosts - 1);
  };
}

/** One question: shown in the dialog, answered by its buttons (or Esc, which is no). A question asked
 *  while another is open answers the open one no first: two starts cannot both be waiting. */
export function askBigBox(q: BigBoxQuestion): Promise<boolean> {
  if (!hosts) {
    const confirmFn = typeof window !== 'undefined' ? window.confirm : undefined;
    return Promise.resolve(typeof confirmFn === 'function' ? !!confirmFn.call(window, q.text) : false);
  }
  bigBoxAsk.value?.answer(false);
  return new Promise(resolve => {
    const ask: BigBoxAsk = {
      ...q,
      answer: yes => {
        if (bigBoxAsk.value === ask) bigBoxAsk.value = null;
        resolve(yes);
      },
    };
    bigBoxAsk.value = ask;
  });
}

/** Whether to start a box of this size: true at once at or under 100,000 routes, else the player's
 *  answer to one or two questions. */
export function confirmBigBox(input: BigBoxInput): Promise<boolean> {
  return confirmBigBoxFlow(input, askBigBox);
}
