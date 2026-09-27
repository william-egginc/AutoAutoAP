import { describe, expect, it } from 'vitest';
import type { PricedChain } from '@/search/types';
import { daysNumber, hasPricedCell, missAdvice, missTable, replanPays, summariseMisses, type MissTable } from './miss';

const FINAL = 490;

function priced(chain: number[], days: number): PricedChain {
  return { chain, days, prestiges: chain.length, lastCheckpoint: chain[chain.length - 2] };
}

const range = (lo: number, hi: number, by = 1) =>
  Array.from({ length: Math.floor((hi - lo) / by) + 1 }, (_, i) => lo + i * by);

/**
 * A synthetic 4-ascension table with a known answer. The best is 230 260 297 490 at 600 days. A
 * plan pays 0.5 d/TE² for its first checkpoint off 230, and 2 d/TE² for each gap between
 * checkpoints (and the last one to the target) off the best's spacing, so cells can be worked out by
 * hand:
 *
 *   checkpoint 1 moved by d, plan kept:  0.5d² + 2d² (its gap to checkpoint 2)      d = 2: 10
 *   checkpoint 1 moved by d, re-planned: 0.5d² + the d spread over the three gaps   d = 2: 2 + 2·(1 + 1) = 6
 *   checkpoint 2 moved by d, plan kept:  2d² + 2d² (the gaps either side)           d = 1: 4
 *   the last checkpoint moved by d:      2d² + 2d²                                  d = 1: 4, d = 2: 16
 */
function cost(a: number, b: number, c: number): number {
  return 600 + 0.5 * (a - 230) ** 2 + 2 * (b - a - 30) ** 2 + 2 * (c - b - 37) ** 2 + 2 * (FINAL - c - 193) ** 2;
}

function grid(as: number[], bs: number[], cs: number[], fn = cost): PricedChain[] {
  const out: PricedChain[] = [];
  for (const a of as)
    for (const b of bs) for (const c of cs) if (a < b && b < c) out.push(priced([a, b, c, FINAL], fn(a, b, c)));
  // The file's rank order, fastest first.
  return out.sort((x, y) => x.days - y.days);
}

const BOX = grid(range(220, 240), range(250, 270), range(285, 310));

function cell(table: MissTable, row: number, offset: number) {
  const r = table.rows[row];
  const c = r.cells.find(x => x.offset === offset);
  if (!c) throw new Error(`no cell ${row} ${offset}`);
  return c;
}

