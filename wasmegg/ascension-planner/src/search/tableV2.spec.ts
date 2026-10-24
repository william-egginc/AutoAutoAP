import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packTable, readTable, type TableHeader } from './precomputedTable';
import { sweepTails, tailTo, type BuildParams } from './precomputedLeg';
import { checkStructure } from './tableCheck';
import { bestReplay, replayContinue, replayTail, sweepReplay, V1_FIELDS, V2_FIELDS, type BuildExtras } from './tableV2';
import { holdUntilOf, nextAvailable, type Availability } from './availability';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

/**
 * Twenty real cells of the maxed table, made as `--generate --v2` makes them (scripts/precompute.ts
 * --v2-check --dump, egg-beta2 simulator, the cleaned maxed input: no account data), TE 120-489 at
 * assorted hours. Their version 1 numbers are the deployed table.bin's to the bit.
 */
type Cell = { te: number; h: number; builds: (BuildParams & { extras: BuildExtras })[] };
const cells: Cell[] = readFileSync(fileURLToPath(new URL('./tableV2.fixture.jsonl', import.meta.url)), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l));

const header = (version: 1 | 2, from: number, to: number): Omit<TableHeader, 'slots'> => ({
  version,
  referenceWeek: 1799654400,
  cteBonus: 128.71,
  deliveryScore: 1,
  from,
  to,
  builtAt: 'x',
  ...(version === 2 ? { teThresholds: [...TE_BREAKPOINTS] } : {}),
});
const plain = (b: BuildParams & { extras?: BuildExtras }): BuildParams => {
  const { extras: _, ...rest } = b;
  return rest;
};
const REFERENCE_WEEK = 1799654400;

describe('table version 2 file', () => {
  it('has twenty cells to test with, made by the generator', () => {
    expect(cells).toHaveLength(20);
    expect(cells.every(c => c.builds.length && c.builds.every(b => b.extras))).toBe(true);
  });

  it('round-trips every build and its extras exactly, and reads as version 1 does', () => {
    const v2 = readTable(packTable(header(2, 120, 489), cells).buffer as ArrayBuffer);
    const v1 = readTable(
      packTable(
        header(1, 120, 489),
        cells.map(c => ({ ...c, builds: c.builds.map(plain) }))
      ).buffer as ArrayBuffer
    );
    expect(v2.header.version).toBe(2);
    expect(v2.header.fields).toEqual([...V2_FIELDS]);
    expect(v2.header.fields!.slice(0, 9)).toEqual([...V1_FIELDS]);
    expect(v2.header.teThresholds).toEqual([...TE_BREAKPOINTS]);
    expect(v1.extras).toBeUndefined();
    for (const c of cells) {
      expect(v2.lookup(c.te, c.h)).toEqual(c.builds.map(plain));
      expect(v2.lookup(c.te, c.h)).toEqual(v1.lookup(c.te, c.h));
      expect(v2.extras!(c.te, c.h)).toEqual(c.builds.map(b => b.extras));
    }
    // An empty cell reads empty, and outside the table null, as in version 1.
    expect(v2.lookup(121, 1)).toEqual([]);
    expect(v2.extras!(121, 1)).toEqual([]);
    expect(v2.lookup(119, 0)).toBeNull();
    expect(v2.extras!(490, 0)).toBeNull();
  });

  it('is about 16/9 the size of version 1', () => {
    const a = packTable(header(2, 120, 489), cells).length;
    const b = packTable(
      header(1, 120, 489),
      cells.map(c => ({ ...c, builds: c.builds.map(plain) }))
    ).length;
    expect(Math.abs(a / b - 16 / 9)).toBeLessThan(0.01);
  });

  it('refuses a version 2 file without its field list, or with version 1 not first in it', () => {
    const bytes = packTable(header(2, 300, 300), [cells.find(c => c.te === 300)!]);
    const len = new DataView(bytes.buffer).getUint32(0, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + len)));
    const redo = (h: object) => {
      // Same-length header JSON, so the body stays where it was.
      let s = JSON.stringify(h);
      s = s + ' '.repeat(Math.max(0, len - s.length));
      const out = bytes.slice();
      out.set(new TextEncoder().encode(s.slice(0, len)), 4);
      return out.buffer as ArrayBuffer;
    };
    expect(() => readTable(redo({ ...json, fields: undefined }))).toThrow('field list');
    expect(() => readTable(redo({ ...json, fields: ['flagz', ...json.fields.slice(1)] }))).toThrow('field list');
    expect(() => readTable(redo({ ...json, version: 3 }))).toThrow('version 3 is not supported');
    expect(readTable(redo(json)).lookup(300, 10)).toHaveLength(3);
  });

  it('passes the table checker as its version 1 twin does', () => {
    const one = cells.filter(c => c.te === 300);
    const v1 = checkStructure(
      packTable(
        header(1, 300, 300),
        one.map(c => ({ ...c, builds: c.builds.map(plain) }))
      ).buffer as ArrayBuffer
    );
    const v2 = checkStructure(packTable(header(2, 300, 300), one).buffer as ArrayBuffer);
    expect(v2.readable).toBe(true);
    expect(v2.errors).toEqual(v1.errors);
  });
});

