/**
 * What the Auto Planner says when a run's start did not get an answer from the browser's storage (spec-stuck3,
 * stores/chainSearch.ts `abandonRunStart`). Wording only (lib/resultCodeHash.ts leaves *Words.ts files out). Jordan's OK,
 * 7 Nov 2026 (Words' version).
 */
export const RUN_STORAGE_STUCK =
  "The run didn't start: this browser's storage didn't answer. Close any other tab of the planner, or reload this page, then press Run again.";
