/**
 * The crossfade between tour slides (Jordan, 16 Nov 2026): the new picture fades in over the one before. Pure, so a spec
 * can hold the rule; TourDialog.vue draws it. Nothing the result hash covers imports this file.
 */
/** How long the fade lasts, in ms (kept short). */
export const FADE_MS = 200;

/** Whether to fade from slide `prev` (null: none yet) to slide `next`: not for the first slide, not for the same slide, and
 *  not for a reader who asked for less motion (`reduced`: prefers-reduced-motion). */
export function shouldFade(prev: string | null | undefined, next: string | null | undefined, reduced: boolean): boolean {
  return !reduced && !!prev && !!next && prev !== next;
}
