<!--
  By a date's best route, in the same green card as Fastest's (RouteResultCard.vue, the user's egg-beta
  review 11 Oct): "Highest by Jul 14, 2027 at 10:00 AM", the route, "247 TE / reached ..., 27.3 h to
  spare" on the right, the notes, the button row (Simulate this plan, Share, CSV, Save answer), and
  the leg table under the card laid out as Fastest's,
  and the same card for the best so far while the run is going (`running`), so the route the run
  would give you now reads as clearly as the answer it ends with.

  A best so far may not have its legs yet (a carry-on's replayed routes come back without them until
  the end of the run fills them in): the card then says so instead of showing an empty table, and a
  leg missing a number shows a dash.
-->
<template>
  <div class="space-y-3">
    <ResultCardFrame :still-going="running" data-testid="by-date-route-card">
      <template #heading>
        <template v-if="running">Best so far · highest by {{ when(deadline) }}</template
        ><template v-else>Highest by {{ when(deadline) }}</template>
        <slot name="heading" />
      </template>
      <!-- The same headline and aside as Fastest's card (RouteResultCard.vue): the route, then the number
           and when it lands on the right. -->
      <template #headline>
        <div class="font-mono-premium text-lg sm:text-xl font-black text-slate-900 break-words">
          {{ route.chain.join(' ') }}
        </div>
      </template>
      <template #aside>
        <div class="text-lg font-black text-slate-900 tabular-nums">{{ lastStop }} TE</div>
        <div class="text-[11px] font-bold text-emerald-800">
          reached {{ when(route.reachAt) }}, {{ spareLabel(route.spare) }} to spare
        </div>
      </template>
      <p v-if="route.ascendAt !== route.reachAt || $slots.default" :class="CARD_NOTE">
        <template v-if="route.ascendAt !== route.reachAt">You can ascend from {{ when(route.ascendAt) }}.</template>
        <slot />
      </p>
      <p v-if="!legs.length && running" class="text-[10px] text-emerald-900/70" data-testid="by-date-card-no-legs">
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
        <p v-if="eggs.next" :class="CARD_NOTE" data-testid="by-date-next-te">
          If you keep laying after the last stop, your next TE would arrive about {{ when(eggs.next.at) }} ({{
            VIRTUE_EGG_NAMES[eggs.next.egg]
          }}, at the final rate of {{ formatNumber(eggs.rate! * 3600, 2) }} eggs an hour).
        </p>
      </div>
      <p v-if="simulate && simulateNote" class="text-[10px] text-emerald-900/70" data-testid="by-date-simulate-note">
        {{ simulateNote }}
      </p>
      <!-- The same row as Fastest's card, in the same order: the main action (Simulate this plan, as
           the instant answer's rows: this route in Your plan, search/simulateRoute.ts), Share, CSV, Save.
           Mid-run only Simulate (the rest belong to the finished answer). -->
      <template v-if="simulate || canShare || canCsv || canSave" #actions>
        <button
          v-if="simulate"
          type="button"
          :class="PRIMARY_BUTTON"
          title="Opens this route in Your plan, simulated step by step on your save"
          data-testid="by-date-simulate"
          @click="emit('simulate')"
        >
          Simulate this plan
        </button>
        <template v-if="!running">
          <button v-if="canShare" type="button" :class="SECONDARY_BUTTON" data-testid="by-date-share" @click="toShare">
            Share
          </button>
          <button v-if="canCsv" type="button" :class="SECONDARY_BUTTON" data-testid="by-date-csv" @click="emit('csv')">
            CSV ↓
          </button>
          <button
            v-if="canSave"
            type="button"
            :class="SECONDARY_BUTTON"
            :disabled="saving"
            data-testid="by-date-save"
            @click="emit('save')"
          >
            {{ saving ? 'Saving...' : 'Save answer' }}
          </button>
          <span v-if="note" class="text-[11px] font-semibold text-emerald-800">{{ note }}</span>
        </template>
      </template>
    </ResultCardFrame>
    <!-- A row per stop, laid out as Fastest's leg table (under its card too). -->
    <div v-if="legs.length" class="overflow-x-auto" data-testid="by-date-legs">
      <table :class="LEG_TABLE">
        <thead>
          <tr :class="LEG_HEAD">
            <th class="py-2 pr-3">Leg</th>
            <th class="py-2 pr-3">→ TE</th>
            <th class="py-2 pr-3">Start</th>
            <th class="py-2 pr-3">Finish</th>
            <th class="py-2 pr-3">Days</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(leg, i) in legs" :key="i" :class="LEG_ROW">
            <td class="py-1.5 pr-3 font-black text-slate-700 whitespace-nowrap">A{{ i + 1 }}</td>
            <td class="py-1.5 pr-3 font-bold text-slate-600">{{ leg.endTE ?? '—' }}</td>
            <td class="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{{ startOf(i) }}</td>
            <td class="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
              {{ okNumber(leg.endTime) ? when(leg.endTime) : '—' }}
            </td>
            <td class="py-1.5 pr-3 text-slate-500">
              {{ okNumber(leg.durationSeconds) ? (leg.durationSeconds / 86400).toFixed(2) : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ResultCardFrame from './ResultCardFrame.vue';
import { CARD_NOTE, LEG_HEAD, LEG_ROW, LEG_TABLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from './resultCardStyle';
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
  /** The rest of the row, as on Fastest's card: Share (scrolls to Share this result), CSV ↓ (emits
   *  `csv`), Save answer (emits `save`). Finished answers only. */
  canShare?: boolean;
  canCsv?: boolean;
  canSave?: boolean;
  saving?: boolean;
  /** A line after the buttons: what the last click did. */
  note?: string;
}>();
const emit = defineEmits<{ simulate: []; csv: []; save: [] }>();

/** Each panel's Share this result section carries id="share-this-result"; one panel is on screen. */
function toShare(): void {
  document.getElementById('share-this-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/** A leg's start: the leg before's end, or its own end less its length for the first. */
function startOf(i: number): string {
  const leg = legs.value[i];
  const prev = legs.value[i - 1];
  if (prev && okNumber(prev.endTime)) return when(prev.endTime);
  if (leg && okNumber(leg.endTime) && okNumber(leg.durationSeconds)) return when(leg.endTime - leg.durationSeconds);
  return '—';
}

const lastStop = computed(() => props.route.chain[props.route.chain.length - 1]);
const legs = computed(() => (Array.isArray(props.route.legs) ? props.route.legs : []));
/** TE per egg at the end and each egg's next TE (search/endEggs.ts); null when the legs don't say. */
const eggs = computed(() => endEggsOf(props.route));

const okNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function when(unixSeconds: number): string {
  return okNumber(unixSeconds) && unixSeconds > 0 ? showDateTime(unixSeconds, props.zone) : '—';
}
</script>
