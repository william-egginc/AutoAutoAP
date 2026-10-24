/**
 * The instant answer's "Simulate this plan" (the user, 7 Oct, from player feedback: "if I open plan it
 * goes to classic" without the plan's details in view). The route is applied to Classic as its Target
 * TE, from the start it was priced from and with its time off (stores/chainSearch.ts `applyChain`), the
 * plan is generated on the player's save, and Classic opens. Classic then scrolls to the plan once it
 * is built and says which route it is, with a way back (AutomaticPlanner.vue, `ui.planFromInstant`).
 */
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import type { LegSummary } from './types';
import type { FirstAscension } from './firstAscension';

/**
 * `opts.from`: where the banner says the route came from ("the instant answer" unless given; By a
 * date's answer card passes its own). `opts.firstAscension`: the setting the route was priced under,
 * for a result whose run recorded its own (stores/chainSearch.ts `applyChain`).
 */
export function simulateRoute(
  chain: number[],
  back: 'fastest' | 'by-date',
  opts: { start?: number; legs?: LegSummary[]; firstAscension?: FirstAscension; from?: string } = {}
): void {
  const store = useChainSearchStore();
  const ui = useUIStore();
  const { from, ...apply } = opts;
  ui.planFromInstant = { chain: [...chain], back, ...(from ? { from } : {}) };
  store.applyChain(chain, true, apply);
  store.generateWhenPlannerOpens = true;
  ui.openPlannerRequested++;
}

/** "166 → 189 → 196 → 198 → 222 → 255". */
export function routeText(chain: number[]): string {
  return chain.join(' → ');
}
