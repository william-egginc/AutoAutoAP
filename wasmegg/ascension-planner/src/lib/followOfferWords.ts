/**
 * WHEN AN INSTANT ANSWER IS OFFERED OVER A FOLLOW (QA t230, 12 Nov 2026): lib/searchPlan.ts `followPrompt` offers a
 * result only when it is newer than the follow (`c.at > f.at`). An instant answer's `at` is its snapshot's time when it was
 * restored and Date.now() when it was recomputed, so one saved 1 to 3 s before Follow was pressed was never offered (about
 * 1 session in 3, and sticky for the session). An instant answer is worked out again on each visit: its age says nothing,
 * so it counts as newer than the follow. Fast, Exact and Custom results keep the rule (found before the press: the player
 * has seen them). A helper outside searchPlan.ts so the result code's inputs stay as they are ("Words" file name).
 */
export function offerAt<C extends { source: string; at: number }>(candidate: C, followAt: number): C {
  return candidate.source === 'instant' && !(candidate.at > followAt) ? { ...candidate, at: followAt + 1 } : candidate;
}
