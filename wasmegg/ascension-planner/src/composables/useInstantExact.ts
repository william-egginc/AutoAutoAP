/**
 * THE INSTANT ANSWER, WORKED OUT EXACTLY (R10 option C, 21 Nov 2026). The instant answer prices a route from the table;
 * with the player's hours the table cannot know when each purchase waits for them (routeFinder.ts `heldBuys` is an
 * estimate), so a single ascension can be a day or two off. This works the shown route out with the full simulator in
 * the background: search/chain.ts `createChainEvaluator` with the hour handoff (the instant answer's own exact check),
 * in ONE chain worker (search/pool.ts, a pool of one, as composables/useCurrentSim.ts makes it). No new simulator.
 *
 *   - Every prefix of the route in one batch, shortest first: the worker's memo prices each ascension once, so it
 *     costs one route, and each prefix's answer is that ascension's exact end and the progress ("n of N").
 *   - The caller passes the route only once the instant answer has settled (not while its background polish runs).
 *   - `trigger` 'auto' starts on its own once nothing has changed for `delayMs`; 'manual' waits for `start()`.
 *   - One at a time, the newest wins. Never while a search runs ('waiting'); a search that starts lets it go and it
 *     starts again after. `stop()` lets it go for that route until `start()`.
 *   - A worker silent for `stallMs` (one ascension measured 36-199 s on the synthetic saves) is failed. A failure is
 *     final for the route on this page load and shown as nothing (the box keeps the quick estimate).
 *   - Done routes are kept (localStorage `aap-instant-exact`, the newest 20), so a reload is done at once.
 *   - By a date: `spare` is the deadline less the exact end, seconds (negative: the route misses the date). The last
 *     stop counts when it is reached, hours or not, as the instant answer and By a date's search count it (Jordan,
 *     5 Nov 2026; routeFinder.ts `FindOptions.deadline`).
 *   - The inputs are built ONCE, in the run (`ExactRequest.inputs`), never in a computed or the render.
 *
 * Which hours want it (`exactWanted`) and where it is shown are the caller's: options until Jordan decides.
 * Never throws.
 */
import { onScopeDispose, shallowRef, unref, watch, type Ref } from 'vue';
import type { Availability } from '@/search/availability';
import { isConstrained, isOwnWindow } from '@/search/availabilitySchedule';
import type { ChainResult, SearchInputs } from '@/search/types';

export interface ExactRequest {
  /** The route, the save and the setup: a new key is a new run. */
  key: string;
  /** The route's stops, TE, the last the goal. */
  chain: number[];
  /** By a date: the deadline, unix seconds. */
  deadline?: number | null;
  /** Builds the evaluator's inputs from the stores, once, when the run starts. */
  inputs: () => SearchInputs;
}

export type ExactState =
  /** 'manual' and not asked, or stopped. */
  | { key: string; status: 'idle' }
  | { key: string; status: 'waiting' }
  | { key: string; status: 'running'; done: number; total: number; startedAt: number }
  | {
      key: string;
      status: 'done';
      /** When the route reaches its last stop, unix seconds. */
      end: number;
      /** Each ascension's exact end, unix seconds (one per stop). */
      legs: number[];
      /** By a date: the deadline less `end`, seconds (negative: misses it); null without a deadline. */
      spare: number | null;
      /** When it was worked out, ms. */
      at: number;
    }
  /** `error`: for the debug log, never shown. */
  | { key: string; status: 'failed'; error: string };

/** What simulates the route (a chain worker pool of one). */
export interface ExactRunner {
  run(
    inputs: SearchInputs,
    chains: number[][],
    opts: { handoff: 'hour' },
    /** Prefixes done (search/pool.ts `onChainDone`). */
    onDone: (done: number, total: number) => void,
    /** Any message from the worker: it is alive. */
    heard?: () => void
  ): Promise<ChainResult[]>;
  terminate(): void;
}

/**
 * Whether the instant answer's route is worked out exactly with these hours: 'anyHours', any hours that rule something
 * out with held shifts; 'weeklyOnly', only weekly hours (a mask that is not its own daily window). Jordan's call.
 */
