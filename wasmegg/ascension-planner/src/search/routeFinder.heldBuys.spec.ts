/**
 * THE HELD BUYS (R10, 21 Nov 2026). With weekly hours the simulator holds a build's research purchases until the
 * player is around (auto/shifts/helpers/advanceTime.ts `stretchToHours`); the table replay (tableV2.ts) holds only the
 * tail's shifts. A build whose sale purchases fall in time away can miss its sale, and the instant answer was early.
 *
 * One leg, the maxed sim5 table's cell (TE 120 at Sun 29 Nov 2026 5:00 PM Denver), work9to5 hours, held shifts on:
 *  - priceLeg before: ends +1104.5 h on the 1-sale build (its buys done 1.6 h before Friday's sale ends);
 *  - the simulator: +1120.9 h on the 2-sale build (the 1-sale build's buys, held over the 9-5 blocks, miss the sale);
 *  - the simulator with only the tail's shift holds: +1104.5 h to the second (the replay itself is exact).
 * Measured with the leg harness (Reliability's scratch early/legmask.ts, start-state.json with the placeholder ID,
 * --reference --combo maxed) on r10-core 419f735f5.
 */
import { describe, expect, it } from 'vitest';
import { priceLeg, tailOptionsOf, type BuildLookup } from './routeFinder';
import { instantTail } from './instantGear';
import { canonicalDelivered, pacificHourOfWeek } from './precomputedLeg';
import type { Availability } from './availabilitySchedule';

const TE = 120;
const TARGET = 140;
/** Sun 29 Nov 2026 5:00 PM Denver. */
const START = 1795996800;
/** The simulator's leg (real holds) and the simulator with only the tail's shift holds. */
const SIM_END = 1800032026.4180155;
const SIM_SHIFTS_ONLY_END = 1799973117.4583967;
// prettier-ignore
const CELL = [
  {
    "sales": 1,
    "tier13": false,
    "waitStart": 487552.3569940996,
    "saleEnd": 493200,
    "peakELR": 740621410887.6749,
    "delivered": [
      788675588020332700,
      660040234225175900,
      660009477003912100,
      660598783930823600,
      660000000000000000
    ],
    "extras": {
      "layRate": 740621410887.6749,
      "shipRate": 746879697731.8441,
      "h1At": 487492.3569940996,
      "h1Rate": 327504059190,
      "k3At": 487492.3569940996,
      "k3Rate": 640182598055.8665,
      "waitEgg": 1
    }
  },
  {
    "sales": 2,
    "tier13": false,
    "waitStart": 1011659.9999999155,
    "saleEnd": 1098000,
    "peakELR": 811265878570.7963,
    "delivered": [
      951161875998215000,
      660043545514476200,
      660009477003912100,
      660598783930823600,
      660000000000000000
    ],
    "extras": {
      "layRate": 819255289080.6874,
      "shipRate": 811265878570.7963,
      "h1At": 1011599.9999999155,
      "h1Rate": 362276095104.00006,
      "k3At": 1011599.9999999155,
      "k3Rate": 695370753060.6823,
      "waitEgg": 1
    }
  },
  {
    "sales": 3,
    "tier13": false,
    "waitStart": 1616459.9999999155,
    "saleEnd": 1702800,
    "peakELR": 838308074523.1564,
    "delivered": [
      1170738895021748200,
      660044936255982300,
      660009477003912100,
      660598783930823600,
      660000000000000000
    ],
    "extras": {
      "layRate": 839736671307.7046,
      "shipRate": 838308074523.1564,
      "h1At": 1616399.9999999155,
      "h1Rate": 371332997481.60004,
      "k3At": 1616399.9999999155,
      "k3Rate": 718549778162.7054,
      "waitEgg": 1
    }
  }
];

