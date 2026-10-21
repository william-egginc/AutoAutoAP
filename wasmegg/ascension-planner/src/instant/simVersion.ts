/**
 * Which simulator a precomputed table's cells came from, so a table built by other code is never
 * passed off as an answer from the simulator this page runs (Joo's, in src/auto and src/engine).
 *
 * The table's header carries a stamp (`simVersion`), written when it is packed. This page accepts
 * only the stamps listed here, each a simulator whose results are Joo's to the bit. A table with no
 * stamp, or another one, gets no instant answer (the card says the table is still being built).
 *
 * No guard hashes Joo's simulator code here (the fork has one over its own engine): this page leaves
 * his code unchanged, so the stamp is changed by hand when his results change.
 *
 * WHEN TO CHANGE IT. When Joo's simulator changes its results (any cell would move), the old tables
 * no longer match it: give it a new stamp here, and rebuild the table (or restamp it once a bit-check
 * shows its cells unchanged). A table built by another simulator (e.g. the AutoAutoAP fork's) may be
 * added only after such a bit-check shows its cells identical to this one's.
 */
/** The PC's maxed table (built on the fork's joo-lite b70ced72): 51 of its cells, TE 75-339 at five
 *  hours of the week, are bit-identical to this simulator's (Joo's upstream 6e118a72, unchanged here;
 *  aaap-tools notes/joo-fork-bitcheck.md, 19 Oct 2026), so its stamp is this page's. */
export const SIM_VERSION = '2026-10-19-joo717';

/**
 * Joo's upstream 0214e968, the stamp on the delivery tables in the shared storage (deliveryTables.ts;
 * his Table Builder, doubler on, fixed delivery). Its maxed cells at TE 175 are bit-identical to his
 * 31b596bb doubler-on generator's (168/168, aaap-tools scratch-cteshift notes, 21 Oct 2026), whose
 * cells match this page's (peakELR, saleEnd and builds identical in 336 cells, waitStart within 0.14 s;
 * notes/joo-table-check.md) and whose account and gear tables this page already takes under
 * SIM_VERSION. Not a bit-check of a delivery table against this page's simulator: drop it to refuse
 * the delivery tables again.
 */
export const JOO_DELIVERY_SIM_VERSION = '0214e968';

/** Every stamp whose cells are this page's simulator's. */
export const ACCEPTED_SIM_VERSIONS: readonly string[] = [SIM_VERSION, JOO_DELIVERY_SIM_VERSION];

/** Why a table's cells may not be this page's simulator's, or null when they are. */
export function tableSimMismatch(header: { simVersion?: string; fake?: boolean } | null | undefined): string | null {
  if (!header) return null;
  if (header.fake) return 'filled in for testing, not a real table';
  if (header.simVersion && ACCEPTED_SIM_VERSIONS.includes(header.simVersion)) return null;
  return header.simVersion ? `built with another simulator (${header.simVersion})` : 'not stamped with a simulator';
}
