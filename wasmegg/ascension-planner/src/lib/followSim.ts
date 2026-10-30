/**
 * THE CURRENT ASCENSION, SIMULATED ON THE LIVE SAVE (26 Oct 2026, Jordan). A followed route priced on the instant
 * answer's data (lib/followEstimate.ts) has the table's times: the ascension the player is in has no shifts there (the
 * table starts from a fresh ascension), and a player off the plan is not where the table thinks. So the first
 * ascension of the followed route is simulated once on the loaded save with the player's setup (search/chain.ts
 * `createChainEvaluator`, in one chain worker: composables/useCurrentSim.ts), exact to the second. Right now then
 * shows its shifts, its prestige and the Next step from it; the later ascensions keep the table's.
 *
 * Kept next to the follow in localStorage (`aap-follow-sim`), per account (a hash, never the player id), save, route
 * and setup, the newest `SIM_RECORDS`, each a few kB at most (`SIM_MAX_BYTES`), so a reload does not simulate again.
 *
 * Pure apart from the storage it is handed (localStorage by default; every read and write in try/catch).
 */
import type { LegSummary } from '@/search/types';
import type { BuildUpAction, BuildUpPlan } from '@/search/buildUpActions';
import type { NowPlan } from './nowPlan';

export const SIM_RECORD_KEY = 'aap-follow-sim';
export const SIM_RECORDS = 3;
/** One record's most (a leg has about twelve shifts: well under 2 kB). */
export const SIM_MAX_BYTES = 16_000;

/** The simulated ascension, as much of it as Right now reads. */
export interface SimLeg {
  /** search/types.ts VariantKey: 'continue', 'buildup', '2-sale', ... */
  key: string;
  startTime: number;
  endTime: number;
  endTE: number;
  /** When its build phase ends (the leg's start when it has none: continuing the ascension as it is). */
  buildPhaseEndTime: number | null;
  /** Each shift: when, and the egg switched TO. */
  shifts: { at: number; egg: string }[];
  /** Its peak eggs per second after K3 (LegSummary.maxELR): the rate it produces at once built. Absent in records
   *  kept before 26 Oct 2026 and when the simulation had none. */
  maxELR?: number;
  /**
   * TIME OFF INSIDE IT (26 Oct 2026, Williamthe5thc: time off Oct 29-30 made the simulation's one-stop route come back
   * as two segments, the ascension cut when the time off starts and a rebuild after it, and only the first was read:
   * it ends below the stop, so Right now dropped it and fell back to the table without a word). Going to the home farm
   * is a prestige: the ascension you are in ends at `from` with `te`, and is built again from `to` (the rebuild's
   * start) up to the stop (`endTime`, `endTE`). `rebuildBuildEnd`: the rebuild's build phase end.
   */
  timeOff?: { from: number; to: number; te: number; rebuildBuildEnd?: number };
}

export interface SimRecord {
  /** search/runSaves.ts `accountOf`: a hash, never the player id. */
  account: string;
  /** The save's `lastBackupTime`, unix seconds. */
  backupTime: number;
  /** The followed route simulated from (its stops ahead of the save). */
  route: number[];
  /** `simSetupKey` of the setup it was simulated with. */
  setup: string;
  /** When it was kept, ms. */
  at: number;
  /** How long the simulation took, ms (for the record; Right now does not show it). */
  ms?: number;
  leg: SimLeg;
}

/** What the simulation depends on beyond the save and the route: the hours (when the answers work inside them), time
 *  off, no-prestige days, the first ascension's rule and whether shifts wait for the hours. */
export function simSetupKey(o: {
  availability: unknown;
  useHours: boolean;
  timeOff: unknown;
  noPrestige: unknown;
  firstAscension: string | null | undefined;
  deferShifts: boolean;
}): string {
  const list = (x: unknown) => (Array.isArray(x) ? x : []);
  return JSON.stringify([
    o.useHours ? (o.availability ?? null) : null,
    list(o.timeOff),
    list(o.noPrestige),
    o.firstAscension ?? null,
    !!o.deferShifts,
  ]);
}

