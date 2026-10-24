/**
 * The note on a counts-table row that is within about a tenth of a day of the fastest (Allan and carpetsage,
 * Discord, 14 Oct). Rows with MORE ascensions than the fastest are usually the same route with one ascension cut
 * in two: one more prestige for no gain. Rows with FEWER are a real option: one fewer prestige for a little time,
 * with the real gap, and a small highlight.
 */
export interface NearTie {
  kind: 'fewer' | 'more';
  text: string;
}

/** The gap in words: "under an hour", "~1 h", "~2 h". */
export function gapWords(seconds: number): string {
  const h = seconds / 3600;
  if (h < 0.75) return 'under an hour';
  return `~${Math.max(1, Math.round(h))} h`;
}

/** Null for the same number of ascensions (a different route of the same length: nothing to say). */
export function nearTieOf(rowAscensions: number, bestAscensions: number, gapSeconds: number): NearTie | null {
  if (rowAscensions < bestAscensions) {
    const n = bestAscensions - rowAscensions;
    const fewer = n === 1 ? 'one fewer prestige' : `${n} fewer prestiges`;
    const later = gapSeconds / 3600 < 0.75 ? 'only under an hour later' : `only ${gapWords(gapSeconds)} later`;
    return { kind: 'fewer', text: `${fewer}, ${later}` };
  }
  if (rowAscensions > bestAscensions) return { kind: 'more', text: 'about the same: one more prestige for no gain' };
  return null;
}
