<!--
  One sweep, every account that ran it: how far behind the run's own best, against the last
  checkpoint.

  A sweep prices every chain in a box, so for each last checkpoint X its table knows the best chain
  that ends there. Drawn as one line per run, the lines say two things a single winner cannot: how
  flat the bottom is (how many last checkpoints come close to the best, in days on hover), and
  whether the bottom sits at the same X for everybody (the chain shape travels between accounts) or
  moves with gear or TE (it does not).

  WHY NOT TOTAL DAYS ON THE Y AXIS. Every point on one line is priced from one save at one start,
  so the gaps along a line are exact. The HEIGHT of a line is not: it is a total counted from that
  run's own start, and totals compare neither between accounts (gear) nor between one account's runs
  on different days (a run made a day later is a day shorter). So each line is drawn as percent
  behind its own best, which keeps both things the chart is for and drops the one it could mislead
  with. Percent rather than days so a 2-ascension run 700 days long and a 7-ascension run 500 days
  long put "1% worse" at the same height.

  ZOOMED TO THE BOTTOM BY DEFAULT. Away from the bottom the lines climb to 100% and more, and on an
  axis that tall 1% is a pixel: the flat bottom, which is the whole point, disappears. So the
  default view is 0-5% with a line at 1%, and "Whole range" shows the rest. The 1% line is a scale,
  not a verdict: on plans to 490 it is a week or more, more than a 6th ascension has saved on most
  accounts, so the line and the hint say what it is in days on the runs drawn, and never that
  staying under it makes the checkpoint unimportant (the deep dive's plateau starts at 1 day for the
  same reason).

  PAST EIGHT ACCOUNTS the hues repeat, so a line takes its account's second channel all along its
  length, not just at a marker now and then: circles draw solid, triangles dashed, diamonds dotted,
  squares dash-dot (palette.ts `symbolAt`), with the shape every few checkpoints and in the tooltip.
  Two lines of one hue that cross are then still two lines.

  ONE ASCENSION COUNT AT A TIME. A preset tag can hold runs of several counts (M1 holds a partial
  6-ascension run beside the 2-ascension ones), and two counts in one chart are two different
  questions; the count picker shows up only when a group needs it.

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
        :title="
          g.withTable === g.rows.length
            ? `${g.rows.length} run${g.rows.length === 1 ? '' : 's'}, each with a table stored`
            : `${g.withTable} of ${g.rows.length} runs have a table stored and can be drawn`
        "
        @click="selected = g.id"
      >
        {{ g.id }}
        <span class="opacity-60"
          >· {{ g.withTable === g.rows.length ? g.rows.length : `${g.withTable}/${g.rows.length}` }}</span
        >
      </button>
      <button
        v-if="current"
        type="button"
        class="ml-auto px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white disabled:opacity-40"
        :disabled="loading || !pending.length"
        @click="loadTables"
      >
        {{
          loading
            ? `Loading ${progress}…`
            : pending.length
              ? `Load ${pending.length} table${pending.length === 1 ? '' : 's'}`
              : 'All loaded'
        }}
      </button>
    </div>
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No sweeps yet. An exhaustive (per-checkpoint bands) run, or an upload tagged with a preset, shows up here.
    </p>

    <div v-if="current" class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <!-- Only when the group mixes counts: one count is one question. -->
      <div v-if="counts.length > 1" class="flex flex-wrap items-center gap-1.5">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plans with</span>
        <button
          v-for="c in counts"
          :key="c.ascensions"
          type="button"
          class="px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors"
          :class="
            shownCount === c.ascensions
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          "
          @click="pickedCount = c.ascensions"
        >
          {{ c.ascensions }} ascensions <span class="opacity-60">· {{ c.runs }}</span>
        </button>
      </div>
      <div v-if="curves.length" class="flex gap-1.5">
        <button
          v-for="view in VIEWS"
          :key="view.id"
          type="button"
          class="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
          :class="
            range === view.id
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          "
          @click="range = view.id"
        >
          {{ view.label }}
        </button>
      </div>
    </div>
    <p v-if="error" class="text-[11px] font-semibold text-rose-700 px-1">{{ error }}</p>

    <EChart v-if="curves.length" :option="option" height="340px" />
    <p v-else-if="current" class="px-4 py-6 text-center text-[11px] text-slate-400">
      Load the tables to draw this sweep.
      <template v-if="noTable">
        {{ noTable }} of its {{ shownRows.length }} runs {{ noTable === 1 ? 'has' : 'have' }} no table stored and cannot
        be drawn.
      </template>
    </p>
    <p v-if="curves.length && curves.length < shownRows.length" class="text-[10px] text-slate-500 px-1">
      {{ curves.length }} of {{ shownRows.length }} runs drawn<template v-if="noTable"
        >; {{ noTable }} {{ noTable === 1 ? 'has' : 'have' }} no table stored</template
      ><template v-if="pending.length">; {{ pending.length }} not loaded yet</template
      ><template v-if="singlePoint">; {{ singlePoint }} priced only one last checkpoint</template>.
    </p>
    <p v-if="curves.length" class="text-[10px] text-slate-400 leading-relaxed px-1">{{ hint }}</p>
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
import { accountKey, SAME_FINISH_DAYS, sweepGroupOf } from './analysis';
import { colorAt, symbolAt, AXIS_LABEL, SPLIT_LINE, type SeriesSymbol } from './palette';

