/**
 * A FRESH ASCENSION'S C3 WAIT, FOR THE FULL TIMELINE (M13, 12 Nov 2026, Jordan): the early build-up is hours, but the
 * third Curiosity wait (C3) can take 1 to 3 weeks, and the timeline said only "Its first hours: about 6 build-up
 * shifts". It lists C3 as its own line, "Wait on Curiosity (C3): about Dec 22 to Jan 1": from the ascension's start to
 * its first listed shift, H1 (the swap to Humility once C3 is done), which the table's version 2 cell stores (`h1At`;
 * search/legShifts.ts lists it first). Display only (a "Words" file: out of the result code's inputs); DRAFT words.
 */

/** The shortest C3 wait worth a line of its own: under it, it is part of the first hours. */
export const C3_WAIT_MIN_SECONDS = 12 * 3600;

export interface C3Step {
  /** instantSteps `AscensionStep`: when the ascension's prestige is, and its listed shifts. */
  prestigeAt: number;
  shifts: readonly { at: number; egg: string }[];
  simulated: boolean;
  /** The estimated opening (lib/openingShifts.ts): set only for a fresh ascension from the table. */
  openingShifts?: number;
}

/** A fresh table ascension's C3 wait, its start to its first shift when that is H1; null when there is none to say. */
export function c3Wait(l: C3Step): { from: number; to: number } | null {
  if (l.simulated || !l.openingShifts) return null;
  const first = l.shifts.filter(s => Number.isFinite(s.at)).reduce<{ at: number; egg: string } | null>((a, s) => (!a || s.at < a.at ? s : a), null);
  return first && first.egg === 'humility' && first.at - l.prestigeAt >= C3_WAIT_MIN_SECONDS ? { from: l.prestigeAt, to: first.at } : null;
}
