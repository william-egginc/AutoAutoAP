/**
 * The chain-search worker pool: `navigator.hardwareConcurrency` workers, the browser's answer to the
 * CLI harness's `--jobs 12`.
 *
 * Deliberately NOT a composable, unlike useResearchCalcWorker.ts. That one ties its worker's
 * lifetime to a component via `onUnmounted`, which is right for a computation that only matters
 * while a tab is open. A chain search runs for HOURS and must survive the user navigating around the
 * planner, so its lifetime belongs to the run, not to a component — the store (stores/chainSearch.ts)
 * creates a pool when a run starts and terminates it when the run stops. The request/response
 * bookkeeping below is otherwise the same pattern: `requestId`-tagged messages, a `pending` map, and
 * a worker-level `onerror` that rejects everything outstanding rather than leaving callers hanging.
 *
 * Every worker is initialised with the same `SearchInputs` once, then reused for every batch, so
 * each keeps its own prefix memo warm. See search/batch.ts for how a batch is split between them and
 * why the split is by prefix subtree rather than round-robin.
 *
 * THE WATCHDOG, AND THE HANG IT EXISTS FOR. `onerror` only fires for errors the worker's own thread
 * reports. It does NOT fire when a worker disappears — killed for memory, or taken down with a tab
 * the browser froze or discarded. That left the promise in `pending` unresolved AND unrejected, so
 * `Promise.all` over the batch never settled and the driver awaited a reply that was never coming.
 * Observed in the wild: a Thorough run sat at `7634 / ~8865 chains`, on the same progress line and
 * the same stale `~4h 31m left`, for eight and a half hours at 3% CPU. There was no error, no
 * timeout and no way to tell it apart from a slow batch. So every worker now heartbeats per chain
 * (see chainSearch.protocol.ts) and a request with no traffic for `STALL_MS` is failed loudly.
 */
import { sanitizeLongs } from '@/lib/artifacts/utils';
import { inputsForWorkers } from './workerBackup';
import { sortChainsDepthFirst, type MemoSettings } from './chain';
import { clampPoolSize, hardwareThreads, maxPoolSize, splitByPrefix, workersForBatch } from './batch';
import type { ChainResult, SearchInputs } from './types';
import type { EvaluateResultMessage, WorkerRequest, WorkerResponse } from '@/workers/chainSearch.protocol';

/**
 * Silence from a worker that long means it is gone, not busy.
 *
 * One chain is 15-25 seconds of CPU and every chain sends a heartbeat, so a healthy worker is never
 * quiet for more than about half a minute. Ten minutes is therefore ~25x the longest legitimate gap
 * — generous enough to survive a badly swapping machine or a laptop that suspended briefly, tight
 * enough that a dead worker costs minutes instead of a night. The `init` message has no heartbeat of
 * its own, but it completes in seconds, so it is covered by the same bound.
 */
const STALL_MS = 10 * 60 * 1000;

/** How often the watchdog looks. Coarse on purpose: it is checking a ten-minute threshold. */
const WATCHDOG_INTERVAL_MS = 30 * 1000;

/**
 * A gap between watchdog ticks longer than this means the PAGE was suspended, not that a worker
 * died.
 *
 * This distinction cost a real overnight run. The watchdog fires every 30 s and stalls a worker
 * after 10 min of silence, yet an observed failure read "no progress for 290 minutes" — which is
 * impossible if the watchdog itself had been running. It had not: the browser froze the background
 * tab (Edge's sleeping tabs, or the machine sleeping), which suspends `setInterval` and the workers
 * alike. On resume the very first tick saw five hours of wall clock and killed a worker that had
 * merely been paused, before it could get a heartbeat out.
 *
 * So elapsed wall time is only evidence of death when the watchdog was awake to measure it. Three
 * ticks' worth of slack absorbs ordinary timer throttling in a background tab; anything beyond that
 * is a suspension and gets forgiven rather than counted.
 */
const SUSPEND_GAP_MS = 3 * WATCHDOG_INTERVAL_MS;

interface PendingEntry {
  resolve: (message: WorkerResponse) => void;
  reject: (err: Error) => void;
  /** Last time ANY message arrived for this request — a heartbeat counts. */
  lastSeen: number;
  /** For the failure message, so the user learns which worker and how far it got. */
  label: string;
  done: number;
  total: number;
}

