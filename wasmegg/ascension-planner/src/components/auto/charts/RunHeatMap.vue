<!--
  Where a big run's chains landed: last checkpoint across, days up, darker = more chains.

  Drawn from a fixed grid of counts (lib/chartThin.ts) that the store fills as results arrive, so it
  costs the same on a 120,000-chain sweep as on a small one. The dots are the fastest chain in each
  column, which is the sawtooth the point chart shows.
-->
<template>
  <div class="space-y-2">
    <svg
      v-if="heat"
      ref="svgEl"
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full h-auto select-none tabular-nums"
      role="img"
      :aria-label="`Heat map of ${chainCount(heat.total)}: last stop against days`"
      @mouseleave="hover = null"
    >
      <!-- cells -->
      <g>
        <rect
          v-for="cell in cells"
          :key="cell.k"
          :x="cell.x"
          :y="cell.y"
          :width="cellW"
          :height="cellH"
          :fill="cell.fill"
          @mouseenter="hover = cell"
        />
      </g>
      <!-- fastest per column -->
      <g>
        <circle v-for="d in bestDots" :key="d.k" :cx="d.x" :cy="d.y" r="3" fill="#0f172a" />
      </g>
      <rect
        v-if="hover"
        :x="hover.x"
        :y="hover.y"
        :width="cellW"
        :height="cellH"
        fill="none"
        stroke="#0f172a"
        stroke-width="1.5"
      />
      <!-- axes -->
      <line :x1="L" :x2="W - R" :y1="H - B" :y2="H - B" stroke="#cbd5e1" />
      <line :x1="L" :x2="L" :y1="T" :y2="H - B" stroke="#cbd5e1" />
      <text
        v-for="t in xTicks"
        :key="'x' + t.v"
        :x="t.p"
        :y="H - B + lay.xLabelY"
        text-anchor="middle"
        :font-size="lay.fontSize"
        fill="#64748b"
      >
        {{ t.v }}
      </text>
      <text
        v-for="t in yTicks"
        :key="'y' + t.v"
        :x="L - 6"
        :y="t.p + lay.fontSize / 3"
        text-anchor="end"
        :font-size="lay.fontSize"
        fill="#64748b"
      >
        {{ t.v }}
      </text>
      <text :x="(L + W - R) / 2" :y="lay.xTitleY" text-anchor="middle" :font-size="lay.fontSize" fill="#94a3b8">
        last stop (TE)
      </text>
      <text
        :x="lay.yTitleX"
        :y="T + plotH / 2"
        text-anchor="middle"
        dominant-baseline="central"
        :font-size="lay.fontSize"
        fill="#94a3b8"
        :transform="`rotate(-90 ${lay.yTitleX} ${T + plotH / 2})`"
      >
        days
      </text>
    </svg>
    <p v-else class="px-4 py-10 text-center text-small font-bold text-slate-400">
      Nothing priced yet. This fills in as the search reports batches.
    </p>
    <p class="text-body text-slate-500 px-1 min-h-[1.25rem]">
      <template v-if="hover">
        Last stop {{ hover.xLo === hover.xHi ? hover.xLo : `${hover.xLo}–${hover.xHi}` }} TE, {{ hover.yLo.toFixed(1) }}–{{ hover.yHi.toFixed(1) }} days:
        <span class="font-bold text-slate-700">{{ chainCount(hover.count) }}</span>
      </template>
      <template v-else-if="heat">
        {{ chainCount(heat.total) }}. Darker means more routes; the dots are the fastest in each column.
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { chainCount, heatView, integerTicks, type HeatSnapshot } from '@/lib/chartThin';
import { FALLBACK_WIDTH, X_GAPS, Y_GAPS, heatLayout } from './heatLayout';

const props = defineProps<{ heat: HeatSnapshot | null }>();

// The frame follows the drawn width (heatLayout.ts: one unit is one px, so labels are 12 px on a phone too).
const svgEl = ref<SVGSVGElement | null>(null);
const drawnWidth = ref(FALLBACK_WIDTH);
let resize: ResizeObserver | null = null;
function measure() {
  const w = svgEl.value?.getBoundingClientRect().width ?? 0;
  if (w > 0 && Math.abs(w - drawnWidth.value) >= 1) drawnWidth.value = w;
}
function observe(el: SVGSVGElement | null) {
  resize?.disconnect();
  if (!el || typeof ResizeObserver === 'undefined') return;
  resize = new ResizeObserver(measure);
  resize.observe(el);
  measure();
}
onMounted(() => observe(svgEl.value));
// The svg comes and goes with `heat` (v-if): watch the ref so a later first batch is measured too.
watch(svgEl, el => observe(el));
onBeforeUnmount(() => resize?.disconnect());

