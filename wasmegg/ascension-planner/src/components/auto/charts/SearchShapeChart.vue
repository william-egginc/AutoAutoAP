<!--
  Every chain this run priced, plotted. The same data the CSV holds, without the spreadsheet.

  WHY THE DEFAULT AXIS IS THE LAST CHECKPOINT. The landscape's whole structure is the game's sale
  calendar acting on the final leg, which shows up as descending runs a few TE wide separated by
  one missed sale. Plotted against the last checkpoint, a real run reproduces that sawtooth from
  the user's own account rather than from the explainer's fixed corpus. "Order priced" and "rank"
  are offered too, because they answer different questions: whether the search was still improving
  when it stopped, and how thin the good band actually is.

  COLOUR IS ASCENSION COUNT, and that is not decoration. Chains of different lengths are different
  families, and seeing two clouds at different heights is the fastest way to notice that the run
  spent its time on a length nobody asked for.

  HIGHLIGHTING ONE CHECKPOINT'S VALUES, which is the only way to read a trend out of a cloud. A
  scatter of 25,000 chains answers "how good is the best" and nothing else: every question worth
  asking is conditional -- what does opening on 195 cost against 196, is the third checkpoint's
  value doing anything at all. So a position and a few values can be named, each value gets its own
  colour and its own best-of line in the footer, and everything else greys out. Three adjacent
  values that separate cleanly into three bands is a real effect; three that interleave is not, and
  that is visible in one glance rather than in a pivot table.

  Position, not "contains 195 anywhere", deliberately. A first checkpoint at 195 and a fourth
  checkpoint at 195 are different plans that happen to share a number, and pooling them would
  average away the effect being looked for.

  Scatter rather than line: these points have no order between them, and connecting them would
  invent one. The line toggle exists because a single-length sweep genuinely does read better
  connected, and it is off by default.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="mode in AXIS_MODES"
          :key="mode.id"
          type="button"
          class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors"
          :class="
            axis === mode.id
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          "
          @click="axis = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>
      <label class="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
        <input
          v-model="connect"
          type="checkbox"
          class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        Join the dots
      </label>
    </div>

    <p class="text-[11px] text-slate-500 leading-relaxed px-1">{{ AXIS_MODES.find(m => m.id === axis)?.hint }}</p>

    <!-- Highlight controls. Laid out as one line because it is one question: which checkpoint, and
         which of its values. -->
    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Highlight</span>
      <select
        v-model="highlightPosition"
        class="rounded-md border-slate-300 py-1 text-[11px] font-bold text-slate-700"
        :disabled="!positions.length"
      >
        <option v-for="p in positions" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
      <span class="text-[11px] font-bold text-slate-400">=</span>
      <input
        v-model="highlightText"
        type="text"
        placeholder="195, 196, 197 or 195-200"
        class="w-52 rounded-md border-slate-300 py-1 text-[11px] font-mono-premium font-bold text-slate-800"
      />
      <button
        v-if="highlightText"
        type="button"
        class="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
        @click="highlightText = ''"
      >
        Clear
      </button>
      <span v-if="highlightText && !highlightValues.length" class="text-[10px] font-bold text-amber-700">
        Nothing readable there — try `195, 196, 197` or `195-200`.
      </span>
      <span v-else-if="highlightValues.length && !matchedCount" class="text-[10px] font-bold text-amber-700">
        No chain in this run puts {{ positionLabel.toLowerCase() }} on any of those.
      </span>
    </div>

    <EChart v-if="shown.points.length" :option="option" height="360px" />
    <p v-else class="px-4 py-10 text-center text-[10px] font-bold text-slate-400">
      Nothing priced yet. The chart fills in as the search reports batches.
    </p>

    <!-- The footer is the actual answer when a highlight is on: best-of per value, side by side.
         Reading it off the cloud is guesswork; reading it off four numbers is not. -->
    <div v-if="highlightGroups.length" class="rounded-lg border border-slate-200 divide-y divide-slate-100 text-[11px]">
      <div
        v-for="group in highlightGroups"
        :key="group.value"
        class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5"
      >
        <span :style="{ color: group.color }" class="font-black">●</span>
        <span class="font-mono-premium font-black text-slate-700 w-12">{{ group.value }}</span>
        <span class="text-slate-400">{{ group.count.toLocaleString() }} chains</span>
        <span class="font-bold text-slate-700">best {{ group.bestDays.toFixed(3) }} d</span>
        <span v-if="group.gapDays > 0" class="text-slate-400">+{{ group.gapDays.toFixed(3) }} d</span>
        <span v-else class="font-black text-emerald-600">leader</span>
        <span class="font-mono-premium text-slate-400 truncate">{{ group.bestChain.join(' ') }}</span>
      </div>
    </div>

    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide"
    >
      <span>{{ shown.points.length.toLocaleString() }} chains priced</span>
      <span v-if="thinned" class="normal-case tracking-normal font-semibold"
        >showing the fastest {{ BEST_SHOWN.toLocaleString() }} and a sample, {{ plotted.length.toLocaleString() }} in
        all</span
      >
      <span v-if="live" class="normal-case tracking-normal font-semibold">redraws every 30 s while it runs</span>
      <span v-for="group in groups" :key="group.prestiges" class="flex items-center gap-1.5">
        <span :style="{ color: highlightGroups.length ? DIM : group.color }">●</span> {{ group.prestiges }} ascensions
        ({{ group.count }})
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { PricedChain } from '@/search/types';
import { parseHighlightValues } from '@/search/highlight';
import {
  BEST_KEPT as BEST_SHOWN,
  MAX_DRAWN_POINTS,
  REDRAW_MS,
  sortedOrder,
  thinIndices,
  thinPositions,
} from '@/lib/chartThin';

