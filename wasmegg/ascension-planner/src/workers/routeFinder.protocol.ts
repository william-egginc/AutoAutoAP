/**
 * Messages between the page and routeFinder.worker.ts. Plain data only: the worker owns the table
 * (fetched and kept there), the page sends the player's numbers.
 */
import type { BuildParams } from '@/search/precomputedLeg';
import type { TableHeader } from '@/search/precomputedTable';
import type { Route } from '@/search/routeFinder';

export interface FindRequest {
  kind: 'find';
  id: number;
  /** Where the table file is; fetched once, then kept. */
  url: string;
  startTE: number;
  /** Unix seconds. */
  start: number;
  /** Also the highest TE reachable by this unix second (Highest TE by a date). */
  deadline?: number;
  final: number;
  maxAscensions: number;
  /** The player's peak delivery rate against the table's, at the research a build waits with. */
  deliveryScale: number;
  /** The player's eggs delivered per egg at the plan start (EGG_ORDER). */
  delivered: number[];
  cont: BuildParams | null;
  forceContinue: boolean;
  pinSeconds: number;
  maxContinueSeconds: number;
}

/** Load the table (once) and say what it is: the page needs its header to work out the player's
 *  delivery against it before asking for routes. */
export interface HeaderRequest {
  kind: 'header';
  id: number;
  url: string;
}

export type RouteWorkerRequest = FindRequest | HeaderRequest;

export type RouteWorkerResponse =
  | { kind: 'header'; id: number; header: TableHeader }
  | {
      kind: 'routes';
      id: number;
      header: TableHeader;
      best: Route | null;
      byAscensions: (Route | null)[];
      byDate: Route | null;
      ms: number;
    }
  /** How far along: `done` of `of` numbers of ascensions worked through. */
  | { kind: 'progress'; id: number; done: number; of: number }
  /** The table does not reach down to the player's TE (it is built from the top down). */
  | { kind: 'not-yet'; id: number; header: TableHeader }
  | { kind: 'error'; id: number; message: string };