/** The y labels' longest text ("12.5"), so the left margin fits it. */
const yLabelChars = computed(() => {
  const v = view.value;
  return v ? Math.max(...ticks(v.yMin, v.yMax, Y_GAPS, 1).map(t => String(t).length)) : 4;
});
const lay = computed(() => heatLayout(drawnWidth.value, yLabelChars.value));
const W = computed(() => lay.value.W);
const H = computed(() => lay.value.H);
const L = computed(() => lay.value.L);
const R = computed(() => lay.value.R);
const T = computed(() => lay.value.T);
const B = computed(() => lay.value.B);
const plotW = computed(() => lay.value.plotW);
const plotH = computed(() => lay.value.plotH);

// The axes span the data plus any padding for a range too narrow to draw (heatView); a cell is one
// bin of that range, so a single column or a single chain is a small box, not the whole plot.
const view = computed(() => (props.heat ? heatView(props.heat) : null));
const cellW = computed(() => (props.heat && view.value ? (plotW.value * props.heat.xw) / (view.value.xMax - view.value.xMin) : 0));
const cellH = computed(() => (props.heat && view.value ? (plotH.value * props.heat.yw) / (view.value.yMax - view.value.yMin) : 0));
function xPos(x: number): number {
  const v = view.value!;
  return L.value + ((x - v.xMin) / (v.xMax - v.xMin)) * plotW.value;
}

/** Indigo, light to dark. */
const RAMP = ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3'];

interface Cell {
  k: number;
  x: number;
  y: number;
  fill: string;
  count: number;
  xLo: number;
  xHi: number;
  yLo: number;
  yHi: number;
}

const hover = ref<Cell | null>(null);

const cells = computed<Cell[]>(() => {
  const h = props.heat;
  if (!h) return [];
  const out: Cell[] = [];
  // Square-root scale: a few crowded cells would otherwise wash every other one out.
  const top = Math.sqrt(h.max);
  for (let r = 0; r < h.rows; r++) {
    for (let c = 0; c < h.cols; c++) {
      const count = h.counts[r * h.cols + c];
      if (!count) continue;
      const step = Math.min(RAMP.length - 1, Math.floor((Math.sqrt(count) / top) * (RAMP.length - 1) + 0.5));
      const xLo = h.x0 + c * h.xw;
      const yLo = h.y0 + r * h.yw;
      out.push({
        k: r * h.cols + c,
        x: xPos(xLo),
        // Row 0 is the fast end, drawn at the bottom.
        y: yPos(yLo + h.yw),
        fill: RAMP[step],
        count,
        xLo: Math.ceil(xLo),
        xHi: Math.ceil(xLo + h.xw) - 1,
        yLo,
        yHi: yLo + h.yw,
      });
    }
  }
  return out;
});

function yPos(days: number): number {
  const v = view.value!;
  return T.value + plotH.value - ((days - v.yMin) / (v.yMax - v.yMin)) * plotH.value;
}

const bestDots = computed(() => {
  const h = props.heat;
  if (!h) return [];
  const out: { k: number; x: number; y: number }[] = [];
  for (let c = 0; c < h.cols; c++) {
    const v = h.colBest[c];
    if (Number.isFinite(v)) out.push({ k: c, x: xPos(h.x0 + (c + 0.5) * h.xw), y: yPos(v) });
  }
  return out;
});

function ticks(lo: number, hi: number, n: number, digits: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Number((lo + ((hi - lo) * i) / n).toFixed(digits)));
  return [...new Set(out)];
}

const xTicks = computed(() => {
  const v = view.value;
  return v ? integerTicks(v.xMin, v.xMax, X_GAPS).map(t => ({ v: t, p: xPos(t) })) : [];
});

const yTicks = computed(() => {
  const v = view.value;
  return v ? ticks(v.yMin, v.yMax, Y_GAPS, 1).map(t => ({ v: t, p: yPos(t) })) : [];
});
</script>
