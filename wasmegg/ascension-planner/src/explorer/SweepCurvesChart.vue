<!--
  One sweep, every account that ran it: total days against the last checkpoint.

  A sweep prices every chain in a box, so for each last checkpoint X its table knows the best chain
  that ends there. Drawn as one line per run, the lines say two things a single winner cannot: how
  flat the bottom is (a wide flat bottom means the exact checkpoint barely matters), and whether
  the bottom sits at the same X for everybody (the chain shape travels between accounts) or moves
  with gear or TE (it does not).

  The tables are the big objects on this page, so nothing is fetched until the button is pressed,
  and they are fetched one at a time.
-->
<template>
  <div class="space-y-3">
    <div v-if="groups.length" class="flex flex-wrap items-center gap-2">
      <button
        v-for="g in groups"
        :key="g.id"
        type="button"
        class="px-2.5 py-1 rounded-md text-[10px] font-black border transition-colors"
        :class="
          selected === g.id
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        "
        @click="selected = g.id"
      >
        {{ g.id }} <span class="opacity-60">· {{ g.rows.length }}</span>
      </button>
      <button
        v-if="current"
        type="button"
        class="ml-auto px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white disabled:opacity-40"
        :disabled="loading || !pending.length"
        @click="loadTables"
      >
        {{ loading ? `Loading ${progress}…` : pending.length ? `Load ${pending.length} table${pending.length === 1 ? '' : 's'}` : 'All loaded' }}
      </button>
    </div>
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No sweeps yet. An exhaustive (per-checkpoint bands) run, or an upload tagged with a preset, shows up here.
    </p>
    <p v-if="error" class="text-[11px] font-semibold text-rose-700 px-1">{{ error }}</p>

    <EChart v-if="curves.length" :option="option" height="320px" />
    <p v-else-if="current" class="px-4 py-6 text-center text-[11px] text-slate-400">
      Load the tables to draw this sweep. {{ current.rows.filter(r => !r.hasCsv).length }} of its runs have no table stored
      and cannot be drawn.
    </p>
  </div>
</template>

<script setup lang="ts">
import { describeFetchError } from '@/utils/errors';
import { computed, ref, shallowRef, watch } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import type { CollectorRow } from './collector';
import { fetchRunCsv, parseRunCsv } from './collector';
import { accountKey, sweepGroupOf } from './analysis';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

const props = defineProps<{
  base: string;
  rows: CollectorRow[];
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

const groups = computed(() => {
  const map = new Map<string, CollectorRow[]>();
  for (const r of props.rows) {
    if (r.finalTE !== 490) continue;
    const g = sweepGroupOf(r);
    if (!g) continue;
    const list = map.get(g);
    if (list) list.push(r);
    else map.set(g, [r]);
  }
  return [...map.entries()].map(([id, rows]) => ({ id, rows })).sort((a, b) => a.id.localeCompare(b.id));
});

const selected = ref('');
watch(
  groups,
  g => {
    if (!g.some(x => x.id === selected.value)) selected.value = g[0]?.id ?? '';
  },
  { immediate: true }
);
const current = computed(() => groups.value.find(g => g.id === selected.value) ?? null);

/** Per run id: best total days at each last checkpoint, sorted by checkpoint. Kept across group switches. */
const envelopes = shallowRef(new Map<string, [number, number, string][]>());
const loading = ref(false);
const progress = ref('');
const error = ref('');

const pending = computed(() => (current.value?.rows ?? []).filter(r => r.hasCsv && !envelopes.value.has(r.id)));

async function loadTables(): Promise<void> {
  loading.value = true;
  error.value = '';
  const todo = pending.value;
  const next = new Map(envelopes.value);
  try {
    for (let i = 0; i < todo.length; i++) {
      progress.value = `${i + 1} of ${todo.length}`;
      const row = todo[i];
      const parsed = parseRunCsv(await fetchRunCsv(props.base, row.id));
      // The run's own ascension count. A sweep that priced several counts would otherwise draw a
      // saw between them at every X.
      const atCount = parsed.chains.filter(c => c.prestiges === row.ascensions);
      const best = new Map<number, { days: number; chain: number[] }>();
      for (const c of atCount) {
        const prev = best.get(c.lastCheckpoint);
        if (!prev || c.days < prev.days) best.set(c.lastCheckpoint, { days: c.days, chain: c.chain });
      }
      next.set(
        row.id,
        [...best.entries()].sort(([a], [b]) => a - b).map(([x, v]) => [x, v.days, v.chain.join(' ')])
      );
      envelopes.value = new Map(next);
    }
  } catch (e) {
    error.value = describeFetchError(e, 'the collector');
  } finally {
    loading.value = false;
  }
}

const curves = computed(() =>
  (current.value?.rows ?? [])
    .filter(r => envelopes.value.has(r.id))
    .map(r => ({ row: r, points: envelopes.value.get(r.id)! }))
    .filter(c => c.points.length > 1)
);

const option = computed<ChartOption>(() => {
  const series: ChartSeriesOption[] = curves.value.map(({ row, points }, i) => {
    const key = accountKey(row);
    return {
      name: `${props.accountLabels.get(key) ?? 'run'} · from ${row.currentTE} TE · ${row.id}`,
      type: 'line' as const,
      data: points,
      color: colorAt(props.accountColors.get(key) ?? i),
      showSymbol: false,
      lineStyle: { width: 1.8 },
    };
  });
  return {
    grid: { left: 60, right: 16, top: 14, bottom: 80 },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemGap: 14,
      textStyle: { fontSize: 10, color: '#64748b' },
      formatter: (name: string) => (name.length > 40 ? `${name.slice(0, 39)}…` : name),
    },
    tooltip: {
      trigger: 'item',
      formatter: raw => {
        const params = raw as { data?: [number, number, string]; seriesName?: string };
        if (!params.data) return '';
        return `<b>${esc(params.seriesName)}</b><br/>last checkpoint ${esc(params.data[0])}: ${esc(params.data[1].toFixed(1))} d<br/><span style="color:#94a3b8">${esc(params.data[2])}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'last checkpoint (TE)',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: 'best total days',
      nameTextStyle: AXIS_LABEL,
      scale: true,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
