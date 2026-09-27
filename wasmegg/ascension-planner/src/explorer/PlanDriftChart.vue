<!--
  Does the best plan move from one day to the next? One account at a time: every plan it has priced,
  at the date it was made, measured as days after the account's earliest standing finish, and the
  SAME plan joined across the times it was priced (drift.ts). A joined line that rises is a plan whose
  finish slipped when it was priced again; a flat one is a plan that holds.

  FINISH DATES, ONE ACCOUNT. Totals never compare across starts (the same plan a day later is a day
  shorter), and nothing compares across accounts, so the chart shows one account and the picker
  opens on the one with the most re-priced plans.

  Colour is the ascension count, one fixed colour per count whatever account is shown (drift.ts
  `countSlotIndex`); the marker says how the run searched, as on the count chart: filled for a
  finished box at every TE, hollow for a box that stepped over TEs, hollow with a cross for a staged
  search. A diamond is a plan priced inside a later run: a schema-7 re-check, or one of its
  runners-up.

  Each mark's tooltip, and each line segment, runs from the pricing it matched (drift.ts `prev`),
  never just from the mark before it on the line: a plan that forks (an old row that did not record
  the finish-the-current-run switch, re-priced once each way) draws as a branch from where it forked.
-->
<template>
  <div class="space-y-2">
    <div v-if="drifts.length" class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5">
        <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Account</span>
        <select
          v-model="picked"
          class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700"
        >
          <option v-for="d in drifts" :key="d.key" :value="d.key">
            {{ d.label }} ·
            {{
              d.repricedPlans
                ? `${d.repricedPlans} re-priced plan${d.repricedPlans === 1 ? '' : 's'}`
                : `${d.points.length} plan${d.points.length === 1 ? '' : 's'}, none re-priced`
            }}
          </option>
        </select>
      </label>
      <button
        v-for="mode in VIEWS"
        :key="mode.id"
        type="button"
        class="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors disabled:opacity-40"
        :class="
          view === mode.id
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
        "
        :aria-pressed="view === mode.id"
        :disabled="mode.id === 'repriced' && !current?.repricedPlans"
        @click="view = mode.id"
      >
        {{ mode.label }}
      </button>
    </div>

    <EChart v-if="current && shown.length" :option="option" height="340px" />
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">
      No run here at {{ finalTE }} TE has a plan start to place.
    </p>
    <p v-if="current && !current.repricedPlans" class="px-1 text-[11px] text-slate-500">
      None of {{ current.label }}'s plans has been priced twice yet, so there is no line to draw: each mark is one plan
      at the date it was made.
    </p>
    <p v-if="current?.anchorKind === 'own'" class="px-1 text-[10px] text-amber-700">
      None of this account's runs at {{ finalTE }} TE still stands, so heights count from the earliest finish shown.
    </p>

    <div
      v-if="current && shown.length"
      class="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10px] font-bold text-slate-500"
      aria-label="How to read the marks"
    >
      <span class="text-slate-600">Colour is the ascension count, not an account</span>
      <span><span aria-hidden="true">●</span> a finished box at every TE</span>
      <span><span aria-hidden="true">○</span> a finished box that stepped over TEs</span>
      <span><span aria-hidden="true">⊗</span> a staged search, or a box it did not finish</span>
      <span><span aria-hidden="true">◆</span> priced again inside a later run (a re-check or a runner-up)</span>
      <span><span aria-hidden="true">——</span> the same plan, priced at different times</span>
      <span v-if="hasFaded"
        ><span aria-hidden="true" class="opacity-40">●</span> faint: no longer stands (fallen behind, or an older
        save)</span
      >
    </div>

    <!-- Every account's re-pricings, not just the picked one's: there are few enough to list, and the
         point is how few. A row picks its account. -->
    <div class="space-y-1 pt-1">
      <p class="text-[9px] font-black uppercase tracking-widest text-slate-400">
        Every plan priced twice, all accounts ({{ tally.repricings }})
      </p>
      <div v-if="tableRows.length" class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead>
            <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <th class="text-left py-1 pr-3">Account</th>
              <th class="text-left py-1 pr-3">Plan</th>
              <th class="text-left py-1 pr-3">Made</th>
              <th class="text-left py-1 pr-3">Priced again</th>
              <th class="text-right py-1 pr-3">Starts apart</th>
              <th class="text-right py-1 pr-3">Finish moved</th>
              <th class="text-left py-1">By</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="r in tableRows"
              :key="r.id"
              class="cursor-pointer hover:bg-slate-50"
              :class="r.accountKey === picked ? 'bg-slate-50' : ''"
              @click="picked = r.accountKey"
            >
              <td class="py-1 pr-3 whitespace-nowrap font-bold text-slate-700">{{ r.account }}</td>
              <td class="py-1 pr-3 whitespace-nowrap font-mono-premium text-slate-600">{{ r.plan }}</td>
              <td class="py-1 pr-3 whitespace-nowrap text-slate-500">{{ r.made }}</td>
              <td class="py-1 pr-3 whitespace-nowrap text-slate-500">{{ r.again }}</td>
              <td class="py-1 pr-3 whitespace-nowrap text-right tabular-nums text-slate-600">{{ r.apart }}</td>
              <td class="py-1 pr-3 whitespace-nowrap text-right tabular-nums font-bold" :class="r.movedClass">
                {{ r.moved }}
              </td>
              <td class="py-1 whitespace-nowrap text-slate-500">{{ r.by }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-[11px] text-slate-500">No plan to {{ finalTE }} TE has been priced twice yet.</p>
    </div>

    <p class="px-1 text-[11px] text-slate-600 leading-relaxed max-w-3xl">
      <template v-if="tally.repricings">
        That is {{ tally.repricings }} re-pricing{{ tally.repricings === 1 ? '' : 's' }} on
        {{ tally.accounts }} account{{ tally.accounts === 1 ? '' : 's' }}, which is thin: {{ tally.later }} came out
        later{{ tally.later ? ` (by up to ${daysText(tally.maxLater)})` : '' }}, {{ tally.unchanged }} within an hour of
        the finish before, and {{ tally.earlier }} earlier{{
          tally.earlier ? ` (by up to ${daysText(tally.maxEarlier)})` : ''
        }}.
        <template v-if="tally.withinDay">
          {{ tally.withinDay }} of them were priced again less than a day after the time before, so they say little
          about how a plan ages over weeks.
        </template>
      </template>
      A plan that won its search was the fastest of the many priced that day, so priced again it is expected to slip a
      little: a small rise is not by itself a plan going stale. A bigger move either way can come from the account
      getting ahead of or behind the plan in between, from the later start changing how the current ascension is played,
      or from a newer planner; runs before schema 7 do not record which planner priced them. Only each run's own best
      plan, its runners-up and its best at each count are read here: a plan priced again only deep in a later run's full
      table (its CSV) is not drawn.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import EChart from '@/components/charts/EChart.vue';
import type { ChartOption, ChartSeriesOption } from '@/lib/charts/echarts';
import { esc } from '@/lib/charts/tooltip';
import { DAY_MS, finishDateText, formatDate, localZone, signedDays } from '@/lib/leaderboardRank';
import { SAME_FINISH_DAYS, type FinishJudgement } from './analysis';
import type { CollectorRow } from './collector';
import {
  countSlotIndex,
  countSlotName,
  defaultDriftAccount,
  directionOf,
  driftTally,
  planDrift,
  type DriftLine,
  type DriftPoint,
  type PricingKind,
} from './drift';
import { colorAt, AXIS_LABEL, SPLIT_LINE } from './palette';

/**
 * `rows`: the runs the page shows, each result once (ChainExplorer's `usable`); only those at
 * `finalTE` are used. `judged`: ChainExplorer's `judged`, for the same target.
 */
const props = defineProps<{
  rows: CollectorRow[];
  judged: FinishJudgement;
  finalTE: number;
  accountLabels: Map<string, string>;
}>();

type View = 'all' | 'repriced';
const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'Every plan' },
  { id: 'repriced', label: 'Re-priced plans only' },
];
const view = ref<View>('all');

