/**
 * THE EGG DAY RULE (Jordan, 22 Oct 2026): TE counts only once it is claimed, so an Egg Day route counts only when
 * its last TE comes BEFORE Egg Day starts (lib/eggDay.ts `eggDaySeconds`). A route that lands after the start can
 * be shown, marked "after Egg Day starts", but is never the pick, the tile, a recommendation or a follow suggestion.
 * By a date's own dates follow the same rule ("after your date").
 *
 * Every place that picks, ranks or suggests a By a date route asks here (wiring checked by eggDayRule.wiring.spec.ts):
 * lib/currentAnswer.ts `pickGoalPlan` (Right now's plan), lib/savedTiles.ts `buildTile` (the Egg Day tile),
 * lib/myRunsDashboard.ts (the Egg Day and By a date cards, Next steps), lib/tryNext.ts `oneMoreLine`,
 * lib/routeScatter.ts, lib/leaderboardRank.ts `madeDeadline` (the boards) and the "Follow this route" buttons.
 *
 * A finish exactly at the start counts (as the boards' `madeDeadline` always had it). A finish that is known to
 * miss but not when (Check exactly found no route in time and kept no time) is `Infinity`: late, and never the
 * "nearest". Pure.
 */
import { eggDayYearOf } from './eggDay';

/** Egg Day's own start, or another date the player picked. */
export type DeadlineKind = 'eggday' | 'date';

/** Whether a route whose last TE counts at `finish` (unix seconds) counts for a goal that starts or ends at `start`. */
export function finishesBefore(finish: number, start: number): boolean {
  return !Number.isNaN(finish) && finish <= start;
}

/** Seconds after `start` (null: in time; Infinity: late, by an unknown amount). */
export function lateSeconds(finish: number, start: number): number | null {
  if (finishesBefore(finish, start)) return null;
  return Number.isFinite(finish) ? finish - start : Infinity;
}

/** The routes in time and the late ones, each in the list's order. */
export function splitOnTime<T>(list: readonly T[], finishOf: (t: T) => number, start: number): { onTime: T[]; late: T[] } {
  const onTime: T[] = [];
  const late: T[] = [];
  for (const t of list) (finishesBefore(finishOf(t), start) ? onTime : late).push(t);
  return { onTime, late };
}

/** The routes that land after `start`. */
export function lateRoutes<T>(list: readonly T[], finishOf: (t: T) => number, start: number): T[] {
  return splitOnTime(list, finishOf, start).late;
}

/** The routes that count: the only ones a pick, a tile or a suggestion may use. */
export function onTimeRoutes<T>(list: readonly T[], finishOf: (t: T) => number, start: number): T[] {
  return splitOnTime(list, finishOf, start).onTime;
}

/** The late route that lands soonest after `start`, with by how much; null when none has a known time. */
export function nearestLate<T>(list: readonly T[], finishOf: (t: T) => number, start: number): { item: T; seconds: number } | null {
  let best: { item: T; seconds: number } | null = null;
  for (const t of list) {
    const s = lateSeconds(finishOf(t), start);
    if (s == null || !Number.isFinite(s)) continue;
    if (!best || s < best.seconds) best = { item: t, seconds: s };
  }
  return best;
}

/** Egg Day's own start (any year's, to the second) or another date. */
export function deadlineKind(deadline: number): DeadlineKind {
  return eggDayYearOf(deadline) != null ? 'eggday' : 'date';
}

/** The marker beside a route that lands late: "after Egg Day starts", "after your date". */
export function lateMarker(kind: DeadlineKind): string {
  return kind === 'eggday' ? 'after Egg Day starts' : 'after your date';
}

/** "under an hour", "1 hour", "7 hours", "3 days" (from 48 hours). */
export function lateSpanWords(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return 'under an hour';
  if (h < 48) {
    const n = Math.round(h);
    return `${n} hour${n === 1 ? '' : 's'}`;
  }
  const d = Math.round(h / 24);
  return `${d} days`;
}

/**
 * Said instead of a pick when no route is in time: "No route finishes before Egg Day starts. The nearest is 7 hours
 * after." ("before your date" for By a date). Without a known nearest time, the first sentence only.
 */
export function noRouteInTimeWords(kind: DeadlineKind, nearestSeconds: number | null): string {
  const head = kind === 'eggday' ? 'No route finishes before Egg Day starts.' : 'No route finishes before your date.';
  if (nearestSeconds == null || !Number.isFinite(nearestSeconds)) return head;
  return `${head} The nearest is ${lateSpanWords(nearestSeconds)} after.`;
}