const props = defineProps<{
  base: string;
  rows: CollectorRow[];
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

/** The default view's ceiling, in percent behind the run's best, and the reference line inside it. */
const ZOOM_PCT = 5;
const REFERENCE_PCT = 1;

type Range = 'zoom' | 'whole';
const range = ref<Range>('zoom');
const VIEWS: { id: Range; label: string }[] = [
  { id: 'zoom', label: `Within ${ZOOM_PCT}%` },
  { id: 'whole', label: 'Whole range' },
];

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
  return [...map.entries()]
    .map(([id, rows]) => ({ id, rows, withTable: rows.filter(r => r.hasCsv).length }))
    .sort((a, b) => a.id.localeCompare(b.id));
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

/** Ascension counts in the selected group, most runs first. */
const counts = computed(() => {
  const tally = new Map<number, number>();
  for (const r of current.value?.rows ?? []) tally.set(r.ascensions, (tally.get(r.ascensions) ?? 0) + 1);
  return [...tally.entries()]
    .map(([ascensions, runs]) => ({ ascensions, runs }))
    .sort((a, b) => b.runs - a.runs || a.ascensions - b.ascensions);
});
const pickedCount = ref<number | null>(null);
/** The picked count while the group has it, else the group's most common count. */
const shownCount = computed(() =>
  counts.value.some(c => c.ascensions === pickedCount.value) ? pickedCount.value : (counts.value[0]?.ascensions ?? null)
);
const shownRows = computed(() => (current.value?.rows ?? []).filter(r => r.ascensions === shownCount.value));
const noTable = computed(() => shownRows.value.filter(r => !r.hasCsv).length);

/** Per run id: best total days at each last checkpoint, sorted by checkpoint; drawn as the gap to the
 *  run's own best. Kept across group switches. */
const envelopes = shallowRef(new Map<string, [number, number, string][]>());
const loading = ref(false);
const progress = ref('');
const error = ref('');

const pending = computed(() => shownRows.value.filter(r => r.hasCsv && !envelopes.value.has(r.id)));

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
  shownRows.value
    .filter(r => envelopes.value.has(r.id))
    .map(r => ({ row: r, points: envelopes.value.get(r.id)! }))
    .filter(c => c.points.length > 1)
);
const singlePoint = computed(
  () => shownRows.value.filter(r => (envelopes.value.get(r.id)?.length ?? Infinity) <= 1).length
);

/** What the reference line comes to in days on the runs drawn, e.g. `7–9 days`; '' with none. */
const referenceDays = computed(() => {
  const bests = curves.value.map(c => c.points.reduce((m, p) => Math.min(m, p[1]), Infinity));
  if (!bests.length) return '';
  const lo = Math.round((Math.min(...bests) * REFERENCE_PCT) / 100);
  const hi = Math.round((Math.max(...bests) * REFERENCE_PCT) / 100);
  return lo === hi ? `${lo} days` : `${lo}–${hi} days`;
});

const hint = computed(() =>
  range.value === 'zoom'
    ? `Zoomed to the plans within ${ZOOM_PCT}% of each run's best. The dashed line is ${REFERENCE_PCT}%, which on the runs drawn is ${referenceDays.value}: more than a 6th ascension has saved on most accounts, so a line under it can still be days behind. A wide flat bottom means many last checkpoints come close; hover anywhere for every run's gap at that checkpoint in days.`
    : 'Every last checkpoint each table priced. Far from the bottom the lines climb steeply, which is why the default view is zoomed in.'
);

/** One point: [last checkpoint, % behind the run's best, chain, plan days, the run's best days]. */
type Datum = [number, number, string, number, number];

/** A marker every this many checkpoints on a line whose account has run out of hues. */
const MARKER_EVERY = 8;

/** Each marker shape's line pattern, so an account past the eighth differs all along its line. */
const DASH: Record<SeriesSymbol, 'solid' | 'dashed' | 'dotted' | number[]> = {
  circle: 'solid',
  triangle: 'dashed',
  diamond: 'dotted',
  rect: [8, 3, 2, 3],
};

/** The same shapes as text, for the tooltip. */
const GLYPH: Record<SeriesSymbol, string> = { circle: '●', triangle: '▲', diamond: '◆', rect: '■' };

