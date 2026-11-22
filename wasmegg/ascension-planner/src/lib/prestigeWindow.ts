/**
 * THE PRESTIGE-WINDOW HINT (R10, 21 Nov 2026; game expert's notes/wait-and-prestige-window-2026-11-21.md, part 3, from Joo's
 * data). Where an ascension starts in the sale week matters for a short one, by TE and by the build's sale count (the route's
 * `RouteLeg.sales`): TE 240 to 319 is best from Thursday 9 PM to Friday 2 PM Pacific, TE 320 and up from Thursday 9 PM to
 * Saturday 12 AM (never after Saturday 4 AM); a 1-sale build gets worse through the sale while 2- and 3-sale builds are fine up
 * to Saturday 8 AM. Below TE 240 the week is flat, so no hint. The steps list says "start before <the window's end> Pacific",
 * never "wait for Friday" (waiting almost never pays). Off by default; this browser's own box in Setup's More options (not part
 * of the plan, so not in the account's setup memory or the /prefs value).
 *
 * Pure apart from the box's storage, which never throws.
 */
import { ref, type Ref } from 'vue';
import { pacificHourOfWeek } from '@/search/precomputedLeg';

export const PRESTIGE_HINT_KEY = 'aap.prestigeHint';
/** The hint shows from this start TE up (below it the week is flat within about 5%). */
export const PRESTIGE_HINT_MIN_TE = 240;
/** ... up to this TE, the window runs to Friday 2 PM; from it, to Saturday 12 AM. */
export const PRESTIGE_HINT_HIGH_TE = 320;
/** ... and on ascensions of this many TE or fewer (longer ones barely feel the week). */
export const PRESTIGE_HINT_MAX_GAIN = 25;
/** Pacific hours of the week (Monday 0:00 = 0): the windows open Thursday 9 PM and end at these. */
const WINDOW_OPENS = 3 * 24 + 21;
const FRI_2PM = 4 * 24 + 14;
const SAT_12AM = 5 * 24;
const SAT_8AM = 5 * 24 + 8;

export interface PrestigeWindowLeg {
  fromTE: number;
  stopTE: number;
  /** The prestige into the ascension, unix seconds. */
  prestigeAt: number;
  /** The ascension the farm is in: no prestige to time. */
  now: boolean;
  /** The build's sale count (`RouteLeg.sales`); unknown is read as the careful 1-sale build. */
  sales?: number;
}

export interface PrestigeWindow {
  /** The Saturday 9:00 AM Pacific after the planned prestige, unix seconds. */
  deadline: number;
  /** When the good window opens (Thursday 9 PM Pacific before it), unix seconds. */
  opens: number;
  hours: number;
}

/** Where the window ends, as a Pacific hour of the week, for this TE and sale count. */
function windowEnd(fromTE: number, sales: number | undefined): number {
  if (fromTE >= PRESTIGE_HINT_HIGH_TE) return SAT_12AM;
  return sales !== undefined && sales >= 2 ? SAT_8AM : FRI_2PM;
}

/** The hint for this ascension, or null where it is not shown. */
export function prestigeWindow(leg: PrestigeWindowLeg): PrestigeWindow | null {
  if (leg.now || leg.fromTE < PRESTIGE_HINT_MIN_TE) return null;
  const gain = leg.stopTE - leg.fromTE;
  if (!(gain > 0) || gain > PRESTIGE_HINT_MAX_GAIN) return null;
  const end = windowEnd(leg.fromTE, leg.sales);
  // Pacific hours begin on UTC hour boundaries; a prestige in or after the end's hour is shown the next week's.
  const hourStart = Math.floor(leg.prestigeAt / 3600) * 3600;
  const away = ((((end - pacificHourOfWeek(leg.prestigeAt) - 1) % 168) + 168) % 168) + 1;
  const deadline = hourStart + away * 3600;
  const hours = end - WINDOW_OPENS;
  return { deadline, opens: deadline - hours * 3600, hours };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The box as this browser keeps it: '1' on; nothing or '0': off. */
export function prestigeHintStored(): boolean {
  try {
    return storage()?.getItem(PRESTIGE_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

const hint = ref(false);
let watching = false;

/**
 * The box, one for the whole page (Setup's box and the steps list read the same ref), read from this browser each time it
 * is asked for and written on every change; another tab's change arrives by the storage event.
 */
export function usePrestigeHint(): Ref<boolean> {
  hint.value = prestigeHintStored();
  if (!watching) {
    watching = true;
    try {
      if (typeof window !== 'undefined')
        window.addEventListener('storage', e => {
          if (e.key === PRESTIGE_HINT_KEY) hint.value = e.newValue === '1';
        });
    } catch {
      // one tab only
    }
  }
  return hint;
}

/** Turn the box on or off: this page now, and this browser's storage. */
export function setPrestigeHint(on: boolean): void {
  hint.value = on;
  try {
    storage()?.setItem(PRESTIGE_HINT_KEY, on ? '1' : '0');
  } catch {
    // remembered for this visit only
  }
}
