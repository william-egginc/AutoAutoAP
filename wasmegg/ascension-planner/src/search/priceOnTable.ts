/**
 * The player's route found again on another table (another gear set's instant answer): their own
 * start (TE, eggs, start time) and first ascension (continue / build-up from their real farm), at the
 * other table's gear (delivery scale 1). Used for the nearest stronger and weaker gear (InstantRoute.vue
 * runBracket) and "What if you had maxed gear?" (MaxedWhatIf.vue).
 */
import {
  findRoutes,
  type ArrivalItem,
  type Candidate,
  type ExpandSettings,
  type FirstLeg,
  type Route,
  type TailOptions,
} from './routeFinder';
import { atMostAscensions } from './instantFilters';
import type { Availability } from './availability';
import type { FirstLegsRequest } from '@/workers/routeFinder.protocol';

/** The first-legs request without the table and its scale: the same for every table priced on. */
export type FirstLegsBase = Omit<FirstLegsRequest, 'id' | 'kind' | 'url' | 'deliveryScale'>;

/** What a route worker pool offers (search/routePool.ts RoutePool). */
export interface TablePricer {
  firstLegs(request: Omit<FirstLegsRequest, 'id' | 'kind'>): Promise<FirstLeg[]>;
  expand(url: string, items: ArrivalItem[], settings: ExpandSettings): Promise<Candidate[]>;
}

export interface PriceOnTableOptions {
  legs: FirstLegsBase;
  /** The target TE (By a date: 490, every TE up to it). */
  final: number;
  maxAscensions: number;
  /** "At most N ascensions", or null. */
  atMost: number | null;
  deadline?: number;
  hours?: Availability | null;
  /** The instant answer's tail options (search/instantGear.ts `instantTail`): held shifts with the player's
   *  hours, as the answer on screen was priced. Left out, the legs are not held, and a held answer beside it
   *  is later than this for no reason of gear (the bracket that came out sooner than maxed, 23 Oct 2026). */
  tail?: TailOptions;
}

export interface PricedOnTable {
  /** Fastest: the fastest route. By a date: the route to the highest TE by then. Null: none. */
  route: Route | null;
  /** When it reaches its last stop (null: no route). */
  end: number | null;
  /** The TE it ends at (0: no route). */
  te: number;
}

export async function priceOnTable(pool: TablePricer, url: string, o: PriceOnTableOptions): Promise<PricedOnTable> {
  const firstLegs = await pool.firstLegs({ url, deliveryScale: 1, ...o.legs, ...(o.tail ?? {}), ...(o.hours ? { hours: o.hours } : {}) });
  const found = await findRoutes({
    table: () => null,
    startTE: o.legs.startTE,
    start: o.legs.start,
    final: o.final,
    maxAscensions: o.maxAscensions,
    firstLegs,
    ...(o.deadline ? { deadline: o.deadline } : {}),
    ...(o.hours ? { hours: o.hours } : {}),
    ...(o.tail ?? {}),
    expand: (items, settings) => pool.expand(url, items, settings),
  });
  const f = atMostAscensions(found, o.atMost);
  const route = o.deadline ? f.byDate : f.best;
  return { route, end: route?.end ?? null, te: route ? route.legs[route.legs.length - 1].endTE : 0 };
}
