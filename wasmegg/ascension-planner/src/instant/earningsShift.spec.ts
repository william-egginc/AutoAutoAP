/**
 * The earnings shift from a save's artifacts, and the table read with it (precomputedTable.ts
 * `shiftedLookup`). Adapted from Joo's upstream earningsShift.spec.ts (5519caf2): his numbers (2.34,
 * 4.77, 42.36 Clothed TE below his table's cteBonus 128.71, which the delivery tables' headers carry
 * too) from a synthetic save, and a packed table in place of his public/instant/table.bin.gz.
 */
import { describe, expect, it } from 'vitest';
import { ei } from 'lib';
import { earningsCTE, earningsShift } from './earningsShift';
import { canonicalDelivered, rebase, type BuildParams } from './precomputedLeg';
import { compositeTable, packTable, readTable, shiftedFrom, shiftedLookup, shiftedTable } from './precomputedTable';

const AfxName = ei.ArtifactSpec.Name;
const AfxRarity = ei.ArtifactSpec.Rarity;
let nextItemId = 1;
/** Joo's auto/loadout/testBackup.ts: artifact `level` is tier - 1, stone `level` tier - 2. */
const invArtifact = (name: ei.ArtifactSpec.Name, tier: number, rarity: ei.ArtifactSpec.Rarity) => ({
  itemId: nextItemId++,
  quantity: 1,
  artifact: { spec: { name, level: tier - 1, rarity }, stones: [] },
});
const invStone = (name: ei.ArtifactSpec.Name, tier: number, quantity: number) => ({
  itemId: nextItemId++,
  quantity,
  artifact: { spec: { name, level: tier - 2, rarity: AfxRarity.COMMON }, stones: [] },
});

/** A pro-permit save with the four earnings artifacts at `tiers` (T4L unless named) and 12 T4 lunar stones. */
function save(
  downgrade: Partial<Record<'ankh' | 'necklace' | 'totem' | 'cube', [number, number]>> = {},
  lunarStones = 12
): ei.IBackup {
  const at = (k: keyof typeof downgrade): [number, number] => downgrade[k] ?? [4, AfxRarity.LEGENDARY];
  const items = [
    invArtifact(AfxName.TUNGSTEN_ANKH, ...at('ankh')),
    invArtifact(AfxName.DEMETERS_NECKLACE, ...at('necklace')),
    invArtifact(AfxName.LUNAR_TOTEM, ...at('totem')),
    invArtifact(AfxName.PUZZLE_CUBE, ...at('cube')),
    ...(lunarStones ? [invStone(AfxName.LUNAR_STONE, 4, lunarStones)] : []),
  ];
  return {
    artifactsDb: { virtueAfxDb: { inventoryItems: items } },
    farms: [],
    game: { epicResearch: [], permitLevel: 1 },
  } as unknown as ei.IBackup;
}

/** Joo's maxed table's (and the delivery tables') cteBonus. */
const HEADER = { cteBonus: 128.71 };

describe('earningsShift', () => {
  it('is 0 for the artifacts the table was built with, and without a save', () => {
    expect(earningsShift(earningsCTE(save()), HEADER)).toBe(0);
    expect(earningsShift(earningsCTE(null), HEADER)).toBe(0);
    expect(earningsShift(null, HEADER)).toBe(0);
  });

  it('is the Clothed TE a weaker artifact gives up (Joo’s numbers)', () => {
    expect(earningsShift(earningsCTE(save({ ankh: [3, AfxRarity.LEGENDARY] })), HEADER)).toBeCloseTo(2.34, 2);
    expect(earningsShift(earningsCTE(save({ cube: [4, AfxRarity.EPIC] })), HEADER)).toBeCloseTo(4.77, 2);
  });

  it('follows the stones: none in the pool (Joo’s 42.36)', () => {
    expect(earningsShift(earningsCTE(save({}, 0)), HEADER)).toBeCloseTo(42.36, 1);
  });

  it('is never below 0, and two places like the header', () => {
    expect(earningsShift(130, HEADER)).toBe(0);
    expect(earningsShift(100.123, HEADER)).toBe(28.59);
  });
});

