/**
 * @module autoPlannerFormCache
 * @description localStorage-backed persistence for the Auto-AP input form (start
 * date/time/timezone, target TE(s), and per-egg starting TE inputs), so the form
 * survives a full page reload instead of resetting every time. Follows the same
 * bare localStorage pattern used elsewhere in this app (see useResearchViews.ts).
 */

import type { VirtueEgg } from '@/types';
import type { TimeOffCuts } from '@/stores/autoPlanner';
import type { AutoLoadoutInputs } from '@/auto/loadout/types';
import { sanitizeTEOverride } from '@/lib/loadoutInputsGuard';

const SCHEDULE_STORAGE_KEY = 'auto_planner_schedule_v1';
// v2: only written while the TE override is on (v1 cached every edit, including ones matching the
// backup), so a v1 entry can't tell us whether the user meant to override.
const TE_INPUTS_STORAGE_KEY_PREFIX = 'auto_planner_te_inputs_v2';

export interface AutoPlannerScheduleCache {
  timezone: string;
  startDate: string;
  startTime: string;
  /** Absent in caches written before the start-time override existed — treated as "now". */
  startTimeOverride?: boolean;
  /** The account (a hash, runSaves.ts `accountOf`) whose start this is; another account's save drops it. */
  startAccount?: string;
  targetTE: string;
  deferForEarningsMode?: boolean;
  /** The time-off cuts for `targetTE`, so a reload doesn't turn a cut into a real prestige. */
  timeOffCuts?: TimeOffCuts | null;
}

export function loadAutoPlannerSchedule(): Partial<AutoPlannerScheduleCache> | null {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    return raw ? checkSchedule(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const isKnownTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
/** A real calendar date, YYYY-MM-DD (Date.UTC would roll 2026-13-40 over into a later one). */
const isDate = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const isTime = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const isTimes = (v: unknown): boolean =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).every(t => typeof t === 'number' && Number.isFinite(t));
const isCuts = (v: unknown): boolean => {
  if (v === null) return true;
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.targets === 'string' &&
    isTimes(c.ends) &&
    isTimes(c.starts) &&
    (c.start === undefined || typeof c.start === 'string')
  );
};
/** '' is what a patch writes for an empty box (`patchAutoPlannerSchedule`), so it passes. */
const SCHEDULE_FIELDS: Record<keyof AutoPlannerScheduleCache, (v: unknown) => boolean> = {
  timezone: v => v === '' || (typeof v === 'string' && v.length <= 64 && isKnownTimeZone(v)),
  startDate: v => v === '' || (typeof v === 'string' && isDate(v)),
  startTime: v => v === '' || (typeof v === 'string' && isTime(v)),
  startTimeOverride: v => typeof v === 'boolean',
  startAccount: v => typeof v === 'string' && v.length <= 128,
  targetTE: v => typeof v === 'string' && v.length <= 500,
  deferForEarningsMode: v => typeof v === 'boolean',
  timeOffCuts: isCuts,
};

/**
 * The saved form, each field checked (red team 6 Nov 2026, R3): a time zone this browser doesn't know, or a
 * start date or time that isn't one, went into the store as it was and the plan start threw on it, on every
 * reload. A bad field is dropped (and the console says which); the others are kept. Fields this build doesn't
 * know are dropped too.
 */
function checkSchedule(raw: unknown): Partial<AutoPlannerScheduleCache> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [field, value] of Object.entries(raw)) {
    const ok = (SCHEDULE_FIELDS as Partial<Record<string, (v: unknown) => boolean>>)[field];
    if (value === undefined) continue;
    if (ok?.(value)) out[field] = value;
    else if (ok) dropped.push(field);
  }
  if (dropped.length) console.warn(`The saved Auto Planner form had a bad ${dropped.join(', ')}; dropped it.`);
  return out as Partial<AutoPlannerScheduleCache>;
}

export function saveAutoPlannerSchedule(data: AutoPlannerScheduleCache): void {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota/privacy-mode errors — persistence is a nicety, not a requirement.
  }
}

