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
  targetTE: string;
  deferForEarningsMode?: boolean;
  /** The time-off cuts for `targetTE`, so a reload doesn't turn a cut into a real prestige. */
  timeOffCuts?: TimeOffCuts | null;
}

export function loadAutoPlannerSchedule(): Partial<AutoPlannerScheduleCache> | null {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
