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

  it('a build whose sale buys fall in time away is not taken: no sooner than the simulator, within 2 hours', () => {
    const p = price();
    expect(p.start).toBe(START);
    expect(p.end).toBeGreaterThanOrEqual(SIM_END - 3600);
    expect(Math.abs(p.end - SIM_END)).toBeLessThan(2 * 3600);
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