/** Dates in the viewer's timezone, as everywhere else on the page. */
const viewZone = localZone();

const drifts = computed(() => planDrift(props.rows, props.judged, props.finalTE, props.accountLabels));
const tally = computed(() => driftTally(drifts.value));

const picked = ref<string | null>(null);
const current = computed(() => drifts.value.find(d => d.key === picked.value) ?? null);
watch(
  drifts,
  list => {
    if (!picked.value || !list.some(d => d.key === picked.value)) picked.value = defaultDriftAccount(list);
  },
  { immediate: true }
);
// Each account opens on its re-priced plans, the lines the question is about, when it has any.
watch(
  () => current.value?.key,
  () => {
    view.value = current.value?.repricedPlans ? 'repriced' : 'all';
  },
  { immediate: true }
);

/** Lines drawn as lines: plans with a re-pricing. */
const repricedLines = computed<DriftLine[]>(() => {
  const d = current.value;
  if (!d) return [];
  const keys = new Set(d.repricings.map(r => r.lineKey));
  return d.lines.filter(l => keys.has(l.key));
});

/** The marks of "Re-priced plans only": those lines, and any line a branch of them forks from. */
const repricedMarks = computed<DriftLine[]>(() => {
  const d = current.value;
  if (!d) return [];
  const drawn = new Set(repricedLines.value);
  const forks = new Set(repricedLines.value.map(l => l.from).filter(Boolean));
  return d.lines.filter(l => drawn.has(l) || l.points.some(p => forks.has(p)));
});

