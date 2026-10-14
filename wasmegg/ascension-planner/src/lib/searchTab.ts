/**
 * Which of the two search tabs is shown on Fastest and on By a date (SearchTabs.vue; Allan, 14 Oct 2026:
 * "too many boxes, use one at a time"): "Search nearby" (the Stronger check level bar and Nearby routes,
 * the default) or "Exhaustive" (every route in boxes you set).
 *
 * Both tabs stay mounted and the hidden one is only `display: none`, so a run, its watchers, its
 * teleport targets (#bd-around-*, #bd-exh-*) and its progress block (lib/runAnchor.ts) all live on.
 * But a hidden element has no layout: nothing can scroll to it. Every "go there" (the progress bar's
 * Jump to it, Check exactly, Open in Exhaustive, a share link) switches to the right tab first, through
 * the helpers here. The selection lives in this module (not in the component) so App.vue can switch it.
 *
 * Remembered per screen in this browser (`aap.searchTab.fastest`, `aap.searchTab.by-date`). A run that
 * starts or is going when the screen opens shows its own tab without changing what is remembered.
 */
import { reactive } from 'vue';
import type { RunAnchorKind } from './runAnchor';

export type SearchTabScreen = 'fastest' | 'by-date';
export type SearchTabId = 'nearby' | 'exhaustive';
export const SEARCH_TAB_IDS: readonly SearchTabId[] = ['nearby', 'exhaustive'];
export const DEFAULT_SEARCH_TAB: SearchTabId = 'nearby';

export const searchTabKey = (screen: SearchTabScreen): string => `aap.searchTab.${screen}`;

/** The CollapsibleSection keys of the two sections the tabs replaced: nothing reads them any more. */
const RETIRED_KEYS = ['aap-section-hidden-stronger', 'aap-section-hidden-exhaustive'];

function read(screen: SearchTabScreen): SearchTabId {
  try {
    const v = globalThis.localStorage?.getItem(searchTabKey(screen));
    return v === 'exhaustive' || v === 'nearby' ? v : DEFAULT_SEARCH_TAB;
  } catch {
    return DEFAULT_SEARCH_TAB;
  }
}

/** The tab shown on each screen. */
export const searchTabs = reactive<Record<SearchTabScreen, SearchTabId>>({
  fastest: read('fastest'),
  'by-date': read('by-date'),
});

/** Read the remembered tabs again (a test's storage fake, or storage that became readable). */
export function loadSearchTabs(): void {
  searchTabs.fastest = read('fastest');
  searchTabs['by-date'] = read('by-date');
  try {
    for (const k of RETIRED_KEYS) globalThis.localStorage?.removeItem?.(k);
  } catch {
    /* nothing to tidy */
  }
}
loadSearchTabs();

/** Show `tab` on `screen`; `remember` (a player's click) keeps it for the next visit. */
export function selectSearchTab(screen: SearchTabScreen, tab: SearchTabId, remember = false): void {
  searchTabs[screen] = tab;
  if (!remember) return;
  try {
    globalThis.localStorage?.setItem(searchTabKey(screen), tab);
  } catch {
    /* this visit only */
  }
}

/** The tab a run of this kind shows in: Fastest's Nearby routes ('smart') or Exhaustive ('full');
 *  By a date's by the run's own flag (store `deadlineRunSimple`: Nearby routes when set). */
export function tabForRun(
  kind: RunAnchorKind,
  deadlineRunSimple: boolean
): { screen: SearchTabScreen; tab: SearchTabId } {
  if (kind === 'by-date') return { screen: 'by-date', tab: deadlineRunSimple ? 'nearby' : 'exhaustive' };
  return { screen: 'fastest', tab: kind === 'smart' ? 'nearby' : 'exhaustive' };
}

/** Before scrolling to a run: show the tab it runs in (not remembered). */
export function revealRunTab(kind: RunAnchorKind, deadlineRunSimple: boolean): void {
  const { screen, tab } = tabForRun(kind, deadlineRunSimple);
  selectSearchTab(screen, tab);
}

/** What `revealElement` needs from an element (a real one, or a test's stand-in). */
interface MaybeInTab {
  closest?: (selector: string) => { getAttribute(name: string): string | null } | null;
}

/** The tab an element sits in, from its panel's data attributes, or null outside the tabs. */
export function tabOfElement(el: unknown): { screen: SearchTabScreen; tab: SearchTabId } | null {
  const closest = (el as MaybeInTab | null)?.closest;
  if (typeof closest !== 'function') return null;
  const panel = closest.call(el, '[data-search-tab-panel]');
  if (!panel) return null;
  const screen = panel.getAttribute('data-screen');
  const tab = panel.getAttribute('data-tab');
  if ((screen !== 'fastest' && screen !== 'by-date') || (tab !== 'nearby' && tab !== 'exhaustive')) return null;
  return { screen, tab };
}

/** Show the tab an element sits in; true when it switched one. */
export function revealElement(el: unknown): boolean {
  const t = tabOfElement(el);
  if (!t || searchTabs[t.screen] === t.tab) return false;
  selectSearchTab(t.screen, t.tab);
  return true;
}

/**
 * Scroll to the element with this id that is laid out. Both tabs are on the page, so an id used in
 * each (Share this result's `share-this-result`) matches twice, and the first may be the hidden one.
 */
export function scrollToShownId(id: string, block: ScrollLogicalPosition = 'start'): boolean {
  if (typeof document === 'undefined') return false;
  const all = [...document.querySelectorAll(`[id="${id}"]`)];
  const el = all.find(e => e.getClientRects().length > 0);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block });
  return true;
}
