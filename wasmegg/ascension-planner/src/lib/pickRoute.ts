/**
 * The Build-up tracker's "Pick a route to follow" (Kenzie, 9 Nov 2026: the tracker said "follow a route first" with no
 * way to do it). The press opens the goal Right now shows on its screen (Fastest to its target, or By a date / Egg Day
 * for a dated goal; Fastest to 490 when none is shown) and scrolls to that screen's instant answer, whose Follow this
 * route follows it. Not a result code input (lib/resultCodeHash.ts): nothing that works results out imports it.
 */
import type { MyRunsOpen } from './myRunsDashboard';

/** The button's words (DRAFT, Words). */
export const PICK_ROUTE_WORDS = 'Pick a route to follow ›';

/** The screen the press opens: the shown goal's, else Fastest to 490. */
export function pickRouteOpen(goals: readonly { key: string; open: MyRunsOpen }[] | undefined, selected: string | null): MyRunsOpen {
  return goals?.find(g => g.key === selected)?.open ?? { auto: 'fastest', depth: 'smart', target: 490 };
}

/** The instant answer's section on Fastest and on By a date (CollapsibleSection id="instant"). Both screens can be in
 *  the page, one hidden, so the one laid out is the one shown. */
const INSTANT = '[data-testid="section-instant"]';
/** Its Follow this route (FollowButton.vue). */
const FOLLOW = '[data-testid="follow-route"]';
const EVERY_MS = 200;
const TRIES = 25;

/** Scroll the shown instant answer into view once the opened screen has drawn it (its chunk may still be loading):
 *  tried every 200 ms for 5 seconds, then given up. Its Follow this route is centred once drawn (the route box is above
 *  it, and a phone's Setup dock no longer covers it, as it did with the section's top at the top); until then the
 *  section's top is shown. */
export function scrollToInstantAnswer(doc: Pick<Document, 'querySelectorAll'> | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc) return;
  let left = TRIES;
  let atSection = false;
  const tick = () => {
    const el = [...doc.querySelectorAll(INSTANT)].find(e => e.getClientRects().length > 0);
    const follow = el ? [...el.querySelectorAll(FOLLOW)].find(e => e.getClientRects().length > 0) : undefined;
    if (follow) {
      follow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // The answer still being worked out: its section now, its button once it is drawn (within the same 5 seconds).
    if (el && !atSection) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      atSection = true;
    }
    if (--left > 0) setTimeout(tick, EVERY_MS);
  };
  setTimeout(tick, EVERY_MS);
}
