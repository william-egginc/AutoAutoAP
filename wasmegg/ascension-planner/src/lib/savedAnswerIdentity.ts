/**
 * Which Saved answers (By a date, search/deadlineStore.ts `SavedAnswer`) are the same answer: the same date, the same
 * route and the same save it was priced from (Jordan, 29 Oct 2026: the card's Save answer and Save this answer below
 * it listed one answer twice). Saving one again refreshes the entry already there (stores/chainSearch.ts
 * `saveCurrentAnswer`), and duplicates kept before this collapse when the list is read (`collapseSavedAnswers`).
 *
 * Following is per goal and route (stores/follow.ts), not per entry, so dropping a duplicate never loses a
 * Following ✓: the entry kept names the same goal and route.
 */

/** What an answer is known by: the fields of By a date's result (`SavedDeadlineResult`) read here. */
export interface AnswerLike {
  deadline: number;
  routes: readonly { chain: readonly number[] }[];
  backupAt?: number | null;
  account?: { backupTime?: unknown } | null;
  inputsKey?: string;
}

/** "deadline|route|save"; null for an answer without a route (never merged). The save: when the game took it, else
 *  the run's own key for it, else nothing (an answer from before either was kept). */
export function answerIdentity(r: AnswerLike | null | undefined): string | null {
  const chain = r?.routes?.[0]?.chain;
  if (!r || !chain?.length) return null;
  const backupTime = typeof r.account?.backupTime === 'number' ? r.account.backupTime : null;
  const save = r.backupAt ?? backupTime ?? r.inputsKey ?? '';
  return `${r.deadline}|${chain.join(' ')}|${save}`;
}

interface EntryLike {
  id: string;
  savedAt: number;
  result: AnswerLike;
  save?: unknown;
}

/**
 * Each answer once: of the entries for one answer, the first saved that still has its save (else the first saved) is
 * kept; the others are `dropped` (their ids). The list keeps its order.
 */
export function collapseSavedAnswers<T extends EntryLike>(list: readonly T[]): { kept: T[]; dropped: string[] } {
  const keeper = new Map<string, T>();
  for (const a of list) {
    const k = answerIdentity(a.result);
    if (k === null) continue;
    const cur = keeper.get(k);
    if (!cur || better(a, cur)) keeper.set(k, a);
  }
  const kept: T[] = [];
  const dropped: string[] = [];
  for (const a of list) {
    const k = answerIdentity(a.result);
    if (k === null || keeper.get(k) === a) kept.push(a);
    else dropped.push(a.id);
  }
  return { kept, dropped };
}

/** `a` is the one to keep over `b`: it has its save and `b` doesn't, else it was saved first. */
function better(a: EntryLike, b: EntryLike): boolean {
  const hasA = !!a.save;
  const hasB = !!b.save;
  if (hasA !== hasB) return hasA;
  return a.savedAt < b.savedAt;
}
