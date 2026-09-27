import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countBanded } from '@/search/exhaustive';
import type { PricedChain } from '@/search/types';
import type { CollectorRow } from './collector';
import { parseRunCsv } from './collector';
import {
  boxOf,
  checkpointEnvelope,
  checkpointName,
  checkpointWalls,
  coarseStepCost,
  envelopeBest,
  nearBestRange,
  parseAll,
  summariseSweepRun,
} from './sweepStats';

const step = (lo: number, hi: number, by: number) =>
  Array.from({ length: Math.floor((hi - lo) / by) + 1 }, (_, i) => lo + i * by);

const priced = (chain: number[], days: number): PricedChain => ({
  chain,
  days,
  prestiges: chain.length,
  lastCheckpoint: chain[chain.length - 2],
});

describe('checkpointEnvelope', () => {
  const chains = [
    priced([200, 300, 490], 800),
    priced([201, 300, 490], 802),
    priced([200, 301, 490], 799),
    priced([202, 301, 490], 805),
    // Another count in the same table: never part of a 3-ascension envelope.
    priced([250, 490], 700),
    priced([200, 250, 300, 490], 790),
  ];

  it('keeps the best plan through each TE at the checkpoint, in TE order', () => {
    expect(checkpointEnvelope(chains, 3, 0)).toEqual([
      { te: 200, days: 799, chain: [200, 301, 490] },
      { te: 201, days: 802, chain: [201, 300, 490] },
      { te: 202, days: 805, chain: [202, 301, 490] },
    ]);
    expect(checkpointEnvelope(chains, 3, 1)).toEqual([
      { te: 300, days: 800, chain: [200, 300, 490] },
      { te: 301, days: 799, chain: [200, 301, 490] },
    ]);
  });

  it('has the same lowest point at every checkpoint: the table best at that count', () => {
    for (const k of [0, 1]) expect(envelopeBest(checkpointEnvelope(chains, 3, k))?.days).toBe(799);
  });

  it('is empty for a checkpoint the count does not have', () => {
    expect(checkpointEnvelope(chains, 3, 2)).toEqual([]);
    expect(checkpointEnvelope(chains, 3, -1)).toEqual([]);
  });
});

describe('nearBestRange', () => {
  // A saw: 203 is the best, 201 comes close, 202 between them does not.
  const env = [
    { te: 200, days: 810, chain: [] },
    { te: 201, days: 800.6, chain: [] },
    { te: 202, days: 802, chain: [] },
    { te: 203, days: 800, chain: [] },
    { te: 204, days: 800.9, chain: [] },
    { te: 205, days: 803, chain: [] },
  ];

  it('spans every TE that comes within, and names the ones between that do not', () => {
    const r = nearBestRange(env, 1)!;
    expect([r.lo, r.hi, r.within, r.priced]).toEqual([201, 204, 3, 4]);
    expect(r.gaps).toEqual([202]);
    expect(r.stretch).toEqual([203, 204]);
  });

  it('says when the range runs into the end of what was priced, unless that end is a wall', () => {
    const wide = nearBestRange(env, 20)!;
    expect([wide.lo, wide.hi, wide.loEdge, wide.hiEdge]).toEqual([200, 205, true, true]);
    // 200 is as low as a plan can go (just above the player's TE): not the box's doing.
    const walled = nearBestRange(env, 20, 200, 489)!;
    expect([walled.loEdge, walled.hiEdge]).toEqual([false, true]);
  });

  it('is the best TE alone when nothing else comes within', () => {
    const r = nearBestRange(env, 0.5)!;
    expect([r.lo, r.hi, r.within, r.gaps.length]).toEqual([203, 203, 1, 0]);
    expect(nearBestRange([], 1)).toBeNull();
  });
});

describe('checkpointWalls and names', () => {
  it('puts each checkpoint between the player and the target', () => {
    expect(checkpointWalls(124.6, 490, 4, 0)).toEqual({ floor: 125, ceiling: 487 });
    expect(checkpointWalls(124.6, 490, 4, 2)).toEqual({ floor: 127, ceiling: 489 });
  });
  it('calls the last checkpoint last', () => {
    expect([0, 1, 2].map(k => checkpointName(k, 4))).toEqual(['1st', '2nd', 'last']);
    expect(checkpointName(0, 2)).toBe('last');
  });
});

