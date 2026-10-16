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
