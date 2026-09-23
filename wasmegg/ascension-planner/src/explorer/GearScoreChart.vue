<!--
  Each account's gear as two numbers: delivery score (percent of the best delivery set) and Clothed
  TE (TE plus what the earnings set is worth in TE).

  These are the two axes accounts actually differ on. Everyone who has submitted so far has every
  epic research and every colleggtible maxed, so those do not separate anyone yet; delivery gear
  and TE do. Put next to each other they say whose run is slow because of delivery and whose is slow
  because of earnings.

  One bar per account, from its most recent run: gear changes when someone upgrades, and the
  latest set is the one their next run will use.
-->
<template>
  <div class="space-y-2">
    <div v-if="bars.length" class="grid gap-3 md:grid-cols-2">
      <EChart :option="deliveryOption" :height="`${chartHeight}px`" />
      <EChart :option="clothedOption" :height="`${chartHeight}px`" />
    </div>
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">No run here recorded its artifact sets.</p>
    <p class="text-[10px] text-slate-400 leading-relaxed px-1">
      Delivery score is √(lay × hab × shipping) over the same for T4L metronome, compass and gusset plus a 3-slot fourth
      piece, all eleven sockets T4. Grey marks are the peak rate the run actually reached, over 12 q/hr. Clothed TE is
      exact when colleggtibles and epic research are maxed and the permit is Pro; otherwise it is left out.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import { PERFECT_QPH } from '@/search/virtueScore';
import type { Account } from './analysis';
import { gearOf } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{ accounts: Account[]; accountColors: Map<string, number> }>();

const bars = computed(() =>
  props.accounts
    .map(a => {
      const latest = [...a.rows].sort((x, y) => (y.submittedAt ?? '').localeCompare(x.submittedAt ?? ''));
      const withGear = latest.find(r => r.delivery?.length || r.deliveryScore) ?? latest[0];
      // The peak is the best any run to 490 reached, not the latest run's: a short run to 300
      // ends before the farm reaches its rate and would read as worse gear.
      const peaks = a.rows
        .filter(r => r.finalTE === 490)
        .map(r => gearOf(r).peakQph)
        .filter((v): v is number => v !== null);
      const gear = { ...gearOf(withGear), peakQph: peaks.length ? Math.max(...peaks) : null };
      return { key: a.key, label: a.label, gear, te: withGear.currentTE };
    })
    .filter(b => b.gear.delivery !== null || b.gear.clothedTE !== null)
    .sort((a, b) => (b.gear.delivery ?? 0) - (a.gear.delivery ?? 0))
);

const chartHeight = computed(() => Math.max(160, bars.value.length * 26 + 50));

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

function base(title: string): ChartOption {
  return {
    grid: { left: 120, right: 40, top: 26, bottom: 24 },
    tooltip: { trigger: 'item' },
    xAxis: {
      type: 'value',
      name: title,
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: bars.value.map(b => short(b.label)),
      axisLabel: { ...AXIS_LABEL, color: '#475569' },
    },
  };
}

const deliveryOption = computed<ChartOption>(() => ({
  ...base('delivery score, % of perfect'),
  xAxis: { ...(base('').xAxis as object), name: 'delivery score, % of perfect', min: 60, max: 100, scale: false },
  series: [
    {
      type: 'bar' as const,
      data: bars.value.map(b => ({
        value: b.gear.delivery === null ? null : Number((b.gear.delivery * 100).toFixed(1)),
        itemStyle: { color: colorAt(props.accountColors.get(b.key) ?? 0) },
      })),
      barMaxWidth: 16,
      label: { show: true, position: 'right', fontSize: 10, color: '#475569', formatter: '{c}%' },
      tooltip: {
        formatter: raw => {
          const i = (raw as { dataIndex: number }).dataIndex;
          const b = bars.value[i];
          const peak = b.gear.peakQph === null ? 'no leg detail' : `${b.gear.peakQph.toFixed(2)} q/hr`;
          return `<b>${esc(b.label)}</b><br/>delivery score ${esc(((b.gear.delivery ?? 0) * 100).toFixed(1))}%<br/>measured peak ${esc(peak)}`;
        },
      },
    },
    {
      // What the gear actually did, on the same scale: measured peak over the perfect set's peak.
      type: 'scatter' as const,
      // [x, category index]: a scatter on a category axis needs the row it belongs to spelled out.
      data: bars.value
        .map((b, i) => (b.gear.peakQph === null ? null : [Number(((b.gear.peakQph / PERFECT_QPH) * 100).toFixed(1)), i]))
        .filter((d): d is number[] => d !== null),
      symbol: 'rect',
      symbolSize: [3, 14],
      color: '#64748b',
      tooltip: { show: false },
    },
  ],
}));

const clothedOption = computed<ChartOption>(() => ({
  ...base('Clothed TE'),
  series: [
    {
      type: 'bar' as const,
      data: bars.value.map(b => ({
        value: b.gear.clothedTE === null ? null : Number(b.gear.clothedTE.toFixed(1)),
        itemStyle: { color: colorAt(props.accountColors.get(b.key) ?? 0) },
      })),
      barMaxWidth: 16,
      label: { show: true, position: 'right', fontSize: 10, color: '#475569' },
      tooltip: {
        formatter: raw => {
          const i = (raw as { dataIndex: number }).dataIndex;
          const b = bars.value[i];
          const cte = b.gear.clothedTE === null ? 'not computable' : b.gear.clothedTE.toFixed(1);
          return `<b>${esc(b.label)}</b><br/>Clothed TE ${esc(cte)}<br/>from ${esc(b.te)} TE`;
        },
      },
    },
  ],
}));
</script>