describe('boxOf', () => {
  const space = (over: Partial<NonNullable<CollectorRow['space']>>) =>
    ({
      mode: 'bands',
      minGap: 0,
      minAscensions: 3,
      maxAscensions: 3,
      chains: 1,
      chainsPriced: 1,
      stoppedEarly: false,
      ...over,
    }) as NonNullable<CollectorRow['space']>;

  it('reads per-checkpoint bands, a shared pool, or an upload tag', () => {
    expect(boxOf({ space: space({ bands: [step(200, 202, 1), step(300, 301, 1)] }) }, 3)).toEqual([
      [200, 201, 202],
      [300, 301],
    ]);
    expect(boxOf({ space: space({ mode: 'range', range: { lo: 200, hi: 210, step: 5 } }) }, 3)).toEqual([
      [200, 205, 210],
      [200, 205, 210],
    ]);
    expect(boxOf({ sweep: { preset: 'F2', bands: '195-197:1; 276-278:1' } }, 3)).toEqual([
      [195, 196, 197],
      [276, 277, 278],
    ]);
  });

  it('refuses a box that does not line up with the plan length', () => {
    expect(boxOf({ space: space({ bands: [step(200, 202, 1)] }) }, 3)).toBeNull();
    expect(boxOf({}, 3)).toBeNull();
  });
});

describe('coarseStepCost', () => {
  // Every TE 181-190 then 300-303, from TE 180; the best plan is off the every-2nd grid.
  const box = [step(181, 190, 1), step(300, 303, 1)];
  const chains: PricedChain[] = [];
  for (const a of box[0]) for (const b of box[1]) chains.push(priced([a, b, 490], 800 + Math.abs(a - 184) + (b - 300)));

  it('anchors the grid at the band low end above the player, as the presets do', () => {
    // Every 2nd TE from 181: 181, 183, 185 … so 184 (the best) is missed at the 1st checkpoint.
    const c = coarseStepCost(chains, 3, box, 180, 490, 2, 0);
    expect(c.ok && [c.lost, c.chain, c.tried]).toEqual([1, [183, 300, 490], 5 * 4]);
    // A band written from below the player's TE starts where the player can: 181, not 179.
    const low = coarseStepCost(chains, 3, [step(179, 190, 1), box[1]], 180, 490, 2, 0);
    expect(low.ok && low.chain).toEqual([183, 300, 490]);
  });

  it('coarsens every checkpoint at once, which prices exactly a coarser box', () => {
    const c = coarseStepCost(chains, 3, box, 180, 490, 2, 'all');
    expect(c.ok && c.tried).toBe(countBanded([step(181, 190, 2), step(300, 303, 2)], 490, 180));
    expect(c.ok && c.chain).toEqual([183, 300, 490]);
  });

  it('reports no loss when the grid holds the best', () => {
    const c = coarseStepCost(chains, 3, box, 180, 490, 2, 1);
    expect(c.ok && c.lost).toBe(0);
  });

  it('refuses a checkpoint the box did not try at every TE', () => {
    const c = coarseStepCost(chains, 3, [step(181, 190, 3), box[1]], 180, 490, 2, 0);
    expect(c.ok).toBe(false);
    // The other checkpoint alone is still every TE.
    expect(coarseStepCost(chains, 3, [step(181, 190, 3), box[1]], 180, 490, 2, 1).ok).toBe(true);
    expect(coarseStepCost(chains, 3, null, 180, 490, 2, 0).ok).toBe(false);
  });
});

/* ----------------------------------------------- the tables the collector stored, where present */

// Stored run tables (`<id>.csv` as GET /csv serves them, unzipped) are player data, so none are
// committed: point EXPLORER_CSV_DIR at a folder of them to run these checks; without it they skip.
const CSV_DIR = process.env.EXPLORER_CSV_DIR ?? '';
const read = (id: string) => readFileSync(join(CSV_DIR, `${id}.csv`), 'utf8');
const has = (...ids: string[]) => !!CSV_DIR && ids.every(id => existsSync(join(CSV_DIR, `${id}.csv`)));

/** The boxes these runs recorded (`space.bands`), minus everything else a row carries. */
const ROWS: Record<string, Pick<CollectorRow, 'ascensions' | 'currentTE' | 'finalTE' | 'space'>> = {
  // Willsalt's 3-ascension run from TE 132, every TE, no gap: 27,087 plans.
  '290ce125': row(3, 132, [step(133, 300, 1), step(220, 400, 1)], 0),
  // Halceyx's F2 from TE 124: every TE in 123-250 and 276-300, 10 apart.
  '5f8be0b3': row(3, 124, [step(123, 250, 1), step(276, 300, 1)], 10),
  // allanfieldhouse's 4-ascension box from TE 198.
  '8b9df2a0': row(4, 198, [step(215, 235, 1), step(245, 265, 1), step(290, 310, 1)], 10),
  // An M1 at every TE from TE 124.
  '16f9fe98': row(2, 124, [step(123, 489, 1)], 0),
};

