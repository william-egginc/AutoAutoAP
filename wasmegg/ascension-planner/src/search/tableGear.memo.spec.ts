/**
 * THE GEAR STAMP, WORKED OUT ONCE (review 15 Nov 2026 P6): a fresh instant answer stamped the save twice (its own
 * table's research, then the maxed table's), each a full optimizer search per delivery set (search/tableGear.ts
 * `gearStamp`). The sets are kept for the last save, by what the optimizer reads of it: the same stamp, fewer
 * searches, and a save changed (even in place) or other research worked out again.
 *
 * Synthetic save only (src/test/syntheticSave.ts): no player data.
 */
import '../../scripts/node-shims';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticBackup, syntheticInputs } from '@/test/syntheticSave';
import type { SearchInputs } from './types';

const optimizer = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/artifacts', async orig => {
  const real = await orig<typeof import('@/lib/artifacts')>();
  return {
    ...real,
    getOptimalELRSet: (...args: Parameters<typeof real.getOptimalELRSet>) => {
      optimizer.calls++;
      return real.getOptimalELRSet(...args);
    },
  };
});

const { gearStamp } = await import('./tableGear');

describe('gearStamp memo', () => {
  let inputs: SearchInputs;
  const research = { comfortable_nests: 50, hab_capacity1: 8, leafsprings: 30, lightweight_boxes: 40 };
  beforeAll(async () => {
    inputs = await syntheticInputs(syntheticBackup);
  }, 120_000);
  beforeEach(() => {
    optimizer.calls = 0;
  });

  it('the same save and research twice: two optimizer searches, not four, and the same stamp', () => {
    // Another save first, so nothing is kept for this one from an earlier spec.
    const other = { ...inputs, context: { ...inputs.context, rawBackup: syntheticBackup() } } as SearchInputs;
    (other.context.rawBackup as any).farms[0].trainLength = 1;
    gearStamp(other, null, research);
    optimizer.calls = 0;
    const a = gearStamp(inputs, null, research);
    const b = gearStamp(inputs, null, research);
    expect(optimizer.calls).toBe(2);
    expect(b).toEqual(a);
    // Other research: only the full set is searched again (the bare one has none).
    gearStamp(inputs, null, { ...research, leafsprings: 1 });
    expect(optimizer.calls).toBe(3);
  });

  it('a save changed in place is worked out again, and a caller changing its stamp leaves the memo alone', () => {
    const raw = syntheticBackup();
    const mine = { ...inputs, context: { ...inputs.context, rawBackup: raw } } as SearchInputs;
    const first = gearStamp(mine, null, research)!;
    const kept = JSON.parse(JSON.stringify(first));
    first.deliveryFull.push({ artifact: 'nonsense', stones: [] } as never);
    expect(gearStamp(mine, null, research)).toEqual(kept);
    optimizer.calls = 0;
    raw.farms[0].trainLength = (raw.farms[0].trainLength ?? 0) + 1;
    gearStamp(mine, null, research);
    expect(optimizer.calls).toBe(2);
  });
});