/** Free 7 AM-11 PM every day, less 9 AM-5 PM Monday to Friday (Monday 00:00 first). */
const blocked: number[] = [];
for (let i = 0; i < 168; i++) {
  const d = Math.floor(i / 24);
  const h = i % 24;
  if (!(h >= 7 && h < 23 && !(d <= 4 && h >= 9 && h < 17))) blocked.push(i);
}
const hours: Availability = {
  days: [0, 1, 2, 3, 4, 5, 6],
  fromHour: 7,
  toHour: 23,
  timezone: 'America/Denver',
  blocked,
};
const lookup: BuildLookup = (te, hour) => (te === TE && hour === pacificHourOfWeek(START) ? (CELL as never) : null);
const price = (o = {}) =>
  priceLeg(
    lookup,
    TE,
    START,
    canonicalDelivered(TE),
    TARGET,
    1,
    hours,
    { ...instantTail(hours, true, 0), ...o },
    hours
  )!;

describe('instant answer: purchases held to weekly hours (heldBuys)', () => {
  it('without the rule it is the simulator with only the shift holds (guards the fixture)', () => {
    const p = price({ heldBuys: false });
    expect(p.start).toBe(START);
    expect(p.build.sales).toBe(1);
    expect(Math.abs(p.end - SIM_SHIFTS_ONLY_END)).toBeLessThan(60);
  });

  it('the lag only, no week late (21 Nov): the 1-sale build is kept, 15.4 h before the simulator, which misses this sale', () => {
    // Pricing it a week late matched the simulator here, but the table cannot tell this miss from the bae5 build below,
    // which makes its sale (routeFinder.ts `heldBuys`, NO WEEK LATE).
    const p = price();
    expect(p.start).toBe(START);
    expect(p.build.sales).toBe(1);
    expect(p.end).toBeLessThan(SIM_END - 12 * 3600);
  });

  it('a player around at the sale’s start (7 AM-11 PM every day): unchanged', () => {
    const daily: Availability = { days: [0, 1, 2, 3, 4, 5, 6], fromHour: 7, toHour: 23, timezone: 'America/Denver' };
    const at = (o: object) =>
      priceLeg(
        lookup,
        TE,
        START,
        canonicalDelivered(TE),
        TARGET,
        1,
        daily,
        { ...instantTail(daily, true, 0), ...o },
        daily
      )!;
    expect(at({}).end).toBe(at({ heldBuys: false }).end);
    expect(at({}).build.sales).toBe(1);
  });

  it('without hours nothing changes', () => {
    const off = (h?: Availability) =>
      priceLeg(lookup, TE, START, canonicalDelivered(TE), TARGET, 1, h, instantTail(h, true, 0), h)!;
    expect(off(undefined).end).toBe(
      priceLeg(
        lookup,
        TE,
        START,
        canonicalDelivered(TE),
        TARGET,
        1,
        undefined,
        { order: 'simulator', heldBuys: false },
        undefined
      )!.end
    );
  });

  it('goes to the workers with the other tail options', () => {
    expect(tailOptionsOf({ holdShifts: true, heldBuys: false })).toEqual({ holdShifts: true, heldBuys: false });
    expect(tailOptionsOf({ holdShifts: true })).toEqual({ holdShifts: true });
  });
});

/**
 * A FALSE WEEK (Tables, 21 Nov 2026, notes/short-leg-cliff-2026-11-21.md): the Carpet bae5 board gear's form G table, 285 to
 * 286 from Thu 9 Dec 2027 12:00 AM PT (the leg starts at 4:00 PM PT, when the player is back), work9to5 hours. The
 * 1-sale tier-13 build's last purchase is 1.2 h before Saturday's sale ends; the lag (2.1 h) put it past the end and
 * priced it a week later, so the 2-sale build was taken, +123 h. The simulator from the same start makes the sale:
 * 1-sale-tier13, 102.2 h. Across that week heldBuys put 48 starts more than 48 h late, none without it. Measured with
 * Tables' cliff tool (scratch scripts/legcliff.ts, the 18 Nov synthetic save te160 with the placeholder ID) on bf3678aac.
 */
