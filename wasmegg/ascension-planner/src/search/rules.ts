/**
 * @module rules
 * @description The planner's policy thresholds, in one place, with the wording the player sees.
 *
 * These are decisions, not measurements, so they live apart from the code that applies them. Set
 * 2026-09-24; the measurements each one rests on are noted beside it.
 *
 * Deliberately free of simulator imports: the page, the health checks, the collector-bound
 * submission builder and the CLI all read these, and none of them should drag the engine in to do
 * it.
 */

// ------------------------------------------------------------------------------ continue (leg 1)

/** Continue is taken outright, with no comparison. Continue was the fastest variant every time it
 *  finished within a week, across four accounts, so comparing only costs a C3 fan-out. */
export const CONTINUE_PIN_MAX_SECONDS = 7 * 86400;

/** A continue leg 1 longer than this is shown with a warning. */
export const CONTINUE_WARN_SECONDS = 90 * 86400;

/** Continue is not a candidate past this. Between the pin and here it is compared with the fresh
 *  1/2/3-sale starts and wins unless one is strictly faster. A year on one farm is not a plan. */
export const CONTINUE_MAX_SECONDS = 183 * 86400;

// ------------------------------------------------------------------------ integrity (the stall)

/**
 * How long a first fresh ascension may sit on its Integrity shift before the player is told.
 *
 * Measured on healthy accounts (every fresh leg of eight overnight sweeps, about 25,000 legs): the
 * median is under ten minutes and the longest was 54. The accounts the planner cannot help sit
 * there for months or decades -- 480 days on one, 87 years on another -- saving for habs while
 * shipping almost nothing. Nothing in between has been seen, which is why an hour is a safe line.
 */
export const INTEGRITY_WARN_SECONDS = 3600;

/** Past this the run does not start: every date it produced would be the stall, not the plan. */
export const INTEGRITY_BLOCK_SECONDS = 7 * 86400;

// ------------------------------------------------------------------------------- board hygiene

/** A plan longer than this is flagged: it is a statement about the account, not a route to 490. */
export const DECADES_LONG_DAYS = 3652.5;

/** Why a submission goes to the flagged board instead of the main one. */
export const SUBMISSION_FLAGS = ['integrity-stall', 'decades-long', 'contradicts-itself'] as const;
export type SubmissionFlag = (typeof SUBMISSION_FLAGS)[number];

// ------------------------------------------------------------------------------------ wording

/** "38 minutes", "5.2 hours", "12 days", "87 years" -- whichever unit reads naturally. */
export function describeDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'forever';
  const minutes = seconds / 60;
  if (minutes < 90) {
    const m = Math.max(1, Math.round(minutes));
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  const days = hours / 24;
  if (days < 730) return `${Math.round(days)} days`;
  const years = days / 365.25;
  return years < 100 ? `${years.toFixed(1)} years` : `${Math.round(years).toLocaleString()} years`;
}

export function longContinueMessage(days: number): string {
  return (
    `Leg 1 keeps your current ascension going for ${Math.round(days)} days, over three months on one farm. ` +
    `A fresh 1, 2 and 3-sale start were all checked and none was faster, so it stands. ` +
    `Who do you think you are, some SE-hungry alien thug?`
  );
}

export function integrityMessage(seconds: number): string {
  const blocked = seconds > INTEGRITY_BLOCK_SECONDS;
  const wait = describeDuration(seconds);
  return blocked
    ? `A fresh ascension on this account would sit on the Integrity shift for ${wait}, saving up for habs while ` +
        `shipping almost nothing (a healthy account is through it in under an hour). The planner cannot build a ` +
        `workable plan from that, so this run will not start. What fixes it is earnings: Truth Eggs, or a stronger ` +
        `earnings set (totem, ankh, necklace and their stones). Accounts clear it at a Clothed TE of about 225.`
    : `A fresh ascension on this account sits on the Integrity shift for ${wait} before it can afford its habs ` +
        `(a healthy account is through it in under an hour). The plan runs, but that wait is in every date it gives, ` +
        `and a result will go to the flagged board rather than the main one.`;
}