/**
 * Reference marks for the last-checkpoint view, all optional: a horizontal line at `y` days (say,
 * best + 1 day) and a `band` of last checkpoints, `[lo, hi]` in TE (say, where the near-best plans
 * put it), drawn as its two edges with one label centred over it: a label on each edge printed the
 * two on top of each other on a phone ("282294"). Drawn only when the x axis is the last
 * checkpoint, the one view where an x in TE means anything.
 */
interface SearchShapeRefLines {
  y?: number;
  yLabel?: string;
  band?: [number, number];
}

const props = defineProps<{
  points: PricedChain[];
  bestChain: number[];
  refLines?: SearchShapeRefLines;
  /**
   * The Chain Explorer's look: the best-found ring in ink, since every hue on that page means an
   * account (the planner's green is also the third ascension count's), and more room under the plot
   * so the axis name clears the zoom slider. With this and `refLines` both left out, the chart is
   * exactly what the planner page has always drawn.
   */
  explorerLook?: boolean;
  /**
   * A run is still going: redraw at most every REDRAW_MS, and never the moment the tab comes back
   * into view (that is when a hidden tab's backlog used to land all at once).
   */
  live?: boolean;
}>();

/* ------------------------------------------------------------------ what is drawn, and when */

/**
 * The data the chart is drawn from: a copy of the props taken on a schedule, not the props
 * themselves. While a run goes the best chain changes every few seconds, and each change used to
 * rebuild the whole chart.
 */
const shown = shallowRef({ points: props.points, bestChain: props.bestChain });
let pending = false;
let ticker: ReturnType<typeof setInterval> | null = null;

function apply(): void {
  pending = false;
  shown.value = { points: props.points, bestChain: [...props.bestChain] };
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

watch([() => props.points, () => props.bestChain.join(',')], () => {
  if (!props.live && !isHidden()) apply();
  else pending = true;
});
// The run just ended: show where it finished, unless the tab is hidden (the ticker does it then).
watch(
  () => props.live,
  live => {
    if (!live && pending && !isHidden()) apply();
  }
);
onMounted(() => {
  ticker = setInterval(() => {
    if (pending && !isHidden()) apply();
  }, REDRAW_MS);
});
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker);
});

type AxisMode = 'last' | 'rank' | 'order';
const axis = ref<AxisMode>('last');
const connect = ref(false);

const AXIS_MODES: { id: AxisMode; label: string; hint: string }[] = [
  {
    id: 'last',
    label: 'Last checkpoint',
    hint: 'Duration against the last checkpoint before your target. This is where the sale-calendar sawtooth shows up: short descending runs, then a jump of about three days where a leg misses its Saturday sale.',
  },
  {
    id: 'rank',
    label: 'Sorted best first',
    hint: 'Every chain sorted fastest to slowest. The flatter the left end, the more chains are tied near the top, and the less the exact winner matters.',
  },
  {
    id: 'order',
    label: 'Order priced',
    hint: 'The order the search actually evaluated them. A trend still heading down at the right edge means it was still finding improvements when it stopped.',
  },
];

/** Ascension count decides colour. Ordered so the legend and the series agree. */
const PALETTE = ['#4f46e5', '#f59e0b', '#059669', '#d946ef', '#0891b2', '#dc2626', '#65a30d', '#7c3aed'];

/**
 * Colours for highlighted values, kept clear of PALETTE.
 *
 * Ordered warm to cool rather than by hue family on purpose: adjacent checkpoint values are the
 * common case (195, 196, 197), and neighbouring hues would make the three bands the whole feature
 * exists to separate look like one smear.
 */
