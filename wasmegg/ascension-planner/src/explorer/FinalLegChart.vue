<!--
  The final leg, which is the same for everybody once you divide out the delivery rate.

  x is the last checkpoint before 490, y is the final leg's days times its peak delivery rate:
  the amount of delivery work the leg is. On the submissions so far every account lands on one
  line, 1077 + 22.35 x (490 - X), to within a percent, across gear from 8.5 to 12 q/hr. So a point
  well off the line is worth a look -- it is a run, or an account, that something else is
  happening to.
-->
<template>
  <div class="space-y-2">
    <EChart v-if="points.length" :option="option" height="300px" />
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No run to 490 TE here carries per-leg detail yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import { finalLegWork } from '@/search/virtueScore';
import type { CollectorRow } from './collector';
import { accountKey } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{
  rows: CollectorRow[];
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

interface Point {
  key: string;
  x: number;
  work: number;
  days: number;
  qph: number;
  chain: string;
}

const points = computed<Point[]>(() =>
  props.rows
    .filter(r => r.finalTE === 490 && r.legs?.length && r.chain.length >= 2)
    .map(r => {
      const last = r.legs[r.legs.length - 1];
      return {
        key: accountKey(r),
        x: r.chain[r.chain.length - 2],
        work: last.days * last.peakDeliveryQph,
        days: last.days,
        qph: last.peakDeliveryQph,
        chain: r.chain.join(' '),
      };
    })
    .filter(p => p.work > 0)
);

const option = computed<ChartOption>(() => {
  const byAccount = new Map<string, Point[]>();
  for (const p of points.value) {
    const list = byAccount.get(p.key);
    if (list) list.push(p);
    else byAccount.set(p.key, [p]);
  }
  const series: ChartSeriesOption[] = [...byAccount.entries()].map(([key, list], i) => ({
    name: props.accountLabels.get(key) ?? key,
    type: 'scatter' as const,
    data: list.map(p => [p.x, p.work, p.days, p.qph, p.chain]),
    color: colorAt(props.accountColors.get(key) ?? i),
    symbolSize: 8,
  }));
  const xs = points.value.map(p => p.x);
  const lo = Math.min(...xs) - 10;
  const hi = Math.max(...xs) + 10;
  series.push({
    name: 'fitted: 1077 + 22.35 × (490 − X)',
    type: 'line' as const,
    data: [
      [lo, finalLegWork(lo)],
      [hi, finalLegWork(hi)],
    ],
    color: '#94a3b8',
    symbol: 'none',
    lineStyle: { width: 1.5, type: 'dashed' },
    tooltip: { show: false },
  });

  return {
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
        const params = raw as { data?: [number, number, number, number, string]; seriesName?: string };
        if (!params.data || params.data.length < 5) return '';
        const [x, work, days, qph, chain] = params.data;
        const off = ((work / finalLegWork(x) - 1) * 100).toFixed(1);
        return `<b>${esc(params.seriesName)}</b><br/>last checkpoint ${esc(x)}: ${esc(days.toFixed(1))} d at ${esc(qph.toFixed(2))} q/hr<br/>${esc(work.toFixed(0))} q/hr·d, ${esc(off)}% from the line<br/><span style="color:#94a3b8">${esc(chain)}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'last checkpoint (TE)',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: 'final-leg days × peak q/hr',
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
