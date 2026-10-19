/**
 * The player's peak delivery rate against the table's (ported from the AutoAutoAP fork's search/leg.ts
 * `instantDeliveryScale`). The maxed table's waits run at its own account's peak rate; a player's
 * waits run at theirs, so every build's rate is scaled by this. Both are worked out here with Joo's
 * own code at the research the table's builds wait with (the header's `k3`): the table's delivery set
 * there, and the save's best delivery set there (getOptimalELRSet, max habs and vehicles).
 */
import type { ei } from 'lib';
import type { Modifiers as ColleggtibleModifiers } from 'lib/collegtibles';
import { calculateArtifactModifiers, getOptimalELRSet, type EquippedArtifact } from '@/lib/artifacts';
import { computeRealisticELR } from '@/calculations/realisticELR';
import type { TableHeader } from './precomputedTable';

export function deliveryScale(
  backup: ei.IBackup | null,
  k3: TableHeader['k3'] | undefined,
  epicResearchLevels: Record<string, number>,
  colleggtibleModifiers: ColleggtibleModifiers
): number {
  if (!backup || !k3) return 1;
  const rate = (set: EquippedArtifact[]) =>
    computeRealisticELR(k3.research, calculateArtifactModifiers(set), epicResearchLevels, colleggtibleModifiers)
      .effectiveRate;
  const mine = getOptimalELRSet(backup, {
    commonResearch: k3.research,
    epicResearchLevels,
    colleggtibleModifiers,
    assumeMaxHabsVehicles: true,
  });
  const theirs = rate(k3.delivery as EquippedArtifact[]);
  return mine && theirs > 0 ? rate(mine) / theirs : 1;
}