export function exactWanted(
  hours: Availability | null | undefined,
  deferShifts: boolean,
  which: 'anyHours' | 'weeklyOnly'
): boolean {
  if (!deferShifts || !isConstrained(hours)) return false;
  return which === 'anyHours' || !isOwnWindow(hours);
}

export const EXACT_RECORD_KEY = 'aap-instant-exact';
const KEEP = 20;
type Done = Extract<ExactState, { status: 'done' }>;

function readRecords(): Done[] {
  try {
    const raw = localStorage.getItem(EXACT_RECORD_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter(
          (r): r is Done =>
            !!r && typeof r.key === 'string' && r.status === 'done' && Number.isFinite(r.end) && Array.isArray(r.legs)
        )
      : [];
  } catch {
    return [];
  }
}
function keepRecord(d: Done): void {
  try {
    const rest = readRecords().filter(r => r.key !== d.key);
    localStorage.setItem(EXACT_RECORD_KEY, JSON.stringify([d, ...rest].slice(0, KEEP)));
  } catch {
    // Storage full or blocked: worked out again next time.
  }
}

async function defaultRunner(): Promise<ExactRunner | null> {
  if (typeof Worker === 'undefined') return null;
  const { createChainSearchPool } = await import('@/search/pool');
  let pool: import('@/search/pool').ChainSearchPool | null = null;
  let gone = false;
  return {
    async run(inputs, chains, opts, onDone, heard) {
      pool = await createChainSearchPool(inputs, { size: 1, ...(heard ? { onMessage: heard } : {}) });
      if (gone) {
        pool.terminate();
        return [];
      }
      const out = await pool.evaluate(chains, onDone, { handoff: opts.handoff });
      return out.results;
    },
    terminate() {
      gone = true;
      pool?.terminate();
      pool = null;
    },
  };
}
let makeRunner: () => Promise<ExactRunner | null> | ExactRunner | null = defaultRunner;
/** Specs: simulate with this instead of a chain worker (null: back to the worker). */
export function setExactRunner(f: (() => Promise<ExactRunner | null> | ExactRunner | null) | null): void {
  makeRunner = f ?? defaultRunner;
  failed.clear();
}

/** `delayMs`: settled this long before an automatic start. `stallMs`: a worker silent this long has failed (the pool's
 *  own watchdog is 10 minutes; one ascension measured up to 199 s). */
const TIMING = { delayMs: 3000, stallMs: 6 * 60_000 };
let timing = { ...TIMING };
/** Specs: other delays (null: back to the defaults). */
export function setExactTiming(t: Partial<typeof TIMING> | null): void {
  timing = { ...TIMING, ...(t ?? {}) };
}

/** Routes that failed on this page load, with why: not asked again until the key changes. */
const failed = new Map<string, string>();

function reasonOf(err: unknown): string {
  const text = err instanceof Error ? err.message || err.name : String(err);
  return text.replace(/EI\d{16}/gi, 'EI…').slice(0, 160);
}

/** Each ascension's exact end from the prefixes' answers, or null when any prefix is missing. */
function endsOf(chain: number[], results: ChainResult[]): number[] | null {
  const byKey = new Map(results.map(r => [r.chain.join(','), r]));
  const ends: number[] = [];
  for (let i = 0; i < chain.length; i++) {
    const r = byKey.get(chain.slice(0, i + 1).join(','));
    const end = r?.legs[r.legs.length - 1]?.endTime;
    if (typeof end !== 'number' || !Number.isFinite(end)) return null;
    ends.push(end);
  }
  return ends;
}

export function useInstantExact(
  request: Ref<ExactRequest | null>,
  busy: Ref<boolean>,
  trigger: Ref<'auto' | 'manual'> | 'auto' | 'manual' = 'auto'
) {
  const state = shallowRef<ExactState | null>(null);
  let runner: ExactRunner | null = null;
  let runningKey: string | null = null;
  let asked = 0;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  /** Keys started by hand (`start()`) and keys stopped (`stop()`), for this composable. */
  const wanted = new Set<string>();
  const stopped = new Set<string>();

  function clearTimers(): void {
    if (startTimer) clearTimeout(startTimer);
    if (stallTimer) clearTimeout(stallTimer);
    startTimer = stallTimer = null;
  }
  function letGo(): void {
    ++asked;
    runningKey = null;
    clearTimers();
    runner?.terminate();
    runner = null;
  }

  function schedule(req: ExactRequest): void {
    letGo();
    const id = asked;
    runningKey = req.key;
    state.value = { key: req.key, status: 'waiting' };
    startTimer = setTimeout(() => {
      startTimer = null;
      if (id === asked) void run(req, id);
    }, timing.delayMs);
  }

  async function run(req: ExactRequest, id: number): Promise<void> {
    const total = req.chain.length;
    const startedAt = Date.now();
    state.value = { key: req.key, status: 'running', done: 0, total, startedAt };
    const fail = (error: string): void => {
      console.warn('Instant answer: working the route out exactly failed:', error);
      failed.set(req.key, error);
      letGo();
      state.value = { key: req.key, status: 'failed', error };
    };
    const alive = (): void => {
      if (id !== asked) return;
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stallTimer = null;
        if (id === asked) fail(`the worker said nothing for ${Math.round(timing.stallMs / 1000)} s`);
      }, timing.stallMs);
    };
    alive();
    try {
      const inputs = req.inputs();
      const r = await makeRunner();
      if (id !== asked) {
        r?.terminate();
        return;
      }
      if (!r) throw new Error('no chain worker');
      runner = r;
      const chains = req.chain.map((_, i) => req.chain.slice(0, i + 1));
      const results = await r.run(
        inputs,
        chains,
        { handoff: 'hour' },
        (done, n) => {
          if (id !== asked) return;
          alive();
          state.value = {
            key: req.key,
            status: 'running',
            done: Math.min(done, total),
            total: Math.min(n, total),
            startedAt,
          };
        },
        alive
      );
      if (id !== asked) return;
      const legs = endsOf(req.chain, results);
      if (!legs) throw new Error('the simulator could not finish the route');
      const end = legs[legs.length - 1];
      const deadline = req.deadline;
      const done: Done = {
        key: req.key,
        status: 'done',
        end,
        legs,
        spare: typeof deadline === 'number' && Number.isFinite(deadline) ? deadline - end : null,
        at: Date.now(),
      };
      keepRecord(done);
      letGo();
      state.value = done;
    } catch (err) {
      if (id !== asked) return;
      fail(reasonOf(err));
    }
  }

  /** Decide what to do for the current request (the watch and the two actions). */
  function settle(): void {
    const req = request.value;
    if (!req) {
      letGo();
      state.value = null;
      return;
    }
    if (state.value?.key === req.key && state.value.status === 'done') return;
    const kept = readRecords().find(r => r.key === req.key);
    if (kept) {
      letGo();
      state.value = kept;
      return;
    }
    const f = failed.get(req.key);
    if (f !== undefined) {
      letGo();
      state.value = { key: req.key, status: 'failed', error: f };
      return;
    }
    const auto = unref(trigger) === 'auto';
    if (stopped.has(req.key) || (!auto && !wanted.has(req.key))) {
      letGo();
      state.value = { key: req.key, status: 'idle' };
      return;
    }
    if (busy.value) {
      letGo();
      state.value = { key: req.key, status: 'waiting' };
      return;
    }
    if (runningKey === req.key) return;
    schedule(req);
  }

  watch([request, busy, () => unref(trigger)], settle, { immediate: true });

  /** Work the current route out now (the 'manual' trigger, or again after `stop()`). */
  function start(): void {
    const key = request.value?.key;
    if (!key) return;
    stopped.delete(key);
    wanted.add(key);
    settle();
  }
  /** Let the run go; this route is not started again until `start()`. */
  function stop(): void {
    const key = request.value?.key;
    if (!key) return;
    stopped.add(key);
    wanted.delete(key);
    settle();
  }

  onScopeDispose(letGo);
  return { state, start, stop };
}
