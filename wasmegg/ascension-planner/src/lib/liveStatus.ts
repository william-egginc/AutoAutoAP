/**
 * What a screen reader hears while the planner works (the UX review of 25 Oct 2026, accessibility): the instant
 * answer's state and a running search's progress, said in a visually hidden `role="status"` line. A search's
 * figures change every second, so they are said at most every 10 s, and always when the search ends. Pure: the
 * components (InstantRoute.vue, RunAnnouncer.vue) hold the timer and the last line said.
 */

import type { RunProgress } from '@/stores/chainSearch';
import { NAMES } from './siteNav';
import { foundLevel } from './searchPointer';

/** The instant answer's line: while it is worked out, and once it is there. Nothing otherwise. */
export function instantLiveText(status: 'idle' | 'loading' | 'error' | 'done', hasAnswer: boolean): string {
  if (status === 'loading') return 'Working out the instant answer';
  if (status === 'done' && hasAnswer) return 'Instant answer ready';
  return '';
}

/** A running search's name as a player reads it: Fast, Exact, Custom, Highest TE by a date or When should I start? */
export function runName(kind: RunProgress['kind'], effort: string | null | undefined): string {
  if (kind === 'smart') return foundLevel({ custom: false, effort });
  if (kind === 'full') return 'Custom';
  if (kind === 'by-date') return NAMES.byDate;
  return NAMES.start;
}

/** "Fast search: 3 of 12 routes done" (no total yet: "Fast search: 3 routes done"). */
export function runLiveText(p: Pick<RunProgress, 'done' | 'total' | 'unit' | 'stopping'>, name: string): string {
  if (p.stopping) return `${name} search: stopping`;
  const n = (v: number) => v.toLocaleString('en-US');
  return p.total ? `${name} search: ${n(p.done)} of ${n(p.total)} ${p.unit} done` : `${name} search: ${n(p.done)} ${p.unit} done`;
}

/** What is said when the search is over (its progress gone). */
export function runEndText(name: string): string {
  return `${name} search finished`;
}

/** At most one progress line per this many ms. */
export const LIVE_GAP_MS = 10_000;

/**
 * Whether to say `text` now: always a final line (the search ended) that differs from the last one said; otherwise
 * only a new line, and only once `LIVE_GAP_MS` has passed since the last one was said.
 */
export function shouldSay(last: { text: string; at: number } | null, text: string, now: number, final: boolean): boolean {
  if (!text) return false;
  if (last && last.text === text) return false;
  if (final || !last) return true;
  return now - last.at >= LIVE_GAP_MS;
}
