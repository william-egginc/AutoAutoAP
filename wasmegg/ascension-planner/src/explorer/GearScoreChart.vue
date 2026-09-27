<!--
  Each account's gear as two numbers: delivery score (percent of the best delivery set) and what the
  earnings set is worth in TE (Clothed TE minus TE).

  These are the two axes accounts actually differ on. Everyone who has submitted so far has every
  epic research and every colleggtible maxed, so those do not separate anyone yet; delivery gear
  and the earnings set do. Put next to each other they say whose run is slow because of delivery
  and whose is slow because of earnings.

  BOTH BARS START AT 0. A bar's length is read as the value; a delivery axis starting at 60 drew an
  80% score as half a bar. And the right panel is the earnings set alone, not Clothed TE: Clothed TE
  is TE plus the set, TE spans 75 across these accounts while the set spans about 13, so Clothed TE
  bars mostly showed who has ascended further, not whose gear is better. TE and Clothed TE are in
  the tooltip.

  One bar per account, from its most recent run: gear changes when someone upgrades, and the
  latest set is the one their next run will use.
-->
<template>
  <div class="space-y-2">
    <div v-if="bars.length" class="grid gap-3 md:grid-cols-2">
      <EChart :option="deliveryOption" :height="`${chartHeight}px`" />
      <EChart :option="earningsOption" :height="`${chartHeight}px`" />
    </div>
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">No run here recorded its artifact sets.</p>
    <p class="text-[10px] text-slate-400 leading-relaxed px-1">
      Delivery score is √(lay × hab × shipping) over the same for T4L metronome, compass and gusset plus a 3-slot fourth
      piece, all eleven sockets T4. Grey marks are the best peak as a share of {{ PERFECT_QPH }} q/hr; an arrow means it
      went past {{ PERFECT_QPH }} q/hr and is drawn at the edge. The earnings set's worth is exact when colleggtibles
      and epic research are maxed and the permit is Pro, and left out otherwise.
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
      const te = withGear.currentTE;
      // What the earnings set adds, in TE: Clothed TE is TE plus exactly this.
      const earnings = gear.clothedTE === null ? null : gear.clothedTE - te;
      return { key: a.key, label: a.label, gear, te, earnings };
    })
    .filter(b => b.gear.delivery !== null || b.gear.clothedTE !== null)
    .sort((a, b) => (b.gear.delivery ?? 0) - (a.gear.delivery ?? 0))
);

const chartHeight = computed(() => Math.max(160, bars.value.length * 26 + 50));

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

function base(title: string, max?: number): ChartOption {
  return {
    grid: { left: 120, right: 44, top: 26, bottom: 24 },
    tooltip: { trigger: 'item' },
    xAxis: {
      type: 'value',
      name: title,
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: AXIS_LABEL,
      min: 0,
      ...(max === undefined ? {} : { max }),
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
  ...base('delivery score, % of perfect', 100),
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
          const peak =
            b.gear.peakQph === null ? 'no run to 490 TE with leg detail' : `${b.gear.peakQph.toFixed(2)} q/hr`;
          return `<b>${esc(b.label)}</b><br/>delivery score ${esc(((b.gear.delivery ?? 0) * 100).toFixed(1))}%<br/>best peak on a run to 490 TE: ${esc(peak)}`;
        },
      },
    },
    {
      // What the gear actually did, on the same scale: the best measured peak over the perfect
      // set's. One past the axis is drawn at 100 as an arrow, not dropped off the edge.
      type: 'scatter' as const,
      // [x, category index]: a scatter on a category axis needs the row it belongs to spelled out.
      data: bars.value.flatMap((b, i) => {
        if (b.gear.peakQph === null) return [];
        const pct = (b.gear.peakQph / PERFECT_QPH) * 100;
        const over = pct > 100;
        return [
          {
            value: [over ? 100 : Number(pct.toFixed(1)), i],
            symbol: over ? 'triangle' : 'rect',
            symbolSize: over ? [9, 9] : [3, 14],
            symbolRotate: over ? -90 : 0,
          },
        ];
      }),
      color: '#64748b',
      z: 3,
      tooltip: {
        formatter: raw => {
          const b = bars.value[(raw as { value?: [number, number] }).value?.[1] ?? -1];
          if (b?.gear.peakQph == null) return '';
          const peak = b.gear.peakQph;
          return `<b>${esc(b.label)}</b><br/>best peak on a run to 490 TE: ${esc(peak.toFixed(2))} q/hr (${esc(((peak / PERFECT_QPH) * 100).toFixed(1))}% of ${esc(PERFECT_QPH)})`;
        },
      },
    },
  ],
}));

const earningsOption = computed<ChartOption>(() => ({
  ...base('earnings set worth, TE (Clothed TE minus TE)'),
  series: [
    {
      type: 'bar' as const,
      data: bars.value.map(b => ({
        value: b.earnings === null ? null : Number(b.earnings.toFixed(1)),
        itemStyle: { color: colorAt(props.accountColors.get(b.key) ?? 0) },
      })),
      barMaxWidth: 16,
      label: { show: true, position: 'right', fontSize: 10, color: '#475569' },
      tooltip: {
        formatter: raw => {
          const i = (raw as { dataIndex: number }).dataIndex;
          const b = bars.value[i];
          if (b.earnings === null || b.gear.clothedTE === null) {
            return `<b>${esc(b.label)}</b><br/>earnings set worth: not computable<br/>from ${esc(b.te)} TE`;
          }
          return `<b>${esc(b.label)}</b><br/>earnings set worth ${esc(b.earnings.toFixed(1))} TE<br/>${esc(b.te)} TE, Clothed TE ${esc(b.gear.clothedTE.toFixed(1))}`;
        },
      },
    },
  ],
}));
</script>
