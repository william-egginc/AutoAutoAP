/**
 * By a date's deadline, kept for the page load (DeadlinePanel.vue's `kept`), and a way for another page
 * to set it before opening that screen (My runs' Next steps, 16 Oct 2026: "Find my Egg Day answer").
 *
 * Only the deadline lives here: the date, time and zone the screen's boxes hold, and whether "Another
 * date" is picked. Everything else DeadlinePanel keeps (the stop boxes, the sliders, the mode) stays in
 * its own `kept`; a request that fills the boxes already has its own way in (the ui store's
 * `byDateRequest`, DeadlinePanel `applyRequest`).
 *
 * A PRESET is asked for, not written into the boxes: the screen loads on its own (an async chunk) and
 * may be showing a run that owns its date. `presetByDate` leaves it pending; DeadlinePanel takes it
 * when it mounts, or at once when it is already open, and applies it unless a By a date run is going
 * or being restored. Taking it clears it, so it applies once: a date the player picks afterwards is
 * never overwritten by it, on this visit to the screen or the next. One left pending longer than
 * PRESET_TTL_MS (the screen never opened) is dropped rather than applied on some later visit.
 */
import { ref, shallowRef, type Ref } from 'vue';
import { EGG_DAY_TIME, EGG_DAY_ZONE, nextEggDayYear } from './eggDay';
import { formatInZone } from '@/search/csv';

/** The Egg Day the screen offers, fixed when the page loads. */
export const eggDayYearAtLoad = nextEggDayYear();

/** The screen's deadline boxes. Default: Egg Day. */
export interface ByDateForm {
  /** YYYY-MM-DD */
  date: Ref<string>;
  /** HH:MM, 24-hour (the time input's own format). */
  time: Ref<string>;
  zone: Ref<string>;
  /** "Another date" was picked (its boxes show even while they hold Egg Day). */
  customDate: Ref<boolean>;
}

export const byDateForm: ByDateForm = {
  date: ref(`${eggDayYearAtLoad}-07-14`),
  time: ref(EGG_DAY_TIME),
  zone: ref(EGG_DAY_ZONE),
  customDate: ref(false),
};

/** What a preset asks for: Egg Day (as the screen's own Egg Day button sets it), or another date. */
export type ByDatePresetAsk = { eggDay: true } | { eggDay?: false; deadline: number; zone: string };
export type ByDatePreset = ByDatePresetAsk & { at: number };

/** A preset not taken within this long is dropped. Long enough for a slow phone to load the screen. */
export const PRESET_TTL_MS = 2 * 60_000;

const pending = shallowRef<ByDatePreset | null>(null);

/** The pending preset, for DeadlinePanel to watch. */
export const byDatePresetPending: Readonly<Ref<ByDatePreset | null>> = pending;

/** Ask By a date to open on this deadline (the caller then opens the screen). */
export function presetByDate(ask: ByDatePresetAsk, now = Date.now()): void {
  pending.value = { ...ask, at: now };
}

/** The pending preset, cleared: null when there is none or it is stale. */
export function takeByDatePreset(now = Date.now()): ByDatePreset | null {
  const p = pending.value;
  pending.value = null;
  if (!p || now - p.at > PRESET_TTL_MS || p.at - now > PRESET_TTL_MS) return null;
  return p;
}

/** Put a preset's deadline in the boxes. False when it named a date that can't be shown. */
export function applyByDatePreset(p: ByDatePresetAsk, form: ByDateForm = byDateForm): boolean {
  if (p.eggDay) {
    form.date.value = `${eggDayYearAtLoad}-07-14`;
    form.time.value = EGG_DAY_TIME;
    form.zone.value = EGG_DAY_ZONE;
    form.customDate.value = false;
    return true;
  }
  const [d, t] = formatInZone(p.deadline, p.zone).split(' ');
  if (!d || !t) return false;
  form.date.value = d;
  form.time.value = t;
  form.zone.value = p.zone;
  form.customDate.value = true;
  return true;
}
