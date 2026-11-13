/**
 * The target box's words on Chain Finder > Target TE, "Reach [490] TE as soon as possible" (TargetTeBox.vue; spec-targette,
 * Jordan 12 Nov 2026, Joo's layout), and the store's refusal (chainSearch.ts `commitFinalTE`). DRAFT for Words: every
 * string here is new.
 *
 * A *Words.ts file: wording only, never part of the result code hash. Imports nothing.
 */

export const TARGET_TE_WORDS = {
  /** Before the box (Joo's). */
  before: 'Reach',
  /** After the box (Joo's). */
  after: 'TE as soon as possible',
  /** The box's name for a screen reader ("Target TE, edit text, 490"). DRAFT. */
  label: 'Target TE',
  /**
   * Under the box when what was typed can't be a target (blank, not a whole number, at or below your TE, above 490); the
   * box goes back to the target kept. Joo's own sentence (his Chain Finder's store, "Pick a target TE above N, up to
   * 490."), then the value kept. DRAFT.
   */
  invalid: (range: { min: number; max: number }, kept: number): string =>
    range.min > range.max
      ? `Your TE is already ${range.min - 1}, so there is no higher target. Kept ${kept}.`
      : `Pick a target TE above ${range.min - 1}, up to ${range.max}. Kept ${kept}.`,
  /**
   * Under Every number of ascensions when the target is within 25 TE of your TE (chainSearch.ts `isNearTarget`; both
   * goals, By a date's target being 490): rows with 3 or more tiny ascensions can be priced 8-23% too fast there. They
   * never win. DRAFT.
   */
  nearRows: 'Rows with many short hops can look a little faster than they really are.',
  /** A commit while a search runs (the box is disabled then, so a player should not see it). DRAFT. */
  running: 'A search is running: the target changes once it ends.',
} as const;
