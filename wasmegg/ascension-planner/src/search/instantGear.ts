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
 *   full-research peak, the table's `k3.peak` x k. Measured per leg against the gear tables' own
 *   cells: |error| p90 0.5-2.8% on nine tables (all-common 5.3%, optimistic above TE 300), where the
 *   single delivery scale it replaces was 6-42%.
 *
 * The wrapper itself is precomputedTable.ts `gearShiftTable`; this works out its numbers.
 */
import { calculateArtifactModifiers, getOptimalEarningsSet, getOptimalELRSet } from '@/lib/artifacts';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { computeRealisticELR } from '@/calculations/realisticELR';
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
  /** The player's own full-research peak (the table's `k3.peak` x k), eggs per second. */
  cap: number;
  /** The player's peak against the table's at the table's K3 research (the old single scale). */
  k: number;
  lambda: number;
  sigma: number;
  /** The parts of `g`, for the record. */
  parts: { artifacts: number; colleggtibles: number; lab: number };
}

/** Only the gear shift's numbers, rounded for a url (the worker builds the wrapper from these). */
export function gearShiftKey(s: Pick<GearShift, 'g' | 'geo' | 'cap' | 'k'>): string {
  return [s.g.toFixed(4), s.geo.toFixed(6), s.cap.toPrecision(10), s.k.toFixed(6)].join(',');
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
    cap: k3.peak * k,
    k,
    lambda,
    sigma,
    parts: { artifacts, colleggtibles, lab },
  };
}

/** A player as good as the maxed table (the old single scale is then exact): no shift needed. */
export function nearMaxedGear(s: Pick<GearShift, 'g' | 'geo' | 'k'>): boolean {
  return s.g < 0.05 && Math.abs(s.geo - 1) < 0.005 && Math.abs(s.k - 1) < 0.005;
}

/**
 * The instant answer's tail options (routeFinder.ts `TailOptions`) for the player's hours: with
 * "Works inside my hours" (`hours`) and Your setup's held shifts on, every table leg's shifts are held
 * as Check exactly holds them. The simulator's order and the laying while a prestige waits are the
 * finder's defaults.
 */
export function instantTail(hours: Availability | null | undefined, deferShifts: boolean): TailOptions {
  return hours && deferShifts ? { holdShifts: true } : {};
}
