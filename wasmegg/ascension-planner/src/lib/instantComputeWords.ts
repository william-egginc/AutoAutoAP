/**
 * What the instant answer's own compute says when it fails (composables/useInstantCompute.ts), moved here unchanged so
 * it can be reworded without moving the result code hash (a *Words.ts file is wording only, lib/resultCodeHash.ts
 * `isWordingOnly`). Import-free; pure.
 */

/** BUILD-UP MISSING (search/instantFirstLegs.ts BuildUpFlags): the build-up failed, so the instant answer is not kept.
 *  Shown in My runs after "Prestige at <time>" (RightNowCard.vue now-follow-nosource), via instantFailureWords. */
export const BUILD_UP_MISSING_FAILURE = "your build-up couldn't be worked out from your save";
