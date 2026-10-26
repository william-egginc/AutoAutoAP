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
  return {
    ...plan,
    ...(only ? { end: leg.endTime, endTE: leg.endTE } : {}),
    tableLegs: [
      {
        ...first,
        start: leg.startTime,
        end: leg.endTime,
        endTE: leg.endTE,
        shifts: leg.shifts.map(s => ({ ...s })),
        simulated: true,
        variant: leg.key,
        ...(leg.buildPhaseEndTime !== null ? { buildEnd: leg.buildPhaseEndTime } : {}),
      },
      ...plan.tableLegs!.slice(1),
    ],
  };
}
