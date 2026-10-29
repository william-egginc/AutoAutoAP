/**
 * The site's tabs and the address of each one (the unified layout, redesign 2026-09-30).
 *
 *   Manual Planner   #/manual
 *   Auto Planner     #/auto/classic          Joo's Auto AP
 *                    #/auto/fastest          fastest route to 490, Smart search (was Chain Search)
 *                    #/auto/fastest/full     the same, every route in a box (was Insane mode)
 *                    #/auto/by-date          highest TE by a date (was Insane's deadline goal)
 *   Leaderboard      #/compare[/<view>]      the leaderboard's views (Egg Day first), and Insights:
 *                                            (was Compare until 16 Oct 2026; #/leaderboard[/<view>] lands here too)
 *                                            the Chain Explorer's charts
 *                    #/compare/latest        Your latest run: one line, "Your latest run is now in My runs ›"
 *                                            (16 Oct 2026; the block itself is on My runs)
 *   My runs          #/myruns                every run of yours: your latest run (its routes, other options
 *                                            and charts; was Leaderboard › Your latest run until 16 Oct 2026),
 *                                            on the board (hidden ones too), saved on this computer, and not
 *                                            sent yet (15 Oct 2026; was Compare's My plans tab, and
 *                                            #/compare/mine still lands here)
 *   Science          #/science               how the planner works, and how its answers were checked
 *                                            (How it works, the default; #/science/how still opens it)
 *                    #/science/check         what we still need to check (the sweeps to run)
 *                    #/science/submit        upload a sweep's files
 *                    #/science/start         When should I start? (one route priced from every hour of the
 *                                            next week; moved here from Fastest, 14 Oct 2026)
 *
 * In the hash, not the path: the live site is `vite preview` behind a tunnel, and a path it has no
 * file for is a 404 on some hosts. Old links still land where they meant to: `?insane=1` (every
 * Chain Explorer "Run this sweep" link, and the Egg Day prefill link) and `#insane` / `#deadline`.
 *
 * Every name a player reads is in NAMES, so the names the Discord feedback settles on are one edit.
 */

export type Section = 'manual' | 'auto' | 'compare' | 'myruns' | 'science';
export type AutoView = 'classic' | 'fastest' | 'by-date';
/** How thorough the fastest-route search is: descent (Smart) or every route in a box (full). */
export type Depth = 'smart' | 'full';
/** The leaderboard's views, then the Explorer's charts. */
export type CompareView = 'eggday' | 'race' | 'all' | 'dates' | 'latest' | 'insights';
export const COMPARE_VIEWS: CompareView[] = ['eggday', 'race', 'all', 'dates', 'latest', 'insights'];
/** Science's views, in tab order: How it works first (the default), then the sweep pages. */
export type ScienceView = 'how' | 'check' | 'submit' | 'start';
/** The Science views that have their own address part (`how` is the plain #/science). */
const SCIENCE_SUBS: ScienceView[] = ['check', 'submit', 'start'];

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
  /** The shared board and its charts (#/compare: the address kept its old name). Was "Compare" until
   *  16 Oct 2026. */
  compare: 'Leaderboard',
  /** My runs (#/myruns, MyRunsView.vue): the account's runs on the board, saved here, and not sent yet. */
  myRuns: 'My runs',
  science: 'Science',
  insights: 'Insights',
  /** My runs › Your latest run (LatestRunView.vue): the newest search's routes, other options and charts.
   *  Was a Leaderboard tab's content (#/compare/latest, 15 Oct 2026) until 16 Oct 2026; that tab is one line
   *  to My runs now, and "Dig deeper into your plan ›" opens My runs (DigDeeperLink.vue). */
  latest: 'Your latest run',
  check: 'What we need to check',
  submit: 'Submit a sweep',
  /** Science › When should I start? (StartTimeCard.vue). */
  start: 'When should I start?',
  /** Science › How it works: what the searches and the instant answer do, and how they were checked. */
  how: 'How it works',
  /** Joo's single-plan simulator (Classic), the Auto Planner's first screen. Was "Your plan" until 15 Oct
   *  2026; `classicFirst` says so in one place (the screen's own intro). */
  classic: 'Single run',
  classicWas: 'Your plan',
  classicFirst: 'Single run (was Your plan)',
  fastest: 'Fastest to 490 TE',
  byDate: 'Highest TE by a date',
  /** The two ways to search on Fastest and By a date (decision A, 12 Oct 2026; SearchModeChooser.vue):
   *  the search that starts from the instant answer (was Simple: Fastest's Smart search, By a date's
   *  Simple routes) and the one over boxes you set (was Advanced: Fastest's Full sweep, By a date's
   *  chain editor). Batch 3 called them Simple and Advanced. */
  smart: 'Fast and Exact',
  full: 'Custom',
  /** The older names, kept in brackets on first mention so regulars aren't lost. */
  smartWas: 'Simple',
  fullWas: 'Advanced',
  smartFirst: 'Fast and Exact',
  fullFirst: 'Custom',
  /** The study box above the tabs (StudyBox.vue) and its section in Setup (StudySetup.vue), 21 Oct 2026. */
  study: 'Help improve the planner',
  /** Where its choices change: the Setup button (SetupDock.vue) on the Auto Planner and My runs. */
  setup: 'Setup',
} as const;

