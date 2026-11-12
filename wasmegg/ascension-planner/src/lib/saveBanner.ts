/**
 * THE SAVE BANNER, ONLY WHEN THE SILOS ARE LOW (spec-myruns-fix, Jordan 12 Nov 2026): the amber "Getting old" (and red)
 * save banner shows only when the save's silo estimate is under SAVE_BANNER_SILO_HOURS, not just because the save is
 * old: in practice the silos can be fresh while the save isn't, so the save alone can't tell.
 *
 * The silo estimate is the one lib/saveFreshness.ts `saveState` already works out (`siloLeftSeconds`: the virtue farm's
 * silo time less the time since it last ran; null without a virtue farm). The rule, on top of saveState's tone:
 *   - silos under 6 h left AND saveState's tone amber or red: the banner, in that tone, with Words' one blurb
 *     (lib/saveFreshnessWords.ts: SAVE_LOW_SILOS_LEAD as the headline, SAVE_LOW_SILOS_DO under it);
 *   - otherwise the quiet line (the save's age), as for a green save: saveState again with silos that never run low, so
 *     its words are saveState's own;
 *   - so a fresh save over small silos stays green as before (with two silos or fewer there is always under 6 h), and
 *     with no virtue farm there is no silo estimate and never a banner;
 *   - the clock-behind state ("Check your clock") is not this banner: unchanged.
 * Details, "Why is my save out of date?" and the run notes (saveState's `runNote`) are unchanged.
 *
 * Not a result-hash input (lib/resultCodeHash.ts: nothing hashed imports it); saveFreshness.ts, which is, is unchanged.
 */
import { saveState, type SaveState, type SaveStateInput } from './saveFreshness';
import { SAVE_LOW_SILOS_DO, SAVE_LOW_SILOS_LEAD } from './saveFreshnessWords';

/** The banner shows only with fewer hours than this of silo time left (Jordan, 12 Nov 2026). */
export const SAVE_BANNER_SILO_HOURS = 6;

/** The save banner's state: `saveState` with the silo rule above. Null without a save time. Pure. */
export function saveBannerState(i: SaveStateInput): SaveState | null {
  const s = saveState(i);
  if (!s || s.clockBehindSeconds || s.tone === 'green') return s;
  const low = s.siloLeftSeconds != null && s.siloLeftSeconds < SAVE_BANNER_SILO_HOURS * 3600;
  if (low) return { ...s, headline: SAVE_LOW_SILOS_LEAD, reason: SAVE_LOW_SILOS_DO };
  const quiet = saveState({ ...i, siloSeconds: Number.POSITIVE_INFINITY });
  if (!quiet) return s;
  return {
    ...quiet,
    siloUsedSeconds: s.siloUsedSeconds,
    siloLeftSeconds: s.siloLeftSeconds,
    siloSeconds: s.siloSeconds,
    fractionUsed: s.fractionUsed,
    details: s.details,
    runNote: s.runNote,
  };
}
