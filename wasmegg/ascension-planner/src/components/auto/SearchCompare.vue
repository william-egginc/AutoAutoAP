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
    <h3 class="text-slate-500 label">Compare the answers</h3>
    <div class="divide-y divide-slate-100">
      <div
        v-for="r in rows"
        :key="r.id"
        class="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-body"
        :data-testid="`compare-${r.id}`"
      >
        <span class="w-32 shrink-0 font-bold text-slate-800">
          {{ r.label }}
          <span
            v-if="r.best"
            class="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white label"
            >Best</span
          >
        </span>
        <template v-if="r.entry">
          <span v-if="goal === 'date'" class="font-bold text-slate-900">{{ r.entry.endTE }} TE</span>
          <span v-else class="font-bold text-slate-900">{{ show(r.entry.end) }}</span>
          <span v-if="goal === 'date' && r.entry.spare !== undefined" class="text-slate-600"
            >{{ spareLabel(r.entry.spare) }} spare</span
          >
          <span class="tabular-nums text-slate-700 break-all">{{ r.entry.chain.join(' ') }}</span>
          <span class="text-small text-slate-500">{{ note(r) }}</span>
        </template>
        <span v-else class="text-slate-400">not run yet</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSearchSnapshots } from '@/composables/useSearchSnapshots';
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

// Each search's latest answer (a best so far while it runs), kept by the screen too.
useSearchSnapshots(props.goal);

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
