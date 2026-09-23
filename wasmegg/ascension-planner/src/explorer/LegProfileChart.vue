<!--
  How each ascension in the chain actually goes: leg by leg, for every run at one count.

  A chain is not a number, it is a sequence of ascensions that get progressively faster to earn in
  and progressively more expensive to reach. That shape is in every submission already -- each run
  carries its per-leg days, its per-leg peak delivery rate and which sale strategy the simulator
  picked -- and it is the part a summary row throws away.

  WHAT TO LOOK FOR, and why both axes are offered:

    - DAYS shows where the plan's time really goes. It is almost never evenly spread: the opening
      legs are short because the TE gap is small, and the last leg before the target is routinely
      a third of the whole plan.
    - PEAK DELIVERY climbs leg over leg as research carries forward, which is the entire mechanism
      that makes a chain beat a single enormous ascension. A line that flattens early is an account
      that has stopped gaining from another prestige, and that is the argument for a shorter chain
      made visible.

  Runs are coloured by account, so a fan of one colour is one person's several attempts and a fan
  of several is a shape that repeats across accounts.
-->
<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex gap-1.5">
        <button
          v-for="mode in MODES"
          :key="mode.id"
          type="button"
          class="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
          :class="
            metric === mode.id
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          "
          @click="metric = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>
      <span v-if="!withLegs.length" class="text-[10px] font-bold text-amber-700">
        No run at this count carried per-leg detail.
      </span>
    </div>

    <EChart v-if="withLegs.length" :option="option" height="280px" />
    <p class="text-[10px] text-slate-400 leading-relaxed px-1">{{ MODES.find(m => m.id === metric)?.hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { CollectorRow } from './collector';
import { accountKey } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{ rows: CollectorRow[]; accountColors: Map<string, number> }>();

type Metric = 'days' | 'rate';
const metric = ref<Metric>('days');
const MODES: { id: Metric; label: string; hint: string }[] = [
  {
    id: 'days',
    label: 'Days per leg',
    hint: 'How long each ascension takes. The last leg before the target is usually the biggest single block in the plan, which is what makes the last checkpoint the value worth arguing about.',
  },
  {
    id: 'rate',
    label: 'Peak delivery',
    hint: 'Peak delivery rate each leg reaches, in q/hr. It should climb leg over leg as research carries forward — that climb is the whole reason chaining beats one long ascension, and a line that has flattened is an account that would do as well with fewer.',
  },
];

/** A submission replayed from a checkpoint carries no legs; it cannot be drawn and is not faked. */
const withLegs = computed(() => props.rows.filter(r => Array.isArray(r.legs) && r.legs.length));

const option = computed<ChartOption>(() => {
  const series: ChartSeriesOption[] = withLegs.value.map(row => ({
    name: `${row.nickname || 'anonymous'} · ${row.durationDays.toFixed(1)} d`,
    type: 'line' as const,
    data: row.legs.map((leg, i) => [
      i + 1,
      metric.value === 'days' ? leg.days : leg.peakDeliveryQph,
      `${leg.te} TE · ${leg.strategy}`,
    ]),
    color: colorAt(props.accountColors.get(accountKey(row)) ?? 0),
    symbolSize: 5,
    lineStyle: { width: 1.2, opacity: 0.7 },
  }));

  return {
    grid: { left: 52, right: 16, top: 14, bottom: 38 },
    tooltip: {
      trigger: 'item',
      formatter: raw => {
        const params = raw as { data?: [number, number, string]; seriesName?: string };
        if (!params.data) return '';
        const unit = metric.value === 'days' ? 'days' : 'q/hr';
        // Escaped throughout: the series name carries a submitted nickname and data[2] carries the
        // leg's strategy string, both free text, and this becomes innerHTML. See charts/tooltip.ts.
        return `<b>${esc(params.seriesName)}</b><br/>leg ${esc(params.data[0])}: ${esc(params.data[1].toFixed(3))} ${esc(unit)}<br/><span style="color:#94a3b8">${esc(params.data[2])}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'leg',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      minInterval: 1,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: metric.value === 'days' ? 'days' : 'q/hr',
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
