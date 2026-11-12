/**
 * THE PLAYER LINE ABOVE THE EGG CARD (12 Nov 2026, Jordan; UI builds it): "Williamthe5thc · 197 claimed TE · 2 pending ·
 * 328 Clothed TE". Spelt out, not "CTE": the page says Clothed TE everywhere else (Your eggs, the wiki, the explorer),
 * "CTE" appears only on the explorer's chart axes, and the line has room. So no "?" is needed; `CLOTHED_TE_TIP` is for a
 * screen too narrow for the long word, where "CTE" is shown with a "?" that says it.
 *
 * A *Words.ts file: wording only, never part of the result code hash.
 */

/** `name`: the player's in-game name as the save has it (null: left out). `pending`: TE earned but not yet claimed
 *  (0 or null: left out). `short`: "CTE" for "Clothed TE" (narrow screens, with CLOTHED_TE_TIP beside it). */
export function playerLine(o: { name?: string | null; claimed: number; pending?: number | null; clothed?: number | null; short?: boolean }): string {
  const parts: string[] = [];
  if (o.name) parts.push(o.name);
  parts.push(`${o.claimed} claimed TE`);
  if (o.pending && o.pending > 0) parts.push(`${o.pending} pending`);
  if (o.clothed != null && Number.isFinite(o.clothed)) parts.push(`${Math.round(o.clothed)} ${o.short ? 'CTE' : 'Clothed TE'}`);
  return parts.join(' · ');
}

/** The "?" beside a short "CTE". */
export const CLOTHED_TE_TIP = 'CTE is Clothed TE: your TE plus what your earnings artifacts add to it.';
