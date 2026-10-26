<!--
  "Your routes at a glance" (Q9, 18 Oct 2026; a heat map since 26 Oct): the account's routes, one goal at a time,
  from what My runs already holds (the board rows LeaderboardPanel hands up, the runs and answers saved on this
  device). Nothing is fetched or priced (lib/routeScatter.ts gathers, lib/heatBins.ts bins). No chart library.

  Across: ascensions, one column per count. Up: a Fastest goal's finish date, a date goal's TE, in bins, lowest
  at the bottom. A cell's colour is how many routes it holds (one blue, light to dark, with its legend); the
  goal's best is starred and outlined. The legend's level chips switch which levels' routes are counted.

  Each cell with routes is a button (aria-label "N routes, best 226 → 277 → 490; ..."), at least 28 px tall:
  smaller than the 44 px rule, since 12 columns must fit a 390 px phone, so the line under the map is the main
  reader. Pointing at a cell (desktop), tapping it or focusing it fills that line; a tap keeps it until tapped
  again or cleared. The summary sentence and "The same routes as a list" carry the same data without the map.
  Folded; closed on a phone.
-->
<template>
  <details
    :open="open"
    class="rounded-2xl border border-slate-200 bg-white p-4"
    data-testid="my-runs-scatter"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary class="cursor-pointer text-[11px] font-black uppercase tracking-widest text-slate-500">
      Your routes at a glance<span class="ml-2 font-semibold normal-case tracking-normal text-slate-500">{{
        countWords
      }}</span>
    </summary>

    <div class="mt-3 space-y-2">
      <p v-if="!built.goals.length" class="text-[12px] text-slate-600" data-testid="my-runs-scatter-empty">
        {{
          boardFailed
            ? boardErrorText(boardFailed, 'myruns')
            : rows === null && !savedCount
            ? 'Your runs are still loading.'
            : 'No routes of yours yet: runs you send or save show here.'
        }}
      </p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]" data-testid="my-runs-scatter-controls">
          <label class="flex items-center gap-1.5">
            <span class="text-slate-500">Goal</span>
            <select
              v-model="goalKey"
              class="min-h-[44px] rounded-lg border-slate-200 py-1 pl-2 pr-7 text-[12px] font-bold text-slate-700 sm:min-h-0"
              data-testid="my-runs-scatter-goal"
            >
              <option v-for="g in built.goals" :key="g.key" :value="g.key">{{ g.label }} ({{ g.count }})</option>
            </select>
          </label>
        </div>

        <p class="text-[12px] text-slate-700 leading-relaxed" data-testid="my-runs-scatter-summary">
          {{ heat.empty ? emptyText : summary }}
        </p>

        <div v-if="!heat.empty" data-testid="my-runs-scatter-plot">
          <!-- The map: a CSS grid, y labels in the first column, the highest bin on top. -->
          <div
            role="group"
            :aria-label="`Heat map: ${Y_TITLE[scale]} up, ascensions across. ${summary}`"
            class="grid max-w-3xl gap-[2px] sm:gap-[3px]"
            :style="{ gridTemplateColumns: `auto repeat(${heat.cols.length}, minmax(0, 1fr))` }"
            data-testid="my-runs-heat"
            @mouseleave="!pinned && (sel = null)"
            @keydown.esc="clearSel"
          >
            <span class="col-span-full pb-1 text-[10px] font-bold text-slate-500" data-testid="my-runs-heat-ytitle">{{
              Y_TITLE[scale]
            }}</span>
            <template v-for="ri in rowOrder" :key="`r${ri}`">
              <span
                class="flex max-w-[4.75rem] items-center justify-end pr-1 text-right text-[10px] leading-tight text-slate-500 sm:max-w-none sm:pr-2"
                style="font-variant-numeric: tabular-nums"
                data-testid="my-runs-heat-ylabel"
                >{{ heat.rows[ri].label }}</span
              >
              <template v-for="c in heat.cells[ri]" :key="`c${ri}-${c.col}`">
                <button
                  v-if="c.count"
                  type="button"
                  class="relative flex min-h-[28px] items-center justify-center rounded-[3px] text-[10px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 sm:min-h-[34px] sm:text-[11px]"
                  :class="[
                    isBest(c) ? 'outline outline-2 outline-offset-[-2px] outline-[#0b0b0b]' : '',
                    isSel(c) ? 'ring-2 ring-indigo-500 ring-offset-1' : '',
                  ]"
                  :style="cellStyle(c.count)"
                  :aria-label="cellWords(c)"
                  :title="cellWords(c)"
                  :aria-pressed="pinned && isSel(c)"
                  :data-testid="isBest(c) ? 'my-runs-heat-best' : 'my-runs-heat-cell'"
                  :data-count="c.count"
                  @mouseenter="!pinned && (sel = { row: c.row, col: c.col })"
                  @focus="!pinned && (sel = { row: c.row, col: c.col })"
                  @click="tap(c.row, c.col)"
                >
                  <span v-if="isBest(c)" aria-hidden="true" class="mr-0.5">★</span>{{ c.count }}
                </button>
                <span
                  v-else
                  class="min-h-[28px] rounded-[3px] border border-dashed border-slate-200 sm:min-h-[34px]"
                  aria-hidden="true"
                  data-testid="my-runs-heat-empty"
                ></span>
              </template>
            </template>
            <span aria-hidden="true"></span>
            <span
              v-for="col in heat.cols"
              :key="`x${col.label}`"
              class="pt-1 text-center text-[10px] text-slate-500"
              style="font-variant-numeric: tabular-nums"
              data-testid="my-runs-heat-xlabel"
              >{{ col.label }}</span
            >
            <span aria-hidden="true"></span>
            <span
              class="text-center text-[10px] font-bold text-slate-500"
              :style="{ gridColumn: `span ${heat.cols.length}` }"
              >Ascensions</span
            >
          </div>

          <!-- The selected cell, in words: the main reader on a phone. -->
          <div
            class="mt-2 flex min-h-[44px] items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 pl-3 text-[11px] leading-snug text-slate-600"
            data-testid="my-runs-heat-line"
          >
            <div class="min-w-0 flex-1 py-2" aria-live="polite">
              <template v-if="selLine">
                <p class="font-bold text-slate-900">{{ selLine.head }}</p>
                <p class="tabular-nums font-bold text-slate-900 break-words">{{ selLine.route }}</p>
                <p v-for="(l, k) in selLine.more" :key="k">{{ l }}</p>
              </template>
              <p v-else>{{ hint }}</p>
            </div>
            <button
              v-if="selLine && pinned"
              type="button"
              class="flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[18px] font-bold text-slate-500"
              aria-label="Clear the selected cell"
              data-testid="my-runs-heat-clear"
              @click="clearSel"
            >
              ×
            </button>
          </div>
        </div>

        <!-- The legend: the colour scale, the best, and the level chips that filter the map. -->
        <div class="space-y-2 text-[11px] text-slate-600" data-testid="my-runs-scatter-key">
          <div v-if="!heat.empty" class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="my-runs-heat-scale">
            <span class="flex items-center gap-1">
              <span>fewer routes</span>
              <span
                v-for="(s, k) in HEAT_STEPS"
                :key="k"
                class="inline-block h-3 w-4 rounded-[2px] border border-slate-300"
                :style="{ background: s.fill }"
                aria-hidden="true"
              ></span>
              <span>more routes</span>
            </span>
            <span data-testid="my-runs-heat-max">(most in one cell: {{ heat.max }})</span>
            <span class="flex items-center gap-1">
              <span
                class="inline-flex h-4 w-5 items-center justify-center rounded-[2px] outline outline-2 outline-offset-[-2px] outline-[#0b0b0b] text-[9px]"
                aria-hidden="true"
                >★</span
              >Best route
            </span>
          </div>
          <div role="group" aria-label="Levels counted" class="flex flex-wrap items-center gap-1.5" data-testid="my-runs-heat-levels">
            <span class="text-slate-500">Levels:</span>
            <button
              v-for="l in levelsIn"
              :key="l.level"
              type="button"
              :class="pill(!levelOff.has(l.level))"
              :aria-pressed="!levelOff.has(l.level)"
              :data-testid="`my-runs-heat-level-${l.level}`"
              @click="toggleLevel(l.level)"
            >
              {{ levelName(l.level) }}{{ ' ' }}<span class="font-semibold opacity-70">{{ l.count }}</span>
            </button>
          </div>
        </div>
        <p v-for="n in notes" :key="n" class="text-[11px] text-slate-500" data-testid="my-runs-scatter-note">{{ n }}</p>

        <details
          class="rounded-lg border border-slate-100 p-2"
          data-testid="my-runs-scatter-list"
          @toggle="listOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary class="cursor-pointer text-[11px] font-bold text-indigo-700">The same routes as a list</summary>
          <div v-if="listOpen" class="mt-2 overflow-x-auto">
            <table class="min-w-full text-left text-[11px] text-slate-700">
              <thead class="text-slate-500">
                <tr>
                  <th class="py-1 pr-3 font-bold">Route</th>
                  <th class="py-1 pr-3 font-bold">Ascensions</th>
                  <th v-if="view.goal?.kind === 'race'" class="py-1 pr-3 font-bold">Days</th>
                  <template v-else>
                    <th class="py-1 pr-3 font-bold">TE</th>
                    <th class="py-1 pr-3 font-bold">Spare</th>
                  </template>
                  <th class="py-1 pr-3 font-bold">Finish</th>
                  <th class="py-1 pr-3 font-bold">Level</th>
                  <th class="py-1 font-bold">From</th>
                </tr>
              </thead>
              <tbody style="font-variant-numeric: tabular-nums">
                <tr v-for="p in view.shown" :key="p.id" class="border-t border-slate-100">
                  <td class="py-1 pr-3 tabular-nums whitespace-nowrap">{{ p.chain.join(' → ') }}</td>
                  <td class="py-1 pr-3">{{ p.asc }}</td>
                  <td v-if="view.goal?.kind === 'race'" class="py-1 pr-3">
                    {{ p.days != null ? p.days.toFixed(1) : '' }}
                  </td>
                  <template v-else>
                    <td class="py-1 pr-3">{{ p.te }}</td>
                    <td class="py-1 pr-3">{{ p.spareHours != null ? `${p.spareHours.toFixed(1)} h` : '' }}</td>
                  </template>
                  <td class="py-1 pr-3 whitespace-nowrap">{{ p.finish != null ? whenText(p.finish, zone) : '' }}</td>
                  <td class="py-1 pr-3">{{ levelName(p.level) }}</td>
                  <td class="py-1">{{ fromName(p.from) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <p class="text-[11px] text-slate-500">Every run is also in Your runs below, with its filters.</p>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BoardRow } from '@/lib/leaderboardRank';
import { boardErrorText, type BoardReadKind } from '@/search/myBoardRows';
import {
  LEVEL_ORDER,
  bestOrder,
  buildScatter,
  defaultGoal,
  fromName,
  levelName,
  pointLines,
  scatterNotes,
  scatterSummary,
  scatterView,
  whenText,
  type PointLevel,
  type SavedAnswerLike,
  type SavedRunLike,
  type ScatterPoint,
} from '@/lib/routeScatter';
import { HEAT_STEPS, heatBins, heatStep, type HeatCell, type HeatScale } from '@/lib/heatBins';

const props = withDefaults(
  defineProps<{
    rows: BoardRow[] | null;
    savedRuns?: readonly SavedRunLike[];
    savedAnswers?: readonly SavedAnswerLike[];
    eggDayAt: number;
    eggDayYear: number;
    zone: string;
    /** Open from the start (specs); otherwise open on a wide screen, closed on a phone. */
    startOpen?: boolean;
    /** Why the leaderboard could not be read (null when it was): with nothing to plot, say so rather than "none
     *  yet" (QA break-it #3). */
    boardFailed?: BoardReadKind | null;
    /** Specs and screenshots: levels switched off from the start, and the best cell picked from the start. */
    startLevelsOff?: readonly PointLevel[];
    startOnBest?: boolean;
  }>(),
  {
    savedRuns: () => [],
    savedAnswers: () => [],
    startOpen: false,
    boardFailed: null,
    startLevelsOff: () => [],
    startOnBest: false,
  }
);

const Y_TITLE: Record<HeatScale, string> = { finish: 'Finish date', te: 'TE reached' };

const open = ref(props.startOpen);
const narrow = ref(false);
let narrowQuery: MediaQueryList | null = null;
const onNarrow = () => {
  narrow.value = !!narrowQuery?.matches;
};
onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  narrowQuery = window.matchMedia('(max-width: 639px)');
  onNarrow();
  narrowQuery.addEventListener?.('change', onNarrow);
  if (!props.startOpen) open.value = !narrow.value;
});
onBeforeUnmount(() => narrowQuery?.removeEventListener?.('change', onNarrow));
const listOpen = ref(false);

