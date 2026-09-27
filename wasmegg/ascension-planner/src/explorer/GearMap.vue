<!--
  Where the board's accounts sit on TE and Clothed TE, and where it has no data. One mark per account,
  from the newest run that recorded its gear (the same run the gear bars use), named beside it.

  WHAT IT IS FOR. Every account adds +115 to +129 with its earnings set, so the marks sit on one narrow
  diagonal between the dashed guides: more TE always comes with more CTE, and nothing here separates
  what the gear decides from what the TE decides. The empty space is the finding. The shaded boxes are
  the open data needs (needs.ts) whose test is a box on these two axes, each one still wanting more
  accounts (it may already hold some: "1 of 2"); the other gear needs are listed beside the chart
  with where they would sit.

  THE STALL BAND is drawn as a line series filled down to 218 (`areaStyle.origin`), and the need boxes
  the same way: MarkArea is not registered in lib/charts/echarts.ts, and neither is the LabelLayout
  feature, so the names are placed by gearMap.ts `placeLabels` instead of ECharts' overlap handling.

  Fill is the delivery score on one blue ramp, lighter is weaker (the key under the chart). A hollow
  mark is a Clothed TE worked out afterwards rather than recorded by the planner (gearMap.ts
  `cteSource`).
-->
<template>
  <div class="space-y-2">
    <div v-if="points.length" class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div class="space-y-1.5 min-w-0">
        <div ref="chartBox">
          <EChart :option="option" :height="`${CHART_HEIGHT}px`" />
        </div>
        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] font-bold text-slate-500"
          aria-label="How to read the marks"
        >
          <span class="inline-flex items-center gap-1.5">
            <span>delivery score</span>
            <span class="inline-flex flex-col">
              <span class="block h-2 w-32 rounded-sm" :style="{ background: rampGradient }" />
              <span class="flex justify-between text-[9px] font-semibold text-slate-400 tabular-nums">
                <span>≤{{ Math.round(DELIVERY_RAMP_DOMAIN[0] * 100) }}%</span>
                <span>{{ Math.round(((DELIVERY_RAMP_DOMAIN[0] + DELIVERY_RAMP_DOMAIN[1]) / 2) * 100) }}%</span>
                <span>{{ Math.round(DELIVERY_RAMP_DOMAIN[1] * 100) }}%</span>
              </span>
            </span>
          </span>
          <span><span aria-hidden="true" class="text-[#2a78d6]">●</span> Clothed TE recorded by the planner</span>
          <span
            ><span aria-hidden="true" class="text-[#2a78d6]">○</span> worked out afterwards (assumes a Pro permit)</span
          >
          <span><span aria-hidden="true" class="text-slate-400">- - -</span> CTE = TE + 100, 115, 129</span>
          <span class="inline-flex items-center gap-1">
            <span aria-hidden="true" class="inline-block h-2.5 w-4 rounded-sm" :style="{ background: STALL_FILL }" />
            first ascension stalls
          </span>
          <span v-if="regions.length" class="inline-flex items-center gap-1">
            <span aria-hidden="true" class="inline-block h-2.5 w-4 rounded-sm" :style="{ background: NEED_FILL_KEY }" />
            still wanted (open ask)
          </span>
        </div>

        <p v-if="summary" class="text-[11px] text-slate-600 leading-relaxed max-w-3xl px-1">
          Every account's earnings set adds between +{{ summary.setMin.toFixed(1) }} and +{{
            summary.setMax.toFixed(1)
          }}
          TE, so all {{ summary.accounts }} sit on one narrow diagonal: an account with more TE also has more Clothed
          TE, and these runs cannot yet say whether a plan follows the gear or the TE. And
          <template v-if="summary.atOrUnderStall === 0">
            no account is at or under the stall band (the lowest is at CTE {{ Math.round(summary.cteMin) }}), so nothing
            here shows how plans behave where a first ascension starts to stall.
          </template>
          <template v-else>
            only {{ summary.atOrUnderStall }} account{{ summary.atOrUnderStall === 1 ? ' is' : 's are' }} at or under
            the stall band.
          </template>
        </p>

        <p v-if="missing.length" class="text-[10px] text-slate-400 px-1">
          Not drawn:
          <template v-for="(m, i) in missing" :key="m.key">{{ i ? '; ' : '' }}{{ m.label }} ({{ m.reason }})</template>.
        </p>

        <details v-if="points.length" class="px-1 text-[11px]">
          <summary class="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-400">
            The numbers
          </summary>
          <div class="overflow-x-auto pt-1">
            <table class="w-full text-[11px]">
              <thead>
                <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <th class="text-left py-1 pr-3">Account</th>
                  <th class="text-right py-1 pr-3">TE</th>
                  <th class="text-right py-1 pr-3">Clothed TE</th>
                  <th class="text-right py-1 pr-3">Set adds</th>
                  <th class="text-right py-1 pr-3">Delivery</th>
                  <th class="text-left py-1">Clothed TE from</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 tabular-nums">
                <tr v-for="p in points" :key="p.key">
                  <td class="py-1 pr-3 font-bold text-slate-700 whitespace-nowrap">{{ p.label }}</td>
                  <td class="py-1 pr-3 text-right">{{ p.te }}</td>
                  <td class="py-1 pr-3 text-right">{{ p.cte.toFixed(1) }}</td>
                  <td class="py-1 pr-3 text-right">+{{ p.setWorth.toFixed(1) }}</td>
                  <td class="py-1 pr-3 text-right">
                    {{ p.delivery === null ? '—' : `${(p.delivery * 100).toFixed(1)}%` }}
                  </td>
                  <td class="py-1 text-slate-500">
                    {{ p.exact ? 'recorded by the planner' : 'worked out afterwards (assumes a Pro permit)' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <aside class="space-y-2 text-[11px]">
        <p class="text-[9px] font-black uppercase tracking-widest text-slate-400">Gear data still wanted</p>
        <p v-if="!needList.length" class="text-slate-500">Every gear ask has enough accounts.</p>
        <ul v-else class="space-y-1.5">
          <li
            v-for="need in needList"
            :key="need.id"
            class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-bold text-slate-800 leading-snug">{{ need.title }}</span>
              <span class="shrink-0 text-[10px] font-semibold text-slate-500 tabular-nums"
                >{{ need.have }} of {{ need.want }}</span
              >
            </div>
            <p class="text-[10px] text-slate-500 leading-snug">{{ need.where }}</p>
          </li>
        </ul>
        <p class="text-[10px] text-slate-400 leading-snug">
          Counted in accounts, from finished searches to 490 only; each ask drops off once enough accounts have covered
          it. What to run for each is under Help fill the gaps.
        </p>
      </aside>
    </div>
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">No run here recorded a Clothed TE to place.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { Account } from './analysis';
import { dataNeeds } from './needs';
import {
  DELIVERY_RAMP,
  DELIVERY_RAMP_DOMAIN,
  SET_GUIDES,
  STALL_BAND,
  deliveryColor,
  gearNeeds,
  gearPoints,
  gearSummary,
  guideSegment,
  mapDomain,
  needRegions,
  placeLabels,
  textRightEdge,
  type GearPoint,
  type LabelPlacement,
} from './gearMap';
import { AXIS_LABEL, SPLIT_LINE } from './palette';

/**
 * `accounts`: the page's accounts under the page's names (ChainExplorer's `accounts`). `whatIfs`: ids
 * of runs judged what-ifs (gearMap.ts `whatIfRuns`), never used for a mark: their TE was typed in.
 */
const props = defineProps<{ accounts: Account[]; whatIfs?: Set<string> }>();

const CHART_HEIGHT = 380;
/** The grid's margins, px: also what `placeLabels` subtracts to get the plot size. */
const GRID = { left: 48, right: 44, top: 14, bottom: 42 };
/** The marks' size, px; the names are placed around it. */
const MARK_PX = 11;

const STALL_FILL = 'rgba(225, 29, 72, 0.16)';
const NEED_FILL = 'rgba(100, 116, 139, 0.09)';
/** The key's swatch: a touch darker than the wash, which is faint on its own at swatch size. */
const NEED_FILL_KEY = 'rgba(100, 116, 139, 0.2)';
const GUIDE_COLOR = '#94a3b8';
const TEXT = '#475569';
const MUTED = '#64748b';

const data = computed(() => gearPoints(props.accounts, props.whatIfs));
const points = computed(() => data.value.points);
const missing = computed(() => data.value.missing);
const summary = computed(() => gearSummary(points.value));
const domain = computed(() => mapDomain(points.value));

/** The open needs, from the same rows the accounts were built on (ChainExplorer's `usable`). */
const needs = computed(() => dataNeeds(props.accounts.flatMap(a => a.rows)));
const needList = computed(() => gearNeeds(needs.value));
const regions = computed(() => needRegions(needs.value, domain.value));

const rampGradient = `linear-gradient(to right, ${DELIVERY_RAMP.join(', ')})`;

/**
 * The chart's width, so the names are placed on the plot as drawn: the side list moves under the
 * chart on a narrow screen and the plot can be anywhere from a phone's width to a wide desktop's.
 */
const chartBox = ref<HTMLDivElement | null>(null);
const boxWidth = ref(700);
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!chartBox.value) return;
  boxWidth.value = chartBox.value.clientWidth || boxWidth.value;
  observer = new ResizeObserver(() => {
    const w = chartBox.value?.clientWidth;
    // Whole pixels, so a sub-pixel reflow does not rebuild the chart.
    if (w && Math.round(w) !== Math.round(boxWidth.value)) boxWidth.value = Math.round(w);
  });
  observer.observe(chartBox.value);
});
onBeforeUnmount(() => observer?.disconnect());

