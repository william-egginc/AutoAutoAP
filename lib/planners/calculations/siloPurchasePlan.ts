import { nextSiloCost, maxSilos } from '../silos';
import { boostTransitionsFrom, getTimeToSave, calculateEarningsForTime } from '../engine/apply/math';
import type { BaseCalculationsSnapshot } from '../types/actions/core';

export interface SiloPurchaseStep {
  fromCount: number;
  toCount: number;
  cost: number;
  waitSeconds: number;
}

export interface SiloPlanResult {
  steps: SiloPurchaseStep[];
  totalSeconds: number;
}

/**
 * Simulate buying silos back-to-back (waiting to save up between purchases)
 * within a `budgetSeconds` window, using the growth-aware `getTimeToSave` for each
 * purchase's wait and hand-advancing population/layRate/elr/offlineEarnings toward
 * hab capacity for the next iteration.
 *
 * `startAbsoluteTime` makes the waits count 2x earnings from that instant; omitted, they run at the snapshot's own rate.
 */
export function planSilosWithinBudget(
  startSnapshot: BaseCalculationsSnapshot,
  startSiloCount: number,
  budgetSeconds: number,
  startAbsoluteTime?: number
): SiloPlanResult {
  const steps: SiloPurchaseStep[] = [];
  const virtualSnapshot: BaseCalculationsSnapshot = { ...startSnapshot };
  let elapsedSeconds = 0;
  let currentSiloCount = startSiloCount;

  while (currentSiloCount < maxSilos(startSnapshot.proPermit)) {
    const cost = nextSiloCost(currentSiloCount, startSnapshot.proPermit);
    const transitions =
      startAbsoluteTime === undefined ? [] : boostTransitionsFrom(virtualSnapshot, startAbsoluteTime + elapsedSeconds);
    const seconds = getTimeToSave(cost, virtualSnapshot, transitions);
    if (!isFinite(seconds) || elapsedSeconds + seconds > budgetSeconds) break;

    elapsedSeconds += seconds;
    const earned = seconds > 0 ? calculateEarningsForTime(seconds, virtualSnapshot, transitions) : 0;

    // Advance virtual population/earnings state during the wait
    const I = virtualSnapshot.offlineIHR / 60;
    virtualSnapshot.population = Math.min(virtualSnapshot.habCapacity, virtualSnapshot.population + I * seconds);
    const layRatePerChicken = startSnapshot.population > 0 ? startSnapshot.layRate / startSnapshot.population : 0;
    virtualSnapshot.layRate = virtualSnapshot.population * layRatePerChicken;
    virtualSnapshot.elr = Math.min(virtualSnapshot.layRate, virtualSnapshot.shippingCapacity);
    const earningsPerEgg = startSnapshot.elr > 0 ? startSnapshot.offlineEarnings / startSnapshot.elr : 0;
    virtualSnapshot.offlineEarnings = virtualSnapshot.elr * earningsPerEgg;

    // The check-in rule (Jordan, 4 Nov 2026): what a wait earned beyond the price stays in the bank,
    // so everything affordable at the check-in is bought there (with the 60 s minimum wait, the old
    // "bank to 0 after any wait" made every following buy wait another minute).
    virtualSnapshot.bankValue = Math.max(0, (virtualSnapshot.bankValue || 0) + earned - cost);

    steps.push({ fromCount: currentSiloCount, toCount: currentSiloCount + 1, cost, waitSeconds: seconds });
    currentSiloCount++;
  }

  return { steps, totalSeconds: elapsedSeconds };
}
