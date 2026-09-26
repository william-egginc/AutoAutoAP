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

  LEG 1 IS DRAWN APART (hollow point, dashed line, days view). It is the rest of the ascension the
  player is in when the plan starts, so it shrinks one-for-one with a later start: Allan's two runs
  of one plan, 87 minutes apart, differ only in leg 1, by exactly those 87 minutes. Legs 2 onward
  are whole ascensions and compare as they are. For the same reason a run is named by its finish
  date, not its total, which is also shorter when the run is made later.
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
import { finishDateText, finishMs, localZone, whoText } from '@/lib/leaderboardRank';
import { accountKey } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{ rows: CollectorRow[]; accountColors: Map<string, number> }>();

type Metric = 'days' | 'rate';
const metric = ref<Metric>('days');
const MODES: { id: Metric; label: string; hint: string }[] = [
  {
    id: 'days',
    label: 'Days per leg',
    hint: 'How long each ascension takes. The last leg before the target is usually the biggest single block in the plan, which is what makes the last checkpoint the value worth arguing about. Leg 1 (hollow point, dashed line) is the rest of the ascension in progress when the plan starts, so it is shorter when the plan is made later; compare legs 2 onward.',
  },
  {
    id: 'rate',
    label: 'Peak delivery',
    hint: 'Peak delivery rate each leg reaches, in q/hr. It should climb leg over leg as research carries forward — that climb is the whole reason chaining beats one long ascension, and a line that has flattened is an account that would do as well with fewer.',
  },
];

/** A submission replayed from a checkpoint carries no legs; it cannot be drawn and is not faked. */
const withLegs = computed(() => props.rows.filter(r => Array.isArray(r.legs) && r.legs.length));

/** Finish dates in the viewer's timezone, as everywhere else on the page. */
const viewZone = localZone();

/** One point: [leg, value, detail]. */
type Datum = [number, number, string];

const option = computed<ChartOption>(() => {
  const series: ChartSeriesOption[] = withLegs.value.flatMap(row => {
    const name = `${whoText(row) || 'anonymous'} · finishes ${finishDateText(finishMs(row), viewZone)}`;
    const color = colorAt(props.accountColors.get(accountKey(row)) ?? 0);
    const data = row.legs.map(
      (leg, i): Datum => [
        i + 1,
        metric.value === 'days' ? leg.days : leg.peakDeliveryQph,
        `${leg.te} TE · ${leg.strategy}`,
      ]
    );
    const line = { name, type: 'line' as const, color, symbolSize: 5 };
    const solid = { width: 1.2, opacity: 0.7 };
    if (metric.value !== 'days' || data.length < 2) return [{ ...line, data, lineStyle: solid }];
    // Leg 1 on its own dashed segment with a hollow point, legs 2 onward solid: leg 1 is the rest of
    // the ascension in progress and is shorter whenever the plan is made later.
    return [
      {
        ...line,
        data: [
          { value: data[0], symbol: 'emptyCircle' },
          { value: data[1], symbol: 'none' },
        ],
        lineStyle: { ...solid, type: 'dashed' as const },
      },
      { ...line, data: data.slice(1), lineStyle: solid },
    ];
  });

  return {
    grid: { left: 52, right: 16, top: 14, bottom: 38 },
    tooltip: {
      trigger: 'item',
      formatter: raw => {
        // `value` rather than `data`: leg 1's point is an object carrying its own symbol.
        const params = raw as { value?: Datum; seriesName?: string };
        const d = params.value;
        if (!Array.isArray(d)) return '';
        const unit = metric.value === 'days' ? 'days' : 'q/hr';
        const note =
          metric.value === 'days' && d[0] === 1
            ? ' (rest of the ascension in progress; shorter when planned later)'
            : '';
        // Escaped throughout: the series name carries a submitted nickname and d[2] carries the
        // leg's strategy string, both free text, and this becomes innerHTML. See charts/tooltip.ts.
        return `<b>${esc(params.seriesName)}</b><br/>leg ${esc(d[0])}: ${esc(d[1].toFixed(3))} ${esc(unit)}${esc(note)}<br/><span style="color:#94a3b8">${esc(d[2])}</span>`;
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