/**
 * What "Simulate this plan" (and Fastest's "Build this plan") does, said on the button's own line (Jordan,
 * 16 Oct 2026): it opens the route in Single run, Joo's original planner, and simulates every shift.
 */
export function simulateNote(button = 'Simulate this plan'): string {
  return `${button} opens this route in ${NAMES.classic} (Joo's original planner) and simulates every shift: when each TE arrives, and each ascension's dates and purchases.`;
}
/** The same, for the button's title. */
export const SIMULATE_TITLE = `Opens this route in ${NAMES.classic} (Joo's original planner) and simulates every shift on your save`;

/** The exhaustive way's full title, as the chooser names it. */
export const EXHAUSTIVE_TITLE = 'Custom: every route in boxes you set';

/** Fastest's name at the Final target TE ("Fastest to 490 TE" by default; `NAMES.fastest` is that default). */
export function fastestName(finalTE?: number): string {
  return finalTE !== undefined && finalTE > 0 ? `Fastest to ${finalTE} TE` : NAMES.fastest;
}

export const DEFAULT_ROUTE: Required<SiteRoute> = {
  section: 'manual',
  auto: 'classic',
  depth: 'smart',
  compare: 'eggday',
  science: 'how',
};

/**
 * Where a NEW player lands once their save is in (Jordan, 25 Oct 2026, the UX review's item 2/A): the
 * instant answer, on Auto Planner › Highest TE by a date with Egg Day picked, rather than the Manual
 * Planner's empty cards. App.vue also presets Egg Day on that screen (lib/byDateForm.ts).
 */
export const FIRST_LOAD_ROUTE: Required<SiteRoute> = { ...DEFAULT_ROUTE, section: 'auto', auto: 'by-date' };

/** The browser's memory of the last tab (its hash), so a returning player opening the bare address
 *  lands where they left off. */
export const LAST_ROUTE_KEY = 'aap.lastRoute';

/** The last tab remembered, or null when there is none (or what is stored isn't a tab's address). */
export function storedRoute(stored: string | null | undefined): Required<SiteRoute> | null {
  return stored && stored.startsWith('#/') ? routeFromLocation('', stored) : null;
}

/**
 * How the page opens, before any save is loaded:
 * - the address names a tab (a link, a reload): that tab, for anyone;
 * - else the browser remembers a last tab (a returning player): that tab;
 * - else the default (the Manual Planner shell under the ID box), and `newPlayer` says whether the
 *   first save that loads should take them to FIRST_LOAD_ROUTE. A player is new when nothing says
 *   otherwise: no tab in the address, none remembered, and no player ID saved in this browser.
 */
export function openingRoute(p: {
  fromUrl: Required<SiteRoute> | null;
  stored: string | null | undefined;
  savedPlayerId: string | null | undefined;
}): { route: Required<SiteRoute> | null; newPlayer: boolean } {
  if (p.fromUrl) return { route: p.fromUrl, newPlayer: false };
  const kept = storedRoute(p.stored);
  if (kept) return { route: kept, newPlayer: false };
  return { route: null, newPlayer: !p.savedPlayerId };
}

/** `#/auto/fastest/full` for a route. The sub-parts only where the section has them. */
export function hashFor(r: SiteRoute): string {
  if (r.section === 'compare') return !r.compare || r.compare === 'eggday' ? '#/compare' : `#/compare/${r.compare}`;
  if (r.section === 'myruns') return '#/myruns';
  if (r.section === 'science')
    return r.science && SCIENCE_SUBS.includes(r.science) ? `#/science/${r.science}` : '#/science';
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
    if (section === 'manual' || section === 'myruns') return { ...DEFAULT_ROUTE, section };
    // Compare's My plans tab became My runs (15 Oct 2026): old links land there.
    if (section === 'compare' && sub === 'mine') return { ...DEFAULT_ROUTE, section: 'myruns' };
    // The tab is called Leaderboard (16 Oct 2026); its address kept the old name, and either works.
    if (section === 'compare' || section === 'leaderboard') {
      const compare = COMPARE_VIEWS.find(v => v === sub) ?? 'eggday';
      return { ...DEFAULT_ROUTE, section: 'compare', compare };
    }
    if (section === 'science') {
      const science: ScienceView = SCIENCE_SUBS.find(v => v === sub) ?? 'how';
      return { ...DEFAULT_ROUTE, section, science };
    }
    if (section === 'auto') {
      // A bare #/auto opens the first sub-tab, Fastest to 490 TE; Single run keeps its own address, #/auto/classic.
      const auto: AutoView = sub === 'by-date' ? 'by-date' : sub === 'classic' ? 'classic' : 'fastest';
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
