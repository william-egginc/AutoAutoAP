/**
 * @module saveAge
 * @description How a save older than the plan start is caught up, and when that stops being honest.
 *
 * THE RULE (2026-09-24). A plan starts NOW by default, not at the save's own timestamp, and the farm
 * is caught up from its last sync to the plan start at its current rate -- the same credit the game
 * gives for time away (Joo's catch-up, in `computeSnapshot` and `runContinueCurrent`). Until 10 Nov 2026 it stopped at
 * what the silos hold, as the game caps time away; Jordan had it follow Joo's engine instead: the whole time since the
 * sync is credited, and a stale save is the save-age banner's to say (lib/saveFreshness.ts).
 */
import { formatSiloTime, totalAwayTime } from '@/stores/silos';
import { compactDuration } from './duration';
import { SAVE_AGE_WORDS } from './saveAgeWords';

/** Seconds of time away the silos hold: silo count x the per-silo time Silo Capacity research sets. */
export function siloSeconds(
  siloCount: number | null | undefined,
  siloCapacityLevel: number | null | undefined
): number {
  return totalAwayTime(Math.max(1, siloCount || 1), siloCapacityLevel || 0) * 60;
}

/**
 * Seconds of offline progress to credit between a sync and a plan start: all of it, as Joo's engine/compute.ts does
 * (Jordan, 10 Nov 2026: "get rid of the amber box and just follow it like Joo's does"). It used to stop at what the
 * silos hold, as the game caps time away; a save older than that is the save-age banner's to say (lib/saveFreshness.ts).
 */
export function catchUpSeconds(syncSeconds: number, startSeconds: number): number {
  if (!(syncSeconds > 1e9) || !(startSeconds > syncSeconds)) return 0;
  return startSeconds - syncSeconds;
}

export interface SaveAgeNote {
  level: 'ok' | 'warning';
  text: string;
}

/**
 * A save's age in the one style every save-age line uses (ux review 26 Oct, row 19: Setup said "Save from 14 min
 * ago" and "Your save is 42m old", the stale warning "25d old", My runs "14 minutes ago"): now the one
 * compact duration (lib/duration, ux29-d): `14m`, `5h`, `25d`. Under a minute: `<1m`. Sign ignored.
 */
export function ageWords(seconds: number): string {
  return compactDuration(seconds);
}

/** `14m ago`, `5h ago`, `25d ago`; `just now` under a minute. */
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
  if (!hasVirtueFarm && gap >= 15 * 60) return { level: 'ok', text: SAVE_AGE_WORDS.noVirtueFarm() };
  if (Math.abs(gap) < 15 * 60) return { level: 'ok', text: SAVE_AGE_WORDS.atSync() };
  if (gap < 0) return { level: 'warning', text: SAVE_AGE_WORDS.beforeSync(ageWords(gap)) };
  // However long the gap (no cap at the silos, 10 Nov 2026): the words are in lib/saveAgeWords.ts (outside the result code hash).
  // How old the SAVE is, is the save-age banner's (lib/saveFreshness.ts).
  return { level: 'ok', text: SAVE_AGE_WORDS.caughtUp(formatSiloTime(Math.round(silo / 60))) };
}
