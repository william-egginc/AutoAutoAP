/**
 * Helpers for the Wait for TE specs (waitForTE.spec.ts, PlanFinalSummary.spec.ts).
 */
import type { Plugin } from 'vue';
import { useActionsStore } from '@/stores/actions';
import { useVirtueStore } from '@/stores/virtue';
import { useTruthEggsStore } from '@/stores/truthEggs';
import { countTEThresholdsPassed, eggsNeededForTE } from '@/lib/truthEggs';
import { solveForTime } from '@/engine/apply/math';

/** The app registers vue-tippy in main.ts; a no-op directive is enough for server rendering. */
export const tippyStub: Plugin = { install: app => void app.directive('tippy', {}) };

/** What the Wait for TE panel prices for +1 TE on the current egg (same inputs as the component). */
export function nextTEWait() {
  const snap = useActionsStore().effectiveSnapshot;
  const egg = useVirtueStore().currentEgg;
  const te = useTruthEggsStore();
  const delivered = te.eggsDelivered[egg];
  const currentTE = Math.max(te.teEarned[egg] || 0, countTEThresholdsPassed(delivered));
  const eggs = eggsNeededForTE(delivered, currentTE + 1);
  const R = snap.ratePerChickenPerSecond;
  const seconds = solveForTime(eggs, snap.population, snap.offlineIHR / 60, R, Math.min(snap.shippingCapacity, R * snap.habCapacity));
  return { egg, currentTE, eggs, seconds };
}
