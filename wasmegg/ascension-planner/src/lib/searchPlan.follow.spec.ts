/**
 * A new result when the player follows a route (lib/searchPlan.ts, 23 Oct 2026): the two paths ('takeover' without a
 * followed route, unchanged; 'prompt' with one), the "better" rule against the followed route, the prompt's words
 * (12-hour times), its id and "Keep mine" remembered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KEEP_MINE_KEY,
  betterRouteWords,
  betterThanFollowed,
  drivingPlan,
  followPrompt,
  keepMine,
  newResultPath,
  readKeptMine,
  resultId,
  type SnapSearch,
} from './searchPlan';
import { dateAt } from './eventWhen';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 23, 18) / 1000; // Fri Oct 23, 12:00 pm Denver
const H = 3600;
const D = 86400;
const when = (t: number) => dateAt(t, NOW, ZONE);
const DEADLINE = NOW + 30 * D;

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

describe('the two paths', () => {
  it('no followed route: takeover (the instant-first rule); a followed route: prompt', () => {
    expect(newResultPath(false)).toBe('takeover');
    expect(newResultPath(true)).toBe('prompt');
  });
  it('the takeover path is unchanged: a result that makes the date drives instead of the instant answer', () => {
    const snap = {
      at: NOW * 1000,
      result: { best: null, byAscensions: [], byDate: { chain: [200, 240], end: DEADLINE - 2 * D, legs: [{ to: 200, endTE: 200, start: NOW, end: NOW + D }, { to: 240, endTE: 240, start: NOW + D, end: DEADLINE - 2 * D }] } },
      exact: {},
    };
    const found: SnapSearch = { level: 'Fast', chain: [201, 239], end: DEADLINE - 3 * D, endTE: 239, legs: [], at: NOW * 1000 + 5, planStart: NOW };
    const d = drivingPlan(snap as never, 'date', DEADLINE, { live: found });
    expect(d.takeover).toBe('makes-date');
    expect(d.plan?.chain).toEqual([201, 239]);
  });
});

describe('better than the followed route', () => {
  it('Fastest: sooner by at least a minute', () => {
    expect(betterThanFollowed('fastest', null, { end: NOW + 10 * H, endTE: 490 }, { end: NOW + 11 * H, endTE: 490 })).toBe(true);
    expect(betterThanFollowed('fastest', null, { end: NOW + 10 * H - 30, endTE: 490 }, { end: NOW + 10 * H, endTE: 490 })).toBe(false);
    expect(betterThanFollowed('fastest', null, { end: NOW + 12 * H, endTE: 490 }, { end: NOW + 11 * H, endTE: 490 })).toBe(false);
    expect(betterThanFollowed('fastest', null, { end: NOW, endTE: 490 }, null)).toBe(false);
  });
  it('By a date: makes the date when the followed one does not; more TE; the same TE with more to spare', () => {
    const late = { end: DEADLINE + H, endTE: 250 };
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - H, endTE: 240 }, late)).toBe(true);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE + 2 * H, endTE: 260 }, late)).toBe(false);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - H, endTE: 241 }, { end: DEADLINE - 9 * H, endTE: 240 })).toBe(true);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - 9 * H, endTE: 239 }, { end: DEADLINE - H, endTE: 240 })).toBe(false);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - 5 * H, endTE: 240 }, { end: DEADLINE - H, endTE: 240 })).toBe(true);
    expect(betterThanFollowed('date', DEADLINE, { end: DEADLINE - H - 10, endTE: 240 }, { end: DEADLINE - H, endTE: 240 })).toBe(false);
  });
});

describe('the prompt', () => {
  const followed = { chain: [222, 490], at: NOW * 1000 - 60_000, finish: { end: NOW + 3 * D, endTE: 490 } };
  const candidate = { chain: [230, 490], end: NOW + 2 * D, endTE: 490, at: NOW * 1000, source: 'fast' as const, planStart: NOW };
  const base = { goalKey: 'fastest-490', goal: 'fastest' as const, deadline: null, followed, candidate, keptMine: [] as string[], when };

  it('asks with both finishes in 12-hour times', () => {
    const p = followPrompt(base)!;
    expect(p.words).toBe(
      "This is a better route than the one you're following (Oct 25 at 12:00 pm vs Oct 26 at 12:00 pm). Do you want to follow it?"
    );
    expect(p.chain).toEqual([230, 490]);
    expect(p.source).toBe('fast');
    expect(p.id).toBe(resultId('fastest-490', 'fast', [230, 490], NOW + 2 * D));
  });
  it('By a date says TE and spare', () => {
    expect(betterRouteWords('date', DEADLINE, { end: DEADLINE - 2.5 * D, endTE: 241 }, { end: DEADLINE + 3 * H, endTE: 240 }, when)).toBe(
      "This is a better route than the one you're following (241 TE, 2.5 days to spare vs 240 TE, lands after the date). Do you want to follow it?"
    );
  });
  it('not shown: no followed route, the same route, not newer than the follow, not better, or Keep mine pressed', () => {
    expect(followPrompt({ ...base, followed: null })).toBeNull();
    expect(followPrompt({ ...base, candidate: { ...candidate, chain: [222, 490] } })).toBeNull();
    expect(followPrompt({ ...base, candidate: { ...candidate, at: followed.at } })).toBeNull();
    expect(followPrompt({ ...base, candidate: { ...candidate, end: NOW + 4 * D } })).toBeNull();
    expect(followPrompt({ ...base, followed: { ...followed, finish: null } })).toBeNull();
    const id = followPrompt(base)!.id;
    expect(followPrompt({ ...base, keptMine: [id] })).toBeNull();
  });
  it('Keep mine is remembered in this browser per result; an instant answer\'s id leaves its time out', () => {
    keepMine('a');
    keepMine('b');
    keepMine('a');
    expect(readKeptMine()).toEqual(['b', 'a']);
    expect(JSON.parse(mem.get(KEEP_MINE_KEY)!)).toEqual(['b', 'a']);
    expect(resultId('fastest-490', 'instant', [230, 490], 1)).toBe(resultId('fastest-490', 'instant', [230, 490], 99999));
    expect(resultId('fastest-490', 'fast', [230, 490], 60)).not.toBe(resultId('fastest-490', 'fast', [230, 490], 6000));
  });
});
