/**
 * THE SAVE STRIP AND THE SILO LINE (Jordan, 12 Nov 2026; replaces 9a994dfcf's "the banner only with under 6 h of silos"):
 * the silos get their own small line, and the save strip stays small and quiet at any age.
 *
 * The save strip (`saveBannerState`, shown by myruns/SaveAgeStrip.vue): always the quiet line, the save's age, as for a
 * green save (lib/saveFreshness.ts `saveState` again with silos that never run low, so its words are saveState's own),
 * never the big amber or red box. On top: `old` (saveState's own tone, both clocks, is not green) brings back "Why is my
 * save out of date?" and Details; `outOfDate` (the save past a day, SYNC_AFTER_SECONDS) makes its text amber. The
 * clock-behind state ("Check your clock") is not this and is unchanged.
 *
 * The silo line (`siloLineState`, layout/SiloLine.vue): with a virtue farm, always; when its silos run out, as of the
 * save: the farm's last run plus its silo time (saveState's `siloUsedSeconds` and `siloSeconds`: now - used + S), Words'
 * words (lib/saveFreshnessWords.ts `siloLine`), low (amber) with under SILO_LINE_LOW_FRACTION of the silo time left.
 *
 * Not a result-hash input (lib/resultCodeHash.ts: nothing hashed imports it); saveFreshness.ts, which is, is unchanged.
 */
import { SYNC_AFTER_SECONDS, saveState, toneLines, type SaveState, type SaveStateInput } from './saveFreshness';
import { ageWords } from './saveAge';
import { dateAt } from './eventWhen';
import { calendarOf, formatClock } from './clock';
import { quietSaveWord, saveAgeLine, siloLine, siloWarningFresh, thresholdsDetail } from './saveFreshnessWords';

/** The silo line turns amber with under this share of the silo time left (Jordan, 12 Nov 2026: 30%). Details says it as
 *  lib/saveFreshnessWords.ts SILO_AMBER_PERCENT_WORDS; a spec pins the two equal. */
export const SILO_LINE_LOW_FRACTION = 0.3;

/** The silo warning (low or already run out) is for a fresh save only: under this age (17 Nov 2026, Jordan). Older than an
 *  hour, the player has likely opened the game since, which refills the silos, so the line just says the save's age. One
 *  hour is also where the save strip first turns yellow (saveFreshness.ts TONE_FLOOR_SECONDS); a spec pins the two equal. */
export const FRESH_SAVE_SECONDS = 3600;

/** The save strip's state: saveState's, with `old` (Why and Details shown) and `outOfDate` (amber text). */
export type SaveBannerState = SaveState & { old?: boolean; outOfDate?: boolean };

/** The silo line: its words, and whether it is low (amber) and already gone by. */
export interface SiloLineState {
  text: string;
  low: boolean;
  past: boolean;
  /** The line is only the save's age ("Save from 10:53 AM, 2h ago", a save that is not fresh): where the save strip already says it
   *  (Fastest, By a date, Single run) the line is left out. */
  age?: boolean;
}

/**
 * The save banner's state: `saveState` with the silo rule above. Null without a save time. Pure. Its Details sentence about
 * the thresholds is `thresholdsDetail` (lib/saveFreshnessWords.ts); saveFreshness.ts, which is hashed, no longer has one.
 */
export function saveBannerState(i: SaveStateInput): SaveBannerState | null {
  const s = bannerStateOf(i);
  if (!s) return s;
  const lines = toneLines(s.siloSeconds);
  const sentence = thresholdsDetail(ageWords(lines.yellowAt), ageWords(lines.redAt), s.clockBehindSeconds > 0);
  // The thresholds sentence is not in saveFreshness.ts any more (hash change, 14 Nov 2026): it goes in here, before the
  // catch-up line when there is one, else last.
  const at = s.details.findIndex(d => d.startsWith('Catch-up'));
  const details = [...s.details];
  details.splice(at < 0 ? details.length : at, 0, sentence);
  return { ...s, details };
}

function bannerStateOf(i: SaveStateInput): SaveBannerState | null {
  const s = saveState(i);
  if (!s || s.clockBehindSeconds) return s;
  // The quiet line's screen-reader word says the save's age, never "Up to date" over a save that is hours old.
  const quietWord = quietSaveWord(ageWords(s.saveAgeSeconds));
  const outOfDate = s.saveAgeSeconds > SYNC_AFTER_SECONDS;
  const flags = { old: s.tone !== 'green' || outOfDate, outOfDate };
  if (s.tone === 'green') return { ...s, word: quietWord, ...flags };
  const quiet = saveState({ ...i, siloSeconds: Number.POSITIVE_INFINITY });
  if (!quiet) return s;
  return {
    ...quiet,
    word: quietWord,
    siloUsedSeconds: s.siloUsedSeconds,
    siloLeftSeconds: s.siloLeftSeconds,
    siloSeconds: s.siloSeconds,
    fractionUsed: s.fractionUsed,
    details: s.details,
    runNote: s.runNote,
    ...flags,
  };
}

function ageLineOf(s: SaveState, nowSeconds: number, zone: string): string {
  const at = nowSeconds - s.saveAgeSeconds;
  const same = calendarOf(at * 1000, zone)?.ymd === calendarOf(nowSeconds * 1000, zone)?.ymd;
  const time = same ? formatClock(at * 1000, zone) : dateAt(at, nowSeconds, zone);
  return saveAgeLine(time, ageWords(s.saveAgeSeconds));
}

/** The save's age line for My runs' player line (17 Nov 2026, Jordan's rule: state the age unless the save is fresh AND its silos
 *  are low): any save over FRESH_SAVE_SECONDS old with the clock not behind it, whatever the silos; else null. Pure. */
export function saveAgeOnlyLine(s: SaveState | null, nowSeconds: number, zone: string): string | null {
  if (!s || s.clockBehindSeconds || !(s.saveAgeSeconds >= FRESH_SAVE_SECONDS)) return null;
  return ageLineOf(s, nowSeconds, zone);
}

/** The silo line for a save state (above); null without a virtue farm (no silo estimate). Pure. */
export function siloLineState(s: SaveState | null, nowSeconds: number, zone: string): SiloLineState | null {
  if (!s || s.siloUsedSeconds == null || !(s.siloSeconds > 0) || !Number.isFinite(s.siloSeconds)) return null;
  const runOut = nowSeconds - s.siloUsedSeconds + s.siloSeconds;
  const left = runOut - nowSeconds;
  const past = left <= 0;
  const low = left < SILO_LINE_LOW_FRACTION * s.siloSeconds;
  // Not fresh (or its true age unknown: the clock looks behind): no warning, just the save's age.
  const fresh = !s.clockBehindSeconds && s.saveAgeSeconds < FRESH_SAVE_SECONDS;
  const when = dateAt(runOut, nowSeconds, zone);
  if ((low || past) && !fresh) {
    if (s.clockBehindSeconds) return when ? { text: siloLine({ when, low: false }), low: false, past: false } : null;
    return { text: ageLineOf(s, nowSeconds, zone), low: false, past: false, age: true };
  }
  if (!when) return null;
  // Fresh and low (or run out): Words' short warning, with no "if you've opened the game since" hedge (a fresh save has had no time to go stale).
  return { text: low || past ? siloWarningFresh({ when, past }) : siloLine({ when }), low, past };
}