const placements = computed<LabelPlacement[]>(() =>
  placeLabels(
    points.value.map(p => ({ x: p.te, y: p.cte, text: p.label })),
    domain.value,
    {
      width: plotWidth.value,
      height: CHART_HEIGHT - GRID.top - GRID.bottom,
      radius: MARK_PX / 2,
    }
  )
);

/** The plot's width in px, as drawn. */
const plotWidth = computed(() => Math.max(200, boxWidth.value - GRID.left - GRID.right));

/** The stall band's label, shortened to fit the width it has (it ends at `textRightEdge`). */
const stallText = computed(() => {
  const d = domain.value;
  const room = ((textRightEdge(needs.value, d) - d.x[0]) / (d.x[1] - d.x[0])) * plotWidth.value - 10;
  return (
    [
      "first ascension stalls below here (the planner's estimate)",
      'first ascension stalls below here',
      'stalls below here',
    ].find(t => t.length * 5.6 <= room) ?? 'stalls'
  );
});

/** A filled wash from `y0` up to `y1` between `x0` and `x1`: a line along the top, filled down. */
function wash(x: [number, number], y: [number, number], color: string): ChartSeriesOption {
  return {
    type: 'line',
    data: [
      [x[0], y[1]],
      [x[1], y[1]],
    ],
    symbol: 'none',
    lineStyle: { width: 0 },
    areaStyle: { origin: y[0], color, opacity: 1 },
    silent: true,
    tooltip: { show: false },
    z: 0,
    animation: false,
  };
}

