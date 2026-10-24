/**
 * The one-line result a hidden section shows (CollapsibleSection.vue; the user, 12 Oct 2026).
 * Fastest: when the route reaches the target. By a date: the TE and the spare.
 */
import type { CompareEntry } from './compareAnswers';
import { spareLabel } from './deadlineSummary';

export function routeLine(
  goal: 'fastest' | 'date',
  e: CompareEntry | null | undefined,
  show: (unix: number) => string,
  empty = 'not run yet'
): string {
  if (!e) return empty;
  const n = e.chain.length;
  const asc = `${n} ascension${n === 1 ? '' : 's'}`;
  const head =
    goal === 'fastest'
      ? `Reaches ${e.endTE} on ${show(e.end)} · ${asc}`
      : `${e.endTE} TE${e.spare !== undefined ? ` · ${spareLabel(e.spare)} spare` : ''} · ${asc}`;
  return e.running ? `${head} (so far, still running)` : head;
}
