/**
 * NEVER NOTHING, AT THE VUE LAYER (Jordan's Safari shot, 24 Oct 2026: By a date with the instant answer's Hide
 * pill and nothing under it, while Nearby routes read the answer it had found). Every state of the instant card
 * says something (InstantRoute.states.spec.ts), but a component whose render throws is drawn as nothing by Vue in a
 * production build, with one console line no player sees; a throw while it updates leaves it as it was, or half
 * drawn. InstantGuard.ts catches those for the card in its slot and says so instead.
 *
 * No Vue here: the decision alone, for the spec.
 */

/** What the guard shows in place of a card that couldn't be drawn. Player words: no "table", no raw error. */
export const INSTANT_FAILED =
  'The instant answer couldn’t be shown: something went wrong drawing it on this page. Show it again, or use Fast, Exact or Custom below.';

/**
 * Whether a Vue error (`errorCaptured`'s third argument) is the component failing to draw itself: its setup
 * (0), its render (1) or its update (15, a patch that threw). Development builds name them; production builds give
 * a link ending in the code (runtime-core `handleError`). Event handlers, watchers and lifecycle hooks are not:
 * the card still shows, so they go on to the page's usual handling.
 */
export function isRenderFailure(info: string): boolean {
  if (/^(setup function|render function|component update)$/.test(info)) return true;
  return /#runtime-(0|1|15)$/.test(info);
}