/** The points on the chart, with the line each belongs to. */
const shown = computed<{ point: DriftPoint; line: DriftLine; prev: DriftPoint | null }[]>(() => {
  const d = current.value;
  if (!d) return [];
  const lines = view.value === 'repriced' ? repricedMarks.value : d.lines;
  // Each mark once, on the line that owns it; `prev` is the pricing it matched, which for a branch's
  // first mark sits on another line.
  return lines.flatMap(line => line.points.map(point => ({ point, line, prev: point.prev })));
});

const hasFaded = computed(() => shown.value.some(s => faded(s.point)));

const dateText = (ms: number) =>
  formatDate(ms, viewZone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function daysText(days: number): string {
  return signedDays(days).replace(/^[+−]/, '');
}

function apartText(days: number): string {
  return days < 1 ? `${(days * 24).toFixed(1)} h` : `${days.toFixed(1)} d`;
}

const KIND_TEXT: Record<PricingKind, string> = {
  run: 'a newer run',
  recheck: "a newer run's re-check",
  table: "a newer run's runners-up",
};

function movedText(moved: number): string {
  return directionOf({ moved }) === 'unchanged' ? 'unchanged' : signedDays(moved);
}

/** A filled cross: ECharts has no built-in one, and a path symbol is filled, not stroked. */
const CROSS = 'path://M2,0 L5,3 L8,0 L10,2 L7,5 L10,8 L8,10 L5,7 L2,10 L0,8 L3,5 L0,2 Z';
const MARKER_PX = 9;
const STAGED_PX = 11;
const CROSS_PX = 5;

function symbolOf(p: DriftPoint): { symbol: string; size: number; filled: boolean } {
  if (p.kind !== 'run') return { symbol: 'diamond', size: 10, filled: true };
  if (p.grade?.kind === 'every-te') return { symbol: 'circle', size: MARKER_PX, filled: true };
  return { symbol: 'emptyCircle', size: p.grade?.kind === 'staged' ? STAGED_PX : MARKER_PX, filled: false };
}

/** No longer standing for a reason other than a newer pricing of the same plan (fallen behind, an
 *  older save): drawn faint. A replaced pricing is what the lines are made of, so it stays solid. */
function faded(p: DriftPoint): boolean {
  return !p.standing && p.state !== 'replaced';
}

function tipOf(p: DriftPoint, line: DriftLine, prev: DriftPoint | null, anchorText: string): string {
  const how =
    p.kind === 'run'
      ? `searched: ${p.grade?.text ?? '—'}`
      : p.kind === 'recheck'
        ? "a re-check: priced again from this run's save (schema 7)"
        : 'priced again inside this run: one of its runners-up, or its best at a count';
  const lines = [
    `made ${dateText(p.start)} · from ${p.row.currentTE} TE`,
    `finishes ${finishDateText(p.finish, viewZone)} · ${
      Math.abs(p.behind) < SAME_FINISH_DAYS ? anchorText : `${signedDays(p.behind)} vs ${anchorText}`
    }`,
  ];
  if (prev) {
    lines.push(
      `priced ${apartText((p.start - prev.start) / DAY_MS)} after the time before: finish ${movedText((p.finish - prev.finish) / DAY_MS)}`
    );
  }
  // The line's count, the one its colour and legend entry say: a later pricing of a 6-ascension plan
  // with a passed checkpoint dropped is still that plan.
  const n = line.ascensions;
  const dropped = line.chain.slice(0, -1).filter(c => !p.chain.includes(c));
  const title =
    `<b>${esc(p.chain.join(' '))}</b> · ${esc(n)} ascension${n === 1 ? '' : 's'}` +
    (p.chain.length !== n && dropped.length
      ? `<br/><span style="color:#64748b">the ${esc(n)}-ascension plan with passed checkpoint${dropped.length === 1 ? '' : 's'} ${esc(dropped.join(', '))} dropped</span>`
      : '');
  const state = p.standing ? '' : `<br/><span style="color:#b45309">${esc(p.reason || 'no longer stands')}</span>`;
  return `${title}<br/>${lines.map(esc).join('<br/>')}<br/><span style="color:#94a3b8">${esc(how)}</span>${state}`;
}

const option = computed<ChartOption>(() => {
  const d = current.value;
  const series: ChartSeriesOption[] = [];
  if (!d) return { series };
  const anchorText =
    d.anchorKind === 'standing' ? "the account's earliest standing finish" : 'the earliest finish shown';

  // One scatter per count present, named for the legend; staged crosses and the lines share the name
  // so the legend toggles them together.
  const counts = [...new Set(shown.value.map(s => countSlotIndex(s.line.ascensions)))].sort((a, b) => a - b);
  const nameOf = (slot: number) => countSlotName(slot + 2);
  const tips = new Map<string, string>();

  for (const slot of counts) {
    const color = colorAt(slot);
    const mine = shown.value.filter(s => countSlotIndex(s.line.ascensions) === slot);
    for (const s of mine) tips.set(s.point.id, tipOf(s.point, s.line, s.prev, anchorText));
    const marks = (list: typeof mine) =>
      list.map(s => {
        const m = symbolOf(s.point);
        return {
          name: s.point.id,
          value: [s.point.start, s.point.behind],
          symbol: m.symbol,
          symbolSize: m.size,
          itemStyle: {
            ...(m.filled
              ? { color, borderColor: '#ffffff', borderWidth: 1.5 }
              : { color, borderColor: color, borderWidth: 2 }),
            opacity: faded(s.point) ? 0.4 : 1,
          },
        };
      });
    series.push({
      name: nameOf(slot),
      type: 'scatter',
      color,
      data: marks(mine.filter(s => s.point.kind === 'run')),
      z: 4,
    });
    const staged = mine.filter(s => s.point.kind === 'run' && s.point.grade?.kind === 'staged');
    if (staged.length) {
      series.push({
        name: nameOf(slot),
        type: 'scatter',
        color,
        symbol: CROSS,
        symbolSize: CROSS_PX,
        data: staged.map(s => ({
          name: s.point.id,
          value: [s.point.start, s.point.behind],
          itemStyle: { opacity: faded(s.point) ? 0.4 : 1 },
        })),
        z: 5,
      });
    }
    // Plans priced inside a later run sit over that run's own mark, which is often in the same place.
    const inside = mine.filter(s => s.point.kind !== 'run');
    if (inside.length) series.push({ name: nameOf(slot), type: 'scatter', color, data: marks(inside), z: 6 });
  }

  for (const line of repricedLines.value) {
    // A branch is drawn from the pricing it forked from.
    const drawn = line.from ? [line.from, ...line.points] : line.points;
    const first = drawn[0];
    const last = drawn[drawn.length - 1];
    series.push({
      name: nameOf(countSlotIndex(line.ascensions)),
      type: 'line',
      color: colorAt(countSlotIndex(line.ascensions)),
      data: drawn.map(p => [p.start, p.behind]),
      symbol: 'none',
      lineStyle: { width: 2 },
      silent: true,
      tooltip: { show: false },
      endLabel: {
        show: true,
        formatter: movedText((last.finish - first.finish) / DAY_MS),
        fontSize: 10,
        color: '#475569',
        distance: 6,
      },
      z: 3,
    });
  }

  // The account's earliest standing finish, which every height counts from.
  series.push({
    type: 'line',
    data: [],
    silent: true,
    tooltip: { show: false },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#cbd5e1', type: 'solid', width: 1 },
      label: {
        formatter: d.anchorKind === 'standing' ? 'earliest standing finish' : 'earliest finish shown',
        position: 'insideStartTop',
        fontSize: 9,
        color: '#94a3b8',
      },
      data: [{ yAxis: 0 }],
    },
  });

  const starts = shown.value.map(s => s.point.start);
  const lo = Math.min(...starts);
  const hi = Math.max(...starts);
  const pad = Math.max(0.5 * DAY_MS, (hi - lo) * 0.08);

  return {
    animation: false,
    grid: { left: 56, right: 70, top: 34, bottom: 40 },
    legend: {
      top: 0,
      left: 0,
      data: counts.map(nameOf),
      icon: 'circle',
      itemWidth: 9,
      itemHeight: 9,
      textStyle: { fontSize: 10, color: '#64748b' },
    },
    tooltip: {
      trigger: 'item',
      // Kept inside the chart and wrapped, so a long plan's tooltip fits a phone.
      confine: true,
      extraCssText: 'max-width: min(320px, 86vw); white-space: normal;',
      formatter: raw => tips.get((raw as { name?: string }).name ?? '') ?? '',
    },
    xAxis: {
      type: 'time',
      min: lo - pad,
      max: hi + pad,
      minInterval: DAY_MS,
      name: 'date the plan was made (its start)',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: AXIS_LABEL,
      axisLabel: {
        ...AXIS_LABEL,
        hideOverlap: true,
        formatter: (value: number) => formatDate(value, viewZone, { day: 'numeric', month: 'short' }),
      },
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: `finish, days after ${d.anchorKind === 'standing' ? 'earliest standing finish' : 'earliest finish shown'}`,
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: AXIS_LABEL,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series,
  };
});

/** Every account's re-pricings, newest first within the picker's account order. */
const tableRows = computed(() =>
  drifts.value.flatMap(d =>
    d.repricings.map(r => {
      const dir = directionOf(r);
      const plan =
        r.from.chain.join(' ') === r.to.chain.join(' ')
          ? r.to.chain.join(' ')
          : `${r.from.chain.join(' ')} → ${r.to.chain.join(' ')}`;
      return {
        id: `${r.from.id}>${r.to.id}`,
        accountKey: d.key,
        account: d.label,
        plan,
        made: dateText(r.from.start),
        again: dateText(r.to.start),
        apart: apartText(r.apart),
        moved: movedText(r.moved),
        movedClass: dir === 'later' ? 'text-rose-700' : dir === 'earlier' ? 'text-emerald-700' : 'text-slate-500',
        by: KIND_TEXT[r.to.kind],
      };
    })
  )
);
</script>
