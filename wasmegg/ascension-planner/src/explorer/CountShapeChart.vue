<!--
  Where each ascension lands, for every run at one ascension count.

  ONE LINE PER RUN, x is the checkpoint's position in the chain and y is where it sits. Read left
  to right it is the shape of somebody's plan: how soon the first ascension comes, how the gaps
  open up, how far short of the target the last checkpoint stops. Read as a stack it is the only
  cross-account claim this data supports -- durations are not comparable between accounts, but
  "the last checkpoint sits around 0.4 of the way" is.

  FRACTION OF THE JOURNEY IS THE DEFAULT AXIS, and the toggle to absolute TE is there to show why.
  These runs start anywhere from 125 to 198 TE against targets from 295 to 490, so in absolute TE
  the lines are a fan that says little more than "different people are at different places". As a
  fraction of each account's own current-TE-to-target distance they collapse onto each other, or
  they do not -- and either answer is information.

  The median is drawn thicker over the top because eight thin lines do not have a visible middle,
  and the middle is the thing anybody reading this is trying to find.
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
            axis === mode.id
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          "
          @click="axis = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>
      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
        {{ rows.length }} runs · {{ bands.length }} checkpoints
      </span>
    </div>

    <EChart v-if="rows.length" :option="option" height="300px" />

    <!-- The same numbers as the chart, for the reader who wants to copy one. Deliberately the
         fraction and the absolute TE together: the fraction is the transferable claim, the TE is
         what someone actually types into the planner. -->
    <div class="overflow-x-auto">
      <table class="w-full text-[11px]">
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <th class="text-left py-1 pr-3">Checkpoint</th>
            <th class="text-right py-1 pr-3">Lowest</th>
            <th class="text-right py-1 pr-3">Median</th>
            <th class="text-right py-1 pr-3">Highest</th>
            <th class="text-right py-1 pr-3">Runs</th>
            <th class="text-left py-1">On a {{ sampleLabel }} account</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="band in bands" :key="band.index">
            <td class="py-1 pr-3 font-bold text-slate-600">{{ band.index + 1 }}</td>
            <td class="py-1 pr-3 text-right font-mono-premium text-slate-500">{{ band.lo.toFixed(3) }}</td>
            <td class="py-1 pr-3 text-right font-mono-premium font-black text-slate-800">{{ band.mid.toFixed(3) }}</td>
            <td class="py-1 pr-3 text-right font-mono-premium text-slate-500">{{ band.hi.toFixed(3) }}</td>
            <td class="py-1 pr-3 text-right text-slate-400">{{ band.samples }}</td>
            <td class="py-1 font-mono-premium text-slate-500">{{ absolute(band.lo) }}–{{ absolute(band.hi) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { CollectorRow } from './collector';
import type { PositionBand } from './analysis';
import { accountKey, chainFractions } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{
  rows: CollectorRow[];
  bands: PositionBand[];
  /** Account key -> colour index, so a line is the same colour on every chart on the page. */
  accountColors: Map<string, number>;
  /** The journey the table's absolute-TE column is rendered against. */
  journeyFrom: number;
  journeyTo: number;
}>();

type AxisMode = 'fraction' | 'absolute';
const axis = ref<AxisMode>('fraction');
const MODES: { id: AxisMode; label: string }[] = [
  { id: 'fraction', label: 'Fraction of journey' },
  { id: 'absolute', label: 'Absolute TE' },
];

const sampleLabel = computed(() => `${props.journeyFrom} → ${props.journeyTo}`);

function absolute(fraction: number): number {
  return Math.round(props.journeyFrom + fraction * (props.journeyTo - props.journeyFrom));
}

const option = computed<ChartOption>(() => {
  const series: ChartSeriesOption[] = props.rows.map(row => {
    const values =
      axis.value === 'fraction'
        ? chainFractions(row.chain, row.currentTE, row.finalTE)
        : row.chain.slice(0, -1).map(v => v);
    const color = colorAt(props.accountColors.get(accountKey(row)) ?? 0);
    return {
      name: `${row.nickname || 'anonymous'} · ${row.currentTE}→${row.finalTE}`,
      type: 'line' as const,
      data: values.map((v, i) => [i + 1, v, row.chain.join(' ')]),
      color,
      symbolSize: 5,
      lineStyle: { width: 1, opacity: 0.55 },
      itemStyle: { opacity: 0.8 },
    };
  });

  if (axis.value === 'fraction' && props.bands.length) {
    series.push({
      name: 'Median',
      type: 'line' as const,
      data: props.bands.map(b => [b.index + 1, b.mid, 'median of these runs']),
      color: '#0f172a',
      symbolSize: 7,
      lineStyle: { width: 2.5 },
      z: 5,
    });
  }

  return {
    grid: { left: 54, right: 16, top: 14, bottom: 38 },
    tooltip: {
      trigger: 'item',
      formatter: raw => {
        const params = raw as { data?: [number, number, string]; seriesName?: string };
        if (!params.data) return '';
        const value = axis.value === 'fraction' ? params.data[1].toFixed(3) : `${params.data[1]} TE`;
        // Every interpolation is escaped: the series name carries a submitted nickname, which is
        // free text, and this string becomes innerHTML. See lib/charts/tooltip.ts.
        return `<b>${esc(params.seriesName)}</b><br/>checkpoint ${esc(params.data[0])}: ${esc(value)}<br/><span style="color:#94a3b8">${esc(params.data[2])}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'checkpoint',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      minInterval: 1,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: axis.value === 'fraction' ? 'fraction of journey' : 'TE',
      nameTextStyle: AXIS_LABEL,
      scale: axis.value === 'absolute',
      min: axis.value === 'fraction' ? 0 : undefined,
      max: axis.value === 'fraction' ? 1 : undefined,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
