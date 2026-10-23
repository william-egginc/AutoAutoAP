/**
 * RIGHT NOW AFTER CHECK EXACTLY (part B of the instant-first redesign, wireframes/price-route-v2 R1 and R2, Jordan 23
 * Oct 2026). My runs' Right now follows the INSTANT answer for a goal until a Fast, Exact or Custom search has a
 * finished result for the same goal on the same save; then it follows that result, when the result is better:
 *
 *   By a date (Egg Day too)  the result makes the date (lib/eggDayRule.ts `finishesBefore`). It replaces the instant
 *                            answer even with a TE or two less: it is priced on the player's account, the instant
 *                            answer is not (Jordan's answer 1).
 *   Fastest                  the result finishes sooner than the instant answer, or at the same minute.
 *
 * Otherwise the instant answer keeps driving and the card says why in one line (`keepWords`). "Go back to the instant
 * answer" is one press away either way (useNowPage.ts).
 *
 * Where a result comes from: the chain-search store while it holds one (`liveSearchResult`, the same rule as the
 * instant card's pointer, InstantRoute.vue `searchFound`), and the instant answer's snapshot, which keeps the last
 * one as `search` (search/instantSnapshot.ts; written by InstantRoute and by My runs). Pure.
 */
import type { LegSummary } from '@/search/types';
import { finishesBefore, lateMarker, type DeadlineKind } from './eggDayRule';
import { foundLevel, type FoundLevel, type FoundResult } from './searchPointer';
import { planFromSnapshot, type NowPlan, type SnapLike } from './nowPlan';

/** A finished search result for one goal, as the snapshot keeps it. */
export interface SnapSearch extends FoundResult {
  /** The simulator's legs on the account (shifts inside). */
  legs: LegSummary[];
  /** When it was found, ms. */
  at: number;
  /** The plan start it was priced from, unix seconds. */
  planStart: number;
}

/** What `liveSearchResult` reads of the chain-search store (InstantRoute and useNowPage hand it over). */
export interface LiveSearchInput {
  goal: 'fastest' | 'date';
  /** By a date: the goal's deadline. */
  deadline: number | null;
  /** Fastest: the goal's target. */
  target: number;
  /** The TE the loaded save has now (whole). */
  currentTE: number;
  /** A result tagged for another account than the loaded one is not this save's ('' on either side: it is). */
  ownerOk: (owner: string) => boolean;
  fastest: {
    running: boolean;
    bestDays: number;
    bestChain: readonly number[];
    bestLegs: readonly LegSummary[] | null;
    planStart: number;
    custom: boolean;
    effort: string | null | undefined;
    at: number;
    owner: string;
  };
  date: {
    running: boolean;
    result: {
      deadline: number;
      te: number;
      simple?: boolean;
      level?: string | null;
      at?: number;
      planStart: number;
      routes: readonly { chain: readonly number[]; reachAt: number; legs?: readonly LegSummary[] | null }[];
    } | null;
    owner: string;
  };
}

/** The store's finished result for this goal on this save, or null (a running search's best so far is not one). */
export function liveSearchResult(i: LiveSearchInput): SnapSearch | null {
  const te = Math.floor(i.currentTE);
  if (i.goal === 'date') {
    const r = i.date.result;
    const best = r?.routes[0];
    if (i.date.running || !r || !best || !i.deadline || r.deadline !== i.deadline) return null;
    if (Math.floor(r.te) !== te || !i.ownerOk(i.date.owner)) return null;
    return {
      level: foundLevel({ custom: !r.simple, effort: r.level }),
      chain: [...best.chain],
      end: best.reachAt,
      endTE: best.chain[best.chain.length - 1],
      legs: [...(best.legs ?? [])],
      at: r.at ?? 0,
      planStart: r.planStart,
    };
  }
  const f = i.fastest;
  const chain = f.bestChain;
  if (f.running || !(f.bestDays > 0) || !chain.length) return null;
  if (chain[chain.length - 1] !== i.target || !(chain[0] > te) || !i.ownerOk(f.owner)) return null;
  return {
    level: foundLevel({ custom: f.custom, effort: f.effort }),
    chain: [...chain],
    end: f.planStart + f.bestDays * 86400,
    endTE: i.target,
    legs: [...(f.bestLegs ?? [])],
    at: f.at,
    planStart: f.planStart,
  };
}

/** The newer of two results (by when found); either may be null. */
export function newerSearch(a: SnapSearch | null | undefined, b: SnapSearch | null | undefined): SnapSearch | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return b.at > a.at ? b : a;
}

/** A kept result that can be read back (an older or hand-edited snapshot may hold anything). */
export function readSearch(v: unknown): SnapSearch | null {
  const s = v as SnapSearch | null;
  if (!s || typeof s !== 'object' || !Array.isArray(s.chain) || !s.chain.length) return null;
  if (!Number.isFinite(s.end) || !Number.isFinite(s.endTE) || typeof s.at !== 'number') return null;
  if (s.level !== 'Fast' && s.level !== 'Exact' && s.level !== 'Custom') return null;
  return { ...s, legs: Array.isArray(s.legs) ? s.legs : [] };
}

