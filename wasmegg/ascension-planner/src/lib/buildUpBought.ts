/**
 * WHAT THE SAVE SAYS IS BOUGHT (build-up tracker Phase 2, 30 Oct 2026; outline
 * ~/code/aaap-tools/wireframes/buildup-tracker-v1.md recommendations 2 and 3, notes ~/code/aaap-tools/notes/spec-buildup2.md).
 * Pure: no Vue, no stores, no clock. The plan is FIXED (the anchored plan, lib/buildUpTracker.ts); a newer save only
 * ticks its lines off.
 *
 * THE SAVE, AS COMPARABLE VALUES (`saveFarmFor`): the save's own virtue farm (lib/farmFacts.ts `saveFarmOf`, read off
 * the save itself, never a Manual plan's start: the R6 snapshot rule of search/saveStart.ts), its egg by number
 * (lib/virtueEggs.ts) and the set it wears (lib/gearMatch.ts `whichSet`: 'earnings' -> the earnings set, 'production'
 * -> the ELR set; 'both' / 'mix' / unknown -> not known).
 *
 * ONE ITEM, BOUGHT WHEN (`itemBought`):
 *   research  id at level N         the save's level of that id >= N
 *   hab       hab id H in slot s    the save's slot s holds H or better (hab ids rise with the tier; empty = none)
 *   vehicle   id V in slot s, cars  the save's slot s holds V or better; a train also needs its length >= cars.
 *                                   Tiers climbed in one moment (Trike, QT, Hyperloop) are ONE item: the last tier.
 *   trainCar  slot s to N cars      the save's slot s is a Hyperloop Train with length >= N
 *   silo      silo #n               the save owns n silos or more (a 'buy silos #2-5' line is 4 items)
 *   shift     the k-th shift        the save's egg puts it past shift k (below)
 *   prestige                        the save is from after it (`saveFit` 'fits' on a plan that starts afresh)
 *   setSwap   set X after shift k   the save is past shift k and wears X (not known: left to the checkbox)
 *
 * WHICH SHIFT THE SAVE IS PAST: the plan's eggs in order (start egg, then each shift's) cut it into segments. The save's
 * egg can be on several (Curiosity, Kindness, Curiosity again): of those, the first whose end is not before the latest
 * line the save has bought anything of. An egg the plan never visits, or no egg: not known (the checkbox).
 *
 * WHETHER THE SAVE CAN TICK THIS PLAN AT ALL (`saveFit`). Within one ascension research levels, silos, habs, vehicles
 * and train lengths only ever go up, so a save that is on this plan holds at least the plan's start farm ('older'
 * otherwise: an older save, or another ascension). A plan that starts afresh (a prestige: its start farm does not hold
 * the anchor save's farm) needs one more thing: the save must not still hold the anchor save's farm, or it is from
 * before the prestige ('beforePrestige': the old farm would read as everything bought). Neither 'older' nor
 * 'beforePrestige' ticks anything; with no save or no plan start nothing is automatic.
 *
 * A LINE: bought when every item is, '3 of 5 bought' when some are, 'to buy' when none; `auto` null when the save
 * can't tell (the silo trick, back online, waits, events, a shift to an egg the plan never visits).
 *
 * OVERRIDES (`effectiveTicks`): the player's own tick or untick wins both ways; with none, the save's.
 *
 * RE-PLAN (`replanOffer`, outline question 2): offered when the save is over 1 h BEHIND the plan (the first line it has
 * not bought was due more than an hour before the save's time) or has bought things OFF-PLAN (`offPlan`): an item the
 * save holds whose line is not due until more than 10 min after the save's time ('early'), or beyond anything the plan
 * ever buys or starts with ('never': a research level above the plan's highest for that id, a better hab or vehicle or
 * a longer train than the plan's last in that slot, more silos than the plan's last).
 */
import type { CurrentFarmState } from '@/types';
import type { BuildUpStart } from '@/search/buildUpActions';
import type { SetMatch } from './gearMatch';
import type { TrackerLine } from './buildUpTracker';
import { virtueEggOf } from './virtueEggs';

