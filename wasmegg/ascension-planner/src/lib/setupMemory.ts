/**
 * YOUR SETUP, REMEMBERED PER ACCOUNT (batch 16, item 8): the hours ("Let me pick my hours", from, to,
 * days), hold shifts, time off (away from virtue), the no-prestige days and first ascension, kept in this browser under the account's partition
 * hash (`aap-setup:<sha-256 of the player ID>`, the same hashing as stores/shareName.ts), never under the
 * player ID. One JSON blob an account, with when it was written.
 *
 * Not remembered, on purpose: the plan start (it stays "now" or the save's moment), the time zone and
 * Target TE (Single run's own cache, lib/autoPlannerFormCache.ts), milestones, and the workers
 * (`aap-workers`) and Stronger check level (`aap-stronger-level`), which stay one per browser: they
 * describe the computer and a habit, not the account.
 *
 * Pure apart from the storage calls, which never throw (a private window remembers nothing). The
 * store (stores/chainSearch.ts `loadSetupFor`) reads it when an account loads and writes the player's
 * own edits; every restore of a run's or a saved answer's settings is muted there, so a run's
 * settings are never remembered as the player's.
 */
import { DEFAULT_FIRST_ASCENSION, isFirstAscension, type FirstAscension } from '@/search/firstAscension';
import type { TimeOffDates } from '@/search/timeOff';

export const SETUP_PREFIX = 'aap-setup:';

/** What is remembered. `v` for a later change of shape. */
export interface RememberedSetup {
  v: 1;
  hours: { on: boolean; from: number; to: number; days: number[] };
  holdShifts: boolean;
  timeOff: TimeOffDates[];
  /** No prestige on these days (search/noPrestige.ts), whole local dates like time off. Absent in a blob written
   *  before 24 Oct 2026: none. */
  noPrestige: TimeOffDates[];
  firstAscension: FirstAscension;
  /** When it was written, ms. */
  at: number;
}

/** The parts the player edits, one group each: an edit writes only its own group. */
export type SetupGroup = 'hours' | 'holdShifts' | 'timeOff' | 'noPrestige' | 'firstAscension';
export type SetupValues = Omit<RememberedSetup, 'v' | 'at'>;

/** The store's own defaults (stores/chainSearch.ts): any hour (7 am to 11 pm when picked, every day),
 *  hold shifts on, no time off, no no-prestige days, first ascension Soonest. */
export function setupDefaults(): SetupValues {
  return {
    hours: { on: false, from: 7, to: 23, days: [0, 1, 2, 3, 4, 5, 6] },
    holdShifts: true,
    timeOff: [],
    noPrestige: [],
    firstAscension: DEFAULT_FIRST_ASCENSION,
  };
}

/** The key for an account's partition hash (`hashID`). Never a player ID. */
export function setupKey(hash: string): string {
  return SETUP_PREFIX + hash;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const hour = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 24;

/**
 * A stored blob, checked field by field (a bad field falls back to its default, the rest is kept), with
 * time off that has already ended dropped (`today`, `YYYY-MM-DD` in the planner's zone). Null when there
 * is nothing usable.
 */
export function parseSetup(raw: string | null | undefined, today: string): RememberedSetup | null {
  if (!raw) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || o.v !== 1) return null;
  const d = setupDefaults();
  const h = (o.hours ?? {}) as Record<string, unknown>;
  const days = Array.isArray(h.days)
    ? [...new Set(h.days.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b)
    : d.hours.days;
  const dates = (v: unknown, fallback: TimeOffDates[]): TimeOffDates[] =>
    Array.isArray(v)
      ? (v as unknown[])
          .filter((w): w is TimeOffDates => {
            const x = w as Partial<TimeOffDates> | null;
            return !!x && typeof x.from === 'string' && typeof x.to === 'string' && YMD.test(x.from) && YMD.test(x.to);
          })
          .map(w => ({ from: w.from, to: w.to }))
          // Already over: dropped, so a trip from last month doesn't quietly change every answer.
          .filter(w => !(YMD.test(today) && w.to < today))
      : fallback;
  const timeOff = dates(o.timeOff, d.timeOff);
  const noPrestige = dates(o.noPrestige, d.noPrestige);
  return {
    v: 1,
    hours: {
      on: typeof h.on === 'boolean' ? h.on : d.hours.on,
      from: hour(h.from) ? h.from : d.hours.from,
      to: hour(h.to) ? h.to : d.hours.to,
      days,
    },
    holdShifts: typeof o.holdShifts === 'boolean' ? o.holdShifts : d.holdShifts,
    timeOff,
    noPrestige,
    firstAscension: isFirstAscension(o.firstAscension) ? o.firstAscension : d.firstAscension,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
  };
}

/** The same values (the time it was written aside). */
export function sameSetup(a: SetupValues, b: SetupValues): boolean {
  const pick = (s: SetupValues) =>
    JSON.stringify([s.hours, s.holdShifts, s.timeOff, s.firstAscension, s.noPrestige ?? []]);
  return pick(a) === pick(b);
}

/** Nothing but the defaults: the "Remembered for this account" line doesn't show. */
export function isDefaultSetup(s: SetupValues): boolean {
  return sameSetup(s, setupDefaults());
}

/** `base` with the groups in `edits` replaced, stamped `at`. */
export function mergeSetup(base: SetupValues, edits: Partial<SetupValues>, at: number): RememberedSetup {
  return {
    v: 1,
    hours: edits.hours
      ? { ...edits.hours, days: [...edits.hours.days] }
      : { ...base.hours, days: [...base.hours.days] },
    holdShifts: edits.holdShifts ?? base.holdShifts,
    timeOff: (edits.timeOff ?? base.timeOff).map(w => ({ from: w.from, to: w.to })),
    noPrestige: (edits.noPrestige ?? base.noPrestige ?? []).map(w => ({ from: w.from, to: w.to })),
    firstAscension: edits.firstAscension ?? base.firstAscension,
    at,
  };
}

/** Storage that may not be there (a private window, a test): every call is guarded. */
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSetup(key: string, today: string): RememberedSetup | null {
  try {
    return parseSetup(storage()?.getItem(key), today);
  } catch {
    return null;
  }
}
export function writeSetup(key: string, s: RememberedSetup): void {
  try {
    storage()?.setItem(key, JSON.stringify(s));
  } catch {
    // Full or private: this visit still has the settings.
  }
}
export function removeSetup(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // nothing to do
  }
}
