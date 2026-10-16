import { describe, expect, it } from 'vitest';
import type { Tile, TileAnswer } from './savedTiles';
import { MAX_PILLS, oneMoreLine, tryNextPills } from './tryNext';

const ans = (o: Partial<TileAnswer>): TileAnswer => ({
  chain: [165, 200, 224, 490],
  end: 1,
  endTE: 490,
  spareHours: null,
  calculatedAt: 1,
  saveSeconds: 1,
  fromTE: 186,
  source: 'snapshot',
  how: 'check',
  ...o,
});
const tile = (goal: 'fastest' | 'date', answer: TileAnswer | null): Tile => ({ goal, answer, olderSave: false, sure: null });

describe('try next', () => {
  it('nothing run yet: Egg Day Fast, Exact on the race, Exhaustive', () => {
    const p = tryNextPills({ tile: tile('fastest', null), target: 490 }, tile('date', null));
    expect(p.map(x => x.label)).toEqual(['Egg Day, Fast', 'Exact on my 490 route', 'Exhaustive']);
    expect(p[0].open).toEqual({ auto: 'by-date', tab: 'nearby', byDate: { eggDay: true }, level: 'quick' });
    expect(p[1].open).toEqual({ auto: 'fastest', depth: 'smart', tab: 'nearby', target: 490, level: 'normal' });
    expect(p[2].open).toMatchObject({ depth: 'full', tab: 'exhaustive' });
  });

  it('table-only tiles add Check exactly, at most four pills', () => {
    const p = tryNextPills({ tile: tile('fastest', ans({ how: 'instant' })), target: 490 }, tile('date', ans({ how: 'instant', endTE: 248 })));
    expect(p).toHaveLength(MAX_PILLS);
    expect(p.map(x => x.id)).toContain('check-eggday');
    expect(p[2].label).toBe('Exhaustive (around 4 asc)');
  });

  it('drops what is done', () => {
    const p = tryNextPills(
      { tile: tile('fastest', ans({ how: 'search', level: 'exhaustive' })), target: 490 },
      tile('date', ans({ how: 'search', level: 'quick', endTE: 248 }))
    );
    expect(p).toEqual([]);
  });

  it('one more TE: nothing without legs', () => {
    expect(oneMoreLine({ chain: [200, 248], legs: null, reachAt: 1, spareHours: 2, what: 'Egg Day' })).toBe('');
  });
});