/** The Hyperloop Train's vehicle id (lib/vehicles.ts): the only vehicle with cars. */
export const TRAIN_ID = 11;
/** "Behind the plan" for the Re-plan button: more than this, seconds. */
export const REPLAN_BEHIND = 3600;
/** A bought item whose line is due later than the save's time by more than this is off-plan ('early'). */
export const OFF_PLAN_GRACE = 600;

/** One thing a tracker line buys or does. Slots are 0-based, as the engine counts them. */
export type PlanItem =
  | { kind: 'research'; id: string; level: number }
  | { kind: 'hab'; slot: number; habId: number }
  | { kind: 'vehicle'; slot: number; vehicleId: number; cars: number }
  | { kind: 'trainCar'; slot: number; cars: number }
  | { kind: 'silo'; count: number }
  | { kind: 'shift'; egg: string; index: number }
  | { kind: 'prestige'; egg: string }
  | { kind: 'setSwap'; set: string; after: number };

/** A farm as the tracker compares it (the save's, or the plan's start). */
export interface SaveFarm {
  /** The virtue egg it is on; null when not known. */
  egg: string | null;
  researchLevels: Record<string, number>;
  habIds: (number | null)[];
  vehicles: { vehicleId: number | null; trainLength: number }[];
  siloCount: number;
  /** 'earnings' | 'elr'; null when not known. */
  artifactSet: string | null;
}

/** The save's farm and worn set as comparable values; null without a virtue farm. */
export function saveFarmFor(farm: CurrentFarmState | null | undefined, set: SetMatch | null | undefined): SaveFarm | null {
  if (!farm) return null;
  return {
    egg: virtueEggOf(farm.eggType),
    researchLevels: { ...(farm.commonResearches as Record<string, number>) },
    habIds: [...(farm.habs ?? [])],
    vehicles: (farm.vehicles ?? []).map(v => ({ vehicleId: v.vehicleId ?? null, trainLength: v.trainLength || 1 })),
    siloCount: farm.numSilos || 1,
    artifactSet: set === 'earnings' ? 'earnings' : set === 'production' ? 'elr' : null,
  };
}

/** The plan's start farm as comparable values. */
export function farmOfStart(s: BuildUpStart): SaveFarm {
  return {
    egg: s.egg ?? null,
    researchLevels: { ...s.researchLevels },
    habIds: [...s.habIds],
    vehicles: s.vehicles.map(v => ({ vehicleId: v.vehicleId ?? null, trainLength: v.trainLength || 1 })),
    siloCount: s.siloCount,
    artifactSet: s.artifactSet ?? null,
  };
}

const level = (f: SaveFarm, id: string): number => f.researchLevels[id] ?? 0;
const habAt = (f: SaveFarm, slot: number): number => f.habIds[slot] ?? -1;
const vehicleAt = (f: SaveFarm, slot: number): { id: number; len: number } => {
  const v = f.vehicles[slot];
  return { id: v?.vehicleId ?? -1, len: v?.vehicleId === TRAIN_ID ? (v.trainLength ?? 1) : 0 };
};

/** `a` holds everything `b` does: research levels, silos, habs or better, vehicles or better, train lengths. */
export function contains(a: SaveFarm, b: SaveFarm): boolean {
  for (const [id, lv] of Object.entries(b.researchLevels)) if (level(a, id) < lv) return false;
  if (a.siloCount < b.siloCount) return false;
  for (let s = 0; s < b.habIds.length; s++) if (b.habIds[s] != null && habAt(a, s) < b.habIds[s]!) return false;
  for (let s = 0; s < b.vehicles.length; s++) {
    const bv = vehicleAt(b, s);
    if (bv.id < 0) continue;
    const av = vehicleAt(a, s);
    if (av.id < bv.id || (bv.id === TRAIN_ID && av.len < bv.len)) return false;
  }
  return true;
}

export type SaveFit = 'fits' | 'older' | 'beforePrestige' | 'unknown';

