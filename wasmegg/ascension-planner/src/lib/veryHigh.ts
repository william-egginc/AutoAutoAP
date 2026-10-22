/**
 * Very high (the `thorough` level) as a tick box inside Exact, in the search panel (SearchPanel.vue,
 * StrongerBox.vue). Off since 22 Oct 2026: on the board it never found a faster route than Exact from
 * the same start (5 like-for-like pairs, 0 h gained, 3 to 10 times the work). Off, the box is not shown
 * and Exact says "For a full sweep, use Custom." in its place; a stored or linked `thorough` run still
 * opens, on Exact, with a note. Set this to true to bring the box back.
 */
export const SHOW_VERY_HIGH = false;