const HIGHLIGHT_PALETTE = ['#e11d48', '#0284c7', '#ca8a04', '#7c3aed', '#059669', '#db2777'];

/** Everything not highlighted. Light enough to read as background, dark enough to still show shape. */
const DIM = '#cbd5e1';

/** The planner's "best found" ring. */
const BEST_RING = '#059669';

/**
 * The explorer's ring (`explorerLook`) and the reference marks: ink, not a series hue. The planner's
 * green is the third ascension count's (and the fifth highlight's), so on a table with three counts
 * it read as one more point of that family.
 */
const INK = '#0f172a';
const REF = '#64748b';
/** Behind a reference label, so it stays readable where it crosses the cloud. */
const LABEL_BACK = { backgroundColor: 'rgba(255,255,255,0.85)', padding: [1, 3], borderRadius: 2 };

const groups = computed(() => {
  const counts = new Map<number, number>();
  for (const p of shown.value.points) counts.set(p.prestiges, (counts.get(p.prestiges) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([prestiges, count], i) => ({ prestiges, count, color: PALETTE[i % PALETTE.length] }));
});

/* ------------------------------------------------------------------ highlighting one checkpoint */

/** `0`-based checkpoint index, or `last` for "the one before the target" whatever the length. */
type Position = number | 'last';

const highlightPosition = ref<Position>(0);
const highlightText = ref('');

/** Longest chain in the run, which decides how many positions can be offered. */
const maxChainLength = computed(() => shown.value.points.reduce((m, p) => Math.max(m, p.chain.length), 0));

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

const positions = computed<{ id: Position; label: string }[]>(() => {
  // `length - 1` because the final target is not a position anybody chooses.
  const checkpoints = Math.max(0, maxChainLength.value - 1);
  const out: { id: Position; label: string }[] = [];
  for (let i = 0; i < checkpoints; i++) {
    out.push({ id: i, label: `${ORDINALS[i] ?? `${i + 1}th`} checkpoint` });
  }
  if (checkpoints > 1) out.push({ id: 'last', label: 'Last before target' });
  return out;
});

// A run whose chains all shrank can leave the selection pointing at a position that no longer
// exists, which would silently match nothing and look like a bug in the parser.
watch(positions, list => {
  if (list.length && !list.some(p => p.id === highlightPosition.value)) highlightPosition.value = list[0].id;
});

const positionLabel = computed(
  () => positions.value.find(p => p.id === highlightPosition.value)?.label ?? 'that checkpoint'
);

const highlightValues = computed(() => parseHighlightValues(highlightText.value));

/** The checkpoint this chain puts at the selected position, or null when it is too short for one. */
function valueAt(chain: number[]): number | null {
  if (chain.length < 2) return null;
  if (highlightPosition.value === 'last') return chain[chain.length - 2];
  const i = highlightPosition.value;
  // `length - 1` guards the final target: a 3-chain has checkpoints at 0 and 1, never at 2.
  return i < chain.length - 1 ? chain[i] : null;
}

interface Plotted {
  x: number;
  y: number;
  chain: number[];
  prestiges: number;
}

/** Every point's duration, for thinning and ranking. */
const daysOf = computed(() => Float64Array.from(shown.value.points, p => p.days));

/** Rank (0 = fastest) of each point, built only for the "Sorted best first" axis. */
const rankOrder = computed(() => (axis.value === 'rank' ? sortedOrder(daysOf.value) : null));

function xOf(i: number, rankOfIndex: Uint32Array | null): number {
  if (axis.value === 'rank') return (rankOfIndex?.[i] ?? 0) + 1;
  if (axis.value === 'order') return i + 1;
  return shown.value.points[i].lastCheckpoint;
}

function toPlotted(i: number, rankOfIndex: Uint32Array | null): Plotted {
  const p = shown.value.points[i];
  return { x: xOf(i, rankOfIndex), y: p.days, chain: p.chain, prestiges: p.prestiges };
}

/**
 * What is drawn: at most MAX_DRAWN_POINTS, the fastest plus an even sample of the rest. Every
 * count and best-of on the page still comes from all of them.
 */
const plotted = computed<Plotted[]>(() => {
  const order = rankOrder.value;
  if (order) {
    // Sorted by rank already, so thin by position and the x is the position.
    return thinPositions(order.length).map(pos => {
      const p = shown.value.points[order[pos]];
      return { x: pos + 1, y: p.days, chain: p.chain, prestiges: p.prestiges };
    });
  }
  return thinIndices(daysOf.value).map(i => toPlotted(i, null));
});

/** Is the drawing a sample? Said under the chart, so a thinned cloud is never taken for all of it. */
const thinned = computed(() => plotted.value.length < shown.value.points.length);

interface HighlightGroup {
  value: number;
  color: string;
  points: Plotted[];
  count: number;
  bestDays: number;
  bestChain: number[];
  /** Days behind the best HIGHLIGHTED value, which is the comparison being asked for. */
  gapDays: number;
}

const highlightGroups = computed<HighlightGroup[]>(() => {
  if (!highlightValues.value.length) return [];
  const all = shown.value.points;
  const buckets = new Map<number, number[]>();
  for (const value of highlightValues.value) buckets.set(value, []);
  for (let i = 0; i < all.length; i++) {
    const v = valueAt(all[i].chain);
    if (v === null) continue;
    buckets.get(v)?.push(i);
  }

  const filled = [...buckets.entries()].filter(([, idx]) => idx.length);
  if (!filled.length) return [];
  // A loop, not `Math.min(...)`: a spread passes one argument per element, a RangeError past ~125k.
  const bestOf = (idx: number[]): number => idx.reduce((a, b) => (all[b].days < all[a].days ? b : a));
  const bests = filled.map(([, idx]) => bestOf(idx));
  const leader = bests.reduce((a, b) => (all[b].days < all[a].days ? b : a));

  // Ranks only when the axis needs them.
  let rankOfIndex: Uint32Array | null = null;
  const order = rankOrder.value;
  if (order) {
    rankOfIndex = new Uint32Array(order.length);
    for (let r = 0; r < order.length; r++) rankOfIndex[order[r]] = r;
  }
  const perGroup = Math.max(500, Math.floor(MAX_DRAWN_POINTS / filled.length));

  return filled.map(([value, idx], i) => {
    const best = all[bests[i]];
    const kept = thinIndices(
      idx.map(k => all[k].days),
      perGroup
    ).map(k => toPlotted(idx[k], rankOfIndex));
    return {
      value,
      color: HIGHLIGHT_PALETTE[i % HIGHLIGHT_PALETTE.length],
      points: kept,
      count: idx.length,
      bestDays: best.days,
      bestChain: best.chain,
      gapDays: best.days - all[leader].days,
    };
  });
});

const matchedCount = computed(() => highlightGroups.value.reduce((n, g) => n + g.count, 0));

/** The best-found ring, looked up in ALL the points (the sample may not hold it). */
const bestPoint = computed<Plotted | null>(() => {
  const want = shown.value.bestChain;
  if (!want.length) return null;
  const all = shown.value.points;
  const i = all.findIndex(p => p.chain.length === want.length && p.chain.every((v, k) => v === want[k]));
  if (i < 0) return null;
  if (axis.value !== 'rank') return toPlotted(i, null);
  // Its rank: how many are strictly faster.
  let faster = 0;
  for (const p of all) if (p.days < all[i].days) faster++;
  return { x: faster + 1, y: all[i].days, chain: all[i].chain, prestiges: all[i].prestiges };
});

const option = computed<ChartOption>(() => {
  const dimmed = highlightGroups.value.length > 0;

  const byLength = new Map<number, Plotted[]>();
  for (const p of plotted.value) {
    const bucket = byLength.get(p.prestiges);
    if (bucket) bucket.push(p);
    else byLength.set(p.prestiges, [p]);
  }

  const colorOf = (prestiges: number) => groups.value.find(g => g.prestiges === prestiges)?.color ?? PALETTE[0];

  const series: ChartSeriesOption[] = [...byLength.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([prestiges, pts]) => {
      // Connecting only makes sense along the x axis, so sort when the line is on. Left unsorted
      // otherwise, since sorting thousands of points every redraw buys nothing for a scatter.
      const data = (connect.value ? [...pts].sort((a, b) => a.x - b.x) : pts).map(p => [p.x, p.y, p.chain.join(' ')]);
      return {
        name: `${prestiges} ascensions`,
        type: connect.value ? ('line' as const) : ('scatter' as const),
        data,
        color: dimmed ? DIM : colorOf(prestiges),
        symbolSize: 5,
        ...(connect.value ? { showSymbol: true, lineStyle: { width: 1 }, smooth: false } : {}),
      };
    });

  // Drawn after, so they sit on top of the dimmed cloud rather than under it.
  for (const group of highlightGroups.value) {
    const data = (connect.value ? [...group.points].sort((a, b) => a.x - b.x) : group.points).map(p => [
      p.x,
      p.y,
      p.chain.join(' '),
    ]);
    series.push({
      name: `${positionLabel.value} = ${group.value}`,
      type: connect.value ? ('line' as const) : ('scatter' as const),
      data,
      color: group.color,
      symbolSize: 6,
      ...(connect.value ? { showSymbol: true, lineStyle: { width: 1.5 }, smooth: false } : {}),
    });
  }

  const best = bestPoint.value;
  if (best) {
    const ring = props.explorerLook ? INK : BEST_RING;
    series.push({
      name: 'Best found',
      type: 'scatter' as const,
      data: [[best.x, best.y, best.chain.join(' ')]],
      color: ring,
      symbolSize: 16,
      // A ring, so it reads as a marker rather than another observation.
      itemStyle: { color: 'transparent', borderColor: ring, borderWidth: 2.5 },
    });
  }

  const marks = axis.value === 'last' ? props.refLines : undefined;
  const lineData: object[] = [];
  if (marks?.y !== undefined && Number.isFinite(marks.y)) {
    // At the left end, short, on a light back: the near-best plans crowd the line wherever the cloud
    // is, and a long label at the right end ran over them and the best-found ring on a phone.
    lineData.push({
      yAxis: marks.y,
      label: { formatter: marks.yLabel ?? `${marks.y.toFixed(2)} d`, position: 'insideStartTop', ...LABEL_BACK },
    });
  }
  const band = marks?.band;
  if (band && band.every(Number.isFinite)) {
    const [lo, hi] = band[0] <= band[1] ? band : [band[1], band[0]];
    const label = (text: string) => ({ formatter: text, position: 'end', ...LABEL_BACK });
    if (lo === hi) {
      // One TE wide: one line, labelled once.
      lineData.push({ xAxis: lo, label: label(String(lo)) });
    } else {
      // The edges unlabelled, and the label on an invisible line at the middle, so it sits over the
      // band. (A shaded markArea would need a component the app's echarts build does not register.)
      lineData.push({ xAxis: lo, label: { show: false } }, { xAxis: hi, label: { show: false } });
      // Transparent by colour: an opacity of 0 hides the line's label with it.
      lineData.push({ xAxis: (lo + hi) / 2, lineStyle: { color: 'transparent' }, label: label(`${lo}–${hi}`) });
    }
  }
  if (lineData.length) {
    // On a series of its own with no points, so it cannot be mistaken for, or dimmed with, the data.
    series.push({
      name: 'Reference',
      type: 'scatter' as const,
      data: [],
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: REF, type: 'dashed', width: 1 },
        label: { color: REF, fontSize: 10 },
        data: lineData as never,
      },
    });
  }

  return {
    // The explorer's look leaves room for the axis labels, the axis name and the zoom slider under
    // each other: at 56 with a name gap of 28 the name sat on top of the slider.
    grid: { left: 58, right: 20, top: 16, bottom: props.explorerLook ? 70 : 56 },
    tooltip: {
      trigger: 'item',
      // Kept inside the chart, so a point near the edge never puts its tooltip off a phone's screen.
      confine: true,
      formatter: rawParams => {
        // echarts types the formatter param as a broad union that can be an array under
        // `trigger: 'axis'`. This chart is always `trigger: 'item'`, so it is one point, and the
        // only fields read are the [x, y, chain] tuple each series was given. Same narrowing the
        // C3 comparison chart does.
        const params = rawParams as { data?: [number, number, string]; seriesName?: string };
        if (!params.data) return '';
        // Escaped even though every field here is currently numeric: this component is now shared
        // with the Chain Explorer, whose points are parsed out of a CSV served by whatever
        // collector the page was pointed at. See lib/charts/tooltip.ts.
        const label = params.seriesName ? `<br/><span style="color:#94a3b8">${esc(params.seriesName)}</span>` : '';
        return `<b>${esc(params.data[2])}</b><br/>${esc(params.data[1].toFixed(3))} days${label}`;
      },
    },
    xAxis: {
      type: 'value',
      name:
        axis.value === 'last' ? 'last checkpoint (TE)' : axis.value === 'rank' ? 'rank, best first' : 'order priced',
      nameLocation: 'middle',
      nameGap: props.explorerLook ? 26 : 28,
      nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      scale: true,
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#eef2f7' } },
    },
    yAxis: {
      type: 'value',
      name: 'days',
      nameTextStyle: { color: '#94a3b8', fontSize: 10 },
      scale: true,
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#eef2f7' } },
    },
    // Thousands of points on a 360px canvas: without a zoom the sawtooth is a smear.
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'slider', xAxisIndex: 0, height: 18, bottom: 6, borderColor: '#e2e8f0' },
    ],
    series,
  };
});
</script>
