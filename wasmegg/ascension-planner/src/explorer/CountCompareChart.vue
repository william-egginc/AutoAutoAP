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

  A POINT IS ONLY AS GOOD AS THE SEARCH THAT FOUND IT, so each marker says which kind: filled for a
  finished box at every TE, hollow for a finished box that stepped over TEs, hollow with a small
  cross inside for a staged search or a box it did not finish. Every marker keeps the account's
  shape (palette.ts `symbolAt`): past eight accounts two share a hue, and a plain cross in place of
  the shape drew their staged points identically. The higher counts have mostly been searched more
  coarsely, and a gap of a few days between two counts can be that alone; the table under the chart
  weighs each step (analysis.ts `countSteps`).

  THE AXIS IS THE COUNTS, one slot each, starting at the smallest count on the chart; a stretch of
  counts nobody here ran shares one slot labelled with its range. A line breaks over a count its
  account never ran rather than drawing a slope nobody measured (William's 8 to 15 used to be one
  straight segment across six counts). It opens on the first 20 days, where the
  counts that are close actually differ; a point above that is drawn at the top edge as an arrow,
  its real value on hover, and the line runs off the top towards it.

  A line with one count is not drawn. A single point makes no comparison and costs a legend row.
-->
<template>
  <div class="space-y-2">
    <div v-if="comparisons.length" class="flex flex-wrap items-center gap-1.5">
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
        :aria-pressed="zoom === mode.id"
        @click="zoom = mode.id"
      >
        {{ mode.label }}
      </button>
      <span v-if="zoom === 'near' && clipped" class="text-[10px] font-bold text-slate-500">
        {{ clipped }} point{{ clipped === 1 ? '' : 's' }} above {{ NEAR_DAYS }} days, drawn as ↑ at the top edge
      </span>
    </div>
    <EChart v-if="comparisons.length" :option="option" height="320px" />
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No account here has submitted two different ascension counts against this target yet, so there is nothing to
      compare. One exhaustive run covering a range of counts would answer it outright.
    </p>
    <div
      v-if="comparisons.length"
      class="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] font-bold text-slate-500"
      aria-label="How to read the lines and markers"
    >
      <span>—— one exhaustive run: every count timed from one save</span>
      <span>- - - the account's runs that still stand: the earliest finish at each count</span>
      <span><span aria-hidden="true">●</span> a finished box at every TE</span>
      <span><span aria-hidden="true">○</span> a finished box that stepped over TEs</span>
      <span><span aria-hidden="true">⊗</span> a staged search, or a box it did not finish</span>
      <span v-if="zoom === 'near'"><span aria-hidden="true">↑</span> above {{ NEAR_DAYS }} days (value on hover)</span>
    </div>

    <!-- The same lines as numbers, one row per line, with each step between neighbouring counts
         weighed against how the two sides were searched. -->
    <div v-if="comparisons.length" class="overflow-x-auto">
      <table class="w-full text-[11px]">
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <th class="text-left py-1 pr-3">Account</th>
            <th class="text-left py-1 pr-3">Finishes first</th>
            <th class="text-left py-1 pr-3">Other counts tried, days after it</th>
            <th class="text-left py-1">Each step</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="line in table" :key="line.key" class="align-top">
            <td class="py-1.5 pr-3 whitespace-nowrap">
              <span class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" :style="{ background: line.color }" />
              <b class="text-slate-700">{{ line.label }}</b>
              <div v-if="line.singleRun" class="text-[10px] text-slate-400">one exhaustive run</div>
            </td>
            <td class="py-1.5 pr-3 whitespace-nowrap">
              <b class="text-slate-700">{{ line.best.ascensions }} ascensions</b>
              <div class="text-[10px] text-slate-500">
                {{ finishDateText(line.best.finish, viewZone) }} · {{ line.best.search.text }}
              </div>
              <!-- Under Proofs only, or on a line from one run, the account's earliest finish can be a
                   run that is not on this line. -->
              <div v-if="line.best.behind >= SAME_FINISH_DAYS" class="text-[10px] text-slate-400">
                {{ daysText(line.best.behind) }} after
                {{ line.ownAnchor ? "this run's best count" : "the account's earliest finish" }}
              </div>
            </td>
            <td class="py-1.5 pr-3 whitespace-nowrap">
              <div v-for="p in line.others" :key="p.ascensions">
                <b class="text-slate-600">{{ p.ascensions }}</b
                >:
                {{ behindText(p.behind - line.best.behind) }}
                <span class="text-[10px] text-slate-400">· {{ p.search.text }}</span>
              </div>
            </td>
            <td class="py-1.5 whitespace-nowrap">
              <div v-for="s in line.steps" :key="`${s.from}-${s.to}`">
                <span class="text-slate-600">{{ s.from }}→{{ s.to }}</span>
                <span class="text-[10px] text-slate-400">
                  · {{ s.gap < SAME_FINISH_DAYS ? 'same finish' : `${s.better} first by ${daysText(s.gap)}` }} ·
                </span>
                <b :class="VERDICT[s.verdict].class">{{ VERDICT[s.verdict].text }}</b>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 px-1 text-[10px] text-slate-500 leading-relaxed max-w-3xl">
        <b class="text-emerald-700">Settled</b>: the slower count lost by more than a finer search of it has ever made
        up (nothing for a box at every TE, {{ STEP_PENALTY_DAYS.fine }} days for every 2nd or 3rd TE,
        {{ STEP_PENALTY_DAYS.coarse }} days for every 4th or 5th; never for anything coarser, which has not been
        measured, or for a staged search, whose shortfall is unknown). <b class="text-sky-700">Direction holds</b>: not
        settled, but the count that won was searched at least as coarsely as the other at every checkpoint, counting
        back from the last, and more coarsely at one or more, so a finer search would more likely widen the gap than
        close it. <b class="text-slate-500">Within search noise</b>: the gap could be how the two were searched rather
        than the count. All three are about the searches only; each side is still limited to the box of TEs it tried.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import { finishDateText, localZone, signedDays } from '@/lib/leaderboardRank';
