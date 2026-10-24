import { describe, expect, it } from 'vitest';
import { getBuildPhaseEndForSaleCount } from '@/lib/events';
import { canonicalDelivered, WEEK_HOURS, type BuildParams } from './precomputedLeg';
import { packTable, type TableHeader } from './precomputedTable';
import { REFERENCE_WEEK } from './tableBuild';
import { TIER_13_MIN_STARTING_TE } from './leg';
import {
  checkStamps,
  checkStructure,
  compareCell,
  currentChanges,
  currentMax,
  EXIT_CODE,
  inventoryOfStamp,
  readEffects,
  sampleCells,
  SIM_READ_EFFECTS,
  TIER13_MIN_TE,
  verdictOf,
} from './tableCheck';
import type { TableGear } from './tableGear';

const OURS = { simVersion: 'sim-test', referenceWeek: REFERENCE_WEEK };

/** A build our generator could make at (te, h): its sale end exactly, eggs above the start's. */
function build(te: number, h: number, sales: number, tier13 = false): BuildParams {
  const start = REFERENCE_WEEK + h * 3600;
  const saleEnd = getBuildPhaseEndForSaleCount(start, sales) - start;
  return {
    sales,
    tier13,
    waitStart: saleEnd - 3600,
    saleEnd,
    peakELR: 1e12 * sales,
    delivered: canonicalDelivered(te).map(d => d + 1e15 * sales),
  };
}

function cellsFor(from: number, to: number, edit?: (te: number, h: number, b: BuildParams[]) => BuildParams[]) {
  const cells: { te: number; h: number; builds: BuildParams[] }[] = [];
  for (let te = from; te <= to; te++)
    for (let h = 0; h < WEEK_HOURS; h++) {
      const builds = [1, 2, 3].map(s => build(te, h, s, te >= TIER13_MIN_TE && s === 3));
      cells.push({ te, h, builds: edit ? edit(te, h, builds) : builds });
    }
  return cells;
}

function header(from: number, to: number, extra: Partial<TableHeader> = {}): Omit<TableHeader, 'slots'> {
  return {
    version: 1,
    referenceWeek: REFERENCE_WEEK,
    cteBonus: 128.71,
    deliveryScore: 1,
    from,
    to,
    builtAt: '2026-10-19T00:00:00.000Z',
    simVersion: OURS.simVersion,
    ...extra,
  };
}

const bin = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;

