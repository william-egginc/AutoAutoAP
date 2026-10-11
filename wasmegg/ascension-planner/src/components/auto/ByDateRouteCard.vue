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
  <ResultCardFrame :still-going="running" data-testid="by-date-route-card">
    <template #heading>
      <template v-if="running">Best so far · highest by {{ when(deadline) }}</template
      ><template v-else>Highest by {{ when(deadline) }}</template>
      <slot name="heading" />
    </template>
    <template #headline>
      <p class="text-lg font-black text-emerald-900 break-words">
        {{ lastStop }} TE
        <span class="text-sm font-bold">via {{ route.chain.join(' ') }}</span>
      </p>
    </template>
    <p class="text-[11px] text-emerald-900 leading-relaxed">
      Reached {{ when(route.reachAt)
      }}<template v-if="route.ascendAt !== route.reachAt"> (you can ascend from {{ when(route.ascendAt) }})</template>,
      with {{ spareLabel(route.spare) }} to spare.
      <slot />
    </p>
    <div v-if="legs.length" class="overflow-x-auto">
      <table class="text-[11px] tabular-nums whitespace-nowrap">
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
    <!-- TE per egg when the route ends, and each egg's next TE at the final delivery rate
         (search/endEggs.ts). Only when the last leg carries its end state: nothing rather than a guess. -->
    <div v-if="eggs" class="space-y-1" data-testid="by-date-te-per-egg">
      <div class="overflow-x-auto">
        <table class="text-[11px] tabular-nums whitespace-nowrap">
          <thead>
            <tr class="text-left text-[9px] font-black uppercase tracking-widest text-emerald-700">
              <th class="pr-4 py-1">TE per egg</th>
              <th class="pr-4 py-1">TE</th>
              <th class="pr-4 py-1">Next TE in</th>
              <th v-if="eggs.rate" class="pr-4 py-1">At final rate</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in eggs.rows" :key="r.egg" class="border-t border-emerald-100">
              <td class="pr-4 py-1">
                {{ VIRTUE_EGG_NAMES[r.egg]
                }}<span
                  v-if="r.laying"
                  class="text-[9px] text-emerald-700/80"
                  title="The egg the farm is on at the end"
                >
                  · laying</span
                >
              </td>
              <td class="pr-4 py-1 font-bold">{{ r.te }}</td>
              <td class="pr-4 py-1">{{ r.need === null ? 'all 98' : `${formatNumber(r.need, 2)} eggs` }}</td>
              <td v-if="eggs.rate" class="pr-4 py-1">{{ r.seconds === null ? '—' : spareLabel(r.seconds) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="eggs.next" class="text-[11px] text-emerald-900 leading-relaxed" data-testid="by-date-next-te">
        If you keep laying after the last stop, your next TE would arrive about {{ when(eggs.next.at) }} ({{
          VIRTUE_EGG_NAMES[eggs.next.egg]
        }}, at the final rate of {{ formatNumber(eggs.rate! * 3600, 2) }} eggs an hour).
      </p>
    </div>
    <!-- Simulate this plan (search/simulateRoute.ts), as the instant answer's rows: this route in Your
         plan, from the run's own plan start and first-ascension setting. -->
    <div v-if="simulate" class="pt-1">
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 text-[10px] font-black uppercase tracking-widest hover:bg-white"
        title="Opens this route in Your plan, simulated step by step on your save"
        data-testid="by-date-simulate"
        @click="emit('simulate')"
      >
        Simulate this plan
      </button>
      <p v-if="simulateNote" class="mt-1 text-[10px] text-emerald-900/70" data-testid="by-date-simulate-note">
        {{ simulateNote }}
      </p>
    </div>
  </ResultCardFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ResultCardFrame from './ResultCardFrame.vue';
import { showDateTime } from '@/lib/displayTime';
import { spareLabel } from '@/search/deadlineSummary';
import type { DeadlineRoute } from '@/search/deadline';
import { endEggsOf } from '@/search/endEggs';
import { formatNumber } from '@/lib/format';
import { VIRTUE_EGG_NAMES } from '@/types';

const props = defineProps<{
  route: DeadlineRoute;
  /** The deadline, unix seconds. */
  deadline: number;
  /** The planner's time zone, for every date shown. */
  zone: string;
  /** The run is still going: this is its best so far. */
  running?: boolean;
  /** Show Simulate this plan (emits `simulate`). */
  simulate?: boolean;
  /** One line under that button, e.g. that Your plan prices a build-up first ascension differently. */
  simulateNote?: string;
}>();
const emit = defineEmits<{ simulate: [] }>();

const lastStop = computed(() => props.route.chain[props.route.chain.length - 1]);
const legs = computed(() => (Array.isArray(props.route.legs) ? props.route.legs : []));
/** TE per egg at the end and each egg's next TE (search/endEggs.ts); null when the legs don't say. */
const eggs = computed(() => endEggsOf(props.route));

const okNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function when(unixSeconds: number): string {
  return okNumber(unixSeconds) && unixSeconds > 0 ? showDateTime(unixSeconds, props.zone) : '—';
}
</script>
