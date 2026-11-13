import type { AutoView, ChainView, Depth } from './siteNav';

/**
 * The Auto Planner screen the player was last on (Fastest to 490 TE, Highest TE by a date or Single run, and
 * Fastest's depth), so the tab opened there rather than always on Single run (Jordan, 1 Nov 2026). An address
 * naming a screen and the explicit opens (My runs' Open, a leaderboard route) still win; they set the store
 * after it has read this.
 *
 * Since Chain Finder (spec-chainfinder, 12 Nov 2026) it is Chain Finder's last goal: Fastest (with its depth) or By a
 * date. The Auto Planner tab always opens Joo's simulator, so the simulator is never remembered here: a 'classic'
 * stored before reads as Fastest, and opening the simulator writes nothing.
 */
export const AUTO_SCREEN_KEY = 'aap.autoScreen';

const VIEWS: AutoView[] = ['classic', 'fastest', 'by-date'];
const DEPTHS: Depth[] = ['smart', 'full'];

/** What was remembered, or null for a first visit (or storage that is empty, blocked or garbled). */
export function readAutoScreen(): { view: ChainView; depth: Depth } | null {
  try {
    const v = JSON.parse(localStorage.getItem(AUTO_SCREEN_KEY) ?? 'null') as { view?: unknown; depth?: unknown } | null;
    const view = VIEWS.find(x => x === v?.view);
    const depth = DEPTHS.find(x => x === v?.depth);
    return view && depth ? { view: view === 'classic' ? 'fastest' : view, depth } : null;
  } catch {
    return null;
  }
}

export function writeAutoScreen(view: AutoView, depth: Depth): void {
  if (view === 'classic') return;
  try {
    localStorage.setItem(AUTO_SCREEN_KEY, JSON.stringify({ view, depth }));
  } catch {
    // a convenience, never a reason to fail
  }
}
