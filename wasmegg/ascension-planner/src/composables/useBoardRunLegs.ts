/**
 * A followed route's legs from the account's Leaderboard run (lib/boardRunPlan.ts, search/runLegsCsv.ts): for each
 * followed goal whose route is a run of this account with a CSV on the planner's server, that CSV is read once per page
 * load (by the row's own id, never a player ID), and the route's legs kept as a search's result. A fetch or read that
 * fails leaves the goal on its estimate (a console line says why). Only with a collector.
 */
import { ref, watch, type Ref } from 'vue';
import type { BoardRow } from '@/lib/leaderboardRank';
import { boardRunFor, runSaveSeconds, searchFromRun } from '@/lib/boardRunPlan';
import type { SnapSearch } from '@/lib/searchPlan';
import { legsFromRunCsv } from '@/search/runLegsCsv';
import type { LegSummary } from '@/search/types';

/** Fetches a run's CSV text by its row id. */
export type RunCsvFetch = (id: string) => Promise<string>;

/** Read once per page load: by row id and route. */
const cache = new Map<string, Promise<LegSummary[] | null>>();
/** Specs: read with this instead of the planner's server (null: back to it); the cache starts again. */
let override: RunCsvFetch | null = null;
export function setRunCsvFetch(f: RunCsvFetch | null): void {
  override = f;
  cache.clear();
}

export interface BoardRunWant {
  goalKey: string;
  goal: 'fastest' | 'date';
  target: number;
  deadline: number | null;
  chain: number[];
}

export interface BoardRunFound {
  search: SnapSearch;
  /** The save it was priced from, unix seconds (null when the row doesn't say). */
  save: number | null;
}

export function useBoardRunLegs(o: {
  rows: Ref<BoardRow[] | null>;
  wants: Ref<BoardRunWant[]>;
  currentTE: Ref<number>;
  fetch: Ref<RunCsvFetch | null>;
}) {
  const found = ref<Record<string, BoardRunFound>>({});
  watch(
    [o.rows, o.wants, o.currentTE, o.fetch],
    async ([rows, wants, te, fromServer]) => {
      const fetchCsv = override ?? fromServer;
      if (!fetchCsv) return;
      for (const w of wants) {
        const row = boardRunFor(rows, { ...w, currentTE: te });
        if (!row?.id) continue;
        const key = `${row.id}|${row.chain.join(',')}`;
        if (!cache.has(key))
          cache.set(
            key,
            fetchCsv(row.id)
              .then(text => legsFromRunCsv(text, row.chain))
              .catch(err => {
                console.warn('My runs: reading your Leaderboard run’s legs failed:', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
                return null;
              })
          );
        const legs = await cache.get(key)!;
        const search = searchFromRun(row, legs);
        if (search && found.value[w.goalKey]?.search.at !== search.at)
          found.value = { ...found.value, [w.goalKey]: { search, save: runSaveSeconds(row) } };
      }
    },
    { immediate: true }
  );
  return { found };
}