const BAE5_TE = 285;
const BAE5_START = 1828339200;
const BAE5_SIM_END = 1828707137.0533583;
// prettier-ignore
const BAE5_CELL = [
  {
    "sales": 1,
    "tier13": true,
    "waitStart": 143226.47622701782,
    "saleEnd": 147600,
    "peakELR": 2038381506385.7727,
    "delivered": [
      10030620938319415000,
      9900028798749518000,
      9900000000001410000,
      9900306910583056000,
      9900000000000000000
    ],
    "extras": {
      "layRate": 2043346786958.6128,
      "shipRate": 2060619710312.8313,
      "h1At": 143226.47622701782,
      "h1Rate": 851394799120.3947,
      "k3At": 143226.47622701782,
      "k3Rate": 2038381506385.7727,
      "waitEgg": 4
    }
  },
  {
    "sales": 2,
    "tier13": true,
    "waitStart": 735661.7002555408,
    "saleEnd": 752400,
    "peakELR": 2292729567837.527,
    "delivered": [
      10649021076907220000,
      9900028798749518000,
      9900000000001410000,
      9900306910583056000,
      9900000000000000000
    ],
    "extras": {
      "layRate": 2292729567837.527,
      "shipRate": 2305447805061.23,
      "h1At": 735661.7002555408,
      "h1Rate": 919590884740.4202,
      "k3At": 735661.7002555408,
      "k3Rate": 2292729567837.527,
      "waitEgg": 4
    }
  },
  {
    "sales": 3,
    "tier13": true,
    "waitStart": 1280879.00067544,
    "saleEnd": 1357200,
    "peakELR": 2470254949702.915,
    "delivered": [
      11274860858733320000,
      9900197511490757000,
      9900000000001410000,
      9900306910583056000,
      9900000000000000000
    ],
    "extras": {
      "layRate": 2527734348540.8745,
      "shipRate": 2493286878987.5444,
      "h1At": 1280819.0006754398,
      "h1Rate": 919590884740.4202,
      "k3At": 1280819.0006754398,
      "k3Rate": 2243958191088.79,
      "waitEgg": 1
    }
  }
];
// prettier-ignore
const bae5Hours = {"days": [0, 1, 2, 3, 4, 5, 6], "fromHour": 7, "toHour": 23, "timezone": "America/Denver", "blocked": [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 33, 34, 35, 36, 37, 38, 39, 40, 47, 48, 49, 50, 51, 52, 53, 54, 57, 58, 59, 60, 61, 62, 63, 64, 71, 72, 73, 74, 75, 76, 77, 78, 81, 82, 83, 84, 85, 86, 87, 88, 95, 96, 97, 98, 99, 100, 101, 102, 105, 106, 107, 108, 109, 110, 111, 112, 119, 120, 121, 122, 123, 124, 125, 126, 143, 144, 145, 146, 147, 148, 149, 150, 167]} as Availability;
const bae5Price = (o = {}) =>
  priceLeg(
    (te, hour) => (te === BAE5_TE && hour === 88 ? (BAE5_CELL as never) : null),
    BAE5_TE,
    BAE5_START,
    canonicalDelivered(BAE5_TE),
    BAE5_TE + 1,
    1,
    bae5Hours,
    { ...instantTail(bae5Hours, true, 0), ...o }
  )!;

describe('heldBuys: a build that still makes its sale is not priced a week late', () => {
  it('without the rule the table is the simulator (guards the fixture)', () => {
    const p = bae5Price({ heldBuys: false });
    expect(p.build.sales).toBe(1);
    expect(Math.abs(p.end - BAE5_SIM_END)).toBeLessThan(3600);
  });

  it('with it: the 1-sale build, within 2 hours of the simulator (was the 2-sale build, +123 h)', () => {
    const p = bae5Price();
    expect(p.build.sales).toBe(1);
    expect(Math.abs(p.end - BAE5_SIM_END)).toBeLessThan(2 * 3600);
  });
});
