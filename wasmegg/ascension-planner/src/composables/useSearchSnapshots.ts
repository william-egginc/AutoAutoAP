/**
 * Each search's latest answer in this visit (stores/stronger.ts `lastSearch`): for the hidden
 * sections' one-line results (CollapsibleSection.vue) and the comparison block. Called by both search
 * screens (FastestRoute.vue, DeadlinePanel.vue); it was SearchCompare's own, which is hidden for now.
 */
import { watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useStrongerStore } from '@/stores/stronger';

export function useSearchSnapshots(goal: 'fastest' | 'date'): void {
  const store = useChainSearchStore();
  const stronger = useStrongerStore();
  if (goal === 'fastest') {
    watch(
      () => [store.bestDays, store.bestChain.join(','), store.isRunning, store.chainRunKind, store.planStart] as const,
      () => {
        if (!(store.bestDays > 0) || !store.bestChain.length) return;
        stronger.lastSearch[store.chainRunKind] = {
          chain: [...store.bestChain],
          end: store.planStart + store.bestDays * 86400,
          endTE: store.finalTE,
          exact: true,
          running: store.isRunning,
          at: store.chainResultAt || Date.now(),
        };
      },
      { immediate: true }
    );
    return;
  }
  watch(
    () => [store.deadlineResult, store.deadlineRunning, store.deadlineProgress?.best] as const,
    () => {
      const live = store.deadlineRunning ? store.deadlineProgress?.best : null;
      const r = store.deadlineResult;
      const route = live ?? r?.routes[0];
      if (!route) return;
      const simple = store.deadlineRunning ? !!store.deadlineRunSimple : !!r?.simple;
      stronger.lastSearch[simple ? 'around' : 'boxes'] = {
        chain: [...route.chain],
        end: route.reachAt,
        endTE: route.chain[route.chain.length - 1],
        spare: route.spare,
        exact: true,
        running: store.deadlineRunning,
        at: r?.at,
      };
    },
    { immediate: true }
  );
}
