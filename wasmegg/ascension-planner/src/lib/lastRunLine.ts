/**
 * The plain line at the top of a kept result card (Jordan, 24 Oct 2026; "YOUR LAST RUN · OCT 23, 2026 AT 6:43 PM"
 * didn't say when the search ran): "This Fast search ran on Oct 23 at 6:43 pm, on your save of Oct 23 at 1:03 am,
 * and found 307 TE." Each piece that isn't known is left out; "(older save than the one loaded now)" follows the
 * save when the loaded save is newer. Times in the plan's zone, 12-hour with am/pm.
 */
import { dayClockShort } from './eventWhen';
import { rowFoundLevel } from './instantBaseline';
import type { FoundLevel } from './searchPointer';

export interface LastRunLineInput {
  /** The run's level as stored: quick, normal, thorough, exhaustive (or a space / By a date's advanced mode: Custom). */
  level?: string | null;
  space?: unknown;
  /** When the run finished, ms. */
  at: number;
  /** The save it priced: its own time, seconds (0 or absent: not known). */
  saveAt?: number | null;
  /** The save loaded now: its time, seconds. */
  loadedSaveAt?: number | null;
  /** TE the run found. */
  te: number;
  zone: string;
  /** Now, seconds (the year is named only when it differs). */
  now: number;
}

export function foundLevelOf(level: string | null | undefined, space?: unknown): FoundLevel | null {
  return rowFoundLevel({ level: level ?? undefined, effort: level ?? undefined, space });
}

export function lastRunLine(o: LastRunLineInput): string {
  const ranAt = dayClockShort(Math.floor(o.at / 1000), o.now, o.zone);
  if (!ranAt) return '';
  const level = foundLevelOf(o.level, o.space);
  const lead = level ? `This ${level} search ran on ${ranAt}` : `This search ran on ${ranAt}`;
  const save = o.saveAt && o.saveAt > 1e9 ? dayClockShort(o.saveAt, o.now, o.zone) : '';
  const older = save && o.loadedSaveAt && o.loadedSaveAt > o.saveAt! ? ' (older save than the one loaded now)' : '';
  const saveWords = save ? `, on your save of ${save}${older}` : '';
  const found = o.te > 0 ? `, and found ${Math.floor(o.te)} TE` : '';
  return `${lead}${saveWords}${found}.`;
}