/**
 * Update some of the saved form without the Auto Planner being open. For a search result applied
 * from elsewhere (Insane's "Build this plan", the leaderboard): the planner restores the saved form
 * every time it mounts, so without this it put back whatever was typed on the last visit over the
 * plan just applied.
 */
export function patchAutoPlannerSchedule(patch: Partial<AutoPlannerScheduleCache>): void {
  const current = loadAutoPlannerSchedule() ?? {};
  saveAutoPlannerSchedule({
    timezone: '',
    startDate: '',
    startTime: '',
    targetTE: '',
    ...current,
    ...patch,
  });
}

export interface AutoPlannerTEInputsCache {
  /** The TE override's claimed TE per egg. */
  teEarned: Record<VirtueEgg, number>;
}

function teInputsStorageKey(playerId: string): string {
  return `${TE_INPUTS_STORAGE_KEY_PREFIX}:${playerId}`;
}

/**
 * The TE override saved for this player, checked (lib/loadoutInputsGuard.ts), or null. Read every time
 * an account is set up rather than once per page load (spec-joo-fcc9, 22 Oct 2026): since v2 the cache
 * only ever holds the override the player set and is cleared when they remove it, so it can't be staler
 * than the store, and reading it once per page meant switching to another account and back lost it
 * until the next reload (the same save opened with two different starting TEs).
 */
export function loadAutoPlannerTEOverride(playerId: string): Record<VirtueEgg, number> | null {
  if (!playerId) return null;
  try {
    const raw = localStorage.getItem(teInputsStorageKey(playerId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const teEarned = parsed && typeof parsed === 'object' ? (parsed as { teEarned?: unknown }).teEarned : null;
    return sanitizeTEOverride(teEarned);
  } catch {
    return null;
  }
}

/**
 * Persists the TE override for this player, or clears it (`null`) when the override is removed.
 * Call this only from actual user actions (editing a TE field, adding/removing the override) —
 * never from a generic watcher — so values that changed for other reasons (plan import, Chain
 * Finder handoff) don't get cached as if they were user input.
 */
export function saveAutoPlannerTEInputs(playerId: string, data: AutoPlannerTEInputsCache | null): void {
  if (!playerId) return;
  try {
    if (data) localStorage.setItem(teInputsStorageKey(playerId), JSON.stringify(data));
    else localStorage.removeItem(teInputsStorageKey(playerId));
  } catch {
    // Ignore quota/privacy-mode errors — persistence is a nicety, not a requirement.
  }
}

const LOADOUT_INPUTS_STORAGE_KEY_PREFIX = 'auto_planner_loadout_inputs_v1';
const consumedLoadoutPlayerIds = new Set<string>();

function loadoutInputsStorageKey(playerId: string): string {
  return `${LOADOUT_INPUTS_STORAGE_KEY_PREFIX}:${playerId}`;
}

/**
 * Cached artifact/stone setup inputs for this player, consumed once per page load (the contract the TE
 * inputs had before Joo's override, fcc9e764).
 */
export function consumeAutoPlannerLoadoutInputs(playerId: string): AutoLoadoutInputs | null {
  if (!playerId || consumedLoadoutPlayerIds.has(playerId)) return null;
  consumedLoadoutPlayerIds.add(playerId);
  try {
    const raw = localStorage.getItem(loadoutInputsStorageKey(playerId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Persists artifact/stone setup inputs. Like `saveAutoPlannerTEInputs`, call only from user edits. */
export function saveAutoPlannerLoadoutInputs(playerId: string, data: AutoLoadoutInputs | null): void {
  if (!playerId) return;
  try {
    if (data) localStorage.setItem(loadoutInputsStorageKey(playerId), JSON.stringify(data));
    else localStorage.removeItem(loadoutInputsStorageKey(playerId));
  } catch {
    // Ignore quota/privacy-mode errors — persistence is a nicety, not a requirement.
  }
}
