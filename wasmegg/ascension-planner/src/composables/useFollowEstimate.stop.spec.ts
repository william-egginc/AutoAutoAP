/**
 * STOPPED → NEVER STUCK ON WORKING, the followed route's estimate (spec-buildstop, 30 Oct 2026: My runs said "pricing
 * the followed route 218 247 285 313 failed: stopped" and the page stayed on "working it out…").
 *
 * A stand-in route worker that behaves as search/routePool.ts does: `terminate` rejects every request in flight with
 * "stopped" and every request after it too. Who stops it here is the page itself (a newer request ending lets the
 * shared worker go, a request going and coming back, a search starting while the selected goal rides the background's
 * run) or the outside (the worker torn down). Fixed clock, no wall-clock waits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setChainPricer, useFollowEstimate, type ChainPricer, type EstimateRequest } from './useFollowEstimate';
import type { Route } from '@/search/routeFinder';

const T0 = 1_800_000_000;
type Call = { chain: number[]; resolve: (r: Route | null) => void; reject: (e: Error) => void; pool: FakePool };
let calls: Call[];
class FakePool implements ChainPricer {
  closed = false;
  pending = new Set<Call>();
  priceChain(_url: string, _o: unknown, chain: number[]): Promise<Route | null> {
    if (this.closed) return Promise.reject(new Error('stopped'));
    return new Promise((resolve, reject) => {
      const c: Call = {
        chain,
        resolve: r => (this.pending.delete(c), resolve(r)),
        reject: e => (this.pending.delete(c), reject(e)),
        pool: this,
      };
      this.pending.add(c);
      calls.push(c);
    });
  }
  terminate(): void {
    this.closed = true;
    for (const c of [...this.pending]) c.reject(new Error('stopped'));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 * 1000);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  calls = [];
  setChainPricer(() => new FakePool());
});
afterEach(() => {
  setChainPricer(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const CHAIN = [218, 247, 285, 313];
const reqOf = (key: string, chain = CHAIN): EstimateRequest => ({ key, url: 'table.bin', options: { startTE: 197, start: T0 }, chain });
const routeOf = (chain = CHAIN): Route => ({
  chain,
  end: T0 + 86_400,
  seconds: 86_400,
  legs: [{ from: 197, to: chain[0], endTE: chain[0], start: T0, end: T0 + 86_400, sales: 0, tier13: false, label: 'continue' }],
});
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await Promise.resolve();
  }
};
function mount(first: EstimateRequest | null, others: EstimateRequest[] = []) {
  const request = ref<EstimateRequest | null>(first);
  const busy = ref(false);
  const otherList = ref<EstimateRequest[]>(others);
  const scope = effectScope();
  const out = scope.run(() => useFollowEstimate(request, busy, otherList))!;
  return { scope, request, busy, otherList, ...out };
}

describe('useFollowEstimate: a stopped request', () => {
  it('stopped from outside: asked again once and ends done, never working for good', async () => {
    const m = mount(reqOf('K1'));
    await settle();
    expect(m.state.value?.status).toBe('working');
    calls[0].pool.terminate();
    await settle();
    expect(calls).toHaveLength(2);
    expect(m.state.value?.status).toBe('working');
    calls[1].resolve(routeOf());
    await settle();
    expect(m.state.value?.status).toBe('done');
    m.scope.stop();
  });

  it('a second stop does not loop: failed (said), two requests in all', async () => {
    const m = mount(reqOf('K1'));
    await settle();
    calls[0].pool.terminate();
    await settle();
    calls[1].pool.terminate();
    await settle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls).toHaveLength(2);
    expect(m.state.value?.status).toBe('failed');
    m.scope.stop();
  });

  it('Try again (retry) after a failure asks again and ends done', async () => {
    const m = mount(reqOf('K1'));
    await settle();
    calls[0].pool.terminate();
    await settle();
    calls[1].pool.terminate();
    await settle();
    expect(m.state.value?.status).toBe('failed');
    m.retry();
    await settle();
    expect(m.state.value?.status).toBe('working');
    expect(calls).toHaveLength(3);
    calls[2].resolve(routeOf());
    await settle();
    expect(m.state.value?.status).toBe('done');
    m.scope.stop();
  });

  it('a request the page lets go itself (gone, then back) is not kept as failed: the key is priced again and ends done', async () => {
    const m = mount(reqOf('K1'));
    await settle();
    // The request goes (the pricing source moved), its worker is let go ("stopped"), then the same key is back.
    m.request.value = null;
    await settle();
    m.request.value = reqOf('K1');
    await settle();
    expect(m.state.value?.status).toBe('working');
    const last = calls[calls.length - 1];
    last.resolve(routeOf());
    await settle();
    expect(m.state.value?.status).toBe('done');
    m.scope.stop();
  });

  it('a newer request ending lets the shared worker go: the older key, asked again later, is priced (not a kept failure)', async () => {
    const m = mount(reqOf('K1'));
    await settle();
    m.request.value = reqOf('K2');
    await settle();
    // K2 is answered first; letting the worker go stops K1's request still queued on it.
    calls[1].resolve(routeOf());
    await settle();
    expect(m.state.value?.status).toBe('done');
    m.request.value = reqOf('K1');
    await settle();
    expect(m.state.value?.status).toBe('working');
    calls[calls.length - 1].resolve(routeOf());
    await settle();
    expect(m.state.value).toMatchObject({ key: 'K1', status: 'done' });
    m.scope.stop();
  });

  it('the selected goal riding the background run of its key, then a search starting: waits, and is priced after (never working for good)', async () => {
    // Another goal's route (same key as the one about to be picked) priced in the background.
    const m = mount(null, [reqOf('K3')]);
    await settle();
    expect(calls).toHaveLength(1);
    // The player picks that goal: it rides the background run.
    m.request.value = reqOf('K3');
    await settle();
    expect(m.state.value?.status).toBe('working');
    // A search starts: the background run is dropped.
    m.busy.value = true;
    await settle();
    expect(m.state.value?.status).toBe('waiting');
    m.busy.value = false;
    await settle();
    expect(m.state.value?.status).toBe('working');
    calls[calls.length - 1].resolve(routeOf());
    await settle();
    expect(m.state.value).toMatchObject({ key: 'K3', status: 'done' });
    m.scope.stop();
  });

  it('leaving My runs stops the request but asks nothing again', async () => {
    const m = mount(reqOf('K1'));
    await settle();
    m.scope.stop();
    await settle();
    expect(calls).toHaveLength(1);
  });
});