const savedCount = computed(() => props.savedRuns.length + props.savedAnswers.length);
const built = computed(() =>
  buildScatter({
    rows: props.rows,
    savedRuns: props.savedRuns,
    savedAnswers: props.savedAnswers,
    eggDayAt: props.eggDayAt,
    eggDayYear: props.eggDayYear,
    zone: props.zone,
  })
);
const goalKey = ref<string | null>(null);
// The goal with the most routes, until the player picks one that still has routes.
watch(
  () => built.value.goals,
  goals => {
    if (!goalKey.value || !goals.some(g => g.key === goalKey.value)) goalKey.value = defaultGoal(goals);
  },
  { immediate: true }
);
const goal = computed(() => built.value.goals.find(g => g.key === goalKey.value) ?? null);
const scale = computed<HeatScale>(() => (goal.value?.kind === 'race' ? 'finish' : 'te'));

// ---------------------------------------------------------------------------------------- level filter

/** The levels switched off in the legend (kept across goals). */
const levelOff = ref<Set<PointLevel>>(new Set(props.startLevelsOff));
const levelsIn = computed(() => {
  const mine = built.value.points.filter(p => p.goal === goalKey.value);
  return LEVEL_ORDER.map(level => ({ level, count: mine.filter(p => p.level === level).length })).filter(l => l.count);
});
function toggleLevel(l: PointLevel): void {
  const next = new Set(levelOff.value);
  if (next.has(l)) next.delete(l);
  else next.add(l);
  levelOff.value = next;
}
const counted = computed(() => built.value.points.filter(p => !levelOff.value.has(p.level)));

