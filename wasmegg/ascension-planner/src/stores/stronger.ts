/**
 * The "Stronger check" box under the instant answer (StrongerBox.vue; the user, 12 Oct 2026): how
 * much stronger, and the instant answer's lead route that By a date reads for its default box count.
 *
 * LEVELS, the same bar on Fastest and By a date. Light: the stronger check alone (the instant answer's
 * routes priced ascending at once on your hours, then your earlier routes priced on this save, and by a
 * date one TE lower), after Check exactly. Fast / Exact / Very high: Light
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

/** The instant answer's lead route: where it ends and when. */
export interface CompareRoute {
  chain: number[];
  /** Unix second the target (Fastest) or the last stop (By a date) is reached. */
  end: number;
  /** TE at the end (By a date's headline). */
  endTE: number;
  /** By a date: seconds to spare before the date. */
  spare?: number;
  exact?: boolean;
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
  /** The instant answer's lead route, per goal (InstantRoute.vue). */
  const instant = ref<{ fastest: CompareRoute | null; date: CompareRoute | null }>({ fastest: null, date: null });
  // Light's status, its at-once prices and result, Check exactly's progress and the earlier routes Light priced went
  // with Light and Check exactly (23 Oct 2026).
  return { level, instant };
});
