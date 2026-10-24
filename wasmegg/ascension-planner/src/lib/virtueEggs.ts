/**
 * The save's virtue egg numbers (a farm's `eggType`, 50..54) and the names players read. A copy of
 * search/leg.ts's private VIRTUE_EGGS_MAP (left untouched there), for pages that read the save without the
 * simulator: My runs' Right now card. virtueEggs.spec.ts checks the two agree.
 */
import { VIRTUE_EGG_NAMES, type VirtueEgg } from '@/types';

export const VIRTUE_EGG_BY_TYPE: Readonly<Record<number, VirtueEgg>> = {
  50: 'curiosity',
  51: 'integrity',
  52: 'humility',
  53: 'resilience',
  54: 'kindness',
};

/** The virtue egg a farm lays, or null for any other egg (a home farm, a contract). */
export function virtueEggOf(eggType: number | null | undefined): VirtueEgg | null {
  return eggType != null ? (VIRTUE_EGG_BY_TYPE[eggType] ?? null) : null;
}

/** "Integrity"; the word itself, capitalised, for anything unknown. */
export function virtueEggName(egg: string | null | undefined): string {
  if (!egg) return '';
  return (VIRTUE_EGG_NAMES as Record<string, string>)[egg] ?? egg.charAt(0).toUpperCase() + egg.slice(1);
}

/** The game's number for an egg (for its picture, `egginc/egg_<n>.png`), or null. */
export function virtueEggType(egg: string | null | undefined): number | null {
  for (const [n, e] of Object.entries(VIRTUE_EGG_BY_TYPE)) if (e === egg) return Number(n);
  return null;
}

/**
 * A virtue egg's picture, the path `iconURL(path, 64)` takes: `egginc/egg_<name>.png`, by the egg's NAME
 * (`egg_integrity.png`), never its number and never a `virtue` variant. Mirrors exactly what the app already shows:
 * FloatingStats.vue (`iconURL(\`egginc/egg_${currentEgg}.png\`, 64)`, the Manual planner's current egg),
 * ShiftActions.vue, AscensionOverview.vue, lib/missions.ts `virtueEggIconPath`, and the shared lib's
 * `eggIconPath(ei.Egg.CURIOSITY..KINDNESS)` (lib/eggs.ts). virtueEggs.spec.ts lists all five. Every egg picture on
 * My runs goes through here. Null for anything that isn't a virtue egg.
 */
export function eggIconPath(egg: string | null | undefined): string | null {
  return virtueEggType(egg) != null ? `egginc/egg_${egg}.png` : null;
}