/** Free text at a point: a zero-size scatter mark carrying only its label. */
interface TextMark {
  at: [number, number];
  text: string;
  offset: [number, number];
  align: 'left' | 'right' | 'center';
  verticalAlign: 'top' | 'middle' | 'bottom';
  color?: string;
}

/** ECharts reads an array position from the mark's top-left corner; placements are from its centre. */
function labelAt(p: LabelPlacement | undefined) {
  if (!p) return { show: true, position: 'right' as const };
  return {
    show: true,
    position: [MARK_PX / 2 + p.dx, MARK_PX / 2 + p.dy],
    align: p.align,
    verticalAlign: p.verticalAlign,
  };
}

function tip(p: GearPoint): string {
  const delivery =
    p.delivery === null ? 'no delivery set recorded' : `${(p.delivery * 100).toFixed(1)}% of the best set`;
  return [
    `<b>${esc(p.label)}</b>`,
    `${esc(p.te)} TE · Clothed TE ${esc(p.cte.toFixed(1))} (the set adds +${esc(p.setWorth.toFixed(1))})`,
    `delivery ${esc(delivery)}`,
    `<span style="color:#94a3b8">Clothed TE ${esc(p.cteNote)}${p.sentAt ? ` · run sent ${esc(p.sentAt.slice(0, 10))}` : ''}</span>`,
  ].join('<br/>');
}

