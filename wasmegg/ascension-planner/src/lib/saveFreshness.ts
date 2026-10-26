/**
 * My runs' save-age strip (spec "myruns-now" section 1): how old the loaded save is, because every time on the page
 * comes from it. Neutral (slate, not answer-green) under `SAVE_AMBER_HOURS`, amber to `SAVE_RED_HOURS`, red past it (Jordan, 15 Oct 2026: 6 h
 * and 24 h, "we will see what players think"). Pure: the clock is a parameter.
 */
import { dateAt } from './eventWhen';
import { ageAgo, ageWords } from './saveAge';
import { countTEThresholdsPassed } from './truthEggs';

/** Past this many hours the strip turns amber: the times below may have drifted. */
export const SAVE_AMBER_HOURS = 6;
/** Past this many hours it turns red: some of the times have probably passed. */
export const SAVE_RED_HOURS = 24;

export interface SaveStrip {
  tone: 'ok' | 'warn' | 'bad';
  text: string;
  /** The link's words. */
  link: string;
}

/** Null without a save time. `backupSeconds`: the save's `lastBackupTime`. */
export function saveStrip(backupSeconds: number | null | undefined, nowSeconds: number, zone: string): SaveStrip | null {
  if (!backupSeconds || !(backupSeconds > 1e9)) return null;
  const age = nowSeconds - backupSeconds;
  const when = dateAt(backupSeconds, nowSeconds, zone);
  if (age >= SAVE_RED_HOURS * 3600) {
    // One age style with Setup and the stale-save warning (lib/saveAge.ts `ageWords`: "30 h", "3 days").
    const old = `${ageWords(age)} old`;
    return {
      tone: 'bad',
      text: `Your save is ${old} (${when}). The times below are from that save and probably wrong now: some of them have already passed.`,
      link: 'Load a fresh save before you rely on them',
    };
  }
  if (age >= SAVE_AMBER_HOURS * 3600)
    return {
      tone: 'warn',
      text: `Your save is from ${when} (${ageAgo(age)}). Times below may have drifted.`,
      link: 'Load a fresh save',
    };
  return { tone: 'ok', text: `Your save is from ${when} (${ageAgo(age)}).`, link: 'Load a fresh one' };
}

/** What the save itself says, read straight from it (the raw backup), not from the planner's stores. */
interface RawSave {
  settings?: { lastBackupTime?: number | null } | null;
  approxTime?: number | null;
  virtue?: { eovEarned?: (number | null)[] | null; eggsDelivered?: (number | null)[] | null } | null;
}

/**
 * The save's own time (unix seconds): `settings.lastBackupTime`, else `approxTime`, as the initial-state store's
 * `loadFromBackup` reads it; 0 without one. On a page load the store can hold the Manual planner's restored
 * draft, whose `lastBackupTime` is always 0 (stores/actions/io.ts `exportPlanData`), beside the save itself.
 */
export function backupSecondsOf(raw: unknown): number {
  const r = raw as RawSave | null | undefined;
  const t = r?.settings?.lastBackupTime || r?.approxTime || 0;
  return typeof t === 'number' && t > 1e9 ? t : 0;
}

/**
 * The save's own TE by virtue egg (Curiosity, Integrity, Humility, Resilience, Kindness): the claimed TE or the
 * thresholds passed, whichever is more, capped at 98 (pending Truth Eggs counted, as the planner counts them once it
 * sets the save up, and as a sent row's `backupTE`). Five zeros without a save. Not the initial-state store's
 * `initialTeEarned`: after an account switch that is the CLAIMED TE only (`loadFromBackup` without
 * `rollUpPendingTE`), and on a page load it can be a restored Manual draft's (ui fix 21).
 */
export function saveTEByEggOf(raw: unknown): number[] {
  const v = (raw as RawSave | null | undefined)?.virtue;
  const earned = v?.eovEarned ?? [];
  const delivered = v?.eggsDelivered ?? [];
  const out: number[] = [];
  for (let i = 0; i < 5; i++)
    out.push(v ? Math.min(98, Math.max(earned[i] ?? 0, countTEThresholdsPassed(delivered[i] ?? 0))) : 0);
  return out;
}

/** The save's own TE: `saveTEByEggOf` summed. 0 without a save. */
export function saveTEOf(raw: unknown): number {
  return saveTEByEggOf(raw).reduce((a, b) => a + b, 0);
}
