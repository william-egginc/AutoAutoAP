<!--
  Under an answer (Fastest's and By a date's cards, the instant answer after Check exactly): when the
  first ascension switches egg, and what one more TE would cost (search/routeExtras.ts). Compact: the
  shifts fold into one line until opened; the TE is one line. Nothing when the legs don't say.
-->
<template>
  <div v-if="shifts.length || more" class="space-y-1 text-[11px] leading-relaxed" data-testid="route-extras">
    <details v-if="shifts.length" data-testid="first-shifts">
      <summary class="cursor-pointer font-semibold" :class="tone">
        First ascension: {{ shifts.length }} egg {{ shifts.length === 1 ? 'shift' : 'shifts' }},
        {{ short(shifts[0].at) }} to {{ short(shifts[shifts.length - 1].at) }}
      </summary>
      <ul class="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2 pl-4 list-disc" :class="muted">
        <li v-for="(s, i) in shifts" :key="i">
          Shift to {{ eggName(s.egg) }} · <span class="whitespace-nowrap">{{ short(s.at) }}</span>
        </li>
      </ul>
    </details>
    <p v-if="more" :class="tone" data-testid="one-more-te">
      <span class="font-semibold">One more TE ({{ more.te }}):</span>
      <template v-if="more.how === 'run'"
        >{{ ' ' }}about {{ span(more.seconds) }} more, so about <span class="whitespace-nowrap">{{ short(more.at) }}</span> (what
        {{ more.te - 1 }} cost over {{ more.te - 2 }} in this run).</template
      ><template v-else
        >{{ ' ' }}if you keep laying the same egg at the final rate, about {{ span(more.seconds) }} later, about
        <span class="whitespace-nowrap">{{ short(more.at) }}</span
        >.</template
      >
    </p>
  </div>
</template>

<script setup lang="ts">
import { formatMoment } from '@/lib/clock';
import { computed } from 'vue';
import type { LegSummary } from '@/search/types';
import { firstLegShifts, oneMoreTE } from '@/search/routeExtras';
import { VIRTUE_EGG_NAMES } from '@/types';

const props = withDefaults(
  defineProps<{
    chain: number[];
    legs: readonly LegSummary[] | null | undefined;
    /** Unix second the last stop is reached. */
    reachAt: number;
    zone: string;
    /** A run's measured cost of one more TE, seconds. */
    runCost?: number | null;
    /** On a green card or a plain box. */
    green?: boolean;
    /** One more TE only from `runCost`, never the final-rate estimate. */
    noRate?: boolean;
  }>(),
  { runCost: null, green: false, noRate: false }
);

const shifts = computed(() => firstLegShifts(props.legs));
const more = computed(() =>
  oneMoreTE({
    chain: props.chain,
    legs: props.legs,
    reachAt: props.reachAt,
    runCost: props.runCost,
    noRate: props.noRate,
  })
);
const tone = computed(() => (props.green ? 'text-emerald-900' : 'text-slate-700'));
const muted = computed(() => (props.green ? 'text-emerald-900/80' : 'text-slate-600'));

function eggName(egg: string): string {
  return (VIRTUE_EGG_NAMES as Record<string, string>)[egg] ?? egg;
}
/** "Tue, Oct 13, 4 PM" / "Tue, Oct 13, 4:30 PM" (en-US), in the plan's time zone (lib/clock.ts). */
function short(unix: number): string {
  return formatMoment(unix * 1000, { zone: props.zone, weekday: true, year: 'never', shortTime: true });
}
function span(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (h < 48) return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} days`;
}
</script>
