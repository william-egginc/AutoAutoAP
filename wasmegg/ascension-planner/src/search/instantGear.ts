/**
 * THE WEAK-GEAR FORM "G" (instant answer v2, 23 Oct 2026; aaap-tools/notes/weakgear-test-2026-10-22.md).
 * A player with no table built on their own gear is priced from the maxed table, moved to their gear:
 *
 *   EARNINGS, A ROW SHIFT. In the simulator a set that is `g` Clothed-TE points weaker earns exactly
 *   what the maxed set earns `g` TE lower (earnings are eggValue x away x 1.1^TE ..., and the Clothed
 *   TE of a set is log of its multipliers over log 1.1), so a build at (TE, weaker set) is the maxed
 *   build at (TE - g). `g` here is the whole Clothed-TE gap the simulator sees: the earnings set's
 *   artifacts, the colleggtibles and the lab upgrade, against the table's. (Not the permit: the
 *   simulator does not read it.)
 *
 *   DELIVERY, x sqrt(lambda sigma), CAPPED. lambda and sigma are the player's lay and shipping
 *   multipliers over the table's K3 set (each at its own epic research and colleggtibles). A weaker set's
 *   build buys more of whichever side it is short on, so below full research its peak moves with the
 *   geometric mean; at full research there is nothing left to rebalance and it is stuck at its own
 *   full-research peak: the table's `k3.peak` x the player's rate over the table's with EVERY common
 *   research at its top level (each side's best delivery set there). That ratio is the player's own
 *   simulated peak over the table's (tableBuild.ts buildPeak / k3.peak) to every digit on 31 research
 *   and colleggtible profiles and on main, alt and kelli; the ratio at the table's K3 research (k) was
 *   up to 1.8% low for a player short on shipping, whose own build buys more shipping research.
 *   Measured per leg against the gear tables' own cells: |error| p90 0.5-2.8% on nine tables
 *   (all-common 5.3%, optimistic above TE 300), where the single delivery scale it replaces was 6-42%.
 *
 *   DELIVERY EPIC RESEARCH AND COLLEGGTIBLES, a little more below TE 300 (search/formG.ts): geoEr is the
 *   part of sqrt(lambda sigma) that comes from them, and the rates there are x geoEr^erExponent.
 *
 * The wrapper itself is precomputedTable.ts `gearShiftTable`; this works out its numbers.
 */
import { calculateArtifactModifiers, getOptimalEarningsSet, getOptimalELRSet } from '@/lib/artifacts';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { computeRealisticELR } from '@/calculations/realisticELR';
import { getCommonResearches } from '@/calculations/commonResearch';
import { FORM_G_DELIVERY } from './formG';
import { cteFromArtifacts, cteFromColleggtibles, cteFromLabUpgrade } from 'lib/virtue';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { Modifiers as ColleggtibleModifiers } from 'lib/collegtibles';
import type { TableHeader } from './precomputedTable';
import type { SearchInputs } from './types';
import type { Availability } from './availability';
import type { TailOptions } from './routeFinder';

export interface GearShift {
  /** Clothed-TE points below the table (never below 0): the row shift. */
  g: number;
  /** sqrt(lambda sigma): the peak delivery rate's scale below full research. */
  geo: number;
  /** The player's own full-research peak (the table's `k3.peak` x kFull), eggs per second. */
  cap: number;
  /** The player's peak against the table's at the table's K3 research (the old single scale). */
  k: number;
  /** The same at every common research's top level: the player's own full-research peak over the table's. */
  kFull: number;
  /** sqrt(lambda sigma) of the table's own delivery set at the player's epic research and colleggtibles
   *  over at the table's: the part of geo that the form G's correction scales (search/formG.ts). */
  geoEr: number;
  lambda: number;
  sigma: number;
  /** The parts of `g`, for the record. */
  parts: { artifacts: number; colleggtibles: number; lab: number };
}

/** Only the gear shift's numbers, rounded for a url (the worker builds the wrapper from these). */
export function gearShiftKey(s: Pick<GearShift, 'g' | 'geo' | 'cap' | 'k'> & { geoEr?: number }): string {
  const key = [s.g.toFixed(4), s.geo.toFixed(6), s.cap.toPrecision(10), s.k.toFixed(6)];
  // geoEr 1 (every delivery epic research and colleggtible maxed) stays out, so those urls are as before.
  const er = (s.geoEr ?? 1).toFixed(6);
  return (er === '1.000000' ? key : [...key, er]).join(',');
}

/**
 * The gear shift for this save against a maxed table's header, or null when it cannot be read (no
 * save, or a table without its K3 research and peak).
 */
