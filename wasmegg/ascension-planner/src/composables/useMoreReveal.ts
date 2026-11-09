/**
 * Opening a screen's More from the page (the simpler default page, 9 Nov 2026; components/layout/MoreFold.vue): the
 * search sits inside More, so whatever shows a search tab or scrolls to the search (a result's "See it", Check exactly,
 * a link to #/auto/fastest/full, My runs' Next step, a run starting, "Show search ›") asks here first. Not remembered as
 * the player's toggle. Kept out of lib/searchTab.ts on purpose: that file is a result code input (lib/resultCodeHash.ts
 * follows it from the search code), and this is page behaviour only.
 */
import { reactive } from 'vue';
import type { SearchTabScreen } from '@/lib/searchTab';

/** A count per screen; MoreFold opens each time its screen's count moves. */
export const moreReveals = reactive<Record<SearchTabScreen, number>>({ fastest: 0, 'by-date': 0 });

/** Open the screen's More (the search inside it is about to be shown). */
export function revealMore(screen: SearchTabScreen): void {
  moreReveals[screen]++;
}
