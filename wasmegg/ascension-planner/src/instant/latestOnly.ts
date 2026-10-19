/**
 * The newest request wins (instant.worker.ts). A goal switch while a run is going sends a new
 * request. Requests still queued behind a newer one are skipped, and a run already going stops at
 * its pause (after the route search, before the polish), so Egg Day -> Fastest -> Egg Day no longer
 * queues three full runs. Pure, so the spec can drive it without a worker.
 */

/** Thrown at a pause when a newer request has arrived; the worker answers 'dropped'. */
export class Superseded extends Error {
  constructor(readonly id: number) {
    super(`request ${id} was superseded`);
    this.name = 'Superseded';
  }
}

/** The newest request id seen; anything older is stale. */
export function latestOnly() {
  let newest = 0;
  return {
    /** A request arrived. */
    note(id: number): void {
      if (id > newest) newest = id;
    },
    /** True when a newer request than `id` has arrived. */
    stale(id: number): boolean {
      return id < newest;
    },
    newest: (): number => newest,
  };
}
export type LatestOnly = ReturnType<typeof latestOnly>;

/** One macrotask: lets the worker take the messages already queued. */
export const nextTask = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** The pause a run for request `id` awaits: yield, then stop if a newer request came in meanwhile. */
export function pauseFor(id: number, latest: LatestOnly, tick: () => Promise<void> = nextTask): () => Promise<void> {
  return async () => {
    await tick();
    if (latest.stale(id)) throw new Superseded(id);
  };
}
