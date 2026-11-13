/**
 * The tips on the important buttons (components/Tip.vue; Allan, 9 Nov 2026, relayed by Jordan: the native `title`
 * tips were slow to appear and easy to miss). One place for their words, under stable names. Final (Words,
 * 11 Nov 2026): one line each, plain, no names the button already shows; Allan's two suggestions applied (notes/spec-allan2.md
 * lists old and new). Wording only (a *Words.ts file is out of the result code
 * hash, lib/resultCodeHash.ts `isWordingOnly`).
 */

/** "Follow this route" (FollowButton.vue). Was: "Right now (My runs) follows this route for <goal> instead of the
 *  checked one". Allan: "Set as active for My Runs" (written with the site's "My runs"). */
export const TIP_FOLLOW = 'Set as active for My runs';
/** The same button once pressed ("Following ✓"). Was: "Right now (My runs) follows this route for <goal>". */
export const TIP_FOLLOWING = 'Active for My runs';

/** "Simulate this plan" (the answer, its table rows, the result cards, More routes). Was lib/siteNav.ts
 *  SIMULATE_TITLE: "Opens this route in Single run (Joo's original planner) and simulates every shift on your save";
 *  Allan: cut "and simulates every shift on your save". */
export const TIP_SIMULATE = 'Opens this route in the Auto Planner';

/** The run button (FindBar.vue), named by the option picked. No title before; from the tour's words (firstTourWords). */
export const TIP_RUN_FAST = 'Checks routes near the instant answer. You can stop and keep the best.';
export const TIP_RUN_EXACT = 'Wider than Fast: also tries one more and one fewer ascension. Slower.';
export const TIP_RUN_CUSTOM = 'Tries every route in your boxes, so it proves the best one. Can take hours.';

/** The Search card's three choices (SearchPanel.vue). No title before; each card already says what it is for in a
 *  few words ("usually close to the best" ...): these say a little more. */
export const TIP_SEARCH_FAST = 'A quick check near the instant answer. Usually close to the best.';
export const TIP_SEARCH_EXACT = 'A slower, wider check, for a second opinion.';
export const TIP_SEARCH_CUSTOM = 'Every route in the boxes you set, to prove the best inside them.';

/** The small "i" beside a button on a touch screen: its name for a screen reader. `what` is the button's own words. */
export const tipInfoLabel = (what: string): string => `About ${what}`;
