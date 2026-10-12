/**
 * The "Stronger check" box under the instant answer (StrongerBox.vue; the user, 12 Oct 2026): how
 * much stronger, and what the parts of the page publish for the comparison block (SearchCompare.vue).
 *
 * LEVELS, the same bar on Fastest and By a date. Light: the stronger check alone (your earlier routes
 * priced on this save, and by a date one TE lower), after Check exactly. Fast / Exact / Very high: Light
 * plus a search of the routes near the instant answer's: on Fastest at that effort (store `effort`), by
 * a date with wider boxes at each level (search/simpleByDate.ts BY_DATE_LEVELS). Remembered in this
 * browser.
 */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type StrongerLevel = 'light' | 'quick' | 'normal' | 'thorough';
const KEY = 'aap-stronger-level';
const LEVELS: StrongerLevel[] = ['light', 'quick', 'normal', 'thorough'];

function read(): StrongerLevel {
  try {
    const v = localStorage.getItem(KEY);
    // By a date's one search level ('around', 12 Oct morning) is Fast now: both screens share the bar.
    if (v === 'around') return 'quick';
    return v && (LEVELS as string[]).includes(v) ? (v as StrongerLevel) : 'light';
  } catch {
    return 'light';
  }
}

/** What a level would cost on this computer: `short` under its name on the bar, `line` as How long. */
export interface LevelEstimate {
  short: string;
  line: string;
}

/** A route as the comparison block shows it: where it ends and when. */
export interface CompareRoute {
  chain: number[];
  /** Unix second the target (Fastest) or the last stop (By a date) is reached. */
  end: number;
  /** TE at the end (By a date's headline). */
  endTE: number;
  /** By a date: seconds to spare before the date. */
  spare?: number;
  /** Simulated on the player's account (not the instant answer's table). */
  exact?: boolean;
  /** When this result was found, ms (searches). */
  at?: number;
}

export const useStrongerStore = defineStore('stronger', () => {
  const level = ref<StrongerLevel>(read());
  watch(level, v => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* this visit only */
    }
  });
  /** The stronger check's own best that beats the instant answer ("Best now"), per goal. */
  const strongerBest = ref<{ fastest: CompareRoute | null; date: CompareRoute | null }>({ fastest: null, date: null });
  /** The instant answer's lead route, per goal (InstantRoute.vue). */
  const instant = ref<{ fastest: CompareRoute | null; date: CompareRoute | null }>({ fastest: null, date: null });
  /** The routes the stronger check priced from the player's own history (for "start from a different route"). */
  const earlierChains = ref<number[][]>([]);
  /** Each search's last answer in this visit (SearchCompare.vue keeps them), so a later run of the
   *  other search doesn't wipe the comparison: Fastest's Smart search ('smart') and Full sweep ('full'),
   *  By a date's routes around the answer ('around') and boxes ('boxes'). */
  const lastSearch = ref<Record<'smart' | 'full' | 'around' | 'boxes', (CompareRoute & { running?: boolean }) | null>>({
    smart: null,
    full: null,
    around: null,
    boxes: null,
  });
  return { level, strongerBest, instant, earlierChains, lastSearch };
});
