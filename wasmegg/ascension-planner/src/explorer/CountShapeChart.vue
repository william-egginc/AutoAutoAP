<!--
  Where each ascension lands, across accounts, at one ascension count.

  EACH ACCOUNT COUNTS ONCE, by its best plan at this count: its earliest finish that still stands
  (analysis.ts `bestPerCount`), or its newest run when none does. Counting runs let whoever sent the
  most decide the middle: seven of the sixteen 5-ascension runs on 26 Sep were allanfieldhouse's, and
  the per-run median put checkpoint 3 about 10 TE lower than the accounts' own best plans do. Every
  run is still drawn, faintly, so nothing is hidden; only the summaries are per account.

  THE CHECKPOINT MAP IS THE DEFAULT. x is the TE the plan started from, y is the checkpoint's TE, and
  each account's best plan is one vertical stalk in its colour with its checkpoints on it, darker for
  later ones. Across the stalks, a checkpoint that stays level is a TE everyone ascends at whatever
  their start; one that climbs moves with the start. The data has both: on 26 Sep the last
  3-ascension checkpoint sat at 279-288 TE for accounts starting anywhere from 124 to 199 (slope
  0.05), while the first 6-ascension checkpoint moved almost one-for-one with the start (0.91). The
  old default, a share of each account's journey, assumed every checkpoint scales with the start, and
  its table turned the median share back into TE on a median journey -- which put a 157->490
  account's last 3-ascension checkpoint at 260-301 when every account's was 279-288. The table now
  shows the TEs the best plans really used, the TE above the start, and the slope that says which of
  the two travels.

  SHARE OF THE JOURNEY stays as the second view, with its median over accounts. It collapses the
  checkpoints that do scale with the start and spreads the ones that do not, and either is worth
  seeing.

  CHECKPOINT 1 IS DRAWN APART (hollow, and dashed in the share view): it is mostly timing -- when the
  ascension in progress ends -- like leg 1 in the chart below it.

  Shapes compare across accounts; totals never do, so no duration appears here.
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
            view === mode.id
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          "
          :aria-pressed="view === mode.id"
          @click="view = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>
      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
        {{ bests.length }} account{{ bests.length === 1 ? '' : 's' }} ({{ rows.length }} run{{
          rows.length === 1 ? '' : 's'
        }}) · {{ summary.length }} checkpoint{{ summary.length === 1 ? '' : 's' }}
      </span>
    </div>

    <EChart v-if="bests.length" :option="option" height="320px" />

    <!-- Which stalk is whose, without hovering. The share view has a legend of accounts instead. -->
    <div v-if="bests.length && view === 'map'" class="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px] text-slate-500">
      <span v-for="b in keyed" :key="b.accountKey" class="whitespace-nowrap">
        <span class="inline-block w-2 h-2 rounded-full mr-1 align-middle" :style="{ background: b.color }" />{{
          b.label
        }}
        <span class="text-slate-400">· start {{ b.row.currentTE }}</span>
        <span v-if="!b.standing" class="text-slate-400" title="None of this account's runs at this count still stands"
          >(newest run)</span
        >
      </span>
    </div>
    <p class="text-[10px] text-slate-400 leading-relaxed px-1">{{ MODES.find(m => m.id === view)?.hint }}</p>

    <!-- The same numbers as the chart, for the reader who wants to copy one: the TEs the best plans
         really used, the same as TE above the start, and the slope that says which travels. -->
    <div class="overflow-x-auto">
      <table class="w-full text-[11px]">
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <th class="text-left py-1 pr-3">Checkpoint</th>
            <th class="text-right py-1 pr-3">Accounts</th>
            <th class="text-left py-1 pr-3">TE</th>
            <th class="text-left py-1 pr-3">TE above start</th>
            <th class="text-right py-1 pr-3" title="TE the checkpoint moves per TE higher the plan starts">
              Slope vs start
            </th>
            <th class="text-left py-1">Share of journey</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="cp in summary" :key="cp.index">
            <td class="py-1 pr-3 font-bold text-slate-600">
              {{ cp.index + 1
              }}<span v-if="cp.index === summary.length - 1" class="font-normal text-slate-400"> (last)</span>
            </td>
            <td class="py-1 pr-3 text-right text-slate-400">{{ cp.accounts }}</td>
            <td class="py-1 pr-3 font-mono-premium whitespace-nowrap" :class="tighter(cp) === 'te' ? WIN : LOSE">
              {{ rangeText(cp.te) }}
            </td>
            <td class="py-1 pr-3 font-mono-premium whitespace-nowrap" :class="tighter(cp) === 'above' ? WIN : LOSE">
              +{{ rangeText(cp.aboveStart) }}
            </td>
            <td
              class="py-1 pr-3 text-right font-mono-premium text-slate-600"
              :title="cp.slope == null ? 'Needs three accounts at different starting TEs' : ''"
            >
              {{ cp.slope == null ? '—' : cp.slope.toFixed(2) }}
            </td>
            <td class="py-1 font-mono-premium text-slate-500 whitespace-nowrap">
              <b class="text-slate-700">{{ pct(cp.share.mid) }}</b>
              <span class="text-slate-400"> ({{ pct(cp.share.lo) }}–{{ pct(cp.share.hi) }})</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-1 px-1 text-[10px] text-slate-500 leading-relaxed max-w-3xl">
        Each account counts once, by its best plan at this count. <b>Slope vs start</b>: how many TE the checkpoint
        moves for each TE higher the plan starts; about 0 is the same TE whoever you are, about 1 moves with your start
        (from {{ summary[0]?.accounts ?? 0 }} accounts at most, so read it as a lean, not a law). Of the two ranges, the
        narrower is in bold: the way of stating that checkpoint that holds across accounts.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { CollectorRow } from './collector';
