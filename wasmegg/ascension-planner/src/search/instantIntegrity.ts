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
    // LOW-TE OPENING (auto/lowTeOpening.ts): "an", not "its first": on the low-TE path the
    // wait measured is the last round's (search/leg.ts `integrityCheck`).
    text:
      `Times on your account include an Integrity wait of ${long}: a fresh ascension here sits on an ` +
      `Integrity shift that long before it can afford its habs (a healthy account is through it in under an hour).` +
      (own ? '' : ` The instant answer's own dates may leave that wait out; a Fast search includes it.`),
  };
}

/** Routes are held back: while the check runs, and for good once it says the account is blocked. */
export function holdsRoutes(s: InstantIntegrity): boolean {
  return s.kind === 'checking' || s.kind === 'blocked';
}

/**
 * LOW-TE OPENING (auto/lowTeOpening.ts): the instant answer's label for an account whose
 * fresh ascension takes the low-TE opening (auto/lowTeOpening.ts). The tables were built with the
 * standard opening only (no table cell takes the low-TE one), so their dates for the player's own
 * low-TE ascensions are not the simulator's: said here, and Check exactly prices the real opening.
 * '' when there is nothing to say.
 */
export function lowTeOpeningNote(info: { rounds: number; openingSeconds: number } | null | undefined): string {
  if (!info || !(info.rounds > 0)) return '';
  const rounds = info.rounds === 1 ? 'once' : `${info.rounds} times`;
  return (
    `Low-TE opening: a fresh ascension on this account can't max its habs in one round of research, vehicles ` +
    `and habs (C1, K1, I1), so it goes round ${rounds}, about ${describeDuration(info.openingSeconds)} before ` +
    `its habs are maxed. The instant answer may not have been made with this opening for your ascensions, so ` +
    `its dates for them are rough; a Fast search prices the low-TE opening.`
  );
}

/**
 * How long the check ahead of Start (store `probeIntegrity`) may hold the instant answer back. It takes a few
 * seconds (one worker, one fresh ascension simulated to its Integrity shift); one that never answers (a worker that
 * never started or was taken away without a word, which Safari does) held the answer behind "Checking whether this
 * account can build…" for as long as the page stayed open (Jordan's Safari reload, 23 Oct 2026). Past this the check
 * counts as not measured, which never holds the answer (`instantIntegrity`: null), and Start checks again.
 */
export const INTEGRITY_PROBE_MS = 30_000;

/** The message `probeLimit` rejects with. */
export const PROBE_TOO_LONG = 'the integrity check took too long';

/** `work`, or a rejection with PROBE_TOO_LONG once `ms` have passed without it settling. */
export function probeLimit<T>(work: Promise<T>, ms: number = INTEGRITY_PROBE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(PROBE_TOO_LONG)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