import {
  countSteps,
  SAME_FINISH_DAYS,
  STEP_PENALTY_DAYS,
  type CountComparison,
  type CountComparisonPoint,
  type SearchGrade,
  type StepVerdict,
} from './analysis';
import { colorAt, symbolAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{ comparisons: CountComparison[]; accountColors: Map<string, number> }>();

/**
 * The first few weeks, or the whole range. Two ascensions can finish months after the best and five,
 * six and seven within days of each other; on one axis the second question is a flat line on 0, and
 * it is the question most readers came with.
 */
type Zoom = 'near' | 'all';
const zoom = ref<Zoom>('near');
const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'near', label: 'First 20 days' },
  { id: 'all', label: 'Whole range' },
];
const NEAR_DAYS = 20;

/** Finish dates in the viewer's timezone, as everywhere else on the page. */
const viewZone = localZone();

const VERDICT: Record<StepVerdict, { text: string; class: string }> = {
  settled: { text: 'settled', class: 'text-emerald-700' },
  direction: { text: 'direction holds', class: 'text-sky-700' },
  noise: { text: 'within search noise', class: 'text-slate-400' },
};

function daysText(days: number): string {
  return signedDays(days).replace(/^[+−]/, '');
}

function behindText(behind: number): string {
  return behind < SAME_FINISH_DAYS ? 'same finish' : signedDays(behind);
}

/** A filled cross: ECharts has no built-in one, and a path symbol is filled, not stroked. */
const CROSS = 'path://M2,0 L5,3 L8,0 L10,2 L7,5 L10,8 L8,10 L5,7 L2,10 L0,8 L3,5 L0,2 Z';

/** Marker sizes: a staged point is drawn a little larger, to leave room for its cross. */
const MARKER_PX = 8;
const STAGED_PX = 11;
const CROSS_PX = 5;

/** The marker for a point, always in the account's shape: filled for every TE, hollow otherwise (a
 *  staged point also gets a cross inside it, on a series of its own). */
function markerOf(search: SearchGrade, shape: string): string {
  return search.kind === 'every-te' ? shape : `empty${shape[0].toUpperCase()}${shape.slice(1)}`;
}

/**
 * What a point's height means, in words: after the account's earliest finish (dated, so it is clear
 * which run that is), or, on a line whose run no longer stands, after that run's own best count.
 */
