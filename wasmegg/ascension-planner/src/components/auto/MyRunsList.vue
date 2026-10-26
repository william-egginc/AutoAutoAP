<!--
  My runs' list of the viewer's runs on the board: every kind and target, hidden ones too (tagged
  "hidden"), filtered and sorted by lib/myRuns.ts. LeaderboardPanel (mode="myruns") hands it the rows
  it already knows are the viewer's, and provides "Hide from the public" (HIDE_CONTROL), which each
  opened run's details (LeaderboardRunDetail) offer as on Compare. Nothing is fetched here.

  Above it, from 4 runs, the chip buttons (RunsExploreBar.vue, lib/runsExplore.ts, 24 Oct 2026): goal, ascensions,
  level, hours, when sent, sort and stops, each chip only for a value the runs have, remembered per account. They
  replaced the selects that folded under "Filters (n active)" on a phone. The table scrolls
  sideways inside its own box rather than break routes and dates.
-->
<template>
  <div class="space-y-3">
    <!-- The chip buttons (components/myruns/RunsExploreBar.vue, lib/runsExplore.ts): only from 4 runs. -->
    <RunsExploreBar
      v-if="barShown"
      :groups="groups"
      :sort="sel.sort"
      :stops="sel.stops"
      :shown="shown.length"
      :total="lines.length"
      :active="active"
      @toggle="(g, v) => (sel = toggleChip(sel, g, v))"
      @sort="s => (sel = { ...sel, sort: s })"
      @stops="t => (sel = { ...sel, stops: t })"
      @clear="sel = clearExplore(sel)"
    />

    <p v-if="!lines.length" class="text-body text-indigo-900/60 py-4 text-center" data-testid="my-runs-none">
      None of the runs on the Leaderboard are yours yet. Share a result from the Auto Planner and it shows up here.
    </p>
    <p
      v-else-if="!shown.length"
      class="text-body text-indigo-900/70 py-4 text-center"
      data-testid="my-runs-none-shown"
    >
      No runs match:{{ ' ' }}<button
        type="button"
        class="min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline hover:text-indigo-900"
        data-testid="my-runs-clear"
        @click="sel = clearExplore(sel)"
      >Clear filters</button>
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-small tabular-nums" data-testid="my-runs-table">
        <thead>
          <tr class="text-left label text-indigo-700/60 whitespace-nowrap">
            <th class="pr-2 py-1"></th>
            <th class="pr-3 py-1">Kind</th>
            <th class="pr-3 py-1">Route</th>
            <th class="pr-3 py-1">Result</th>
            <th class="pr-3 py-1 text-right" title="Ascensions in the route">Asc</th>
            <th class="pr-3 py-1">Awake hours</th>
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
                <span class="tabular-nums font-bold whitespace-nowrap" :class="l.hidden ? '' : 'text-slate-700'">{{
                  l.row.chain.join(' ')
                }}</span>
                <span
                  v-if="l.hidden"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-slate-200 text-small font-bold text-slate-600"
                  title="Hidden from the public: only you and the planner's maintainer see it. Open it to show it again."
                  data-testid="my-runs-hidden-tag"
                  >hidden</span
                >
                <span
                  v-if="l.maybe"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-slate-100 text-small font-bold text-slate-500"
                  title="Same timezone and gear as the save you loaded, but this browser holds no code that proves it is yours."
                  >maybe you</span
                >
                <span
                  v-if="l.copies.length > 1"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-slate-200 text-small font-bold text-slate-600"
                  :title="`The same result was sent ${l.copies.length} times. Open it for each copy and its CSV.`"
                  >sent ×{{ l.copies.length }}</span
                >
                <span
                  v-if="provisionalTag(l.row)"
                  class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-amber-50 border border-amber-300 text-small font-bold text-amber-800"
                  :title="PROVISIONAL_TITLE"
                  >{{ provisionalTag(l.row) }}</span
                >
                <!-- vs your instant baseline (lib/instantBaseline.ts): the row's own, else the one logged here. -->
                <span v-if="baselineOf(l.row)" class="block mt-1"><BaselineChip :line="baselineOf(l.row)" /></span>
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
                  class="px-2 py-0.5 rounded-md border border-slate-300 text-body font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                  :title="`Open ${l.row.chain.join(' ')} in Single run, without running it. Single run doesn't use your awake hours.`"
                  @click="emit('use', l.row.chain)"
                >
                  Use
                </button>
                <FollowButton v-if="followableRow(l.row)" class="ml-1" :chain="l.row.chain" :goal-key="boardGoalKey(l.row)" from="board"
                  :finish="boardRowSummary(l.row).finish"
                  :end-te="boardRowSummary(l.row).endTE"
                  :plan-start="boardRowSummary(l.row).planStart"
                  :deadline="boardRowSummary(l.row).deadline"
                />
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
    <p v-if="countText" class="text-small text-slate-500" data-testid="my-runs-count">{{ countText }}</p>
  </div>
