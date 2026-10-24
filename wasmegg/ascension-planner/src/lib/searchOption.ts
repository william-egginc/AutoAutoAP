/**
 * The search panel's three options (SearchPanel.vue, 22 Oct 2026): Fast, Exact (with Very high as a tick
 * box inside it, lib/veryHigh.ts) and Custom, on Fastest and on By a date. Only the page groups them this
 * way: the levels underneath, in links, storage, CSVs and the board, are unchanged (quick / normal /
 * thorough, and Custom is the Exhaustive search: `boxes`). Fast and Exact are Nearby routes (the
 * `nearby` tab of lib/searchTab.ts); Custom is Exhaustive (the `exhaustive` tab).
 *
 * The player's last choice is remembered per screen in this browser (`aap.searchOption.fastest`,
 * `aap.searchOption.by-date`); before the first pick, Fast.
 */
import type { SearchTabId, SearchTabScreen } from './searchTab';
import { SHOW_VERY_HIGH } from './veryHigh';

export type SearchOption = 'fast' | 'exact' | 'custom';
export const SEARCH_OPTIONS: readonly SearchOption[] = ['fast', 'exact', 'custom'];
export const DEFAULT_SEARCH_OPTION: SearchOption = 'fast';

/** A Nearby routes level (stores/stronger.ts `StrongerLevel` without Light, which is no longer picked). */
export type NearbyLevel = 'quick' | 'normal' | 'thorough';
/** The effort value an option stands for, as links, storage, CSVs and the board say it. */
export type OptionEffort = NearbyLevel | 'boxes';

/** What the player picked on one screen: the option, and Very high's tick box (Exact only). */
export interface SearchChoice {
  option: SearchOption;
  veryHigh: boolean;
}
export const DEFAULT_CHOICE: SearchChoice = { option: DEFAULT_SEARCH_OPTION, veryHigh: false };

/** The effort an option runs at: Fast quick, Exact normal (thorough with Very high), Custom boxes. */
export function effortFor(c: SearchChoice): OptionEffort {
  if (c.option === 'custom') return 'boxes';
  if (c.option === 'exact') return c.veryHigh && SHOW_VERY_HIGH ? 'thorough' : 'normal';
  return 'quick';
}

/** The Nearby routes level of an option, or null for Custom. */
export function levelFor(c: SearchChoice): NearbyLevel | null {
  const e = effortFor(c);
  return e === 'boxes' ? null : e;
}

/** The option a level or effort shows under: Light and quick on Fast, normal and thorough on Exact,
 *  Exhaustive (`boxes`, `full`, `exhaustive`) on Custom. Very high's box is ticked for thorough. */
export function choiceForEffort(e: string | null | undefined): SearchChoice {
  if (e === 'normal' || e === 'balanced') return { option: 'exact', veryHigh: false };
  if (e === 'thorough') return { option: 'exact', veryHigh: true };
  if (e === 'boxes' || e === 'full' || e === 'exhaustive') return { option: 'custom', veryHigh: false };
  return { option: 'fast', veryHigh: false };
}

/** The tab (lib/searchTab.ts) an option lives in. */
export const tabForOption = (o: SearchOption): SearchTabId => (o === 'custom' ? 'exhaustive' : 'nearby');

export const searchOptionKey = (screen: SearchTabScreen): string => `aap.searchOption.${screen}`;

/** The stored word for a choice: fast, exact, veryhigh or custom. */
const word = (c: SearchChoice): string => (c.option === 'exact' && c.veryHigh ? 'veryhigh' : c.option);

/** The choice remembered on this screen, else Fast. Very high comes back as plain Exact while its box is
 *  switched off (lib/veryHigh.ts). */
export function readChoice(screen: SearchTabScreen): SearchChoice {
  try {
    const v = globalThis.localStorage?.getItem(searchOptionKey(screen));
    if (v === 'fast' || v === 'exact' || v === 'custom') return { option: v, veryHigh: false };
    if (v === 'veryhigh') return { option: 'exact', veryHigh: SHOW_VERY_HIGH };
  } catch {
    /* nothing remembered */
  }
  return { ...DEFAULT_CHOICE };
}

/** Remember a player's pick on this screen (this browser; quietly this visit only if storage fails). */
export function rememberChoice(screen: SearchTabScreen, c: SearchChoice): void {
  try {
    globalThis.localStorage?.setItem(searchOptionKey(screen), word(c));
  } catch {
    /* this visit only */
  }
}

/** A choice to open on next time the screen's panel opens, instead of the remembered one (My runs' Next
 *  step, App.vue `openFromMyRuns`); used once, and not remembered. */
const pending: Partial<Record<SearchTabScreen, SearchChoice>> = {};
export function openOn(screen: SearchTabScreen, c: SearchChoice): void {
  pending[screen] = c;
}
export function takeOpenOn(screen: SearchTabScreen): SearchChoice | null {
  const c = pending[screen] ?? null;
  delete pending[screen];
  return c;
}
