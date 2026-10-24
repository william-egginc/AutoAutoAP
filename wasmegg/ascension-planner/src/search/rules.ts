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

/** Under Continue Asc. (firstAscension 'continue', search/firstAscension.ts) continue is taken
 *  outright, with no comparison, when it finishes within this. Continue was the fastest variant every
 *  time it finished within a week, across four accounts, so comparing only costs a C3 fan-out. Under
 *  'auto' there is no pin: continue competes on time with the fresh starts, as in Classic. */
export const CONTINUE_PIN_MAX_SECONDS = 7 * 86400;

/** A continue leg 1 longer than this is shown with a warning. */
export const CONTINUE_WARN_SECONDS = 90 * 86400;

/** Continue is not a candidate past this, under 'continue' or 'auto'. Between the pin and here,
 *  under 'continue', it is compared with the fresh 1/2/3-sale starts and wins unless one is strictly
 *  faster. A year on one farm is not a plan. */
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

/** The Clothed TE accounts get through the Integrity shift at (measured on the PC, 23 Sept). */
export const CTE_CLEARS = 225;
/** What a full T4L earnings set (with its stones) adds to Clothed TE: every account on the board
 *  that owns one shows +128.7. */
export const BEST_EARNINGS_SET_CTE = 128.7;

/** An account's Clothed TE, part by part (lib/artifacts/virtue.ts `calculateClothedTEForSet`). */
export interface CteParts {
  total: number;
  /** Truth Eggs: each one is +1. */
  te: number;
  /** Truth Eggs earned but not claimed yet: they come with the next ascension, so they count. */
  pending?: number;
  /** The best earnings set it owns. */
  gear: number;
  /** Colleggtibles, against a full collection (0 or negative). */
  colleggtibles: number;
  /** Lab Upgrade epic research, against maxed (0 or negative). */
  lab: number;
  /** The standard permit's offline-earnings penalty (0 with the Pro permit). */
  permit: number;
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
const signed = (n: number) => (n >= 0 ? `+${one(n)}` : `-${one(-n)}`);

/** What this account could do to reach CTE_CLEARS, in its own numbers. '' when nothing is known. */
export function cteAdvice(c: CteParts | null | undefined): string {
  if (!c || !Number.isFinite(c.total)) return '';
  const gap = CTE_CLEARS - c.total;
  const parts = [
    `${one(c.te)} TE`,
    ...(c.pending && c.pending > 0 ? [`${one(c.pending)} pending`] : []),
    `earnings gear ${signed(c.gear)}`,
    ...(c.colleggtibles < -0.05 ? [`colleggtibles ${signed(c.colleggtibles)}`] : []),
    ...(c.lab < -0.05 ? [`Lab Upgrade ${signed(c.lab)}`] : []),
    ...(c.permit < -0.05 ? [`standard permit ${signed(c.permit)}`] : []),
  ];
  const where = `Your Clothed TE is about ${one(c.total)} (${parts.join(', ')}).`;
  if (gap <= 0)
    return `${where} That's already past the usual line of about ${CTE_CLEARS}, so something else is holding this account back.`;
  const options = [
    `about ${Math.ceil(gap)} more Truth Eggs (each adds 1)`,
    ...(BEST_EARNINGS_SET_CTE - c.gear > 0.5
      ? [
          `a stronger earnings set: a full T4L set is worth about +${one(BEST_EARNINGS_SET_CTE)} and yours is ${signed(c.gear)}, so up to +${one(BEST_EARNINGS_SET_CTE - c.gear)} there`,
        ]
      : []),
    ...(c.colleggtibles < -0.05 ? [`finishing your colleggtibles: up to +${one(-c.colleggtibles)}`] : []),
    ...(c.lab < -0.05 ? [`maxing Lab Upgrade: +${one(-c.lab)}`] : []),
    ...(c.permit < -0.05 ? [`the Pro permit: +${one(-c.permit)}`] : []),
  ];
  return (
    `${where} Accounts get through at about ${CTE_CLEARS}, so you're about ${Math.ceil(gap)} short. ` +
    `Any mix of these that adds up to about ${Math.ceil(gap)} does it: ${options.join('; ')}.`
  );
}

/**
 * The message cut into plain and bold pieces for display: the wait and "Nobody really waits that
 * long" stand out (the user, 30 Sept). The text itself stays one plain string for errors and notes.
 */
export function integrityHighlights(text: string, seconds: number | null): { text: string; bold: boolean }[] {
  const marks = [seconds ? describeDuration(seconds) : '', 'Nobody really waits that long'].filter(Boolean);
  const out: { text: string; bold: boolean }[] = [];
  let rest = text;
  while (rest) {
    let at = -1;
    let hit = '';
    for (const m of marks) {
      const i = rest.indexOf(m);
      if (i >= 0 && (at < 0 || i < at)) {
        at = i;
        hit = m;
      }
    }
    if (at < 0) {
      out.push({ text: rest, bold: false });
      break;
    }
    if (at > 0) out.push({ text: rest.slice(0, at), bold: false });
    out.push({ text: hit, bold: true });
    rest = rest.slice(at + hit.length);
  }
  return out;
}

export function integrityMessage(seconds: number, cte?: CteParts | null): string {
  const blocked = seconds > INTEGRITY_BLOCK_SECONDS;
  const wait = describeDuration(seconds);
  const advice = cteAdvice(cte);
  return blocked
    ? `A fresh ascension on this account would sit on the Integrity shift for ${wait}, saving up for habs while ` +
        `shipping almost nothing (a healthy account is through it in under an hour). Nobody really waits that long: ` +
        `in the game you'd wait for a hab sale or add an extra shift to get through, and this tool isn't built to ` +
        `plan either, so this run won't start. ` +
        (advice
          ? cte && cte.total < CTE_CLEARS
            ? `${advice} Please come back once you're closer.`
            : `${advice} Please share this on Discord so we can look into it.`
          : `What fixes it is earnings: Truth Eggs, or a stronger earnings set (totem, ankh, necklace and their ` +
            `stones). Accounts clear it at a Clothed TE of about ${CTE_CLEARS}, so please come back once you're ` +
            `closer to that.`)
    : `A fresh ascension on this account sits on the Integrity shift for ${wait} before it can afford its habs ` +
        `(a healthy account is through it in under an hour). The plan runs, but that wait is in every date it gives, ` +
        `and a result will go to the flagged board rather than the main one.`;
}
