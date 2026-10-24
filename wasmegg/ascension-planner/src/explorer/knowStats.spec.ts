import { describe, expect, it } from 'vitest';
import { knowStats, byDateEntries, startFits } from './knowStats';
import type { CollectorRow } from './collector';
import type { FinishJudgement } from './analysis';

function row(id: string, over: Partial<CollectorRow>): CollectorRow {
  return {
    id,
    chain: [200, 490],
    ascensions: 2,
    currentTE: 150,
    finalTE: 490,
    chainsPriced: 1000,
    timezone: 'UTC',
    artifacts: [`a-${over.nickname ?? id}`],
    ...over,
  } as CollectorRow;
}

describe('knowStats', () => {
  const a = row('a', { nickname: 'A', ascensions: 6, currentTE: 130, clothedTE: 241.5 });
  const b = row('b', { nickname: 'B', ascensions: 3, currentTE: 199, clothedTE: 260 });
  const c = row('c', { nickname: 'B', ascensions: 3, currentTE: 400, deadline: 1, finalTE: 300 });
  const w = row('w', { nickname: 'A', currentTE: 20 });
  const judged = {
    byId: new Map(),
    bestByAccount: new Map([
      ['A', { row: a, start: 0, finish: 0 }],
      ['B', { row: b, start: 0, finish: 0 }],
    ]),
  } as unknown as FinishJudgement;

  it('counts the header from the rows', () => {
    const s = knowStats([a, b, w], judged, new Set(['w']), [c]);
    expect(s.runsTo490).toBe(3);
    expect(s.byDate).toBe(1);
    expect(s.te).toEqual({ min: 130, max: 199 });
    expect(s.plans).toBe(3000);
    expect(s.sweet).toEqual({ of: 1, total: 2 });
    expect(s.lowestCte).toBe(241.5);
  });

  it('says nothing it does not know', () => {
    const s = knowStats([], { byId: new Map(), bestByAccount: new Map() }, new Set());
    expect(s).toMatchObject({ runsTo490: 0, te: null, lowestCte: null, sweet: { of: 0, total: 0 } });
  });

  describe('By a date (Egg Day)', () => {
    const DEADLINE = 1_800_000_000;
    const NOW = (DEADLINE - 86_400 * 30) * 1000;
    const bd = (id: string, over: Partial<CollectorRow>) =>
      row(id, {
        deadline: DEADLINE,
        deadlineAscendAt: DEADLINE - 3600,
        currentTE: 200,
        chain: [230, 290, 335],
        finalTE: 335,
        ...over,
      });

    it('drops a start that does not fit the route', () => {
      expect(startFits({ currentTE: 200, chain: [230, 335] })).toBe(true);
      expect(startFits({ currentTE: 200, chain: [200, 335] })).toBe(false);
      expect(startFits({ currentTE: 200, chain: [190, 335] })).toBe(false);
      expect(startFits({ currentTE: 135, chain: [197, 330] })).toBe(true);
      expect(startFits({ currentTE: 100, chain: [197, 330] })).toBe(false);
      expect(startFits({ currentTE: 135, chain: [197, 330], finalTE: 135 })).toBe(false);
      expect(startFits({ currentTE: 200, chain: [] })).toBe(false);
    });

    it('lists each account once, highest TE first, naming the anonymous', () => {
      const good = bd('g', { nickname: 'Allan', artifacts: ['x'] });
      const better = bd('h', { nickname: 'Allan', artifacts: ['x'], chain: [230, 336], finalTE: 336 });
      const other = bd('o', { nickname: 'Fliris', artifacts: ['y'], currentTE: 170, chain: [200, 300], finalTE: 300 });
      const bad = bd('bad', { nickname: 'Bad', artifacts: ['z'], currentTE: 135, chain: [197, 335], finalTE: 135 });
      const entries = byDateEntries([good, better, other, bad], NOW);
      expect(entries.map(e => [e.label, e.from, e.reaches])).toEqual([
        ['Allan', 200, 336],
        ['Fliris', 170, 300],
      ]);
    });

    it('leaves out an answer whose last ascension misses the date', () => {
      const late = bd('l', { nickname: 'Late', artifacts: ['q'], deadlineAscendAt: DEADLINE + 60 });
      expect(byDateEntries([late], NOW)).toEqual([]);
    });

    it('counts the rows and accounts in the header stats', () => {
      const x = bd('x', { nickname: 'A', artifacts: ['x'] });
      const y = bd('y', { nickname: 'A', artifacts: ['x'] });
      const s = knowStats([a], judged, new Set(), [x, y], NOW);
      expect(s.byDate).toBe(2);
      expect(s.byDateAccounts).toBe(1);
      expect(s.eggDay).toHaveLength(1);
    });
  });
});