function finishLine(comparison: CountComparison, p: CountComparisonPoint): string {
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

/**
 * The axis: every whole count from the smallest on the chart to the largest, one slot each, except
 * that a stretch of two or more counts nobody here ran is one slot labelled with its range ("9–14").
 * William's single 15-ascension run otherwise gave six empty slots half the width, squeezing 2 to 8,
 * where every other line lives. The slot is still there, so a line still breaks across it.
 */
const slots = computed(() => {
  const present = new Set(props.comparisons.flatMap(c => c.points.map(p => p.ascensions)));
  if (!present.size) return { labels: [] as string[], at: new Map<number, number>() };
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const labels: string[] = [];
  const at = new Map<number, number>();
  for (let c = lo; c <= hi; c++) {
    if (present.has(c)) {
      at.set(c, labels.length);
      labels.push(String(c));
      continue;
    }
    let end = c;
    while (end + 1 <= hi && !present.has(end + 1)) end++;
    labels.push(end > c ? `${c}–${end}` : String(c));
    c = end;
  }
  return { labels, at };
});

/** Points above the top edge in the near view. */
const clipped = computed(() =>
  props.comparisons.reduce((n, c) => n + c.points.filter(p => p.behind > NEAR_DAYS).length, 0)
);

/** What the tooltip reads off a point. */
interface Tip {
  ascensions: number;
  finish: string;
  detail: string;
  search: string;
  note: string;
  above: boolean;
}

type Item = { value: number; symbol: string; symbolSize: number; tip: Tip } | '-';

/** Arrows sharing a slot sit side by side so each can be hovered: this far apart, and all of them
 *  within this width, which still fits a slot on a phone. */
const ARROW_STEP_PX = 7;
const ARROW_SPREAD_PX = 28;

const option = computed<ChartOption>(() => {
  const near = zoom.value === 'near';
  const { labels, at } = slots.value;
  const series: ChartSeriesOption[] = [];
  // How many clamped points each slot holds, to centre the arrows on it.
  const aboveIn = new Map<number, number>();
  if (near) {
    for (const c of props.comparisons) {
      for (const p of c.points) {
        if (p.behind > NEAR_DAYS) aboveIn.set(p.ascensions, (aboveIn.get(p.ascensions) ?? 0) + 1);
      }
    }
  }
  const placed = new Map<number, number>();
  props.comparisons.forEach((comparison, i) => {
    const index = props.accountColors.get(comparison.accountKey) ?? i;
    const color = colorAt(index);
    const shape = symbolAt(index);
    const tipOf = (p: CountComparisonPoint): Tip => ({
      ascensions: p.ascensions,
      finish: finishLine(comparison, p),
      detail: `${p.chain.join(' ')} · from ${p.currentTE} TE · plan length ${p.days.toFixed(2)} d from its start`,
      search: `searched: ${p.search.text} · ${p.priced.toLocaleString('en-US')} plans priced`,
      note:
        comparison.anchor === 'run'
          ? `This run no longer stands (${comparison.note}), so it is measured from its own best count, not the account's earliest finish.`
          : '',
      above: near && p.behind > NEAR_DAYS,
    });
    // One slot per count on the axis. A count the account never ran is empty, which breaks the line
    // there (`connectNulls` off) instead of joining the counts either side of it.
    const data: Item[] = labels.map((_, slot) => {
      const p = comparison.points.find(q => at.get(q.ascensions) === slot);
      if (!p) return '-';
      const above = near && p.behind > NEAR_DAYS;
      // Off the top: no marker on the line itself (it is clipped), the arrow below stands for it.
      const size = p.search.kind === 'staged' ? STAGED_PX : MARKER_PX;
      return { value: p.behind, symbol: above ? 'none' : markerOf(p.search, shape), symbolSize: size, tip: tipOf(p) };
    });
    series.push({
      name: comparison.label,
      type: 'line' as const,
      data: data as never,
      color,
      symbol: shape,
      symbolSize: 8,
      connectNulls: false,
      clip: true,
      lineStyle: { width: 2, type: comparison.singleRun ? 'solid' : 'dashed' },
      emphasis: { focus: 'series' as const },
    });
    // The cross inside each staged point, over the account's own hollow shape. Same name as the
    // line, so the legend toggles both together.
    const staged = comparison.points.filter(p => p.search.kind === 'staged' && !(near && p.behind > NEAR_DAYS));
    if (staged.length) {
      series.push({
        name: comparison.label,
        type: 'scatter' as const,
        data: staged.map(p => ({ value: [at.get(p.ascensions)!, p.behind], tip: tipOf(p) })) as never,
        color,
        symbol: CROSS,
        symbolSize: CROSS_PX,
        z: 4,
      });
    }
    if (near) {
      const above = comparison.points.filter(p => p.behind > NEAR_DAYS);
      if (above.length) {
        // Same name as the line, so the legend toggles both together.
        series.push({
          name: comparison.label,
          type: 'scatter' as const,
          data: above.map(p => {
            const k = placed.get(p.ascensions) ?? 0;
            placed.set(p.ascensions, k + 1);
            const n = aboveIn.get(p.ascensions) ?? 1;
            const step = n > 1 ? Math.min(ARROW_STEP_PX, ARROW_SPREAD_PX / (n - 1)) : 0;
            const offset = (k - (n - 1) / 2) * step;
            return { value: [at.get(p.ascensions)!, NEAR_DAYS], symbolOffset: [offset, -3], tip: tipOf(p) };
          }) as never,
          color,
          symbol: 'arrow',
          symbolSize: [8, 11],
          clip: false,
          z: 4,
        });
      }
    }
  });

  return {
    // Room for the legend under the axis. Four account names on one line is exactly the width
    // where echarts stops wrapping and starts overlapping them, so the legend gets its own band
    // and long labels are cut rather than allowed to collide.
    grid: { left: 60, right: 16, top: 18, bottom: 70 },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemGap: 18,
      textStyle: { fontSize: 10, color: '#64748b' },
      formatter: (name: string) => (name.length > 30 ? `${name.slice(0, 29)}…` : name),
    },
    tooltip: {
      trigger: 'item',
      // Kept inside the chart and wrapped, so it fits a phone.
      confine: true,
      extraCssText: 'max-width: min(320px, 86vw); white-space: normal;',
      formatter: raw => {
        const params = raw as { data?: { tip?: Tip }; seriesName?: string };
        const tip = params.data?.tip;
        if (!tip) return '';
        // Escaped throughout: the series name is `accountLabel()`, which is built from submitted
        // nicknames, and this string becomes innerHTML. See lib/charts/tooltip.ts.
        const note = tip.note ? `<br/><span style="color:#b45309">${esc(tip.note)}</span>` : '';
        const above = tip.above
          ? `<br/><span style="color:#64748b">Above the chart; drawn at the top edge.</span>`
          : '';
        return `<b>${esc(params.seriesName)}</b><br/>${esc(tip.ascensions)} ascensions: ${esc(tip.finish)}<br/><span style="color:#94a3b8">${esc(tip.detail)}<br/>${esc(tip.search)}</span>${above}${note}`;
      },
    },
    xAxis: {
      type: 'category',
      name: 'ascensions',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      data: labels,
      // Every slot labelled, phone included: a hidden "9–14" would read as a count nobody skipped.
      axisLabel: { ...AXIS_LABEL, interval: 0 },
      axisTick: { alignWithLabel: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'days after earliest finish',
      nameTextStyle: AXIS_LABEL,
      min: 0,
      max: near ? NEAR_DAYS : undefined,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});

/** The table: each line's earliest finish, the other counts it tried, and each step weighed. */
const table = computed(() =>
  props.comparisons.map((comparison, i) => {
    const sorted = [...comparison.points].sort((a, b) => a.ascensions - b.ascensions);
    const best = sorted.reduce((a, b) => (b.behind < a.behind ? b : a));
    return {
      key: comparison.key,
      label: comparison.label.replace(/ \(one exhaustive run\)$/, ''),
      singleRun: comparison.singleRun,
      color: colorAt(props.accountColors.get(comparison.accountKey) ?? i),
      best,
      others: sorted.filter(p => p !== best),
      ownAnchor: comparison.anchor === 'run',
      steps: countSteps(sorted),
    };
  })
);
</script>
