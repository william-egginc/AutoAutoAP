import { describe, expect, it, vi } from 'vitest';

// The line reads endEggsOf's `next` and nothing else (the laid egg, shift-aware: search/endEggs.ts).
const next = vi.hoisted(() => ({ value: null as { egg: string; at: number } | null }));
vi.mock('@/search/endEggs', () => ({ endEggsOf: () => (next.value ? { rows: [], rate: null, next: next.value } : null) }));
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

  const ZONE = 'America/Denver';
  const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000;
  const DEADLINE = Date.UTC(2027, 6, 14, 16, 0) / 1000; // Jul 14, 2027, 10:00 am Denver
  const legs = [{ endTime: DEADLINE - 3600 }] as never;
  const line = (d: number | null) =>
    oneMoreLine({ chain: [200, 248], legs, deadline: d, what: 'Egg Day 2027', nowSeconds: NOW, zone: ZONE });

  it('one more TE: nothing without legs or a next TE', () => {
    next.value = { egg: 'integrity', at: DEADLINE + 86400 };
    expect(oneMoreLine({ chain: [200, 248], legs: null, deadline: DEADLINE, what: 'Egg Day', nowSeconds: NOW, zone: ZONE })).toBe('');
    next.value = null;
    expect(line(DEADLINE)).toBe('');
  });

  it('after the deadline it says so: it isn’t counted', () => {
    next.value = { egg: 'integrity', at: DEADLINE + 86400 };
    expect(line(DEADLINE)).toBe(
      "One more TE by Egg Day 2027 (249, on Integrity) would come Jul 15, 2027 at 10:00 am, after the deadline, so it isn't counted."
    );
    next.value = { egg: 'integrity', at: DEADLINE - 600 };
    expect(line(DEADLINE)).toBe('One more TE (249, on Integrity) would come Jul 14, 2027 at 9:50 am.');
  });
});
