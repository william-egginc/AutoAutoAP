/**
 * The target box's words on Chain Finder > Target TE, "Reach [490] TE as soon as possible" (TargetTeBox.vue; spec-targette,
 * Jordan 12 Nov 2026, Joo's layout). DRAFT for Words: every string here is new.
 *
 * A *Words.ts file: wording only, never part of the result code hash.
 */

export const TARGET_TE_WORDS = {
  /** Before the box. DRAFT. */
  before: 'Reach',
  /** After the box. DRAFT. */
  after: 'TE as soon as possible',
  /** The box's name for a screen reader ("Target TE, edit text, 490"). DRAFT. */
  label: 'Target TE',
  /**
   * Under the box when what was typed can't be a target (blank, not a whole number, or outside your TE + 1 to 490); the
   * box goes back to the target kept. DRAFT.
   */
  invalid: (range: { min: number; max: number }, kept: number): string =>
    range.min > range.max
      ? `Your TE is already ${range.min - 1}, so there is no higher target. Kept ${kept}.`
      : `Type a whole number from ${range.min} to ${range.max}. Kept ${kept}.`,
  /**
   * The quiet note under the box when the target is not 490, until the game expert answers whether the tables are right
   * below 490 (notes/target-te-box-investigation.md, section 5). To remove: delete this line and its <p> in
   * TargetTeBox.vue (and the spec's two lines that name it). DRAFT.
   */
  checkedMost: 'Checked most for 490 TE.',
} as const;