</template>

<script setup lang="ts">
import FollowButton from '../FollowButton.vue';
import { boardGoalKey, boardRowSummary, followableRow } from '@/lib/follow';
import { lateMarker } from '@/lib/eggDayRule';
import { dayClockWords, dayWords } from '@/lib/eventWhen';
import { computed, inject, ref } from 'vue';
import {
  contentFingerprint,
  deadlineSpare,
  finishMs,
  foldCopies,
  madeDeadline,
  provisionalTag,
  PROVISIONAL_TITLE,
  sentMs,
  type BoardRow,
} from '@/lib/leaderboardRank';
import { runKind, type RunKind } from '@/lib/myRuns';
import {
  MIN_RUNS_FOR_BAR,
  activeCount,
  chipGroups,
  clearExplore,
  effectiveSelection,
  inExplore,
  sortExplore,
  toggleChip,
  type ExploreContext,
  type RunsExplore,
} from '@/lib/runsExplore';
import { useRunsExplore } from '@/composables/useRunsExplore';
import { hoursLabel, hoursTitle } from '@/lib/planFilters';
import { HIDE_CONTROL } from '@/lib/hiddenRuns';
import { onRowClick } from '@/lib/rowClick';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';
import RunsExploreBar from '../myruns/RunsExploreBar.vue';
import BaselineChip from '../myruns/BaselineChip.vue';
import { useBaselines } from '@/composables/useBaselines';
import { rowBackupTime, rowFoundLevel, rowGoalWords, rowRun } from '@/lib/instantBaseline';

const props = defineProps<{
  /** The viewer's runs (by /mine, or by the save's timezone and artifacts), hidden ones marked `hidden`. */
  rows: BoardRow[];
  csvRoot: string;
  /** The viewer's timezone, which every date here is in. */
  viewZone: string;
  /** Egg Day's moment (unix seconds) and year: an answer to that date is Egg Day's, the rest By a date's. */
  eggDayAt: number;
  eggDayYear: number;
  /** The account (its selection is remembered per account, lib/runsExplore.ts); none: for the visit only. */
  playerId?: string;
  /** The planner's own Fastest target: its Goal chip comes first. */
  mainTarget?: number;
  /** "Now" for the Sent chips (ms; specs), else when the list was made. */
  nowMs?: number;
  /** A selection to start from (specs; the page starts from the account's remembered one, else everything). */
  initialExplore?: Partial<RunsExplore>;
}>();
const emit = defineEmits<{ use: [chain: number[]] }>();

/** "Hide from the public", from LeaderboardPanel: a hidden run's CSV is fetched with the code. */
const hide = inject(HIDE_CONTROL, null);

const { sel } = useRunsExplore({ playerId: () => props.playerId ?? '', initial: props.initialExplore });
const madeAt = Date.now();
const ctx = computed<ExploreContext>(() => ({
  eggDayAt: props.eggDayAt,
  eggDayYear: props.eggDayYear,
  mainTarget: props.mainTarget ?? 490,
  nowMs: props.nowMs ?? madeAt,
  zone: props.viewZone,
}));

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

const lineRows = computed(() => lines.value.map(l => l.row));
/** The bar shows from `MIN_RUNS_FOR_BAR` runs; below that every run shows, best first. */
const barShown = computed(() => lines.value.length >= MIN_RUNS_FOR_BAR);
const groups = computed(() => chipGroups(lineRows.value, sel.value, ctx.value));
/** What narrows the list: only picks a shown chip carries (a remembered one for runs gone is left out). */
const applied = computed(() => effectiveSelection(lineRows.value, sel.value, ctx.value));
const active = computed(() => activeCount(applied.value));

