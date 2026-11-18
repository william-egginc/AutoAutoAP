/**
 * THE INLINE ERROR FOR TARGET TE(S) (Words, 17 Nov 2026, for UI). The box takes one or more stops: the most is 490, none
 * is below the TE you have now, and each is at least as high as the one before. A *Words.ts file: wording only, out of
 * the result code hash. Under 170 characters each.
 */

/** The one line that says all three rules; `te` is the player's current TE. "Enter targets from 220 to 490, each at least as high as the one before." */
export function targetTeRules(te: number): string {
  return `Enter targets from ${Math.floor(te)} to 490, each at least as high as the one before.`;
}
/** The separate lines, when UI knows which rule broke. */
export const TARGET_TE_TOO_HIGH = 'Target TE can be 490 at most.';
export function targetTeTooLow(te: number): string {
  return `Target TE can't be below your current TE (${Math.floor(te)}).`;
}
export const TARGET_TE_ORDER = 'Each target must be at least as high as the one before.';
