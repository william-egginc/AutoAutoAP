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
 * Plus one line: when one more TE by Egg Day would come (search/endEggs.ts `endEggsOf` `next`), from saved legs.
 */
import type { LegSummary } from '@/search/types';
import { endEggsOf } from '@/search/endEggs';
import { dateAt } from './eventWhen';
import { virtueEggName } from './virtueEggs';
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
      label: f ? `Exhaustive (around ${f.chain.length} ascensions)` : 'Exhaustive',
      open: { auto: 'fastest', depth: 'full', tab: 'exhaustive', target: fastest.target },
    });
  if (e?.how === 'instant')
    pills.push({ id: 'check-eggday', label: 'Check exactly (Egg Day)', open: { auto: 'by-date', byDate: { eggDay: true } } });
  if (f?.how === 'instant')
    pills.push({ id: 'check-fastest', label: `Check exactly (${fastest.target})`, open: { auto: 'fastest', depth: 'smart', target: fastest.target } });
  return pills.slice(0, MAX_PILLS);
}

/**
 * "One more TE by Egg Day 2027 (249) would come Jul 15, 2027 at 3:10 am, after the deadline, so it isn't counted."
 * Read ONLY from endEggsOf's `next` (search/endEggs.ts: the egg being laid at the route's end, shift-aware; the
 * other eggs come only after a shift and are never timed here). Never a per-egg time "at the final rate" for
 * another egg (main e6a4ed50, Reliability's next-TE fix). '' without the route's legs or a next TE.
 */
export function oneMoreLine(o: {
  chain: number[];
  legs: LegSummary[] | null | undefined;
  deadline: number | null;
  what: string;
  nowSeconds: number;
  zone: string;
}): string {
  if (!o.legs?.length) return '';
  const last = o.chain[o.chain.length - 1];
  if (!(last > 0) || last >= 490) return '';
  const next = endEggsOf({ chain: o.chain, legs: o.legs })?.next ?? null;
  if (!next || !Number.isFinite(next.at)) return '';
  const when = dateAt(next.at, o.nowSeconds, o.zone);
  const egg = virtueEggName(next.egg);
  if (o.deadline != null && next.at > o.deadline)
    return `One more TE by ${o.what} (${last + 1}, on ${egg}) would come ${when}, after the deadline, so it isn't counted.`;
  return `One more TE (${last + 1}, on ${egg}) would come ${when}.`;
}
