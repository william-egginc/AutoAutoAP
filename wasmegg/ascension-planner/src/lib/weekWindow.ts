/**
 * R10 WEEKLY HOURS, as the run record keeps them (notes/r10-mask-record-2026-11-21.md; Collector and data with Reliability,
 * 21 Nov 2026). The record has one text, `window` (collector: at most 64 characters, part of the row fingerprint).
 *
 *  - A week that one daily window can say is written in the OLD words, exactly as describeAvailability writes them, so old
 *    and new clients agree, the fingerprint does not move and every old row reads as before.
 *  - Any other week is "wk:" + 28 characters + " " + the zone: the 168 hours as 21 bytes of base64url, bit i set = hour i
 *    awake (index 0 = Monday 00:00, the low bit of byte 0). 3 + 28 + 1 + a zone of at most 32 characters = 64.
 *  - No awake hour, or every hour awake, is no schedule: null (the client sends window null, as for no schedule).
 *
 * The mask here is `boolean[168]`, true = awake, Monday first, index = day * 24 + hour. Availability.blocked
 * (search/availabilitySchedule.ts) is the inverse with the same indexing; `awakeFromBlocked` is the ONE inversion.
 *
 * PURE ON PURPOSE: imports nothing, so availabilitySchedule.ts (which the Explorer's bundle reaches) can import it
 * without pulling in availability.ts or lib/events. No player ID, no name: the text holds the mask and the zone only.
 */

const WEEK = 168;
const B64URL = /^[A-Za-z0-9_-]{28}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The awake array for a list of blocked indices (0-167, Monday first). Entries that are not whole numbers 0-167 are ignored. */
export function awakeFromBlocked(blocked: readonly number[]): boolean[] {
  const awake = Array<boolean>(WEEK).fill(true);
  for (const i of blocked) if (Number.isInteger(i) && i >= 0 && i < WEEK) awake[i] = false;
  return awake;
}

