/**
 * The site's tabs and the address of each one (the unified layout, redesign 2026-09-30).
 *
 *   Manual Planner   #/manual
 *   Auto Planner     #/auto/classic          Joo's Auto AP
 *                    #/auto/fastest          fastest route to 490, Smart search (was Chain Search)
 *                    #/auto/fastest/full     the same, every route in a box (was Insane mode)
 *                    #/auto/by-date          highest TE by a date (was Insane's deadline goal)
 *   Compare          #/compare[/<view>]      the leaderboard's views (Egg Day first), and Insights:
 *                                            the Chain Explorer's charts
 *   Science          #/science               what we still need to check (the sweeps to run)
 *                    #/science/submit        upload a sweep's files
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
/** The leaderboard's views, then the Explorer's charts. */
export type CompareView = 'eggday' | 'race' | 'mine' | 'all' | 'dates' | 'insights';
export const COMPARE_VIEWS: CompareView[] = ['eggday', 'race', 'mine', 'all', 'dates', 'insights'];
export type ScienceView = 'check' | 'submit';

export interface SiteRoute {
  section: Section;
  auto: AutoView;
  depth: Depth;
  /** Compare's view; the default when left out. */
  compare?: CompareView;
  /** Science's view; the default when left out. */
  science?: ScienceView;
}

export const NAMES = {
  manual: 'Manual Planner',
  auto: 'Auto Planner',
  compare: 'Compare',
  science: 'Science',
  insights: 'Insights',
  check: 'What we need to check',
  submit: 'Submit a sweep',
  classic: 'Your plan',
  fastest: 'Fastest to 490 TE',
  byDate: 'Highest TE by a date',
  /** Fastest's two depths, as the "How thorough" cards name them (batch 3): Simple is Smart search,
   *  Advanced the Full sweep. Highest TE by a date has a Simple and an Advanced of its own. */
  smart: 'Simple',
  full: 'Advanced',
  /** The old names, kept in brackets on first mention for a while so regulars aren't lost. */
  smartWas: 'Smart search',
  fullWas: 'Full sweep',
  smartFirst: 'Simple (Smart search)',
  fullFirst: 'Advanced (Full sweep)',
} as const;

/** Fastest's name at the Final target TE ("Fastest to 490 TE" by default; `NAMES.fastest` is that default). */
export function fastestName(finalTE?: number): string {
  return finalTE !== undefined && finalTE > 0 ? `Fastest to ${finalTE} TE` : NAMES.fastest;
}

export const DEFAULT_ROUTE: Required<SiteRoute> = {
  section: 'manual',
  auto: 'classic',
  depth: 'smart',
  compare: 'eggday',
  science: 'check',
};

/** `#/auto/fastest/full` for a route. The sub-parts only where the section has them. */
export function hashFor(r: SiteRoute): string {
  if (r.section === 'compare') return !r.compare || r.compare === 'eggday' ? '#/compare' : `#/compare/${r.compare}`;
  if (r.section === 'science') return r.science === 'submit' ? '#/science/submit' : '#/science';
  if (r.section !== 'auto') return `#/${r.section}`;
  if (r.auto === 'fastest') return r.depth === 'full' ? '#/auto/fastest/full' : '#/auto/fastest';
  return `#/auto/${r.auto}`;
}

/**
 * The route a URL asks for, or null when it asks for none (the page opens on its default, and a
 * plain `#some-anchor` inside a panel is not a route). A new-style hash wins over the old flags.
 */
export function routeFromLocation(search: string, hash: string): Required<SiteRoute> | null {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('/')) {
    const [section, sub, depth] = h.slice(1).split('/');
    if (section === 'manual') return { ...DEFAULT_ROUTE, section };
    if (section === 'compare') {
      const compare = COMPARE_VIEWS.find(v => v === sub) ?? 'eggday';
      return { ...DEFAULT_ROUTE, section, compare };
    }
    if (section === 'science') return { ...DEFAULT_ROUTE, section, science: sub === 'submit' ? 'submit' : 'check' };
    if (section === 'auto') {
      const auto: AutoView = sub === 'fastest' || sub === 'by-date' ? sub : 'classic';
      return {
        ...DEFAULT_ROUTE,
        section: 'auto',
        auto,
        depth: auto === 'fastest' && depth === 'full' ? 'full' : 'smart',
      };
    }
  }
  const params = new URLSearchParams(search);
  const insane = params.get('insane') === '1' || h === 'insane' || h === '/insane';
  const deadline = params.get('goal') === 'deadline' || h === 'deadline' || h === '/deadline';
  if (deadline) return { ...DEFAULT_ROUTE, section: 'auto', auto: 'by-date' };
  if (insane) return { ...DEFAULT_ROUTE, section: 'auto', auto: 'fastest', depth: 'full' };
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
