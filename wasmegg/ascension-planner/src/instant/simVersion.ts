/**
 * Which simulator a precomputed table's cells came from, so a table built by other code is never
 * passed off as an answer from the simulator this page runs (Joo's, in src/auto and src/engine).
 *
 * The table's header carries a stamp (`simVersion`), written when it is packed. This page accepts
 * only the stamps listed here, each a simulator whose results are Joo's to the bit. A table with no
 * stamp, or another one, gets no instant answer (the card says the table is still being built).
 *
 * WHEN TO CHANGE IT. When Joo's simulator changes its results (any cell would move), the old tables
 * no longer match it: give it a new stamp here, and rebuild the table (or restamp it once a bit-check
 * shows its cells unchanged). A table built by another simulator (e.g. the AutoAutoAP fork's) may be
 * added only after such a bit-check shows its cells identical to this one's.
 */
export const SIM_VERSION = 'joo-upstream-6e118a72';

/** Every stamp whose cells are this page's simulator's. */
export const ACCEPTED_SIM_VERSIONS: readonly string[] = [SIM_VERSION];

/** Why a table's cells may not be this page's simulator's, or null when they are. */
export function tableSimMismatch(header: { simVersion?: string; fake?: boolean } | null | undefined): string | null {
  if (!header) return null;
  if (header.fake) return 'filled in for testing, not a real table';
  if (header.simVersion && ACCEPTED_SIM_VERSIONS.includes(header.simVersion)) return null;
  return header.simVersion ? `built with another simulator (${header.simVersion})` : 'not stamped with a simulator';
}
