<!--
  An account's mark in HTML: its colour AND its shape, the same pair the charts draw (palette.ts
  `colorAt`, `symbolAt`).

  WHY NOT A ROUND DOT. Past eight accounts the hues repeat and the shape is what tells two accounts
  apart, so a plain `rounded-full` dot drew accounts 9-12 exactly like accounts 1-4 in every table and
  key on the page. Inline SVG rather than CSS clip-path so a hollow mark (a chart's `emptyCircle`) can
  be drawn as an outline, and so a line chart's legend can put a short line through the mark.

  The shapes are ECharts' own: a triangle with its apex up and its base the full width, a diamond
  touching the middle of each side, a square filling the box.
-->
<template>
  <svg
    :width="width"
    :height="size"
    :viewBox="`0 0 ${width} ${size}`"
    class="inline-block shrink-0 align-middle overflow-visible"
    aria-hidden="true"
    focusable="false"
  >
    <line
      v-if="line"
      x1="0"
      :y1="cy"
      :x2="width"
      :y2="cy"
      :stroke="fill"
      stroke-width="1.5"
      :stroke-dasharray="DASHES[line]"
    />
    <circle
      v-if="shape === 'circle'"
      :cx="cx"
      :cy="cy"
      :r="half"
      :fill="hollow ? '#ffffff' : fill"
      :stroke="hollow ? fill : 'none'"
      :stroke-width="hollow ? STROKE : 0"
    />
    <polygon
      v-else
      :points="points"
      :fill="hollow ? '#ffffff' : fill"
      :stroke="hollow ? fill : 'none'"
      :stroke-width="hollow ? STROKE : 0"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { colorAt, symbolAt, type SeriesSymbol } from './palette';

const props = withDefaults(
  defineProps<{
    /** The account's colour index (ChainExplorer's `accountColors`): gives both colour and shape. */
    index?: number;
    /** Overrides the colour the index gives (or sets it with no index). */
    color?: string;
    /** Overrides the shape the index gives. */
    symbol?: SeriesSymbol;
    /** Height of the mark, in px. */
    size?: number;
    /** An outline only, as a chart's `empty…` symbols draw. */
    hollow?: boolean;
    /** A short line through the mark in this pattern, for a line series' legend entry. */
    line?: 'solid' | 'dashed' | 'dotted' | 'dashdot' | null;
  }>(),
  { index: 0, color: undefined, symbol: undefined, size: 8, hollow: false, line: null }
);

const STROKE = 1.5;
const DASHES: Record<'solid' | 'dashed' | 'dotted' | 'dashdot', string | undefined> = {
  solid: undefined,
  dashed: '3 2',
  dotted: '1 1.6',
  dashdot: '5 2 1.5 2',
};

const fill = computed(() => props.color ?? colorAt(props.index));
const shape = computed<SeriesSymbol>(() => props.symbol ?? symbolAt(props.index));
/** Wide enough for a line either side of the mark when there is one. */
const width = computed(() => (props.line ? Math.round(props.size * 2.5) : props.size));
const cx = computed(() => width.value / 2);
const cy = computed(() => props.size / 2);
/** Half the mark, less half the outline so a hollow mark keeps its size. */
const half = computed(() => props.size / 2 - (props.hollow ? STROKE / 2 : 0));

const points = computed(() => {
  const h = half.value;
  const x = cx.value;
  const y = cy.value;
  const pts: [number, number][] =
    shape.value === 'triangle'
      ? [
          [x, y - h],
          [x + h, y + h],
          [x - h, y + h],
        ]
      : shape.value === 'diamond'
        ? [
            [x, y - h],
            [x + h, y],
            [x, y + h],
            [x - h, y],
          ]
        : [
            [x - h, y - h],
            [x + h, y - h],
            [x + h, y + h],
            [x - h, y + h],
          ];
  return pts.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' ');
});
</script>