/** Whether the save can tick this plan (see the header). */
export function saveFit(save: SaveFarm | null | undefined, start: BuildUpStart | null | undefined, anchorFarm?: SaveFarm | null): SaveFit {
  if (!save || !start) return 'unknown';
  const s0 = farmOfStart(start);
  if (!contains(save, s0)) return 'older';
  if (anchorFarm && !contains(s0, anchorFarm) && contains(save, anchorFarm)) return 'beforePrestige';
  return 'fits';
}

/** A purchase (not a shift, the prestige or a set swap). */
const isPurchase = (i: PlanItem): boolean => i.kind === 'research' || i.kind === 'hab' || i.kind === 'vehicle' || i.kind === 'trainCar' || i.kind === 'silo';

function purchaseBought(i: PlanItem, f: SaveFarm): boolean {
  switch (i.kind) {
    case 'research':
      return level(f, i.id) >= i.level;
    case 'hab':
      return habAt(f, i.slot) >= i.habId;
    case 'vehicle': {
      const v = vehicleAt(f, i.slot);
      if (v.id < i.vehicleId) return false;
      return i.vehicleId !== TRAIN_ID || v.len >= Math.max(1, i.cars);
    }
    case 'trainCar': {
      const v = vehicleAt(f, i.slot);
      return v.id === TRAIN_ID && v.len >= i.cars;
    }
    case 'silo':
      return f.siloCount >= i.count;
    default:
      return false;
  }
}

/** What the save says of one line. */
export interface LineBought {
  bought: number;
  total: number;
  /** Per item, in the line's order. */
  items: boolean[];
  /** true: all bought; false: not all (or none); null: the save can't tell (the checkbox only). */
  auto: boolean | null;
}

export interface BoughtResult {
  fit: SaveFit;
  /** Per line key, for every line with items. */
  lines: Map<string, LineBought>;
  /** The lines the save ticks (every item bought). */
  ticks: Set<string>;
  /** How many shifts the save is past; null when not known. */
  shiftsDone: number | null;
}

export interface BoughtInput {
  lines: readonly TrackerLine[];
  save: SaveFarm | null | undefined;
  start: BuildUpStart | null | undefined;
  /** The egg the plan starts on. */
  startEgg: string | null | undefined;
  /** The anchor save's farm (kept with the plan), for a plan that starts afresh. */
  anchorFarm?: SaveFarm | null;
}

/** The save's ticks, line by line. Deterministic; a save that holds more only ever adds ticks. */
export function boughtFromSave(o: BoughtInput): BoughtResult {
  const fit = saveFit(o.save, o.start, o.anchorFarm);
  const lines = new Map<string, LineBought>();
  const ticks = new Set<string>();
  const f = o.save ?? null;
  const fits = fit === 'fits' && !!f;
  // Purchases first: the latest line with anything bought places the save among the shifts.
  const purchase = new Map<string, boolean[]>();
  let latest = -Infinity;
  for (const l of o.lines) {
    const items = l.items ?? [];
    if (!items.length || !items.every(isPurchase)) continue;
    const got = items.map(i => fits && purchaseBought(i, f!));
    purchase.set(l.key, got);
    if (got.some(Boolean)) latest = Math.max(latest, l.at);
  }
  const shiftsDone = fits ? shiftsPast(o.lines, f!.egg, o.startEgg ?? null, latest) : fit === 'unknown' ? null : 0;
  for (const l of o.lines) {
    const items = l.items ?? [];
    if (!items.length) continue;
    let got: (boolean | null)[];
    if (purchase.has(l.key)) got = fit === 'unknown' ? items.map(() => null) : purchase.get(l.key)!;
    else
      got = items.map(i => {
        if (fit === 'unknown') return null;
        if (i.kind === 'prestige') return fit === 'fits';
        if (i.kind === 'shift') return shiftsDone === null ? null : shiftsDone >= i.index;
        if (i.kind === 'setSwap') {
          if (shiftsDone === null) return null;
          if (shiftsDone < i.after || !fits) return false;
          return f!.artifactSet ? f!.artifactSet === i.set : null;
        }
        return isPurchase(i) ? fits && purchaseBought(i, f!) : null;
      });
    if (got.some(g => g === null)) {
      lines.set(l.key, { bought: 0, total: items.length, items: got.map(Boolean), auto: null });
      continue;
    }
    const bought = got.filter(Boolean).length;
    const auto = bought === items.length;
    lines.set(l.key, { bought, total: items.length, items: got as boolean[], auto });
    if (auto) ticks.add(l.key);
  }
  return { fit, lines, ticks, shiftsDone };
}

