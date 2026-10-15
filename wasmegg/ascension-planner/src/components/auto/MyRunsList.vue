<!--
  My runs' list of the viewer's runs on the board: every kind and target, hidden ones too (tagged
  "hidden"), filtered and sorted by lib/myRuns.ts. LeaderboardPanel (mode="myruns") hands it the rows
  it already knows are the viewer's, and provides "Hide from the public" (HIDE_CONTROL), which each
  opened run's details (LeaderboardRunDetail) offer as on Compare. Nothing is fetched here.

  On a phone the filters fold under one "Filters (n active)" line; from sm up they sit inline. The
  table scrolls sideways rather than break routes and dates.
-->
<template>
  <div class="space-y-3">
    <details
      class="sm:hidden rounded-lg border border-indigo-100 bg-white/60 px-3 py-2"
      data-testid="my-runs-filters-fold"
    >
      <summary class="cursor-pointer text-[10px] font-black uppercase tracking-widest text-indigo-700">
        Filters<template v-if="active"> ({{ active }} active)</template>
      </summary>
      <MyRunsFilters v-model="filters" class="mt-2" :targets="targets" :egg-day-year="eggDayYear" />
    </details>
    <div class="hidden sm:block" data-testid="my-runs-filters-inline">
      <MyRunsFilters v-model="filters" :targets="targets" :egg-day-year="eggDayYear" />
    </div>

    <p v-if="!lines.length" class="text-[11px] text-indigo-900/60 py-4 text-center" data-testid="my-runs-none">
      None of the runs on the board are yours yet. Share a result from the Auto Planner and it shows up here.
    </p>
    <p
      v-else-if="!shown.length"
      class="text-[11px] text-indigo-900/60 py-4 text-center"
      data-testid="my-runs-none-shown"
    >
      None of your runs are in these categories.
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-[11px] tabular-nums" data-testid="my-runs-table">
        <thead>
          <tr class="text-left text-[9px] font-black uppercase tracking-widest text-indigo-700/60 whitespace-nowrap">
            <th class="pr-2 py-1"></th>
            <th class="pr-3 py-1">Kind</th>
            <th class="pr-3 py-1">Route</th>
            <th class="pr-3 py-1">Result</th>
            <th class="pr-3 py-1 text-right" title="Ascensions in the route">Asc</th>
            <th class="pr-3 py-1">Hours</th>
            <th class="pr-3 py-1">Sent</th>
            <th class="pr-3 py-1">CSV</th>
            <th class="py-1"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="l in shown" :key="l.key">
            <tr
              class="border-t border-indigo-50 align-top"
              :class="l.hidden ? 'text-slate-500' : ''"
              data-testid="my-runs-row"
            >
              <td class="pr-2 py-1.5">
                <button
                  type="button"
                  class="text-slate-400 hover:text-indigo-700"
                  :aria-expanded="open === l.key"
                  :aria-label="`Show what ${l.row.chain.join(' ')} was simulated with`"
                  @click="toggle(l.key)"
                >
                  {{ open === l.key ? '⌄' : '›' }}
                </button>
              </td>
              <td class="pr-3 py-1.5 font-bold whitespace-nowrap" :class="l.hidden ? '' : 'text-indigo-900'">
                {{ kindText(l) }}
              </td>
              <td class="pr-3 py-1.5 cursor-pointer" @click="onRowClick($event, () => toggle(l.key))">
                <span class="font-mono font-bold whitespace-nowrap" :class="l.hidden ? '' : 'text-slate-700'">{{
                  l.row.chain.join(' ')
                }}</span>
                <span
                  v-if="l.hidden"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-slate-200 text-[9px] font-black text-slate-600"
                  title="Hidden from the public: only you and the planner's maintainer see it. Open it to show it again."
                  data-testid="my-runs-hidden-tag"
                  >hidden</span
                >
                <span
                  v-if="l.maybe"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-slate-100 text-[9px] font-semibold text-slate-500"
                  title="Same timezone and gear as the save you loaded, but this browser holds no code that proves it is yours."
                  >maybe you</span
                >
                <span
                  v-if="l.copies.length > 1"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-slate-200 text-[9px] font-black text-slate-600"
                  :title="`The same result was sent ${l.copies.length} times. Open it for each copy and its CSV.`"
                  >sent ×{{ l.copies.length }}</span
                >
                <span
                  v-if="provisionalTag(l.row)"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-amber-50 border border-amber-300 text-[9px] font-black text-amber-800"
                  :title="PROVISIONAL_TITLE"
                  >{{ provisionalTag(l.row) }}</span
                >
              </td>
              <td class="pr-3 py-1.5 whitespace-nowrap" :title="resultTitle(l)">{{ resultText(l) }}</td>
              <td class="pr-3 py-1.5 text-right">{{ l.row.chain.length }}</td>
              <td class="pr-3 py-1.5 whitespace-nowrap text-slate-500" :title="hoursTitle(l.row.window)">
                {{ hoursLabel(l.row.window) }}
              </td>
              <td class="pr-3 py-1.5 whitespace-nowrap" :title="sentTitle(l.row)">{{ sentText(l.row) }}</td>
              <td class="pr-3 py-1.5 whitespace-nowrap">
                <template v-if="l.row.hasCsv && l.row.id">
                  <!-- A hidden run's plain link answers 403: fetched with this browser's code instead. -->
                  <button
                    v-if="l.hidden && hide"
                    type="button"
                    class="font-bold text-indigo-700 underline hover:text-indigo-900"
                    @click="hide.downloadCsv(l.row.id)"
                  >
                    {{ l.row.provisional ? 'CSV so far ↓' : 'CSV ↓' }}
                  </button>
                  <a
                    v-else
                    :href="`${csvRoot}?id=${encodeURIComponent(l.row.id)}`"
                    class="font-bold text-indigo-700 underline hover:text-indigo-900"
                    >{{ l.row.provisional ? 'CSV so far ↓' : 'CSV ↓' }}</a
                  >
                </template>
                <span v-else class="text-slate-300" title="Sent without a CSV">—</span>
              </td>
              <td class="py-1.5 text-right">
                <button
                  type="button"
                  class="px-2 py-0.5 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                  :title="`Put ${l.row.chain.join(' ')} into the Auto Planner and price it on your account`"
                  @click="emit('use', l.row.chain)"
                >
                  Use
                </button>
              </td>
            </tr>
            <tr v-if="open === l.key" class="bg-slate-50">
              <td colspan="9" class="px-3 py-3">
                <LeaderboardRunDetail :row="l.row" :copies="l.copies" :csv-root="csvRoot" :view-zone="viewZone" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-if="lines.length && active" class="text-[10px] text-slate-500" data-testid="my-runs-count">
      Showing {{ shown.length }} of {{ lines.length }} runs.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import {
  contentFingerprint,
  deadlineSpare,
  finishDateText,
  finishMs,
  finishTitle,
  foldCopies,
  formatDate,
  madeDeadline,
  provisionalTag,
  PROVISIONAL_TITLE,
  sentMs,
  type BoardRow,
} from '@/lib/leaderboardRank';
import {
  DEFAULT_MY_RUNS_FILTERS,
  activeFilterCount,
  inMyRunsFilters,
  raceTargets,
  runKind,
  sortMyRuns,
  type MyRunsFilters as Filters,
  type RunKind,
} from '@/lib/myRuns';
import { hoursLabel, hoursTitle } from '@/lib/planFilters';
import { HIDE_CONTROL } from '@/lib/hiddenRuns';
import { onRowClick } from '@/lib/rowClick';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';
import MyRunsFilters from './MyRunsFilters.vue';