// --------------------------------------------------------------------------------------------- the map

const view = computed(() =>
  scatterView(
    built.value.goals,
    counted.value,
    goalKey.value,
    scale.value === 'finish' ? 'finish' : 'asc',
    'te',
    Number.POSITIVE_INFINITY
  )
);
const heat = computed(() =>
  heatBins<ScatterPoint>(view.value.shown, {
    scale: scale.value,
    asc: p => p.asc,
    y: p => (scale.value === 'finish' ? p.finish : p.te),
    better: bestOrder(goal.value?.kind ?? 'race'),
    zone: props.zone,
  })
);
/** Top row first: the highest bin on top, the lowest at the bottom. */
const rowOrder = computed(() => heat.value.rows.map((_, k) => heat.value.rows.length - 1 - k));
const summary = computed(() => scatterSummary(view.value, props.zone));
const notes = computed(() => scatterNotes(view.value, built.value.missed));
/** Every level with routes switched off, or nothing in the goal that can be placed (the notes say why). */
const emptyText = computed(() =>
  levelsIn.value.every(l => levelOff.value.has(l.level))
    ? 'No routes to show: every level is switched off. Switch one back on below.'
    : 'No routes to show.'
);
const countWords = computed(() => {
  const n = built.value.points.length;
  if (!built.value.goals.length) {
    if (props.boardFailed) return " · couldn't read the leaderboard";
    return props.rows === null && !savedCount.value ? ' · loading' : ' · none yet';
  }
  return ` (${n} ${n === 1 ? 'route' : 'routes'}, ${built.value.goals.length} ${built.value.goals.length === 1 ? 'goal' : 'goals'})`;
});