describe('checkStructure', () => {
  it('passes a table our generator could have made', () => {
    const r = checkStructure(bin(packTable(header(188, 191), cellsFor(188, 191))));
    expect(r.errors).toEqual([]);
    expect(r.readable).toBe(true);
    expect(r.header?.slots).toBe(3);
  });

  it('pins the tier 13 floor to the one the table build uses', () => {
    expect(TIER13_MIN_TE).toBe(TIER_13_MIN_STARTING_TE);
  });

  it('finds tier 13 below 190, sale ends that are not the sale, eggs taken back and NaN', () => {
    const cells = cellsFor(188, 189, (te, h, b) => {
      if (h === 0) b[2] = { ...b[2], tier13: true };
      if (h === 1) b[1] = { ...b[1], saleEnd: b[1].saleEnd + 1 };
      if (h === 2) b[0] = { ...b[0], delivered: b[0].delivered.map((d, i) => (i === 0 ? d - 2e15 : d)) };
      if (h === 3) b[0] = { ...b[0], peakELR: NaN };
      if (h === 4) b[0] = { ...b[0], waitStart: -1 };
      if (h === 5) return [b[1], b[0], b[2]];
      return b;
    });
    const errs = checkStructure(bin(packTable(header(188, 189), cells))).errors.join('\n');
    expect(errs).toMatch(/tier 13 on a start TE below 190: 2 /);
    expect(errs).toMatch(/saleEnd not the end of the N-th sale: 2 /);
    expect(errs).toMatch(/delivered below the start's own count: 2 /);
    expect(errs).toMatch(/NaN or Infinity: 2 /);
    expect(errs).toMatch(/negative waitStart: 2 /);
    expect(errs).toMatch(/sale counts not rising across a cell: 2 /);
  });

  it('finds a tier 13 build below a plain one, and an empty cell', () => {
    const cells = cellsFor(200, 200, (te, h, b) => {
      if (h === 0) return [b[0], { ...b[1], tier13: true }, { ...b[2], tier13: false }];
      if (h === 1) return [];
      return b;
    });
    const errs = checkStructure(bin(packTable(header(200, 200), cells))).errors.join('\n');
    expect(errs).toMatch(/tier 13 at a lower sale count but not at a higher one: 1 \(first at TE 200 hour 0 slot 2\)/);
    expect(errs).toMatch(/a cell with no builds: 1 \(first at TE 200 hour 1\)/);
  });

  it('reads a cut-short file, a broken header and fake rows as such', () => {
    const good = packTable(header(200, 200), cellsFor(200, 200));
    const short = checkStructure(bin(good.subarray(0, good.length - 8)));
    expect(short.readable).toBe(false);
    expect(short.errors[0]).toMatch(/the file is \d+ bytes; 168 cells of 3 slots need/);
    const broken = good.slice();
    broken[5] = 0x7b; // '{' inside the JSON
    expect(checkStructure(bin(broken)).errors[0]).toMatch(/not JSON/);
    const fake = checkStructure(bin(packTable(header(200, 200, { fake: true }), cellsFor(200, 200))));
    expect(fake.errors.join()).toMatch(/fake rows/);
  });
});

describe('checkStamps', () => {
  const gear: TableGear = {
    earnings: [{ artifact: 'T4L Lunar totem', stones: ['T4 Lunar stone', 'T4 Lunar stone'] }],
    deliveryBare: [{ artifact: 'T4L Gusset', stones: ['T4 Quantum stone'] }],
    deliveryFull: [{ artifact: 'T4L Gusset', stones: ['T4 Tachyon stone', 'T4 Tachyon stone'] }],
    research: { comfy_nests: 50 },
    epicResearch: { epic_multiplier: 100 },
    colleggtibles: { carbon_fiber: 3 },
  };

  it('is stale on another simulator or none, and wrong on another reference week', () => {
    expect(checkStamps(header(200, 200, { simVersion: '31b596bb' }) as TableHeader, OURS).stale[0]).toBe(
      'stale simulator: built with 31b596bb, this checker is sim-test'
    );
    expect(checkStamps(header(200, 200, { simVersion: undefined }) as TableHeader, OURS).stale[0]).toMatch(/unstamped/);
    expect(checkStamps(header(200, 200, { referenceWeek: 1 }) as TableHeader, OURS).errors[0]).toMatch(
      /reference week 1/
    );
    expect(checkStamps(header(200, 200) as TableHeader, OURS)).toMatchObject({ stale: [], errors: [] });
  });

  it("checks a gear stamp's research against the table's own k3", () => {
    const k3 = { research: { comfy_nests: 50 }, delivery: [] };
    expect(checkStamps(header(200, 200, { gear, k3 }) as TableHeader, OURS).errors).toEqual([]);
    const off = checkStamps(
      header(200, 200, { gear, k3: { ...k3, research: { comfy_nests: 49 } } }) as TableHeader,
      OURS
    );
    expect(off.errors).toEqual(["gear stamp: research is not the table's own k3 research"]);
    const empty = checkStamps(header(200, 200, { gear: { ...gear, earnings: [] }, k3 }) as TableHeader, OURS);
    expect(empty.errors).toEqual(['gear stamp: no earnings set']);
  });

  it('says what it assumes, and when the settings are not stamped', () => {
    const base = { name: 'alt.json --reference', epicResearch: {}, colleggtibleEffects: { earnings: 1.05 } };
    const a = checkStamps(header(200, 200) as TableHeader, OURS, base).assumes;
    expect(a).toContain('settings: not stamped (assumed: doubler on, defer off)');
    expect(a.join('\n')).toMatch(
      /colleggtible effects: not stamped \(assumed: alt.json --reference's, earnings x1.05\)/
    );
    const stamped = checkStamps(
      header(200, 200, { settings: { assumeDoubleEarnings: false, deferForEarnings: false } }) as TableHeader,
      OURS
    ).assumes;
    expect(stamped).toContain('settings (stamped): doubler off, defer off');
  });
});

describe('sampleCells', () => {
  it('always has the edges, then the same random cells for the same seed', () => {
    const a = sampleCells({ from: 120, to: 489 }, 24, 7);
    expect(a.filter(c => c.edge).map(c => [c.te, c.h])).toEqual([
      [120, 0],
      [120, 83],
      [120, 167],
      [489, 0],
      [489, 83],
      [489, 167],
    ]);
    expect(a).toHaveLength(30);
    expect(new Set(a.map(c => c.te * WEEK_HOURS + c.h)).size).toBe(30);
    expect(sampleCells({ from: 120, to: 489 }, 24, 7)).toEqual(a);
    expect(sampleCells({ from: 120, to: 489 }, 24, 8)).not.toEqual(a);
    for (const c of a) expect(c.te >= 120 && c.te <= 489 && c.h >= 0 && c.h < WEEK_HOURS).toBe(true);
  });

  it('stops at the whole table when it is smaller than asked', () => {
    expect(sampleCells({ from: 200, to: 200 }, 1000, 1)).toHaveLength(WEEK_HOURS);
  });
});

describe('compareCell', () => {
  const a = [build(200, 0, 1), build(200, 0, 2)];
  it('same to the bit', () => {
    expect(compareCell(a, JSON.parse(JSON.stringify(a)))).toEqual({ result: 'same', detail: '' });
  });

  it("close: Joo's doubler-on generator (0.14 s, 1e-7 relative)", () => {
    const b = a.map(x => ({ ...x, waitStart: x.waitStart + 0.14, delivered: x.delivered.map(d => d * (1 + 1e-7)) }));
    const r = compareCell(a, b);
    expect(r.result).toBe('close');
    expect(r.detail).toMatch(/delivered curiosity|waitStart/);
  });

  it('different: past a second, past a millionth, or another build', () => {
    expect(
      compareCell(
        a,
        a.map(x => ({ ...x, waitStart: x.waitStart + 2 }))
      ).result
    ).toBe('differ');
    expect(
      compareCell(
        a,
        a.map(x => ({ ...x, peakELR: x.peakELR * 1.01 }))
      ).detail
    ).toMatch(/peakELR/);
    expect(compareCell(a, [a[0], { ...a[1], tier13: true }]).detail).toBe(
      'build 1: 2-sale in the table, 2-sale tier13 rebuilt'
    );
    expect(compareCell(a, [a[0]]).detail).toBe('2 builds in the table, 1 rebuilt');
  });
});

describe('verdictOf', () => {
  const cells = (same: number, close = 0, differ = 0) => ({ same, close, differ });
  it('PASS only when every cell is identical; CLOSE apart; FAIL and STALE', () => {
    expect(verdictOf({ errors: [], stale: [], cells: cells(30) })).toBe('PASS');
    expect(verdictOf({ errors: [], stale: [], cells: cells(28, 2) })).toBe('CLOSE');
    expect(verdictOf({ errors: [], stale: [], cells: cells(28, 1, 1) })).toBe('FAIL');
    expect(verdictOf({ errors: ['fake rows'], stale: [], cells: cells(30) })).toBe('FAIL');
    expect(verdictOf({ errors: [], stale: ['stale simulator'] })).toBe('STALE');
    expect(verdictOf({ errors: [], stale: ['stale simulator'], ignoreSim: true, cells: cells(28, 2) })).toBe('CLOSE');
    expect(verdictOf({ errors: [], stale: ['stale simulator'], ignoreSim: true, cells: cells(0, 0, 30) })).toBe('FAIL');
    expect([EXIT_CODE.PASS, EXIT_CODE.CLOSE, EXIT_CODE.FAIL, EXIT_CODE.STALE]).toEqual([0, 1, 1, 2]);
  });
});

describe('still current', () => {
  const max = currentMax();
  it('today’s maxed account against itself is current', () => {
    expect(currentChanges(max, max)).toEqual([]);
  });

  it('a changed effect the simulator reads is a change; an effect it does not read is not', () => {
    const changed = { ...max, colleggtibleEffects: { ...max.colleggtibleEffects, earnings: 1 } };
    expect(currentChanges(changed, max)).toEqual([
      `colleggtible effects: earnings x1 -> x${max.colleggtibleEffects.earnings}`,
    ]);
    const unread = { ...max, colleggtibleEffects: { ...max.colleggtibleEffects, somethingNew: 2 } };
    expect(currentChanges(unread, max)).toEqual([]);
    expect(Object.keys(readEffects({ somethingNew: 2 }))).toEqual(Object.keys(SIM_READ_EFFECTS).sort());
  });

  it('epic research the planner does not model is not a change', () => {
    const more = { ...max, epicResearch: { ...max.epicResearch, warp_shift: 16 } };
    expect(currentChanges(max, more)).toEqual([]);
    const less = { ...max, epicResearch: { ...max.epicResearch, epic_multiplier: 90 } };
    expect(currentChanges(less, max)).toEqual(['epic research: epic_multiplier 90 -> 100']);
  });
});

describe('inventoryOfStamp', () => {
  it('owns as many of each as one set wears at once', () => {
    const slot = (artifact: string, ...stones: string[]) => ({ artifact, stones });
    const inv = inventoryOfStamp({
      earnings: [
        slot('T4L Lunar totem', 'T4 Lunar stone', 'T4 Lunar stone'),
        slot('T4L Puzzle cube', 'T4 Lunar stone'),
      ],
      deliveryBare: [slot('T4L Lunar totem', 'T4 Quantum stone')],
      deliveryFull: [slot('T4L Gusset', 'T4 Tachyon stone'), slot('T4L Gusset', 'T4 Tachyon stone')],
      research: {},
      epicResearch: {},
      colleggtibles: {},
    });
    expect(inv.artifacts).toEqual({ 'T4L Lunar totem': 1, 'T4L Puzzle cube': 1, 'T4L Gusset': 2 });
    expect(inv.stones).toEqual({ 'T4 Lunar stone': 3, 'T4 Quantum stone': 1, 'T4 Tachyon stone': 2 });
  });
});
