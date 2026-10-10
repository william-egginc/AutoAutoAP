<!--
  By a date's best route, in one green card: the finished answer ("Highest by Jul 14, 2027 at
  10:00 AM / 247 TE via 166 197 223 247 / Reached ... with 27.3 h to spare", then a row per stop),
  and the same card for the best so far while the run is going (`running`), so the route the run
  would give you now reads as clearly as the answer it ends with.

  A best so far may not have its legs yet (a carry-on's replayed routes come back without them until
  the end of the run fills them in): the card then says so instead of showing an empty table, and a
  leg missing a number shows a dash.
-->
<template>
  <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2" data-testid="by-date-route-card">
    <p class="text-[10px] font-black uppercase tracking-widest text-emerald-800">
      <template v-if="running">Best so far · highest by {{ when(deadline) }}</template
      ><template v-else>Highest by {{ when(deadline) }}</template>
      <slot name="heading" />
    </p>
    <p class="text-lg font-black text-emerald-900 break-words">
      {{ lastStop }} TE
      <span class="text-sm font-bold">via {{ route.chain.join(' ') }}</span>
    </p>
    <p class="text-[11px] text-emerald-900 leading-relaxed">
      Reached {{ when(route.reachAt)
      }}<template v-if="route.ascendAt !== route.reachAt"> (you can ascend from {{ when(route.ascendAt) }})</template>,
      with {{ spareLabel(route.spare) }} to spare.
      <template v-if="running"> The search is still going, so this can still improve.</template>
      <slot />
    </p>
    <div v-if="legs.length" class="overflow-x-auto">
      <table class="text-[11px] tabular-nums">
        <thead>
          <tr class="text-left text-[9px] font-black uppercase tracking-widest text-emerald-700">
            <th class="pr-4 py-1">Stop</th>
            <th class="pr-4 py-1">Reached</th>
            <th class="pr-4 py-1">Leg</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(leg, i) in legs" :key="i" class="border-t border-emerald-100">
            <td class="pr-4 py-1 font-bold">{{ leg.endTE ?? '—' }}</td>
            <td class="pr-4 py-1">{{ okNumber(leg.endTime) ? when(leg.endTime) : '—' }}</td>
            <td class="pr-4 py-1">
              {{ okNumber(leg.durationSeconds) ? `${(leg.durationSeconds / 86400).toFixed(1)} d` : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="running" class="text-[10px] text-emerald-900/70" data-testid="by-date-card-no-legs">
      The time of each stop comes with the finished result.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { showDateTime } from '@/lib/displayTime';
import { spareLabel } from '@/search/deadlineSummary';
import type { DeadlineRoute } from '@/search/deadline';

const props = defineProps<{
  route: DeadlineRoute;
  /** The deadline, unix seconds. */
  deadline: number;
  /** The planner's time zone, for every date shown. */
  zone: string;
  /** The run is still going: this is its best so far. */
  running?: boolean;
}>();

const lastStop = computed(() => props.route.chain[props.route.chain.length - 1]);
const legs = computed(() => (Array.isArray(props.route.legs) ? props.route.legs : []));

const okNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function when(unixSeconds: number): string {
  return okNumber(unixSeconds) && unixSeconds > 0 ? showDateTime(unixSeconds, props.zone) : '—';
}
</script>
