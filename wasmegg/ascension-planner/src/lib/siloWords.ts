/**
 * How long a waiting farm keeps laying, in the player's words (no-prestige days: components/auto/TimeOffEditor.vue,
 * components/auto/InstantRoute.vue). The silos run out (they don't fill): with the player away the farm lays for as
 * long as its silos hold, then stops. The figure is the save's own silo time (lib/saveAge.ts `siloSeconds`, the same
 * model as the catch-up and search/noPrestige.ts `creditedWaitSeconds`), left out when there is no save to read.
 * Pure.
 */
import { siloSeconds } from './saveAge';

/** The save's silo time in seconds, or null without a virtue farm in the save (no silo count to read). */
export function knownSiloSeconds(
  farm: { numSilos?: number | null } | null | undefined,
  siloCapacityLevel: number | null | undefined
): number | null {
  if (!farm || !(Number(farm.numSilos) > 0)) return null;
  return siloSeconds(farm.numSilos, siloCapacityLevel);
}

/** 'until its silos run out', with '(about N h with yours)' when the save's silo time is known. */
export function siloRunOutWords(seconds: number | null | undefined): string {
  const base = 'until its silos run out';
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || !(seconds > 0)) return base;
  const h = Math.max(1, Math.round(seconds / 3600));
  return `${base} (about ${h} h with yours)`;
}
