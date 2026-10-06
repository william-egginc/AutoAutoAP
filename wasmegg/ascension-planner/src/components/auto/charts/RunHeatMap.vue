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
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full h-auto select-none"
      role="img"
      :aria-label="`Heat map of ${heat.total.toLocaleString()} chains: last checkpoint against days`"
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
        <circle v-for="d in bestDots" :key="d.k" :cx="d.x" :cy="d.y" r="2.5" fill="#0f172a" />
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
        :y="H - B + 14"
        text-anchor="middle"
        font-size="10"
        fill="#64748b"
      >
        {{ t.v }}
      </text>
      <text
        v-for="t in yTicks"
        :key="'y' + t.v"
        :x="L - 6"
        :y="t.p + 3"
        text-anchor="end"
        font-size="10"
        fill="#64748b"
      >
        {{ t.v }}
      </text>
      <text :x="(L + W - R) / 2" :y="H - 4" text-anchor="middle" font-size="10" fill="#94a3b8">
        last checkpoint (TE)
      </text>
      <text
        :x="12"
        :y="T + plotH / 2"
        text-anchor="middle"
        font-size="10"
        fill="#94a3b8"
        :transform="`rotate(-90 12 ${T + plotH / 2})`"
      >
        days
      </text>
    </svg>
    <p v-else class="px-4 py-10 text-center text-[10px] font-bold text-slate-400">
      Nothing priced yet. This fills in as the search reports batches.
    </p>
    <p class="text-[11px] text-slate-500 px-1 min-h-[1.25rem]">
      <template v-if="hover">
        Last checkpoint {{ hover.xLo }}–{{ hover.xHi }} TE, {{ hover.yLo.toFixed(1) }}–{{ hover.yHi.toFixed(1) }} days:
        <span class="font-bold text-slate-700">{{ hover.count.toLocaleString() }} chains</span>
      </template>
      <template v-else-if="heat">
        {{ heat.total.toLocaleString() }} chains. Darker means more chains; the dots are the fastest in each column.
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HeatSnapshot } from '@/lib/chartThin';

const props = defineProps<{ heat: HeatSnapshot | null }>();

const W = 600;
const H = 260;
const L = 52;
const R = 10;
const T = 8;
const B = 34;
const plotW = W - L - R;
const plotH = H - T - B;

const cellW = computed(() => (props.heat ? plotW / props.heat.cols : 0));
const cellH = computed(() => (props.heat ? plotH / props.heat.rows : 0));

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
        x: L + c * cellW.value,
        // Row 0 is the fast end, drawn at the bottom.
        y: T + (h.rows - 1 - r) * cellH.value,
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
  const h = props.heat!;
  return T + plotH - ((days - h.y0) / (h.rows * h.yw)) * plotH;
}

const bestDots = computed(() => {
  const h = props.heat;
  if (!h) return [];
  const out: { k: number; x: number; y: number }[] = [];
  for (let c = 0; c < h.cols; c++) {
    const v = h.colBest[c];
    if (Number.isFinite(v)) out.push({ k: c, x: L + (c + 0.5) * cellW.value, y: yPos(v) });
  }
  return out;
});

function ticks(lo: number, hi: number, n: number, digits: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Number((lo + ((hi - lo) * i) / n).toFixed(digits)));
  return [...new Set(out)];
}

const xTicks = computed(() => {
  const h = props.heat;
  if (!h) return [];
  const span = h.cols * h.xw;
  return ticks(h.x0, h.x0 + span, 4, 0).map(v => ({ v, p: L + ((v - h.x0) / span) * plotW }));
});

const yTicks = computed(() => {
  const h = props.heat;
  if (!h) return [];
  const hi = h.y0 + h.rows * h.yw;
  return ticks(h.y0, hi, 4, 1).map(v => ({ v, p: yPos(v) }));
});
</script>