const shown = computed(() =>
  sortExplore(
    lines.value.filter(l => inExplore(l.row, applied.value, ctx.value)),
    l => l.row,
    applied.value.sort,
    props.eggDayAt
  )
);

/**
 * What the list counts. A run is one result, however often it was sent ("sent ×2"): the header above
 * (MyRunsView, `myRunsCount`) counts the same. The sends are said only when they differ.
 */
const countText = computed(() => {
  const runs = lines.value.length;
  if (!runs) return '';
  const sends = props.rows.length;
  const sent =
    sends !== runs ? ` ${sends} sends in all: a run sent more than once is one line (sent ×n), its copies inside.` : '';
  return sent ? `${runs} ${runs === 1 ? 'run' : 'runs'}.${sent}` : '';
});

const open = ref('');
function toggle(key: string): void {
  open.value = open.value === key ? '' : key;
}

// Every date here is month first, with its year: "Feb 10, 2027" (lib/eventWhen.ts `dayWords`), and a tooltip's
// clock 12-hour: "Feb 10, 2027 at 2:36 pm". Never "10 Feb 2027" (Jordan, 24 Oct 2026).
/** "Feb 10, 2027", or '—' when unknown. */
function day(seconds: number | null | undefined, zone: string | undefined): string {
  return dayWords(seconds, zone || 'UTC') || '—';
}
/** "Feb 10, 2027 at 2:36 pm", or '' when unknown. */
function dayClock(seconds: number | null | undefined, zone: string | undefined): string {
  return dayClockWords(seconds, zone || 'UTC');
}
const msToSeconds = (ms: number | null | undefined): number | null => (ms == null ? null : ms / 1000);

function deadlineText(seconds: number): string {
  return day(seconds, props.viewZone);
}

function kindText(l: Line): string {
  if (l.kind === 'eggday') return `Egg Day ${props.eggDayYear}`;
  if (l.kind === 'dates') return `By ${deadlineText(l.row.deadline as number)}`;
  return `Fastest to ${l.row.finalTE} TE`;
}

function spareText(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 3 * 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} d`;
}

/** A date answer: the TE reached and the time to spare. A race run: when it finishes. */
function resultText(l: Line): string {
  if (l.kind === 'race') return `finishes ${day(msToSeconds(finishMs(l.row)), props.viewZone)}`;
  // Shown, marked, never followed (lib/eggDayRule.ts): "after Egg Day starts", "after your date".
  if (!madeDeadline(l.row)) return `${l.row.finalTE} TE, ${lateMarker(l.kind === 'eggday' ? 'eggday' : 'date')}`;
  return `${l.row.finalTE} TE, ${spareText(deadlineSpare(l.row))} spare`;
}

function resultTitle(l: Line): string | undefined {
  if (l.kind === 'race') {
    const text = dayClock(msToSeconds(finishMs(l.row)), l.row.timezone);
    return text ? `${text}, ${l.row.timezone || 'UTC'} time` : 'No finish date: the plan start or timezone is missing';
  }
  return `The highest TE this answer reaches by ${dayClock(l.row.deadline as number, props.viewZone) || '—'}`;
}

function sentText(r: BoardRow): string {
  const t = sentMs(r);
  return t != null ? day(t / 1000, props.viewZone) : '—';
}
function sentTitle(r: BoardRow): string | undefined {
  const t = sentMs(r);
  return t != null ? dayClock(t / 1000, props.viewZone) || undefined : undefined;
}

/** "vs your instant baseline: 1.2 days sooner (Fast)" under a run (wireframe B1); null without a baseline. */
const baselines = useBaselines();
function baselineOf(row: BoardRow) {
  return baselines.lineFor({
    goal: rowGoalWords(row),
    backupTime: rowBackupTime(row),
    run: rowRun(row),
    level: rowFoundLevel(row),
    rowBaseline: row.baseline,
  });
}
</script>