function row(ascensions: number, currentTE: number, bands: number[][], minGap: number) {
  return {
    ascensions,
    currentTE,
    finalTE: 490,
    space: {
      mode: 'bands' as const,
      bands,
      minGap,
      minAscensions: ascensions,
      maxAscensions: ascensions,
      chains: 0,
      chainsPriced: 0,
      stoppedEarly: false,
    },
  };
}

describe.skipIf(!has(...Object.keys(ROWS)))('stored tables', () => {
  it('draws the last checkpoint exactly as the chart always has', () => {
    for (const id of ['290ce125', '8b9df2a0', '16f9fe98']) {
      const text = read(id);
      const asc = ROWS[id].ascensions;
      // The chart's old reading: parseRunCsv's default, best total at each last checkpoint.
      const old = new Map<number, number>();
      for (const c of parseRunCsv(text).chains) {
        if (c.prestiges !== asc) continue;
        if (!old.has(c.lastCheckpoint) || c.days < old.get(c.lastCheckpoint)!) old.set(c.lastCheckpoint, c.days);
      }
      const env = checkpointEnvelope(parseAll(text).chains, asc, asc - 2);
      expect(env.map(p => [p.te, p.days])).toEqual([...old.entries()].sort(([a], [b]) => a - b));
    }
  });

  it('prices every TE of the box at each checkpoint, and bottoms out at the run best', () => {
    const s = summariseSweepRun(parseAll(read('290ce125')), ROWS['290ce125'])!;
    expect(s.plans).toBe(27087);
    expect(s.bestDays).toBeCloseTo(1040.176, 3);
    expect(s.bestChain).toEqual([201, 283, 490]);
    expect(s.envelopes[0].map(p => p.te)).toEqual(step(133, 300, 1));
    expect(s.envelopes[1].map(p => p.te)).toEqual(step(220, 400, 1));
    for (const env of s.envelopes) expect(envelopeBest(env)?.days).toBe(s.bestDays);
  });

  it('finds a saw at the first checkpoint of the 4-ascension box', () => {
    const s = summariseSweepRun(parseAll(read('8b9df2a0')), ROWS['8b9df2a0'])!;
    const walls = checkpointWalls(s.currentTE, 490, 4, 0);
    const r = nearBestRange(s.envelopes[0], 1, walls.floor, walls.ceiling)!;
    expect([r.lo, r.hi, r.within, r.priced]).toEqual([221, 233, 9, 13]);
    expect(r.gaps).toEqual([222, 225, 228, 231]);
    expect(r.stretch).toEqual([229, 230]);
    for (const p of s.envelopes[0]) {
      const inside = p.te >= r.lo && p.te <= r.hi && !r.gaps.includes(p.te);
      expect(p.days - s.bestDays <= 1).toBe(inside);
    }
    // Within 3 days it reaches 235, the top of what the box tried there.
    const wide = nearBestRange(s.envelopes[0], 3, walls.floor, walls.ceiling)!;
    expect([wide.hi, wide.hiEdge, wide.loEdge]).toEqual([235, true, false]);
  });

  it('prices a coarser grid as exactly the plans a coarser box would hold', () => {
    const f2 = ROWS['5f8be0b3'];
    const s = summariseSweepRun(parseAll(read('5f8be0b3')), f2)!;
    const [two, five, ten] = s.coarseAll;
    // Anchored at 125 (just above TE 124) and 276: the bands a coarser preset would have run.
    for (const [cost, by] of [
      [two, 2],
      [five, 5],
      [ten, 10],
    ] as const) {
      expect(cost.ok && cost.tried).toBe(countBanded([step(125, 250, by), step(276, 300, by)], 490, 124, 10));
    }
    // On this save M2's every-2nd-TE grid came out about 5 days behind F2 (upload.ts): so it does.
    expect(two.ok && two.lost).toBeCloseTo(5.364, 2);
    expect(two.ok && two.chain).toEqual([209, 280, 490]);
    expect(five.ok && five.lost).toBeGreaterThan(two.ok ? two.lost : Infinity);
    // One checkpoint at a time: the second checkpoint coarsened alone costs about a day.
    const second = s.coarseAt[1][0];
    expect(second.ok && second.lost).toBeCloseTo(1.004, 2);
  });

  it('takes the M1 grid from 125 for a player at TE 124', () => {
    const s = summariseSweepRun(parseAll(read('16f9fe98')), ROWS['16f9fe98'])!;
    const [two, five] = s.coarseAt[0];
    // 277 is on the every-2nd grid from 125; every 5th (125, 130 … 275, 280) misses it.
    expect(two.ok && two.lost).toBe(0);
    expect(five.ok && [five.chain, five.tried]).toEqual([[270, 490], step(125, 489, 5).length]);
    expect(s.coarseAll).toEqual(s.coarseAt[0]);
  });
});