interface PoolWorker {
  worker: Worker;
  pending: Map<number, PendingEntry>;
  index: number;
  /** This worker's JS heap as it last reported it (piggybacked on its replies), MB. Null until it
   *  reports, or forever where the browser does not expose `performance.memory` in workers. */
  heapMB: number | null;
  /** Prefixes in this worker's chain memo as it last reported, or null before it does. */
  memoEntries: number | null;
  /** That memo's capacity as it last reported, or null before it does. */
  memoCapacity: number | null;
}

export interface BatchOutcome {
  results: ChainResult[];
  /** Distinct legs simulated across the whole batch — the real cost, cache hits excluded. */
  legSims: number;
  /** How many workers this batch actually used, for the UI's "12 workers" readout. */
  workersUsed: number;
  /** Chains never sent because `shouldStop` said stop (dealt runs only). Empty otherwise: every
   *  chain was priced, and one missing from `results` could not be evaluated. */
  unpriced?: number[][];
}

export interface PoolOptions {
  /** Override worker construction. Exists for the watchdog's tests, which need a worker that can
   *  be made to go silent on demand; production passes nothing. */
  spawn?: () => Worker;
  /** Called when the page is detected to have been suspended, with how long for. The run continues;
   *  this exists so the UI can explain the missing hours instead of leaving the user to guess why
   *  an overnight run did nothing. */
  onSuspend?: (gapSeconds: number) => void;
  /** Override the stall threshold. Tests use a small one. */
  stallMs?: number;
  /** Injectable clock, so the tests do not have to wait ten minutes. */
  now?: () => number;
  /** How many workers to allow. Held to [1, logical cores] by `clampPoolSize`. Unset keeps the
   *  historical default of one per core less one for the main thread. */
  size?: number;
}

export interface EvaluateOptions {
  /**
   * Send every chain sharing its first `stickyDepth` entries to the SAME worker, batch after batch
   * (chosen by hashing that prefix), instead of dealing groups round-robin by position.
   *
   * For searches that come back to the same prefixes over many small batches (the deadline search
   * re-probes each route shape round after round). Round-robin gives a shape a different worker
   * whenever the batch's make-up changes, and that worker has to re-simulate the shape's early legs
   * its own memo never saw. Sticky keeps them warm. Balance comes from there being many prefixes.
   *
   * Negative counts from the end, as `slice` does: -1 is "everything but the last entry".
   */
  stickyDepth?: number;
  /**
   * Give every chain its own worker, up to the pool's size, however few there are. The default
   * keeps at least two chains a worker so a small batch still shares its prefix memo; for chains
   * that share nothing worth keeping and each take seconds (the deadline search's guesses at one
   * shape's last stop), an idle worker is the bigger waste.
   */
  spreadOut?: boolean;
  /** When each fresh ascension starts (search/chain.ts `HandoffChoice`). Absent = 'now', the
   *  searches' rule; the instant answer's exact check asks for 'hour' (and 'sooner' when ticked). */
  handoff?: import('./chain').HandoffChoice;
  /**
   * Deal the chains yourself: the worker (0 to `workers - 1`) for each chain, given in depth-first
   * order (the By a date run's search/stickyDealer.ts). Takes precedence over `stickyDepth` and
   * `spreadOut`. Each worker then gets its share a few chains at a time (`piece`) and asks for the
   * next piece as soon as it answers, so a worker is never left waiting for a whole batch to come
   * back; one that runs out takes the last pieces of the busiest (`steal`). Results stream as each
   * piece returns (`onResult`, `onLegs`), and `shouldStop` is honoured between pieces.
   */
  workerOf?: (chains: number[][], workers: number) => number[];
  /** Chains per request when dealt (default 4): small enough to stop, stream and share out the
   *  tail of a batch promptly, large enough that messages cost nothing next to a leg. */
  piece?: number;
  /** When dealt: a worker with nothing left takes queued pieces from the busiest. Default on. */
  steal?: boolean;
  /** When dealt: each chain as it is priced (null: it could not be evaluated). */
  onResult?: (chain: number[], result: ChainResult | null) => void;
  /** When dealt: legs simulated, as each piece returns. */
  onLegs?: (legSims: number) => void;
  /** When dealt: checked before each piece is sent. Once true no more are sent, the batch returns
   *  what was priced, and the rest is listed in `unpriced`. */
  shouldStop?: () => boolean;
  /**
   * How each worker keeps its prefix memo for this batch (search/chain.ts `MemoSettings`): whether
   * each chain's own last step is kept, and a capacity worked out from the pool's size when the batch
   * starts (more workers, less each: they share the tab's memory). Absent: the memo as it is.
   */
  memo?: { keepLast?: boolean; capacity?: (workers: number) => number };
}

