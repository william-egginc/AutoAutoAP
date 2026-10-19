/**
 * "Simulate this plan": the instant answer's route opened in Joo's own Auto Planner, so his simulator
 * gives the exact dates. The only hook into his planner:
 *
 *   1. `requestSimulate` (the instant answer's button) fills his form as a player would: Start Time =
 *      the route's first ascension's start, in the planner's timezone; Target TE(s) = the route's stops.
 *      It also saves his form cache (lib/autoPlannerFormCache.ts), which AutomaticPlanner.vue restores
 *      on every mount and would otherwise put the old form back. Then App.vue opens the Auto tab with
 *      his own handler (fresh backup, as his tab button does).
 *   2. When the Auto planner mounts, `runPendingSimulate` (called from AutomaticPlanner.vue) pins A1 to
 *      what the answer priced (a fresh '2-sale', '1-sale-tier13', ..., or 'continue': finishing the
 *      ascension in progress) and runs his `generate`. A2 onwards are his own pick, the
 *      fastest variant, as the table picks.
 *
 * Nothing else of his planner is touched; a plain Generate press afterwards is his as always.
 */
import type { useAutoPlannerStore, VariantKey } from '@/stores/autoPlanner';
import { saveAutoPlannerSchedule } from '@/lib/autoPlannerFormCache';
import { formatUnixToDateInput, formatUnixToTimeInput } from '@/lib/format';

type PlannerStore = Pick<
  ReturnType<typeof useAutoPlannerStore>,
  | 'timezone'
  | 'startDate'
  | 'startTime'
  | 'targetTE'
  | 'deferForEarningsMode'
  | 'ascensionChain'
  | 'planVariantOverrides'
  | 'endTimeOverrides'
>;

export interface SimulateRequest {
  /** The route's stops, ending at its target. */
  chain: number[];
  /** Unix seconds its first ascension starts. */
  start: number;
  /** The first ascension's build, as Joo's planner names its variants ('2-sale', '1-sale-tier13',
   *  'continue'). */
  a1: string;
}

/** A request waiting for the Auto planner to mount (one at a time; the newest wins). */
let pending: { a1: VariantKey | null } | null = null;

const VARIANT = /^([123]-sale(-tier13)?|continue)$/;

/** Fill Joo's Auto planner form with the route, and leave A1's build for `runPendingSimulate`. */
export function requestSimulate(planner: PlannerStore, req: SimulateRequest): void {
  const tz = planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  planner.timezone = tz;
  // His inputs hold whole minutes: round up, so the plan never starts before the answer's start.
  const at = Math.ceil(req.start / 60) * 60;
  planner.startDate = formatUnixToDateInput(at, tz);
  planner.startTime = formatUnixToTimeInput(at, tz);
  planner.targetTE = req.chain.join(' ');
  saveAutoPlannerSchedule({
    timezone: tz,
    startDate: planner.startDate,
    startTime: planner.startTime,
    targetTE: planner.targetTE,
    deferForEarningsMode: planner.deferForEarningsMode,
  });
  pending = { a1: VARIANT.test(req.a1) ? (req.a1 as VariantKey) : null };
}

/**
 * From AutomaticPlanner.vue on mount: run the plan a request left, if any (true), with A1 pinned to
 * its build. `generate` is his own (auto/useAscensionGenerator.ts).
 */
export function runPendingSimulate(planner: PlannerStore, generate: () => unknown): boolean {
  const req = pending;
  pending = null;
  if (!req) return false;
  planner.ascensionChain = [];
  planner.planVariantOverrides = req.a1 ? { 0: req.a1 } : {};
  planner.endTimeOverrides = {};
  generate();
  return true;
}

/** Specs only. */
export function hasPendingSimulate(): boolean {
  return pending !== null;
}