/** A build whose numbers say which row it came from. */
const build = (te: number, h: number, i: number): BuildParams => {
  const canon = canonicalDelivered(te);
  return {
    sales: 1 + i,
    tier13: i === 1,
    waitStart: 1000 * te + h + i / 10,
    saleEnd: 2000 * te + h,
    peakELR: 1e12 * te + h + i,
    // The eggs the build delivers itself, on top of its row's canonical counts.
    delivered: canon.map((c, e) => c + 1e15 * (e + 1) + te),
  };
};
const FROM = 190;
const TO = 210;
const cells = [];
for (let te = FROM; te <= TO; te++)
  for (const h of [0, 10, 57, 130]) cells.push({ te, h, builds: [build(te, h, 0), build(te, h, 1)] });
const table = readTable(
  packTable(
    { version: 1, referenceWeek: 1, cteBonus: 128.71, deliveryScore: 1, from: FROM, to: TO, builtAt: 'x' },
    cells
  ).buffer as ArrayBuffer
);

describe('shiftedLookup (Joo’s, as is)', () => {
  it('is the table itself with no shift', () => {
    expect(shiftedLookup(table, 0)).toBe(table.lookup);
  });

  it("reads the row the shift lower, rounded down, from the real TE's counts", () => {
    const lookup = shiftedLookup(table, 2.34);
    expect(lookup.shift).toBe(2.34);
    for (const h of [0, 57, 130]) {
      const raw = table.lookup(197, h)!;
      const builds = lookup(200, h)!;
      expect(builds).toHaveLength(raw.length);
      for (const [j, b] of builds.entries()) {
        // The same build, with the eggs it delivers itself on top of TE 200's counts.
        expect({ ...b, delivered: undefined }).toEqual({ ...raw[j], delivered: undefined });
        const canon = canonicalDelivered(200);
        b.delivered.forEach((d, e) =>
          expect(d - canon[e]).toBeCloseTo(raw[j].delivered[e] - canonicalDelivered(197)[e], 0)
        );
        expect(b).toEqual(rebase(raw[j], 197, canon));
      }
    }
  });

  it('rounds a whole shift to that row exactly, and has no row below the table', () => {
    expect(shiftedLookup(table, 3)(200, 10)!.map(b => b.peakELR)).toEqual(table.lookup(197, 10)!.map(b => b.peakELR));
    expect(shiftedLookup(table, 2.34)(FROM + 2, 10)).toBeNull();
  });
});

describe('shiftedTable: a shifted table has rows only from from + Δ (this page’s wrapper)', () => {
  it('its range starts at the first TE with a row, and nothing below', () => {
    expect(shiftedFrom({ from: 120 }, 24.93)).toBe(145);
    expect(shiftedFrom({ from: 120 }, 3)).toBe(123);
    expect(shiftedFrom({ from: 120 }, 0)).toBe(120);
    const t = shiftedTable(table, 2.34);
    expect(t.header.from).toBe(FROM + 3);
    expect(t.header.to).toBe(TO);
    expect(t.lookup(FROM + 2, 10)).toBeNull();
    expect(t.lookup(FROM + 3, 10)!.map(b => b.peakELR)).toEqual(table.lookup(FROM, 10)!.map(b => b.peakELR));
    expect(shiftedTable(table, 0)).toBe(table);
  });

  it('joined to the maxed table per leg: the maxed one (scaled) below from + Δ, the shifted one from there', () => {
    const maxed = readTable(
      packTable({ version: 1, referenceWeek: 1, cteBonus: 128.71, deliveryScore: 1, from: 180, to: 205, builtAt: 'x' }, [
        { te: 192, h: 10, builds: [{ ...build(192, 10, 0), peakELR: 100 }] },
        { te: 200, h: 10, builds: [{ ...build(200, 10, 0), peakELR: 100 }] },
      ]).buffer as ArrayBuffer
    );
    const joined = compositeTable(shiftedTable(table, 2.34), maxed, 0.5);
    expect(joined.lookup(192, 10)!.map(b => b.peakELR)).toEqual([50]);
    expect(joined.lookup(200, 10)!.map(b => b.peakELR)).toEqual(table.lookup(197, 10)!.map(b => b.peakELR));
    expect(joined.lookup(193, 10)!.map(b => b.peakELR)).toEqual(table.lookup(190, 10)!.map(b => b.peakELR));
    expect(joined.header.from).toBe(180);
    expect(joined.header.to).toBe(TO);
  });
});
