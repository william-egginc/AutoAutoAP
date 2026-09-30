/**
 * The site's tabs and the address of each one (the unified layout, redesign 2026-09-30).
 *
 *   Manual Planner   #/manual
 *   Auto Planner     #/auto/classic          Joo's Auto AP
 *                    #/auto/fastest          fastest route to 490, Smart search (was Chain Search)
 *                    #/auto/fastest/full     the same, every route in a box (was Insane mode)
 *                    #/auto/by-date          highest TE by a date (was Insane's deadline goal)
 *   Compare          #/compare               the leaderboard
 *   Science          #/science               what we still need to test, and sweeps to run
 *
 * In the hash, not the path: the live site is `vite preview` behind a tunnel, and a path it has no
 * file for is a 404 on some hosts. Old links still land where they meant to: `?insane=1` (every
 * Chain Explorer "Run this sweep" link, and the Egg Day prefill link) and `#insane` / `#deadline`.
 *
 * Every name a player reads is in NAMES, so the names the Discord feedback settles on are one edit.
 */

export type Section = 'manual' | 'auto' | 'compare' | 'science';
export type AutoView = 'classic' | 'fastest' | 'by-date';
/** How thorough the fastest-route search is: descent (Smart) or every route in a box (full). */
export type Depth = 'smart' | 'full';

export interface SiteRoute {
  section: Section;
  auto: AutoView;
  depth: Depth;
}

export const NAMES = {
  manual: 'Manual Planner',
  auto: 'Auto Planner',
  compare: 'Compare',
  science: 'Science',
  classic: 'Classic',
  fastest: 'Fastest route',
  byDate: 'Highest TE by a date',
  smart: 'Smart search',
  full: 'Full sweep',
} as const;

export const DEFAULT_ROUTE: SiteRoute = { section: 'manual', auto: 'classic', depth: 'smart' };

/** `#/auto/fastest/full` for a route. The sub-parts only where the section has them. */
export function hashFor(r: SiteRoute): string {
  if (r.section !== 'auto') return `#/${r.section}`;
  if (r.auto === 'fastest') return r.depth === 'full' ? '#/auto/fastest/full' : '#/auto/fastest';
  return `#/auto/${r.auto}`;
}

/**
 * The route a URL asks for, or null when it asks for none (the page opens on its default, and a
 * plain `#some-anchor` inside a panel is not a route). A new-style hash wins over the old flags.
 */
export function routeFromLocation(search: string, hash: string): SiteRoute | null {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('/')) {
    const [section, sub, depth] = h.slice(1).split('/');
    if (section === 'manual' || section === 'compare' || section === 'science') return { ...DEFAULT_ROUTE, section };
    if (section === 'auto') {
      const auto: AutoView = sub === 'fastest' || sub === 'by-date' ? sub : 'classic';
      return { section: 'auto', auto, depth: auto === 'fastest' && depth === 'full' ? 'full' : 'smart' };
    }
  }
  const params = new URLSearchParams(search);
  const insane = params.get('insane') === '1' || h === 'insane';
  const deadline = params.get('goal') === 'deadline' || h === 'deadline';
  if (deadline) return { section: 'auto', auto: 'by-date', depth: 'smart' };
  if (insane) return { section: 'auto', auto: 'fastest', depth: 'full' };
  return null;
}

/**
 * The URL to show once an old-style link has been read: `insane` and `goal` dropped (the hash says
 * it now), everything else kept -- the sweep and Egg Day parameters are read by the panels
 * themselves, and `playerId` by the page.
 */
export function canonicalUrl(href: string, r: SiteRoute): string {
  const url = new URL(href);
  url.searchParams.delete('insane');
  url.searchParams.delete('goal');
  url.hash = hashFor(r);
  return url.toString();
}
