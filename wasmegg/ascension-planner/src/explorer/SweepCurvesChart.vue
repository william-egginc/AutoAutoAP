<!--
  One sweep, every account that ran it: how far behind the run's own best, against one checkpoint.

  A sweep prices every chain in a box, so for each TE X at a checkpoint its table knows the best
  chain that puts that checkpoint at X. Drawn as one line per run, the lines say two things a single
  winner cannot: how flat the bottom is (how many TEs there come close to the best, in days on hover
  and in the table under the chart), and whether the bottom sits at the same X for everybody (the
  chain shape travels between accounts) or moves with gear or TE (it does not). It opens on the last
  checkpoint, which is what this chart always drew; the picker moves it to any other (1st … last),
  from the same tables, so nothing is fetched again.

  WHY NOT TOTAL DAYS ON THE Y AXIS. Every point on one line is priced from one save at one start,
  so the gaps along a line are exact. The HEIGHT of a line is not: it is a total counted from that
  run's own start, and totals compare neither between accounts (gear) nor between one account's runs
  on different days (a run made a day later is a day shorter). So each line is drawn as percent
  behind its own best, which keeps both things the chart is for and drops the one it could mislead
  with. Percent rather than days so a 2-ascension run 700 days long and a 7-ascension run 500 days
  long put "1% worse" at the same height. The table under the chart is in days, each run against its
  own best: exact inside one table, and what a player weighs.

  TE OR TE ABOVE THE START. Accounts start at different TE, and a low account's first checkpoint
  sits lower. "Above start" draws each line against its table's own starting TE, so two accounts
  whose plans have the same shape relative to where they are line up.

  ZOOMED TO THE BOTTOM BY DEFAULT. Away from the bottom the lines climb to 100% and more, and on an
  axis that tall 1% is a pixel: the flat bottom, which is the whole point, disappears. So the
  default view is 0-5% with a line at 1%, and "Whole range" shows the rest. The 1% line is a scale,
  not a verdict: on plans to 490 it is a week or more, more than a 6th ascension has saved on most
  accounts, so the line and the hint say what it is in days on the runs drawn, and never that
  staying under it makes the checkpoint unimportant (the deep dive's plateau starts at 1 day for the
  same reason, and so does the table here).

  WHAT A COARSER SEARCH WOULD HAVE COST. A run whose box tried every TE at a checkpoint also holds
  every plan a coarser search would have tried: every 2nd, 5th or 10th TE, anchored at the band's
  low end as the presets are. Its best on that grid, against the full best, is exactly what the
  coarser run would have missed (sweepStats.ts `coarseStepCost`), for this checkpoint alone or for
  every checkpoint at once.

  PAST EIGHT ACCOUNTS the hues repeat, so a line takes its account's second channel all along its
  length, not just at a marker now and then: circles draw solid, triangles dashed, diamonds dotted,
  squares dash-dot (palette.ts `symbolAt`), with the shape every few checkpoints and in the tooltip.
  Two lines of one hue that cross are then still two lines.

  ONE ASCENSION COUNT AT A TIME. A preset tag can hold runs of several counts (M1 holds a partial
  6-ascension run beside the 2-ascension ones), and two counts in one chart are two different
  questions; the count picker shows up only when a group needs it.

  The tables are the big objects on this page, so nothing is fetched until the button is pressed,
  and they are fetched one at a time. Each is boiled down as it arrives (`summariseSweepRun`) and the
  chains themselves are not kept.
