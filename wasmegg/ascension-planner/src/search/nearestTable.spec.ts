/**
 * THE NEAREST TABLE (R10, Jordan 25 Nov 2026): with no own or exact gear table, the instant answer reads the listed
 * table whose gear is closest to the player's, the one the form G moves least (|ln geo|, geo = sqrt(lambda sigma) as
 * shipped), among those covering their TE; above its last TE the nearest covering the next TE, and so on to the maxed
 * one. The fixtures are the measured shifts (aaap-tools/notes/nearest-table-formg-2026-11-25.md, passes 1-3); the
 * winner each picks was the table nearest exact there, or within about a point of it.
 */
import { describe, expect, it } from 'vitest';
import {
  NEAREST_TIE,
  formGHeaderOf,
  nearestCandidates,
  nearestChain,
  nearestScore,
  pickNearest,
  type NearestTable,
} from './nearestTable';
import type { TableEntry } from './tableBracket';
import type { TableHeader } from './precomputedTable';

const t = (file: string, from: number, to: number, geo: number, exact = false): NearestTable => ({
  file,
  from,
  to,
  shift: { geo, g: 0, cap: 1, k: geo },
  exact,
});
const maxed = (geo: number | null): NearestTable => ({
  file: 'table-v2.bin',
  from: 55,
  to: 489,
  shift: geo === null ? null : { geo, g: 6.2, cap: 1, k: geo },
  exact: false,
  maxed: true,
});
const files = (c: NearestTable[]) => c.map(x => x.file);

describe('nearestScore: how far the form G moves a table, |ln geo|', () => {
  it('0 at the table’s own gear, the same either side', () => {
    expect(nearestScore(t('a', 75, 339, 1))).toBe(0);
    expect(nearestScore(t('a', 75, 339, 0.9))).toBeCloseTo(nearestScore(t('a', 75, 339, 1 / 0.9)), 12);
  });
  it('a table the form G can’t move (no shift) scores 0: it is read as it is', () => {
    expect(nearestScore(maxed(null))).toBe(0);
  });
});

describe('pickNearest: the measured saves (passes 1-3)', () => {
  // board-t3r-t4r-t2e's own gear: its own delivery table D (key T3R-T4R-T2E, built with the compass its gear leaves off)
  // moves by sqrt(lambda sigma) 0.904, +9%; the no-compass 4f2e425d table N by 0.968, +3%; maxed +10%.
  const D = (geo: number, exact = false) => t('gear-45d7229a.v2.bin', 75, 149, geo, exact);
  const N = (geo: number) => t('gear-4f2e425d.v2.bin', 75, 339, geo);
  it('own gear: N, not its own set’s table D (which the form G moves further)', () => {
    expect(pickNearest([D(0.904, true), N(0.968), maxed(0.666)], 110)?.file).toBe('gear-4f2e425d.v2.bin');
  });
  it('T3 stones only (x-w1): N', () => {
    expect(pickNearest([D(0.836), N(0.9), maxed(0.619)], 110)?.file).toBe('gear-4f2e425d.v2.bin');
  });
  it('more T4 stones (x-s2): N', () => {
    expect(pickNearest([D(0.926), N(0.996), maxed(0.685)], 110)?.file).toBe('gear-4f2e425d.v2.bin');
  });
  it('a set with its own table, as good as it (09f8b316): that table', () => {
    expect(pickNearest([t('gear-4f2e425d.v2.bin', 75, 339, 1, true), maxed(0.691)], 250)?.file).toBe(
      'gear-4f2e425d.v2.bin'
    );
  });
  it('all legendary (n-alllegend): the maxed one', () => {
    expect(pickNearest([t('gear-17afaedb.v2.bin', 75, 339, 1.049), N(1.433), maxed(0.99)], 110)?.maxed).toBe(true);
  });
  it('T4E-T4E-T2E, no table of its own (n-mid): the nearest, 3E-E-E', () => {
    const c = [t('gear-f267581d.v2.bin', 75, 339, 1.026), t('gear-79a6d720.v2.bin', 75, 339, 1.066), maxed(0.851)];
    expect(pickNearest(c, 110)?.file).toBe('gear-f267581d.v2.bin');
  });
});

describe('pickNearest: TE ranges', () => {
  it('only a table covering the TE (from <= TE <= to)', () => {
    const c = [t('low', 75, 149, 1), t('high', 150, 339, 1), maxed(0.7)];
    expect(pickNearest(c, 149)?.file).toBe('low');
    expect(pickNearest(c, 150)?.file).toBe('high');
    expect(pickNearest(c, 74)?.maxed).toBe(true);
    expect(pickNearest(c, 340)?.maxed).toBe(true);
  });
  it('none when nothing covers it', () => {
    expect(pickNearest([t('a', 75, 149, 1)], 200)).toBeNull();
  });
});

