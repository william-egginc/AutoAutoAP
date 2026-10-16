/**
 * "Where you stand" on My runs' saved-answer tiles (Jordan's extra 5, spec section 4): your place among the NAMED
 * players on the board, as a count only ("3rd of 12 named players"), from the rows the board part has already
 * loaded. No names are shown and nothing is fetched. The board's own rules decide who counts and how they rank
 * (lib/leaderboardRank.ts `buildDeadlineBoard`, `buildRace`).
 *
 * Your line is found by your runs' ids (the rows My runs already knows are yours). Not on the board under a name
 * (anonymous, hidden, or never sent): where your answer WOULD sit, said as such.
 */
import { buildDeadlineBoard, buildRace, type BoardRow } from './leaderboardRank';

export interface Standing {
  place: number;
  of: number;
  /** Your answer isn't on the board under a name: where it would sit. */
  wouldBe: boolean;
}

const idsOf = (rows: readonly BoardRow[]) => new Set(rows.map(r => r.id).filter((x): x is string => !!x));

/** Egg Day (or any date): by TE, then spare, as the board ranks. `mine`: your answer's TE and spare (seconds). */
export function dateStanding(
  rows: readonly BoardRow[] | null,
  myRows: readonly BoardRow[] | null,
  deadline: number,
  nowMs: number,
  mine: { te: number; spareSeconds: number } | null
): Standing | null {
  if (!rows?.length) return null;
  const group = buildDeadlineBoard(rows, { now: nowMs }).find(g => g.deadline === deadline);
  const entries = group?.entries ?? [];
  const ids = idsOf(myRows ?? []);
  const own = ids.size ? entries.find(e => [e.best, ...e.others].some(r => r.id && ids.has(r.id))) : undefined;
  if (own?.rank) return { place: own.rank, of: entries.length, wouldBe: false };
  if (!mine || !entries.length) return null;
  const ahead = entries.filter(e => e.te > mine.te || (e.te === mine.te && e.spare > mine.spareSeconds)).length;
  return { place: ahead + 1, of: entries.length + 1, wouldBe: true };
}

/** The race to `target`: by finish. `mineFinishMs`: your answer's finish. */
export function raceStanding(
  rows: readonly BoardRow[] | null,
  myRows: readonly BoardRow[] | null,
  target: number,
  nowMs: number,
  mineFinishMs: number | null
): Standing | null {
  if (!rows?.length) return null;
  const race = buildRace(rows, { target, now: nowMs });
  const ids = idsOf(myRows ?? []);
  const own = ids.size ? race.entries.find(e => e.plans.some(p => p.folded.copies.some(c => c.id && ids.has(c.id)))) : undefined;
  if (own) return { place: own.rank, of: race.entries.length, wouldBe: false };
  if (mineFinishMs == null || !race.entries.length) return null;
  const ahead = race.entries.filter(e => (e.best.finish ?? Infinity) < mineFinishMs).length;
  return { place: ahead + 1, of: race.entries.length + 1, wouldBe: true };
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

/** "3rd of 12 named players", "would be 3rd of 13 named players". */
export function standingWords(s: Standing | null): string {
  if (!s) return '';
  return `${s.wouldBe ? 'would be ' : ''}${ordinal(s.place)} of ${s.of} named player${s.of === 1 ? '' : 's'}`;
}
