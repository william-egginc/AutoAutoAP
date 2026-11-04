import type { AutoView, Depth } from './siteNav';

/**
 * The Auto Planner screen the player was last on (Fastest to 490 TE, Highest TE by a date or Single run, and
 * Fastest's depth), so the tab opens there rather than always on Single run (Jordan, 1 Nov 2026). An address
 * naming a screen and the explicit opens (My runs' Open, a leaderboard route) still win; they set the store
 * after it has read this.
 */
export const AUTO_SCREEN_KEY = 'aap.autoScreen';

const VIEWS: AutoView[] = ['classic', 'fastest', 'by-date'];
const DEPTHS: Depth[] = ['smart', 'full'];

/** What was remembered, or null for a first visit (or storage that is empty, blocked or garbled). */
export function readAutoScreen(): { view: AutoView; depth: Depth } | null {
  try {
    const v = JSON.parse(localStorage.getItem(AUTO_SCREEN_KEY) ?? 'null') as { view?: unknown; depth?: unknown } | null;
    const view = VIEWS.find(x => x === v?.view);
    const depth = DEPTHS.find(x => x === v?.depth);
    return view && depth ? { view, depth } : null;
  } catch {
    return null;
  }
}

export function writeAutoScreen(view: AutoView, depth: Depth): void {
  try {
    localStorage.setItem(AUTO_SCREEN_KEY, JSON.stringify({ view, depth }));
  } catch {
    // a convenience, never a reason to fail
  }
}
