/**
 * @module instantIntegrity
 * @description What the instant answer says about the integrity check (search/rules.ts), so it never
 * shows routes as if they were valid for an account that stalls on its first Integrity shift.
 *
 * The same measurement every search uses (store `probeIntegrity` / `integrityWait`), the same lines:
 *   - past INTEGRITY_BLOCK_SECONDS (a week): no routes at all, and the "can't be planned yet" advice
 *     with the account's own Clothed TE against the ~225 accounts get through at (rules.ts `cteAdvice`);
 *   - past INTEGRITY_WARN_SECONDS (an hour): the routes, with an amber note that their times include
 *     that wait;
 *   - while the check runs: the routes are held back, for the few seconds it takes.
 * Pure: the panel passes the store's numbers in.
 */
import {
  CTE_CLEARS,
  cteAdvice,
  describeDuration,
  INTEGRITY_BLOCK_SECONDS,
  INTEGRITY_WARN_SECONDS,
  type CteParts,
} from './rules';

export type InstantIntegrity =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'warn'; wait: number; text: string }
  | { kind: 'blocked'; wait: number; text: string };

/**
 * `wait`: seconds on the first Integrity shift (null: not measured, or the check failed, which is not
 * worth holding the answer for: a search's Start checks again and reports properly). `own`: the
 * instant answer was built on the player's own gear, so its builds already carry the wait.
 */
export function instantIntegrity(
  wait: number | null,
  checking: boolean,
  cte: CteParts | null,
  own: boolean
): InstantIntegrity {
  if (checking) return { kind: 'checking' };
  if (wait === null || !(wait > INTEGRITY_WARN_SECONDS)) return { kind: 'none' };
  const long = describeDuration(wait);
  if (wait > INTEGRITY_BLOCK_SECONDS) {
    const advice = cteAdvice(cte);
    const close = advice
      ? cte && cte.total < CTE_CLEARS
        ? `${advice} Please come back once you're closer.`
        : `${advice} Please share this on Discord so we can look into it.`
      : `What fixes it is earnings: Truth Eggs, or a stronger earnings set (totem, ankh, necklace and their stones). ` +
        `Accounts clear it at a Clothed TE of about ${CTE_CLEARS}, so please come back once you're closer to that.`;
    return {
      kind: 'blocked',
      wait,
      text:
        `A fresh ascension on this account would sit on the Integrity shift for ${long}, saving up for habs while ` +
        `shipping almost nothing (a healthy account is through it in under an hour). Nobody really waits that long, ` +
        `so the instant answer shows no routes: every date it gave would be that wait, not a plan. ${close}`,
    };
  }
  return {
    kind: 'warn',
    wait,
    text:
      `Times on your account include an Integrity wait of ${long}: a fresh ascension here sits on its first ` +
      `Integrity shift that long before it can afford its habs (a healthy account is through it in under an hour).` +
      (own ? '' : ` The instant answer's own dates may leave that wait out; Check exactly includes it.`),
  };
}

/** Routes are held back: while the check runs, and for good once it says the account is blocked. */
export function holdsRoutes(s: InstantIntegrity): boolean {
  return s.kind === 'checking' || s.kind === 'blocked';
}
