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

    <EChart v-if="points.length" :option="option" height="360px" />
    <p v-else class="px-4 py-10 text-center text-[10px] font-bold text-slate-400">
      Nothing priced yet. The chart fills in as the search reports batches.
    </p>

    <!-- The footer is the actual answer when a highlight is on: best-of per value, side by side.
         Reading it off the cloud is guesswork; reading it off four numbers is not. -->
    <div
      v-if="highlightGroups.length"
      class="rounded-lg border border-slate-200 divide-y divide-slate-100 text-[11px]"
    >
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
      <span>{{ points.length.toLocaleString() }} chains priced</span>
      <span v-for="group in groups" :key="group.prestiges" class="flex items-center gap-1.5">
        <span :style="{ color: highlightGroups.length ? DIM : group.color }">●</span> {{ group.prestiges }} ascensions
        ({{ group.count }})
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import type { PricedChain } from '@/search/types';
import { parseHighlightValues } from '@/search/highlight';

const props = defineProps<{ points: PricedChain[]; bestChain: number[] }>();

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

const groups = computed(() => {
  const counts = new Map<number, number>();
  for (const p of props.points) counts.set(p.prestiges, (counts.get(p.prestiges) ?? 0) + 1);
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
const maxChainLength = computed(() => props.points.reduce((m, p) => Math.max(m, p.chain.length), 0));

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

const plotted = computed<Plotted[]>(() => {
  const source = props.points;
  if (axis.value === 'rank') {
    return [...source]
      .sort((a, b) => a.days - b.days)
      .map((p, i) => ({ x: i + 1, y: p.days, chain: p.chain, prestiges: p.prestiges }));
  }
  if (axis.value === 'order') {
    return source.map((p, i) => ({ x: i + 1, y: p.days, chain: p.chain, prestiges: p.prestiges }));
  }
  return source.map(p => ({ x: p.lastCheckpoint, y: p.days, chain: p.chain, prestiges: p.prestiges }));
});

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
  const buckets = new Map<number, Plotted[]>();
  for (const value of highlightValues.value) buckets.set(value, []);
  for (const p of plotted.value) {
    const v = valueAt(p.chain);
    if (v === null) continue;
    buckets.get(v)?.push(p);
  }

  const filled = [...buckets.entries()].filter(([, pts]) => pts.length);
  if (!filled.length) return [];
  const bests = filled.map(([, pts]) => Math.min(...pts.map(p => p.y)));
  const leader = Math.min(...bests);

  return filled.map(([value, pts], i) => {
    const best = pts.reduce((a, b) => (b.y < a.y ? b : a));
    return {
      value,
      color: HIGHLIGHT_PALETTE[i % HIGHLIGHT_PALETTE.length],
      points: pts,
      count: pts.length,
      bestDays: best.y,
      bestChain: best.chain,
      gapDays: best.y - leader,
    };
  });
});

const matchedCount = computed(() => highlightGroups.value.reduce((n, g) => n + g.count, 0));

const bestKey = computed(() => props.bestChain.join(','));

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

  const best = plotted.value.find(p => p.chain.join(',') === bestKey.value);
  if (best) {
    series.push({
      name: 'Best found',
      type: 'scatter' as const,
      data: [[best.x, best.y, best.chain.join(' ')]],
      color: '#059669',
      symbolSize: 16,
      // A ring, so it reads as a marker rather than another observation.
      itemStyle: { color: 'transparent', borderColor: '#059669', borderWidth: 2.5 },
    });
  }

  return {
    grid: { left: 58, right: 20, top: 16, bottom: 56 },
    tooltip: {
      trigger: 'item',
      formatter: rawParams => {
        // echarts types the formatter param as a broad union that can be an array under
        // `trigger: 'axis'`. This chart is always `trigger: 'item'`, so it is one point, and the
        // only fields read are the [x, y, chain] tuple each series was given. Same narrowing the
        // C3 comparison chart does.
        const params = rawParams as { data?: [number, number, string]; seriesName?: string };
        if (!params.data) return '';
        const label = params.seriesName ? `<br/><span style="color:#94a3b8">${params.seriesName}</span>` : '';
        return `<b>${params.data[2]}</b><br/>${params.data[1].toFixed(3)} days${label}`;
      },
    },
    xAxis: {
      type: 'value',
      name:
        axis.value === 'last' ? 'last checkpoint (TE)' : axis.value === 'rank' ? 'rank, best first' : 'order priced',
      nameLocation: 'middle',
      nameGap: 28,
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
