/**
 * The Try next pills' goal-naming labels (Words, 17 Nov 2026). The Exact pill belongs to the Fastest-to-N tile, not to the
 * route you follow, so it says so. The component adds the trailing "›". A *Words.ts file: wording only.
 */

/** "Exact on Fastest to 490" */
export function exactRacePill(target: number): string {
  return `Exact on Fastest to ${target}`;
}
