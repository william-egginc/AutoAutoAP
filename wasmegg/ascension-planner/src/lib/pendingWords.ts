/**
 * "STILL WORKING" LABELS (spec-dots, Jordan 1 Nov 2026: "all the parts that are searching have a simple '...' repeating
 * (like the searching...) so that the user knows that something is going on and it's not frozen"). A label shown while
 * something runs has its words typed and its dots DRAWN (components/auto/AnimatedDots.vue, CSS only, still with reduced
 * motion), never a typed "…" or "...".
 *
 * Most labels are template text (the words, then <AnimatedDots />). This is for the ones that arrive as a string from a
 * module that keeps its "…" for plain-text uses or that must not change: the search and plan modules are result-hash
 * inputs (lib/resultCodeHash.ts: an edit there recomputes every player's kept answers), and the store's statuses.
 * Their "…" stays in the string; the page draws it (components/auto/PendingText.vue). A words file: no result hash.
 */

/** A typed ellipsis at the very end: "…" or "...". */
const TRAILING = /(?:…|\.\.\.)$/;

/** The label's words without its typed trailing ellipsis, and whether it had one (then the dots are drawn). */
export function splitPending(text: string): { words: string; pending: boolean } {
  return TRAILING.test(text) ? { words: text.replace(TRAILING, ''), pending: true } : { words: text, pending: false };
}
