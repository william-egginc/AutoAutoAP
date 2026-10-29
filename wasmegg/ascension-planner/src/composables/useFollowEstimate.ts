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
 *
 * EVERY FOLLOWED GOAL ON LOAD (25 Oct 2026, Jordan: the Fastest to 490 TE pill said "no saved plan yet" while its
 * followed route sat unpriced until picked): `others` are the other followed goals' routes, priced one at a time in the
 * background once the selected goal's is done (never while it is being worked out, never while a search runs), each in a
 * worker of its own let go after it. Their states are `otherStates`, by key.
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

export function useFollowEstimate(
  request: Ref<EstimateRequest | null>,
  busy: Ref<boolean>,
  /** The other followed goals' routes (the selected goal's is `request`), in the order to price them. */
  others: Ref<readonly EstimateRequest[]> = ref([])
) {
  const state = ref<EstimateState | null>(null);
  /** The others' states by key: done or failed (this page load's), being worked out, waiting for a search, or asked. */
  const otherStates = ref<Record<string, EstimateState>>({});
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
      if (route && route.legs.length) result = { key: req.key, status: 'done', route, at: Date.now() };
      else {
        console.warn(`My runs: the followed route ${req.chain.join(' ')} could not be priced on the instant answer's data (a stop it can't reach).`);
        result = { key: req.key, status: 'failed' };
      }
    } catch (err) {
      console.warn(`My runs: pricing the followed route ${req.chain.join(' ')} failed:`, err instanceof Error ? err.message : String(err));
      result = { key: req.key, status: 'failed' };
    }
    remember(result);
    if (id !== asked) return;
    state.value = result;
    letGo();
    pumpOthers();
  }

  // ------------------------------------------------------------------- the other followed goals
  let otherRun = 0;
  let otherKey: string | null = null;
  let otherPricer: ChainPricer | null = null;
  /** Stop the other route being worked out (a search started: it has the memory; the page closed). */
  function dropOther(): void {
    ++otherRun;
    otherKey = null;
    otherPricer?.terminate();
    otherPricer = null;
  }
  /** The next other route to price, once the selected goal's is done and no search runs; their states said. */
  function pumpOthers(): void {
    if (busy.value && otherKey) dropOther();
    const list = others.value.filter(r => r.key !== request.value?.key);
    const next: Record<string, EstimateState> = {};
    for (const r of list) {
      const kept = done.get(r.key);
      next[r.key] = kept ?? (r.key === otherKey ? { key: r.key, status: 'working' } : { key: r.key, status: busy.value ? 'waiting' : 'working' });
    }
    otherStates.value = next;
    if (otherKey) return;
    if (busy.value || state.value?.status === 'working') return;
    // The selected goal's route first, even in the moment before its run says 'working' (a pricing record kept by My
    // runs makes both askable at once: composables/useInstantCompute.ts): one worker at a time.
    const sel = request.value;
    if (sel && !done.has(sel.key) && sel.key !== otherKey) return;
    const todo = list.find(r => !done.has(r.key));
    if (todo) void runOther(todo);
  }
  async function runOther(req: EstimateRequest): Promise<void> {
    const id = ++otherRun;
    otherKey = req.key;
    let result: EstimateState;
    try {
      const own = (otherPricer = makePricer());
      if (!own) throw new Error('no route worker');
      const route = await own.priceChain(req.url, JSON.parse(JSON.stringify(req.options)) as PolishOptions, [...req.chain]);
      if (route && route.legs.length) result = { key: req.key, status: 'done', route, at: Date.now() };
      else {
        console.warn(`My runs: the followed route ${req.chain.join(' ')} could not be priced on the instant answer's data (a stop it can't reach).`);
        result = { key: req.key, status: 'failed' };
      }
    } catch (err) {
      console.warn(`My runs: pricing the followed route ${req.chain.join(' ')} failed:`, err instanceof Error ? err.message : String(err));
      result = { key: req.key, status: 'failed' };
    }
    if (id !== otherRun) return;
    otherPricer?.terminate();
    otherPricer = null;
    remember(result);
    otherKey = null;
    if (request.value?.key === req.key && state.value?.key === req.key && state.value.status === 'working') state.value = result;
    pumpOthers();
  }
  watch([others, busy, () => state.value?.status], () => pumpOthers(), { immediate: true });
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
      if (otherKey === req.key && !isBusy) {
        // Already being worked out in the background (another goal's a moment ago): its answer is this one's.
        ++asked;
        letGo();
        state.value = { key: req.key, status: 'working' };
        return;
      }
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
    dropOther();
    letGo();
  });
  return { state, otherStates };
}
