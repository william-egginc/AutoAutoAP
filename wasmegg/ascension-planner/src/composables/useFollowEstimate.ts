/**
 * The followed route's estimate (lib/followEstimate.ts), worked out in one route worker (search/routePool.ts, the same
 * worker and table the instant answer uses; routeFinder.ts `priceChain`), so the page stays responsive. The only thing
 * My runs works out.
 *
 *   - One request at a time: the newest wins; a reply for an older one (another route, a new save, a new instant
 *     answer: another key) is dropped.
 *   - Not while a search or By a date run is running (they have the memory): it waits, and starts when they end.
 *   - The worker is let go once nothing is asked of it (its table is a few MB, read again next time).
 *   - A failure (no worker, the table can't be read, a stop that can't be priced) is said as 'failed': Right now keeps
 *     its old line ("Simulate it ›"). Never throws.
 *
 * Kept for the page load by key (a few), so switching goals back and forth doesn't price the same route again.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { RoutePool } from '@/search/routePool';
import type { PolishOptions, Route } from '@/search/routeFinder';

export interface EstimateRequest {
  key: string;
  url: string;
  options: PolishOptions;
  chain: number[];
}

export type EstimateState =
  | { key: string; status: 'waiting' | 'working' }
  | { key: string; status: 'done'; route: Route; at: number }
  | { key: string; status: 'failed' };

/** What prices a route (a RoutePool). */
export interface ChainPricer {
  priceChain(url: string, options: PolishOptions, chain: number[]): Promise<Route | null>;
  terminate(): void;
}

function defaultPricer(): ChainPricer | null {
  if (typeof Worker === 'undefined') return null;
  return new RoutePool(1, () => new Worker(new URL('../workers/routeFinder.worker.ts', import.meta.url), { type: 'module' }));
}
let makePricer: () => ChainPricer | null = defaultPricer;
/** Specs: price with this instead of a route worker (null: back to the worker). */
export function setChainPricer(f: (() => ChainPricer | null) | null): void {
  makePricer = f ?? defaultPricer;
  done.clear();
}

/** Finished estimates of this page load, by key (the newest few). */
const done = new Map<string, EstimateState>();
const KEEP = 12;
function remember(s: EstimateState): void {
  done.delete(s.key);
  done.set(s.key, s);
  while (done.size > KEEP) done.delete(done.keys().next().value as string);
}

export function useFollowEstimate(request: Ref<EstimateRequest | null>, busy: Ref<boolean>) {
  const state = ref<EstimateState | null>(null);
  let pricer: ChainPricer | null = null;
  let asked = 0;
  function letGo(): void {
    pricer?.terminate();
    pricer = null;
  }
  async function run(req: EstimateRequest): Promise<void> {
    const id = ++asked;
    state.value = { key: req.key, status: 'working' };
    let result: EstimateState;
    try {
      pricer ??= makePricer();
      if (!pricer) throw new Error('no route worker');
      // Plain copies: they go to the worker.
      const route = await pricer.priceChain(req.url, JSON.parse(JSON.stringify(req.options)) as PolishOptions, [...req.chain]);
      result = route && route.legs.length ? { key: req.key, status: 'done', route, at: Date.now() } : { key: req.key, status: 'failed' };
    } catch {
      result = { key: req.key, status: 'failed' };
    }
    remember(result);
    if (id !== asked) return;
    state.value = result;
    letGo();
  }
  watch(
    [request, busy],
    ([req, isBusy]) => {
      if (!req) {
        ++asked;
        state.value = null;
        letGo();
        return;
      }
      const kept = done.get(req.key);
      if (kept) {
        ++asked;
        state.value = kept;
        return;
      }
      if (state.value?.key === req.key && state.value.status === 'working') return;
      if (isBusy) {
        // A search has the memory: started when it ends (this watch runs again then).
        ++asked;
        letGo();
        state.value = { key: req.key, status: 'waiting' };
        return;
      }
      void run(req);
    },
    { immediate: true }
  );
  onScopeDispose(() => {
    ++asked;
    letGo();
  });
  return { state };
}
