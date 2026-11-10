/**
 * Which simulator a precomputed table's cells came from, so a table built by older code is never
 * passed off as an answer from the code the page runs (the rule: never deploy cells built with a
 * different engine than the page).
 *
 * SIM_VERSION is set BY HAND, and changes only when the simulator's RESULTS change: a commit that
 * moves any table cell gets a new SIM_VERSION (a date and a word, e.g. `2026-10-13-lowte-gate`), and
 * the tables are rebuilt or re-checked before they carry it. A content hash of the code was not used
 * on its own, because a comment or a refactor would then disown every table although no cell moved;
 * `bitcheck` (~/code/aaap-tools/bitcheck-head.sh) is what proves cells unchanged.
 *
 * The guard: simVersion.spec.ts hashes SIM_SOURCES and compares with SIM_SOURCE_HASH. When the
 * simulator's code changes, that test fails until someone decides which case it is:
 *  - results changed: bump SIM_VERSION (tables need regenerating, or restamping after a bitcheck
 *    shows they are identical), then update SIM_SOURCE_HASH;
 *  - results unchanged (a refactor, a comment; bitcheck all identical): update SIM_SOURCE_HASH only.
 * It covers the code that decides a cell most often (the engine, the ascension and shift code, the
 * table build). Not everything a cell touches (lib/, calculations/) is in it; a change there that
 * moves results still needs a bump by hand.
 *
 * Where the stamp goes: scripts/precompute.ts writes it into a table's meta.json at --generate and its
 * header at --pack, and --manifest copies it into tables.json. The page compares it at load
 * (`tableSimMismatch`) and says so on the instant answer when they differ; it also rides in the CSV
 * header and the instant record.
 */
// 2026-11-03-sim3: Bust Unions read by its real id (vehicles), multi-level delivery research in smart buy
// (calculations/, outside the hash), Continue my build-up buys only on each purchase's own egg, K2 within 24 h,
// and the 60 s rule (no sub-minute waits: a non-instant wait is at least a minute, offline).
// 2026-11-09-sim4: Joo's PR #729 merged (Carpet's main c36a25cf + joo/main 595aa573). The mover is 799a6502
// (hr/% at the charged price; delivery research planned as a set, calculations/deliveryLevelSearch.ts) with
// b2ce0b99 and d180ce708 (lookahead pairs); also standard permit (60cf8977) and the research sale on sim time
// (8a5892b6, b8c6cb8e). Joo's planners refactor moved engine/apply/math.ts and most calculations into lib/planners
// (hashed below). Tables are rebuilt for it (Jordan, 9 Nov: Option B).
export const SIM_VERSION = '2026-11-09-sim4';

/** The simulator code the guard hashes (repo-relative to wasmegg/ascension-planner): directories
 *  are taken whole, every .ts but the specs. */
export const SIM_SOURCES = [
  'src/engine',
  'src/auto',
  'src/search/tableBuild.ts',
  'src/search/precomputedLeg.ts',
  // sim4 (9 Nov 2026): the ascension planner's own calculations too. Joo's 799a6502 moved table cells from here
  // (researchRanking.ts, smartBuyPreview.ts, deliveryLevelSearch.ts) while the hash above stayed put.
  'src/calculations',
  // Joo's shared planner code (PR #729) moved the engine math and the hab/vehicle/silo planners here.
  '../../lib/planners/engine',
  '../../lib/planners/calculations',
];

/** sha256 of SIM_SOURCES as simVersion.spec.ts computes it. See the note at the top.
 *  5 Nov 2026 (spec-joo729): re-pasted for the coverage change above (lib/planners added) and Joo's
 *  merged code, then for the manual-planner-only 2x fix in the shared hab/vehicle planners (the auto
 *  planner passes no start time, so no transitions). Not a SIM_VERSION decision: see notes joo729-merge.
 *  9 Nov 2026 (spec-sim4): re-pasted for isTierUnlocked's short count (commonResearch.ts), a speed-up
 *  with the same answers: its spec checks it against the full count, and the tables bitcheck. Then for
 *  boostTransitionsFrom's memo (engine/apply/math.ts), the same lists as its walk (same checks). Then for
 *  the player's hours for purchases (advanceTime.ts stretchToHours, game expert): only with context.holdUntil,
 *  which the tables never set, so cells stay the same (tables bitcheck). */
export const SIM_SOURCE_HASH = 'c1540c6bc7d314c1b047e84f83991803b994efd07664e6d08cd6283ce266a150';

/**
 * Why a table's cells may not match this page's simulator, or null when they do. A table with no
 * stamp predates stamping: it is treated as older, never as current.
 */
export function tableSimMismatch(header: { simVersion?: string } | null | undefined): string | null {
  if (!header) return null;
  if (header.simVersion === SIM_VERSION) return null;
  return header.simVersion ? `simulator ${header.simVersion}` : 'an older simulator';
}

/** The stamp a joined table carries (compositeTable): the two parts' when they agree, else none,
 *  which tableSimMismatch reports as older. */
export function jointSimVersion(a?: string, b?: string): string | undefined {
  return a && a === b ? a : undefined;
}
