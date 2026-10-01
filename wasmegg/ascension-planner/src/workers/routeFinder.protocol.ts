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
  final: number;
  maxAscensions: number;
  /** The player's gear against the table's: delivery score and earnings set's Clothed TE bonus. */
  deliveryScore: number;
  cteBonus: number;
  /** The player's eggs delivered per egg at the plan start (EGG_ORDER). */
  delivered: number[];
  cont: BuildParams | null;
  forceContinue: boolean;
  pinSeconds: number;
  maxContinueSeconds: number;
}

export type RouteWorkerRequest = FindRequest;

export type RouteWorkerResponse =
  | { kind: 'routes'; id: number; header: TableHeader; best: Route | null; byAscensions: (Route | null)[]; ms: number }
  /** How far along: `done` of `of` numbers of ascensions worked through. */
  | { kind: 'progress'; id: number; done: number; of: number }
  /** The table does not reach down to the player's TE (it is built from the top down). */
  | { kind: 'not-yet'; id: number; header: TableHeader }
  | { kind: 'error'; id: number; message: string };