/** How many of the plan's shifts the save is past (see the header); null when its egg can't place it. */
function shiftsPast(lines: readonly TrackerLine[], egg: string | null, startEgg: string | null, latest: number): number | null {
  if (!egg) return null;
  const shifts = lines.flatMap(l => (l.items ?? []).filter(i => i.kind === 'shift').map(i => ({ at: l.at, egg: (i as { egg: string }).egg })));
  const eggs = [startEgg, ...shifts.map(s => s.egg)];
  const ends = [...shifts.map(s => s.at), Infinity];
  let lastMatch: number | null = null;
  for (let k = 0; k < eggs.length; k++) {
    if (eggs[k] !== egg) continue;
    if (ends[k] >= latest) return k;
    lastMatch = k;
  }
  return lastMatch;
}

// ------------------------------------------------------------------------------------------------ overrides

/** The player's own ticks: `on` ticked by them, `off` unticked by them where the save says bought. */
export interface Overrides {
  on: ReadonlySet<string>;
  off: ReadonlySet<string>;
}

/** The ticks shown: the player's override when there is one, else the save's. `source`: who set each override or tick. */
export function effectiveTicks(
  auto: ReadonlyMap<string, boolean | null>,
  on: ReadonlySet<string>,
  off: ReadonlySet<string>
): { ticked: Set<string>; source: Map<string, 'save' | 'you'> } {
  const ticked = new Set<string>();
  const source = new Map<string, 'save' | 'you'>();
  for (const [k, a] of auto) {
    if (on.has(k) || off.has(k)) continue;
    if (a === true) {
      ticked.add(k);
      source.set(k, 'save');
    }
  }
  for (const k of on) {
    ticked.add(k);
    source.set(k, 'you');
  }
  for (const k of off) {
    if (on.has(k)) continue;
    source.set(k, 'you');
  }
  return { ticked, source };
}

/** A re-plan: the overrides of lines whose key is still in the new plan; the others go. */
export function carryTicks(o: Overrides, keys: Iterable<string>): { on: Set<string>; off: Set<string>; dropped: number } {
  const keep = new Set(keys);
  const on = new Set([...o.on].filter(k => keep.has(k)));
  const off = new Set([...o.off].filter(k => keep.has(k)));
  return { on, off, dropped: o.on.size + o.off.size - on.size - off.size };
}

// ------------------------------------------------------------------------------------------------ re-plan

export interface OffPlanItem {
  why: 'early' | 'never';
  kind: 'research' | 'hab' | 'vehicle' | 'trainCar' | 'silo';
  /** 'comfy_nests 11' / slot and id ('0 5') / silo count ('3'). */
  what: string;
  /** Research id, for a name. */
  id?: string;
}

const itemWhat = (i: PlanItem): string =>
  i.kind === 'research'
    ? `${i.id} ${i.level}`
    : i.kind === 'hab'
      ? `${i.slot} ${i.habId}`
      : i.kind === 'vehicle'
        ? `${i.slot} ${i.vehicleId}${i.vehicleId === TRAIN_ID && i.cars > 1 ? ` cars ${i.cars}` : ''}`
        : i.kind === 'trainCar'
          ? `${i.slot} cars ${i.cars}`
          : i.kind === 'silo'
            ? `${i.count}`
            : '';

