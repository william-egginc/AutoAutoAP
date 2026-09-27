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

  BOTH ARE ON A LOG SCALE. At 5 ascensions the last leg is 390-512 days and legs 2-4 are 37-171; on
  a linear axis the last leg flattens everything before it into one smear. On a log axis equal
  steps are equal ratios, so a leg that takes twice as long on one account looks the same wherever
  it falls in the chain.

  Runs are coloured by account, so a fan of one colour is one person's several attempts and a fan
  of several is a shape that repeats across accounts. The legend (HTML, so it wraps rather than
  paging accounts out of sight on a phone: legend.ts) has one entry per account, so turning one off
  takes all of that account's runs at once; past eight accounts the hues repeat and the marker shape
  changes (`symbolAt`).

  LEG 1 IS DRAWN APART (hollow point, dashed line), in both views. It is the rest of the ascension
  the player is in when the plan starts, so it shrinks one-for-one with a later start: Allan's two
  runs of one plan, 87 minutes apart, differ only in leg 1, by exactly those 87 minutes. Its peak
  moves with the start too: Allan's leg 1 peaks at 5.95 q/hr when the plan starts on a fresh
  ascension and 3.86 when it starts near the end of one. Legs 2 onward are whole ascensions and
  compare as they are. For the same reason a run is named by its finish date, not its total, which
  is also shorter when the run is made later.
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

    <EChart v-if="withLegs.length" :option="option" height="310px" />
    <!-- In HTML so every account is on screen at any width (legend.ts); each hides all its runs. -->
    <ChartLegend
      v-if="withLegs.length"
      v-model:hidden="hidden"
      :entries="legendEntries"
      label="Accounts: click to hide or show"
    />
    <p class="text-[10px] text-slate-400 leading-relaxed px-1">{{ MODES.find(m => m.id === metric)?.hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ChartLegend from './ChartLegend.vue';
import type { LegendEntry } from './legend';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { CollectorRow } from './collector';
import { finishDateText, finishMs, localZone, whoText } from '@/lib/leaderboardRank';
import { accountKey, groupByAccount } from './analysis';
import { colorAt, symbolAt, AXIS_LABEL, SPLIT_LINE, TOOLTIP_FIT } from './palette';

const props = defineProps<{
  rows: CollectorRow[];
  accountColors: Map<string, number>;
  /** The page's name per account key. Without it each account is named from its own runs here. */
  accountLabels?: Map<string, string>;
}>();

type Metric = 'days' | 'rate';
const metric = ref<Metric>('days');
const MODES: { id: Metric; label: string; hint: string }[] = [
  {
    id: 'days',
    label: 'Days per leg',
    hint: 'How long each ascension takes, on a log scale so the short legs are not flattened by the long ones: each labelled gridline is ten times the one below. The last leg before the target is usually the biggest single block in the plan, which is what makes the last checkpoint the value worth arguing about. Leg 1 (hollow point, dashed line) is the rest of the ascension in progress when the plan starts, so it is shorter when the plan is made later; compare legs 2 onward.',
  },
  {
    id: 'rate',
    label: 'Peak delivery',
    hint: 'Peak delivery rate each leg reaches, in q/hr, on a log scale so equal steps are equal gains in percent. It should climb leg over leg as research carries forward — that climb is the whole reason chaining beats one long ascension, and a line that has flattened is an account that would do as well with fewer. Leg 1 (hollow point, dashed line) depends on how far into the ascension in progress the plan starts; compare legs 2 onward.',
  },
];

/** A submission replayed from a checkpoint carries no legs; it cannot be drawn and is not faked. */
const withLegs = computed(() => props.rows.filter(r => Array.isArray(r.legs) && r.legs.length));

/** Finish dates in the viewer's timezone, as everywhere else on the page. */
const viewZone = localZone();

/** Account key -> the name its legend entry and tooltips use. */
const labels = computed(() => {
  const own = new Map(groupByAccount(withLegs.value).map(a => [a.key, a.label]));
  return (key: string, row: CollectorRow) =>
    props.accountLabels?.get(key) ?? own.get(key) ?? (whoText(row) || 'anonymous');
});

/** ECharts draws any symbol hollow when its name is prefixed with `empty`. */
const hollow = (symbol: string) => `empty${symbol[0].toUpperCase()}${symbol.slice(1)}`;

/** One point: [leg, value, leg detail, run heading]. */
type Datum = [number, number, string, string];

/** Accounts the legend has turned off, by key. */
const hidden = ref<ReadonlySet<string>>(new Set());

/** One entry per account, in the order of its colour, with its own marker shape. */
const legendEntries = computed<LegendEntry[]>(() => {
  const seen = new Map<string, LegendEntry>();
  for (const row of withLegs.value) {
    const key = accountKey(row);
    if (seen.has(key)) continue;
    const index = props.accountColors.get(key) ?? 0;
    seen.set(key, { id: key, label: labels.value(key, row), index, line: 'solid' });
  }
  return [...seen.values()].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
});

const option = computed<ChartOption>(() => {
  const days = metric.value === 'days';
  let lowest = Infinity;

  const series: ChartSeriesOption[] = withLegs.value.flatMap((row): ChartSeriesOption[] => {
    const key = accountKey(row);
    if (hidden.value.has(key)) return [];
    const index = props.accountColors.get(key) ?? 0;
    const label = labels.value(key, row);
    const symbol = symbolAt(index);
    // Named by account, so the legend has one entry per account and toggles all of its runs; the
    // run itself is told apart by its finish date, which is in every tooltip.
    const heading = `${label} · finishes ${finishDateText(finishMs(row), viewZone)}`;
    const data = row.legs.map((leg, i): Datum => {
      const value = days ? leg.days : leg.peakDeliveryQph;
      if (value > 0 && value < lowest) lowest = value;
      return [i + 1, value, `${leg.te} TE · ${leg.strategy}`, heading];
    });
    const line = {
      name: label,
      type: 'line' as const,
      color: colorAt(index),
      symbol,
      symbolSize: 6,
      emphasis: { focus: 'series' as const },
    };
    const solid = { width: 1.2, opacity: 0.75 };
    if (data.length < 2) return [{ ...line, data, symbol: hollow(symbol), lineStyle: solid }];
    // Leg 1 on its own dashed segment with a hollow point, legs 2 onward solid: leg 1 is the rest of
    // the ascension in progress, in days and in peak rate alike.
    return [
      {
        ...line,
        data: [
          { value: data[0], symbol: hollow(symbol) },
          { value: data[1], symbol: 'none' },
        ],
        lineStyle: { ...solid, type: 'dashed' as const },
      },
      { ...line, data: data.slice(1), lineStyle: solid },
    ];
  });

  return {
    grid: { left: 52, right: 16, top: 14, bottom: 40 },
    tooltip: {
      trigger: 'item',
      ...TOOLTIP_FIT,
      formatter: raw => {
        // `value` rather than `data`: leg 1's point is an object carrying its own symbol.
        const params = raw as { value?: Datum };
        const d = params.value;
        if (!Array.isArray(d)) return '';
        const value = days ? `${d[1].toFixed(1)} days` : `${d[1].toFixed(2)} q/hr`;
        const note =
          d[0] !== 1
            ? ''
            : days
              ? ' (rest of the ascension in progress; shorter when planned later)'
              : ' (depends on how far into the ascension in progress the plan starts)';
        // Escaped throughout: the heading carries a submitted nickname and d[2] carries the leg's
        // strategy string, both free text, and this becomes innerHTML. See charts/tooltip.ts.
        return `<b>${esc(d[3])}</b><br/>leg ${esc(d[0])}: ${esc(value)}${esc(note)}<br/><span style="color:#94a3b8">${esc(d[2])}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'leg',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      // Legs are counted from 1; a 0 on the axis is a leg nobody ran.
      min: 1,
      max: 'dataMax',
      interval: 1,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'log',
      logBase: 10,
      name: days ? 'days (log scale)' : 'q/hr (log scale)',
      nameTextStyle: AXIS_LABEL,
      // From 1 day, or from a tenth of one when a leg 1 was shorter than a day, so no point is cut
      // off below the axis. Peak rates sit between 1 and 12 q/hr.
      min: days ? (lowest < 1 ? 0.1 : 1) : 1,
      max: days ? undefined : 20,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
      minorTick: { show: true },
    },
    series,
  };
});
</script>
