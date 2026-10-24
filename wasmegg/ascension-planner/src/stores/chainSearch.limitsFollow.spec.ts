// MUST be first: the stores read localStorage/window at import (see chain.spec.ts).
import '../../scripts/node-shims';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

// The Limits box follows the instant answer's count (lib/limitsFollow.ts, lib/ascRange.ts) until set on purpose.
let mods: { chain: typeof import('./chainSearch') };
beforeAll(async () => {
  mods = { chain: await import('./chainSearch') };
}, 120_000);
function fresh() {
  setActivePinia(createPinia());
  return mods.chain.useChainSearchStore();
}
const limits = (s: ReturnType<typeof fresh>) => [s.minPrestiges, s.maxPrestiges];

describe('the Limits box follows the instant answer', () => {
  it('5 to 8 before an answer; 3 to one more than its count once in, and again when it changes', async () => {
    const s = fresh();
    expect(limits(s)).toEqual([5, 8]);
    expect(s.limitsFollowing).toEqual({ min: false, max: false });
    s.suggestedCount = 4;
    await nextTick();
    expect(limits(s)).toEqual([3, 5]);
    expect(s.limitsFollowing).toEqual({ min: true, max: true });
    s.suggestedCount = 9;
    await nextTick();
    expect(limits(s)).toEqual([3, 10]);
  });

  it('follows the count Prefer fewer picked (rangeCount.fastest) over the fastest', async () => {
    const s = fresh();
    s.suggestedCount = 6;
    await nextTick();
    expect(limits(s)).toEqual([3, 7]);
    s.rangeCount = { fastest: 4, date: null };
    await nextTick();
    expect(limits(s)).toEqual([3, 5]);
    expect(s.limitsCount).toBe(4);
    s.rangeCount = { fastest: null, date: null };
    await nextTick();
    expect(limits(s)).toEqual([3, 7]);
  });

  it('a limit the player set stays; the other keeps following', async () => {
    const s = fresh();
    s.suggestedCount = 6;
    await nextTick();
    s.minPrestiges = 4;
    s.markLimitTouched('min');
    s.suggestedCount = 8;
    await nextTick();
    expect(limits(s)).toEqual([4, 9]);
    expect(s.limitsFollowing).toEqual({ min: false, max: true });
  });

  it('"Use the instant answer\'s range" follows again after a hand edit', async () => {
    const s = fresh();
    s.suggestedCount = 6;
    await nextTick();
    s.maxPrestiges = 11;
    s.markLimitTouched('max');
    s.minPrestiges = 2;
    s.markLimitTouched('min');
    await nextTick();
    expect(limits(s)).toEqual([2, 11]);
    s.followInstantLimits();
    await nextTick();
    expect(limits(s)).toEqual([3, 7]);
    expect(s.limitsTouched).toEqual({ min: false, max: false });
  });

  it('code that sets them on purpose (the longer-route hint, a carry-on) stops the follow', async () => {
    const s = fresh();
    s.setLimits(5, 7);
    s.suggestedCount = 3;
    await nextTick();
    expect(limits(s)).toEqual([5, 7]);
    expect(s.limitsTouched).toEqual({ min: true, max: true });
  });

  it('nothing moves while a run is going or being prepared; the next idle moment catches up', async () => {
    const s = fresh();
    s.isRunning = true;
    s.suggestedCount = 4;
    await nextTick();
    expect(limits(s)).toEqual([5, 8]);
    s.isRunning = false;
    await nextTick();
    expect(limits(s)).toEqual([3, 5]);
    s.preparing = true;
    s.suggestedCount = 10;
    await nextTick();
    expect(limits(s)).toEqual([3, 5]);
    s.preparing = false;
    await nextTick();
    expect(limits(s)).toEqual([3, 11]);
  });
});
