/**
 * THE PRESTIGE-WINDOW HINT (R10, 21 Nov 2026; game expert's notes/wait-and-prestige-window-2026-11-21.md, part 2b).
 * The sale ends Saturday 9:00 AM Pacific, and a short ascension that starts just after it runs up to about a quarter longer
 * (a 3-TE one at TE 350 to 450: 25%; 10 TE: 9%; 25 TE: 4%). So, on an ascension of about 25 TE or less starting at TE 200 or
 * more, the steps list can say "start before Saturday 9:00 AM Pacific": a good window about 36 hours wide, 30 for a 3-TE
 * ascension. Never "wait for Friday": waiting almost never pays (the notes' table). Off by default; this browser's own box in
 * Setup's More options (not part of the plan, so not in the account's setup memory or the /prefs value).
 *
 * Pure apart from the box's storage, which never throws.
 */
import { ref, type Ref } from 'vue';
import { pacificHourOfWeek } from '@/search/precomputedLeg';

export const PRESTIGE_HINT_KEY = 'aap.prestigeHint';
/** The hint shows from this start TE up (lower down the week is flat within a few percent). */
export const PRESTIGE_HINT_MIN_TE = 200;
/** ... and on ascensions of this many TE or fewer (longer ones barely feel the sale's edge). */
export const PRESTIGE_HINT_MAX_GAIN = 25;
/** The window's width in hours: 3 TE or fewer is narrower. */
export const PRESTIGE_WINDOW_HOURS = 36;
export const PRESTIGE_WINDOW_HOURS_SHORT = 30;
/** Pacific hour of the week (Monday 0:00 = 0) of Saturday 9:00 AM. */
const SATURDAY_9_HOUR = 5 * 24 + 9;

export interface PrestigeWindowLeg {
  fromTE: number;
  stopTE: number;
  /** The prestige into the ascension, unix seconds. */
  prestigeAt: number;
  /** The ascension the farm is in: no prestige to time. */
  now: boolean;
}

export interface PrestigeWindow {
  /** The Saturday 9:00 AM Pacific after the planned prestige, unix seconds. */
  deadline: number;
  /** When the good window opens (36 or 30 hours before), unix seconds. */
  opens: number;
  hours: number;
}

/** The hint for this ascension, or null where it is not shown. */
export function prestigeWindow(leg: PrestigeWindowLeg): PrestigeWindow | null {
  if (leg.now || leg.fromTE < PRESTIGE_HINT_MIN_TE) return null;
  const gain = leg.stopTE - leg.fromTE;
  if (!(gain > 0) || gain > PRESTIGE_HINT_MAX_GAIN) return null;
  // Pacific hours begin on UTC hour boundaries; the hour starting Saturday 9:00 AM is already past the deadline.
  const hourStart = Math.floor(leg.prestigeAt / 3600) * 3600;
  const away = ((((SATURDAY_9_HOUR - pacificHourOfWeek(leg.prestigeAt) - 1) % 168) + 168) % 168) + 1;
  const deadline = hourStart + away * 3600;
  const hours = gain <= 3 ? PRESTIGE_WINDOW_HOURS_SHORT : PRESTIGE_WINDOW_HOURS;
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
