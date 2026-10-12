/**
 * The comparison block (SearchCompare.vue; the user, 12 Oct 2026): the instant answer, the stronger
 * check and Exhaustive side by side, labelled, with the best marked. Fastest: the soonest finish wins.
 * By a date: the highest TE, then the most spare.
 */
export interface CompareEntry {
  chain: number[];
  /** Unix second the target (Fastest) or the last stop (By a date) is reached. */
  end: number;
  endTE: number;
  spare?: number;
  exact?: boolean;
  /** Still running: a best so far. */
  running?: boolean;
  /** When it was found, ms (searches). */
  at?: number;
}

export interface CompareRow {
  id: 'instant' | 'stronger' | 'exhaustive';
  label: string;
  entry: CompareEntry | null;
  best: boolean;
}

export const COMPARE_LABELS: Record<CompareRow['id'], string> = {
  instant: 'Instant answer',
  stronger: 'Stronger check',
  exhaustive: 'Exhaustive',
};

/** Whether `a` is a better answer than `b` for this goal. */
export function better(goal: 'fastest' | 'date', a: CompareEntry, b: CompareEntry): boolean {
  if (goal === 'fastest') return a.end < b.end;
  if (a.endTE !== b.endTE) return a.endTE > b.endTE;
  return (a.spare ?? 0) > (b.spare ?? 0);
}

/** The better of two answers (either may be missing). */
export function pick(goal: 'fastest' | 'date', a: CompareEntry | null, b: CompareEntry | null): CompareEntry | null {
  if (!a) return b;
  if (!b) return a;
  return better(goal, b, a) ? b : a;
}

/** The three rows, the best marked (none when fewer than two have an answer, or on a tie with the
 *  instant answer: then nothing beat it). */
export function compareRows(
  goal: 'fastest' | 'date',
  e: { instant: CompareEntry | null; stronger: CompareEntry | null; exhaustive: CompareEntry | null }
): CompareRow[] {
  const ids: CompareRow['id'][] = ['instant', 'stronger', 'exhaustive'];
  const present = ids.filter(id => e[id]);
  let top: CompareRow['id'] | null = null;
  for (const id of present) if (!top || better(goal, e[id]!, e[top]!)) top = id;
  return ids.map(id => ({
    id,
    label: COMPARE_LABELS[id],
    entry: e[id],
    best: present.length > 1 && id === top,
  }));
}
