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
export const SIM_VERSION = '2026-10-13-lowte-gate';

/** The simulator code the guard hashes (repo-relative to wasmegg/ascension-planner): directories
 *  are taken whole, every .ts but the specs. */
export const SIM_SOURCES = ['src/engine', 'src/auto', 'src/search/tableBuild.ts', 'src/search/precomputedLeg.ts'];

/** sha256 of SIM_SOURCES as simVersion.spec.ts computes it. See the note at the top. */
export const SIM_SOURCE_HASH = 'f074f328d7ac39bee70852b3598f1f34c8a88eee2d7701c2854398ca878a3a7c';

/**
 * Why a table's cells may not match this page's simulator, or null when they do. A table with no
 * stamp predates stamping: it is treated as older, never as current.
 */
export function tableSimMismatch(header: { simVersion?: string } | null | undefined): string | null {
  if (!header) return null;
  if (header.simVersion === SIM_VERSION) return null;
  return header.simVersion ? `built with simulator ${header.simVersion}` : 'built before tables were stamped';
}

/** The stamp a joined table carries (compositeTable): the two parts' when they agree, else none,
 *  which tableSimMismatch reports as older. */
export function jointSimVersion(a?: string, b?: string): string | undefined {
  return a && a === b ? a : undefined;
}
