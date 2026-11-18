/**
 * The Auto Planner's "Target TE(s)" field (components/auto/AutomaticPlanner.vue), checked as you type (17 Nov 2026, Jordan and a tester):
 * every number is at most MAX_TARGET_TE; the first is at least the TE the player already has; each after it is strictly higher than the one before (lib/follow.ts parseTypedRoute: "each above the last"). The generator (auto/useAscensionGenerator.ts getTargets) takes any positive numbers, so this is the form's rule only.
 * The first fault is returned (the box shows one plain line under it) and Generate Plan stays off until there is none. Pure; the
 * sentences are Words' (lib/targetTeWords.ts).
 */
export const MAX_TARGET_TE = 490;

export type TargetTeFault =
  | { kind: 'empty' }
  | { kind: 'tooHigh'; value: number }
  | { kind: 'belowCurrent'; value: number; current: number }
  | { kind: 'descending'; value: number; previous: number };

/** The field's numbers, in order (digits split by spaces; the input handler already keeps it to that). */
export function targetTeNumbers(text: string): number[] {
  return text.split(/\s+/).filter(Boolean).map(Number);
}

/** The first fault in the field's text, or null when every number is allowed. `currentTe` is the player's TE (0 when unknown). */
export function targetTeFault(text: string, currentTe: number): TargetTeFault | null {
  const nums = targetTeNumbers(text);
  if (nums.length === 0 || nums.some(n => !Number.isFinite(n) || n <= 0)) return { kind: 'empty' };
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (n > MAX_TARGET_TE) return { kind: 'tooHigh', value: n };
    if (i === 0 && n < currentTe) return { kind: 'belowCurrent', value: n, current: currentTe };
    if (i > 0 && n <= nums[i - 1]) return { kind: 'descending', value: n, previous: nums[i - 1] };
  }
  return null;
}
