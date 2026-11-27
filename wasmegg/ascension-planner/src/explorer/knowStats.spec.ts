import { describe, expect, it } from 'vitest';
import { knowStats, byDateEntries, startFits, measuredOnLine, eggDayHeadline } from './knowStats';
import { eggDaySeconds } from '@/lib/eggDay';
import { SIM_VERSION } from '@/search/simVersion';
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
    // Egg Day 2027 itself: the list is Egg Day only (review IN-6).
    const DEADLINE = eggDaySeconds(2027);
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

    it('is Egg Day only: another date, or another year\'s Egg Day, is not in the list (review IN-6)', () => {
      const egg = bd('e', { nickname: 'Allan', artifacts: ['x'] });
      const dec25 = bd('d', { nickname: 'Techy', artifacts: ['t'], deadline: DEADLINE + 164 * 86_400, deadlineAscendAt: DEADLINE + 164 * 86_400 - 3600 });
      const nineAm = bd('n', { nickname: 'Chi', artifacts: ['c'], deadline: DEADLINE + 3600, deadlineAscendAt: DEADLINE + 1800 });
      const next = eggDaySeconds(2028);
      const nextYear = bd('y', { nickname: 'Far', artifacts: ['f'], deadline: next, deadlineAscendAt: next - 3600 });
      expect(byDateEntries([egg, dec25, nineAm, nextYear], NOW).map(e => e.label)).toEqual(['Allan']);
    });

    it('drops the anonymous lines: they cannot be told apart from a named player\'s own anonymous sends (review IN-6)', () => {
      const named = bd('n1', { nickname: 'Allan', artifacts: ['x'] });
      const anon = bd('a1', { artifacts: ['q'], nickname: undefined });
      expect(byDateEntries([named, anon], NOW).map(e => e.label)).toEqual(['Allan']);
    });

    it('one line per player, not one per owner code: a player\'s codes are joined (LB-1, review IN-6)', () => {
      const a = bd('a', { nickname: 'Allan', artifacts: ['x'], acct: 'h1' });
      const b = bd('b', { nickname: 'Allan', artifacts: ['x'], acct: 'h2', chain: [230, 340], finalTE: 340 });
      const labels = byDateEntries([a, b], NOW).map(e => e.label);
      expect(labels.filter(l => l.startsWith('Allan'))).toHaveLength(1);
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

describe('measuredOn (review IN-3, 15 Nov 2026): the runs counted by the simulator that priced them', () => {
  const none = { byId: new Map(), bestByAccount: new Map() } as unknown as FinishJudgement;
  const stamped = (id: string, simVersion?: string) => row(id, { nickname: id, simVersion } as Partial<CollectorRow>);

  it('groups by stamp: no stamp first (before the first stamp day), then each stamp by name, oldest first', () => {
    const rows = [
      stamped('a'),
      stamped('b'),
      stamped('c', '2026-10-21-egg-beta2'),
      stamped('d', '2026-10-13-lowte-gate'),
      stamped('e', '2026-10-13-lowte-gate'),
    ];
    const s = knowStats(rows, none, new Set());
    expect(s.measuredOn).toEqual([
      { label: 'before Oct 13', runs: 2 },
      { label: 'lowte-gate', runs: 2 },
      { label: 'egg-beta2', runs: 1 },
    ]);
    expect(measuredOnLine(s.measuredOn)).toBe(
      "Measured on: before Oct 13 (2 runs), lowte-gate (2), egg-beta2 (1); none yet on this site's simulator."
    );
  });

  it("names this site's simulator when it has runs, and drops 'none yet'", () => {
    const s = knowStats([stamped('a'), stamped('b', SIM_VERSION)], none, new Set());
    expect(s.measuredOn).toEqual([
      { label: 'before Oct 13', runs: 1 },
      { label: "this site's simulator", runs: 1, current: true },
    ]);
    expect(measuredOnLine(s.measuredOn)).toBe("Measured on: before Oct 13 (1 run), this site's simulator (1).");
  });

  it('says nothing with no runs', () => {
    expect(knowStats([], none, new Set()).measuredOn).toEqual([]);
    expect(measuredOnLine([])).toBe('');
  });
});

describe('the Egg Day headline is counted from the list (Words, 15 Nov 2026)', () => {
  const e = (from: number, reaches: number, ascensions: number) => ({ label: 'x', from, reaches, ascensions });
  it('several lines: the range of gains and of ascensions', () => {
    expect(eggDayHeadline([e(200, 300, 3), e(170, 305, 5), e(190, 300, 4)], 2027)).toBe('By Egg Day 2027, the accounts here gain 100-135 TE, with 3-5 ascensions.');
  });
  it('one line: singular account, "gains", the number once', () => {
    expect(eggDayHeadline([e(200, 320, 4)], 2027)).toBe('By Egg Day 2027, the one account here gains 120 TE, with 4 ascensions.');
    expect(eggDayHeadline([e(200, 320, 1)], 2028)).toBe('By Egg Day 2028, the one account here gains 120 TE, with 1 ascension.');
  });
  it('equal ends collapse to one number', () => {
    expect(eggDayHeadline([e(200, 320, 4), e(180, 300, 4)], 2027)).toBe('By Egg Day 2027, the accounts here gain 120 TE, with 4 ascensions.');
  });
  it('none: no headline, and nothing about gear', () => {
    expect(eggDayHeadline([], 2027)).toBeNull();
    expect(eggDayHeadline([e(200, 320, 4)], 2027)).not.toMatch(/geared/);
  });
  it('the stats carry the year of that Egg Day', () => {
    const s = knowStats([], { byId: new Map(), bestByAccount: new Map() }, new Set(), [], Date.UTC(2026, 10, 15));
    expect(s.eggDayYear).toBe(2027);
  });
});
