<!--
  The final leg as a data check: did the run reach the delivery rate its own gear should?

  x is the last checkpoint before 490, y is the final leg's measured peak delivery over the peak
  this run's delivery set should reach from that checkpoint (`checkFinalLegRate`), in percent. It
  is the same test `flagOf` uses to flag a run, drawn: a run below the dashed line is flagged.

  WHY NOT DAYS x PEAK ANY MORE. That chart plotted final-leg days times peak rate against X and
  every account landed on one line. But days x peak is just the eggs still to ship to 490, which is
  the same for everybody by construction: the line was built in, not found, and the runs hit by the
  delivery-set bug sat on it too (-0.2% and -1.3%), because a slow farm takes longer by exactly as
  much as it is slow. The share of the expected rate separates them: clean runs sit at 88-100%, the
  bug runs at 34% and 69%.

  WHAT IT IS NOT. The ramp and the 12 q/hr perfect peak were fitted on these same runs, so clean
  runs sit near 100% by design; this checks the data, it does not discover anything about the
  game. The model also reads 6-11% high on three low-TE accounts (see virtueScore), and there are
  only two bug examples so far.

  A run the check cannot judge (no delivery set, no legs, a last checkpoint below the ramp's 190
  TE) is not drawn, and the note under the chart counts them, so a missing point is never silent.
-->
<template>
  <div class="space-y-2">
    <EChart v-if="points.length" :option="option" height="300px" />
    <!-- In HTML so every account is on screen at any width (legend.ts); each hides its runs. -->
    <ChartLegend
      v-if="points.length"
      v-model:hidden="hidden"
      :entries="legendEntries"
      label="Accounts: click to hide or show"
    />
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No run to 490 TE here carries both per-leg detail and a delivery set yet.
    </p>
    <p v-if="unchecked.total" class="text-[10px] font-semibold text-slate-500 px-1">
      {{ unchecked.total }} run{{ unchecked.total === 1 ? '' : 's' }} to 490 TE
      {{ unchecked.total === 1 ? 'is' : 'are' }} not drawn because the check cannot judge
      {{ unchecked.total === 1 ? 'it' : 'them' }}: {{ unchecked.text }}.
    </p>
    <!-- The section around this says what the check is for and that it was fitted on these runs;
         this says only how "expected" is worked out and what the hollow marker means. -->
    <p class="text-[10px] text-slate-400 leading-relaxed px-1">
      Expected peak = the run's delivery score × {{ PERFECT_QPH }} q/hr × how much of that rate a farm has reached by
      its last checkpoint ({{ rampAt(190) }}% at 190 TE, all of it from 280). A hollow marker is a flagged run.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import {
  PERFECT_QPH,
  SUSPECT_RATE_SHARE,
  checkFinalLegRate,
  deliveryScore,
  rampShare,
  slotsFromLabels,
} from '@/search/virtueScore';
import type { CollectorRow } from './collector';
import { accountKey, groupByAccount } from './analysis';
import { colorAt, symbolAt, AXIS_LABEL, SPLIT_LINE, TOOLTIP_FIT } from './palette';
import ChartLegend from './ChartLegend.vue';
import type { LegendEntry } from './legend';

