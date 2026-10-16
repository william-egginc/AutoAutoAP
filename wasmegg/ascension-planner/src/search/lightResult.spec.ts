/**
 * Light's result, to send (search/lightResult.ts): which route, where it came from, its "already sent" key,
 * and when the Share box shows.
 */
import { describe, expect, it } from 'vitest';
import {
  lightBest,
  lightFromText,
  lightResultKey,
  lightSendLabel,
  lightShareShown,
  type LightResult,
} from './lightResult';
import type { Priced } from './strongerCheck';

const START = 1_800_000_000;
const DAY = 86400;
const priced = (chain: number[], days: number, endTE = chain[chain.length - 1]): Priced => ({
  chain,
  seconds: days * DAY,
  end: START + days * DAY,
  endTE,
});
const fastest = { kind: 'fastest' as const, target: 490 };

describe('lightBest', () => {
  it('Fastest: the soonest of the at-once routes and the earlier ones, with where it came from', () => {
    const r = lightBest({
      goal: fastest,
      atOnce: [priced([212, 300, 490], 700), null, priced([212, 280, 360, 490], 690)],
      earlier: [priced([212, 290, 490], 650)],
      planStart: START,
    })!;
    expect(r.best.chain).toEqual([212, 290, 490]);
    expect(r.best.from).toBe('earlier');
    expect(r.best.atOnce).toBe(false);
    // Every route it priced, the best first, for the CSV.
    expect(r.routes.map(p => p.chain.length)).toEqual([3, 3, 4]);
    expect(r.routes[0]).toBe(r.best);
    expect(r.planStart).toBe(START);
  });

  it('an at-once route wins as the instant answer, priced at once', () => {
    const r = lightBest({ goal: fastest, atOnce: [priced([212, 300, 490], 600)], earlier: [], planStart: START })!;
    expect(r.best.from).toBe('instant');
    expect(r.best.atOnce).toBe(true);
    expect(lightFromText(r)).toMatch(/instant answer's routes, priced ascending at once/);
  });

  it("a tie (under a minute) goes to the instant answer's route at once", () => {
    const r = lightBest({
      goal: fastest,
      atOnce: [priced([212, 300, 490], 600)],
      earlier: [{ ...priced([212, 290, 490], 600), end: START + 600 * DAY - 30 }],
      planStart: START,
    })!;
    expect(r.best.from).toBe('instant');
  });

  it('the same route at once and on the hour are two routes; the same one twice is one', () => {
    const p = priced([212, 300, 490], 600);
    const r = lightBest({ goal: fastest, atOnce: [p, p], earlier: [p], planStart: START })!;
    expect(r.routes).toHaveLength(2);
    expect(r.routes.map(x => x.atOnce)).toEqual([true, false]);
  });

  it('earlier routes priced as the answer starts them count as at once when that is "now"', () => {
    const r = lightBest({
      goal: fastest,
      atOnce: [],
      earlier: [priced([212, 490], 600)],
      planStart: START,
      handoffNow: true,
    })!;
    expect(r.best.atOnce).toBe(true);
  });

  it('By a date: the highest TE that makes the date, one TE lower included', () => {
    const deadline = START + 400 * DAY;
    const goal = { kind: 'date' as const, deadline };
    const r = lightBest({
      goal,
      atOnce: [priced([212, 310], 420), priced([212, 305], 390)],
      earlier: [priced([212, 300], 380)],
      lower: [priced([212, 309], 399)],
      planStart: START,
    })!;
    expect(r.best.chain).toEqual([212, 309]);
    expect(r.best.from).toBe('lower-te');
    expect(lightFromText(r)).toMatch(/one TE lower/);
    expect(lightSendLabel(r)).toBe('Send 309 TE by this date (Light)');
  });

  it('By a date: nothing that makes the date is no result', () => {
    const goal = { kind: 'date' as const, deadline: START + 100 * DAY };
    expect(lightBest({ goal, atOnce: [priced([212, 310], 420)], earlier: [], planStart: START })).toBeNull();
  });

  it('nothing priced is no result', () => {
    expect(lightBest({ goal: fastest, atOnce: [null, undefined], earlier: [], planStart: START })).toBeNull();
  });
});

describe('lightResultKey', () => {
  const r = lightBest({ goal: fastest, atOnce: [priced([212, 300, 490], 600)], earlier: [], planStart: START })!;
  it('is its own kind of key, and moves with the route, the time, how it was priced, the start and TE', () => {
    const k = lightResultKey(r, 200);
    expect(k.startsWith('light|fastest:490|212 300 490|')).toBe(true);
    expect(lightResultKey(r, 200)).toBe(k);
    expect(lightResultKey(r, 201)).not.toBe(k);
    expect(lightResultKey({ ...r, planStart: START + 3600 }, 200)).not.toBe(k);
    expect(lightResultKey({ ...r, best: { ...r.best, atOnce: false } }, 200)).not.toBe(k);
    expect(lightResultKey({ ...r, best: { ...r.best, seconds: r.best.seconds + 3600 } }, 200)).not.toBe(k);
    const date: LightResult = { ...r, goal: { kind: 'date', deadline: START + 900 * DAY } };
    expect(lightResultKey(date, 200)).toMatch(/^light\|date:/);
  });
});

describe('lightShareShown', () => {
  const r = lightBest({ goal: fastest, atOnce: [priced([212, 300, 490], 600)], earlier: [], planStart: START })!;
  const base = { level: 'light', state: 'done' as const, result: r, collector: true };
  it('only at Light, done, with a result and a board', () => {
    expect(lightShareShown(base)).toBe(true);
    expect(lightShareShown({ ...base, level: 'quick' })).toBe(false);
    expect(lightShareShown({ ...base, state: 'running' })).toBe(false);
    expect(lightShareShown({ ...base, state: 'idle' })).toBe(false);
    expect(lightShareShown({ ...base, state: 'error' })).toBe(false);
    expect(lightShareShown({ ...base, result: null })).toBe(false);
    expect(lightShareShown({ ...base, collector: false })).toBe(false);
  });
  it('Fastest says Light on the button', () => {
    expect(lightSendLabel(r)).toBe('Send this route (Light)');
  });
});