import { accountKey, chainFractions, summariseCheckpoints, type CheckpointSummary, type CountBest } from './analysis';
import { whoText } from '@/lib/leaderboardRank';
import { colorAt, symbolAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{
  /** Every run shown at this count. */
  rows: CollectorRow[];
  /** One run per account at this count (`bestPerCount` with stand-ins): what the summaries use. */
  bests: CountBest[];
  /** Ids of the runs whose finish still stands; the rest are drawn grey. */
  standing: ReadonlySet<string>;
  /** Account key -> colour index, so an account is the same colour on every chart on the page. */
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

type View = 'map' | 'share';
const view = ref<View>('map');
const MODES: { id: View; label: string; hint: string }[] = [
  {
    id: 'map',
    label: 'Checkpoint map',
    hint: "Each coloured stalk is one account's best plan at this count, standing at the TE the plan started from; the dots on it are its checkpoints, darker for later ones, the last one largest. A row of dots that stays level across the stalks is a checkpoint at the same TE whoever you are; a row that climbs to the right moves with your start. Small faint dots are the account's other runs that still stand. Checkpoint 1 is hollow: it is mostly timing (when the ascension in progress ends), like leg 1 below.",
  },
  {
    id: 'share',
    label: 'Share of journey',
    hint: "Each checkpoint as a share of that run's own journey, from the TE it started at to the target. One thin line per run, grey once its finish no longer stands; the thick line is the median over accounts, each counted once by its best plan. Checkpoint 1 is dashed and hollow: it is timing more than shape.",
  },
];

/** Later checkpoints darker. Neutral on purpose: every hue on this page already means an account. */
const SHADES = ['#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a'];
function shadeOf(index: number, n: number): string {
  return SHADES[n <= 1 ? SHADES.length - 1 : Math.round((index * (SHADES.length - 1)) / (n - 1))];
}

const WIN = 'font-black text-slate-800';
const LOSE = 'text-slate-400';

const summary = computed<CheckpointSummary[]>(() => summariseCheckpoints(props.bests.map(b => b.row)));

/** Which of the two ranges is narrower, or '' on a tie. */
function tighter(cp: CheckpointSummary): 'te' | 'above' | '' {
  const a = cp.te.hi - cp.te.lo;
  const b = cp.aboveStart.hi - cp.aboveStart.lo;
  return a < b ? 'te' : b < a ? 'above' : '';
}

function rangeText(r: { lo: number; hi: number }): string {
  return r.lo === r.hi ? `${r.lo}` : `${r.lo}–${r.hi}`;
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

const labelOf = (key: string, row: CollectorRow) => props.accountLabels.get(key) ?? (whoText(row) || 'anonymous');
const indexOf = (key: string) => props.accountColors.get(key) ?? 0;

/** The accounts on the chart, in colour order, for the key under it. */
const keyed = computed(() =>
  [...props.bests]
    .sort((a, b) => indexOf(a.accountKey) - indexOf(b.accountKey))
    .map(b => ({ ...b, label: labelOf(b.accountKey, b.row), color: colorAt(indexOf(b.accountKey)) }))
);

const hollow = (symbol: string) => `empty${symbol[0].toUpperCase()}${symbol.slice(1)}`;

/** What the tooltip reads off a point. */
interface Tip {
  title: string;
  line: string;
  detail: string;
}

/**
 * Which run a point is, for the tooltip. `best`: the account's best plan at this count. `stand-in`:
 * the newest run, shown because none of the account's runs here still stands. `other`: another of
 * its runs that still stands. `gone`: a run whose finish no longer stands (share view only).
 */
type Role = 'best' | 'stand-in' | 'other' | 'gone';

const ROLE_TEXT: Record<Role, string> = {
  best: "this account's best plan here",
  'stand-in': 'its newest run here (none still stands)',
  other: 'another of its runs that still stands',
  gone: 'no longer stands',
};

/** A run's role from the bests (`CountBest.standing` says whether a best is a stand-in). */
function roleOf(row: CollectorRow, bestById: ReadonlyMap<string, CountBest>): Role {
  const best = bestById.get(row.id);
  if (best) return best.standing ? 'best' : 'stand-in';
  return props.standing.has(row.id) ? 'other' : 'gone';
}

function tipFor(row: CollectorRow, i: number, key: string, role: Role): Tip {
  const te = row.chain[i];
  const share = chainFractions(row.chain, row.currentTE, row.finalTE)[i];
  return {
    title: labelOf(key, row),
    line: `checkpoint ${i + 1}: ${te} TE · +${te - row.currentTE} above its ${row.currentTE} start · ${pct(share)} of the journey`,
    detail: `${row.chain.join(' ')} · ${ROLE_TEXT[role]}`,
  };
}

function mapOption(): ChartOption {
  const n = summary.value.length;
  const bestById = new Map(props.bests.map(b => [b.row.id, b]));
  const bestIds = new Set(bestById.keys());
  const others = props.rows.filter(r => !bestIds.has(r.id) && props.standing.has(r.id));
  const series: ChartSeriesOption[] = [];
  const xs: number[] = [...props.bests.map(b => b.row.currentTE), ...others.map(r => r.currentTE)];

  // The stalks: one account's plan, first checkpoint to last, in its colour. Not in the legend.
  for (const b of props.bests) {
    const r = b.row;
    series.push({
      name: `stalk:${b.accountKey}`,
      type: 'line' as const,
      data: [
        [r.currentTE, r.chain[0]],
        [r.currentTE, r.chain[r.chain.length - 2]],
      ],
      color: colorAt(indexOf(b.accountKey)),
      symbol: 'none',
      lineStyle: { width: 3, opacity: b.standing ? 0.55 : 0.3 },
      silent: true,
      z: 1,
    });
  }

  summary.value.forEach(cp => {
    const i = cp.index;
    const last = i === n - 1;
    const name = `Checkpoint ${i + 1}${last ? ' (last)' : ''}`;
    const color = shadeOf(i, n);
    series.push({
      name,
      type: 'scatter' as const,
      color,
      z: last ? 5 : 4,
      data: [
        ...props.bests.map(b => {
          const shape = symbolAt(indexOf(b.accountKey));
          return {
            value: [b.row.currentTE, b.row.chain[i]],
            symbol: i === 0 ? hollow(shape) : shape,
            symbolSize: last ? 11 : 8,
            itemStyle: { color, borderColor: '#ffffff', borderWidth: i === 0 ? 1.5 : 1 },
            tip: tipFor(b.row, i, b.accountKey, roleOf(b.row, bestById)),
          };
        }),
        ...others.map(r => ({
          value: [r.currentTE, r.chain[i]],
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: { color, opacity: 0.35 },
          tip: tipFor(r, i, accountKey(r), 'other'),
        })),
      ] as never,
    });
    // The fitted line, only over the starts it was fitted on and only from three accounts: a trend,
    // dashed because it is a model and not a run.
    if (cp.slope != null) {
      const pts = props.bests.map(b => [b.row.currentTE, b.row.chain[i]] as const);
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const lo = Math.min(...pts.map(p => p[0]));
      const hi = Math.max(...pts.map(p => p[0]));
      series.push({
        name,
        type: 'line' as const,
        data: [
          [lo, my + cp.slope * (lo - mx)],
          [hi, my + cp.slope * (hi - mx)],
        ],
        color,
        symbol: 'none',
        lineStyle: { width: 1, type: 'dashed', opacity: 0.7 },
        silent: true,
        z: 2,
      });
    }
  });

  const pad = (v: number, step: number, dir: -1 | 1) =>
    dir < 0 ? Math.floor(v / step) * step : Math.ceil(v / step) * step;
  const xLo = xs.length ? pad(Math.min(...xs) - 3, 5, -1) : 0;
  const xHi = xs.length ? pad(Math.max(...xs) + 3, 5, 1) : 1;

  return {
    grid: { left: 54, right: 16, top: 16, bottom: 64 },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemGap: 14,
      textStyle: { fontSize: 10, color: '#64748b' },
      data: summary.value.map((cp, i) => `Checkpoint ${cp.index + 1}${i === n - 1 ? ' (last)' : ''}`),
    },
    tooltip: {
      trigger: 'item',
      formatter: raw => {
        const tip = (raw as { data?: { tip?: Tip } }).data?.tip;
        if (!tip) return '';
        // Every interpolation is escaped: the title carries a submitted nickname, which is free text,
        // and this string becomes innerHTML. See lib/charts/tooltip.ts.
        return `<b>${esc(tip.title)}</b><br/>${esc(tip.line)}<br/><span style="color:#94a3b8">${esc(tip.detail)}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'TE the plan started from',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      min: xLo,
      max: xHi,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: 'checkpoint TE',
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
}

function shareOption(): ChartOption {
  const n = summary.value.length;
  const series: ChartSeriesOption[] = [];
  // Every run is drawn here, so each says which it is: calling every standing run "this account's
  // best plan" told a player five different chains were the one best.
  const bestById = new Map(props.bests.map(b => [b.row.id, b]));
  let top = 0;
  for (const row of props.rows) {
    const key = accountKey(row);
    const index = indexOf(key);
    const fractions = chainFractions(row.chain, row.currentTE, row.finalTE);
    if (!fractions.length) continue;
    const stands = props.standing.has(row.id);
    const role = roleOf(row, bestById);
    const data = fractions.map((f, i) => {
      top = Math.max(top, f);
      return { value: [i + 1, f * 100], tip: tipFor(row, i, key, role) };
    });
    const line = {
      name: labelOf(key, row),
      type: 'line' as const,
      color: stands ? colorAt(index) : '#cbd5e1',
      symbol: symbolAt(index),
      symbolSize: 5,
      emphasis: { focus: 'series' as const },
    };
    const thin = { width: 1, opacity: stands ? 0.6 : 0.5 };
    // Checkpoint 1 on its own dashed segment with a hollow point: it is timing, not shape.
    series.push({
      ...line,
      data: [
        { ...data[0], symbol: hollow(symbolAt(index)) },
        ...(data[1] ? [{ ...data[1], symbol: 'none' }] : []),
      ] as never,
      lineStyle: { ...thin, type: 'dashed' },
    });
    if (data.length > 1) series.push({ ...line, data: data.slice(1) as never, lineStyle: thin });
  }

  const mids = summary.value.map(cp => ({
    value: [cp.index + 1, cp.share.mid * 100],
    tip: {
      title: 'Median of accounts',
      line: `checkpoint ${cp.index + 1}: ${pct(cp.share.mid)} of the journey (${pct(cp.share.lo)}–${pct(cp.share.hi)})`,
      detail: `from ${cp.accounts} account${cp.accounts === 1 ? '' : 's'}, each by its best plan here`,
    },
  }));
  const median = { name: 'Median of accounts', type: 'line' as const, color: '#0f172a', symbolSize: 7, z: 5 };
  series.push({
    ...median,
    data: [{ ...mids[0], symbol: 'emptyCircle' }, ...(mids[1] ? [{ ...mids[1], symbol: 'none' }] : [])] as never,
    lineStyle: { width: 2.5, type: 'dashed' },
  });
  if (mids.length > 1)
    series.push({ ...median, data: mids.slice(1) as never, symbol: 'circle', lineStyle: { width: 2.5 } });

  return {
    grid: { left: 54, right: 16, top: 16, bottom: 64 },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemGap: 14,
      textStyle: { fontSize: 10, color: '#64748b' },
      formatter: (name: string) => (name.length > 30 ? `${name.slice(0, 29)}…` : name),
    },
    tooltip: {
      trigger: 'item',
      formatter: raw => {
        const tip = (raw as { data?: { tip?: Tip } }).data?.tip;
        if (!tip) return '';
        return `<b>${esc(tip.title)}</b><br/>${esc(tip.line)}<br/><span style="color:#94a3b8">${esc(tip.detail)}</span>`;
      },
    },
    // Half a checkpoint of room either side, ticks and labels on the whole checkpoints only. Fixed
    // at 1 to n, a count with one checkpoint had a 1-to-1 axis that ECharts widened to 0.5-1, every
    // run on the right border; at any count the first and last markers sat on the frame.
    xAxis: {
      type: 'value',
      name: 'checkpoint',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      min: 0.5,
      max: Math.max(1, n) + 0.5,
      axisTick: { customValues: checkpointsTo(n) },
      axisLabel: { ...AXIS_LABEL, customValues: checkpointsTo(n) },
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: 'share of journey',
      nameTextStyle: AXIS_LABEL,
      min: 0,
      // Up to the data, not to 100%: the last checkpoint has never passed about 57%.
      max: Math.min(100, Math.max(10, Math.ceil((top * 100) / 10) * 10)),
      axisLabel: { ...AXIS_LABEL, formatter: '{value}%' },
      splitLine: SPLIT_LINE,
    },
    series,
  };
}

/** 1, 2, ... n: where the share view's ticks go. */
function checkpointsTo(n: number): number[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => i + 1);
}

const option = computed<ChartOption>(() => (view.value === 'map' ? mapOption() : shareOption()));
</script>
