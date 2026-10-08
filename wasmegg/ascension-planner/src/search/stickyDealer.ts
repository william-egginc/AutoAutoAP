/**
 * Who prices which route in a By a date run: evenly, and back to the worker that already knows it.
 *
 * WHY. Each round of the date search (search/deadline.ts) re-probes the same sets of early stops
 * with a new last stop, and only the worker that priced a set before still has its early legs in its
 * prefix memo. It used to send every set to `hash(set) % workers` (pool.ts `stickyBuckets`), which
 * keeps them warm but deals unevenly: on a batch of 64 the busiest of 8 workers got about twice the
 * average, and the rest waited for it (about 63% busy on 8 workers, 48% on 16, 39% on 24, in a cost
 * model). Resizing the pool changed `% workers` and sent every set to a cold worker.
 *
 * HOW. A set is the route less its last stop. A set seen before goes back to its worker while that
 * worker has room this batch. A new set goes where its siblings are (the sets that differ from it
 * only in their last early stop, which share every leg before it) while that worker has room, and
 * otherwise to the least-loaded worker. Room is the batch's even share, counted in legs: one per
 * route, plus the set's own early leg on a worker that has not priced it, plus its siblings' legs on
 * a worker that has none of them. When the pool shrinks, only the sets of the workers that went are
 * dealt again; when it grows, the new workers take new sets and the overflow.
 *
 * Only WHO prices a route changes, never which routes are priced or what they come to: the memo is a
 * cache of the same deterministic simulation, so a cold worker gets the same answer, just later.
 */

export interface StickyDealer {
  /** The worker (0 to `workers - 1`) for each chain, in the order given. */
  deal(chains: readonly (readonly number[])[], workers: number): number[];
  /** Sets with a worker of their own (for tests and the black box). */
  readonly sets: number;
}

/** How far over the even share a worker may go before a set it knows is sent elsewhere. */
const SLACK = 1.08;

export function createStickyDealer(): StickyDealer {
  /** Each set's worker. */
  const owner = new Map<string, number>();
  /** Each sibling group's worker: where a new set of that group goes first. */
  const groupOwner = new Map<string, number>();
  /** Workers that have priced some set of the group (its shared legs are in their memo). */
  const groupSeen = new Map<string, Set<number>>();
  let lastWorkers = 0;

  /** Drop everything that points at a worker that no longer exists. */
  function forgetAbove(workers: number): void {
    for (const [k, w] of owner) if (w >= workers) owner.delete(k);
    for (const [k, w] of groupOwner) if (w >= workers) groupOwner.delete(k);
    for (const seen of groupSeen.values()) for (const w of [...seen]) if (w >= workers) seen.delete(w);
  }

  return {
    get sets() {
      return owner.size;
    },
    deal(chains, workersIn) {
      const workers = Math.max(1, Math.floor(workersIn));
      if (workers < lastWorkers) forgetAbove(workers);
      lastWorkers = workers;
      const out = new Array<number>(chains.length).fill(0);
      if (workers === 1) {
        for (const c of chains) {
          const set = c.slice(0, -1);
          owner.set(set.join(','), 0);
        }
        return out;
      }

      // The batch by set, in the order given (depth-first from the pool, so siblings are adjacent).
      interface SetWork {
        key: string;
        group: string;
        /** Early legs the group shares: its stops. */
        groupLegs: number;
        routes: number[];
      }
      const bySet = new Map<string, SetWork>();
      const order: SetWork[] = [];
      chains.forEach((c, i) => {
        const set = c.slice(0, -1);
        const key = set.join(',');
        let s = bySet.get(key);
        if (!s) {
          // Siblings share every stop but the set's last one. A set of one stop has no siblings worth
          // keeping together (nothing before its stop to share), so it is a group of its own.
          const parent = set.length >= 2 ? set.slice(0, -1) : null;
          s = {
            key,
            group: parent ? `g:${parent.join(',')}` : `s:${key}`,
            groupLegs: parent ? parent.length : 0,
            routes: [],
          };
          bySet.set(key, s);
          order.push(s);
        }
        s.routes.push(i);
      });

      // What a set costs on a worker, in legs: one a route, plus its own early leg where that worker
      // has not priced it, plus its siblings' shared legs where that worker has none of them (this
      // batch's placements count: the first sibling placed there pays for the rest).
      const groupHere = new Set<string>();
      const hasGroup = (s: SetWork, w: number) => groupHere.has(`${s.group}|${w}`) || !!groupSeen.get(s.group)?.has(w);
      const cost = (s: SetWork, w: number) =>
        owner.get(s.key) === w ? s.routes.length : s.routes.length + 1 + (hasGroup(s, w) ? 0 : s.groupLegs);

      const load = new Array<number>(workers).fill(0);
      const placed: { s: SetWork; cost: number }[][] = Array.from({ length: workers }, () => []);
      const where = new Map<SetWork, number>();
      const put = (s: SetWork, w: number) => {
        const c = cost(s, w);
        load[w] += c;
        placed[w].push({ s, cost: c });
        where.set(s, w);
        groupHere.add(`${s.group}|${w}`);
        // A new group's home is where its first set went, so its siblings follow it in this batch.
        const g = groupOwner.get(s.group);
        if (g === undefined || g >= workers) groupOwner.set(s.group, w);
      };
      const leastLoaded = () => {
        let best = 0;
        for (let w = 1; w < workers; w++) if (load[w] < load[best]) best = w;
        return best;
      };

      // 1. Every set a worker already knows goes back to it.
      const fresh: SetWork[] = [];
      for (const s of order) {
        const w = owner.get(s.key);
        if (w !== undefined && w < workers) put(s, w);
        else fresh.push(s);
      }
      // 2. A new set goes with its siblings while their worker is under the even share, else to the
      //    least-loaded worker.
      let total = load.reduce((a, b) => a + b, 0);
      for (const s of fresh) total += s.routes.length + 1 + s.groupLegs;
      const share = (total / workers) * SLACK;
      for (const s of fresh) {
        const g = groupOwner.get(s.group);
        put(s, g !== undefined && g < workers && load[g] + cost(s, g) <= share ? g : leastLoaded());
      }
      // 3. Even it out: move the busiest worker's last set to the idlest while that lowers the
      //    busiest (a moved set costs more where it lands, which this counts).
      for (let guard = 0; guard < order.length; guard++) {
        let hi = 0;
        let lo = 0;
        for (let w = 1; w < workers; w++) {
          if (load[w] > load[hi]) hi = w;
          if (load[w] < load[lo]) lo = w;
        }
        const top = placed[hi][placed[hi].length - 1];
        if (!top || hi === lo) break;
        const c = cost(top.s, lo);
        if (load[lo] + c >= load[hi]) break;
        placed[hi].pop();
        load[hi] -= top.cost;
        put(top.s, lo);
      }

      // Commit: who has which set, and which groups' legs each worker now holds.
      for (const [s, w] of where) {
        for (const i of s.routes) out[i] = w;
        owner.set(s.key, w);
        let seen = groupSeen.get(s.group);
        if (!seen) groupSeen.set(s.group, (seen = new Set()));
        seen.add(w);
      }
      return out;
    },
  };
}
