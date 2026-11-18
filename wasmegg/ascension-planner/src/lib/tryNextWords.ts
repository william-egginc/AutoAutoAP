/**
 * The My runs "Try next" pill that names the Fastest-to-N tile it opens (17 Nov 2026, Jordan: it read "Exact on my 490 route" beside a
 * followed route for Egg Day 2027). DRAFT: Words owns the text (asked 17 Nov 2026). The pill's "›" is drawn by TryNext.vue, not here.
 * A *Words.ts file: wording only, never part of the result code hash.
 */
export function exactRacePill(target: number): string {
  return `Exact on Fastest to ${target}`;
}
