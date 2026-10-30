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
 *   - BUILD-UP TRACKER: with `wantBuildUp` on (off by default) the simulation also keeps the picked variant's action
 *     list (search/leg.ts `LegOptions.keepPurchases`) and the state carries it (`buildUp`). The leg is the same either
 *     way. A kept record without a kept plan is simulated again when the plan is wanted.
 *
 * Never throws.
 */
import { onScopeDispose, ref, unref, watch, type Ref } from 'vue';
import type { LegSummary, SearchInputs } from '@/search/types';
import type { BuildUpPlan } from '@/search/buildUpActions';
import {
  buildUpPlanFromSegments,
  findSimRecord,
  readBuildUpPlan,
  readSimRecords,
  recordBuildUpPlan,
  recordSim,
  simLegFromSegments,
  type SimLeg,
} from '@/lib/followSim';
import { siloSeconds } from '@/lib/saveAge';

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
  /** `buildUp`: only when `wantBuildUp` asked for it and the simulation gave one. `planFailed`: only the plan was
   *  wanted (the leg was known) and working it out failed, with why (build-up tracker Phase 2: the tracker says so). */
  | { key: string; status: 'done'; leg: SimLeg; at: number; buildUp?: BuildUpPlan; planFailed?: string }
  /** `reason`: a short why, said on Right now; `retrying`: it is tried once more after `retryMs`. */
  | { key: string; status: 'failed'; reason: string; retrying?: boolean };

type DoneState = Extract<SimState, { status: 'done' }>;

/** What simulates one route (a chain worker pool of one). */
export interface SimRunner {
  /** Every segment the one-stop route comes back with (one leg; with time off, the cut leg and the rebuild). */
  run(
    inputs: SearchInputs,
    chain: number[],
    opts?: { keepPurchases?: boolean }
  ): Promise<LegSummary[] | LegSummary | null>;
  terminate(): void;
}

