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
  comparison is controlled and the slope is real; each point is that run's finish date at that
  count. A DASHED line is several runs from one account made on different days. Their TOTALS DO NOT
  COMPARE: a total counts from its own run's start, so the same plan run a day later is a day
  shorter. Each dashed point is that count's earliest FINISH DATE among the account's runs whose
  finish still stands (not a what-if, an old save, a replaced or a fallen-behind plan; analysis.ts
  `judgeFinishes`). An account with a solid line gets a dashed one as well when it has two or more
  counts, so counts the exhaustive run did not cover still show.

  BOTH LINES COUNT FROM ONE ANCHOR, the account's earliest finish: its earliest standing finish, or
  the exhaustive run's own best if that is earlier (analysis.ts `compareCounts`). So a line touches
  0 only at the count that holds it, and the tooltip says "the account's earliest finish" only
  there. The one exception is a solid line whose run no longer stands (a what-if, an old save): its
  finishes do not compare with the account's, so it counts from its own best count, and its
  tooltip says that and why.

  A line with one count is not drawn. A single point makes no comparison and costs a legend row.
-->
<template>
  <div class="space-y-2">
    <div v-if="comparisons.length" class="flex gap-1.5">
      <button
        v-for="mode in ZOOMS"
        :key="mode.id"
        type="button"
        class="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
        :class="
          zoom === mode.id
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
        "
        @click="zoom = mode.id"
      >
        {{ mode.label }}
      </button>
    </div>
    <EChart v-if="comparisons.length" :option="option" height="300px" />
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No account here has submitted two different ascension counts against this target yet, so there is nothing to
      compare. One exhaustive run covering a range of counts would answer it outright.
    </p>
    <div v-if="comparisons.length" class="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] font-bold text-slate-400">
      <span>—— one exhaustive run: every count timed from one save</span>
      <span>- - - the account's runs that still stand: the earliest finish at each count</span>
      <span>both in days after the account's earliest finish</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import { finishDateText, localZone, signedDays } from '@/lib/leaderboardRank';
import type { CountComparison } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{ comparisons: CountComparison[]; accountColors: Map<string, number> }>();

/**
 * Whole range, or the first few weeks. Two ascensions can finish months after the best and five,
 * six and seven within days of each other; on one axis the second question is a flat line on 0.
 */
type Zoom = 'all' | 'near';
const zoom = ref<Zoom>('all');
const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'all', label: 'Whole range' },
  { id: 'near', label: 'First 20 days' },
];

/** Finish dates in the viewer's timezone, as everywhere else on the page. */
const viewZone = localZone();

/** One point: [ascensions, days after the anchor, finish line, detail line, note line]. */
type Datum = [number, number, string, string, string];

/** Under a minute from the anchor is the anchor: `+0.00 d` would read as a measured gap. */
const SAME_FINISH_DAYS = 1 / 1440;

/**
 * What a point's height means, in words: after the account's earliest finish (dated, so it is clear
 * which run that is), or, on a line whose run no longer stands, after that run's own best count.
 */
function finishLine(comparison: CountComparison, p: CountComparison['points'][number]): string {
  const own = comparison.anchor === 'run';
  const anchor = own ? "this run's best count" : "the account's earliest finish";
  const gap =
    p.behind < SAME_FINISH_DAYS
      ? anchor
      : own
        ? `${signedDays(p.behind)} after ${anchor}`
        : `${signedDays(p.behind)} after ${anchor} (${finishDateText(comparison.anchorFinish, viewZone)})`;
  return `finishes ${finishDateText(p.finish, viewZone)} · ${gap}`;
}

const option = computed<ChartOption>(() => {
  const series: ChartSeriesOption[] = props.comparisons.map((comparison, i) => ({
    name: comparison.label,
    type: 'line' as const,
    data: comparison.points.map(
      (p): Datum => [
        p.ascensions,
        p.behind,
        finishLine(comparison, p),
        `${p.chain.join(' ')} · from ${p.currentTE} TE · plan length ${p.days.toFixed(2)} d from its start`,
        comparison.anchor === 'run'
          ? `This run no longer stands (${comparison.note}), so it is measured from its own best count, not the account's earliest finish.`
          : '',
      ]
    ),
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
        const params = raw as { data?: Datum; seriesName?: string };
        if (!params.data) return '';
        // Escaped throughout: the series name is `accountLabel()`, which is built from submitted
        // nicknames, and this string becomes innerHTML. See lib/charts/tooltip.ts.
        const note = params.data[4] ? `<br/><span style="color:#b45309">${esc(params.data[4])}</span>` : '';
        return `<b>${esc(params.seriesName)}</b><br/>${esc(params.data[0])} ascensions: ${esc(params.data[2])}<br/><span style="color:#94a3b8">${esc(params.data[3])}</span>${note}`;
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
      name: 'days after earliest finish',
      nameTextStyle: AXIS_LABEL,
      min: 0,
      max: zoom.value === 'near' ? 20 : undefined,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
