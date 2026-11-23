// ONE HOURS FORMAT (Jordan, 23 Nov 2026): the week as lib/weekWindow.ts's 28-character code, with the zone. Setup, follow
// rows and run records carry it; `blocked` (indices 0-167, Monday 00:00 first) stays beside it for clients already out, and
// is read when there is no code. Pure, and imports only weekWindow.ts and the schedule's own list check.

import { validBlocked } from '@/search/availabilitySchedule';

import { awakeFromBlocked, blockedFromAwake, decodeWeekMask, encodeWeekMask } from './weekWindow';

const WEEK = 168;

/** The 28-character code of a blocked list; null when it is no schedule (nothing blocked, or every hour). */
export function weekCodeOfBlocked(blocked: readonly number[] | null | undefined): string | null {
  const list = validBlocked(blocked ?? []);
  if (list.length === 0 || list.length === WEEK) return null;
  return encodeWeekMask(awakeFromBlocked(list));
}

/** The blocked list a code holds; null for anything that is not a code, and for a code that is no schedule. */
export function blockedOfWeekCode(code: unknown): number[] | null {
  const awake = decodeWeekMask(code);
  if (!awake) return null;
  const list = blockedFromAwake(awake);
  return list.length === 0 || list.length === WEEK ? null : list;
}

export interface WeekHours {
  week?: string | null;
  blocked?: readonly number[] | null;
  timezone?: string;
}

/** The code a hours value stands for: its `week` first, else its `blocked`; null when it is no schedule. */
function codeOf(h: WeekHours): string | null {
  return blockedOfWeekCode(h.week) ? (h.week as string) : weekCodeOfBlocked(h.blocked);
}

/** The same week, in the same zone (a side with no schedule is only the same as another with none). */
export function sameWeek(a: WeekHours, b: WeekHours): boolean {
  const x = codeOf(a);
  const y = codeOf(b);
  if (x === null || y === null) return x === y;
  return x === y && (a.timezone ?? '') === (b.timezone ?? '');
}
