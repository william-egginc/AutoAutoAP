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
import type { VariantKey } from '@/stores/autoPlanner';
import { NAMES } from '@/lib/siteNav';

/**
 * `opts.from`: where the banner says the route came from ("the instant answer" unless given; By a
 * date's answer card passes its own). `opts.firstAscension`: the setting the route was priced under,
 * for a result whose run recorded its own (stores/chainSearch.ts `applyChain`).
 */
export function simulateRoute(
  chain: number[],
  back: 'fastest' | 'by-date',
  opts: { start?: number; legs?: LegSummary[]; firstAscension?: FirstAscension; firstKey?: VariantKey; from?: string } = {}
): void {
  const store = useChainSearchStore();
  const ui = useUIStore();
  const { from, ...apply } = opts;
  ui.planFromInstant = { chain: [...chain], back, ...(from ? { from } : {}) };
  store.applyChain(chain, true, apply);
  store.generateWhenPlannerOpens = true;
  ui.openPlannerRequested++;
}

/**
 * What the instant answer's "Simulate this plan" hands on (28 Oct 2026, Jordan's By a date answer that Single run
 * finished 5 days later): the start it was worked out from, the first-ascension setting it was priced under, and the
 * build its A1 took, so Classic's A1 pick follows the answer (`classicFirstPick`) as By a date's cards do
 * (byDateSimulate.ts). An A1 that continued the build-up has no Single run equivalent: Classic prices that ascension
 * as a fresh build or a continue, so `note` says its dates can run later.
 */
export const INSTANT_BUILDUP_NOTE = `This route's first ascension continues your build-up, which ${NAMES.classic} can't do: it starts that ascension with a fresh build (or the farm as it is), so its dates can run later than this answer's.`;

export function instantSimulate(
  route: { legs: readonly { label: string }[] } | null | undefined,
  run: { start?: number; firstAscension?: FirstAscension | null }
): { opts: { start?: number; firstAscension?: FirstAscension; firstKey?: VariantKey }; note: string } {
  const label = route?.legs[0]?.label ?? '';
  const firstKey = /^(continue|buildup|[1-9]-sale(-tier13)?)$/.test(label) ? (label as VariantKey) : undefined;
  return {
    opts: {
      ...(run.start && run.start > 0 ? { start: run.start } : {}),
      ...(run.firstAscension ? { firstAscension: run.firstAscension } : {}),
      ...(firstKey ? { firstKey } : {}),
    },
    note: firstKey === 'buildup' ? INSTANT_BUILDUP_NOTE : '',
  };
}

/** "166 → 189 → 196 → 198 → 222 → 255". */
export function routeText(chain: number[]): string {
  return chain.join(' → ');
}
