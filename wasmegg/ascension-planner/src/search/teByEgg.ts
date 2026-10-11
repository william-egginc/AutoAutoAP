/**
 * Truth eggs per virtue egg for a board row (submission `teByEgg`), checked against the TE the row
 * says the account has.
 *
 * It used to be the save's raw `virtue.eovEarned`: the TE the game has CLAIMED per egg. The planner's
 * own TE can be more than that ("Include pending TE" adds thresholds already passed but not yet
 * claimed, InitialStateContainer.vue), so a row could say TE 200 or 201 while its teByEgg summed to
 * 199 (Allan's rows e0a3876f, 6fa4ed30 and 5dd740b4, 10 Oct). Now the first of these whose sum is the
 * row's TE is sent: the planner's own per-egg TE (what the run priced), the save's claimed TE, the TE
 * its eggs delivered have passed (claimed and pending, src/lib/truthEggs.ts). When none adds up the
 * row gets no teByEgg rather than a wrong one.
 */
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { VIRTUE_EGGS } from '@/types';

export function teByEggFor(o: {
  /** The planner's per-egg TE (initial state, or a run's base state), keyed by virtue egg. */
  perEgg?: Partial<Record<string, number>> | null;
  /** The save's `virtue.eovEarned` and `virtue.eggsDelivered`, in VIRTUE_EGGS order. */
  eovEarned?: (number | null | undefined)[] | null;
  eggsDelivered?: (number | null | undefined)[] | null;
  /** The TE the row reports for the account; null when unknown (then nothing to check against). */
  te: number | null;
}): number[] | null {
  const planner = o.perEgg ? VIRTUE_EGGS.map(e => o.perEgg?.[e] ?? 0) : null;
  const claimed = o.eovEarned?.length ? VIRTUE_EGGS.map((_, i) => o.eovEarned?.[i] ?? 0) : null;
  const passed = o.eggsDelivered?.length
    ? VIRTUE_EGGS.map((_, i) => countTEThresholdsPassed(o.eggsDelivered?.[i] ?? 0))
    : null;
  const candidates = [planner, claimed, passed].filter((c): c is number[] => !!c);
  if (o.te === null || !Number.isFinite(o.te)) return claimed ?? planner;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + (b || 0), 0);
  return candidates.find(c => Math.round(sum(c)) === Math.round(o.te as number)) ?? null;
}
