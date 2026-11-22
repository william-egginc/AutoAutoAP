/**
 * A SCALED BUILD SCALES ITS HOLD RATES TOO (code review 22 Nov 2026, T1.2). The composite's maxed half
 * (precomputedTable.ts compositeTable) and the finder's `deliveryScale` (routeFinder.ts scaled) moved a build's
 * peak but kept the extras' lay, ship, H1 and K3 rates, so the held replay credited eggs at the unscaled rate.
 * The form G already moved all of them; now the three paths agree (tableV2.ts `scaleBuild`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compositeTable, packTable, readTable, withExtras } from './precomputedTable';
import { scaleBuild, type BuildExtras } from './tableV2';
import type { BuildParams } from './precomputedLeg';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';

type Cell = { te: number; h: number; builds: (BuildParams & { extras: BuildExtras })[] };
const cells: Cell[] = readFileSync(fileURLToPath(new URL('./tableV2.fixture.jsonl', import.meta.url)), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l));
const v2 = (to: number) =>
  withExtras(
    readTable(
      packTable(
        {
          version: 2,
          referenceWeek: 1799654400,
          cteBonus: 128.71,
          deliveryScore: 1,
          from: 120,
          to,
          builtAt: 'x',
          teThresholds: [...TE_BREAKPOINTS],
        },
        cells.filter(c => c.te <= to)
      ).buffer as ArrayBuffer
    )
  );
// The gear half ends below the split, as a gear table does (compositeTable reads the low table up to its top).
const low = v2(339);
const t = v2(489);
const half = (x: BuildExtras): BuildExtras => ({
  ...x,
  layRate: x.layRate / 2,
  shipRate: x.shipRate / 2,
  h1Rate: x.h1Rate / 2,
  k3Rate: x.k3Rate / 2,
});

describe('scaleBuild', () => {
  it('scale 0.5 halves the peak and the four rates, and keeps the times and the egg', () => {
    const b = cells[0].builds[0];
    const s = scaleBuild(b, 0.5);
    expect(s.peakELR).toBe(b.peakELR / 2);
    expect(s.extras).toEqual(half(b.extras));
    expect(s.extras.h1At).toBe(b.extras.h1At);
    expect(s.extras.waitEgg).toBe(b.extras.waitEgg);
    const { extras: _, ...v1 } = b;
    expect(scaleBuild(v1, 0.5)).toEqual({ ...v1, peakELR: b.peakELR / 2 });
  });

  it("the composite's scaled half scales them; the gear half is as read", () => {
    const c = compositeTable(low, t, 340, 0.5);
    for (const cell of cells) {
      const got = c.lookup(cell.te, cell.h) as (BuildParams & { extras: BuildExtras })[];
      const want =
        cell.te < 340 ? cell.builds : cell.builds.map(b => ({ ...b, peakELR: b.peakELR / 2, extras: half(b.extras) }));
      expect(got, `TE ${cell.te}`).toEqual(want);
    }
  });

  it("the finder's deliveryScale uses the same helper", () => {
    const src = readFileSync(fileURLToPath(new URL('./routeFinder.ts', import.meta.url)), 'utf8');
    expect(src).toContain('return scale === 1 ? builds : builds.map(b => scaleBuild(b, scale));');
  });
});
