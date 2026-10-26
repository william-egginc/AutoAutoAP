/**
 * A FOLLOWED ROUTE FROM A RUN SENT FROM ANOTHER BROWSER (26 Oct 2026, Williamthe5thc: his Egg Day route came from his
 * Fast run sent from an incognito window; any other browser showed only the instant estimate, no exact legs and no Add
 * buttons, while the saved answer tile knew the run). Such a run lives only as a board row of this account (My runs'
 * `myRows`) and its CSV on the planner's server (search/runLegsCsv.ts reads the route's legs back). This module finds the
 * row for a followed route and turns its legs into the result a kept search gives (lib/searchPlan.ts SnapSearch), so the
 * followed route is priced the way a kept Fast, Exact or Custom result prices it (lib/followPrice.ts step 0).
 *
 * Pure.
 */
import type { BoardRow } from './leaderboardRank';
import { startMs } from './leaderboardRank';
import { rowLevel, rowSaveSeconds } from './savedTiles';
import type { FoundLevel } from './searchPointer';
import type { SnapSearch } from './searchPlan';
import type { LegSummary } from '@/search/types';

/** The glossary's name for a row's search strength; null for one that is not a search (priced at once). */
export function rowFoundLevel(row: BoardRow): FoundLevel | null {
  const l = rowLevel(row);
  if (l === 'quick') return 'Fast';
  if (l === 'normal' || l === 'thorough') return 'Exact';
  if (l === 'exhaustive') return 'Custom';
  return null;
}

/**
 * The newest row of this account for the goal (By a date: its deadline; Fastest: its target and no deadline) whose
 * route is `chain` (the stops still ahead of the save on both sides), with a CSV to read; null when none.
 */
export function boardRunFor(
  rows: readonly BoardRow[] | null | undefined,
  o: { goal: 'fastest' | 'date'; target: number; deadline: number | null; chain: readonly number[]; currentTE: number }
): BoardRow | null {
  const ahead = (c: readonly number[]) => c.filter(t => t > Math.floor(o.currentTE)).join(',');
  const want = ahead(o.chain);
  if (!want) return null;
  const sent = (r: BoardRow) => Date.parse(r.receivedAt ?? r.submittedAt ?? '') || 0;
  const ok = (rows ?? []).filter(
    r =>
      !!r.id &&
      !!r.hasCsv &&
      !r.provisional &&
      Array.isArray(r.chain) &&
      ahead(r.chain) === want &&
      rowFoundLevel(r) !== null &&
      (o.goal === 'date' ? r.deadline === o.deadline : !r.deadline && r.finalTE === o.target)
  );
  return ok.sort((a, b) => sent(b) - sent(a))[0] ?? null;
}

/** The row's run as a kept search's result: its legs, end and TE, when it was found and its plan start. Null without
 *  legs, a level or a plan start. */
export function searchFromRun(row: BoardRow, legs: readonly LegSummary[] | null): SnapSearch | null {
  const level = rowFoundLevel(row);
  const start = startMs(row);
  if (!legs?.length || !level || start == null) return null;
  const last = legs[legs.length - 1];
  return {
    level,
    chain: [...row.chain],
    end: last.endTime,
    endTE: last.endTE,
    legs: legs.map(l => ({ ...l, shifts: l.shifts?.map(s => ({ ...s })) })),
    at: Date.parse(row.receivedAt ?? row.submittedAt ?? '') || Date.now(),
    planStart: Math.floor(start / 1000),
    otherBrowser: true,
  };
}

/** The save the run was priced from (unix seconds), when the row says. */
export function runSaveSeconds(row: BoardRow): number | null {
  const s = rowSaveSeconds(row);
  return s == null ? null : Math.round(s);
}
