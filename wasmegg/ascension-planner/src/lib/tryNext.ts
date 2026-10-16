/**
 * My runs' "Try next" (spec myruns-now v3, section 5): at most four one-click runs, each opening its screen set up
 * (App.vue `openFromMyRuns`); the player presses Find there. Nothing starts from here. Picked from what the two
 * saved-answer tiles already say:
 *
 *   Egg Day, Fast                  Egg Day has no search behind it yet
 *   Exact on my 490 route          the race has no Exact-or-stronger search yet
 *   Exhaustive (around N asc)      the race has no Exhaustive yet; N = the answer's ascensions (the range itself
 *                                  is set on the screen: there is no preset for it yet)
 *   Check exactly                  a tile shows the instant answer only (it runs on its screen)
 *
 * Plus one line: what one more TE by Egg Day would take (search/routeExtras.ts `oneMoreTE`), from saved legs.
 */
import type { LegSummary } from '@/search/types';
import { oneMoreTE } from '@/search/routeExtras';
import type { MyRunsOpen } from './myRunsDashboard';
import type { Tile } from './savedTiles';

export const MAX_PILLS = 4;

export interface Pill {
  id: 'eggday-fast' | 'exact-race' | 'exhaustive' | 'check-fastest' | 'check-eggday';
  label: string;
  open: MyRunsOpen;
}

const STRONG = new Set(['normal', 'thorough', 'exhaustive']);

export function tryNextPills(fastest: { tile: Tile; target: number }, eggDay: Tile): Pill[] {
  const pills: Pill[] = [];
  const f = fastest.tile.answer;
  const e = eggDay.answer;
  if (!e || e.how !== 'search')
    pills.push({
      id: 'eggday-fast',
      label: 'Egg Day, Fast',
      open: { auto: 'by-date', tab: 'nearby', byDate: { eggDay: true }, level: 'quick' },
    });
  if (!f || f.how !== 'search' || !STRONG.has(f.level ?? ''))
    pills.push({
      id: 'exact-race',
      label: `Exact on my ${fastest.target} route`,
      open: { auto: 'fastest', depth: 'smart', tab: 'nearby', target: fastest.target, level: 'normal' },
    });
  if (!f || f.level !== 'exhaustive')
    pills.push({
      id: 'exhaustive',
      label: f ? `Exhaustive (around ${f.chain.length} asc)` : 'Exhaustive',
      open: { auto: 'fastest', depth: 'full', tab: 'exhaustive', target: fastest.target },
    });
  if (e?.how === 'instant')
    pills.push({ id: 'check-eggday', label: 'Check exactly (Egg Day)', open: { auto: 'by-date', byDate: { eggDay: true } } });
  if (f?.how === 'instant')
    pills.push({ id: 'check-fastest', label: `Check exactly (${fastest.target})`, open: { auto: 'fastest', depth: 'smart', target: fastest.target } });
  return pills.slice(0, MAX_PILLS);
}

/**
 * "One more TE by Egg Day (249) would need about 1.6 more days." from the answer's legs (the route's last leg's
 * egg counts and rate). '' without legs, at 490, or when the extra TE already fits in the spare time.
 */
export function oneMoreLine(o: { chain: number[]; legs: LegSummary[] | null | undefined; reachAt: number; spareHours: number | null; what: string }): string {
  if (!o.legs?.length) return '';
  const m = oneMoreTE({ chain: o.chain, legs: o.legs, reachAt: o.reachAt });
  if (!m) return '';
  const extra = m.seconds - Math.max(0, o.spareHours ?? 0) * 3600;
  if (extra <= 0) return '';
  const d = extra / 86400;
  const amount = d >= 1 ? `${d.toFixed(1)} more days` : `${(extra / 3600).toFixed(1)} more hours`;
  return `One more TE by ${o.what} (${m.te}) would need about ${amount}.`;
}
