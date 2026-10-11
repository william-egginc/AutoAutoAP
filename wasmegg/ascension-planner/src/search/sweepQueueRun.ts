/**
 * A Full sweep queue (several chains from one click, InsanePanel), run one chain after another.
 *
 * Each chain is an ordinary run over its own space -- its own checkpoint, its own result -- and each
 * finished one is saved to the run library so the earlier ones are still there to open once the next
 * has taken the panel. The queue itself rides in the running chain's checkpoint (the store's
 * `queueRecord`), so a carry-on after a crash or a reload runs the rest of it too, rather than only
 * the chain that was running.
 *
 * Kept apart from the panel so the order of things (record, send, save, then mark the chain done in
 * the checkpoint) can be tested without mounting it.
 */
import type { SweepQueueChain, SweepQueueResult } from './persistence';

/** The store's `sweepQueue`, mutated in place (the panel and the progress bar read it). */
export interface LiveSweepQueue {
  at: number;
  total: number;
  cancelled: boolean;
  results: SweepQueueResult[];
  counts?: number[];
  ascensions?: number[];
  chains?: SweepQueueChain[];
  submit?: boolean;
  name?: string;
}

export interface SweepQueueRunDeps {
  queue: LiveSweepQueue;
  /** The account loaded now: another one loaded mid-queue stops it. */
  playerNow: () => string;
  busy: () => boolean;
  /** A fresh run of one chain. */
  start: (spec: SweepQueueChain['spec'], opts: { recheck: boolean }) => Promise<void>;
  /** Carry on from the checkpoint in the slot: its own chain (no spec), or `next` after it. False when refused. */
  resume: (next: SweepQueueChain['spec'] | undefined, opts: { recheck: boolean }) => Promise<boolean>;
  /** How the chain just run ended. `finish`: its finish time (unix seconds), fixed now. */
  outcome: () => {
    error: string | null;
    failed: boolean;
    stoppedEarly: boolean;
    days: number;
    chain: number[];
    finish: number;
  };
  /** Before each chain starts (the panel resets its "sent" flag). */
  chainStarting?: () => void;
  /** Send the chain's result when it is owed (Find and submit, a best so far on the board...). */
  sendIfOwed: (stopped: boolean) => Promise<void>;
  /** Save the chain's result to the run library. Throws when it can't. */
  save: (label: string) => Promise<void>;
  /** Write the queue onto the checkpoint: true = this chain is recorded; null = the queue is over. */
  persistQueue: (handled: boolean | null) => Promise<void>;
}

export interface SweepQueueRunOptions {
  player: string;
  chains: SweepQueueChain[];
  /** The first chain to run (0 for a fresh click). */
  from: number;
  /** Results of chains finished before `from` (a carried-on queue's). */
  results: SweepQueueResult[];
  /** The first chain is a carry-on from the slot: of that very chain, or of the next one after it. */
  carry: 'same' | 'next' | null;
  /** Find and submit, and the name it sends under. */
  submit: boolean;
  name: string;
}

export async function runSweepQueue(d: SweepQueueRunDeps, o: SweepQueueRunOptions): Promise<void> {
  const q = d.queue;
  q.cancelled = false;
  q.results = o.results.map(r => ({ ...r, chain: [...r.chain] }));
  q.total = o.chains.length;
  q.chains = o.chains;
  q.submit = o.submit;
  q.name = o.name;
  // Each chain's count and length, for the one time left of the whole queue (store's `sweepLeft`).
  q.counts = o.chains.map(c => c.count);
  q.ascensions = o.chains.map(c => c.ascensions);
  const fail = (label: string, why: string) =>
    q.results.push({ label: `${label}: ${why}`, chain: [], days: 0, stopped: true, finish: 0 });
  // Left on the checkpoint when the queue ended the way a crash does (a chain failed mid-run, or the
  // carry-on itself was refused): carrying on later still runs the rest.
  let keepQueue = false;
  try {
    for (let k = o.from; k < o.chains.length; k++) {
      const c = o.chains[k];
      // Stopped between chains, or another account loaded: the rest don't run.
      if (q.cancelled || d.playerNow() !== o.player) break;
      // Anything else going (a carry-on clicked between chains) and the start returns without a
      // word -- and the row would be filled with that run's result.
      if (d.busy()) {
        fail(c.label, 'another run was going, so the queue stopped here');
        break;
      }
      q.at = k;
      d.chainStarting?.();
      if (k === o.from && o.carry) {
        const ok = await d.resume(o.carry === 'next' ? c.spec : undefined, { recheck: o.submit });
        // Refused (its save would not load, a setting it can't put back): the store says why.
        if (!ok) {
          fail(c.label, d.outcome().error || "couldn't carry on, so the queue stopped here");
          keepQueue = true;
          break;
        }
      } else await d.start(c.spec, { recheck: o.submit });
      const out = d.outcome();
      // Stop pressed while the chain was writing its last checkpoint arrives after the store copied
      // `stoppedEarly`; the queue's own flag catches it.
      const stopped = out.stoppedEarly || q.cancelled;
      // A chain that could not start leaves the previous chain's result on screen; recording that as
      // this chain's would be a lie, so the queue stops there and says which one.
      if (out.error) {
        fail(c.label, out.error);
        keepQueue = out.failed;
        break;
      }
      if (out.days > 0) {
        q.results.push({ label: c.label, chain: [...out.chain], days: out.days, stopped, finish: out.finish });
        await d.sendIfOwed(stopped);
        try {
          await d.save(c.label);
        } catch (e) {
          // Its checkpoint still has it; only the library copy is missing. Say so and stop, rather
          // than leave "Running chain 2 of 3" on screen with nothing running.
          fail(c.label, `finished, but couldn't be saved to your runs (${(e as Error)?.message ?? e})`);
          break;
        }
        // Recorded, sent and saved: a crash from here on carries on with the next chain.
        if (!stopped && k < o.chains.length - 1) await d.persistQueue(true);
      } else if (!stopped) fail(c.label, 'no chain in this space finishes');
      if (stopped) break;
    }
  } finally {
    q.at = -1;
    // Stop's "the rest don't start" ends with the queue: left set, a later single run's Stop read
    // "Stopping..." from the start.
    q.cancelled = false;
    // Over (finished, stopped, couldn't start a chain): a later carry-on of the run in the slot runs
    // that chain alone.
    if (!keepQueue) await d.persistQueue(null);
  }
}
