/**
 * A route's legs worked out when asked (batch 16, item 6d): for Fastest's rows that kept none (past the
 * run's leg budget, search/legBudget.ts; a saved run reopened, which keeps the best route's only), so their
 * arrow (RouteTimeline.vue) can still say when each stop and egg happens.
 *
 * One route at a time on ONE worker of its own (`createChainSearchPool(inputs, {size: 1})`, then
 * `evaluate([chain], …, {handoff})`), terminated when done, cancelled, or replaced by another route. The
 * inputs are the result's: the caller passes its plan start (the store's `collectInputs` reads the live
 * one), and the rest is today's setup and save. Kept by route + plan start + handoff for the visit.
 *
 * About half a minute a route on one worker (Light's eight routes took ~60 s on four, 14 Oct). When the
 * re-simulated end differs from the row's by more than a minute (the setup or save changed since the run),
 * `driftNote` says so rather than passing one off as the other.
 */
import { reactive } from 'vue';
import type { ChainSearchPool, EvaluateOptions } from './pool';
import type { HandoffChoice } from './chain';
import type { LegSummary, SearchInputs } from './types';

export interface LegsOnDemand {
  state: 'running' | 'done' | 'failed' | 'cancelled';
  legs?: LegSummary[];
  /** Seconds from the plan start the re-simulated route took. */
  seconds?: number;
}

/** The cache key: the route, the plan start it is priced from, and how fresh ascensions start. */
export function legsKey(chain: readonly number[], planStart: number, handoff: HandoffChoice = 'now'): string {
  return `${chain.join(',')}@${Math.round(planStart)}|${handoff}`;
}

/** One line when the re-simulation ends more than a minute from the row's end, else ''. */
export function driftNote(
  expectedSeconds: number,
  gotSeconds: number,
  planStart: number,
  show: (unixSeconds: number) => string
): string {
  if (!Number.isFinite(expectedSeconds) || !Number.isFinite(gotSeconds)) return '';
  if (Math.abs(gotSeconds - expectedSeconds) <= 60) return '';
  return `Re-simulated on your current setup and save: it ends ${show(planStart + gotSeconds)}, not ${show(planStart + expectedSeconds)} as the run priced it.`;
}

type MakePool = (inputs: SearchInputs, opts: { size: number }) => Promise<ChainSearchPool>;

/**
 * The on-demand pricer: `state` (reactive, by `legsKey`), `load`, `cancel`. `makePool` is the app's
 * `createChainSearchPool`; a spec passes a stand-in.
 */
export function createLegsOnDemand(makePool: MakePool) {
  const state = reactive(new Map<string, LegsOnDemand>());
  let gen = 0;
  let pool: ChainSearchPool | null = null;
  let runningKey = '';

  function stopPool(): void {
    try {
      pool?.terminate();
    } catch {
      // already gone
    }
    pool = null;
  }

  /** Stop what is running (a search started, the player pressed Cancel, the view closed). */
  function cancel(): void {
    gen++;
    stopPool();
    if (runningKey && state.get(runningKey)?.state === 'running') state.set(runningKey, { state: 'cancelled' });
    runningKey = '';
  }

  /** Work out `chain`'s legs from `inputs` (the result's plan start already in them). Kept results are
   *  returned as they are; another route running is cancelled first. */
  async function load(chain: number[], inputs: SearchInputs, handoff: HandoffChoice = 'now'): Promise<LegsOnDemand> {
    const key = legsKey(chain, inputs.planStart, handoff);
    const have = state.get(key);
    if (have && (have.state === 'done' || have.state === 'running')) return have;
    cancel();
    const g = ++gen;
    runningKey = key;
    state.set(key, { state: 'running' });
    try {
      const p = await makePool(inputs, { size: 1 });
      if (g !== gen) {
        p.terminate();
        return state.get(key) ?? { state: 'cancelled' };
      }
      pool = p;
      const opts: EvaluateOptions = { handoff };
      const out = await p.evaluate([chain], undefined, opts);
      if (g !== gen) return state.get(key) ?? { state: 'cancelled' };
      const r = out.results.find(x => x.chain.join(',') === chain.join(','));
      const done: LegsOnDemand =
        r && r.legs.length ? { state: 'done', legs: r.legs, seconds: r.seconds } : { state: 'failed' };
      state.set(key, done);
      return done;
    } catch {
      if (g !== gen) return state.get(key) ?? { state: 'cancelled' };
      state.set(key, { state: 'failed' });
      return { state: 'failed' };
    } finally {
      if (g === gen) {
        stopPool();
        runningKey = '';
      }
    }
  }

  return { state, load, cancel };
}