/** What the save holds off the plan (see the header); empty for a save that does not fit the plan. */
export function offPlan(o: {
  lines: readonly TrackerLine[];
  save: SaveFarm | null | undefined;
  start: BuildUpStart | null | undefined;
  saveSeconds: number;
  anchorFarm?: SaveFarm | null;
}): OffPlanItem[] {
  const f = o.save;
  if (!f || !o.start || saveFit(f, o.start, o.anchorFarm) !== 'fits') return [];
  const out: OffPlanItem[] = [];
  const s0 = farmOfStart(o.start);
  // The plan's highest, per thing, from its start and every line.
  const research = new Map<string, number>(Object.entries(s0.researchLevels));
  const habs = new Map<number, number>();
  const vehicles = new Map<number, { id: number; len: number }>();
  s0.habIds.forEach((h, s) => h != null && habs.set(s, h));
  s0.vehicles.forEach((_, s) => {
    const v = vehicleAt(s0, s);
    if (v.id >= 0) vehicles.set(s, v);
  });
  let silos = s0.siloCount;
  for (const l of o.lines)
    for (const i of l.items ?? []) {
      if (i.kind === 'research') research.set(i.id, Math.max(research.get(i.id) ?? 0, i.level));
      else if (i.kind === 'hab') habs.set(i.slot, Math.max(habs.get(i.slot) ?? -1, i.habId));
      else if (i.kind === 'vehicle' || i.kind === 'trainCar') {
        const v = vehicles.get(i.slot) ?? { id: -1, len: 0 };
        const id = i.kind === 'vehicle' ? Math.max(v.id, i.vehicleId) : Math.max(v.id, TRAIN_ID);
        vehicles.set(i.slot, { id, len: Math.max(v.len, i.cars) });
      } else if (i.kind === 'silo') silos = Math.max(silos, i.count);
    }
  // Early: bought, but its line is not due yet.
  for (const l of o.lines) {
    if (l.at <= o.saveSeconds + OFF_PLAN_GRACE) continue;
    for (const i of l.items ?? [])
      if (isPurchase(i) && purchaseBought(i, f))
        out.push({ why: 'early', kind: i.kind as OffPlanItem['kind'], what: itemWhat(i), ...(i.kind === 'research' ? { id: i.id } : {}) });
  }
  // Never: beyond anything the plan has.
  for (const id of Object.keys(f.researchLevels).sort())
    if (level(f, id) > (research.get(id) ?? 0)) out.push({ why: 'never', kind: 'research', what: `${id} ${level(f, id)}`, id });
  f.habIds.forEach((h, s) => {
    if (h != null && h > (habs.get(s) ?? -1)) out.push({ why: 'never', kind: 'hab', what: `${s} ${h}` });
  });
  f.vehicles.forEach((_, s) => {
    const v = vehicleAt(f, s);
    const p = vehicles.get(s) ?? { id: -1, len: 0 };
    if (v.id > p.id) out.push({ why: 'never', kind: 'vehicle', what: `${s} ${v.id}` });
    else if (v.id === TRAIN_ID && v.len > Math.max(1, p.len)) out.push({ why: 'never', kind: 'trainCar', what: `${s} cars ${v.len}` });
  });
  if (f.siloCount > silos) out.push({ why: 'never', kind: 'silo', what: `${f.siloCount}` });
  return out;
}

/** How far the save is behind the plan, seconds: its time minus the first line with items it has not all bought (lines
 *  the save can't tell are skipped); null when it has bought every line. */
export function behindSeconds(lines: readonly TrackerLine[], b: Pick<BoughtResult, 'lines'>, saveSeconds: number): number | null {
  for (const l of lines) {
    const lb = b.lines.get(l.key);
    if (lb && lb.auto === false) return saveSeconds - l.at;
  }
  return null;
}

/** Whether to offer "Re-plan from this save", and why. */
export function replanOffer(o: {
  lines: readonly TrackerLine[];
  save: SaveFarm | null | undefined;
  start: BuildUpStart | null | undefined;
  startEgg: string | null | undefined;
  saveSeconds: number;
  /** The save the plan was worked out from. */
  anchorSeconds: number;
  anchorFarm?: SaveFarm | null;
}): { show: boolean; behind: number; offPlan: OffPlanItem[] } {
  const b = boughtFromSave(o);
  const behind = b.fit === 'unknown' ? 0 : Math.max(0, behindSeconds(o.lines, b, o.saveSeconds) ?? 0);
  const off = offPlan(o);
  const newer = o.saveSeconds > o.anchorSeconds;
  return { show: newer && (behind > REPLAN_BEHIND || off.length > 0), behind, offPlan: off };
}