-->
<template>
  <div class="space-y-3">
    <!-- The names are the older shared sweeps' (the Science tab no longer asks for them); players read them as codes. -->
    <p v-if="groups.length" class="text-[11px] text-slate-500 leading-relaxed">
      Each button is a group of runs, with how many there are. Named ones are sweeps from the older shared presets (the
      Science tab no longer asks for them): the M sweeps try a grid of TEs (M2 every 2nd TE, M4 every 5th), the F
      sweeps every TE where it matters most, and the rest are sweeps players designed themselves. "2 ascensions" and the like are the other runs, grouped by ascension count.
    </p>
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
        :aria-pressed="selected === g.id"
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
          :aria-pressed="shownCount === c.ascensions"
          @click="pickedCount = c.ascensions"
        >
          {{ c.ascensions }} ascensions <span class="opacity-60">· {{ c.runs }}</span>
        </button>
      </div>
      <!-- A 2-ascension plan has one checkpoint: nothing to pick. -->
      <div v-if="checkpoints.length > 1" class="flex flex-wrap items-center gap-1.5">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Checkpoint</span>
        <button
          v-for="k in checkpoints"
          :key="k"
          type="button"
          class="px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors"
          :class="
            checkpoint === k
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          "
          :aria-pressed="checkpoint === k"
          :title="`The ${checkpointWords(k)}: the TE the plan ascends at ${k === 0 ? 'first' : `for the ${ordinalText(k + 1)} time`}`"
          @click="pickCheckpoint(k)"
        >
          {{ checkpointName(k, shownCount ?? 0) }}
        </button>
      </div>
      <div v-if="curves.length" class="flex flex-wrap items-center gap-1.5">
        <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Across</span>
        <button
          v-for="m in X_MODES"
          :key="m.id"
          type="button"
          class="px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors"
          :class="
            xMode === m.id
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          "
          :aria-pressed="xMode === m.id"
          :title="m.title"
          @click="xMode = m.id"
        >
          {{ m.label }}
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
          :aria-pressed="range === view.id"
          @click="range = view.id"
        >
          {{ view.label }}
        </button>
      </div>
    </div>
    <p v-if="error" class="text-[11px] font-semibold text-rose-700 px-1">{{ error }}</p>

    <EChart v-if="curves.length" :option="option" height="310px" />
    <!-- In HTML so every run is on screen at any width (legend.ts); each hides its line. -->
    <ChartLegend
      v-if="curves.length"
      v-model:hidden="hidden"
      :entries="legendEntries"
      label="Runs: click to hide or show"
    />
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
      ><template v-if="singlePoint"
        >; {{ singlePoint }} priced only one TE at the {{ checkpointWords(checkpoint) }}</template
      >.
    </p>
    <p v-if="curves.length" class="text-[10px] text-slate-400 leading-relaxed px-1">{{ hint }}</p>

    <!-- ------------------------------------------------------------ per run, at this checkpoint -->
    <div v-if="table.length" class="space-y-1.5">
      <div class="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Each run at the {{ checkpointWords(checkpoint) }}, in days behind its own best
        </h4>
        <div v-if="checkpoints.length > 1" class="flex items-center gap-1.5">
          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Coarser step at</span>
          <button
            v-for="s in SCOPES"
            :key="s.id"
            type="button"
            class="px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors"
            :class="
              scope === s.id
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            "
            :aria-pressed="scope === s.id"
            :title="s.title"
            @click="scope = s.id"
          >
            {{ s.id === 'here' ? `${checkpointWords(checkpoint)} only` : s.label }}
          </button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead>
            <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <th class="text-left py-1 pr-3">Run</th>
              <th
                class="text-left py-1 pr-3"
                :title="`The TE the run's best plan puts at the ${checkpointWords(checkpoint)}`"
              >
                Best {{ xMode === 'above' ? 'TE above start' : 'TE' }}
              </th>
              <th
                class="text-left py-1 pr-3"
                :title="`Every TE at the ${checkpointWords(checkpoint)} whose best plan finishes within 1 day of the run's best`"
              >
                Within 1 day
              </th>
              <th
                class="text-left py-1 pr-3"
                :title="`Every TE at the ${checkpointWords(checkpoint)} whose best plan finishes within 3 days of the run's best`"
              >
                Within 3 days
              </th>
              <th
                v-for="step in COARSE_STEPS"
                :key="step"
                class="text-right py-1 pl-3 whitespace-nowrap"
                :title="`Days the best plan on an every-${ordinalText(step)}-TE grid finishes after the run's best (${scopeWords})`"
              >
                Every {{ ordinalText(step) }} TE
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="line in table" :key="line.id" class="align-top">
              <td class="py-1.5 pr-3 whitespace-nowrap" :title="line.title">
                <span class="mr-1" :style="{ color: line.color }" aria-hidden="true">{{ line.glyph }}</span>
                <b class="text-slate-700">{{ line.label }}</b>
                <span class="text-[10px] text-slate-400">{{ ` · from ${line.currentTE} TE · ${line.id}` }}</span>
              </td>
              <td class="py-1.5 pr-3 whitespace-nowrap font-bold text-slate-700" :title="line.bestTitle">
                {{ line.bestText }}
              </td>
              <td v-for="r in line.ranges" :key="r.days" class="py-1.5 pr-3 whitespace-nowrap" :title="r.title">
                <span class="text-slate-700">{{ r.text }}</span>
                <span v-if="r.note" class="text-[10px] text-slate-400"> · {{ r.note }}</span>
              </td>
              <td
                v-for="c in line.coarse"
                :key="c.step"
                class="py-1.5 pl-3 text-right whitespace-nowrap tabular-nums"
                :class="c.none ? 'text-emerald-700 font-bold' : c.ok ? 'text-slate-700' : 'text-slate-300'"
                :title="c.title"
              >
                {{ c.text }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-[10px] text-slate-400 leading-relaxed px-1">
        Each run against its own best, inside its own table (one save), so these days are exact; they never compare one
        run's total with another's. A range with a count after it is a saw: some TEs inside it fall further behind
        (hover for which). "Box edge" means the range runs into the end of what the run tried, so it may go further. The
        coarser steps take the best plan the table holds on that grid, anchored at the low end of each band the way the
        presets are; a dash means the run's box did not try every TE there, so the coarser grid cannot be read from it.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { describeFetchError } from '@/utils/errors';
import { computed, ref, shallowRef, watch } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import { signedDays } from '@/lib/leaderboardRank';
import type { CollectorRow } from './collector';
import { fetchRunCsv } from './collector';
import { accountKey, SAME_FINISH_DAYS, sweepGroupOf } from './analysis';
import { colorAt, symbolAt, AXIS_LABEL, SPLIT_LINE, type SeriesSymbol } from './palette';
import ChartLegend from './ChartLegend.vue';
import type { LegendEntry } from './legend';
import {
  checkpointName,
  checkpointWalls,
  COARSE_STEPS,
  nearBestRange,
  parseAll,
  summariseSweepRun,
  type CoarseCost,
  type EnvelopePoint,
  type NearBestRange,
  type SweepRunStats,
} from './sweepStats';

const props = defineProps<{
  base: string;
  rows: CollectorRow[];
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

/** The default view's ceiling, in percent behind the run's best, and the reference line inside it. */
const ZOOM_PCT = 5;
const REFERENCE_PCT = 1;
/** The near-best ranges in the table, in days behind the run's own best. */
const WITHIN_DAYS = [1, 3] as const;

type Range = 'zoom' | 'whole';
const range = ref<Range>('zoom');
const VIEWS: { id: Range; label: string }[] = [
  { id: 'zoom', label: `Within ${ZOOM_PCT}%` },
  { id: 'whole', label: 'Whole range' },
];

type XMode = 'te' | 'above';
const xMode = ref<XMode>('te');
const X_MODES: { id: XMode; label: string; title: string }[] = [
  { id: 'te', label: 'TE', title: 'The TE itself' },
  {
    id: 'above',
    label: 'TE above start',
    title: "TE above the TE the run's table started from, so accounts at different TE line up",
  },
];

type Scope = 'here' | 'all';
const scope = ref<Scope>('here');
const SCOPES: { id: Scope; label: string; title: string }[] = [
  {
    id: 'here',
    label: 'this checkpoint only',
    title: 'Only the picked checkpoint on the coarser grid; the others as the run tried them',
  },
  {
    id: 'all',
    label: 'every checkpoint',
    title: 'Every checkpoint on the coarser grid at once: what a run of the same box at that step would have found',
  },
];

const ordinalText = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

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

/** The checkpoints of the shown count, 0 = first. */
const checkpoints = computed(() => Array.from({ length: Math.max(0, (shownCount.value ?? 0) - 1) }, (_, k) => k));
/** `last` until one is picked, and again whenever the pick is not a checkpoint of the shown count. */
const pickedCheckpoint = ref<number | 'last'>('last');
const checkpoint = computed(() => {
  const last = checkpoints.value.length - 1;
  const k = pickedCheckpoint.value;
  return k === 'last' || k > last ? Math.max(0, last) : k;
});
function pickCheckpoint(k: number): void {
  // The last stays "last" through a count change, as the default does.
  pickedCheckpoint.value = k === checkpoints.value.length - 1 ? 'last' : k;
}
/** `last checkpoint`, `2nd checkpoint`: what the axis, the table and the notes call it. */
function checkpointWords(k: number): string {
  return `${checkpointName(k, shownCount.value ?? 0)} checkpoint`;
}

/** Per run id: its table boiled down (`summariseSweepRun`), or null when it held no plan of the
 *  run's count. Kept across group switches. */
const stats = shallowRef(new Map<string, SweepRunStats | null>());
const loading = ref(false);
const progress = ref('');
const error = ref('');

const pending = computed(() => shownRows.value.filter(r => r.hasCsv && !stats.value.has(r.id)));

async function loadTables(): Promise<void> {
  loading.value = true;
  error.value = '';
  const todo = pending.value;
  const next = new Map(stats.value);
  try {
    for (let i = 0; i < todo.length; i++) {
      progress.value = `${i + 1} of ${todo.length}`;
      const row = todo[i];
      // Every chain, not the fastest 60,000: "Whole range" draws the slow tail too.
      next.set(row.id, summariseSweepRun(parseAll(await fetchRunCsv(props.base, row.id)), row));
      stats.value = new Map(next);
    }
  } catch (e) {
    error.value = describeFetchError(e, 'the collector');
  } finally {
    loading.value = false;
  }
}

/** Each drawn run at the picked checkpoint: its envelope there, its colour and shape, its name. */
const curves = computed(() =>
  shownRows.value.flatMap((row, i) => {
    const s = stats.value.get(row.id);
    const points = s?.envelopes[checkpoint.value] ?? [];
    if (!s || points.length < 2) return [];
    const key = accountKey(row);
    const index = props.accountColors.get(key) ?? i;
    const label = props.accountLabels.get(key) ?? 'run';
    return [{ row, stats: s, points, index, symbol: symbolAt(index), label }];
  })
);
const singlePoint = computed(
  () =>
    shownRows.value.filter(r => {
      if (!stats.value.has(r.id)) return false;
      return (stats.value.get(r.id)?.envelopes[checkpoint.value]?.length ?? 0) <= 1;
    }).length
);

/** The x of a TE: itself, or above the run's own starting TE. */
function xOf(te: number, s: SweepRunStats): number {
  return xMode.value === 'above' ? te - s.currentTE : te;
}
/** A TE as the x toggle shows it: `283`, or `+151` above the start. */
function teText(te: number, s: SweepRunStats): string {
  return xMode.value === 'above' ? `+${te - s.currentTE}` : String(te);
}

/** What the reference line comes to in days on the runs drawn, e.g. `7–9 days`; '' with none. */
const referenceDays = computed(() => {
  const bests = curves.value.map(c => c.stats.bestDays);
  if (!bests.length) return '';
  const lo = Math.round((Math.min(...bests) * REFERENCE_PCT) / 100);
  const hi = Math.round((Math.max(...bests) * REFERENCE_PCT) / 100);
  return lo === hi ? `${lo} days` : `${lo}–${hi} days`;
});

const hint = computed(() =>
  range.value === 'zoom'
    ? `Zoomed to the plans within ${ZOOM_PCT}% of each run's best. The dashed line is ${REFERENCE_PCT}%, which on the runs drawn is ${referenceDays.value}: more than a 6th ascension has saved on most accounts, so a line under it can still be days behind. A wide flat bottom means many TEs at the ${checkpointWords(checkpoint.value)} come close; hover or tap anywhere for every run's gap there in days.`
    : `Every TE each table priced at the ${checkpointWords(checkpoint.value)}. Far from the bottom the lines climb steeply, which is why the default view is zoomed in.`
);

/** One point: [x, % behind the run's best, chain, plan days, the run's best days, TE]. */
type Datum = [number, number, string, number, number, number];

/** A marker every this many checkpoints on a line whose account has run out of hues. */
const MARKER_EVERY = 8;

/** Each marker shape's line pattern, so an account past the eighth differs all along its line. */
const DASH: Record<SeriesSymbol, 'solid' | 'dashed' | 'dotted' | number[]> = {
  circle: 'solid',
  triangle: 'dashed',
  diamond: 'dotted',
  rect: [8, 3, 2, 3],
};

/** The same shapes as text, for the tooltip and the table. */
const GLYPH: Record<SeriesSymbol, string> = { circle: '●', triangle: '▲', diamond: '◆', rect: '■' };

/** Half the widest gap between two TEs a line priced: how far off the pointer its nearest point can
 *  honestly be (a box at every 10th TE answers from 5 away), and never less than 5. */
function reachOf(points: readonly EnvelopePoint[]): number {
  let gap = 0;
  for (let i = 1; i < points.length; i++) gap = Math.max(gap, points[i].te - points[i - 1].te);
  return Math.max(5, gap / 2);
}

const seriesName = (c: (typeof curves.value)[number]) => `${c.label} · from ${c.stats.currentTE} TE · ${c.row.id}`;

/** Runs the legend has turned off, by run id. */
const hidden = ref<ReadonlySet<string>>(new Set());

/** The line pattern each shape draws, as the legend's mark says it. */
const LEGEND_LINE: Record<SeriesSymbol, 'solid' | 'dashed' | 'dotted' | 'dashdot'> = {
  circle: 'solid',
  triangle: 'dashed',
  diamond: 'dotted',
  rect: 'dashdot',
};

/** One entry per run drawn, in its account's colour, shape and line pattern. */
const legendEntries = computed<LegendEntry[]>(() =>
  curves.value.map(c => ({
    id: c.row.id,
    label: c.label,
    note: ` · from ${c.stats.currentTE} TE · ${c.row.id}`,
    index: c.index,
    line: LEGEND_LINE[c.symbol],
  }))
);

const option = computed<ChartOption>(() => {
  const zoomed = range.value === 'zoom';
  const above = xMode.value === 'above';
  let lo = Infinity;
  let hi = -Infinity;
  const glyphs: string[] = [];
  const reach: number[] = [];
  // A run the legend turned off is left out of the lines and of the axis range, but keeps its place
  // in the colour order.
  const drawn = curves.value.filter(c => !hidden.value.has(c.row.id));
  const series: ChartSeriesOption[] = drawn.map(c => {
    const { stats: s, points, index, symbol } = c;
    // One table, one save: the gap to this run's own best is exact, whatever the account or date.
    const best = s.bestDays;
    const data = points.map((p): Datum => {
      const x = xOf(p.te, s);
      const pct = (p.days / best - 1) * 100;
      if (pct <= ZOOM_PCT) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      return [x, pct, p.chain.join(' '), p.days, best, p.te];
    });
    // Past eight accounts the hue repeats; a line of that account carries its own dash pattern all
    // along it and its marker shape every few checkpoints, which a solid line of the same hue does not.
    const marked = index >= 8;
    glyphs.push(GLYPH[symbol]);
    reach.push(reachOf(points));
    return {
      name: seriesName(c),
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
  // The reference line on a series of its own, so it stays whichever runs the legend hides.
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
  // Zoomed, x narrows to the TEs some run reaches within the ceiling, plus a margin, out to a round
  // step that is also the tick interval, so the axis labels are round and evenly spaced.
  const narrow = zoomed && lo <= hi;
  const pad = Math.max(5, (hi - lo) * 0.1);
  const rough = (hi - lo + 2 * pad) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find(m => m * magnitude >= rough) ?? 10) * magnitude;
  const xMin = Math.floor((lo - pad) / step) * step;
  const xMax = Math.ceil((hi + pad) / step) * step;
  const where = checkpointWords(checkpoint.value);
  const lastOnly = checkpoints.value.length > 0 && checkpoint.value === checkpoints.value.length - 1;

  return {
    grid: { left: 52, right: 16, top: 18, bottom: 40 },
    tooltip: {
      confine: true,
      extraCssText: 'max-width: min(320px, 86vw); white-space: normal;',
      // By axis, not by item: these lines draw no points, and an item tooltip needs a point under
      // the pointer. The axis finds each run's nearest TE to wherever the pointer is.
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
          .filter(p => Array.isArray(p.value) && Math.abs(p.value[0] - at) <= (reach[p.seriesIndex ?? -1] ?? 5))
          .sort((a, b) => a.value![1] - b.value![1])
          .map(p => {
            const [x, pct, chain, days, best, te] = p.value!;
            const behind =
              days - best < SAME_FINISH_DAYS
                ? "this run's best"
                : `${pct.toFixed(2)}% behind (+${days - best < 0.01 ? '<0.01' : (days - best).toFixed(2)} d)`;
            const place = above ? `+${x} (${te} TE)` : `${te}`;
            // The account's shape, not a plain dot: past eight accounts two runs share a colour.
            const glyph = glyphs[p.seriesIndex ?? -1] ?? '●';
            return `<span style="color:${esc(p.color)}">${esc(glyph)}</span> ${esc(p.seriesName)}<br/>&nbsp;&nbsp;&nbsp;at ${esc(place)}: ${esc(behind)} <span style="color:#94a3b8">${esc(chain)}</span>`;
          });
        if (!rows.length) return '';
        const head = above ? `${where}, ${Math.round(at)} TE above start` : `${where} ${Math.round(at)}`;
        return `<b>${esc(head)}</b><br/>${rows.join('<br/>')}`;
      },
    },
    xAxis: {
      type: 'value',
      name: above
        ? `${where}, TE above the run's starting TE`
        : lastOnly
          ? 'last checkpoint before 490 (TE)'
          : `${where} (TE)`,
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: AXIS_LABEL,
      scale: true,
      ...(narrow ? { min: xMin, max: xMax, interval: step } : {}),
      axisLabel: above ? { ...AXIS_LABEL, formatter: (v: number) => (v > 0 ? `+${v}` : String(v)) } : AXIS_LABEL,
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

/* ------------------------------------------------------------------ the table under the chart */

/** Days as the table shows them: two decimals under a day, one above. */
const daysText = (d: number) => signedDays(d);

const scopeWords = computed(() =>
  scope.value === 'all' || checkpoints.value.length <= 1
    ? 'every checkpoint on the grid'
    : `only the ${checkpointWords(checkpoint.value)} on the grid, the others as the run tried them`
);

function rangeCell(r: NearBestRange | null, days: number, s: SweepRunStats, where: string) {
  if (!r) return { days, text: '—', note: '', title: '' };
  const f = (te: number) => teText(te, s);
  const text = r.lo === r.hi ? `${f(r.lo)} only` : `${f(r.lo)}–${f(r.hi)}`;
  const edges = [r.loEdge ? 'low' : '', r.hiEdge ? 'high' : ''].filter(Boolean);
  const notes = [r.gaps.length ? `${r.within} of ${r.priced}` : '', edges.length ? 'box edge' : ''].filter(Boolean);
  const title = [
    r.lo === r.hi
      ? `Only ${r.lo} TE at the ${where} comes within ${days} day${days === 1 ? '' : 's'} of this run's best: every other TE it tried there is further behind.`
      : `From ${r.lo} to ${r.hi} TE at the ${where}, ${r.within} of the ${r.priced} TEs this run tried come within ${days} day${days === 1 ? '' : 's'} of its best.`,
    r.gaps.length
      ? `Not ${r.gaps.join(', ')}. Unbroken around the best: ${r.stretch[0] === r.stretch[1] ? `${r.stretch[0]} only` : `${r.stretch[0]}–${r.stretch[1]}`}.`
      : '',
    edges.length
      ? `The range runs into the ${edges.join(' and the ')} end of what this run tried there, so it may go further.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { days, text, note: notes.join(' · '), title };
}

function coarseCell(c: CoarseCost, s: SweepRunStats, where: string) {
  if (!c.ok) return { step: c.step, ok: false, none: false, text: '—', title: c.why };
  const none = c.lost < SAME_FINISH_DAYS;
  const grid = scope.value === 'all' || checkpoints.value.length <= 1 ? 'at every checkpoint' : `at the ${where}`;
  const title = `Trying only every ${ordinalText(c.step)} TE ${grid}, from the low end of the band as the presets do: ${c.tried.toLocaleString('en-US')} of the ${s.plans.toLocaleString('en-US')} plans in this table. ${
    none
      ? `Its best plan, ${c.chain.join(' ')}, is this run's best: the grid happens to hold it.`
      : `Its best plan, ${c.chain.join(' ')}, finishes ${c.lost.toFixed(2)} days after this run's best.`
  }`;
  return { step: c.step, ok: true, none, text: none ? 'none' : daysText(c.lost), title };
}

const table = computed(() => {
  const k = checkpoint.value;
  const where = checkpointWords(k);
  return curves.value.map(c => {
    const s = c.stats;
    const env = c.points;
    const walls = checkpointWalls(s.currentTE, s.finalTE, s.ascensions, k);
    const bestTE = s.bestChain[k];
    const coarse = scope.value === 'all' ? s.coarseAll : (s.coarseAt[k] ?? []);
    return {
      id: c.row.id,
      label: c.label,
      color: colorAt(c.index),
      glyph: GLYPH[c.symbol],
      currentTE: s.currentTE,
      title: `${seriesName(c)}: ${s.plans.toLocaleString('en-US')} plans of ${s.ascensions} ascensions in its table`,
      bestText: teText(bestTE, s),
      bestTitle: `Best plan ${s.bestChain.join(' ')}: ${bestTE} TE at the ${where}, ${bestTE - s.currentTE} above the ${s.currentTE} TE the run started from. ${s.bestDays.toFixed(2)} days from this run's own start.`,
      ranges: WITHIN_DAYS.map(d => rangeCell(nearBestRange(env, d, walls.floor, walls.ceiling), d, s, where)),
      coarse: coarse.map(cost => coarseCell(cost, s, where)),
    };
  });
});
</script>
