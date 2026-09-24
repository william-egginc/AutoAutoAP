/**
 * @module saveAge
 * @description How a save older than the plan start is caught up, and when that stops being honest.
 *
 * THE RULE (2026-09-24). A plan starts NOW by default, not at the save's own timestamp, and the farm
 * is caught up from its last sync to the plan start at its current rate -- the same credit the game
 * gives for time away (Joo's catch-up, in `computeSnapshot` and `runContinueCurrent`). The game only
 * credits time away up to what the silos hold, so the catch-up stops there too. A save older than
 * that is suspicious in itself: either the sync is stale, or the player has been playing since and
 * the save no longer describes the farm. That gets a warning, never a silent guess.
 */
import { formatSiloTime, totalAwayTime } from '@/stores/silos';

/** Seconds of time away the silos hold: silo count x the per-silo time Silo Capacity research sets. */
export function siloSeconds(siloCount: number | null | undefined, siloCapacityLevel: number | null | undefined): number {
  return totalAwayTime(Math.max(1, siloCount || 1), siloCapacityLevel || 0) * 60;
}

/** Seconds of offline progress to credit between a sync and a plan start: capped at the silos. */
export function catchUpSeconds(syncSeconds: number, startSeconds: number, silo: number): number {
  if (!(syncSeconds > 1e9) || !(startSeconds > syncSeconds)) return 0;
  return Math.min(startSeconds - syncSeconds, Math.max(0, silo));
}

export interface SaveAgeNote {
  level: 'ok' | 'warning';
  text: string;
}

/** `45m`, `6h`, `3d`. */
function short(seconds: number): string {
  const h = Math.abs(seconds) / 3600;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * What to tell the player about the gap between their save and the plan start. Null when there is
 * no save to compare with.
 */
export function describeSaveAge(
  syncSeconds: number | null | undefined,
  startSeconds: number | null | undefined,
  silo: number
): SaveAgeNote | null {
  if (!syncSeconds || !(syncSeconds > 1e9) || !startSeconds || !Number.isFinite(startSeconds)) return null;
  const gap = startSeconds - syncSeconds;
  const silos = formatSiloTime(Math.round(silo / 60));
  if (Math.abs(gap) < 15 * 60) {
    return { level: 'ok', text: 'Starts at your last sync, so the farm being simulated and the clock agree.' };
  }
  if (gap < 0) {
    return {
      level: 'warning',
      text: `Starts ${short(gap)} before your last sync, so the plan begins before the farm state it uses existed.`,
    };
  }
  if (gap <= silo) {
    return {
      level: 'ok',
      text: `Your save is ${short(gap)} old. The farm is caught up to the plan start at its current rate, the way the game credits time away (your silos hold ${silos}). Anything you bought since is not in it; sync and reload if you have played.`,
    };
  }
  return {
    level: 'warning',
    text: `Your save is ${short(gap)} old, longer than your silos hold (${silos}), so only ${silos} of it is caught up: the farm stops filling once the silos are full. Either this sync is old or something was missed. Sync in the game and reload for a true start.`,
  };
}
