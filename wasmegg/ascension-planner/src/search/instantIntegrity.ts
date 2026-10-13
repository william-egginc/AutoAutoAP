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
    // LOW-TE GATE (temporary until Joo's PR 717 merges): "an", not "its first": on the low-TE path the
    // wait measured is the last round's (search/leg.ts `integrityCheck`).
    text:
      `Times on your account include an Integrity wait of ${long}: a fresh ascension here sits on an ` +
      `Integrity shift that long before it can afford its habs (a healthy account is through it in under an hour).` +
      (own ? '' : ` The instant answer's own dates may leave that wait out; Check exactly includes it.`),
  };
}

/** Routes are held back: while the check runs, and for good once it says the account is blocked. */
export function holdsRoutes(s: InstantIntegrity): boolean {
  return s.kind === 'checking' || s.kind === 'blocked';
}

/**
 * LOW-TE GATE (temporary until Joo's PR 717 merges): the instant answer's label for an account whose
 * fresh ascension takes the low-TE opening (auto/lowTeOpening.ts). The tables were built with the
 * standard opening only (no table cell takes the low-TE one), so their dates for the player's own
 * low-TE ascensions are not the simulator's: said here, and Check exactly prices the real opening.
 * '' when there is nothing to say.
 */
export function lowTeOpeningNote(info: { rounds: number; openingSeconds: number } | null | undefined): string {
  if (!info || !(info.rounds > 0)) return '';
  const rounds = info.rounds === 1 ? 'once' : `${info.rounds} times`;
  return (
    `Low-TE opening: a fresh ascension on this account can't afford its habs in one Integrity shift, so it ` +
    `goes round research, vehicles and habs (C1, K1, I1) ${rounds} first, about ` +
    `${describeDuration(info.openingSeconds)} before its habs are maxed. The instant answer's tables use the ` +
    `standard opening, so its dates for your low-TE ascensions are rough; Check exactly prices the low-TE opening.`
  );
}