describe('missTable', () => {
  it('finds the best at the count and one row per checkpoint, the last marked', () => {
    const t = missTable(BOX, 4)!;
    expect(t.best.chain).toEqual([230, 260, 297, FINAL]);
    expect(t.best.days).toBe(600);
    expect(t.priced).toBe(BOX.length);
    expect(t.rows.map(r => [r.te, r.last])).toEqual([
      [230, false],
      [260, false],
      [297, true],
    ]);
    expect(t.rows[0].cells.map(c => [c.offset, c.te])).toEqual([
      [-2, 228],
      [-1, 229],
      [1, 231],
      [2, 232],
    ]);
  });

  it('keep the plan is the same chain with only that checkpoint moved', () => {
    const t = missTable(BOX, 4)!;
    const c = cell(t, 0, 2);
    expect(c.keep!.chain).toEqual([232, 260, 297, FINAL]);
    expect(c.keep!.days).toBe(610);
    expect(c.keep!.behind).toBe(10);
    expect(cell(t, 0, -1).keep!.behind).toBe(2.5);
    expect(cell(t, 1, 1).keep!.chain).toEqual([230, 261, 297, FINAL]);
    expect(cell(t, 1, 1).keep!.behind).toBe(4);
  });

  it('re-plan is the fastest chain with the same earlier checkpoints and that one moved', () => {
    const t = missTable(BOX, 4)!;
    const c = cell(t, 0, 2);
    // By hand, and by brute force over every chain starting 232.
    expect(c.replan!.behind).toBe(6);
    expect(c.replan!.behind).toBe(Math.min(...BOX.filter(x => x.chain[0] === 232).map(x => x.days - 600)));
    expect(c.replan!.chain[0]).toBe(232);
    expect(c.saving).toBe(4);
    expect(replanPays(c)).toBe(true);
    // A 1-TE miss spreads over one gap either way: nothing to win.
    expect(cell(t, 0, 1).saving).toBe(0);
    expect(replanPays(cell(t, 0, 1))).toBe(false);
    // Checkpoint 2 moved: checkpoint 1 is held at the best's.
    const d = cell(t, 1, -2);
    expect(d.replan!.chain.slice(0, 2)).toEqual([230, 258]);
    expect(d.keep!.behind).toBe(16);
    expect(d.replan!.behind).toBe(12);
    expect(d.replan!.behind).toBe(
      Math.min(...BOX.filter(x => x.chain[0] === 230 && x.chain[1] === 258).map(x => x.days - 600))
    );
  });

  it('at the last checkpoint keep and re-plan are the same chain', () => {
    const t = missTable(BOX, 4)!;
    for (const c of t.rows[2].cells) {
      expect(c.keep).not.toBeNull();
      expect(c.replan!.chain).toEqual(c.keep!.chain);
      expect(c.saving).toBe(0);
      expect(replanPays(c)).toBe(false);
    }
    expect(cell(t, 2, 1).keep!.chain).toEqual([230, 260, 298, FINAL]);
    expect(t.rows[2].cells.map(c => c.keep!.behind)).toEqual([16, 4, 4, 16]);
  });

  it('says not tried for a TE outside the box, rather than inventing a number', () => {
    // Checkpoint 1 starts at the best's 230: nothing below it was priced.
    const t = missTable(grid(range(230, 240), range(250, 270), range(285, 310)), 4)!;
    expect(t.best.chain).toEqual([230, 260, 297, FINAL]);
    for (const offset of [-2, -1]) {
      expect(cell(t, 0, offset).keep).toBeNull();
      expect(cell(t, 0, offset).replan).toBeNull();
      expect(cell(t, 0, offset).saving).toBeNull();
    }
    expect(cell(t, 0, 1).keep).not.toBeNull();
    expect(cell(t, 1, -1).keep).not.toBeNull();
  });

  it('says not tried for TEs a stepped box stepped over', () => {
    const t = missTable(grid(range(220, 240, 5), range(250, 270, 5), range(285, 310, 5)), 4)!;
    expect(t.best.chain.slice(0, 3)).toEqual([230, 260, 295]);
    for (const row of t.rows) for (const c of row.cells) expect(c.keep ?? c.replan).toBeNull();
    expect(summariseMisses(t).notTried).toBe(12);
  });

  it('keeps re-plan when only the exact keep-the-plan chain was never priced', () => {
    const missing = BOX.filter(x => x.chain.join(' ') !== '232 260 297 490');
    const c = cell(missTable(missing, 4)!, 0, 2);
    expect(c.keep).toBeNull();
    expect(c.replan).not.toBeNull();
    expect(c.saving).toBeNull();
  });

  it('reads only the run’s own count', () => {
    const mixed = [
      priced([232, 490], 1), // faster, but another count
      priced([232, 262, 490], 2),
      ...BOX,
    ];
    const t = missTable(mixed, 4)!;
    expect(t.best.chain).toEqual([230, 260, 297, FINAL]);
    expect(t.priced).toBe(BOX.length);
    expect(cell(t, 0, 2).replan!.chain.length).toBe(4);
    expect(missTable(mixed, 2)!.rows).toHaveLength(1);
  });

  it('takes the first of two equally fast bests (the file’s rank order)', () => {
    const t = missTable([priced([200, 300, FINAL], 700), priced([201, 300, FINAL], 700)], 3)!;
    expect(t.best.chain).toEqual([200, 300, FINAL]);
    expect(cell(t, 0, 1).keep!.behind).toBe(0);
  });

  it('is null with nothing to build from', () => {
    expect(missTable([], 4)).toBeNull();
    expect(missTable(BOX, 5)).toBeNull();
    expect(missTable([priced([FINAL], 100)], 1)).toBeNull();
  });

  it('walks a 60,000-chain table in one pass', () => {
    const big: PricedChain[] = [];
    for (let a = 150; a < 190; a++)
      for (let b = 200; b < 240; b++)
        for (let c = 250; c < 290; c++) {
          if (big.length >= 60_000) break;
          big.push(priced([a, b, c, 320, FINAL], 500 + Math.abs(a - 170) + Math.abs(b - 220) + Math.abs(c - 270)));
        }
    const started = performance.now();
    const t = missTable(big, 5)!;
    expect(performance.now() - started).toBeLessThan(1000);
    expect(t.best.chain).toEqual([170, 220, 270, 320, FINAL]);
    expect(cell(t, 0, 1).keep!.behind).toBe(1);
    // The fourth checkpoint was never varied: every cell there is not tried.
    expect(t.rows[3].cells.every(c => c.keep === null && c.replan === null)).toBe(true);
  });
});

