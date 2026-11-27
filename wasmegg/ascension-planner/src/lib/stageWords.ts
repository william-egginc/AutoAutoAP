/**
 * The search's stage names in plain words (review W2, 15 Nov 2026). The driver (src/search/driver.ts, part of the
 * result code hash) names its stages for people who read the code: "stage 4: coordinate descent". The store keeps
 * those in the run log and the black box, and says these on the run bar, the screens and the phone watch. Wording
 * only, so never part of the result hash.
 */

/** The run bar's stage line. A stage this doesn't know loses its "stage N:" and is otherwise left as it is. */
export function stageWords(stage: string): string {
  const s = stage.trim();
  if (/^stage 4a: solving the last (stop|checkpoint)/.test(s)) return 'solving the last stop';
  if (s === 'stage 4: coordinate descent') return 'fine-tuning each stop';
  if (s === 'stage 4c: other ascension counts') return 'checking other numbers of ascensions';
  let m = /^stage 4c: one pass at (\d+) ascensions/.exec(s);
  if (m) return `checking ${m[1]} ascensions`;
  m = /^stage 4d: fine-tuning (\d+) ascensions/.exec(s);
  if (m) return `fine-tuning ${m[1]} ascensions`;
  if (s === 'stage 5: exhaustive 2-D slices') return 'trying every route in two-stop slices';
  if (s === 'stage 6: exhaustive 3-D slices') return 'trying every route in three-stop slices';
  m = /^stage 7: prestige-count probe(?: \(round (\d+)\))?$/.exec(s);
  if (m) return `checking how many ascensions are best${m[1] ? ` (round ${m[1]})` : ''}`;
  if (s === 'stage 7b: re-polishing the new count') return 'fine-tuning the new count';
  return s.replace(/^stage \w+: /, '');
}

const COMPLETED: Record<string, string> = {
  'last-checkpoint sweep': 'solving the last stop',
  'coordinate descent': 'fine-tuning each stop',
  'other ascension counts': 'checking other numbers of ascensions',
  '2-D slices': 'two-stop slices',
  '3-D slices': 'three-stop slices',
  'prestige-count probe': 'checking how many ascensions are best',
  none: 'none yet',
};

/** The last finished stage, for the "stopped early" and "finished" lines (the driver's `lastCompletedStage`). */
export function completedStageWords(stage: string): string {
  return COMPLETED[stage] ?? stage;
}

/**
 * What to call one Nearby-routes run: Fast (the quick level) or Exact (normal, or thorough with Very high), as the
 * page names the two choices. "Fast and Exact" is the pair, never a run.
 */
export function smartRunName(effort: 'quick' | 'normal' | 'thorough' | undefined | null): string {
  return effort === 'normal' || effort === 'thorough' ? 'Exact' : 'Fast';
}