/** Right now's plan from a search result: the simulator's times on the account (`exact`), `from` its level. */
export function planFromSearch(
  s: SnapSearch,
  goal: 'fastest' | 'date',
  deadline: number | null,
  common: Pick<NowPlan, 'meta' | 'whatIf'>
): NowPlan {
  return {
    goal,
    deadline: goal === 'date' ? deadline : null,
    chain: [...s.chain],
    end: s.end,
    endTE: s.endTE,
    legs: s.legs.length ? [...s.legs] : null,
    tableLegs: null,
    exact: true,
    from: { level: s.level, at: s.at },
    instantTE: null,
    calculatedAt: s.at,
    planStart: Number.isFinite(s.planStart) ? s.planStart : null,
    spareHours: goal === 'date' && deadline ? (deadline - s.end) / 3600 : null,
    runnerUpHours: null,
    runnerUp: null,
    meta: common.meta,
    whatIf: common.whatIf,
  };
}

/** Why a result does or doesn't take over from the instant answer. */
export type Takeover =
  /** By a date: it makes the date. */
  | 'makes-date'
  /** Fastest: it finishes sooner (or at the same minute). */
  | 'sooner'
  /** There is no instant plan for the goal to compare with: the result drives. */
  | 'no-instant'
  /** By a date: it lands after the date. The instant answer keeps driving. */
  | 'misses-date'
  /** Fastest: it finishes later than the instant answer. The instant answer keeps driving. */
  | 'later';

/** The rule at the top. `instant` null: the goal has no instant plan. */
export function searchTakeover(instant: Pick<NowPlan, 'end'> | null, search: Pick<NowPlan, 'goal' | 'end' | 'deadline'>): Takeover {
  if (search.goal === 'date') {
    if (search.deadline != null && !finishesBefore(search.end, search.deadline)) return 'misses-date';
    return instant ? 'makes-date' : 'no-instant';
  }
  if (!instant) return 'no-instant';
  return search.end <= instant.end + 60 ? 'sooner' : 'later';
}

/** Whether that reason means the result drives Right now. */
export const takesOver = (t: Takeover): boolean => t === 'makes-date' || t === 'sooner' || t === 'no-instant';

/** "1.2 days", "22 min", "5 h" (a gap between two finishes). */
export function gapWords(seconds: number): string {
  const s = Math.abs(seconds);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  if (s < 24 * 3600) {
    const h = Math.round((s / 3600) * 10) / 10;
    return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} h`;
  }
  return `${(s / 86400).toFixed(1)} days`;
}

/** The pill: "from the instant answer" or "from your Fast run, on your account". */
export function sourcePill(level: FoundLevel | null): string {
  return level ? `from your ${level} run, on your account` : 'from the instant answer';
}

/**
 * The line under the pill when a result drives: why it replaced the instant answer, before "Go back to the instant
 * answer". By a date: "Makes the date on your account, so it replaces the instant answer for the same goal:"; Fastest:
 * "Finishes 1.2 days sooner than the instant answer for the same goal:" ("at the same time as" within the minute).
 */
export function replaceWords(t: Takeover, search: Pick<NowPlan, 'end'>, instant: Pick<NowPlan, 'end'> | null): string {
  if (t === 'makes-date') return 'Makes the date on your account, so it replaces the instant answer for the same goal:';
  if (t === 'sooner' && instant) {
    const gap = instant.end - search.end;
    return gap < 60
      ? 'Finishes when the instant answer does, on your account, so it replaces it for the same goal:'
      : `Finishes ${gapWords(gap)} sooner than the instant answer for the same goal:`;
  }
  return '';
}

/**
 * The one line when a result does NOT take over: "Your Fast run lands after Egg Day starts, so Right now follows
 * the instant answer." / "Your Fast run finishes 22 min later than the instant answer, so Right now follows the
 * instant answer." '' otherwise.
 */
export function keepWords(t: Takeover, level: FoundLevel, search: Pick<NowPlan, 'end'>, instant: Pick<NowPlan, 'end'> | null, kind: DeadlineKind): string {
  if (t === 'misses-date') return `Your ${level} run lands ${lateMarker(kind)}, so Right now follows the instant answer.`;
  if (t === 'later' && instant)
    return `Your ${level} run finishes ${gapWords(search.end - instant.end)} later than the instant answer, so Right now follows the instant answer.`;
  return '';
}

/** One goal's plans from one snapshot: the one that drives Right now, the instant one and the search's. */
export interface Driving {
  /** The plan Right now shows (null: neither). */
  plan: NowPlan | null;
  instant: NowPlan | null;
  search: NowPlan | null;
  /** Null without a search result. */
  takeover: Takeover | null;
  /** The player pressed "Go back to the instant answer" for this result. */
  wentBack: boolean;
}

/**
 * The plan a snapshot gives Right now for a goal: the search result's when it takes over (`searchTakeover`) and the
 * player hasn't gone back to the instant answer, else the instant answer's (`planFromSnapshot`). `live`: the store's
 * result for this goal, newer than the kept one. `back`: the result the player went back from (its `at`).
 */
export function drivingPlan(
  snap: SnapLike | null,
  goal: 'fastest' | 'date',
  deadline: number | null,
  o: { live?: SnapSearch | null; back?: number | null } = {}
): Driving {
  const instant = planFromSnapshot(snap, goal, deadline);
  const found = newerSearch(readSearch(snap?.search), o.live ?? null);
  if (!found) return { plan: instant, instant, search: null, takeover: null, wentBack: false };
  const search = planFromSearch(found, goal, deadline, { meta: snap?.meta ?? instant?.meta ?? null, whatIf: snap?.whatIf ?? null });
  const takeover = searchTakeover(instant, search);
  const wentBack = o.back != null && o.back === found.at && !!instant;
  return { plan: takesOver(takeover) && !wentBack ? search : instant, instant, search, takeover, wentBack };
}