const option = computed<ChartOption>(() => {
  const zoomed = range.value === 'zoom';
  let lo = Infinity;
  let hi = -Infinity;
  const glyphs: string[] = [];
  const series: ChartSeriesOption[] = curves.value.map(({ row, points }, i) => {
    const key = accountKey(row);
    const index = props.accountColors.get(key) ?? i;
    const symbol = symbolAt(index);
    // One table, one save: the gap to this run's own best is exact, whatever the account or date.
    let best = Infinity;
    for (const [, days] of points) if (days < best) best = days;
    const data = points.map(([x, days, chain]): Datum => {
      const pct = (days / best - 1) * 100;
      if (pct <= ZOOM_PCT) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      return [x, pct, chain, days, best];
    });
    // Past eight accounts the hue repeats; a line of that account carries its own dash pattern all
    // along it and its marker shape every few checkpoints, which a solid line of the same hue does not.
    const marked = index >= 8;
    glyphs.push(GLYPH[symbol]);
    return {
      name: `${props.accountLabels.get(key) ?? 'run'} · from ${row.currentTE} TE · ${row.id}`,
      type: 'line' as const,
      data: marked ? data.map((value, j) => ({ value, symbol: j % MARKER_EVERY === 0 ? symbol : 'none' })) : data,
      color: colorAt(index),
      symbol,
      symbolSize: 6,
      showSymbol: marked,
      lineStyle: { width: 1.8, type: DASH[symbol] },
      emphasis: { focus: 'series' as const },
    };
  });
  const runNames = series.map(s => String(s.name));
  // The reference line on a series of its own, so hiding a run in the legend does not take it too.
  series.push({
    name: `${REFERENCE_PCT}% line`,
    type: 'line' as const,
    data: [],
    // Over the runs, so its label is not crossed out by a line that dips under it at the right edge.
    z: 5,
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#64748b', type: 'dashed', width: 1 },
      // What 1% is in days on these runs, on the line itself: a percent alone reads smaller than it is.
      label: {
        formatter: `${REFERENCE_PCT}% ≈ ${referenceDays.value.replace(' days', ' d')}`,
        color: '#64748b',
        fontSize: 10,
        position: 'insideEndTop',
        backgroundColor: 'rgba(255,255,255,0.85)',
        padding: [1, 3],
      },
      data: [{ yAxis: REFERENCE_PCT }],
    },
  });
  // Zoomed, x narrows to the checkpoints some run reaches within the ceiling, plus a margin, out to a
  // round step that is also the tick interval, so the axis labels are round and evenly spaced.
  const narrow = zoomed && lo <= hi;
  const pad = Math.max(5, (hi - lo) * 0.1);
  const rough = (hi - lo + 2 * pad) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find(m => m * magnitude >= rough) ?? 10) * magnitude;
  const xMin = Math.floor((lo - pad) / step) * step;
  const xMax = Math.ceil((hi + pad) / step) * step;

  return {
    grid: { left: 52, right: 16, top: 18, bottom: 80 },
    legend: {
      type: 'scroll',
      bottom: 0,
      itemGap: 14,
      textStyle: { fontSize: 10, color: '#64748b' },
      data: runNames,
      formatter: (name: string) => (name.length > 40 ? `${name.slice(0, 39)}…` : name),
    },
    tooltip: {
      confine: true,
      // By axis, not by item: these lines draw no points, and an item tooltip needs a point under
      // the pointer. The axis finds each run's nearest checkpoint to wherever the pointer is.
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1' } },
      formatter: raw => {
        const list = (Array.isArray(raw) ? raw : [raw]) as {
          value?: Datum;
          seriesName?: string;
          seriesIndex?: number;
          color?: string;
          axisValue?: number;
        }[];
        const at = Number(list[0]?.axisValue);
        const rows = list
          // A run whose table stops short of the pointer answers with its end point; leave it out.
          .filter(p => Array.isArray(p.value) && Math.abs(p.value[0] - at) <= 5)
          .sort((a, b) => a.value![1] - b.value![1])
          .map(p => {
            const [x, pct, chain, days, best] = p.value!;
            const behind =
              days - best < SAME_FINISH_DAYS
                ? "this run's best"
                : `${pct.toFixed(2)}% behind (+${days - best < 0.01 ? '<0.01' : (days - best).toFixed(2)} d)`;
            // The account's shape, not a plain dot: past eight accounts two runs share a colour.
            const glyph = glyphs[p.seriesIndex ?? -1] ?? '●';
            return `<span style="color:${esc(p.color)}">${esc(glyph)}</span> ${esc(p.seriesName)}<br/>&nbsp;&nbsp;&nbsp;at ${esc(x)}: ${esc(behind)} <span style="color:#94a3b8">${esc(chain)}</span>`;
          });
        if (!rows.length) return '';
        return `<b>last checkpoint ${esc(Math.round(at))}</b><br/>${rows.join('<br/>')}`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'last checkpoint before 490 (TE)',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      scale: true,
      ...(narrow ? { min: xMin, max: xMax, interval: step } : {}),
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      name: "% behind this run's best",
      nameTextStyle: AXIS_LABEL,
      min: 0,
      ...(zoomed ? { max: ZOOM_PCT, interval: 1 } : {}),
      axisLabel: { ...AXIS_LABEL, formatter: '{value}%' },
      splitLine: SPLIT_LINE,
    },
    series,
  };
});
</script>
