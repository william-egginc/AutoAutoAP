/**
 * A FRESH ASCENSION'S BUILD-UP SHIFTS, ESTIMATED (27 Oct 2026, Jordan: "All planned shifts 24" while Single run said
 * +48 for the same plan). The instant answer's shifts start at H1 (search/legShifts.ts, tableV2.ts `replayTail`): the
 * table does not store the opening's shifts until its next rebuild, so a plan made from it under-counts every fresh
 * ascension by its opening. Until the table carries them, each fresh ascension adds the simulator's standard opening.
 *
 * The opening, from the simulator (src/auto/ascension.ts, read only): a fresh ascension starts on Curiosity
 * (`currentEgg: 'curiosity'`, so C1 has no shift), runs one C1 -> K1 -> I1 pass (`runC1K1I1Segment`, 'CKI'), then
 * `allShifts` up to C3: C2, K2, R1, C3. That is six shifts: K1 (Kindness), I1 (Integrity), C2 (Curiosity), K2
 * (Kindness), R1 (Resilience) and C3 (Curiosity); search/routeFinder.ts names the same six ("K1, I1, C2, K2, R1 and the
 * shift into C3"). "About": C2, K2 or R1 are dropped when they would buy nothing (`SKIP_WHEN_NO_PURCHASES`) and a
 * low-TE account may need more C1 -> K1 -> I1 rounds (auto/lowTeOpening.ts), so the real count can be a little off.
 *
 * Which ascensions get it (`estimatedOpening`): a fresh one (its variant is an 'N-sale' build, lib/buildUpLine.ts
 * `buildUpSales`; not 'continue', 'buildup' or 'first', which carry on the save's own farm), not simulated on the save
 * (its shifts are exact and include the opening), and whose listed shifts do not include the opening already (the
 * table's always start with H1, a shift to Humility; a leg whose first shift is to another egg lists its own). Pure.
 */
import { buildUpSales } from './buildUpLine';

/** The simulator's standard opening after a fresh start on Curiosity: the shift's name and the egg it shifts TO. */
export const OPENING_SHIFTS: readonly { name: string; egg: string }[] = [
  { name: 'K1', egg: 'kindness' },
  { name: 'I1', egg: 'integrity' },
  { name: 'C2', egg: 'curiosity' },
  { name: 'K2', egg: 'kindness' },
  { name: 'R1', egg: 'resilience' },
  { name: 'C3', egg: 'curiosity' },
];

/** Shifts a fresh ascension makes before H1: 6. */
export const OPENING_SHIFT_COUNT = OPENING_SHIFTS.length;

export interface OpeningLeg {
  /** The simulated leg's variant (LegSummary.key); wins over `label`. */
  variant?: string | null;
  /** The table leg's 'continue', '2-sale', '1-sale-tier13' (RouteLeg.label). */
  label?: string | null;
  /** The ascension simulated on the save (lib/followSim.ts): its shifts are exact. */
  simulated?: boolean;
  shifts?: readonly { at: number; egg: string }[] | null;
}

/** Whether the leg's own shifts already include its opening: the first one (by time) is to another egg than Humility. */
export function listsOpening(leg: Pick<OpeningLeg, 'shifts'>): boolean {
  const list = (leg.shifts ?? []).filter(s => Number.isFinite(s.at));
  if (!list.length) return false;
  const first = list.reduce((a, b) => (b.at < a.at ? b : a));
  return first.egg !== 'humility';
}

/** The build-up shifts to add for this ascension: `OPENING_SHIFT_COUNT` for a fresh one from the table whose shifts
 *  leave its opening out, else 0. */
export function estimatedOpening(leg: OpeningLeg | null | undefined): number {
  if (!leg || leg.simulated) return 0;
  if (buildUpSales(leg.variant ?? leg.label) === null) return 0;
  return listsOpening(leg) ? 0 : OPENING_SHIFT_COUNT;
}