/** The record's key: account, save, route and setup. */
export function simKey(o: { account: string; backupTime: number; route: readonly number[]; setup: string }): string {
  return `${o.account}|${o.backupTime}|${o.route.join(',')}|${o.setup}`;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The parts of a simulated leg Right now reads; null when it has no usable times. */
export function simLegOf(leg: LegSummary | null | undefined): SimLeg | null {
  if (!leg || !finite(leg.endTime)) return null;
  const start = finite(leg.startTime) ? leg.startTime : leg.endTime - leg.durationSeconds;
  if (!finite(start)) return null;
  return {
    key: String(leg.key),
    startTime: start,
    endTime: leg.endTime,
    endTE: leg.endTE,
    buildPhaseEndTime: finite(leg.buildPhaseEndTime) ? leg.buildPhaseEndTime : null,
    shifts: (leg.shifts ?? []).filter(s => finite(s.at) && typeof s.egg === 'string').map(s => ({ at: s.at, egg: s.egg })),
    ...(finite(leg.maxELR) && leg.maxELR > 0 ? { maxELR: leg.maxELR } : {}),
  };
}

/**
 * The ascension you are in from ALL the segments the chain evaluator gives a one-stop route (search/chain.ts
 * `priceStep`): one leg normally; with time off, the leg cut when it starts ('stopped', when it gained TE before it)
 * and the rebuild after it ('restarted'). Null when there is no usable segment.
 */
export function simLegFromSegments(
  legs: readonly LegSummary[] | null | undefined,
  o: { timeOff?: readonly { from: number; to: number }[] | null; currentTE: number; planStart: number }
): SimLeg | null {
  const segs = (legs ?? []).filter(l => l && finite(l.endTime));
  if (!segs.length) return null;
  const first = segs[0];
  if (segs.length === 1 && !first.timeOff) return simLegOf(first);
  const last = simLegOf(segs[segs.length - 1]);
  if (!last) return null;
  const stopped = first.timeOff === 'stopped' ? simLegOf(first) : null;
  // No TE gained before the time off: the farm lays as it is until it starts (the window the rebuild came back from).
  const window = (o.timeOff ?? []).filter(w => w.from < last.startTime).sort((a, b) => b.from - a.from)[0];
  const from = stopped ? stopped.endTime : window ? window.from : last.startTime;
  const shifts = segs.flatMap(s => simLegOf(s)?.shifts ?? []).sort((a, b) => a.at - b.at);
  return {
    key: stopped ? stopped.key : 'continue',
    startTime: stopped ? stopped.startTime : Math.min(o.planStart, from),
    endTime: last.endTime,
    endTE: last.endTE,
    buildPhaseEndTime: stopped ? stopped.buildPhaseEndTime : null,
    shifts,
    ...(last.maxELR ? { maxELR: last.maxELR } : {}),
    timeOff: {
      from,
      to: last.startTime,
      te: stopped ? stopped.endTE : Math.floor(o.currentTE),
      ...(last.buildPhaseEndTime !== null ? { rebuildBuildEnd: last.buildPhaseEndTime } : {}),
    },
  };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function usable(r: unknown): r is SimRecord {
  const x = r as SimRecord | null;
  return (
    !!x &&
    typeof x.account === 'string' &&
    finite(x.backupTime) &&
    Array.isArray(x.route) &&
    typeof x.setup === 'string' &&
    !!x.leg &&
    finite(x.leg.startTime) &&
    finite(x.leg.endTime) &&
    Array.isArray(x.leg.shifts)
  );
}

/** The records kept, newest first (none when unreadable). */
export function readSimRecords(st: Store | null = storage()): SimRecord[] {
  if (!st) return [];
  try {
    const v = JSON.parse(st.getItem(SIM_RECORD_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter(usable) : [];
  } catch {
    return [];
  }
}

/** The record for this account, save, route and setup, or null. */
export function findSimRecord(
  records: readonly SimRecord[],
  o: { account: string; backupTime: number; route: readonly number[]; setup: string }
): SimRecord | null {
  const k = simKey(o);
  return records.find(r => simKey(r) === k) ?? null;
}

/** Keep a record (replacing one of the same key), the newest `SIM_RECORDS`. False when it is too big or could not be
 *  kept; a full storage keeps fewer records rather than none. */
export function recordSim(r: SimRecord, st: Store | null = storage()): boolean {
  if (!st || !usable(r)) return false;
  let text: string;
  try {
    text = JSON.stringify(r);
  } catch {
    return false;
  }
  if (text.length > SIM_MAX_BYTES) return false;
  const k = simKey(r);
  let list = [r, ...readSimRecords(st).filter(x => simKey(x) !== k)].slice(0, SIM_RECORDS);
  while (list.length) {
    try {
      st.setItem(SIM_RECORD_KEY, JSON.stringify(list));
      return true;
    } catch {
      list = list.slice(0, list.length - 1);
    }
  }
  return false;
}

/**
 * The plan with its first ascension as simulated: that leg's shifts (exact, `simulated`), its end and TE. The later
 * ascensions keep the table's times. The plan as it was when it has exact legs, no table legs, or the simulation is
 * for another stop.
 */
export function withCurrentSim(plan: NowPlan, leg: SimLeg | null | undefined): NowPlan {
  const first = plan.tableLegs?.[0];
  if (!leg || plan.legs || !first || first.to !== plan.chain[0] || !(leg.endTE >= first.to)) return plan;
  // A one-stop route ends with this ascension.
  const only = plan.chain.length === 1;
  // The table's rate is its own variant's: the simulated leg's peak replaces it, or none.
  const { peakELR: _tableRate, ...rest } = first;
  return {
    ...plan,
    ...(only ? { end: leg.endTime, endTE: leg.endTE } : {}),
    tableLegs: [
      {
        ...rest,
        start: leg.startTime,
        end: leg.endTime,
        endTE: leg.endTE,
        shifts: leg.shifts.map(s => ({ ...s })),
        simulated: true,
        variant: leg.key,
        ...(finite(leg.maxELR) && leg.maxELR > 0 ? { peakELR: leg.maxELR } : {}),
        ...(leg.buildPhaseEndTime !== null ? { buildEnd: leg.buildPhaseEndTime } : {}),
        ...(leg.timeOff ? { timeOff: { ...leg.timeOff } } : {}),
      },
      ...plan.tableLegs!.slice(1),
    ],
  };
}

// ------------------------------------------------------------------------------------------------
// BUILD-UP TRACKER (Phase 1; ~/code/aaap-tools/wireframes/buildup-tracker-v1.md). The simulated ascension's action
// list, asked for only by a caller that wants it (composables/useCurrentSim.ts `wantBuildUp`). Kept apart from the
// 16 kB `SimRecord`: one record under its own key, the newest only.

export const BUILDUP_PLAN_KEY = 'aap-buildup-plan';
/** The kept plan's most, as JSON text. About 1,500 buys of a whole build-up measure well under this. */
export const BUILDUP_PLAN_MAX_BYTES = 600_000;

/**
 * The build-up plan from ALL the segments the one-stop route came back with (as `simLegFromSegments` reads them):
 * every segment's list in time order, the first segment's start farm and variant, the last one's end. Null when no
 * segment carries a list (the simulation was not asked for one).
 */
export function buildUpPlanFromSegments(
  legs: readonly LegSummary[] | null | undefined,
  o: { accountKey: string; siloSeconds: number }
): BuildUpPlan | null {
  const segs = (legs ?? []).filter(l => l && l.buildUp && finite(l.endTime));
  if (!segs.length) return null;
  const first = segs[0];
  const startedAt = finite(first.startTime) ? first.startTime : first.endTime - first.durationSeconds;
  if (!finite(startedAt)) return null;
  const actions: BuildUpAction[] = segs.flatMap(l => l.buildUp!.actions).sort((x, y) => x.t - y.t);
  return {
    startedAt,
    accountKey: o.accountKey,
    variantKey: String(first.key),
    ...(first.buildUp!.start ? { start: first.buildUp!.start } : {}),
    actions,
    siloSeconds: finite(o.siloSeconds) ? o.siloSeconds : 0,
    endTime: segs[segs.length - 1].endTime,
  };
}

function usablePlan(p: unknown): p is BuildUpPlan {
  const x = p as BuildUpPlan | null;
  return !!x && finite(x.startedAt) && finite(x.endTime) && typeof x.accountKey === 'string' && Array.isArray(x.actions);
}

/** The last kept text read and what it parsed to: the same text is never parsed twice (build-up perf, 30 Oct 2026:
 *  the request watch reads this whenever the request is worked out again). */
let lastRead: { text: string; v: { key?: unknown; plan?: unknown } | null } | null = null;

/** The kept plan for this `simKey`, or null. */
export function readBuildUpPlan(key: string, st: Store | null = storage()): BuildUpPlan | null {
  if (!st) return null;
  try {
    const text = st.getItem(BUILDUP_PLAN_KEY) ?? 'null';
    if (lastRead?.text !== text) lastRead = { text, v: JSON.parse(text) as { key?: unknown; plan?: unknown } | null };
    const v = lastRead.v;
    // An empty list reads as no plan (spec-buildcache: a record must never read as "plan present" without one).
    return v && v.key === key && usablePlan(v.plan) && v.plan.actions.length > 0 ? v.plan : null;
  } catch {
    return null;
  }
}

/** Keep the plan for this `simKey` (replacing the one kept). False when too big or it could not be kept. */
export function recordBuildUpPlan(key: string, plan: BuildUpPlan, st: Store | null = storage()): boolean {
  if (!st || !usablePlan(plan)) return false;
  try {
    const text = JSON.stringify({ key, plan });
    if (text.length > BUILDUP_PLAN_MAX_BYTES) return false;
    st.setItem(BUILDUP_PLAN_KEY, text);
    return true;
  } catch {
    return false;
  }
}
