/**
 * Message protocol shared between the chain-search worker pool (search/pool.ts) and
 * chainSearch.worker.ts.
 *
 * Same shape as researchCalc.protocol.ts — one request type per kind, `requestId`-tagged so a
 * response can be routed back to the caller still waiting on it — with one structural difference
 * worth calling out: this worker is STATEFUL. It is initialised once with `SearchInputs` (which
 * carries the player's backup, the single largest thing in any of these payloads) and then keeps
 * both those inputs and its own prefix memo across every subsequent `evaluate`. Re-sending the
 * inputs per batch would mean structured-cloning a multi-megabyte backup hundreds of times per run,
 * and re-creating the evaluator per batch would throw away the prefix memo that makes a
 * coordinate-descent sweep cheap in the first place (see search/chain.ts).
 *
 * The other difference is `progress`, and it exists because of an observed 8.5-hour hang. A batch
 * used to be a single silent request: one `postMessage` out, one reply back, nothing in between. So
 * a worker that died WITHOUT firing an error event — killed for memory, or taken down with a frozen
 * or discarded tab — left its promise pending forever, `Promise.all` never settled, and the driver
 * awaited a reply that was never coming. The UI went on showing the last progress line and a stale
 * ETA while nothing at all was computing. A per-chain heartbeat makes that state detectable (see
 * `STALL_MS` in search/pool.ts) and, as a side benefit, lets the counter move DURING a batch —
 * stage 6's widest sweep is a single ~2200-chain request that used to freeze the display for half
 * an hour at a time, which is exactly what made the real hang so hard to spot.
 */
import type { ChainResult, SearchInputs } from '@/search/types';

export interface InitRequest {
  kind: 'init';
  requestId: number;
  /** `context.rawBackup` must already be `sanitizeLongs`'d by the sender — protobufjs `Long`
   *  instances lose their prototype crossing `postMessage`, and `getOptimalELRSet` reads item ids
   *  off it. Same hazard researchCalc.worker.ts documents. */
  inputs: SearchInputs;
}

export interface EvaluateRequest {
  kind: 'evaluate';
  requestId: number;
  /** Pre-sorted depth-first by the caller so the worker's prefix memo actually hits. */
  chains: number[][];
  /** When each fresh ascension starts (search/chain.ts `HandoffChoice`); absent = 'now'. */
  handoff?: import('@/search/chain').HandoffChoice;
  /**
   * The prefix memo for this request (search/chain.ts `MemoSettings`): a capacity the worker keeps
   * from now on, and whether each chain's own last step is kept. Absent: the memo as it is, last
   * steps kept -- what Smart search and the Full sweep always had. By a date sends both.
   */
  memo?: import('@/search/chain').MemoSettings;
}

/** How long a fresh ascension from the plan start sits on its first Integrity shift. See
 *  `integrityWaitSeconds` in search/leg.ts. */
export interface IntegrityRequest {
  kind: 'integrity';
  requestId: number;
}

/** "Continue my build-up" as the instant answer's tails, one per sale variant, timed from the plan
 *  start (`buildUpTailParamsV2` in search/leg.ts, with table version 2's extras): a few seconds of
 *  simulation, so it runs here. */
export interface BuildUpTailsRequest {
  kind: 'buildup-tails';
  requestId: number;
}

/** A fresh build at a start TE and start time on this account, as a table cell holds it (search/
 *  liveCell.ts): for a player above the table's top. A few seconds of simulation, so it runs here. */
export interface LiveFreshRequest {
  kind: 'live-fresh';
  requestId: number;
  te: number;
  /** Unix seconds: the next whole hour after the plan start. */
  start: number;
}

/**
 * One route from many start times ("when should I start?"): how long it takes from each. Each start
 * gets its own evaluator, since every leg is timed from the plan start. `fresh`: price the first leg
 * as a fresh ascension (no "keep the current one going"), which is what starting virtue means.
 */
export interface StartsRequest {
  kind: 'starts';
  requestId: number;
  chain: number[];
  starts: number[];
  fresh: boolean;
}

