import { describe, expect, it } from 'vitest';
import { startLines } from './nowStart';
import type { NowPlan } from './nowPlan';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Oct 15, 2:40 pm Denver
const START = Date.UTC(2026, 9, 31, 0, 0) / 1000; // Oct 30, 6:00 pm Denver
const H = 3600;
const p = (o: Partial<NowPlan>): NowPlan => ({
  goal: 'fastest',
  deadline: null,
  chain: [198, 490],
  end: START + 500 * H,
  endTE: 490,
  legs: null,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: NOW * 1000,
  planStart: START,
  spareHours: null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
  ...o,
});

describe('not on virtue yet: each goal from its saved plan', () => {
  it('"If you start <date>: …" per goal, and what has nothing saved', () => {
    const lines = startLines(
      [
        { key: 'fastest-490', name: 'Race to 490', goal: 'fastest', target: 490, plan: p({}) },
        {
          key: 'eggday-2027',
          name: 'Egg Day 2027',
          goal: 'date',
          target: 490,
          plan: p({ goal: 'date', endTE: 313.4, exact: false }),
        },
        { key: 'date-1', name: 'By Mar 3, 2027', goal: 'date', target: 490, plan: null },
      ],
      NOW,
      ZONE
    ).map(l => l.text);
    expect(lines[0]).toBe('If you start Oct 30 at 6:00 pm: 490 on Nov 20 at 1:00 pm (Race to 490, simulator check)');
    expect(lines[1]).toBe('If you start Oct 30 at 6:00 pm: Egg Day 2027 TE 313 (instant answer)');
    expect(lines[2]).toBe('By Mar 3, 2027: no start time is priced yet');
  });

  it('nothing saved at all: no lines (the card says no start time is priced yet)', () => {
    expect(
      startLines([{ key: 'fastest-490', name: 'Race to 490', goal: 'fastest', target: 490, plan: null }], NOW, ZONE)
    ).toEqual([]);
  });
});
