<!--
  The answers side by side, right under the instant answer (the user, 12 Oct 2026): "Instant answer",
  "Stronger check" and "Exhaustive", each with its route, when it finishes (Fastest) or the TE and the
  spare (By a date), and "not run yet" when there is none; the best is marked (search/compareAnswers.ts).
  The stronger check's line is the better of its own Best now and the search around the answer. Each
  box below keeps its own detailed results. Each search's last answer in this visit is kept
  (stores/stronger.ts `lastSearch`), so running the other search doesn't wipe it.
-->
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" data-testid="search-compare">
    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Compare the answers</h3>
    <div class="divide-y divide-slate-100">
      <div
        v-for="r in rows"
        :key="r.id"
        class="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]"
        :data-testid="`compare-${r.id}`"
      >
        <span class="w-32 shrink-0 font-black text-slate-800">
          {{ r.label }}
          <span
            v-if="r.best"
            class="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest"
            >Best</span
          >
        </span>
        <template v-if="r.entry">
          <span v-if="goal === 'date'" class="font-black text-slate-900">{{ r.entry.endTE }} TE</span>
          <span v-else class="font-bold text-slate-900">{{ show(r.entry.end) }}</span>
          <span v-if="goal === 'date' && r.entry.spare !== undefined" class="text-slate-600"
            >{{ spareLabel(r.entry.spare) }} spare</span
          >
          <span class="font-mono-premium text-slate-700 break-all">{{ r.entry.chain.join(' ') }}</span>
          <span class="text-[10px] text-slate-500">{{ note(r) }}</span>
        </template>
        <span v-else class="text-slate-400">not run yet</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useStrongerStore } from '@/stores/stronger';
import { showDateTime } from '@/lib/displayTime';
import { spareLabel } from '@/search/deadlineSummary';
import { compareRows, pick, type CompareRow } from '@/search/compareAnswers';

const props = defineProps<{ goal: 'fastest' | 'date' }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();
const stronger = useStrongerStore();

const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
const show = (unix: number) => showDateTime(unix, zone.value);

// Keep each search's latest answer (a best so far while it runs).
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

const rows = computed(() =>
  props.goal === 'fastest'
    ? compareRows('fastest', {
        instant: stronger.instant.fastest,
        stronger: pick('fastest', stronger.strongerBest.fastest, stronger.lastSearch.smart),
        exhaustive: stronger.lastSearch.full,
      })
    : compareRows('date', {
        instant: stronger.instant.date,
        stronger: pick('date', stronger.strongerBest.date, stronger.lastSearch.around),
        exhaustive: stronger.lastSearch.boxes,
      })
);

function note(r: CompareRow): string {
  const e = r.entry as (typeof r.entry & { running?: boolean }) | null;
  if (!e) return '';
  if (e.running) return 'so far, still running';
  if (r.id === 'instant') return e.exact ? 'checked exactly on your account' : 'from the instant answer, not checked yet';
  return 'priced on your account';
}
</script>
