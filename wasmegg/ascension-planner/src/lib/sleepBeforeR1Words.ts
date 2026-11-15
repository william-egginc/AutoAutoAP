/**
 * "You won't reach R1 before you sleep" (Jordan's option a, 15 Nov 2026; Reliability's `{ r1At, sleepAt, exact }`, unix
 * seconds; `exact: false` means R1's time is an upper bound). Shown only when the player's hours are set and shifts aren't
 * held. The farm would sit on few silos overnight, so the line suggests prestiging in the morning or re-planning.
 * The caller passes the shared 12-hour formatter (`fmt`), so the times read "9:00 AM". Wording only.
 */
import type { SleepBeforeR1 } from './sleepBeforeR1';
type Fmt = (unixSeconds: number) => string;

/** "come at 1:10 AM" or, for an upper bound, "may come as late as 1:10 AM". */
const when = (d: SleepBeforeR1, fmt: Fmt): string => `${d.exact ? 'come at' : 'may come as late as'} ${fmt(d.r1At)}`;
const after = (d: SleepBeforeR1, fmt: Fmt): string => `after your hours end at ${fmt(d.sleepAt)}`;

/** A route card or a timeline ascension. */
export const sleepBeforeR1Card = (d: SleepBeforeR1, fmt: Fmt): string =>
  `Your silo buys (R1) ${when(d, fmt)}, ${after(d, fmt)}. Prestige in the morning, or re-plan.`;

/** My runs, Next step or Follow, before the next prestige. */
export const sleepBeforeR1NextStep = (d: SleepBeforeR1, fmt: Fmt): string =>
  `If you prestige now, your silo buys (R1) ${when(d, fmt)}, ${after(d, fmt)}.`;

/** The Build-up tracker, for the ascension you are in. */
export const sleepBeforeR1Tracker = (d: SleepBeforeR1, fmt: Fmt): string => `Your silo buys (R1) ${when(d, fmt)}, ${after(d, fmt)}.`;
