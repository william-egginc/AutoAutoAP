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
import { quietSaveWord, siloLine, thresholdsDetail } from './saveFreshnessWords';

/** The silo line turns amber with under this share of the silo time left (Jordan, 12 Nov 2026: 30%). Details says it as
 *  lib/saveFreshnessWords.ts SILO_AMBER_PERCENT_WORDS; a spec pins the two equal. */
export const SILO_LINE_LOW_FRACTION = 0.3;

/** The save strip's state: saveState's, with `old` (Why and Details shown) and `outOfDate` (amber text). */
export type SaveBannerState = SaveState & { old?: boolean; outOfDate?: boolean };

/** The silo line: its words, and whether it is low (amber) and already gone by. */
export interface SiloLineState {
  text: string;
  low: boolean;
  past: boolean;
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

/** The silo line for a save state (above); null without a virtue farm (no silo estimate). Pure. */
export function siloLineState(s: SaveState | null, nowSeconds: number, zone: string): SiloLineState | null {
  if (!s || s.siloUsedSeconds == null || !(s.siloSeconds > 0) || !Number.isFinite(s.siloSeconds)) return null;
  const runOut = nowSeconds - s.siloUsedSeconds + s.siloSeconds;
  const left = runOut - nowSeconds;
  const past = left <= 0;
  const low = left < SILO_LINE_LOW_FRACTION * s.siloSeconds;
  const when = dateAt(runOut, nowSeconds, zone);
  return when ? { text: siloLine({ when, past, low }), low, past } : null;
}
