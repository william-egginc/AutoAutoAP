/**
 * The current ascension of the followed route, simulated on the live save (lib/followSim.ts): search/chain.ts
 * `createChainEvaluator` on a one-stop route (the route's first stop), in ONE chain worker (search/pool.ts, a pool of
 * size 1, as the store's integrity probe and build-up tails make one), so the page stays responsive. No new simulator.
 *
 *   - Once per save, route and setup: a kept record (localStorage `aap-follow-sim`) is used at once.
 *   - One at a time, the newest wins: a request for another key lets the running one go.
 *   - Never while a search runs (it has the memory): it waits ('waiting') and starts when the search ends; a search
 *     that starts lets the running one go.
 *   - The inputs are built ONCE, in the async run (`SimRequest.inputs`), never in a computed or the render: building
 *     them reads the whole save through the stores (the crash lesson of 25 Oct 2026).
 *   - A failure says 'failed' (Right now keeps the table's estimate) and is not tried again for that key on this page.
 *
 * Never throws.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue';
import type { LegSummary, SearchInputs } from '@/search/types';
import { findSimRecord, readSimRecords, recordSim, simLegOf, type SimLeg } from '@/lib/followSim';

export interface SimRequest {
  /** lib/followSim.ts `simKey`. */
  key: string;
  account: string;
  backupTime: number;
  /** The followed route's stops ahead of the save; the first is simulated to. */
  route: number[];
  setup: string;
  /** Builds the evaluator's inputs from the stores, once, when the run starts. */
  inputs: () => SearchInputs;
}

export type SimState =
  | { key: string; status: 'waiting' | 'working' }
  | { key: string; status: 'done'; leg: SimLeg; at: number }
  | { key: string; status: 'failed' };

/** What simulates one route (a chain worker pool of one). */
export interface SimRunner {
  run(inputs: SearchInputs, chain: number[]): Promise<LegSummary | null>;
  terminate(): void;
}

async function defaultRunner(): Promise<SimRunner | null> {
  if (typeof Worker === 'undefined') return null;
  const { createChainSearchPool } = await import('@/search/pool');
  let pool: import('@/search/pool').ChainSearchPool | null = null;
  let gone = false;
  return {
    async run(inputs, chain) {
      pool = await createChainSearchPool(inputs, { size: 1 });
      if (gone) {
        pool.terminate();
        return null;
      }
      const out = await pool.evaluate([chain]);
      return out.results[0]?.legs[0] ?? null;
    },
    terminate() {
      gone = true;
      pool?.terminate();
      pool = null;
    },
  };
}
let makeRunner: () => Promise<SimRunner | null> | SimRunner | null = defaultRunner;
/** Specs: simulate with this instead of a chain worker (null: back to the worker). */
export function setSimRunner(f: (() => Promise<SimRunner | null> | SimRunner | null) | null): void {
  makeRunner = f ?? defaultRunner;
  failed.clear();
}

/** Keys that failed on this page load: not tried again until the save, route or setup changes. */
const failed = new Set<string>();

export function useCurrentSim(request: Ref<SimRequest | null>, busy: Ref<boolean>) {
  const state = ref<SimState | null>(null);
  let runner: SimRunner | null = null;
  let runningKey: string | null = null;
  let asked = 0;
  function letGo(): void {
    ++asked;
    runningKey = null;
    runner?.terminate();
    runner = null;
  }
  async function run(req: SimRequest): Promise<void> {
    letGo();
    const id = asked;
    runningKey = req.key;
    state.value = { key: req.key, status: 'working' };
    const began = Date.now();
    let result: SimState;
    try {
      const inputs = req.inputs();
      const r = await makeRunner();
      if (id !== asked) {
        r?.terminate();
        return;
      }
      if (!r) throw new Error('no chain worker');
      runner = r;
      const leg = simLegOf(await r.run(inputs, [req.route[0]]));
      if (id !== asked) return;
      if (!leg) throw new Error(`the ascension to ${req.route[0]} TE could not be simulated`);
      const at = Date.now();
      recordSim({ account: req.account, backupTime: req.backupTime, route: [...req.route], setup: req.setup, at, ms: at - began, leg });
      result = { key: req.key, status: 'done', leg, at };
    } catch (err) {
      if (id !== asked) return;
      console.warn('My runs: simulating the ascension you are in failed:', err instanceof Error ? err.message : String(err));
      failed.add(req.key);
      result = { key: req.key, status: 'failed' };
    }
    runner?.terminate();
    runner = null;
    runningKey = null;
    state.value = result;
  }
  watch(
    [request, busy],
    ([req, isBusy]) => {
      if (!req) {
        letGo();
        state.value = null;
        return;
      }
      if (state.value?.key === req.key && state.value.status === 'done') return;
      const kept = findSimRecord(readSimRecords(), req);
      if (kept) {
        letGo();
        state.value = { key: req.key, status: 'done', leg: kept.leg, at: kept.at };
        return;
      }
      if (failed.has(req.key)) {
        letGo();
        state.value = { key: req.key, status: 'failed' };
        return;
      }
      if (isBusy) {
        // A search has the memory: started when it ends (this watch runs again then).
        letGo();
        state.value = { key: req.key, status: 'waiting' };
        return;
      }
      if (runningKey === req.key) return;
      void run(req);
    },
    { immediate: true }
  );
  onScopeDispose(letGo);
  return { state };
}