/** The `memo` field of an evaluate request, for a pool of `workers`: absent when there is nothing to say. */
function memoRequest(opts: EvaluateOptions, workers: number): { memo?: MemoSettings } {
  if (!opts.memo) return {};
  const memo: MemoSettings = {};
  if (opts.memo.keepLast === false) memo.keepLast = false;
  if (opts.memo.capacity) memo.capacity = opts.memo.capacity(Math.max(1, workers));
  return Object.keys(memo).length ? { memo } : {};
}

/** Split into per-worker buckets by a stable hash of each chain's first `depth` entries. */
export function stickyBuckets(chains: number[][], depth: number, workers: number): Map<number, number[][]> {
  const out = new Map<number, number[][]>();
  for (const c of chains) {
    const key = c.slice(0, depth).join(',');
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    const w = (h >>> 0) % workers;
    const b = out.get(w);
    if (b) b.push(c);
    else out.set(w, [c]);
  }
  return out;
}

export interface ChainSearchPool {
  /** Upper bound on workers. Workers are spawned lazily, so this is a ceiling, not a headcount.
   *  Changes with `resize`. */
  readonly size: number;
  /** How many workers actually exist right now. */
  readonly spawned: number;
  /** Each live worker's JS heap in MB as it last reported it (null where it has not or cannot).
   *  Read by the black box every beat; costs no messages of its own. */
  workerHeaps(): (number | null)[];
  /** Each live worker's memo size (prefixes held) as it last reported it; null where it has not. */
  workerMemoEntries(): (number | null)[];
  /** Each live worker's memo capacity as it last reported it; null where it has not. */
  workerMemoCapacities(): (number | null)[];
  /** Seconds the page was suspended during this run — time in which nothing at all progressed. */
  readonly suspendedSeconds: number;
  /** Evaluate a set of chains, split across as many workers as the batch is worth. Resolves with
   *  only the chains that evaluated successfully. `onChainDone` fires as the batch progresses, so a
   *  caller can show movement during a single wide request. */
  evaluate(
    chains: number[][],
    onChainDone?: (done: number, total: number) => void,
    opts?: EvaluateOptions
  ): Promise<BatchOutcome>;
  /** The integrity check (search/rules.ts), run on the first worker against the pool's own inputs:
   *  how long a fresh ascension from the plan start sits on its first Integrity shift. */
  integrityWait(): Promise<number | null>;
  /**
   * One route priced from each of `starts` (unix seconds), shared out across the workers. Resolves
   * with the seconds from each start to the route's end, in the order given (null where it failed).
   */
  evaluateStarts(
    chain: number[],
    starts: number[],
    opts?: { fresh?: boolean },
    onDone?: (done: number, total: number) => void
  ): Promise<(number | null)[]>;
  /**
   * Change the worker ceiling while a run is going. Held to [1, logical cores] like `size`, and
   * returns the size it settled on.
   *
   * It never interrupts a batch in flight: a worker mid-request keeps its chains, because killing
   * it would throw away work and its warm prefix memo. So a new size takes effect at the NEXT
   * batch -- more workers spawn then, and workers above a smaller size are terminated as soon as
   * they are idle (at once if they already are, otherwise when the batch they are on returns),
   * which is what hands their memory and cores back.
   */
  resize(n: number): number;
  terminate(): void;
}

/**
 * How workers are made when a caller passes no `spawn`: null in the browser, which uses the real
 * Web Worker below. The command line (scripts/fastsearch.ts) sets a Node worker thread that speaks
 * the same protocol, so the store's runs work there unchanged: the same pool, the same chunking and
 * watchdog, the same results, rather than a second copy of all of it in the script.
 */
