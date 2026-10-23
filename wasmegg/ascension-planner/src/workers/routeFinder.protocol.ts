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
  TailOptions,
  FoundRoutes,
  PolishOptions,
} from '@/search/routeFinder';
import type { EstimateRequest, Outcome } from '@/search/prestigeBy';
import type { Availability } from '@/search/availability';

/** Load the table (once) and say what it is. */
export interface HeaderRequest {
  kind: 'header';
  id: number;
  url: string;
}

/** The player's first ascension to every checkpoint (search/routeFinder.ts `firstLegOptions`). */
export interface FirstLegsRequest extends TailOptions {
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
  /** Continue my build-up's tails (search/leg.ts `buildUpTailParams`), or null/empty: not simulated. */
  buildUp?: BuildParams[] | null;
  /** The player's own fresh build at `startTE`, simulated live, where the table has no row there. */
  freshLive?: BuildParams[] | null;
  firstAscension: FirstAscension;
  pinSeconds: number;
  maxContinueSeconds: number;
  /** "Works inside my hours" (FirstLegOptions.hours), and the egg the save's farm is on. */
  hours?: Availability | null;
  contEgg?: number;
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

/** The experimental "Prestige by" estimate for a run of hours (search/prestigeBy.ts `estimateProfile`). */
export interface PrestigeEstimateRequest {
  kind: 'prestige-estimate';
  id: number;
  url: string;
  request: EstimateRequest;
}

export type RouteWorkerRequest =
  | HeaderRequest
  | FirstLegsRequest
  | ExpandRequest
  | PolishRequest
  | PrestigeEstimateRequest;

export type RouteWorkerResponse =
  | { kind: 'header'; id: number; header: TableHeader }
  | { kind: 'first-legs'; id: number; firstLegs: FirstLeg[] }
  | { kind: 'expand'; id: number; candidates: Candidate[] }
  | { kind: 'polish'; id: number; found: FoundRoutes }
  | { kind: 'prestige-estimate'; id: number; outcomes: Outcome[] }
  | { kind: 'error'; id: number; message: string };
