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

export function simulateRoute(
  chain: number[],
  back: 'fastest' | 'by-date',
  opts: { start?: number; legs?: LegSummary[] } = {}
): void {
  const store = useChainSearchStore();
  const ui = useUIStore();
  ui.planFromInstant = { chain: [...chain], back };
  store.applyChain(chain, true, opts);
  store.generateWhenPlannerOpens = true;
  ui.openPlannerRequested++;
}

/** "166 → 189 → 196 → 198 → 222 → 255". */
export function routeText(chain: number[]): string {
  return chain.join(' → ');
}
