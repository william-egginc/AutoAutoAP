/**
 * Tables built on a player's own account or exact gear (ported from the AutoAutoAP fork's
 * search/tableGear.ts, and csv.ts `describeLoadoutSlots`). The generator stamps each table with the
 * gear it was built on; the page works the same stamp out from the loaded save and uses the table
 * only when they match (tableChoice.ts). Keep every name and the stamp byte for byte the fork's: the
 * files are named and stamped by its scripts.
 *
 * THE ACCOUNT TABLE'S NAME. PBKDF2-SHA256 of the player id with a fixed salt and 200,000 iterations
 * (a tenth of a second, once per save): nothing derived from the id can be searched back from the
 * public file name. The id itself never leaves the page.
 *
 * THE GEAR STAMP. The sets the simulator's optimizer picks from the inventory (earnings, and delivery
 * at no research and at the research a build waits with), epic research and colleggtibles. The sets,
 * not the raw inventory: a new artifact that changes no choice leaves the table exact.
 *
 * A GEAR TABLE'S NAME. The first 12 bytes of SHA-256 of the v3 canonical stamp (`canonicalGearV3`):
 * the sets as worn (`asWorn`) and only what the simulator reads of the account. Gear is not private,
 * so a plain hash will do. Only the v3 name is looked up here.
 */
import type { ei } from 'lib';
import { getColleggtibleTiers, modifiersFromColleggtibleTiers, type Modifiers } from 'lib/collegtibles';
import { getOptimalELRSet, getOptimalEarningsSet, type EquippedArtifact } from '@/lib/artifacts';
import { getArtifact, getStone } from '@/lib/artifacts/data';
import { sanitizeLongs } from '@/lib/artifacts/utils';
import { epicResearchDefs } from '@/lib/epicResearch';

const SALT = 'egg-precompute-table-v1';
const ITERATIONS = 200_000;

/** The account table's file name for a player id: `acct-` and 24 hex digits, `.bin`. */
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

/** One artifact of a set with its stones, by label (`T4L Interstellar compass`). */
export interface LoadoutSlot {
  artifact: string;
  /** The stones socketed into it, in slot order, repeats included. */
  stones: string[];
}

/** A set broken out per slot (the fork's csv.ts `describeLoadoutSlots`). */
export function describeLoadoutSlots(loadout: EquippedArtifact[] | null | undefined): LoadoutSlot[] {
  if (!loadout?.length) return [];
  const slots: LoadoutSlot[] = [];
  for (const slot of loadout) {
    const a = getArtifact(slot.artifactId);
    if (!a) continue;
    const stones: string[] = [];
    for (const id of slot.stones) {
      if (!id) continue;
      const st = getStone(id);
      if (st) stones.push(st.label);
    }
    slots.push({ artifact: a.label, stones });
  }
  return slots;
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

/** What the stamp is worked out from: the save and the page's own epic research and colleggtibles
 *  (getSimulationContext(), the same deliveryScale.ts uses). */
export interface StampInputs {
  rawBackup?: ei.IBackup | null;
  epicResearchLevels: Record<string, number>;
  colleggtibleModifiers: Modifiers;
}

/** The gear stamp of the loaded save, with `deliveryFull` picked at `research`; null without a save. */
export function gearStamp(ctx: StampInputs, research: Record<string, number>): TableGear | null {
  const raw = ctx.rawBackup;
  if (!raw) return null;
  // Each on a fresh copy of the save, as the fork does (its getOptimalELRSet caches a structure per
  // backup object; Joo's has no such cache, so the copy changes nothing but is kept to stay the same).
  const delivery = (commonResearch: Record<string, number>) =>
    describeLoadoutSlots(
      getOptimalELRSet(sanitizeLongs(raw) as typeof raw, {
        commonResearch,
        epicResearchLevels: ctx.epicResearchLevels,
        colleggtibleModifiers: ctx.colleggtibleModifiers,
        assumeMaxHabsVehicles: true,
      }) as EquippedArtifact[] | null
    );
  const sorted = (r: Record<string, number> | undefined) =>
    Object.fromEntries(Object.entries(r ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  return {
    earnings: describeLoadoutSlots(getOptimalEarningsSet(raw)),
    deliveryBare: delivery({}),
    deliveryFull: delivery(research),
    research: sorted(research),
    epicResearch: sorted(ctx.epicResearchLevels),
    colleggtibles: sorted(getColleggtibleTiers(raw)),
  };
}

/** The 24 hex digits of SHA-256 of `text`, as a gear table's file name. */
async function gearFile(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return (
    'gear-' +
    [...new Uint8Array(bytes)]
      .slice(0, 12)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('') +
    '.bin'
  );
}

/** The epic research the planner models (epicResearchDefs), each at the save's level or 0, keys
 *  sorted: research it never reads changes no build. */
export function simEpicResearch(levels: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(
    epicResearchDefs
      .map(d => d.id)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map(id => [id, levels?.[id] ?? 0])
  );
}

/** What the colleggtibles do (the multipliers the simulator reads), not which eggs at which tier.
 *  Rounded to 12 significant digits so float order can't split. */
export function colleggtibleEffects(tiers: Record<string, number> | undefined): Record<string, number> {
  const mods = modifiersFromColleggtibleTiers(tiers ?? {}) as unknown as Record<string, number>;
  return Object.fromEntries(
    Object.keys(mods)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map(k => [k, Number(mods[k].toPrecision(12))])
  );
}

/** The stamp as the v3 name hashes it. */
export function canonicalGearV3(stamp: TableGear): object {
  return {
    v: 3,
    earnings: asWorn(stamp.earnings),
    deliveryBare: asWorn(stamp.deliveryBare),
    deliveryFull: asWorn(stamp.deliveryFull),
    epicResearch: simEpicResearch(stamp.epicResearch),
    colleggtibles: colleggtibleEffects(stamp.colleggtibles),
  };
}

/** The gear table's file name (v3), the only one looked up. */
export async function gearTableNameV3(stamp: TableGear): Promise<string> {
  return gearFile(JSON.stringify(canonicalGearV3(stamp)));
}

/** A set as what it does: its artifacts and its stones, each a sorted list (which slot an artifact
 *  is in, and which artifact a stone is in, change no effect). */
function asWorn(slots: LoadoutSlot[]): { artifacts: string[]; stones: string[] } {
  return {
    artifacts: slots.map(s => s.artifact).sort(),
    stones: slots.flatMap(s => s.stones).sort(),
  };
}

/** What differs between a table's stamp and the player's, in words; empty when they match (the
 *  fork's rule 4: sets as worn, only the epic research and colleggtible effects the simulator reads). */
export function gearChanges(table: TableGear, mine: TableGear): string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const sameSet = (a: LoadoutSlot[], b: LoadoutSlot[]) => same(asWorn(a), asWorn(b));
  const out: string[] = [];
  if (!sameSet(table.earnings, mine.earnings)) out.push('earnings set');
  if (!sameSet(table.deliveryBare, mine.deliveryBare) || !sameSet(table.deliveryFull, mine.deliveryFull))
    out.push('delivery set');
  if (!same(simEpicResearch(table.epicResearch), simEpicResearch(mine.epicResearch))) out.push('epic research');
  if (!same(colleggtibleEffects(table.colleggtibles), colleggtibleEffects(mine.colleggtibles)))
    out.push('colleggtibles');
  return out;
}