const props = defineProps<{
  /** The viewer's runs (by /mine, or by the save's timezone and artifacts), hidden ones marked `hidden`. */
  rows: BoardRow[];
  csvRoot: string;
  /** The viewer's timezone, which every date here is in. */
  viewZone: string;
  /** Egg Day's moment (unix seconds) and year: an answer to that date is Egg Day's, the rest By a date's. */
  eggDayAt: number;
  eggDayYear: number;
  /** Filters to start from (specs; the page starts from the defaults: everything, best first). */
  initialFilters?: Partial<Filters>;
}>();
const emit = defineEmits<{ use: [chain: number[]] }>();

/** "Hide from the public", from LeaderboardPanel: a hidden run's CSV is fetched with the code. */
const hide = inject(HIDE_CONTROL, null);

const filters = ref<Filters>({ ...DEFAULT_MY_RUNS_FILTERS, ...props.initialFilters });
const active = computed(() => activeFilterCount(filters.value));
const targets = computed(() => raceTargets(props.rows));

interface Line {
  key: string;
  row: BoardRow;
  copies: BoardRow[];
  kind: RunKind;
  /** Every copy is hidden from the public. */
  hidden: boolean;
  /** Matched by timezone and artifacts only: no copy came back from /mine. */
  maybe: boolean;
}

/** One line per result: a result sent more than once shows once, its copies in its details. */
const lines = computed<Line[]>(() =>
  foldCopies(props.rows).map(f => ({
    key: f.row.id ?? contentFingerprint(f.row),
    row: f.row,
    copies: f.copies,
    kind: runKind(f.row, props.eggDayAt),
    hidden: f.copies.every(c => !!c.hidden),
    maybe: !f.copies.some(c => c.yours),
  }))
);

const shown = computed(() =>
  sortMyRuns(
    lines.value.filter(l => inMyRunsFilters(l.row, filters.value, props.eggDayAt)),
    l => l.row,
    filters.value.sort,
    props.eggDayAt
  )
);

const open = ref('');
function toggle(key: string): void {
  open.value = open.value === key ? '' : key;
}

function deadlineText(seconds: number): string {
  return formatDate(seconds * 1000, props.viewZone, { dateStyle: 'medium' });
}

function kindText(l: Line): string {
  if (l.kind === 'eggday') return `Egg Day ${props.eggDayYear}`;
  if (l.kind === 'dates') return `By ${deadlineText(l.row.deadline as number)}`;
  return `Race to ${l.row.finalTE}`;
}

function spareText(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 3 * 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} d`;
}

/** A date answer: the TE reached and the time to spare. A race run: when it finishes. */
function resultText(l: Line): string {
  if (l.kind === 'race') return `finishes ${finishDateText(finishMs(l.row), props.viewZone)}`;
  if (!madeDeadline(l.row)) return `${l.row.finalTE} TE, misses the date`;
  return `${l.row.finalTE} TE, ${spareText(deadlineSpare(l.row))} spare`;
}

function resultTitle(l: Line): string | undefined {
  if (l.kind === 'race') return finishTitle(finishMs(l.row), l.row.timezone);
  return `The highest TE this answer reaches by ${formatDate((l.row.deadline as number) * 1000, props.viewZone, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;
}

function sentText(r: BoardRow): string {
  const t = sentMs(r);
  return t != null ? formatDate(t, props.viewZone, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function sentTitle(r: BoardRow): string | undefined {
  const t = sentMs(r);
  return t != null ? formatDate(t, props.viewZone, { dateStyle: 'medium', timeStyle: 'short' }) : undefined;
}
</script>