const option = computed<ChartOption>(() => {
  const d = domain.value;
  const series: ChartSeriesOption[] = [];
  const texts: TextMark[] = [];

  for (const r of regions.value) {
    series.push(wash(r.x, r.y, NEED_FILL));
    texts.push({
      at: r.anchor,
      text: r.text,
      offset: [r.align === 'left' ? 5 : -5, r.verticalAlign === 'top' ? 5 : -4],
      align: r.align,
      verticalAlign: r.verticalAlign,
    });
  }

  series.push(wash([d.x[0], d.x[1]], [STALL_BAND.lo, STALL_BAND.hi], STALL_FILL));
  texts.push({
    at: [textRightEdge(needs.value, d), (STALL_BAND.lo + STALL_BAND.hi) / 2],
    text: stallText.value,
    offset: [-5, 0],
    align: 'right',
    verticalAlign: 'middle',
    color: '#9f1239',
  });

  for (const worth of SET_GUIDES) {
    const seg = guideSegment(worth, d);
    if (!seg) continue;
    series.push({
      type: 'line',
      data: seg,
      symbol: 'none',
      lineStyle: { type: 'dashed', width: 1, color: GUIDE_COLOR },
      silent: true,
      tooltip: { show: false },
      z: 1,
      animation: false,
    });
    texts.push({ at: seg[1], text: `+${worth}`, offset: [4, 0], align: 'left', verticalAlign: 'middle', color: MUTED });
  }

  series.push({
    type: 'scatter',
    data: texts.map(t => ({
      value: t.at,
      label: {
        show: true,
        formatter: t.text,
        position: t.offset,
        align: t.align,
        verticalAlign: t.verticalAlign,
        fontSize: 10,
        lineHeight: 12,
        color: t.color ?? MUTED,
      },
    })),
    symbolSize: 0,
    silent: true,
    tooltip: { show: false },
    z: 2,
    animation: false,
  });

  series.push({
    type: 'scatter',
    data: points.value.map((p, i) => {
      const color = deliveryColor(p.delivery);
      return {
        value: [p.te, p.cte],
        itemStyle: p.exact
          ? { color, borderColor: '#ffffff', borderWidth: 1.5 }
          : { color: '#ffffff', borderColor: color, borderWidth: 2 },
        label: labelAt(placements.value[i]),
      };
    }),
    symbol: 'circle',
    symbolSize: MARK_PX,
    label: {
      show: true,
      formatter: (raw: unknown) => points.value[(raw as { dataIndex: number }).dataIndex]?.label ?? '',
      fontSize: 10,
      color: TEXT,
    },
    tooltip: { formatter: raw => tip(points.value[(raw as { dataIndex: number }).dataIndex]) },
    emphasis: { scale: 1.3 },
    z: 4,
  });

  return {
    animation: false,
    grid: GRID,
    // Kept inside the chart and wrapped, so it fits a phone.
    tooltip: { trigger: 'item', confine: true, extraCssText: 'max-width: min(320px, 86vw); white-space: normal;' },
    xAxis: {
      type: 'value',
      min: d.x[0],
      max: d.x[1],
      interval: 20,
      name: 'TE (where its newest run with gear started)',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: AXIS_LABEL,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      min: d.y[0],
      max: d.y[1],
      interval: 20,
      name: 'Clothed TE',
      nameLocation: 'middle',
      nameGap: 36,
      nameTextStyle: AXIS_LABEL,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
