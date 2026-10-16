/**
 * The "Stronger check" box under the instant answer (StrongerBox.vue; the user, 12 Oct 2026): how
 * much stronger, and what the parts of the page publish for the comparison block (SearchCompare.vue).
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
import type { LegSummary } from '@/search/types';
import type { LightResult } from '@/search/lightResult';

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

/** Light's status (stores `light`). */
export interface LightStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  /** The player's earlier routes: priced so far, and how many. */
  priced: number;
  total: number;
  /** When it finished, ms. */
  at: number;
  /** The instant answer's routes priced at once: so far, and how many. */
  instant?: { priced: number; total: number };
  /** What it is doing now, while running. */
  step?: string;
  /** "Fastest as you'd play it: …" once a route is priced at once. */
  summary?: string;
  /** Where the earlier routes came from: "from your board runs sent from another browser". */
  from?: string;
}
export function idleLight(): LightStatus {
  return { state: 'idle', priced: 0, total: 0, at: 0 };
}

/** A route priced at once (Light): when it ends and at what TE, and its legs (since 15 Oct 2026, for the
 *  instant answer's row arrows: a few kB for the eight or so routes Light prices). */
export interface AtOncePriced {
  chain: number[];
  seconds: number;
  end: number;
  endTE: number;
  legs?: LegSummary[];
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
  /** Light's status sign (StrongerBox.vue): waiting for Check exactly, running, or done with how many
   *  of the player's earlier routes it priced and when (ms). Since 14 Oct Light first prices the instant
   *  answer's routes at once (search/lightAtOnce.ts): `instant` counts those, `step` says what it is
   *  looking at while running ("Looking at 7 ascensions (1 of 5)"), `summary` is its own result line. */
  const light = ref<LightStatus>(idleLight());
  /** The instant answer's routes priced at once by Light, per goal, by `chain.join(',')` (null: couldn't
   *  price). The counts table shows a line under each row (InstantRoute.vue). This visit only. */
  const atOnce = ref<{ fastest: Record<string, AtOncePriced | null>; date: Record<string, AtOncePriced | null> }>({
    fastest: {},
    date: {},
  });
  /** Check exactly on the instant answer (InstantRoute.vue): going or not, and how many of its routes are priced, so
   *  Light's status sign can say what it is waiting for. */
  const exact = ref({ running: false, done: 0, total: 0 });
  /** Light's result to send (search/lightResult.ts), per goal: set by StrongerCheck.vue once Light is done,
   *  null while it runs, before it and after a new answer. LightShare.vue sends it. This visit only. */
  const lightResult = ref<{ fastest: LightResult | null; date: LightResult | null }>({ fastest: null, date: null });
  return { level, strongerBest, instant, earlierChains, lastSearch, light, atOnce, exact, lightResult };
});
