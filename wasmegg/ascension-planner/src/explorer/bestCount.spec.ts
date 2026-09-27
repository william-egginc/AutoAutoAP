import { describe, it, expect } from 'vitest';
import { accountKey, judgeFinishes, searchGrade, type FinishJudgement, type SearchGrade } from './analysis';
import type { CollectorRow } from './collector';
import { DAY_MS } from '@/lib/leaderboardRank';
import {
  bestCountTable,
  cellTitle,
  COLLAPSE_AT,
  countColumns,
  fillBin,
  FILL_BINS,
  gearText,
  gradeStyle,
  searchWords,
  stepWords,
} from './bestCount';

/** Only the fields these modules read. */
function row(over: Partial<CollectorRow> & Pick<CollectorRow, 'chain' | 'currentTE'>): CollectorRow {
  return {
    schema: 5,
    ascensions: over.chain.length,
    durationDays: 800,
    startLocal: '',
    endLocal: '',
    timezone: 'America/Denver',
    finalTE: 490,
    effort: 'balanced',
    window: null,
    holdShifts: false,
    waitingHours: null,
    artifacts: ['T4L Gusset', 'T4L Puzzle cube'],
    stones: [],
    legs: [],
    chainsPriced: 100,
    submittedAt: '',
    id: Math.random().toString(36).slice(2),
    ...over,
  } as CollectorRow;
}

/** Plan starts on consecutive days at 10:00 in the default zone (America/Denver, MDT in September). */
const START = Date.parse('2026-09-01T16:00:00Z');
const dayOf = (n: number) => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);
const iso = (n: number) => new Date(START + n * DAY_MS + 5 * 60_000).toISOString();
/** A run planned to start on day `n`, sent right after. */
const at = (n: number) => ({ startLocal: `${dayOf(n)} 10:00`, submittedAt: iso(n) });
const judge = (rows: CollectorRow[]) => judgeFinishes(rows, 490, START + 60 * DAY_MS);

/** A finished box with these steps, one per checkpoint. */
function boxed(steps: number[], over: { chainsPriced?: number; stoppedEarly?: boolean } = {}): CollectorRow['space'] {
  return {
    mode: 'bands',
    minGap: 0,
    minAscensions: steps.length + 1,
    maxAscensions: steps.length + 1,
    bands: steps.map((step, i) => [200 + 50 * i, 200 + 50 * i + step, 200 + 50 * i + 2 * step]),
    chains: 27,
    chainsPriced: 27,
    stoppedEarly: false,
    ...over,
  };
}

const grade = (kind: SearchGrade['kind'], step: number, steps: number[] = [step]): SearchGrade => ({
  kind,
  step,
  steps,
  penalty: null,
  text: kind === 'every-te' ? 'every TE' : kind === 'coarse' ? `every ${step}th TE` : 'staged (thorough)',
});

describe('gradeStyle', () => {
  it('draws every TE solid, every 2nd-3rd dashed, every 4th or coarser dotted, and no box hatched', () => {
    expect(gradeStyle(grade('every-te', 1))).toBe('solid');
    expect(gradeStyle(grade('coarse', 2))).toBe('dashed');
    expect(gradeStyle(grade('coarse', 3))).toBe('dashed');
    expect(gradeStyle(grade('coarse', 4))).toBe('dotted');
    expect(gradeStyle(grade('coarse', 5))).toBe('dotted');
    expect(gradeStyle(grade('coarse', 20))).toBe('dotted');
    expect(gradeStyle(grade('staged', Infinity, []))).toBe('hatched');
  });

  it('goes by the widest checkpoint, the one a better plan could hide behind', () => {
    // William's F4, live: every TE, 2nd, 3rd, then every 6th at the last checkpoint.
    const f4 = searchGrade(row({ chain: [200, 250, 300, 350, 490], currentTE: 180, space: boxed([1, 2, 3, 6]) }));
    expect(gradeStyle(f4)).toBe('dotted');
    const every = searchGrade(row({ chain: [200, 250, 490], currentTE: 180, space: boxed([1, 1]) }));
    expect(gradeStyle(every)).toBe('solid');
  });

  it('hatches a box the run did not finish, which is no box at all', () => {
    const cut = searchGrade(
      row({ chain: [200, 490], currentTE: 180, space: boxed([1], { chainsPriced: 3, stoppedEarly: true }) })
    );
    expect(gradeStyle(cut)).toBe('hatched');
    expect(searchWords(cut)).toMatch(/did not finish/);
  });

  it('says the search in words', () => {
    expect(searchWords(grade('every-te', 1))).toBe('a finished box at every TE');
    expect(searchWords({ ...grade('coarse', 6), text: 'up to every 6th TE' })).toBe(
      'a finished box at up to every 6th TE'
    );
    expect(searchWords(grade('staged', Infinity, []))).toBe(
      'a staged search (thorough), with no box to bound what it missed'
    );
  });
});

