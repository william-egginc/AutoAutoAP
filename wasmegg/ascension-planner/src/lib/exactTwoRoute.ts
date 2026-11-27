/**
 * TWO ROUTES under the exact line (R10 option C, 21 Nov 2026; Jordan "go with your picks", option 1(a)). The box shows the pick the
 * player's settings made; when the exact check also worked out the pick without the held buys and that really ends sooner
 * (composables/useInstantExact.ts `faster`), the box switches to it by itself and the exact line offers "Show the first route instead".
 * It never switches by itself after Follow or Simulate was pressed on the box. Pure: InstantRoute.vue holds the three refs.
 */

import { choosePreferFewer, type PreferMargin } from '@/search/preferFewer';

/** What the player asked for: nothing yet (`auto`), the first route back (`first`), or the faster one (`faster`). */
export type FasterChoice = 'auto' | 'first' | 'faster';

export interface ExactRouteLike {
  chain: number[];
  end: number;
  legs: number[];
  spare: number | null;
}
export interface ExactDoneLike {
  routes: ExactRouteLike[];
  faster: 0 | 1;
  end: number;
  legs: number[];
  spare: number | null;
}

/** Whether the box shows the other (faster) route. `faster` is null when there is no exact result. */
export function isSwapped(o: { faster: 0 | 1 | null; choice: FasterChoice; pressed: boolean }): boolean {
  if (o.choice === 'faster') return true;
  if (o.choice === 'first') return false;
  return o.faster === 1 && !o.pressed;
}

/** Follow or Simulate pressed: keep the box as it stands, so a later result never changes the route the player acted on. */
export function pressedChoice(swapped: boolean): FasterChoice {
  return swapped ? 'faster' : 'first';
}

/** The exact numbers of the route with these stops (by its stops, not its position), or null. */
export function exactRouteFor(done: ExactDoneLike | null, chain: readonly number[]): ExactRouteLike | null {
  if (!done) return null;
  const want = chain.join(',');
  return done.routes.find(r => r.chain.join(',') === want) ?? null;
}

/**
 * Fastest: whether Prefer fewer keeps the first route against the automatic switch (code review 22 Nov 2026,
 * math-exact-6). The two exact finishes go through the same rule and margin as the box's pick (search/preferFewer.ts):
 * when it would lead with the first route (fewer ascensions, inside the margin), the box does not switch. Off, or
 * "Show the fastest instead": never.
 */
export function preferKeepsFirst(o: {
  margin: PreferMargin;
  showBest: boolean;
  own: { ascensions: number; end: number };
  alt: { ascensions: number; end: number };
}): boolean {
  if (o.margin.kind === 'off' || o.showBest) return false;
  const row = (item: 'own' | 'alt', r: { ascensions: number; end: number }) => ({
    item,
    ascensions: r.ascensions,
    finish: r.end,
    shifts: null,
  });
  return choosePreferFewer('fastest', [row('own', o.own), row('alt', o.alt)], o.margin)?.chosen.item === 'own';
}
