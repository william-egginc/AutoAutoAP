/**
 * MY RUNS WORKS OUT THE INSTANT ANSWER'S PRICING ITSELF (26 Oct 2026, Jordan: after his Setup changed, or in a fresh
 * browser, all three goals said "not priced on this save yet" and Next step said "Open Highest TE by a date once…").
 * My runs must not depend on another tab: when no pricing record (lib/followEstimate.ts `recordPricing`) of this save
 * and setup covers a followed route, it is worked out here, the instant answer's own way (search/instantCompute.ts:
 * the same table choice and first ascensions as InstantRoute.vue, without finding or polishing routes, which pricing a
 * followed route never needs), and kept in the same record. Then the estimate (composables/useFollowEstimate.ts)
 * prices the route as before, and the full timeline shows on its own.
 *
 *   - One record per account, save, setup and final TE (the record serves every followed goal: lib/followEstimate.ts
 *     `pickPricing`), so one request at a time; the newest wins and lets the running one go.
 *   - After the page has settled (`delayMs`), in ONE route worker of its own, let go when done.
 *   - Never while a search runs (it has the memory): 'waiting', and it starts when the search ends; a search that
 *     starts lets the running one go and it starts again after.
 *   - Leaving My runs lets it go (`onScopeDispose`).
 *   - Done keys are kept for the page load (and the record in localStorage, so a reload reads it at once); a failure
 *     says why in a short line (`reason`, never an ID) and is not tried again for that key on this page load.
 *
 * Never throws.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { recordPricing, snapPricing, type SnapPricing } from '@/lib/followEstimate';
import { plainError } from '@/lib/plainError';
import { MAXED_TABLE_FILE } from '@/search/tableBracket';
import { tableLoadFailed, tableNewerThanPage } from '@/search/tableFetch';
import { ownTableNames } from '@/search/tableGear';
import { chooseInstantTable, instantFirstLegs, instantPricingOptions, instantScaleOf } from '@/search/instantCompute';
import type { Availability } from '@/search/availabilitySchedule';
import { useChainSearchStore } from '@/stores/chainSearch';
import { getSimulationContext } from '@/engine/adapter';

export interface InstantComputeRequest {
  /** `${account}|${backupTime}|${setup}|${final}`. */
  key: string;
  /** search/runSaves.ts `accountOf`: a hash, never the player id. */
  account: string;
  backupTime: number;
  /** lib/followEstimate.ts `pricingSetupKey`. */
  setup: string;
  /** The TE the first ascensions go up to: the highest of the followed goals' (a date's 490, Fastest's target). */
  final: number;
  /** "Works inside my hours" as the instant answer reads it (useNowPage `useHoursFromStores`). */
  useHours: boolean;
}

export type InstantComputeState =
  | { key: string; status: 'waiting' | 'working' }
  | { key: string; status: 'done'; at: number; ms: number }
  | { key: string; status: 'failed'; reason: string };

/** What the record holds besides its keys. */
export interface InstantPricing {
  url: string;
  tableTo: number | null;
  pricing: SnapPricing;
}

/** Works the pricing out (a route worker of its own). `alive` false: stop and give null. */
export interface InstantComputer {
  compute(req: InstantComputeRequest, alive: () => boolean): Promise<InstantPricing | null>;
  terminate(): void;
}

/** A failure the player reads as it is (already plain words). */
export class PlainFailure extends Error {}

const BASE = `${import.meta.env.BASE_URL}precompute/`;
const MAXED_URL = `${BASE}${MAXED_TABLE_FILE}`;

/** What the computation asks of a route worker pool (search/routePool.ts RoutePool). */
export type InstantPool = Parameters<typeof chooseInstantTable>[0]['pool'] & Parameters<typeof instantFirstLegs>[0]['pool'];

/**
 * The pricing record's contents for the save and Setup in the stores now, the instant answer's way
 * (search/instantCompute.ts, as InstantRoute.vue `run` reads them): its table, the first ascensions up to `req.final`
 * and the pricing options (no date: pricing a route never reads it). Null when `alive` said stop.
 */
export async function computeInstantPricing(req: InstantComputeRequest, p: InstantPool, alive: () => boolean): Promise<InstantPricing | null> {
  const store = useChainSearchStore();
  const te = Math.floor(store.currentTE);
  // The same table the instant answer reads (search/instantCompute.ts).
  const choice = await chooseInstantTable({
    pool: p,
    maxedUrl: MAXED_URL,
    base: BASE,
    ownTableUrls: async () => {
      const id = (store.collectInputs().context.rawBackup as { eiUserId?: string } | undefined)?.eiUserId;
      return id ? (await ownTableNames(id)).map(n => `${BASE}${n}`) : [];
    },
    inputs: () => store.collectInputs(),
    earnings: () => store.readInventory().earnings,
  });
  if (!alive()) return null;
  if (te < choice.header.from) throw new PlainFailure(`the instant answer starts at ${choice.header.from} TE and your save is at ${te} TE`);
  const inputs = store.collectInputs();
  const scale = instantScaleOf(choice, MAXED_URL, getSimulationContext);
  // A plain copy: it goes to the worker.
  const hours = req.useHours && store.availability ? (JSON.parse(JSON.stringify(store.availability)) as Availability) : null;
  const legs = await instantFirstLegs({
    pool: p,
    url: choice.url,
    header: choice.header,
    inputs,
    te,
    final: req.final,
    scale,
    hours,
    deferShifts: store.deferShifts,
    liveFresh: (t, at) => store.liveFreshBuilds(t, at),
    buildUpTails: () => store.buildUpTails(),
    alive,
  });
  if (!legs || !alive()) return null;
  const pricing = snapPricing(
    instantPricingOptions({ te, start: inputs.planStart, firstLegs: legs.firstLegs, scale, hours, tail: legs.tail }),
    req.final
  );
  if (!pricing) throw new PlainFailure('no first ascension could be worked out from your save');
  return { url: choice.url, tableTo: choice.header.to ?? null, pricing };
}

