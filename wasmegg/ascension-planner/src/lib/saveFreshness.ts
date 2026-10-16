/**
 * My runs' save-age strip (spec "myruns-now" section 1): how old the loaded save is, because every time on the page
 * comes from it. Green under `SAVE_AMBER_HOURS`, amber to `SAVE_RED_HOURS`, red past it (Jordan, 15 Oct 2026: 6 h
 * and 24 h, "we will see what players think"). Pure: the clock is a parameter.
 */
import { agoLong, dateAt } from './eventWhen';

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
    const days = Math.floor(age / 86400);
    const old = days >= 2 ? `${days} days old` : `${Math.round(age / 3600)} hours old`;
    return {
      tone: 'bad',
      text: `Your save is ${old} (${when}). The times below are from that save and probably wrong now: some of them have already passed.`,
      link: 'Load a fresh save before you rely on them',
    };
  }
  if (age >= SAVE_AMBER_HOURS * 3600)
    return {
      tone: 'warn',
      text: `Your save is from ${when} (${agoLong(age)}). Times below may have drifted.`,
      link: 'Load a fresh save',
    };
  return { tone: 'ok', text: `Your save is from ${when} (${agoLong(age)}).`, link: 'Load a fresh one' };
}