let defaultSpawn: (() => Worker) | null = null;
export function setDefaultWorkerSpawn(spawn: (() => Worker) | null): void {
  defaultSpawn = spawn;
}

export async function createChainSearchPool(inputs: SearchInputs, opts: PoolOptions = {}): Promise<ChainSearchPool> {
  // Caller's choice, held to what the machine has. Unset means the default -- one per core less one
  // for the main thread -- which is what this always did.
  let size = opts.size === undefined ? maxPoolSize() : clampPoolSize(opts.size);
  // Slots for every worker the machine could hold, so `resize` can grow without reallocating.
  const cap = Math.max(size, hardwareThreads());
  const stallMs = opts.stallMs ?? STALL_MS;
  const now = opts.now ?? (() => Date.now());
  let nextRequestId = 0;
  let terminated = false;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  /** Total wall time the page spent suspended during this run. Reported, never charged. */
  let suspendedSeconds = 0;

  // Workers are spawned ON DEMAND, not up front.
  //
  // This used to be `Array.from({length: size}, ...)`, which on a 20-core machine created 19
  // workers the instant a run started - each one importing the whole simulator module graph (the
  // same code that compiles to a 6.2 MB bundle) and each then handed a full copy of the sanitised
  // backup by the init broadcast below. Stages 4-7 run 13-17 chain batches that `workersForBatch`
  // only ever wants 4-7 workers for, so most of that memory was allocated and never used, and the
  // tab is what paid for it.
  const live: (PoolWorker | null)[] = Array.from({ length: cap }, () => null);
  const spawning: (Promise<PoolWorker> | null)[] = Array.from({ length: cap }, () => null);

  function makeWorker(index: number): PoolWorker {
    const spawn = opts.spawn ?? defaultSpawn;
    const worker = spawn
      ? spawn()
      : new Worker(new URL('../workers/chainSearch.worker.ts', import.meta.url), { type: 'module' });
    const pw: PoolWorker = { worker, pending: new Map(), index, heapMB: null, memoEntries: null, memoCapacity: null };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if ('heapMB' in msg && typeof msg.heapMB === 'number') pw.heapMB = msg.heapMB;
      if ('memoEntries' in msg && typeof msg.memoEntries === 'number') pw.memoEntries = msg.memoEntries;
      if ('memoCapacity' in msg && typeof msg.memoCapacity === 'number') pw.memoCapacity = msg.memoCapacity;
      const entry = pw.pending.get(msg.requestId);
      // A stray or duplicate response is expected to be harmless, not merely tolerated: a batch
      // abandoned by `terminate()` can still land here.
      if (!entry) return;

      // A heartbeat proves liveness and moves the counter; it does NOT settle the request.
      if (msg.type === 'progress') {
        entry.lastSeen = now();
        entry.done = msg.done;
        entry.total = msg.total;
        onProgress?.(pw.index, msg.done, msg.total);
        progressHooks.get(msg.requestId)?.(msg.done);
        return;
      }

      pw.pending.delete(msg.requestId);
      if (msg.type === 'error') entry.reject(new Error(msg.message));
      else entry.resolve(msg);
    };

    // A worker-level failure (a bad worker bundle, an out-of-memory kill the thread lives long
    // enough to report) has no requestId to route by. Reject everything outstanding on that worker
    // so the driver's `await` — and the progress UI riding on it — fails loudly instead of hanging
    // for the rest of the afternoon. A worker that dies WITHOUT firing this is what the watchdog
    // is for.
    worker.onerror = (event: ErrorEvent) => {
      // `event.message` is empty for anything the browser treats as cross-origin, which includes
      // most module-load failures, so the bare fallback reached the user as "Chain search worker
      // error" with nothing to act on. Carry whatever the event does have, and say what that
      // usually means: a worker that fails at load fails for every request, immediately, whereas
      // a crash mid-run leaves a partial result worth keeping.
      const detail = [event.message, event.filename && `${event.filename}:${event.lineno ?? '?'}`]
        .filter(Boolean)
        .join(' at ');
      const err = new Error(
        detail
          ? `A search worker crashed: ${detail}`
          : 'A search worker stopped without reporting why. This is usually the browser reclaiming ' +
              'memory from a background tab; keeping the tab visible, or lowering the effort tier, ' +
              'gives a run its best chance of finishing.'
      );
      for (const entry of pw.pending.values()) entry.reject(err);
      pw.pending.clear();
    };

    return pw;
  }

  /** Set while a batch is in flight, so heartbeats can be forwarded to the caller. */
  let onProgress: ((workerIndex: number, done: number, total: number) => void) | null = null;
  /** Per-request progress, for requests that aren't a batch evaluate (`evaluateStarts`). */
  const progressHooks = new Map<number, (done: number) => void>();

  /** When the watchdog last actually ran. A big jump means the page was frozen, not that time
   *  passed normally. */
  let lastSweepAt = now();

  function sweepStalled(): void {
    const t = now();
    const sinceLastSweep = t - lastSweepAt;
    lastSweepAt = t;

    // The page was suspended: the workers were frozen too, so none of that wall time is evidence
    // that anything died. Credit every pending request with the gap and skip this round. If a
    // worker really is gone, the next ten minutes of genuine silence will say so properly.
    if (sinceLastSweep > SUSPEND_GAP_MS) {
      for (const pw of live) {
        if (!pw) continue;
        for (const entry of pw.pending.values()) entry.lastSeen += sinceLastSweep;
      }
      suspendedSeconds += sinceLastSweep / 1000;
      opts.onSuspend?.(sinceLastSweep / 1000);
      return;
    }

    for (const pw of live) {
      if (!pw) continue;
      for (const [id, entry] of [...pw.pending]) {
        if (t - entry.lastSeen < stallMs) continue;
        pw.pending.delete(id);
        const quiet = t - entry.lastSeen;
        const forHow = quiet >= 60_000 ? `${Math.round(quiet / 60000)} minutes` : `${Math.round(quiet / 1000)}s`;
        entry.reject(
          new Error(
            `${entry.label} stopped responding: no progress for ${forHow} ` +
              `(${entry.done}/${entry.total} chains done). The worker was very likely killed, ` +
              `most often by the browser reclaiming memory or freezing or discarding the tab. ` +
              `Your progress is checkpointed, so resuming re-uses every chain already priced.`
          )
        );
        // Do not reuse a worker that has stopped answering: drop it so a later batch spawns a
        // fresh one in its slot rather than sending into a void.
        try {
          pw.worker.terminate();
        } catch {
          // Terminating an already-dead worker is not an error worth surfacing.
        }
        live[pw.index] = null;
        spawning[pw.index] = null;
      }
    }
  }

  /**
   * Armed once and left running until `terminate()`.
   *
   * An earlier version cleared the interval whenever `pending` went empty and re-armed on the next
   * send, which looks tidier and is worse: between two batches the queue IS empty, so the timer was
   * torn down and restarted from zero, pushing detection of a genuinely dead worker out by up to a
   * whole interval. A 30-second no-op for the life of a run costs nothing worth measuring.
   */
  function armWatchdog(): void {
    if (watchdog || terminated) return;
    lastSweepAt = now();
    watchdog = setInterval(sweepStalled, WATCHDOG_INTERVAL_MS);
  }

  function send(pw: PoolWorker, message: WorkerRequest, label: string, total = 0): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      if (terminated) {
        reject(new Error('chain search pool was terminated'));
        return;
      }
      pw.pending.set(message.requestId, { resolve, reject, lastSeen: now(), label, done: 0, total });
      armWatchdog();
      pw.worker.postMessage(message);
    });
  }

  // One `sanitizeLongs` pass on the main thread, shared by every worker's init message.
  //
  // Two separate problems, one fix. (1) protobufjs `Long` int64 fields on the backup (artifact item
  // ids, read by `getOptimalELRSet` through `context.rawBackup`) do not survive `structuredClone`
  // with their prototype intact. (2) Every field here can still be a Vue reactive Proxy — Pinia
  // wraps its whole state tree in `reactive()` — and a reactive Proxy is NOT guaranteed
  // structured-clone-safe; useResearchCalcWorker.ts records `postMessage` throwing `DataCloneError`
  // on exactly that, discovered the hard way. `sanitizeLongs` deep-rebuilds into a plain,
  // Proxy-free, Long-free structure and solves both.
  //
  // Unlike researchCalc's own `prepareForPostMessage`, `context.rawBackup` is NOT dropped here: the
  // simulation path genuinely reads it (`auto/shifts/c3.ts` and `auto/shifts/h1.ts` both call
  // `getOptimalELRSet(context.rawBackup, ...)`), and the "continue current ascension" variant reads
  // the artifact inventory off it too. It is cut down to just those reads (search/workerBackup.ts):
  // the rest of the save -- mission and contract archives, the home farm and its inventory -- was a
  // copy in every worker of something no worker reads. Trimmed before the sanitize, so the deep
  // rebuild only walks what is sent.
  const cleanInputs = sanitizeLongs(inputsForWorkers(inputs));

  /** Create and initialise worker `i` on first use; every later caller awaits the same promise. */
  function workerAt(i: number): Promise<PoolWorker> {
    let p = spawning[i];
    if (!p) {
      p = (async () => {
        const pw = makeWorker(i);
        live[i] = pw;
        await send(pw, { kind: 'init', requestId: ++nextRequestId, inputs: cleanInputs }, `worker ${i} (start-up)`);
        return pw;
      })();
      spawning[i] = p;
    }
    return p;
  }

  /** Terminate idle workers above the current size. A busy one is left to finish; `evaluate` calls
   *  this again once its batch returns. */
  function retireAboveSize(): void {
    for (let i = size; i < cap; i++) {
      const pw = live[i];
      if (!pw || pw.pending.size) continue;
      pw.worker.terminate();
      live[i] = null;
      spawning[i] = null;
    }
  }

  /**
   * A dealt batch (`EvaluateOptions.workerOf`): every worker works through its own queue of pieces,
   * each sent the moment the last one comes back, so no worker waits on another until its queue is
   * empty -- and then it takes the busiest worker's last queued piece rather than wait at all.
   */
  async function evaluateDealt(
    sorted: number[][],
    onChainDone: ((done: number, total: number) => void) | undefined,
    opts: EvaluateOptions
  ): Promise<BatchOutcome> {
    const workers = size;
    const per = Math.max(1, Math.floor(opts.piece ?? 4));
    const memo = memoRequest(opts, workers);
    const dealt = (opts.workerOf as NonNullable<EvaluateOptions['workerOf']>)(sorted, workers);
    const mine: number[][][] = Array.from({ length: workers }, () => []);
    sorted.forEach((c, i) => {
      const w = Math.floor(dealt[i] ?? 0);
      mine[w >= 0 && w < workers ? w : 0].push(c);
    });
    const queues: number[][][][] = mine.map(list => {
      const pieces: number[][][] = [];
      for (let i = 0; i < list.length; i += per) pieces.push(list.slice(i, i + per));
      return pieces;
    });
    const results: ChainResult[] = [];
    let legSims = 0;
    let done = 0;
    const inFlight = new Map<number, number>();
    const used = new Set<number>();
    let failed = false;
    const tell = () => {
      if (!onChainDone) return;
      let n = done;
      for (const v of inFlight.values()) n += v;
      onChainDone(Math.min(n, sorted.length), sorted.length);
    };
    /** The last queued piece of the worker with the most left, when it has at least two queued (one
     *  more is in flight): taking its only one could well finish later than it would have. */
    const steal = (thief: number): number[][] | undefined => {
      let from = -1;
      for (let w = 0; w < workers; w++) {
        if (w === thief) continue;
        if (queues[w].length >= 2 && (from < 0 || queues[w].length > queues[from].length)) from = w;
      }
      return from >= 0 ? queues[from].pop() : undefined;
    };
    const run = async (w: number): Promise<void> => {
      for (;;) {
        if (failed || terminated) return;
        if (opts.shouldStop?.()) return;
        // A worker above a smaller size (the slider moved) hands its queue to the others and goes.
        if (w >= size) {
          const left = queues[w].splice(0);
          left.forEach((p, i) => queues[i % Math.max(1, Math.min(size, workers))].push(p));
          return;
        }
        let piece = queues[w].shift();
        if (!piece && opts.steal !== false) piece = steal(w);
        if (!piece) return;
        used.add(w);
        const pw = await workerAt(w);
        const requestId = ++nextRequestId;
        progressHooks.set(requestId, d => {
          inFlight.set(w, d);
          tell();
        });
        let reply: EvaluateResultMessage;
        try {
          reply = (await send(
            pw,
            {
              kind: 'evaluate',
              requestId,
              chains: piece,
              ...(opts.handoff && opts.handoff !== 'now' ? { handoff: opts.handoff } : {}),
              ...memo,
            },
            `worker ${w}`,
            piece.length
          )) as EvaluateResultMessage;
        } finally {
          progressHooks.delete(requestId);
          inFlight.delete(w);
        }
        legSims += reply.legSims;
        opts.onLegs?.(reply.legSims);
        const got = new Map(reply.results.map(r => [r.chain.join(','), r]));
        for (const c of piece) {
          const r = got.get(c.join(',')) ?? null;
          if (r) results.push(r);
          opts.onResult?.(c, r);
        }
        done += piece.length;
        tell();
      }
    };
    const left = () => queues.some(q => q.length);
    try {
      // Again while pieces are left and nobody asked to stop: a worker let go mid-batch (the pool was
      // made smaller) hands its queue to workers whose own loops may have finished already.
      for (let pass = 0; pass === 0 || (left() && !opts.shouldStop?.() && !terminated); pass++) {
        const live = Math.max(1, Math.min(workers, size));
        for (let w = live; w < workers; w++) queues[w].splice(0).forEach((p, i) => queues[i % live].push(p));
        const loops = Array.from({ length: live }, (_, w) =>
          run(w).catch(e => {
            failed = true;
            throw e;
          })
        );
        // As in `evaluate`: a handler on each before awaiting them together, so a sibling's later
        // rejection is not reported as unhandled.
        for (const p of loops) void p.catch(() => {});
        await Promise.all(loops);
      }
      return { results, legSims, workersUsed: used.size, unpriced: queues.flat(2) as number[][] };
    } finally {
      if (!terminated) retireAboveSize();
    }
  }

  // One worker eagerly, so a broken worker bundle or a structured-clone failure on the inputs
  // throws HERE, when the user presses Start, instead of surfacing mid-run an hour later.
  await workerAt(0);

  return {
    get size(): number {
      return size;
    },
    get spawned(): number {
      return live.reduce((n, pw) => n + (pw ? 1 : 0), 0);
    },
    get suspendedSeconds(): number {
      return suspendedSeconds;
    },
    workerHeaps(): (number | null)[] {
      const out: (number | null)[] = [];
      for (const pw of live) if (pw) out.push(pw.heapMB);
      return out;
    },
    workerMemoEntries(): (number | null)[] {
      const out: (number | null)[] = [];
      for (const pw of live) if (pw) out.push(pw.memoEntries);
      return out;
    },
    workerMemoCapacities(): (number | null)[] {
      const out: (number | null)[] = [];
      for (const pw of live) if (pw) out.push(pw.memoCapacity);
      return out;
    },

    async evaluate(
      chains: number[][],
      onChainDone?: (done: number, total: number) => void,
      opts: EvaluateOptions = {}
    ): Promise<BatchOutcome> {
      if (!chains.length) return { results: [], legSims: 0, workersUsed: 0 };

      // Plain copies before anything is posted. A caller holding a Vue reactive array (the store's
      // `bestChain`, anything read out of Pinia state) would otherwise reach `postMessage`, which
      // cannot clone a proxy and throws "[object Object] could not be cloned" -- after the whole
      // batch was dealt, so the run fails at the end instead of at the call. Cheap next to a chain.
      const sorted = sortChainsDepthFirst(chains.map(c => Array.from(c)));
      if (opts.workerOf) return evaluateDealt(sorted, onChainDone, opts);
      // Worker index per bucket: positional normally, the hash's choice when sticky.
      let buckets: number[][][];
      let workerOf: number[];
      if (opts.stickyDepth) {
        const byWorker = stickyBuckets(sorted, opts.stickyDepth, size);
        workerOf = [...byWorker.keys()];
        buckets = workerOf.map(w => byWorker.get(w) as number[][]);
      } else {
        buckets = splitByPrefix(
          sorted,
          opts.spreadOut ? Math.min(size, sorted.length) : workersForBatch(sorted.length, size)
        );
        workerOf = buckets.map((_, i) => i);
      }

      // Aggregate the per-worker heartbeats into one batch-wide count. Without this the widest
      // sweep in the search (stage 6, one ~2200-chain request) shows no movement at all until it
      // returns, which is precisely what let a dead worker look like a long batch.
      const perWorker = new Map<number, number>();
      if (onChainDone) {
        onProgress = (index, done) => {
          perWorker.set(index, done);
          let total = 0;
          for (const v of perWorker.values()) total += v;
          onChainDone(Math.min(total, sorted.length), sorted.length);
        };
      }

      const memo = memoRequest(opts, size);
      try {
        const pws = await Promise.all(workerOf.map(w => workerAt(w)));
        const sends = buckets.map((bucket, i) =>
          send(
            pws[i],
            {
              kind: 'evaluate',
              requestId: ++nextRequestId,
              chains: bucket,
              ...(opts.handoff && opts.handoff !== 'now' ? { handoff: opts.handoff } : {}),
              ...memo,
            },
            `worker ${workerOf[i]}`,
            bucket.length
          )
        );
        // Attach a no-op handler to each send BEFORE awaiting them together. `Promise.all` rejects
        // on the first failure and abandons its siblings; those siblings still reject later (the
        // watchdog, or `terminate()` in the store's `finally`), and an abandoned rejection with no
        // handler surfaces as an unhandled-rejection warning that has nothing to do with the real
        // fault. The `catch` is on a derived promise, so `Promise.all` still sees the rejection.
        for (const p of sends) void p.catch(() => {});
        const replies = await Promise.all(sends);

        const results: ChainResult[] = [];
        let legSims = 0;
        for (const reply of replies) {
          const r = reply as EvaluateResultMessage;
          results.push(...r.results);
          legSims += r.legSims;
        }
        return { results, legSims, workersUsed: buckets.length };
      } finally {
        onProgress = null;
        if (!terminated) retireAboveSize();
      }
    },

    async evaluateStarts(chain, starts, opts = {}, onDone) {
      const n = Math.max(1, Math.min(size, starts.length));
      // Dealt round-robin, so every worker gets a spread of hours (some are slower than others).
      const groups: number[][] = Array.from({ length: n }, () => []);
      const where: [number, number][] = [];
      starts.forEach((s, i) => {
        groups[i % n].push(s);
        where.push([i % n, groups[i % n].length - 1]);
      });
      const done = new Map<number, number>();
      const replies = await Promise.all(
        groups.map(async (g, w) => {
          const pw = await workerAt(w);
          const requestId = ++nextRequestId;
          const watch = (d: number) => {
            done.set(w, d);
            onDone?.(
              [...done.values()].reduce((a, b) => a + b, 0),
              starts.length
            );
          };
          progressHooks.set(requestId, watch);
          try {
            const reply = (await send(
              pw,
              { kind: 'starts', requestId, chain: [...chain], starts: g, fresh: !!opts.fresh },
              `worker ${w} (start times)`,
              g.length
            )) as { seconds: (number | null)[] };
            return reply.seconds;
          } finally {
            progressHooks.delete(requestId);
          }
        })
      );
      return where.map(([w, k]) => replies[w][k] ?? null);
    },

    async integrityWait(): Promise<number | null> {
      const pw = await workerAt(0);
      const reply = (await send(
        pw,
        { kind: 'integrity', requestId: ++nextRequestId },
        'worker 0 (integrity check)'
      )) as {
        seconds: number | null;
      };
      return reply.seconds;
    },

    resize(n: number): number {
      if (terminated) return size;
      size = Math.min(cap, clampPoolSize(n));
      retireAboveSize();
      return size;
    },

    terminate(): void {
      terminated = true;
      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }
      for (const pw of live) {
        if (!pw) continue;
        for (const entry of pw.pending.values()) entry.reject(new Error('chain search pool was terminated'));
        pw.pending.clear();
        pw.worker.terminate();
      }
    },
  };
}