async function defaultRunner(): Promise<SimRunner | null> {
  if (typeof Worker === 'undefined') return null;
  const { createChainSearchPool } = await import('@/search/pool');
  let pool: import('@/search/pool').ChainSearchPool | null = null;
  let gone = false;
  return {
    async run(inputs, chain, opts) {
      pool = await createChainSearchPool(inputs, { size: 1 });
      if (gone) {
        pool.terminate();
        return null;
      }
      const out = await pool.evaluate([chain], undefined, opts?.keepPurchases ? { keepPurchases: true } : {});
      return out.results[0]?.legs ?? null;
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

/**
 * FRIENDLIER (26 Oct 2026, the coordinator: one simulation measured 36-199 s on the synthetic saves). It starts only once
 * the page has been settled `delayMs` (nothing asked changed, no search: the table's estimate is on screen by then),
 * and once it has run `slowMs` Right now adds "(can take a few minutes)". Leaving My runs lets it go; the next visit
 * starts it again, or reads the record when it finished.
 */
const TIMING = { delayMs: 3000, slowMs: 20_000, retryMs: 60_000 };
let timing = { ...TIMING };
/** Specs: other delays (null: back to the defaults). */
export function setSimTiming(t: Partial<typeof TIMING> | null): void {
  timing = { ...TIMING, ...(t ?? {}) };
}

/** Keys that failed on this page load, with why and how often: tried once more after `retryMs`, then not again until
 *  the save, route or setup changes. */
const failed = new Map<string, { reason: string; tries: number }>();
/** The words of a failure, short and without any ID (an error message names no account). */
function reasonOf(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/EI\d{16}/gi, 'EI…').slice(0, 160);
}

export function useCurrentSim(
  request: Ref<SimRequest | null>,
  busy: Ref<boolean>,
  /** BUILD-UP TRACKER: keep the simulated ascension's action list too (`SimState.buildUp`). Off by default. */
  wantBuildUp: Ref<boolean> | boolean = false
) {
  const state = ref<SimState | null>(null);
  /** It has run `slowMs` without an answer. */
  const slow = ref(false);
  let runner: SimRunner | null = null;
  let runningKey: string | null = null;
  let asked = 0;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  function clearTimers(): void {
    if (startTimer) clearTimeout(startTimer);
    if (slowTimer) clearTimeout(slowTimer);
    if (retryTimer) clearTimeout(retryTimer);
    startTimer = slowTimer = retryTimer = null;
    slow.value = false;
  }
  function letGo(): void {
    ++asked;
    runningKey = null;
    clearTimers();
    runner?.terminate();
    runner = null;
  }
  /** Said 'working' at once; started once nothing has changed for `delayMs`. With `have` (the leg is known, only the
   *  build-up plan is wanted) the leg stays on screen meanwhile. */
  function schedule(req: SimRequest, have: DoneState | null = null): void {
    letGo();
    const id = asked;
    runningKey = req.key;
    state.value = have ?? { key: req.key, status: 'working' };
    startTimer = setTimeout(() => {
      startTimer = null;
      if (id === asked) void run(req, id, have);
    }, timing.delayMs);
  }
  async function run(req: SimRequest, id: number, have: DoneState | null = null): Promise<void> {
    slowTimer = setTimeout(() => {
      slowTimer = null;
      if (id === asked) slow.value = true;
    }, timing.slowMs);
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
      const want = !!unref(wantBuildUp);
      const got = await (want ? r.run(inputs, [req.route[0]], { keepPurchases: true }) : r.run(inputs, [req.route[0]]));
      const leg = simLegFromSegments(Array.isArray(got) ? got : got ? [got] : null, {
        timeOff: inputs.timeOff,
        currentTE: inputs.currentTE,
        planStart: inputs.planStart,
      });
      if (id !== asked) return;
      if (!leg) throw new Error(`the ascension to ${req.route[0]} TE could not be simulated`);
      const at = Date.now();
      recordSim({ account: req.account, backupTime: req.backupTime, route: [...req.route], setup: req.setup, at, ms: at - began, leg });
      const siloLevel = inputs.context?.epicResearchLevels?.['silo_capacity'];
      const made = want
        ? buildUpPlanFromSegments(Array.isArray(got) ? got : got ? [got] : null, {
            accountKey: req.account,
            siloSeconds: siloSeconds(inputs.currentFarmState?.numSilos, siloLevel),
          })
        : null;
      // What the START farm's silos hold: a fresh ascension starts on 1 silo, not the save's (the synthetic save has 4:
      // 12 h read as 1 silo's worth made the tracker's silo time 4 times too long, 30 Oct 2026).
      const buildUp = made?.start ? { ...made, siloSeconds: siloSeconds(made.start.siloCount, siloLevel) } : made;
      if (buildUp) recordBuildUpPlan(req.key, buildUp);
      result = { key: req.key, status: 'done', leg, at, ...(buildUp ? { buildUp } : {}) };
    } catch (err) {
      if (id !== asked) return;
      const reason = reasonOf(err);
      console.warn('My runs: simulating the ascension you are in failed:', reason);
      const tries = (failed.get(req.key)?.tries ?? 0) + 1;
      failed.set(req.key, { reason, tries: have ? 2 : tries });
      // Only the plan was wanted: the leg stays as it was, and it is not tried again on this page.
      result = have ? { ...have, planFailed: reason } : { key: req.key, status: 'failed', reason, ...(tries < 2 ? { retrying: true } : {}) };
    }
    runner?.terminate();
    runner = null;
    runningKey = null;
    clearTimers();
    state.value = result;
    // Once more, after a longer wait (a worker that ran out of memory, a page that was busy).
    if (result.status === 'failed' && result.retrying)
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (id === asked && request.value?.key === req.key && !busy.value) schedule(req);
      }, timing.retryMs);
  }
  watch(
    [request, busy, () => !!unref(wantBuildUp)],
    ([req, isBusy, want]) => {
      if (!req) {
        letGo();
        state.value = null;
        return;
      }
      const now = state.value?.key === req.key && state.value.status === 'done' ? state.value : null;
      if (now && (!want || now.buildUp)) return;
      const kept = findSimRecord(readSimRecords(), req);
      const keptPlan = kept && want ? readBuildUpPlan(req.key) : null;
      if (kept && (!want || keptPlan)) {
        letGo();
        state.value = { key: req.key, status: 'done', leg: kept.leg, at: kept.at, ...(keptPlan ? { buildUp: keptPlan } : {}) };
        return;
      }
      // BUILD-UP TRACKER: the leg is known (on screen, or kept) and only the plan is wanted: the leg stays while the
      // plan is simulated.
      const have: DoneState | null =
        want && (now || kept) ? (now ?? { key: req.key, status: 'done', leg: kept!.leg, at: kept!.at }) : null;
      const f = failed.get(req.key);
      if (f && (f.tries >= 2 || retryTimer)) {
        if (!retryTimer) letGo();
        state.value = have
          ? { ...have, planFailed: f.reason }
          : { key: req.key, status: 'failed', reason: f.reason, ...(retryTimer ? { retrying: true } : {}) };
        return;
      }
      if (isBusy) {
        // A search has the memory: started when it ends (this watch runs again then).
        letGo();
        state.value = have ?? { key: req.key, status: 'waiting' };
        return;
      }
      if (runningKey === req.key) return;
      schedule(req, have);
    },
    { immediate: true }
  );
  onScopeDispose(letGo);
  return { state, slow };
}
