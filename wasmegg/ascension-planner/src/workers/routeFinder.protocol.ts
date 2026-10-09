/**
 * Messages between the page and routeFinder.worker.ts. Plain data only: each worker owns a copy of the
 * table (fetched and kept there); the page coordinates the route search (search/routeFinder.ts
 * `findRoutes`) and hands each worker its share of every step.
 */
import type { BuildParams } from '@/search/precomputedLeg';
import type { TableHeader } from '@/search/precomputedTable';
import type { FirstAscension } from '@/search/firstAscension';
import type {
  ArrivalItem,
  Candidate,
  ExpandSettings,
  FirstLeg,
  FoundRoutes,
  PolishOptions,
} from '@/search/routeFinder';

/** Load the table (once) and say what it is. */
export interface HeaderRequest {
  kind: 'header';
  id: number;
  url: string;
}

/** The player's first ascension to every checkpoint (search/routeFinder.ts `firstLegOptions`). */
export interface FirstLegsRequest {
  kind: 'first-legs';
  id: number;
  url: string;
  startTE: number;
  /** Unix seconds. */
  start: number;
  final: number;
  /** The player's peak delivery rate against the table's, at the research a build waits with. */
  deliveryScale: number;
  /** The player's eggs delivered per egg at the plan start (EGG_ORDER). */
  delivered: number[];
  cont: BuildParams | null;
  firstAscension: FirstAscension;
  pinSeconds: number;
  maxContinueSeconds: number;
}

/** One step of the route search for a share of the arrivals (`expandArrivals`). */
export interface ExpandRequest {
  kind: 'expand';
  id: number;
  url: string;
  items: ArrivalItem[];
  settings: ExpandSettings;
}

/** The search's answer polished on the table (routeFinder.ts `polishFound`). */
export interface PolishRequest {
  kind: 'polish';
  id: number;
  url: string;
  options: PolishOptions;
  found: FoundRoutes;
}

export type RouteWorkerRequest = HeaderRequest | FirstLegsRequest | ExpandRequest | PolishRequest;

export type RouteWorkerResponse =
  | { kind: 'header'; id: number; header: TableHeader }
  | { kind: 'first-legs'; id: number; firstLegs: FirstLeg[] }
  | { kind: 'expand'; id: number; candidates: Candidate[] }
  | { kind: 'polish'; id: number; found: FoundRoutes }
  | { kind: 'error'; id: number; message: string };
