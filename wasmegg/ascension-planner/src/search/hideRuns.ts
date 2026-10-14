/**
 * @module hideRuns
 * @description "Hide from the public" and "Show again": the collector calls, with an injected fetch.
 *
 * `POST /hide` with ONE owner code in `x-owner-token` (search/owner.ts `existingOwnerToken`, the code
 * this browser holds for the loaded account) and `{ids: [...], hidden}` or `{all: true, hidden}`. The
 * collector proves each run is the code's on the full hash; a run that is not the code's and one that
 * does not exist (or is too new to be on the board yet) both come back in `missing`. Nothing is ever
 * deleted. See collector/README.md, "Hidden rows".
 *
 * A hidden run's CSV is its owner's alone: `GET /csv?id=` answers 403 unless the same code comes with
 * it, so a plain download link would fail for the owner too. `fetchOwnCsv` sends the code.
 *
 * Every function here answers rather than throws for anything the collector or the network can do, so
 * the board can say what happened in plain words (lib/hiddenRuns.ts `hideStatus`).
 */

/** At most this many runs a call (the collector's MAX.HIDE_IDS). */
export const HIDE_MAX_IDS = 50;

/** The collector's 200 reply. */
export interface HideReply {
  ok: true;
  /** The state asked for. */
  hidden: boolean;
  /** Every run now in that state. */
  ids: string[];
  /** The ones this call moved. */
  changed: string[];
  /** Asked-for runs not found, or not this code's (one answer for both). */
  missing?: string[];
  /** `all` left runs for another call. */
  more?: boolean;
}

export type HideResult =
  | { kind: 'ok'; reply: HideReply }
  /** 429: the shared rate limit, or `dailyCap` (200 hides and shows a UTC day from one code). Seconds. */
  | { kind: 'rate'; retryAfter: number | null; dailyCap: boolean }
  /** 400, or refused here before sending (no code, more than one, bad ids). */
  | { kind: 'bad'; message: string; problems: string[] }
  /** Any other answer. */
  | { kind: 'http'; status: number }
  /** No answer at all. */
  | { kind: 'network'; message: string };

export type HideTarget = { ids: readonly string[] } | { all: true };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const CODE = /^[a-f0-9]{32}$/;
/** The collector's row id shape (rowId in worker.js). */
const ROW_ID = /^[a-f0-9-]{4,40}$/;

/** One owner code, exactly. A comma list (what GET /mine takes) is refused: /hide proves one owner. */
export function isOneCode(token: string | null | undefined): token is string {
  return typeof token === 'string' && CODE.test(token);
}

/** The JSON body, or the reasons it cannot be sent. Exported for the tests. */
export function hideBody(target: HideTarget, hidden: boolean): { body: string } | { problems: string[] } {
  if ('all' in target) return { body: JSON.stringify({ all: true, hidden }) };
  const ids = [...new Set(target.ids)];
  const problems: string[] = [];
  if (!ids.length) problems.push('no runs named');
  if (ids.length > HIDE_MAX_IDS) problems.push(`at most ${HIDE_MAX_IDS} runs at a time`);
  if (ids.some(id => typeof id !== 'string' || !ROW_ID.test(id))) problems.push('a run id is not one');
  return problems.length ? { problems } : { body: JSON.stringify({ ids, hidden }) };
}

/**
 * Hide (`hidden: true`) or show again (`false`) the runs in `target`, with ONE owner code. Never throws.
 */
export async function setRunsHidden(opts: {
  base: string;
  token: string | null | undefined;
  target: HideTarget;
  hidden: boolean;
  fetch?: FetchLike;
}): Promise<HideResult> {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  if (!isOneCode(opts.token)) {
    return { kind: 'bad', message: 'This browser holds no code for this account.', problems: ['no owner code'] };
  }
  const built = hideBody(opts.target, opts.hidden);
  if ('problems' in built) return { kind: 'bad', message: built.problems.join('; '), problems: built.problems };
  let res: Response;
  try {
    res = await doFetch(`${opts.base.replace(/\/$/, '')}/hide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-owner-token': opts.token },
      body: built.body,
      cache: 'no-store',
    });
  } catch (e) {
    return { kind: 'network', message: e instanceof Error ? e.message : String(e) };
  }
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
  } catch {
    /* no JSON: judged by the status alone */
  }
  if (res.status === 429) {
    const after = Number(data.retryAfter);
    return {
      kind: 'rate',
      retryAfter: Number.isFinite(after) && after > 0 ? after : null,
      dailyCap: data.dailyCap === true,
    };
  }
  if (res.status === 400) {
    const problems = Array.isArray(data.problems)
      ? data.problems.filter((p): p is string => typeof p === 'string')
      : [];
    return { kind: 'bad', message: typeof data.error === 'string' ? data.error : 'refused', problems };
  }
  if (!res.ok || data.ok !== true) return { kind: 'http', status: res.status };
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const missing = list(data.missing);
  return {
    kind: 'ok',
    reply: {
      ok: true,
      hidden: data.hidden === true,
      ids: list(data.ids),
      changed: list(data.changed),
      ...(missing.length ? { missing } : {}),
      ...(data.more === true ? { more: true } : {}),
    },
  };
}

/**
 * One run's CSV with the owner code, as a Blob (a .csv.gz). For the owner's own HIDDEN run, whose plain
 * link answers 403; a public run needs no code. Throws an Error with a plain message.
 */
export async function fetchOwnCsv(opts: {
  base: string;
  id: string;
  token: string | null | undefined;
  fetch?: FetchLike;
}): Promise<Blob> {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  if (!isOneCode(opts.token))
    throw new Error('This browser holds no code for this account, so it cannot fetch this CSV.');
  let res: Response;
  try {
    res = await doFetch(`${opts.base.replace(/\/$/, '')}/csv?id=${encodeURIComponent(opts.id)}`, {
      headers: { 'x-owner-token': opts.token },
      cache: 'no-store',
    });
  } catch {
    throw new Error("Couldn't reach the board. Check your connection and try again.");
  }
  if (res.status === 404) throw new Error('This run has no CSV stored.');
  if (res.status === 403) throw new Error("The board didn't accept this browser's code for this run.");
  if (!res.ok) throw new Error(`The board answered ${res.status} for this CSV.`);
  return res.blob();
}

/** The file name the collector's own link gives a run's CSV. */
export function csvFileName(id: string): string {
  return `chains-${id}.csv.gz`;
}
