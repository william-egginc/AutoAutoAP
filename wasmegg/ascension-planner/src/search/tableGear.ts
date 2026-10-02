/**
 * Per-account precomputed tables (the user, 1 Oct 2026: tables built on real gear, not only on the
 * maxed reference account). Two things the generator (scripts/precompute.ts) and the page
 * (components/auto/InstantRoute.vue) must agree on exactly, so they live here once:
 *
 * THE FILE'S NAME. A table is served at a public URL, and nothing derived from the player id may be
 * guessable from it (search/owner.ts: the id is sixteen digits, so a plain hash of it can be searched).
 * The name is PBKDF2-SHA256 of the id with a fixed salt and 200,000 iterations: a tenth of a second
 * in the browser, once, and far beyond searching all 10^16 ids. The id itself never leaves the page.
 *
 * THE GEAR STAMP. What a table's builds depend on besides the start: the sets the simulator's
 * optimizer picks from the inventory (earnings, and delivery at no research and at the research a
 * build waits with), epic research and colleggtibles. Stamped into the table when it is made; the page
 * works the same stamp out from the loaded save and uses the table only when they match. The sets, not
 * the raw inventory: a new artifact that changes no choice leaves the table exact, and the save's
 * current research (which moves mid-ascension) is not part of it.
 */
import { getOptimalELRSet } from '@/lib/artifacts';
import { describeLoadoutSlots, type LoadoutSlot } from './csv';
import { getColleggtibleTiers } from 'lib/collegtibles';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SearchInputs } from './types';

const SALT = 'egg-precompute-table-v1';
const ITERATIONS = 200_000;

/** The table file's name for a player id: `acct-` and 24 hex digits. */
export async function tableName(playerId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(playerId), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    96
  );
  return 'acct-' + [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('') + '.bin';
}

export interface TableGear {
  earnings: LoadoutSlot[];
  /** The delivery set the optimizer picks with no common research, and with `research`. */
  deliveryBare: LoadoutSlot[];
  deliveryFull: LoadoutSlot[];
  /** The research `deliveryFull` is picked at (the table's k3 research). */
  research: Record<string, number>;
  epicResearch: Record<string, number>;
  colleggtibles: Record<string, number>;
}

/** The gear stamp of the account `inputs` was collected from. `earnings`: its earnings set as the
 *  store reads it (`readInventory().earnings`). */
export function gearStamp(
  inputs: SearchInputs,
  earnings: EquippedArtifact[] | null | undefined,
  research: Record<string, number>
): TableGear | null {
  const ctx = inputs.context;
  const raw = ctx.rawBackup;
  if (!raw) return null;
  const delivery = (commonResearch: Record<string, number>) =>
    describeLoadoutSlots(
      getOptimalELRSet(raw, {
        commonResearch,
        epicResearchLevels: ctx.epicResearchLevels,
        colleggtibleModifiers: ctx.colleggtibleModifiers,
        assumeMaxHabsVehicles: true,
      }) as EquippedArtifact[] | null
    );
  const sorted = (r: Record<string, number> | undefined) =>
    Object.fromEntries(Object.entries(r ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  return {
    earnings: describeLoadoutSlots(earnings),
    deliveryBare: delivery({}),
    deliveryFull: delivery(research),
    research: sorted(research),
    epicResearch: sorted(ctx.epicResearchLevels as Record<string, number>),
    colleggtibles: sorted(getColleggtibleTiers(raw)),
  };
}

/** What differs between a table's stamp and the player's, in words; empty when they match. */
export function gearChanges(table: TableGear, mine: TableGear): string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const out: string[] = [];
  if (!same(table.earnings, mine.earnings)) out.push('earnings set');
  if (!same(table.deliveryBare, mine.deliveryBare) || !same(table.deliveryFull, mine.deliveryFull))
    out.push('delivery set');
  if (!same(table.epicResearch, mine.epicResearch)) out.push('epic research');
  if (!same(table.colleggtibles, mine.colleggtibles)) out.push('colleggtibles');
  return out;
}