/** The 28-character code: 21 bytes, bit i set = hour i awake. */
export function encodeWeekMask(awake: readonly boolean[]): string {
  if (!Array.isArray(awake) || awake.length !== WEEK || awake.some(a => typeof a !== 'boolean')) {
    throw new RangeError('a week is 168 booleans');
  }
  const bytes = new Uint8Array(21);
  awake.forEach((a, i) => {
    if (a) bytes[i >> 3] |= 1 << (i & 7);
  });
  let out = '';
  for (let i = 0; i < 21; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  return out;
}

/** The awake array a code holds, or null for anything that is not exactly 28 base64url characters. */
export function decodeWeekMask(code: unknown): boolean[] | null {
  if (typeof code !== 'string' || !B64URL.test(code)) return null;
  const awake: boolean[] = [];
  for (let c = 0; c < 28; c += 4) {
    const n =
      (ALPHABET.indexOf(code[c]) << 18) |
      (ALPHABET.indexOf(code[c + 1]) << 12) |
      (ALPHABET.indexOf(code[c + 2]) << 6) |
      ALPHABET.indexOf(code[c + 3]);
    for (const byte of [(n >> 16) & 255, (n >> 8) & 255, n & 255]) for (let b = 0; b < 8; b++) awake.push(!!((byte >> b) & 1));
  }
  return awake;
}

const countAwake = (awake: readonly boolean[]) => awake.reduce((n, a) => n + (a ? 1 : 0), 0);

/** Our weekday number (0 = Sunday) of a Monday-first day index. */
const sundayFirst = (mondayFirstDay: number) => (mondayFirstDay + 1) % 7;

/**
 * The week a daily window gives, read as search/availability.ts `isAvailable` reads it: in the hours (a window past
 * midnight wraps), on a chosen day, and the hours after midnight of a wrapping window belong to the day it STARTED.
 */
function windowAwake(days: readonly number[], from: number, to: number): boolean[] {
  const anyDay = days.length === 0 || days.length === 7;
  const wraps = from > to;
  return Array.from({ length: WEEK }, (_, i) => {
    const sun = sundayFirst(Math.floor(i / 24));
    const h = i % 24;
    const inHours = from === to || (wraps ? h >= from || h < to : h >= from && h < to);
    return inHours && (anyDay || days.includes(wraps && h < to ? (sun + 6) % 7 : sun));
  });
}

const sameWeek = (a: readonly boolean[], b: readonly boolean[]) => a.every((x, i) => x === b[i]);
const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** The old words (describeAvailability's) when one daily window says exactly this week, else null. */
function legacyText(awake: readonly boolean[], timezone: string): string | null {
  for (let from = 0; from < 24; from++) {
    for (let to = 0; to < 24; to++) {
      // A day is chosen when the window's first hour on that day is awake (its session starts that day).
      const days: number[] = [];
      for (let d = 0; d < 7; d++) if (awake[d * 24 + from]) days.push(sundayFirst(d));
      if (days.length === 0) continue;
      const full = days.length === 7;
      if (from === to && full) continue; // every day, all day: no schedule
      if (!sameWeek(windowAwake(full ? [] : days, from, to), awake)) continue;
      days.sort((x, y) => x - y);
      const dayText = full ? 'every day' : days.map(d => DAY_NAMES[d]).join(',');
      const hourText = from === to ? 'all day' : `${pad(from)}-${pad(to)}`;
      return `${dayText} ${hourText} ${timezone}`;
    }
  }
  return null;
}

/**
 * The `window` text for a week: null for no schedule (nothing awake, or everything), the old words for a week one daily
 * window can say, else "wk:" + the code + " " + the zone. Throws for an array that is not 168 booleans.
 */
export function weekWindowText(awake: readonly boolean[], timezone: string): string | null {
  const code = encodeWeekMask(awake); // validates
  const n = countAwake(awake);
  if (n === 0 || n === WEEK) return null;
  return legacyText(awake, timezone) ?? `wk:${code}${timezone ? ` ${timezone}` : ''}`;
}

/** A `wk:` text read to its week and zone; null for anything else, and for a code with no awake hour or every hour awake. */
export function parseWeekWindow(window: string | null | undefined): { hours: boolean[]; timezone: string } | null {
  if (typeof window !== 'string') return null;
  const m = /^wk:([A-Za-z0-9_-]{28})(?: (\S+))?\s*$/.exec(window.trim());
  if (!m) return null;
  const hours = decodeWeekMask(m[1]);
  if (!hours) return null;
  const n = countAwake(hours);
  return n === 0 || n === WEEK ? null : { hours, timezone: m[2] ?? '' };
}

const LEGACY = /^(every day|[A-Za-z]{3}(?:,[A-Za-z]{3})*) (all day|(\d{1,2}):00-(\d{1,2}):00)(?: (\S+))?\s*$/;

/**
 * The awake week a `window` text holds, old words or new: the one reader for places that need the hours. Null for no
 * schedule ('' / null / undefined) and for text that cannot be read (callers that must tell those apart test for empty
 * first, as currentAnswer.rowSetup does).
 */
export function windowHours(window: string | null | undefined): boolean[] | null {
  if (!window) return null;
  const wk = parseWeekWindow(window);
  if (wk) return wk.hours;
  const m = LEGACY.exec(window.trim());
  if (!m) return null;
  const days = m[1] === 'every day' ? [] : m[1].split(',').map(d => DAY_NAMES.indexOf(d));
  if (days.some(d => d < 0)) return null;
  const allDay = m[2] === 'all day';
  const from = allDay ? 0 : Number(m[3]);
  const to = allDay ? 0 : Number(m[4]);
  if (from > 23 || to > 23) return null;
  return windowAwake(days, from, to);
}

/** The blocked indices of an awake week: what Availability.blocked holds. */
export function blockedFromAwake(awake: readonly boolean[]): number[] {
  return awake.flatMap((a, i) => (a ? [] : [i]));
}

/** How many hours a week the text leaves awake (for the hover); null when it is not a `wk:` text. */
export function weekAwakeCount(window: string | null | undefined): number | null {
  const wk = parseWeekWindow(window);
  return wk ? countAwake(wk.hours) : null;
}
