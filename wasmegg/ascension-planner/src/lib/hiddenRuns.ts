/**
 * @module hiddenRuns
 * @description The board's side of "Hide from the public": which of the viewer's runs are hidden right
 * now, the optimistic change while a call is out, and what to say afterwards. No Vue, no fetch: the
 * HTTP is search/hideRuns.ts, the buttons are LeaderboardPanel / LeaderboardRunDetail.
 *
 * WHY OPTIMISTIC. The collector drops a hidden run from /all at once at the edge that took the call,
 * but another edge can keep serving its cached /all for up to a minute, and /mine reads the same
 * snapshots. So a refetch is no proof either way: the board marks the run itself the moment the player
 * clicks (an "override"), puts it back if the call fails, and keeps the override after a success
 * whatever a refetch says, until the next click on that run. Only this browser's code can hide or show
 * these runs, so nothing else changes them behind the board's back.
 */
import type { InjectionKey } from 'vue';
import type { BoardRow } from './leaderboardRank';
import type { HideResult } from '@/search/hideRuns';

/** id -> hidden, for the runs the board changed itself. Wins over what /mine said. */
export type HideOverrides = ReadonlyMap<string, boolean>;

/** The viewer's runs hidden right now: hidden by /mine unless the board changed them since. */
export function hiddenIdSet(mine: readonly BoardRow[] | null | undefined, overrides: HideOverrides): Set<string> {
  const out = new Set<string>();
  for (const r of mine ?? []) if (r?.id && r.hidden) out.add(r.id);
  for (const [id, hidden] of overrides) {
    if (hidden) out.add(id);
    else out.delete(id);
  }
  return out;
}

/** /mine's rows with `hidden` as the board knows it now (overrides applied). */
export function withHidden<T extends BoardRow>(mine: readonly T[], hidden: ReadonlySet<string>): T[] {
  return mine.map(r => {
    const h = !!r.id && hidden.has(r.id);
    return !!r.hidden === h ? r : { ...r, hidden: h };
  });
}

/**
 * The click: the overrides with `ids` set to `hidden` (what the board shows while the call is out),
 * and what each of those ids was before, for `settleHidden` to put back.
 */
export function markHidden(
  overrides: HideOverrides,
  ids: readonly string[],
  hidden: boolean
): { next: Map<string, boolean>; previous: Map<string, boolean | undefined> } {
  const next = new Map(overrides);
  const previous = new Map<string, boolean | undefined>();
  for (const id of ids) {
    if (!previous.has(id)) previous.set(id, overrides.get(id));
    next.set(id, hidden);
  }
  return { next, previous };
}

/**
 * The overrides once the call has answered. `current` is what they are now (another call may have
 * landed meanwhile), `previous` what `markHidden` returned for this one.
 *  - a success keeps the runs the collector moved or found already so (`reply.ids`) and puts every
 *    other asked-for run back as it was (`missing`: not saved yet, or not this code's);
 *  - anything else puts every asked-for run back.
 */
export function settleHidden(
  current: HideOverrides,
  previous: ReadonlyMap<string, boolean | undefined>,
  hidden: boolean,
  result: HideResult
): Map<string, boolean> {
  const next = new Map(current);
  const done = new Set(result.kind === 'ok' ? result.reply.ids : []);
  for (const [id, was] of previous) {
    if (done.has(id)) continue;
    if (was === undefined) next.delete(id);
    else next.set(id, was);
  }
  // `all: true` answers ids the board may not have known (a run /mine had not shown yet).
  for (const id of done) next.set(id, hidden);
  return next;
}

/** "Try again in 3 minutes" from a retryAfter in seconds (hours past two hours). */
export function retryText(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 'Try again in a few minutes.';
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes >= 120) return `Try again in ${Math.ceil(minutes / 60)} hours.`;
  return `Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

export type HideTone = 'ok' | 'warn' | 'error';
export interface HideStatus {
  text: string;
  tone: HideTone;
}

/** What to say after a hide (`hidden: true`) or a show (`false`) call answered `result`. */
export function hideStatus(result: HideResult, hidden: boolean, opts: { all?: boolean } = {}): HideStatus {
  switch (result.kind) {
    case 'ok': {
      const { reply } = result;
      const done = reply.ids.length;
      const missing = reply.missing?.length ?? 0;
      if (!done && missing) return { text: 'Not found yet, try again in a moment.', tone: 'warn' };
      if (opts.all && !done) {
        return {
          text: hidden ? 'You have no runs on the Leaderboard to hide.' : 'None of your runs are hidden.',
          tone: 'ok',
        };
      }
      const head = hidden
        ? 'Hidden. It can take up to a minute to leave the public Leaderboard.'
        : 'Showing again. It can take up to a minute to be back on the public Leaderboard.';
      const tail = [
        missing
          ? `${missing === 1 ? 'One run was' : `${missing} runs were`} not found yet, try again in a moment.`
          : '',
        reply.more ? 'Some runs are left: press it again to do the rest.' : '',
      ].filter(Boolean);
      return { text: [head, ...tail].join(' '), tone: tail.length ? 'warn' : 'ok' };
    }
    case 'rate':
      return {
        text: result.dailyCap
          ? `That's as many hides and shows as one account can make in a day. ${retryText(result.retryAfter)}`
          : `Too many tries just now. ${retryText(result.retryAfter)}`,
        tone: 'warn',
      };
    case 'bad':
      return {
        text: result.problems.includes('no owner code')
          ? "This browser didn't send these runs, so it can't hide them."
          : "The Leaderboard didn't accept that. Reload the page and try again.",
        tone: 'error',
      };
    case 'network':
      return { text: "Couldn't reach the leaderboard. Check your connection and try again.", tone: 'error' };
    case 'http':
      return { text: `The Leaderboard answered ${result.status}. Try again later.`, tone: 'error' };
  }
}

/**
 * What LeaderboardPanel provides to the run details under it (LeaderboardRunDetail), so the action
 * reaches every tab's details without threading props through LeaderboardPlanList. Absent (no
 * provider), the details show no hide action and plain CSV links, as before.
 */
export interface HideControl {
  /** Sent with this browser's code for the loaded account (GET /mine). */
  isMine(id: string | undefined): boolean;
  /** Hidden from the public right now (as the board knows it). */
  isHidden(id: string | undefined): boolean;
  /** A hide or show call for this run is out. */
  isBusy(id: string | undefined): boolean;
  /** Hide (`true`) or show again (`false`) these runs of the viewer's. */
  setHidden(ids: readonly string[], hidden: boolean): Promise<void>;
  /** Save a run's CSV fetched with the code (a hidden run's plain link answers 403). */
  downloadCsv(id: string): Promise<void>;
}

export const HIDE_CONTROL: InjectionKey<HideControl> = Symbol('hideControl');
