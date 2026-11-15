/**
 * "You won't reach R1 before you sleep" (Jordan's option a, 15 Nov 2026; Reliability's `{ r1At, doneBy, sleepAt, exact }`,
 * unix seconds). R1 is where the silos are bought; `doneBy` is when those buys are done (up to an hour after R1). The
 * warning is about being around until then: past `sleepAt` the farm sits on few silos overnight, so the line suggests
 * prestiging in the morning or re-planning. `exact: false` means the times are an upper bound (r1At = doneBy). Shown only
 * when the player's hours are set and shifts aren't held. The caller passes the shared 12-hour formatter (`fmt`), so the
 * times read "9:00 AM". Wording only.
 */
import type { SleepBeforeR1 } from './sleepBeforeR1';

type Fmt = (unixSeconds: number) => string;

/** What happens to R1 against the hours, said once for all three places. */
function clause(d: SleepBeforeR1, fmt: Fmt): string {
  const end = `after your hours end at ${fmt(d.sleepAt)}`;
  if (!d.exact) return `may come as late as ${fmt(d.doneBy)}, ${end}`;
  if (d.r1At >= d.sleepAt) return `start at ${fmt(d.r1At)}, ${end}`;
  return `start at ${fmt(d.r1At)} and run until about ${fmt(d.doneBy)}, ${end}`;
}

/** A route card or a timeline ascension. */
export const sleepBeforeR1Card = (d: SleepBeforeR1, fmt: Fmt): string =>
  `Your silo buys (R1) ${clause(d, fmt)}. Prestige in the morning, or re-plan.`;

/** My runs, Next step or Follow, before the next prestige. */
export const sleepBeforeR1NextStep = (d: SleepBeforeR1, fmt: Fmt): string =>
  `If you prestige now, your silo buys (R1) ${clause(d, fmt)}.`;

/** The Build-up tracker, for the ascension you are in. */
export const sleepBeforeR1Tracker = (d: SleepBeforeR1, fmt: Fmt): string => `Your silo buys (R1) ${clause(d, fmt)}.`;