export function instantGearShift(inputs: SearchInputs, header: TableHeader): GearShift | null {
  const ctx = inputs.context;
  const raw = ctx.rawBackup;
  const k3 = header.k3;
  if (!raw || !k3?.peak || !(k3.peak > 0)) return null;
  const tableEpic = header.epicResearch ?? ctx.epicResearchLevels;
  const tableColl = (header.colleggtibleEffects as ColleggtibleModifiers | undefined) ?? ctx.colleggtibleModifiers;
  const rates = (set: EquippedArtifact[], epic: Record<string, number>, coll: ColleggtibleModifiers) =>
    computeRealisticELR(k3.research, calculateArtifactModifiers(set), epic, coll);
  const mineSet = getOptimalELRSet(raw, {
    commonResearch: k3.research,
    epicResearchLevels: ctx.epicResearchLevels,
    colleggtibleModifiers: ctx.colleggtibleModifiers,
    assumeMaxHabsVehicles: true,
  });
  if (!mineSet) return null;
  const mine = rates(mineSet as EquippedArtifact[], ctx.epicResearchLevels, ctx.colleggtibleModifiers);
  const theirs = rates(k3.delivery as EquippedArtifact[], tableEpic, tableColl);
  if (!(theirs.layRate > 0 && theirs.shippingRate > 0 && theirs.effectiveRate > 0)) return null;
  const lambda = mine.layRate / theirs.layRate;
  const sigma = mine.shippingRate / theirs.shippingRate;
  const k = mine.effectiveRate / theirs.effectiveRate;
  // The table's set at the player's research and colleggtibles: what of lambda sigma is not gear.
  const theirsAtMine = rates(k3.delivery as EquippedArtifact[], ctx.epicResearchLevels, ctx.colleggtibleModifiers);
  const geoEr = Math.sqrt((theirsAtMine.layRate / theirs.layRate) * (theirsAtMine.shippingRate / theirs.shippingRate));
  // Full research: every common research at its top level, each side's best delivery set there.
  const top = Object.fromEntries(getCommonResearches().map(r => [r.id, r.levels]));
  const mineTopSet = getOptimalELRSet(raw, {
    commonResearch: top,
    epicResearchLevels: ctx.epicResearchLevels,
    colleggtibleModifiers: ctx.colleggtibleModifiers,
    assumeMaxHabsVehicles: true,
  });
  const topRate = (set: EquippedArtifact[], epic: Record<string, number>, coll: ColleggtibleModifiers) =>
    computeRealisticELR(top, calculateArtifactModifiers(set), epic, coll).effectiveRate;
  const theirsTop = topRate(k3.delivery as EquippedArtifact[], tableEpic, tableColl);
  const kFull = mineTopSet && theirsTop > 0 ? topRate(mineTopSet as EquippedArtifact[], ctx.epicResearchLevels, ctx.colleggtibleModifiers) / theirsTop : k;

  const earnings = getOptimalEarningsSet(raw);
  const artifacts = header.cteBonus - (earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(earnings)) : 0);
  const colleggtibles =
    header.colleggtibleEffects !== undefined
      ? cteFromColleggtibles(tableColl) - cteFromColleggtibles(ctx.colleggtibleModifiers)
      : 0;
  const lab =
    cteFromLabUpgrade(tableEpic['cheaper_research'] ?? 0) - cteFromLabUpgrade(ctx.epicResearchLevels['cheaper_research'] ?? 0);
  const g = Math.max(0, artifacts + colleggtibles + lab);
  return {
    g,
    geo: Math.sqrt(lambda * sigma),
    cap: k3.peak * (FORM_G_DELIVERY.fullResearchCap ? kFull : k),
    k,
    kFull,
    geoEr,
    lambda,
    sigma,
    parts: { artifacts, colleggtibles, lab },
  };
}

/** A player as good as the maxed table (the old single scale is then exact): no shift needed. */
export function nearMaxedGear(s: Pick<GearShift, 'g' | 'geo' | 'k'> & { kFull?: number }): boolean {
  return s.g < 0.05 && Math.abs(s.geo - 1) < 0.005 && Math.abs(s.k - 1) < 0.005 && Math.abs((s.kFull ?? s.k) - 1) < 0.005;
}

/**
 * The instant answer's tail options (routeFinder.ts `TailOptions`) for the player's hours: with
 * "Works inside my hours" (`hours`) and Your setup's held shifts on, every table leg's shifts are held
 * as Check exactly holds them, and a fresh ascension waits for a start where its opening's shifts fit
 * inside the hours (routeFinder.ts `heldOpeningStart`; `gearRows`: the form G's gap, so the opening is
 * read at the player's own TE less it). The simulator's order is asked for by name (the engine's
 * recommendation, hours on and off; it is also the finder's default); the laying while a prestige waits
 * is the default.
 *
 * Not `inSale: 'atOnce'` (every build at once inside the sale, as the searches start it): measured on 22
 * of main's routes with hours, it left 16 within an hour of the simulator against 18 without it, and 6
 * more than a day too soon against 3; the finder takes the at-once estimates that err soonest
 * (notes/heldfix.md).
 */
export function instantTail(
  hours: Availability | null | undefined,
  deferShifts: boolean,
  gearRows?: number,
  /** No prestige on these days and the save's silo seconds (routeFinder.ts `TailOptions.noPrestige`): every
   *  prestige waits past them, whether or not "Works inside my hours" is ticked; shifts are unaffected. */
  days?: Pick<TailOptions, 'noPrestige' | 'siloSeconds'> | null
): TailOptions {
  const held = !!hours && deferShifts;
  return {
    order: 'simulator',
    ...(held ? { holdShifts: true } : {}),
    ...(held && gearRows && gearRows > 0 ? { openingRows: gearRows } : {}),
    ...(days?.noPrestige?.length
      ? {
          noPrestige: days.noPrestige.map(w => ({ from: w.from, to: w.to })),
          ...(days.siloSeconds !== undefined ? { siloSeconds: days.siloSeconds } : {}),
        }
      : {}),
  };
}