describe('countColumns', () => {
  it('runs from the smallest count tried to the largest, one column each', () => {
    expect(countColumns([5, 3, 4, 3]).map(c => c.label)).toEqual(['3', '4', '5']);
  });

  it(`folds a stretch of ${COLLAPSE_AT} or more counts nobody tried into one column`, () => {
    // William's lone 15 next to everybody's 2 to 8, as on the count chart.
    const cols = countColumns([2, 3, 5, 6, 7, 8, 15]);
    expect(cols.map(c => c.label)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9–14', '15']);
    const gap = cols.find(c => c.label === '9–14')!;
    expect(gap).toMatchObject({ tried: false, counts: [9, 10, 11, 12, 13, 14] });
    expect(cols.find(c => c.label === '4')).toMatchObject({ tried: false, counts: [4] });
    expect(cols.find(c => c.label === '5')).toMatchObject({ tried: true, counts: [5] });
  });

  it('keeps one or two missing counts as columns of their own, so the hole shows', () => {
    expect(countColumns([2, 5]).map(c => c.label)).toEqual(['2', '3', '4', '5']);
    expect(countColumns([2, 6]).map(c => c.label)).toEqual(['2', '3–5', '6']);
  });

  it('has nothing to show for no runs', () => {
    expect(countColumns([])).toEqual([]);
    expect(countColumns([4]).map(c => c.label)).toEqual(['4']);
  });
});

describe('fillBin', () => {
  it('is darkest at the earliest finish and palest from 20 days behind', () => {
    expect(fillBin(0)).toBe(0);
    expect(fillBin(0.004)).toBe(0);
    expect(fillBin(0.005)).toBe(1);
    expect(fillBin(1.99)).toBe(1);
    expect(fillBin(2)).toBe(2);
    expect(fillBin(9.9)).toBe(3);
    expect(fillBin(19.9)).toBe(4);
    expect(fillBin(20)).toBe(FILL_BINS.length - 1);
    expect(fillBin(300)).toBe(FILL_BINS.length - 1);
  });

  it('is one hue getting lighter step by step', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l = FILL_BINS.map(b => lum(b.color));
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1]);
  });
});

