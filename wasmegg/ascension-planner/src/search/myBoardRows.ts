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
import { normalizeBoardRows } from '@/lib/boardRowGuard';
import { thisDevice } from './device';

/** How long a remembered /all stands in for a new read. */
export const ALL_FRESH_MS = 60_000;

/** How long one board read waits before giving up (My runs, Compare, Light). */
export const BOARD_TIMEOUT_MS = 10_000;

/** Why a board read failed: `unreachable` (no answer in time, or no connection) or `read` (it answered, with an
 *  error status or something that isn't the board). */
export type BoardReadKind = 'unreachable' | 'read';

/** A failed board read (QA break-it #3 and #4, 22 Oct 2026). The message is for logs: players read
 *  `boardErrorText` (components/auto/LeaderboardPanel.vue). */
export class BoardReadError extends Error {
  constructor(
    readonly kind: BoardReadKind,
    detail: string,
    options?: { cause?: unknown }
  ) {
    super(detail, options);
    this.name = 'BoardReadError';
  }
}

/**
 * `read` with a time limit. The fetch gets an AbortSignal that fires at `timeoutMs` (or with the caller's
 * own), and the promise rejects at `timeoutMs` whether or not the fetch notices the abort: a request the
 * network holds open forever left My runs on "loading" for good (QA break-it #4).
 */
export async function withBoardTimeout<T>(
  read: (signal: AbortSignal) => Promise<T>,
  o: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (o.signal?.aborted) ctrl.abort();
  else o.signal?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new BoardReadError('unreachable', 'the leaderboard did not answer in time'));
    }, o.timeoutMs ?? BOARD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([read(ctrl.signal), timeout]);
  } catch (e) {
    if (e instanceof BoardReadError) throw e;
    // The caller's own abort stays an AbortError (a newer load replaced this one).
    if (o.signal?.aborted) throw e;
    // fetch rejects only when there was no answer: offline, refused, DNS.
    throw new BoardReadError('unreachable', `no answer from the leaderboard (${String(e)})`, { cause: e });
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * What a failed board read says, in words a player can act on and never the error itself. My runs says the
 * runs are not lost (a read failure used to read "none yet", as if they were gone); Compare says when to
 * try again. Each sits beside a Retry button.
 */
export function boardErrorText(kind: BoardReadKind, where: 'myruns' | 'compare'): string {
  if (where === 'compare')
    return kind === 'unreachable'
      ? "Couldn't reach the leaderboard right now. Try again in a minute."
      : "Couldn't read the leaderboard right now. Try again in a minute.";
  return kind === 'unreachable'
    ? "Couldn't reach the leaderboard."
    : `Couldn't read the leaderboard right now. Your runs are safe on ${thisDevice()}.`;
}

/** The answer's JSON, or a `read` failure (a web page or a cut-off body in its place). */
async function boardJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new BoardReadError('read', 'the leaderboard sent something that is not the board', { cause: e });
  }
}

/**
 * GET /mine with this browser's code for the account: its rows, each marked `yours`. Null when the
 * collector could not answer (none, an old one, offline, or not in `timeoutMs`). Never throws.
 */
export async function fetchMineRows(
  root: string,
  token: string,
  o: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<BoardRow[] | null> {
  try {
    return await withBoardTimeout(async signal => {
      const res = await fetch(`${root}/mine`, { headers: { 'x-owner-token': token }, signal });
      if (!res.ok) return null;
      const data = await boardJson<{ rows?: BoardRow[] }>(res);
      // Every row made to match its type first (lib/boardRowGuard.ts).
      return Array.isArray(data.rows) ? normalizeBoardRows<BoardRow>(data.rows).map(r => ({ ...r, yours: true })) : null;
    }, o);
  } catch {
    return null;
  }
}

/**
 * One `/all` read (with `query`, e.g. "?final=490"). `cut`: an old collector's list may stop at `cap`
 * (the current one sends every row with its snapshot's `builtAt`). Never from the browser's cache.
 * Throws a BoardReadError on a failed answer or none within `timeoutMs`, as the board wants to say so.
 */
export async function fetchAllRows(
  root: string,
  query = '',
  o: { signal?: AbortSignal; cap?: number; timeoutMs?: number } = {}
): Promise<{ rows: BoardRow[]; cut: boolean }> {
  return withBoardTimeout(async signal => {
    const res = await fetch(`${root}/all${query}`, { cache: 'no-cache', signal });
    if (!res.ok) throw new BoardReadError('read', `the leaderboard answered ${res.status}`);
    const data = await boardJson<{ rows?: BoardRow[]; builtAt?: number }>(res);
    if (!data || typeof data !== 'object')
      throw new BoardReadError('read', 'the leaderboard sent something that is not the board');
    const rows = normalizeBoardRows<BoardRow>(data.rows);
    return { rows, cut: typeof data.builtAt !== 'number' && o.cap !== undefined && rows.length >= o.cap };
  }, o);
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
  // Each read has its own limit (withBoardTimeout), so neither can hold the other past it.
  const timeoutMs = o.timeoutMs ?? BOARD_TIMEOUT_MS;
  const held = recentAll(o.root, ALL_FRESH_MS, o.now ?? Date.now());
  const [mine, all] = await Promise.all([
    o.token ? fetchMineRows(o.root, o.token, { timeoutMs }) : Promise.resolve(null),
    held
      ? Promise.resolve(held)
      : fetchAllRows(o.root, '', { timeoutMs }).then(
          a => {
            rememberAll(o.root, a.rows);
            return a.rows;
          },
          () => [] as BoardRow[]
        ),
  ]);
  return myBoardRows(all, mine, o.look(mine));
}
