/**
 * The Silo trick setting and the tracker's hint when the plan does not count it (Jordan, 10 Nov 2026: a setting in
 * Setup, off by default; the game expert's spec-silotrick). The trick: go offline after Sunday's check-in and collect
 * inside Monday's 2x Earnings event, so the time away is paid at 2x, up to what your silos hold. Wording only (a
 * *Words.ts file is out of the result code hash, lib/resultCodeHash.ts `isWordingOnly`). UI wires them.
 */

/** Setup's label. */
export const SILO_TRICK_LABEL = 'Silo trick';

/** The help line under it: what it is, and what the setting changes. No numbers from one save. */
export const SILO_TRICK_HELP =
  "Go offline after Sunday's check-in and collect inside Monday's 2x Earnings event: the time away is paid at 2x, up to what your silos hold. On, the plan counts that cash. Off, it does not, so it may plan fewer buys than you can afford. On assumes you do it every week.";

/** The Build-up tracker's hint under a "go offline until Mon 10:01 am" line when the setting is off (nothing when on). */
export const SILO_TRICK_NOT_COUNTED =
  'This plan does not count the cash from the silo trick. Turn on Silo trick in Setup to count it.';