function defaultComputer(): InstantComputer | null {
  if (typeof Worker === 'undefined') return null;
  let pool: import('@/search/routePool').RoutePool | null = null;
  let gone = false;
  return {
    async compute(req, alive) {
      const { RoutePool } = await import('@/search/routePool');
      if (gone || !alive()) return null;
      pool = new RoutePool(1, () => new Worker(new URL('../workers/routeFinder.worker.ts', import.meta.url), { type: 'module' }));
      return computeInstantPricing(req, pool, () => !gone && alive());
    },
    terminate() {
      gone = true;
      pool?.terminate();
      pool = null;
    },
  };
}
let makeComputer: () => InstantComputer | null = defaultComputer;
/** Specs: work it out with this instead of a route worker (null: back to the worker). */
export function setInstantComputer(f: (() => InstantComputer | null) | null): void {
  makeComputer = f ?? defaultComputer;
  finished.clear();
}

const TIMING = { delayMs: 1500 };
let timing = { ...TIMING };
/** Specs: another settle time (null: back to the default). */
export function setInstantComputeTiming(t: Partial<typeof TIMING> | null): void {
  timing = { ...TIMING, ...(t ?? {}) };
}

/** This page load's finished keys (done or failed), the newest few. */
const finished = new Map<string, InstantComputeState>();
const KEEP = 12;
function remember(s: InstantComputeState): void {
  finished.delete(s.key);
  finished.set(s.key, s);
  while (finished.size > KEEP) finished.delete(finished.keys().next().value as string);
}

/** A failure in a few plain words, without any ID. */
export function instantFailureWords(err: unknown): string {
  if (err instanceof PlainFailure) return err.message;
  const message = err instanceof Error ? err.message : String(err);
  if (tableNewerThanPage(message)) return 'an older version of this page is open: reload it';
  if (tableLoadFailed(message)) return "the instant answer couldn't be loaded (no connection, or the file is missing)";
  return plainError(new Error(message.replace(/EI\d{16}/gi, 'EI…')), 'something went wrong').replace(/\.$/, '');
}

export function useInstantCompute(
  request: Ref<InstantComputeRequest | null>,
  busy: Ref<boolean>,
  /** A record was kept (the page reads the records again). */
  onRecorded: () => void
) {
  const state = ref<InstantComputeState | null>(null);
  let computer: InstantComputer | null = null;
  let runningKey: string | null = null;
  let asked = 0;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  function letGo(): void {
    ++asked;
    runningKey = null;
    if (startTimer) clearTimeout(startTimer);
    startTimer = null;
    computer?.terminate();
    computer = null;
  }
  /** Said 'working' at once; started once nothing has changed for `delayMs`. */
  function schedule(req: InstantComputeRequest): void {
    letGo();
    const id = asked;
    runningKey = req.key;
    state.value = { key: req.key, status: 'working' };
    startTimer = setTimeout(() => {
      startTimer = null;
      if (id === asked) void run(req, id);
    }, timing.delayMs);
  }
  async function run(req: InstantComputeRequest, id: number): Promise<void> {
    const began = Date.now();
    let result: InstantComputeState;
    try {
      const c = makeComputer();
      if (!c) throw new PlainFailure('this browser has no background workers');
      computer = c;
      const got = await c.compute(req, () => id === asked);
      if (id !== asked) return;
      if (!got) throw new PlainFailure('it was stopped');
      const at = Date.now();
      const kept = recordPricing({ account: req.account, backupTime: req.backupTime, setup: req.setup, url: got.url, tableTo: got.tableTo, at, pricing: got.pricing });
      if (!kept) throw new PlainFailure("this browser's storage is full");
      result = { key: req.key, status: 'done', at, ms: at - began };
      console.info(`My runs: the instant answer's first ascensions for your setup were worked out in ${((at - began) / 1000).toFixed(1)} s.`);
    } catch (err) {
      if (id !== asked) return;
      const reason = instantFailureWords(err);
      console.warn("My runs: working out the instant answer for your setup failed:", reason);
      result = { key: req.key, status: 'failed', reason };
    }
    computer?.terminate();
    computer = null;
    runningKey = null;
    remember(result);
    state.value = result;
    if (result.status === 'done') onRecorded();
  }
  watch(
    [request, busy],
    ([req, isBusy]) => {
      if (!req) {
        letGo();
        state.value = null;
        return;
      }
      const kept = finished.get(req.key);
      if (kept) {
        if (runningKey) letGo();
        state.value = kept;
        return;
      }
      if (isBusy) {
        // A search has the memory: started when it ends (this watch runs again then).
        letGo();
        state.value = { key: req.key, status: 'waiting' };
        return;
      }
      if (runningKey === req.key) return;
      schedule(req);
    },
    { immediate: true }
  );
  onScopeDispose(letGo);
  return { state };
}