/**
 * One route priced with several sets of planned waits before its prestiges (search/delays.ts, "Try
 * waiting before each prestige"): `delays[k][i]` seconds after stop i, for set k. On the worker's own
 * evaluator, so what comes before each set's first wait is shared through the memo.
 */
export interface DelaysRequest {
  kind: 'delays';
  requestId: number;
  chain: number[];
  delays: number[][];
  handoff?: import('@/search/chain').HandoffChoice;
}

export type WorkerRequest =
  | InitRequest
  | EvaluateRequest
  | IntegrityRequest
  | BuildUpTailsRequest
  | LiveFreshRequest
  | StartsRequest
  | DelaysRequest;

export interface InitDoneMessage extends WithHeap {
  type: 'init-done';
  requestId: number;
}

/**
 * One chain finished. Sent as the batch runs, not at the end.
 *
 * Does NOT settle the request — the pool treats it as liveness plus a progress tick and leaves the
 * pending entry in place. Cheap enough to send per chain: one small object every fifteen-odd
 * seconds of solid CPU.
 */
export interface ProgressMessage extends WithHeap {
  type: 'progress';
  requestId: number;
  /** Chains completed in this request so far. */
  done: number;
  /** Chains in this request altogether. */
  total: number;
}

export interface EvaluateResultMessage extends WithHeap {
  type: 'result';
  requestId: number;
  /** One entry per chain that evaluated successfully. Chains whose simulation failed are simply
   *  absent — the driver treats a missing chain as "not a candidate", never as an error. */
  results: ChainResult[];
  /** Distinct legs this worker actually simulated for this batch (cache hits excluded). Purely for
   *  the UI's cost readout and for calibrating the live time estimate. */
  legSims: number;
}

export interface WorkerErrorMessage {
  type: 'error';
  requestId: number;
  message: string;
}

export interface IntegrityResultMessage {
  type: 'integrity';
  requestId: number;
  /** Seconds, or null when a fresh ascension could not be simulated. */
  seconds: number | null;
  /** LOW-TE OPENING (auto/lowTeOpening.ts): the fresh build's low-TE opening, when it
   *  took one (search/leg.ts `integrityCheck`). */
  lowTe?: import('@/search/leg').LowTeOpeningInfo | null;
}

export interface BuildUpTailsResultMessage {
  type: 'buildup-tails';
  requestId: number;
  /** Empty without a farm in the save (or when nothing could be simulated). */
  tails: import('@/search/precomputedLeg').BuildParams[];
}

export interface LiveFreshResultMessage {
  type: 'live-fresh';
  requestId: number;
  /** Empty when nothing could be simulated. */
  builds: import('@/search/precomputedLeg').BuildParams[];
}

export interface DelaysResultMessage extends WithHeap {
  type: 'delays';
  requestId: number;
  /** The route priced with each set of waits, in the order sent; null where it could not be. */
  results: (import('@/search/types').ChainResult | null)[];
}

export interface StartsResultMessage extends WithHeap {
  type: 'starts';
  requestId: number;
  /** Seconds from each start to the end of the route, in the order the starts were sent; null
   *  where it could not be simulated. */
  seconds: (number | null)[];
}

/**
 * The worker's own JS heap in MB at the time it sent a message, or null where the browser does not
 * expose `performance.memory` inside a worker. Piggybacked on messages the worker sends anyway
 * (`init-done`, `progress`, `result`, `starts`) so the black box (search/blackBox.ts) can see the
 * workers' memory without an extra round trip. Optional: older replies and Node threads omit it.
 */
export interface WithHeap {
  heapMB?: number | null;
  /** Prefixes in this worker's chain memo (search/chain.ts; at most 3000 unless By a date sized it), sent beside `heapMB`:
   *  a rough stand-in for the worker's memory, which Chrome does not report inside a worker. */
  memoEntries?: number;
  /** The memo's capacity now (search/chain.ts `MemoSettings`): 3000 unless By a date sized it. */
  memoCapacity?: number;
}

export type WorkerResponse =
  | StartsResultMessage
  | DelaysResultMessage
  | InitDoneMessage
  | ProgressMessage
  | EvaluateResultMessage
  | IntegrityResultMessage
  | BuildUpTailsResultMessage
  | LiveFreshResultMessage
  | WorkerErrorMessage;
