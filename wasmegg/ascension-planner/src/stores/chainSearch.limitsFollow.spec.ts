// MUST be first: the stores read localStorage/window at import (see chain.spec.ts).
import '../../scripts/node-shims';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

// The Limits box follows the instant answer's fastest count (lib/limitsFollow.ts) until set on purpose.
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
  it('5 to 8 before an answer; two either side of its fastest count once in, and again when it changes', async () => {
    const s = fresh();
    expect(limits(s)).toEqual([5, 8]);
    expect(s.limitsFollowing).toEqual({ min: false, max: false });
    s.suggestedCount = 4;
    await nextTick();
    expect(limits(s)).toEqual([2, 6]);
    expect(s.limitsFollowing).toEqual({ min: true, max: true });
    s.suggestedCount = 9;
    await nextTick();
    expect(limits(s)).toEqual([7, 11]);
  });

  it('a limit the player set stays; the other keeps following', async () => {
    const s = fresh();
    s.suggestedCount = 6;
    await nextTick();
    s.minPrestiges = 3;
    s.markLimitTouched('min');
    s.suggestedCount = 8;
    await nextTick();
    expect(limits(s)).toEqual([3, 10]);
    expect(s.limitsFollowing).toEqual({ min: false, max: true });
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
    expect(limits(s)).toEqual([2, 6]);
    s.preparing = true;
    s.suggestedCount = 10;
    await nextTick();
    expect(limits(s)).toEqual([2, 6]);
    s.preparing = false;
    await nextTick();
    expect(limits(s)).toEqual([8, 12]);
  });
});
