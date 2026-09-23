<!--
  Does one more ascension help? One line per account, never one line across accounts.

  THE MISTAKE THIS CHART IS BUILT TO AVOID. Plot every submitted run as (ascensions, days) and the
  cloud will show 8-ascension runs beating 6-ascension runs, or the reverse, depending entirely on
  whose account happened to submit which. Durations are not comparable between accounts: artifacts,
  colleggtibles, epic research and starting TE all move a plan by hundreds of days, and none of
  them are the chain. So the only version of this question worth drawing is within one account,
  where those are held still.

  TWO GRADES OF EVIDENCE, drawn differently on purpose. A SOLID line comes from a single exhaustive
  run that priced several counts in one pass -- same save, same instant, same everything, so the
  comparison is controlled and the slope is real. A DASHED line is several runs from one account on
  different days, which is still far better than comparing strangers and still not an experiment:
  an account that gained 40 TE between two runs is not quite the same account twice.

  An account with one count is not drawn. A single point makes no comparison and costs a legend row.
-->
<template>
  <div class="space-y-2">
    <EChart v-if="comparisons.length" :option="option" height="300px" />
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No account here has submitted two different ascension counts against this target yet, so there is nothing to
      compare. One exhaustive run covering a range of counts would answer it outright.
    </p>
    <div v-if="comparisons.length" class="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] font-bold text-slate-400">
      <span>—— one exhaustive run, controlled</span>
      <span>- - - several runs from one account, different days</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { CountComparison } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{ comparisons: CountComparison[]; accountColors: Map<string, number> }>();

const option = computed<ChartOption>(() => {
  const series: ChartSeriesOption[] = props.comparisons.map((comparison, i) => ({
    name: comparison.label,
    type: 'line' as const,
    data: comparison.points.map(p => [p.ascensions, p.days, `${p.chain.join(' ')} · from ${p.currentTE} TE`]),
    color: colorAt(props.accountColors.get(comparison.accountKey) ?? i),
    symbolSize: 7,
    lineStyle: { width: 2, type: comparison.singleRun ? 'solid' : 'dashed' },
  }));

  return {
    // Room for the legend under the axis. Four account names on one line is exactly the width
    // where echarts stops wrapping and starts overlapping them, so the legend gets its own band
    // and long labels are cut rather than allowed to collide.
    grid: { left: 60, right: 16, top: 14, bottom: 70 },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemGap: 18,
      textStyle: { fontSize: 10, color: '#64748b' },
      formatter: (name: string) => (name.length > 30 ? `${name.slice(0, 29)}…` : name),
    },
    tooltip: {
      trigger: 'item',
      formatter: raw => {
        const params = raw as { data?: [number, number, string]; seriesName?: string };
        if (!params.data) return '';
        // Escaped throughout: the series name is `accountLabel()`, which is built from submitted
        // nicknames, and this string becomes innerHTML. See lib/charts/tooltip.ts.
        return `<b>${esc(params.seriesName)}</b><br/>${esc(params.data[0])} ascensions: ${esc(params.data[1].toFixed(2))} days<br/><span style="color:#94a3b8">${esc(params.data[2])}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'ascensions',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      minInterval: 1,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: 'days',
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
