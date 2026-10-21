/**
 * WHICH OPTIONAL TABS SHOW (Jordan, 21 Oct 2026): the Leaderboard and Science tabs are off by default and
 * turned on per browser in Setup › How the site shows things (TabsToggle.vue). Manual Planner, Auto Planner and
 * My runs always show.
 *
 * Stored in localStorage under `aap.tabs` as {"leaderboard":boolean,"science":boolean}; anything missing or
 * unreadable is false. Storage is wrapped in try/catch: private windows and blocked site data throw.
 *
 * Both tabs need the collector: the Leaderboard reads the board, and Science's What we need to check and Submit
 * a sweep read and send to it. A build with no collector (no VITE_SUBMIT_URL) never shows either, whatever is
 * stored, and the boxes in Setup are greyed out.
 *
 * A LINK STILL OPENS A HIDDEN TAB, FOR THAT VISIT (decided 21 Oct 2026): an address that asks for one
 * (#/compare/..., #/science/..., a shared link, a link inside the page such as "How it works ›", or a button such
 * as Right now's "When should I start?") shows that tab until the page is reloaded, without storing anything. A
 * player sent a link expects it to open; turning the box off in Setup takes the tab away again at once.
 */
import { computed, reactive, ref, type ComputedRef } from 'vue';

export const TABS_KEY = 'aap.tabs';

export interface TabPrefs {
  leaderboard: boolean;
  science: boolean;
}
export type OptionalTab = keyof TabPrefs;

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** What this browser stored, or both off. Never throws. */
export function readTabPrefs(storage: StorageLike | null = defaultStorage()): TabPrefs {
  try {
    const raw = storage?.getItem(TABS_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<TabPrefs> | null) : null;
    return { leaderboard: v?.leaderboard === true, science: v?.science === true };
  } catch {
    return { leaderboard: false, science: false };
  }
}

/** Store both choices. Never throws (the choice still holds for this visit). */
export function writeTabPrefs(p: TabPrefs, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(TABS_KEY, JSON.stringify({ leaderboard: p.leaderboard, science: p.science }));
  } catch {
    // Blocked site data: kept for this visit only.
  }
}

/** This browser's choices, shared by App.vue and the boxes in Setup. */
const prefs = ref<TabPrefs>(readTabPrefs());
/** Tabs an address or a link asked for this visit (never stored). */
const visit = reactive<TabPrefs>({ leaderboard: false, science: false });

/** Turn one tab on or off in this browser. Off also ends a link's "for this visit". */
export function setTabPref(tab: OptionalTab, on: boolean): void {
  prefs.value = { ...prefs.value, [tab]: on };
  if (!on) visit[tab] = false;
  writeTabPrefs(prefs.value);
}

/** The optional tab a site section is, or null for the ones that always show. */
export function optionalTabOf(section: string): OptionalTab | null {
  return section === 'compare' ? 'leaderboard' : section === 'science' ? 'science' : null;
}

/** An address or a link asked for this section: its tab shows for the rest of this visit. */
export function allowForVisit(section: string): void {
  const t = optionalTabOf(section);
  if (t) visit[t] = true;
}

/** Whether each optional tab shows: a collector, and the box ticked or a link this visit. */
export function tabsShownWith(collector: boolean, p: TabPrefs, v: TabPrefs): TabPrefs {
  return {
    leaderboard: collector && (p.leaderboard || v.leaderboard),
    science: collector && (p.science || v.science),
  };
}

export function useTabPrefs(collector: () => boolean): {
  prefs: typeof prefs;
  shown: ComputedRef<TabPrefs>;
} {
  return { prefs, shown: computed(() => tabsShownWith(collector(), prefs.value, visit)) };
}

/** For specs: forget the visit's links and read storage again. */
export function resetTabPrefsForTest(storage?: StorageLike | null): void {
  prefs.value = readTabPrefs(storage === undefined ? defaultStorage() : storage);
  visit.leaderboard = false;
  visit.science = false;
}
