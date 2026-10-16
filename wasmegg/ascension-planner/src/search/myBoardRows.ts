/**
 * The viewer's own board runs, read the way My runs reads them (LeaderboardPanel.vue, mode "myruns"),
 * for anything else that needs them: the board's GET /all and GET /mine, merged, and kept to the rows
 * `isMyRun` counts as the viewer's (sent with this browser's code, or looking like theirs: one of the
 * account's keys and, from another browser or site, one of its names).
 *
 * Light (components/auto/StrongerCheck.vue) used to read /mine alone. Owner codes are per browser and
 * per site, so the runs an account sent from live or the PC never reached Light's earlier routes on beta
 * (18 Oct 2026: the alt's 248 rows, sent from the PC, while Light ended on 247). Now both read here.
 *
 * Only reads what the board already shows. The last /all is kept a minute in memory per collector
 * (`rememberAll`, `recentAll`): the board writes it on every load, so Light, run after a visit to My
 * runs or Compare, asks nothing again; the collector's edge caches /all for a minute anyway.
 */
import { accountKeyOf, type BoardRow } from '@/lib/leaderboardRank';
import { isMyRun, nameKeys, type LookAlike } from '@/lib/myRuns';

/** How long a remembered /all stands in for a new read. */
export const ALL_FRESH_MS = 60_000;

/**
 * GET /mine with this browser's code for the account: its rows, each marked `yours`. Null when the
 * collector could not answer (none, an old one, offline). Never throws.
 */
export async function fetchMineRows(
  root: string,
  token: string,
  o: { signal?: AbortSignal } = {}
): Promise<BoardRow[] | null> {
  try {
    const res = await fetch(`${root}/mine`, {
      headers: { 'x-owner-token': token },
      ...(o.signal ? { signal: o.signal } : {}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rows?: BoardRow[] };
    return Array.isArray(data.rows)
      ? data.rows.filter(r => r && Array.isArray(r.chain)).map(r => ({ ...r, yours: true }))
      : null;
  } catch {
    return null;
  }
}

/**
 * One `/all` read (with `query`, e.g. "?final=490"). `cut`: an old collector's list may stop at `cap`
 * (the current one sends every row with its snapshot's `builtAt`). Never from the browser's cache.
 * Throws on a failed answer, as the board wants to say so.
 */
export async function fetchAllRows(
  root: string,
  query = '',
  o: { signal?: AbortSignal; cap?: number } = {}
): Promise<{ rows: BoardRow[]; cut: boolean }> {
  const res = await fetch(`${root}/all${query}`, {
    cache: 'no-cache',
    ...(o.signal ? { signal: o.signal } : {}),
  });
  if (!res.ok) throw new Error(`the collector answered ${res.status}`);
  const data = (await res.json()) as { rows?: BoardRow[]; builtAt?: number };
  const rows = Array.isArray(data.rows) ? data.rows.filter(r => r && Array.isArray(r.chain)) : [];
  return { rows, cut: typeof data.builtAt !== 'number' && o.cap !== undefined && rows.length >= o.cap };
}

const lastAll = new Map<string, { at: number; rows: readonly BoardRow[] }>();

/** Keep the board's last full /all for `root` (only a whole, uncut list). */
export function rememberAll(root: string, rows: readonly BoardRow[], at = Date.now()): void {
  lastAll.set(root, { at, rows });
}

/** The /all read in the last `maxAgeMs` for `root`, or null. */
export function recentAll(root: string, maxAgeMs = ALL_FRESH_MS, now = Date.now()): readonly BoardRow[] | null {
  const held = lastAll.get(root);
  return held && now - held.at <= maxAgeMs ? held.rows : null;
}

/** Specs only. */
export function forgetAll(): void {
  lastAll.clear();
}

/**
 * Every public row, the viewer's marked `yours`, plus any of theirs /all does not show (hidden, or not
 * on the edge's cached list yet). My runs' `mergedRows`.
 */
export function mergeMine(shown: readonly BoardRow[], mine: readonly BoardRow[]): BoardRow[] {
  if (!mine.length) return [...shown];
  const ids = new Set(mine.map(r => r.id).filter((x): x is string => !!x));
  const seen = new Set(shown.map(r => r.id));
  return [
    ...shown.map(r => (r.id && ids.has(r.id) ? { ...r, yours: true } : r)),
    ...mine.filter(r => !r.id || !seen.has(r.id)),
  ];
}

/**
 * What `isMyRun`'s "looks like yours" reads: every key that is the viewer's (the save's, the ones this
 * browser remembered for the account, those of /mine's rows) and the names the account sends under (its
 * own, the one it credits runs to, those on /mine's rows). No keys without a save.
 */
export function lookAlikeFor(o: {
  saveKey: string | null;
  remembered: readonly string[];
  mine: readonly BoardRow[] | null;
  names: readonly (string | null | undefined)[];
  viewerTE: number;
}): LookAlike {
  const keys = new Set<string>(o.remembered);
  if (o.saveKey) keys.add(o.saveKey);
  for (const r of o.mine ?? []) keys.add(accountKeyOf(r));
  return {
    keys: o.saveKey ? keys : new Set<string>(),
    names: nameKeys([...o.names, ...(o.mine ?? []).map(r => r.nickname)]),
    viewerTE: o.viewerTE,
  };
}

/** The viewer's runs: /all and /mine merged, kept to `isMyRun`. Each id once. */
export function myBoardRows(all: readonly BoardRow[], mine: readonly BoardRow[] | null, l: LookAlike): BoardRow[] {
  return mergeMine(all, mine ?? []).filter(r => isMyRun(r, l.keys, l.viewerTE, l.names));
}

/**
 * Light's read: /mine (when this browser holds a code) and /all (the board's last read when under a
 * minute old), then `myBoardRows`. Never throws: without the board, whatever /mine gave.
 */
export async function readMyBoardRows(o: {
  root: string;
  token: string | null;
  look: (mine: readonly BoardRow[] | null) => LookAlike;
  timeoutMs?: number;
  now?: number;
}): Promise<BoardRow[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 10_000);
  try {
    const held = recentAll(o.root, ALL_FRESH_MS, o.now ?? Date.now());
    const [mine, all] = await Promise.all([
      o.token ? fetchMineRows(o.root, o.token, { signal: ctrl.signal }) : Promise.resolve(null),
      held
        ? Promise.resolve(held)
        : fetchAllRows(o.root, '', { signal: ctrl.signal }).then(
            a => {
              rememberAll(o.root, a.rows);
              return a.rows;
            },
            () => [] as BoardRow[]
          ),
    ]);
    return myBoardRows(all, mine, o.look(mine));
  } finally {
    clearTimeout(timer);
  }
}