const props = defineProps<{
  rows: CollectorRow[];
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

const rampAt = (te: number) => Math.round((rampShare(te) ?? 0) * 100);

interface Point {
  key: string;
  x: number;
  /** Measured over expected peak, in percent. */
  pct: number;
  measured: number;
  expected: number;
  suspect: boolean;
  chain: string;
}

const toTarget = computed(() => props.rows.filter(r => r.finalTE === 490));

const points = computed<Point[]>(() =>
  toTarget.value.flatMap(r => {
    const rate = checkFinalLegRate(r.chain, r.legs, r.delivery);
    if (!rate) return [];
    return [
      {
        key: accountKey(r),
        x: r.chain[r.chain.length - 2],
        pct: rate.share * 100,
        measured: rate.measuredQph,
        expected: rate.expectedQph,
        suspect: rate.suspect,
        chain: r.chain.join(' '),
      },
    ];
  })
);

/** Runs to 490 the check has to pass over, by the first reason it cannot judge them. */
const unchecked = computed(() => {
  let noLegs = 0;
  let noSet = 0;
  let belowRamp = 0;
  let other = 0;
  for (const r of toTarget.value) {
    if (checkFinalLegRate(r.chain, r.legs, r.delivery)) continue;
    // In `rateCheckOf`'s order, so this note and the runs table give a run the same reason.
    if (!deliveryScore(slotsFromLabels(r.delivery))) noSet++;
    else if (!r.legs?.length) noLegs++;
    else if (!(r.legs[r.legs.length - 1].peakDeliveryQph > 0)) other++;
    else if (r.chain.length < 2 || rampShare(r.chain[r.chain.length - 2]) === null) belowRamp++;
    else other++;
  }
  const parts = [
    noSet && `${noSet} with no delivery set recorded`,
    noLegs && `${noLegs} without per-leg detail`,
    belowRamp && `${belowRamp} with a last checkpoint under 190 TE, below where the expected rate was measured`,
    other && `${other} with no peak rate or checkpoint to check`,
  ].filter(Boolean);
  return { total: noLegs + noSet + belowRamp + other, text: parts.join(', ') };
});

/** Account key -> legend name, falling back to a name from the account's own runs here. */
const labelOf = computed(() => {
  const own = new Map(groupByAccount(toTarget.value).map(a => [a.key, a.label]));
  return (key: string) => props.accountLabels.get(key) ?? own.get(key) ?? key;
});

/** ECharts draws any symbol hollow when its name is prefixed with `empty`. */
const hollow = (symbol: string) => `empty${symbol[0].toUpperCase()}${symbol.slice(1)}`;

/** One point: [last checkpoint, % of expected, measured q/hr, expected q/hr, chain, 1 if flagged]. */
type Datum = [number, number, number, number, string, number];

/** The accounts with a point, in colour order, each with its points. */
const accounts = computed(() => {
  const byAccount = new Map<string, Point[]>();
  for (const p of points.value) {
    const list = byAccount.get(p.key);
    if (list) list.push(p);
    else byAccount.set(p.key, [p]);
  }
  return [...byAccount.entries()]
    .map(([key, list], i) => ({ key, list, index: props.accountColors.get(key) ?? i }))
    .sort((a, b) => a.index - b.index);
});

/** Accounts the legend has turned off, by key. */
const hidden = ref<ReadonlySet<string>>(new Set());

const legendEntries = computed<LegendEntry[]>(() =>
  accounts.value.map(({ key, index }) => ({ id: key, label: labelOf.value(key), index, size: 9 }))
);

const option = computed<ChartOption>(() => {
  const shown = accounts.value.filter(a => !hidden.value.has(a.key));
  const series: ChartSeriesOption[] = shown.map(({ key, list, index }) => {
    const symbol = symbolAt(index);
    return {
      name: labelOf.value(key),
      type: 'scatter' as const,
      data: list.map(p => ({
        value: [p.x, p.pct, p.measured, p.expected, p.chain, p.suspect ? 1 : 0] as Datum,
        // Flagged runs hollow, so they read as flagged even where the account's colour is a guess.
        symbol: p.suspect ? hollow(symbol) : symbol,
      })),
      color: colorAt(index),
      symbol,
      symbolSize: 9,
      emphasis: { focus: 'series' as const },
    };
  });
  const threshold = SUSPECT_RATE_SHARE * 100;
  // The flag line on a series of its own, so it stays whichever accounts the legend hides.
  series.push({
    name: 'flag line',
    type: 'scatter' as const,
    data: [],
    markLine: {
      silent: true,
      symbol: 'none',
      data: [
        {
          yAxis: threshold,
          lineStyle: { color: '#64748b', type: 'dashed', width: 1 },
          label: {
            formatter: 'below this the run is flagged',
            position: 'insideStartBottom',
            color: '#64748b',
            fontSize: 10,
          },
        },
        {
          yAxis: 100,
          lineStyle: { color: '#cbd5e1', type: 'solid', width: 1 },
          label: { formatter: 'as expected', position: 'insideStartTop', color: '#94a3b8', fontSize: 10 },
        },
      ],
    },
  });

  return {
    grid: { left: 52, right: 16, top: 14, bottom: 40 },
    tooltip: {
      trigger: 'item',
      ...TOOLTIP_FIT,
      formatter: raw => {
        // `value` rather than `data`: each point is an object carrying its own symbol.
        const params = raw as { value?: Datum; seriesName?: string };
        const d = params.value;
        if (!Array.isArray(d) || d.length < 6) return '';
        const [x, pct, measured, expected, chain, suspect] = d;
        const verdict = suspect ? '<br/><b>Flagged</b>: looks like the delivery-set-for-earnings bug' : '';
        return `<b>${esc(params.seriesName)}</b><br/>last checkpoint ${esc(x)}: final leg peaks at ${esc(measured.toFixed(2))} q/hr<br/>this delivery set should reach about ${esc(expected.toFixed(2))} q/hr from there: ${esc(pct.toFixed(1))}%${verdict}<br/><span style="color:#94a3b8">${esc(chain)}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'last checkpoint before 490 (TE)',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: 'final-leg peak, % of expected',
      nameTextStyle: AXIS_LABEL,
      // 30-110% holds every run so far; a run outside it widens the axis rather than vanishing.
      min: (v: { min: number }) => Math.min(30, Math.floor(v.min / 10) * 10),
      max: (v: { max: number }) => Math.max(110, Math.ceil(v.max / 10) * 10),
      interval: 10,
      axisLabel: { ...AXIS_LABEL, formatter: '{value}%' },
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
