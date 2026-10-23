/**
 * A save holding something this planner's data does not know yet (red team 21 Oct 2026, data-inputs
 * #8): a hab id past the last one we know crashed plan generation ("reading 'id'" in
 * `calculateHabCapacity_Full`), and an epic research level above its max showed "CLOTHED TE NAN". The
 * realistic cause is the game adding a hab, a vehicle or research levels before our data is updated,
 * so each value is held to the nearest one we know and the player is told, instead of the page breaking.
 */
import { habTypes } from '@/lib/habs';
import { vehicleTypes } from '@/lib/vehicles';
import { MAX_TRAIN_LENGTH } from '@/lib/vehicles';
import { epicResearchDefs } from '@/lib/epicResearch';
import { getResearchById } from '@/calculations/commonResearch';
import type { CurrentFarmState, ResearchLevels, VehicleSlot } from '@/types';

const LAST_HAB = habTypes.length - 1;
const LAST_VEHICLE = vehicleTypes.length - 1;

/** A whole number in [lo, hi], or null when the value is not a number at all. */
function held(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

/** A hab id we know: past the last one is the last one (a newer hab is at least as big), anything that
 *  is not a hab id is an empty slot. */
function habOf(id: unknown, notes: string[]): number | null {
  if (id === null || id === undefined) return null;
  const h = held(id, 0, LAST_HAB);
  if (h === null || (id as number) < 0) {
    notes.push(`a hab this planner can't read (${String(id).slice(0, 12)}), shown as an empty slot`);
    return null;
  }
  if (h !== id) notes.push(`hab ${String(id)} (newer than this planner), counted as ${habTypes[h].name}`);
  return h;
}

function vehicleOf(id: unknown, notes: string[]): number | null {
  if (id === null || id === undefined) return null;
  const v = held(id, 0, LAST_VEHICLE);
  if (v === null || (id as number) < 0) {
    notes.push(`a vehicle this planner can't read (${String(id).slice(0, 12)}), shown as an empty slot`);
    return null;
  }
  if (v !== id) notes.push(`vehicle ${String(id)} (newer than this planner), counted as ${vehicleTypes[v].name}`);
  return v;
}

/** Common research levels held to each research's last level; ids we don't know are left as they are. */
function researchOf(levels: ResearchLevels, notes: string[]): ResearchLevels {
  const out: ResearchLevels = {};
  for (const [id, level] of Object.entries(levels ?? {})) {
    const def = getResearchById(id);
    const n = held(level, 0, def ? def.levels : Number.MAX_SAFE_INTEGER) ?? 0;
    if (def && typeof level === 'number' && n !== level)
      notes.push(`${def.name} level ${String(level)}, counted as ${n}`);
    out[id] = n;
  }
  return out;
}

/** The farm with every hab, vehicle, train and research level held to what this planner knows. */
export function guardFarm(farm: CurrentFarmState, notes: string[] = []): CurrentFarmState {
  const habs = (Array.isArray(farm.habs) ? farm.habs : []).map(h => habOf(h, notes));
  while (habs.length < 4) habs.push(null);
  const vehicles: VehicleSlot[] = (Array.isArray(farm.vehicles) ? farm.vehicles : []).map(v => ({
    vehicleId: vehicleOf(v?.vehicleId, notes),
    trainLength: held(v?.trainLength, 1, MAX_TRAIN_LENGTH) ?? 1,
  }));
  return { ...farm, habs, vehicles, commonResearches: researchOf(farm.commonResearches, notes) };
}

/** Epic research levels held to each one's max (an unknown id is dropped: nothing reads it). */
export function guardEpicLevels(levels: Record<string, unknown>, notes: string[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of epicResearchDefs) {
    if (!(def.id in levels)) continue;
    const raw = levels[def.id];
    const n = held(raw, 0, def.maxLevel) ?? 0;
    if (n !== raw) notes.push(`${def.name} level ${String(raw).slice(0, 12)}, counted as ${n}`);
    out[def.id] = n;
  }
  return out;
}

/** The note shown when anything was held, or '' when the save had nothing unexpected. */
export function saveGuardNote(notes: string[]): string {
  if (!notes.length) return '';
  const uniq = [...new Set(notes)];
  const shown = uniq.slice(0, 3).join('; ') + (uniq.length > 3 ? `; and ${uniq.length - 3} more` : '');
  return `Your save has something this planner doesn’t know yet (${shown}). The game was probably updated before the planner was, so results may be a little off until it catches up.`;
}
