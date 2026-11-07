/**
 * What the Auto Planner says when a run's start did not get an answer from the browser's storage (spec-stuck3,
 * stores/chainSearch.ts `abandonRunStart`). Wording only (lib/resultCodeHash.ts leaves *Words.ts files out). DRAFT.
 */
export const RUN_STORAGE_STUCK =
  "The run didn't start: this browser's storage didn't answer. Close the planner's other tabs, or reload the page, then press Run again.";