const pill = (on: boolean) =>
  `min-h-[44px] rounded-lg border px-3 py-1 text-[11px] font-bold sm:min-h-0 sm:px-2.5 ${
    on
      ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
      : 'border-slate-200 bg-white text-slate-400 line-through hover:border-indigo-300'
  }`;

function cellStyle(count: number): Record<string, string> {
  const s = heatStep(count, heat.value.max);
  const step = HEAT_STEPS[s ?? 0];
  return { background: step.fill, color: step.ink };
}
const isBest = (c: HeatCell<ScatterPoint>) =>
  !!heat.value.bestAt && heat.value.bestAt.row === c.row && heat.value.bestAt.col === c.col;
const cellPlace = (c: HeatCell<ScatterPoint>) => {
  const col = heat.value.cols[c.col];
  const row = heat.value.rows[c.row];
  const asc = col.lo === col.hi ? `${col.lo} ${col.lo === 1 ? 'ascension' : 'ascensions'}` : `${col.label} ascensions`;
  return `${asc}, ${scale.value === 'finish' ? `finishing ${row.range}` : row.range}`;
};
function cellWords(c: HeatCell<ScatterPoint>): string {
  const n = `${c.count} ${c.count === 1 ? 'route' : 'routes'}`;
  return `${n}, best ${c.best?.chain.join(' → ') ?? ''}; ${cellPlace(c)}${isBest(c) ? '. The best of all' : ''}`;
}

// ----------------------------------------------------------------------------------- hover, tap, focus

const sel = ref<{ row: number; col: number } | null>(props.startOnBest ? heat.value.bestAt : null);
const pinned = ref(!!sel.value);
watch(heat, () => clearSel());
const isSel = (c: HeatCell<ScatterPoint>) => !!sel.value && sel.value.row === c.row && sel.value.col === c.col;
function tap(row: number, col: number): void {
  if (pinned.value && sel.value?.row === row && sel.value?.col === col) {
    clearSel();
    return;
  }
  sel.value = { row, col };
  pinned.value = true;
}
function clearSel(): void {
  sel.value = null;
  pinned.value = false;
}
const hint = computed(() =>
  narrow.value
    ? 'Tap a cell to see how many routes it holds and the best of them.'
    : 'Point at, click or tab to a cell to see how many routes it holds and the best of them.'
);
const selLine = computed(() => {
  const s = sel.value;
  const g = goal.value;
  const c = s ? heat.value.cells[s.row]?.[s.col] : null;
  if (!c || !c.best || !g) return null;
  // The overall best is said once, as the legend's "★ Best route", not again before the route.
  const lines = pointLines(c.best, g, props.zone);
  return {
    head: `${c.count} ${c.count === 1 ? 'route' : 'routes'} · ${cellPlace(c)}.${isBest(c) ? ' ★ Best route.' : ''} Best in this cell:`,
    route: lines[0],
    more: lines.slice(1),
  };
});
</script>
