/**
 * K3'S SHARE FROM KINDNESS AT ITS SHIFT (code review round 2, 22 Nov 2026, T2, math-simcheck-1; precomputedLeg.ts
 * `kindnessAtK3`, the Mac-only stopgap). The fixture is one served cell, read from the maxed sim5 table
 * (staged/sim5-max-own-2026-11-16/table-v2.bin, sha256 704f13a9...): TE 95, hour 129 (Sat 9 AM PT), its three builds
 * with their extras. The 2-sale build to 100 TE was 1,301,897 s on the table against the simulator's 1,388,269 s
 * (runAscensionFromC3Variant, the review's run); the other two did not move. Every path prices it the same way: tailTo,
 * sweepTails, replayTail and sweepReplay, to the bit.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kindnessAtK3, sweepTails, tailTo, type BuildParams } from './precomputedLeg';
import { replayTail, sweepReplay, type BuildExtras } from './tableV2';

const cell: { te: number; h: number; builds: (BuildParams & { extras: BuildExtras })[] } = JSON.parse(
  readFileSync(fileURLToPath(new URL('./tableV2.k3share.fixture.json', import.meta.url)), 'utf8')
);
const [one, two, three] = cell.builds;
const plain = (b: BuildParams & { extras?: BuildExtras }): BuildParams => {
  const { extras: _, ...rest } = b;
  return rest;
};

describe("K3's share at its shift (T2)", () => {
  it("the 2-sale build to 100 TE takes the simulator's 1,388,269 s; the 1- and 3-sale builds are as before", () => {
    expect(Math.floor(tailTo(two, 100)!.seconds)).toBe(1388269);
    expect(Math.floor(tailTo(plain(two), 100)!.seconds)).toBe(1301897);
    expect(tailTo(one, 100)!.seconds).toBe(tailTo(plain(one), 100)!.seconds);
    expect(tailTo(three, 100)!.seconds).toBe(tailTo(plain(three), 100)!.seconds);
  });

  it('only a version 2 build with a bare 60 s after K3, and never below a threshold already passed', () => {
    expect(kindnessAtK3(plain(two))).toBeNull();
    expect(kindnessAtK3({ ...two, extras: { ...two.extras, k3At: two.waitStart - 120 } })).toBeNull();
    expect(kindnessAtK3({ ...two, extras: { ...two.extras, waitEgg: 4 } })).toBeNull();
    const k = kindnessAtK3(two)!;
    expect(k).toBeLessThan(two.delivered[1]);
    // A huge rate would take it below the last threshold passed: it stops there.
    const floor = kindnessAtK3({ ...two, extras: { ...two.extras, k3Rate: 1e30 } })!;
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThanOrEqual(k);
  });

  it('sweepTails, replayTail and sweepReplay agree with tailTo to the bit, every build and target', () => {
    let n = 0;
    for (const b of cell.builds) {
      const sw = sweepTails(b, 140);
      for (const order of ['table', 'simulator'] as const) {
        const rs = sweepReplay(b, b.extras, 140, { start: 0, order });
        // From the sweeps' first checkpoint: a target the build already holds has no entry there.
        for (let target = Math.max(sw.from, rs.from); target <= 140; target++) {
          const want = tailTo(b, target);
          const i = target - sw.from;
          const r = replayTail(b, b.extras, target, { start: 0, order });
          if (!want) {
            expect(Number.isNaN(sw.seconds[i])).toBe(true);
            continue;
          }
          expect(sw.seconds[i]).toBe(want.seconds);
          if (order === 'table' || b.extras.waitEgg !== 4) {
            expect(r!.seconds).toBe(want.seconds);
            expect(rs.seconds[target - rs.from]).toBe(want.seconds);
          }
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(50);
  });
});
