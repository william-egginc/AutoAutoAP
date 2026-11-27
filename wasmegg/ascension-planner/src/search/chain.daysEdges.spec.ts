/**
 * Days off and no-prestige days at the edges, through the searches' chain evaluator (search/chain.ts: Fast, Exact
 * and Custom price every route with it). A player's Safari, 24 Oct 2026: By a date on Egg Day 2027, hours 7:00 am to
 * 5:00 am (America/Denver), no-prestige days 29-31 Oct and 22-24 Nov 2026, a day off on 27 Oct 2027 (after the
 * deadline): "I took a day off and it broke the simulator". `runLeg` is the toy of chain.timeoff.spec.ts (one TE a
 * day, a build needs two days), so every instant is checkable by hand.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SearchInputs, TimeOffWindow } from './types';
import { timeOffWindows } from './timeOff';
import { eggDaySeconds } from '@/lib/eggDay';

const DAY = 86400;
const BUILD = 2 * DAY;
const calls: { start: number; allowContinue: boolean }[] = [];

vi.mock('./leg', () => ({
  LAST_DATEABLE_SECONDS: 8.64e12,
  saveSiloSeconds: () => 12 * 3600,
  farmLaying: () => null,
  runLeg: (
    _inputs: unknown,
    _state: unknown,
    start: number,
    target: number,
    allowContinue: boolean,
    te: number,
    _idx: number,
    endOverride?: number
  ) => {
    calls.push({ start, allowContinue });
    const summary = (end: number, endTE: number) => ({
      endTE,
      endTime: end,
      startTime: start,
      totalDurationSeconds: end - start,
      maxELR: 1,
      tier13Unlocked: false,
    });
    if (endOverride !== undefined) {
      if (endOverride - start < BUILD) return null;
      return { summary: summary(endOverride, te + Math.floor((endOverride - start) / DAY)), key: '1-sale', nextState: {}, shifts: [] };
    }
    return {
      summary: summary(start + (target - te) * DAY, target),
      key: allowContinue ? 'continue' : '1-sale',
      nextState: {},
      shifts: [],
    };
  },
}));

const { createChainEvaluator } = await import('./chain');

const TZ = 'America/Denver';
const START = Date.parse('2026-10-24T20:00:00Z') / 1000; // Sat 24 Oct 2026, 2:00 pm in Denver
const at = (d: number) => START + d * DAY;
const DEADLINE = eggDaySeconds(2027);
const evaluate = (chain: number[], o: { timeOff?: TimeOffWindow[]; noPrestige?: TimeOffWindow[] } = {}) => {
  calls.length = 0;
  const inputs = {
    baseState: {},
    planStart: START,
    currentTE: 90,
    final: 490,
    timeOff: o.timeOff ?? [],
    noPrestige: o.noPrestige ?? [],
  } as unknown as SearchInputs;
  return createChainEvaluator(inputs).evaluate(chain);
};
const same = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));

describe('the searches with days at the edges', () => {
  it('the player’s exact setup: a route that ends before Egg Day 2027 is priced, the day off after it untouched', () => {
    const timeOff = timeOffWindows([{ from: '2027-10-27', to: '2027-10-27' }], TZ);
    const noPrestige = timeOffWindows(
      [
        { from: '2026-10-29', to: '2026-10-31' },
        { from: '2026-11-22', to: '2026-11-24' },
      ],
      TZ
    );
    const r = evaluate([100, 150, 200], { timeOff, noPrestige })!;
    expect(r).not.toBeNull();
    expect(r.legs.every(l => !l.timeOff)).toBe(true);
    expect(START + r.seconds).toBeLessThan(DEADLINE);
    // No prestige on the no-prestige days.
    for (const l of r.legs.slice(1)) {
      const s = l.startTime ?? NaN;
      for (const w of noPrestige) expect(s >= w.from && s < w.to).toBe(false);
    }
  });

  it('time off after the deadline changes nothing for a route that ends before it, to the second', () => {
    const after = timeOffWindows([{ from: '2027-10-27', to: '2027-10-27' }], TZ);
    same(evaluate([100, 150], { timeOff: after }), evaluate([100, 150]));
  });

  it('no-prestige days after the deadline change nothing, to the second', () => {
    const after = timeOffWindows([{ from: '2027-10-27', to: '2027-10-29' }], TZ);
    same(evaluate([100, 150], { noPrestige: after }), evaluate([100, 150]));
  });

  it('a single day off: the ascension ends at its start, the rebuild starts the next day', () => {
    const w = timeOffWindows([{ from: '2026-11-02', to: '2026-11-02' }], TZ);
    const r = evaluate([120], { timeOff: w })!;
    expect(r.legs.map(l => l.timeOff)).toEqual(['stopped', 'restarted']);
    expect(r.legs[0].endTime).toBe(w[0].from);
    expect(r.legs[1].startTime).toBe(w[0].to);
  });

  it('overlapping and back-to-back days off, as given, price as the one stretch they make', () => {
    const one: TimeOffWindow[] = [{ from: at(10), to: at(15) }];
    const overlap: TimeOffWindow[] = [
      { from: at(10), to: at(13) },
      { from: at(12), to: at(15) },
    ];
    const backToBack: TimeOffWindow[] = [
      { from: at(10), to: at(13) },
      { from: at(13), to: at(15) },
    ];
    const merged = evaluate([120], { timeOff: one })!;
    expect(merged.legs[1].startTime).toBe(at(15));
    same(evaluate([120], { timeOff: overlap }), merged);
    same(evaluate([120], { timeOff: backToBack }), merged);
    // Through timeOffWindows (as the page sends them) they are one stretch already.
    expect(
      timeOffWindows(
        [
          { from: '2026-11-03', to: '2026-11-05' },
          { from: '2026-11-06', to: '2026-11-07' },
        ],
        TZ
      )
    ).toHaveLength(1);
  });

  it('a plan start inside overlapping days off waits for the last of them', () => {
    const r = evaluate([100], {
      timeOff: [
        { from: at(-1), to: at(2) },
        { from: at(1), to: at(4) },
      ],
    })!;
    expect(r.legs[0].startTime).toBe(at(4));
    expect(calls[0].allowContinue).toBe(false);
  });
});
