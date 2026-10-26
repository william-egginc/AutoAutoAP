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
export function siloSeconds(
  siloCount: number | null | undefined,
  siloCapacityLevel: number | null | undefined
): number {
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
  /** Older than the silos hold: the answers are wrong, not just uncertain. Shown in red. */
  severe?: boolean;
}

const NEWER_SYNC = " If you've opened the game since then and have a newer sync, this might not be accurate.";

/**
 * A save's age in the one style every save-age line uses (ux review 26 Oct, row 19: Setup said "Save from 14 min
 * ago" and "Your save is 42m old", the stale warning "25d old", My runs "14 minutes ago"): `14 min`, `5 h`,
 * `25 days`. Under a minute: `under a minute`. Sign ignored.
 */
export function ageWords(seconds: number): string {
  const s = Math.abs(seconds);
  if (s < 60) return 'under a minute';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = s / 3600;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.floor(h / 24)} days`;
}

/** `14 min ago`, `5 h ago`, `25 days ago`; `just now` under a minute. */
export function ageAgo(seconds: number): string {
  return Math.abs(seconds) < 60 ? 'just now' : `${ageWords(seconds)} ago`;
}

/**
 * What to tell the player about the gap between their save and the plan start. Null when there is
 * no save to compare with.
 */
export function describeSaveAge(
  syncSeconds: number | null | undefined,
  startSeconds: number | null | undefined,
  silo: number,
  /** False when the save has no virtue farm in progress: nothing is caught up, so silos do not apply. */
  hasVirtueFarm = true
): SaveAgeNote | null {
  if (!syncSeconds || !(syncSeconds > 1e9) || !startSeconds || !Number.isFinite(startSeconds)) return null;
  const gap = startSeconds - syncSeconds;
  if (!hasVirtueFarm && gap >= 15 * 60) {
    return {
      level: 'ok',
      // No age here: Setup's save card says it once ("Save from 14 min ago", ux review 26 Oct, row 19).
      text: `Your save has no virtue farm in progress, so there is nothing to catch up: the plan starts with a fresh ascension.`,
    };
  }
  const silos = formatSiloTime(Math.round(silo / 60));
  if (Math.abs(gap) < 15 * 60) {
    return {
      level: 'ok',
      text: 'Starts at your last sync, so the farm being simulated and the clock agree.' + NEWER_SYNC,
    };
  }
  if (gap < 0) {
    return {
      level: 'warning',
      text: `Starts ${ageWords(gap)} before your last sync, so the plan begins before the farm state it uses existed.`,
    };
  }
  if (gap <= silo) {
    return {
      level: 'ok',
      // No age here either (the save card has it); the gap runs to the plan start, which may be later than now.
      text: `The farm is caught up from your save to the plan start at its current rate, the way the game credits time away (your silos hold ${silos}).${NEWER_SYNC} Anything you bought since is not in it; sync and reload if you have played.`,
    };
  }
  return {
    level: 'warning',
    severe: true,
    text: `Your save is ${ageWords(gap)} old, longer than your silos hold (${silos}), so the answers here won't be accurate. Force a sync: open Egg, Inc., let it sync, then reload this page (or press Load latest save).`,
  };
}