describe('replayTail', () => {
  it('with hours off is the stored arrival (tailTo) to the bit, on 20 cells, every target and build', () => {
    let n = 0;
    for (const c of cells) {
      const start = REFERENCE_WEEK + c.h * 3600;
      for (let target = c.te + 1; target <= 490; target++) {
        for (const b of c.builds) {
          const want = tailTo(plain(b), target);
          const got = replayTail(plain(b), b.extras, target, { start });
          if (!want) {
            expect(got).toBeNull();
            continue;
          }
          n++;
          expect(got!.seconds).toBe(want.seconds);
          expect(got!.endTE).toBe(want.endTE);
          expect(got!.delivered).toEqual(want.delivered);
          expect(got!.heldSeconds).toBe(0);
        }
      }
    }
    expect(n).toBeGreaterThan(5000);
  });

  it("keeps tailTo's late start (lateBy)", () => {
    const c = cells.find(c => c.te === 250)!;
    for (const b of c.builds)
      expect(replayTail(plain(b), b.extras, 260, { start: 0, lateBy: 1800 })!.seconds).toBe(
        tailTo(plain(b), 260, 1800)!.seconds
      );
  });

  it("with the simulator's order differs from the table's only for builds that wait on humility", () => {
    for (const c of cells)
      for (const b of c.builds) {
        if (b.extras.waitEgg !== 1) continue;
        for (const target of [c.te + 1, c.te + 10, 490].filter(t => t > c.te && t <= 490)) {
          const a = replayTail(plain(b), b.extras, target, { start: 0 });
          const s = replayTail(plain(b), b.extras, target, { start: 0, order: 'simulator' });
          expect(s?.seconds).toBe(a?.seconds);
        }
      }
  });

  it('with the player always around is the same as hours off', () => {
    for (const c of cells.slice(0, 8))
      for (const b of c.builds) {
        const start = REFERENCE_WEEK + c.h * 3600;
        const target = Math.min(490, c.te + 20);
        expect(replayTail(plain(b), b.extras, target, { start, holdUntil: t => t })).toEqual(
          replayTail(plain(b), b.extras, target, { start })
        );
      }
  });

  it('with hours, holds every shift into them, and a hold costs at most its own length', () => {
    const hours: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
    const holdUntil = (t: number) => nextAvailable(t, hours);
    let held = 0;
    for (const c of cells) {
      const start = REFERENCE_WEEK + c.h * 3600;
      for (const target of [c.te + 5, c.te + 30, 490].filter(t => t > c.te && t <= 490)) {
        for (const b of c.builds) {
          const off = replayTail(plain(b), b.extras, target, { start });
          const on = replayTail(plain(b), b.extras, target, { start, holdUntil });
          if (!off) continue;
          expect(on).not.toBeNull();
          // Held eggs count, so a hold costs at most its own length (and one before the sale's end can
          // even cost nothing: the farm lays meanwhile, and K3 waits for the sale anyway).
          expect(on!.seconds).toBeLessThanOrEqual(off.seconds + on!.heldSeconds + 1e-6);
          for (const s of on!.shifts) expect(holdUntil(start + s.at)).toBe(start + s.at);
          held += on!.heldSeconds;
        }
      }
    }
    expect(held).toBeGreaterThan(0);
  });

  it("matches the simulator's own held tail (measured with --v2-check, hours 7 am-11 pm Denver)", () => {
    // [te, hour, target, build index, the simulator's tail seconds with holds (runAscensionFromC3Variant)]
    const measured: [number, number, number, number, number][] = SIM_HELD;
    const hours: Availability = { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
    for (const [te, h, target, i, sim] of measured) {
      const c = cells.find(c => c.te === te && c.h === h)!;
      const b = c.builds[i];
      const r = replayTail(plain(b), b.extras, target, {
        start: REFERENCE_WEEK + h * 3600,
        holdUntil: t => nextAvailable(t, hours),
        order: 'simulator',
      });
      expect(Math.abs(r!.seconds - sim)).toBeLessThan(1);
    }
  });

  it('bestReplay picks the fastest build, the first of equals', () => {
    const c = cells.find(c => c.te === 200)!;
    const builds = c.builds.map(b => ({ params: plain(b), extras: b.extras }));
    const best = bestReplay(builds, 230, { start: REFERENCE_WEEK + c.h * 3600 })!;
    const times = builds.map(b => replayTail(b.params, b.extras, 230, { start: REFERENCE_WEEK + c.h * 3600 })?.seconds ?? Infinity);
    expect(best.seconds).toBe(Math.min(...times));
    expect(best.index).toBe(times.indexOf(Math.min(...times)));
  });
});

describe('sweepReplay', () => {
  const zones: Availability[] = [
    { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' },
    { days: [], fromHour: 8, toHour: 0, timezone: 'America/Denver' },
    { days: [1, 2, 3, 4, 5], fromHour: 9, toHour: 21, timezone: 'America/New_York' },
  ];
  it('is replayTail on every checkpoint, to the bit: 20 cells, every build, both orders, hours on and off', () => {
    let n = 0;
    let held = 0;
    const bad: string[] = [];
    const out = [0, 0, 0, 0, 0];
    for (const [ci, c] of cells.entries()) {
      // Each cell with hours off and two of the schedules, in turn, from a few start instants.
      for (const zi of [0, 1 + (ci % 3), 1 + ((ci + 1) % 3)]) {
        const hours = zi ? zones[zi - 1] : null;
        const start = REFERENCE_WEEK + c.h * 3600 + zi * 7 * 86400 + (ci % 2) * 1800;
        const holdUntil = hours ? holdUntilOf(hours) : undefined;
        for (const order of ['table', 'simulator'] as const)
          for (const b of c.builds) {
            const o = { start, holdUntil, order, lateBy: ci % 4 === 3 ? 600 : 0 };
            const sw = sweepReplay(plain(b), b.extras, 490, { ...o, lowest: c.te + 1 });
            if (sw.from !== c.te + 1) bad.push(`${c.te}: from ${sw.from}`);
            // Every checkpoint near the start, then every third (the goal's sharing is the same arithmetic).
            for (let target = c.te + 1; target <= 490; target += target < c.te + 30 ? 1 : 3) {
              const want = replayTail(plain(b), b.extras, target, o);
              const i = target - sw.from;
              if (!want) {
                if (!Number.isNaN(sw.seconds[i])) bad.push(`${c.te}->${target}: reachable`);
                continue;
              }
              n++;
              sw.deliveredInto(i, out);
              if (
                sw.seconds[i] !== want.seconds ||
                sw.endTE[i] !== want.endTE ||
                out.some((x, e) => x !== want.delivered[e]) ||
                sw.held[i] !== want.heldSeconds ||
                sw.lastEgg[i] !== want.shifts[want.shifts.length - 1].egg
              )
                bad.push(`${c.te}:${c.h} ${order} zone ${zi} -> ${target}`);
              held += want.heldSeconds;
            }
          }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(20000);
    expect(held).toBeGreaterThan(0);
  }, 120_000);

  it('`only` gives the one checkpoint `top` as the whole sweep has it, to the bit, and nothing below it', () => {
    let n = 0;
    const bad: string[] = [];
    const a = [0, 0, 0, 0, 0];
    const b5 = [0, 0, 0, 0, 0];
    for (const [ci, c] of cells.entries()) {
      const hours = ci % 2 ? zones[ci % 3] : null;
      const start = REFERENCE_WEEK + c.h * 3600 + (ci % 2) * 1800;
      const holdUntil = hours ? holdUntilOf(hours) : undefined;
      for (const order of ['table', 'simulator'] as const)
        for (const b of c.builds) {
          const o = { start, holdUntil, order, lateBy: ci % 4 === 3 ? 600 : 0 };
          // As priceLeg asks: `lowest` the target itself, and below where the counts stand too.
          for (const target of [c.te - 1, c.te, c.te + 1, c.te + 7, c.te + 40, 300, 490]) {
            const whole = sweepReplay(plain(b), b.extras, target, { ...o, lowest: target });
            const one = sweepReplay(plain(b), b.extras, target, { ...o, lowest: target, only: true });
            const i = target - whole.from;
            if (one.from !== target || one.to !== target || one.seconds.length !== 1) {
              bad.push(`${c.te}->${target}: from ${one.from} to ${one.to}`);
              continue;
            }
            n++;
            whole.deliveredInto(i, a);
            one.deliveredInto(0, b5);
            const same = (x: number, y: number) => x === y || (Number.isNaN(x) && Number.isNaN(y));
            if (
              !same(one.seconds[0], whole.seconds[i]) ||
              one.endTE[0] !== whole.endTE[i] ||
              one.held[0] !== whole.held[i] ||
              one.lastEgg[0] !== whole.lastEgg[i] ||
              a.some((x, e) => x !== b5[e])
            )
              bad.push(`${c.te}:${c.h} ${order} -> ${target}`);
          }
        }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(500);
  });

  it('with hours off and the table order is sweepTails to the bit', () => {
    for (const c of cells.slice(0, 10))
      for (const b of c.builds) {
        const a = sweepTails(plain(b), 490, 0, c.te + 1);
        const r = sweepReplay(plain(b), b.extras, 490, { start: 0, lowest: c.te + 1 });
        expect(Array.from(r.seconds)).toEqual(Array.from(a.seconds));
        expect(Array.from(r.endTE)).toEqual(Array.from(a.endTE));
      }
  });
});

describe('holdUntilOf', () => {
  it('is nextAvailable to the second, across days, a midnight wrap, weekdays only and a half-hour zone', () => {
    const schedules: Availability[] = [
      { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' },
      { days: [], fromHour: 8, toHour: 0, timezone: 'America/Denver' },
      { days: [1, 2, 3, 4, 5], fromHour: 9, toHour: 21, timezone: 'America/New_York' },
      { days: [], fromHour: 22, toHour: 6, timezone: 'Asia/Kolkata' },
    ];
    for (const a of schedules) {
      const f = holdUntilOf(a);
      // Two weeks across the November change of clocks, every 7 minutes and 13 seconds.
      for (let t = 1793500000; t < 1793500000 + 14 * 86400; t += 433) expect(f(t)).toBe(nextAvailable(t, a));
    }
  });
});

describe('replayContinue', () => {
  const cont: BuildParams = {
    sales: 0,
    tier13: false,
    waitStart: 0,
    saleEnd: 0,
    peakELR: 2.1e12,
    delivered: cells.find(c => c.te === 250)!.builds[0].delivered,
  };
  it("without hours is continue's tailTo time on every checkpoint", () => {
    for (let target = 252; target <= 300; target++) {
      const a = tailTo(cont, target);
      const r = replayContinue(cont, 2, target, { start: 0 });
      expect(r!.seconds).toBeCloseTo(a!.seconds, 3);
      expect(r!.heldSeconds).toBe(0);
    }
  });
  it('with hours holds each shift into them and costs at most the holds', () => {
    const hours = zonesOf();
    const holdUntil = (t: number) => nextAvailable(t, hours);
    let held = 0;
    for (let target = 252; target <= 300; target += 4) {
      const start = REFERENCE_WEEK + target * 3600;
      const a = replayContinue(cont, 2, target, { start })!;
      const r = replayContinue(cont, 2, target, { start, holdUntil })!;
      expect(r.seconds).toBeLessThanOrEqual(a.seconds + r.heldSeconds + 1e-6);
      expect(r.seconds).toBeGreaterThanOrEqual(a.seconds);
      held += r.heldSeconds;
    }
    expect(held).toBeGreaterThan(0);
  });
});

function zonesOf(): Availability {
  return { days: [], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
}

const SIM_HELD: [number, number, number, number, number][] = [
  [120, 0, 121, 2, 1673999.9999999548],
  [120, 0, 150, 0, 6316054.185783379],
  [120, 0, 170, 2, 11190425.227625977],
  [135, 17, 150, 1, 3358156.416731307],
  [135, 17, 185, 0, 12296451.951333694],
  [150, 3, 155, 0, 1306359.779222774],
  [150, 3, 180, 0, 7171867.289404793],
  [165, 44, 166, 1, 910800.0000000014],
  [165, 44, 180, 2, 3956221.2729242314],
  [165, 44, 490, 0, 184452956.49462137],
  [175, 59, 180, 1, 1572777.7043871048],
  [175, 59, 205, 0, 7502930.979156425],
  [175, 59, 490, 0, 163650622.01301748],
  [190, 71, 195, 0, 1385791.4775117224],
  [190, 71, 220, 0, 7930445.433038278],
  [190, 71, 490, 0, 152167042.80037782],
  [200, 100, 230, 1, 6922546.054075802],
  [200, 100, 490, 0, 148550381.00124857],
  [205, 88, 235, 2, 6440367.328215208],
  [210, 123, 215, 0, 1434308.4583979882],
  [210, 123, 240, 2, 6127274.577646111],
  [210, 123, 490, 1, 102397617.19445989],
  [225, 130, 230, 1, 1627200.9999999723],
  [225, 130, 255, 1, 5742083.205058105],
  [225, 130, 490, 0, 79550427.60549119],
  [240, 9, 245, 0, 1106220.1296526939],
  [240, 9, 255, 2, 3260381.7892838083],
  [240, 9, 290, 2, 9272100.39530042],
  [250, 77, 265, 0, 2834316.4827485415],
  [250, 77, 490, 0, 68325204.80738817],
  [275, 140, 276, 2, 1774800.0000000638],
  [275, 140, 290, 1, 2979173.409919583],
  [275, 140, 325, 0, 9088690.166332193],
  [275, 140, 490, 2, 46420675.083765976],
  [300, 10, 330, 0, 4848975.8950271625],
  [300, 10, 490, 1, 38582264.51812113],
  [330, 160, 345, 1, 3137274.5587067627],
  [330, 160, 380, 0, 9058952.705596808],
  [330, 160, 490, 2, 34400087.43911505],
  [360, 35, 410, 0, 9861706.726017779],
];
