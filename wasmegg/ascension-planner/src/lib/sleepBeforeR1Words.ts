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
  // Held shifts: R1 waits for the player's hours to start again, which is a known time, so no "about".
  if (d.held && d.waitsUntil != null) return `wait until ${fmt(d.waitsUntil)}, so your farm has 1 silo overnight`;
  const end = `after your hours end at ${fmt(d.sleepAt)}`;
  if (!d.exact) return `may come as late as ${fmt(d.doneBy)}, ${end}`;
  if (d.r1At >= d.sleepAt) return `start at ${fmt(d.r1At)}, ${end}`;
  return `start at ${fmt(d.r1At)} and run until about ${fmt(d.doneBy)}, ${end}`;
}

/** A route card or a timeline ascension. */
export const sleepBeforeR1Card = (d: SleepBeforeR1, fmt: Fmt): string =>
  `Your silo buys (R1) ${clause(d, fmt)}.${d.held ? '' : ' Prestige in the morning, or re-plan.'}`;

/** My runs, Next step or Follow, before the next prestige. */
export const sleepBeforeR1NextStep = (d: SleepBeforeR1, fmt: Fmt): string =>
  `If you prestige now, your silo buys (R1) ${clause(d, fmt)}.`;

/** The Build-up tracker, for the ascension you are in. */
export const sleepBeforeR1Tracker = (d: SleepBeforeR1, fmt: Fmt): string => `Your silo buys (R1) ${clause(d, fmt)}.`;

/**
 * The Build-up tracker, while a Monday 2x earnings stretch (lib/planners/events.ts) is ahead in its plan (Jordan, 15 Nov 2026).
 * Time away is paid at the rate in force when the player checks in, so checking in inside the stretch pays the whole
 * stretch away at 2x, and leaving before it ends and coming back after it does not. `fmt` is the shared formatter, in
 * the player's own zone, so the times need no "Pacific".
 */
export function boost2xLine(d: { start: number; end: number; active: boolean }, fmt: Fmt): string {
  if (d.active) return `2x earnings are on until ${fmt(d.end)}. Time away is paid at the rate when you check in, so collect before then.`;
  return `2x earnings run from ${fmt(d.start)} to ${fmt(d.end)}. Time away is paid at the rate when you check in, so check in between those times.`;
}