describe('bestCountTable', () => {
  // One account (Denver) that tried 3, 5 and 6 from one save, 6 twice; a 4 it never tried sits between.
  const three = row({
    id: 'a3',
    chain: [200, 300, 490],
    currentTE: 180,
    durationDays: 720,
    ...at(0),
    space: boxed([1, 1]),
  });
  const five = row({
    id: 'a5',
    chain: [200, 250, 300, 350, 490],
    currentTE: 180,
    durationDays: 702.5,
    ...at(0),
    space: boxed([5, 5, 5, 5]),
  });
  const six = row({
    id: 'a6',
    chain: [195, 230, 260, 300, 350, 490],
    currentTE: 180,
    durationDays: 700,
    chainsPriced: 5806,
    ...at(0),
  });
  const sixSlower = row({
    id: 'a6b',
    chain: [196, 231, 261, 301, 351, 490],
    currentTE: 180,
    durationDays: 704,
    ...at(0),
  });
  // A second account (Tokyo) with one count only.
  const other = row({ id: 'b4', chain: [205, 260, 320, 490], currentTE: 150, timezone: 'Asia/Tokyo', ...at(0) });
  const rows = [three, five, six, sixSlower, other];
  const judged = judge(rows);
  const labels = new Map([
    [accountKey(three), 'Denver'],
    [accountKey(other), 'Tokyo'],
  ]);
  const colors = new Map([
    [accountKey(three), 0],
    [accountKey(other), 1],
  ]);

  it('gives each account a row and each count tried a column', () => {
    const t = bestCountTable(rows, judged, { labels, colors });
    expect(t.columns.map(c => c.label)).toEqual(['3', '4', '5', '6']);
    expect(t.rows.map(r => r.label)).toEqual(['Tokyo', 'Denver']); // TE 150 before TE 180
  });

  it('shows the earliest standing finish at each count as days after the account’s earliest finish', () => {
    const denver = bestCountTable(rows, judged, { labels, colors }).rows.find(r => r.label === 'Denver')!;
    const [c3, c4, c5, c6] = denver.cells;
    expect(c6).toMatchObject({ state: 'standing', best: true, text: 'best', bin: 0, runs: 2 });
    expect(c6.row!.id).toBe('a6'); // not the slower 6 from the same save
    expect(c5.behind).toBeCloseTo(2.5, 9);
    expect(c5).toMatchObject({ text: '+2.5 d', bin: 2, style: 'dotted' });
    expect(c3.behind).toBeCloseTo(20, 9);
    expect(c3).toMatchObject({ text: '+20.0 d', bin: FILL_BINS.length - 1, style: 'solid' });
    expect(c4).toMatchObject({ state: 'untried', text: '', bin: -1 });
    expect(c6.style).toBe('hatched'); // a staged search
    expect(denver.anchorShown).toBe(true);
    expect(denver.anchor!.row.id).toBe('a6');
  });

  it('weighs each count against the next count down the account has a finish at', () => {
    const denver = bestCountTable(rows, judged, { labels, colors }).rows.find(r => r.label === 'Denver')!;
    const [c3, , c5, c6] = denver.cells;
    expect(c3.step).toBeUndefined();
    // 3 at every TE lost to 5 by 17.5 days: more than a finer search of an every-TE box could find.
    expect(c5.step).toMatchObject({ from: 3, to: 5, better: 5, verdict: 'settled' });
    // 5 at every 5th TE lost to a staged 6 by 2.5 days: under the 12 days every 5th TE can hide, but the
    // staged winner had no box at all, so a finer search of it would more likely widen the gap.
    expect(c6.step).toMatchObject({ from: 5, to: 6, better: 6, verdict: 'direction' });
    expect(stepWords(c6.step!)).toBe(
      'vs 5 ascensions: 6 ascensions finish first by 2.5 d · direction holds: the count that won was searched at least as coarsely at every checkpoint'
    );
  });

  it('calls a lone count "only" and gives it no ramp colour: there is nothing to compare', () => {
    const tokyo = bestCountTable(rows, judged, { labels, colors }).rows.find(r => r.label === 'Tokyo')!;
    const c4 = tokyo.cells.find(c => c.column.label === '4')!;
    expect(c4).toMatchObject({ state: 'standing', text: 'only', bin: -1, best: true });
    expect(tokyo.cells.filter(c => c.state === 'untried')).toHaveLength(3);
  });

  it('counts the accounts that tried each count in the footer', () => {
    const t = bestCountTable(rows, judged, { labels, colors });
    expect(t.tried.map(x => x.accounts)).toEqual([1, 1, 1, 1]);
    expect(t.tried[1].labels).toEqual(['Tokyo']);
  });

  it('marks a count tried but with no finish still standing, with the reason', () => {
    // A what-if: planned to start two months after it was sent.
    const whatIf = row({
      id: 'wi',
      chain: [201, 250, 300, 490],
      currentTE: 185,
      startLocal: '2026-11-23 09:00',
      submittedAt: iso(0),
    });
    const all = [...rows, whatIf];
    const denver = bestCountTable(all, judge(all), { labels, colors }).rows.find(r => r.label === 'Denver')!;
    const c4 = denver.cells.find(c => c.column.label === '4')!;
    expect(c4).toMatchObject({ state: 'not-standing', text: '—', bin: -1, runs: 1 });
    expect(c4.reasons!.length).toBe(1);
    expect(c4.reasons![0]).not.toBe('');
  });

  it('says "same finish" for a second count within the rounding of the best', () => {
    const tie = row({
      id: 'tie',
      chain: [199, 240, 280, 320, 360, 400, 490],
      currentTE: 180,
      durationDays: 700.002,
      ...at(0),
    });
    const all = [three, six, tie];
    const t = bestCountTable(all, judge(all), { labels, colors });
    const c6 = t.rows[0].cells.find(c => c.column.label === '6')!;
    expect(c6).toMatchObject({ text: 'best', bin: 0 });
    const c7 = t.rows[0].cells.find(c => c.column.label === '7')!;
    expect(c7).toMatchObject({ text: 'same finish', bin: 0, best: false });
  });

  it('measures from the account’s earliest finish even when Proofs only leaves it out', () => {
    // Judged on everything, drawn from the proofs: the staged 6 is still the account's earliest finish.
    const proofs = [three, five];
    const denver = bestCountTable(proofs, judged, { labels, colors }).rows[0];
    expect(denver.anchorShown).toBe(false);
    expect(denver.anchor!.row.id).toBe('a6');
    expect(denver.cells.map(c => c.text)).toEqual(['+20.0 d', '', '+2.5 d']);
    expect(denver.cells.some(c => c.best)).toBe(false);
  });

  it('under Proofs only, says a count tried without a finished box is that, not "did not try"', () => {
    // Tokyo proved 6 ascensions; Denver tried 6 only with staged searches, which Proofs only hides.
    const tokyoSix = row({
      id: 'b6',
      chain: [205, 240, 270, 310, 360, 490],
      currentTE: 150,
      timezone: 'Asia/Tokyo',
      ...at(0),
      space: boxed([1, 1, 1, 1, 1]),
    });
    const all = [...rows, tokyoSix];
    const proofs = [three, five, tokyoSix];
    const t = bestCountTable(proofs, judge(all), { labels, colors, tried: all });
    const denver = t.rows.find(r => r.label === 'Denver')!;
    const c6 = denver.cells.find(c => c.column.label === '6')!;
    expect(c6).toMatchObject({ state: 'hidden', text: '', bin: -1, hiddenRuns: 2, noProof: true });
    expect(cellTitle(denver, c6, 'UTC')).toBe(
      'Denver has no finished box at 6 ascensions at this target: its 2 runs at this count are staged searches or boxes they did not finish, which Proofs only hides.'
    );
    // 4 is still not tried by Denver at all, and the footer counts who tried each count, whatever is hidden.
    expect(denver.cells.find(c => c.column.label === '4')!.state).toBe('untried');
    expect(t.columns.map(c => c.label)).toEqual(['3', '4', '5', '6']);
    // Tokyo's 4 is a staged search too: tried, hidden.
    expect(t.tried.map(x => x.accounts)).toEqual([1, 1, 1, 2]);
    expect(t.rows.find(r => r.label === 'Tokyo')!.cells.find(c => c.column.label === '4')!.state).toBe('hidden');
    // Without the unfiltered runs it cannot tell, and says "did not try" as before.
    const blind = bestCountTable(proofs, judge(all), { labels, colors }).rows.find(r => r.label === 'Denver')!;
    expect(blind.cells.find(c => c.column.label === '6')!.state).toBe('untried');
  });

  it("takes an account's TE from a run that is not a what-if when nothing of it stands", () => {
    const real = row({ id: 'real', chain: [200, 300, 490], currentTE: 180, clothedTE: 300, ...at(0) });
    // Typed in from TE 230, sent later.
    const typed = row({ id: 'typed', chain: [240, 300, 490], currentTE: 230, clothedTE: 350, ...at(3) });
    const judgedBy = (states: Record<string, 'old-save' | 'what-if'>): FinishJudgement => ({
      byId: new Map(
        Object.entries(states).map(([id, state]) => [
          id,
          {
            start: 0,
            finish: 0,
            state,
            reason: state,
            standing: false,
            behind: null,
            best: false,
            sameSaveAsBest: false,
          },
        ])
      ),
      bestByAccount: new Map(),
    });
    const both = bestCountTable([real, typed], judgedBy({ real: 'old-save', typed: 'what-if' })).rows[0];
    expect([both.te, both.clothedTE]).toEqual([180, 300]);
    const only = bestCountTable([typed], judgedBy({ typed: 'what-if' })).rows[0];
    expect([only.te, only.clothedTE]).toEqual([null, null]);
  });

  it('orders rows by TE, Clothed TE or delivery score, lowest first, unknowns last', () => {
    const mk = (tz: string, te: number, cte: number | undefined, delivery: number | undefined) =>
      row({
        chain: [te + 20, 490],
        currentTE: te,
        timezone: tz,
        ...at(0),
        ...(cte != null ? { clothedTE: cte } : {}),
        ...(delivery != null ? { deliveryScore: { lay: 1, hab: 1, shipping: 1, score: delivery } } : {}),
      });
    const a = mk('Europe/London', 150, 300, 0.8);
    const b = mk('Europe/Paris', 170, 260, 0.95);
    const c = mk('Asia/Tokyo', 130, undefined, 0.9);
    const all = [a, b, c];
    const names = new Map([
      [accountKey(a), 'a'],
      [accountKey(b), 'b'],
      [accountKey(c), 'c'],
    ]);
    const order = (o: 'te' | 'cte' | 'delivery') =>
      bestCountTable(all, judge(all), { labels: names, order: o }).rows.map(r => r.label);
    expect(order('te')).toEqual(['c', 'a', 'b']);
    expect(order('cte')).toEqual(['b', 'a', 'c']);
    expect(order('delivery')).toEqual(['a', 'c', 'b']);
    expect(gearText(bestCountTable(all, judge(all), { labels: names }).rows[1])).toBe(
      'TE 150 · CTE 300.0 · delivery 80%'
    );
  });

  it('puts the chain, finish, search, plans priced and step in the cell’s tooltip', () => {
    const t = bestCountTable(rows, judged, { labels, colors });
    const denver = t.rows.find(r => r.label === 'Denver')!;
    const tip = cellTitle(denver, denver.cells[2], 'UTC');
    expect(tip).toContain('Denver, 5 ascensions: 200 250 300 350 490 (from 180 TE)');
    expect(tip).toMatch(/Finishes \d+ \w+ \d{4}, 2\.5 d after this account's earliest finish/);
    expect(tip).toContain('a finished box at every 5th TE · 100 plans priced');
    expect(tip).toContain('vs 3 ascensions: 5 ascensions finish first by 17.5 d · settled');
    const six = cellTitle(denver, denver.cells[3], 'UTC');
    expect(six).toContain("this account's earliest finish at this target");
    expect(six).toContain('5,806 plans priced');
    expect(six).toContain('The earliest standing finish of 2 runs at this count.');
    expect(cellTitle(denver, denver.cells[1], 'UTC')).toBe('Denver did not try 4 ascensions at this target.');
  });
});