describe(`pickNearest: ties (scores within ${NEAREST_TIE})`, () => {
  it('the player’s own set’s table first', () => {
    expect(pickNearest([t('a', 75, 339, 0.999), t('b', 75, 149, 1.002, true)], 100)?.file).toBe('b');
  });
  it('then the one reaching higher (fewer joins)', () => {
    expect(pickNearest([t('a', 75, 149, 1), t('b', 75, 339, 1.003)], 100)?.file).toBe('b');
  });
  it('then the file name, so every page picks the same', () => {
    expect(pickNearest([t('b', 75, 339, 1), t('a', 75, 339, 1.001)], 100)?.file).toBe('a');
  });
  it('a lower score past the tie wins over an exact key', () => {
    expect(pickNearest([t('a', 75, 339, 1), t('b', 75, 339, 1.02, true)], 100)?.file).toBe('a');
  });
});

describe('nearestChain: the nearest at the TE, then the nearest covering the next TE past its last, to the maxed one', () => {
  it('a 75-149 table, a 75-339 one from 150, the maxed one from 340', () => {
    const c = [t('d', 75, 149, 1, true), t('n', 75, 339, 0.968)];
    expect(files(nearestChain(c, maxed(0.7), 110))).toEqual(['d', 'n', 'table-v2.bin']);
  });
  it('the maxed one alone when it is the nearest at the TE', () => {
    expect(files(nearestChain([t('a', 75, 339, 0.8)], maxed(0.99), 110))).toEqual(['table-v2.bin']);
  });
  it('the maxed one once a later step has it nearest (nothing after it)', () => {
    const c = [t('d', 75, 149, 1), t('far', 75, 339, 0.5)];
    expect(files(nearestChain(c, maxed(0.8), 110))).toEqual(['d', 'table-v2.bin']);
  });
  it('the maxed one above every delivery table', () => {
    expect(files(nearestChain([t('n', 75, 339, 1)], maxed(0.7), 300))).toEqual(['n', 'table-v2.bin']);
    expect(files(nearestChain([t('n', 75, 339, 1)], maxed(0.7), 360))).toEqual(['table-v2.bin']);
  });
});

describe('nearestCandidates: the tables.json entries that can be scored', () => {
  const formGHeader = {
    cteBonus: 128.7,
    k3: { research: { a: 1 }, delivery: [], peak: 2e12 },
    epicResearch: { b: 2 },
    colleggtibleEffects: { c: 1.05 },
  };
  const entry = (file: string, extra: Partial<TableEntry> = {}): TableEntry =>
    ({ file, bonus: 128.7, k: 1, from: 75, to: 339, simVersion: 'sim', formGHeader, ...extra }) as TableEntry;
  const opts = {
    maxedFile: 'table-v2.bin',
    playerFiles: new Set(['gear-alias.v2.bin']),
    simOk: (e: Partial<TableEntry>) => e.simVersion === 'sim',
    shiftOf: (h: TableHeader) => ({ g: 0, geo: h.k3!.peak! / 2e12, cap: 1, k: 1, kFull: 1, geoEr: 1, lambda: 1, sigma: 1, parts: { artifacts: 0, colleggtibles: 0, lab: 0 } }),
  };
  it('only entries with the form G header fields, by this simulator, not the maxed one, with a shift', () => {
    const c = nearestCandidates(
      [
        entry('table-v2.bin'),
        entry('gear-a.v2.bin'),
        entry('gear-old.v2.bin', { simVersion: 'older' }),
        entry('gear-bare.v2.bin', { formGHeader: undefined }),
        entry('gear-noshift.v2.bin', { formGHeader: { ...formGHeader, k3: { ...formGHeader.k3, peak: 0 } } }),
      ],
      { ...opts, shiftOf: h => (h.k3!.peak ? opts.shiftOf(h) : null) }
    );
    expect(files(c)).toEqual(['gear-a.v2.bin']);
  });
  it('exact when the player’s delivery table name is its file or one of its aliases', () => {
    const c = nearestCandidates([entry('gear-a.v2.bin', { aliases: ['gear-alias.v2.bin'] }), entry('gear-b.v2.bin')], opts);
    expect(c.map(x => x.exact)).toEqual([true, false]);
  });
  it('an entry without a last TE is left out (it can’t be placed in a chain)', () => {
    expect(nearestCandidates([entry('gear-a.v2.bin', { to: undefined })], opts)).toEqual([]);
  });
  it('formGHeaderOf: the header fields the form G reads, with the entry’s range', () => {
    const h = formGHeaderOf(entry('gear-a.v2.bin'));
    expect(h).toMatchObject({ from: 75, to: 339, simVersion: 'sim', ...formGHeader });
  });
});