describe('missAdvice', () => {
  it('says to re-plan when that saves more than a day, and to hit a costly last checkpoint', () => {
    const t = missTable(BOX, 4)!;
    const s = summariseMisses(t);
    expect(s.earlierReplanPays).toBe(4);
    expect(s.earlierKeepMax).toBe(16);
    expect([s.earlierReplanMin, s.earlierReplanMax]).toEqual([2.5, 12]);
    expect([s.lastMin, s.lastMax]).toEqual([4, 16]);
    expect(missAdvice(t)).toBe(
      'If you miss an earlier checkpoint, re-plan the rest from where you land (keeping the old plan costs up to 16 days here, re-planning 2.5–12 days); the last checkpoint is the one to hit exactly: a miss there costs 4.0–16 days and leaves nothing to re-plan.'
    );
  });

  it('says a miss barely matters when nothing costs a day', () => {
    // A flat table: every plan within a fraction of a day of the best.
    const flat = grid(
      range(225, 235),
      range(255, 265),
      range(292, 302),
      (a, b, c) => 600 + (a + b + c - 787) ** 2 / 1000
    );
    const text = missAdvice(missTable(flat, 4)!);
    expect(text).toContain('costs under a day here, even on the old plan');
    expect(text).toContain('a miss at the last checkpoint costs under a day');
  });

  it('does not single out the last checkpoint when an earlier miss costs more even re-planned', () => {
    // Checkpoint 1 now pays 5 d/TE² on its own, which no re-plan can win back: 2 TE off is 20 + 4.
    const steep = grid(
      range(220, 240),
      range(250, 270),
      range(285, 310),
      (a, b, c) => cost(a, b, c) + 4.5 * (a - 230) ** 2
    );
    const t = missTable(steep, 4)!;
    expect(summariseMisses(t).earlierReplanMax).toBe(24);
    expect(missAdvice(t)).toMatch(
      /; a miss at the last checkpoint costs 4\.0–16 days, with nothing left to re-plan\.$/
    );
  });

  it('says a miss costs either way when re-planning does not help', () => {
    // Days depend on the first checkpoint alone: re-planning the rest cannot win anything back.
    const t = missTable(
      grid(range(225, 235), range(255, 265), range(292, 302), a => 600 + 3 * Math.abs(a - 230)),
      4
    )!;
    expect(t.best.chain[0]).toBe(230);
    expect(missAdvice(t)).toContain('whether you keep the plan or re-plan');
  });

  it('talks about the one checkpoint of a two-ascension plan', () => {
    const two = range(270, 290).map(a => priced([a, FINAL], 800 + 4 * Math.abs(a - 280)));
    const text = missAdvice(missTable(two, 2)!);
    expect(text).toBe(
      "Hit this plan's one checkpoint exactly: a miss by 1–2 TE costs 4.0–8.0 days, and there is nothing after it to re-plan."
    );
  });

  it('says it cannot tell when no moved chain was priced, and why that usually is', () => {
    // A box at every 5th TE: no checkpoint ever moves by 1 or 2.
    const t = missTable(grid(range(220, 240, 5), range(250, 270, 5), range(285, 310, 5)), 4)!;
    expect(hasPricedCell(t)).toBe(false);
    expect(missAdvice(t)).toBe(
      "This run never priced a plan with a checkpoint moved by 1–2 TE, so it cannot say what a miss costs: most likely its search stepped over the TEs next to the best plan's checkpoints (a box at every 5th TE, say)."
    );
    expect(hasPricedCell(missTable(BOX, 4)!)).toBe(true);
  });

  it('does not call a plan untried when the page read only part of the table', () => {
    const coarse = missTable(grid(range(220, 240, 5), range(250, 270, 5), range(285, 310, 5)), 4)!;
    expect(missAdvice(coarse, 1200)).toBe(
      'None of the plans this page read has a checkpoint moved by 1–2 TE, and it read only the fastest part of the table (the slowest 1,200 plans were not read), so it cannot say what a miss costs.'
    );
    // The fastest 60 plans of the box stand in for a capped read: the numbers read are still right,
    // and the advice says the missing cells may be in the tail.
    const read = BOX.slice(0, 60);
    const t = missTable(read, 4)!;
    expect(summariseMisses(t).notTried).toBeGreaterThan(0);
    expect(missAdvice(t, BOX.length - 60)).toMatch(
      /\. A cell without a number may be among the [\d,]+ slowest plans the page did not read\.$/
    );
    expect(missAdvice(t)).not.toMatch(/did not read/);
  });
});

describe('daysNumber', () => {
  it('prints two decimals under a day, one under ten, whole days above', () => {
    expect(daysNumber(0.391)).toBe('0.39');
    expect(daysNumber(4.72)).toBe('4.7');
    expect(daysNumber(31.29)).toBe('31');
  });
});
