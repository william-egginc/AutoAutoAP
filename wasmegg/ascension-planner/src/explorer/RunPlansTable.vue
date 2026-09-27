<!--
  Every plan one run priced, as a list: the top 10 by default, then 25, 100 or all of them, a page
  of 100 at a time. Filters by ascension count and by checkpoint TE, sorts by rank or by chain, and
  links the run's full table as the collector stores it. Only the visible page is in the DOM: a
  table can hold 60,000 plans (runPlans.ts).

  Days compare directly here, and only here: every plan in the list was priced from one save.
-->
<template>
  <div class="space-y-2">
    <!-- Flex, not inline: Vue drops the whitespace between v-for siblings, so inline nowrap spans had
         no place to wrap and pushed a phone's page sideways. -->
    <p v-if="countBests.length" class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Best per ascension count</span>
      <span
        v-for="b in countBests"
        :key="b.ascensions"
        class="whitespace-nowrap"
        :title="
          b.partial
            ? `The fastest of the ${b.priced.toLocaleString()} plans at ${b.ascensions} ascensions this page read. The count is partial: the page read only the fastest ${chains.length.toLocaleString()} plans of the table, and the slowest ${truncated.toLocaleString()} (some perhaps at this count) are only in the download. The fastest plan at a count is never among them.`
            : `The fastest of the ${b.priced.toLocaleString()} plans at ${b.ascensions} ascensions this run priced`
        "
      >
        <b class="text-slate-700">{{ b.ascensions }}</b
        >: <span class="font-mono-premium">{{ b.chain.join(' ') }}</span> {{ b.days.toFixed(2) }} d
        <span class="text-slate-400">({{ behindText(b.days - countBestDays, b.days === countBestDays) }})</span>
      </span>
      <span v-if="countBests.some(b => b.partial)" class="text-[10px] text-slate-400">
        from the part of the table read, so a count whose plans were all among the slowest is missing
      </span>
    </p>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="mr-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Show</span>
        <button
          v-for="l in PLAN_LIMITS"
          :key="l"
          type="button"
          class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
          :class="
            limit === l
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
          "
          :aria-pressed="limit === l"
          @click="limit = l"
        >
          {{ l === 'all' ? 'All' : `Top ${l}` }}
        </button>
      </div>
      <label
        v-if="counts.length > 1"
        class="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest"
      >
        Ascensions
        <select
          v-model="count"
          class="rounded-md border-slate-300 py-0.5 pl-2 pr-7 text-[11px] font-bold normal-case tracking-normal text-slate-700"
        >
          <option :value="'all'">All</option>
          <option v-for="n in counts" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label class="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
        Checkpoint TE
        <input
          v-model="filterText"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="280 or 275-285"
          class="w-36 rounded-md border-slate-300 py-0.5 text-[11px] font-mono-premium normal-case tracking-normal text-slate-700 placeholder:text-slate-300"
          title="Plans with a checkpoint at this TE, or in this range. Several, separated by spaces, must all hold: 230 275-285 is a checkpoint at 230 and one in 275-285."
        />
      </label>
    </div>
    <p v-if="filterError" class="text-[10px] font-bold text-amber-800">
      {{ filterError }} Showing every plan until then.
    </p>

    <p class="text-[11px] text-slate-600 leading-relaxed">
      This table holds <b>{{ plansText(total) }}</b
      ><template v-if="counts.length === 1"> at {{ counts[0] }} ascensions</template>.
      <template v-if="truncated"
        >This page read the fastest {{ chains.length.toLocaleString() }}; the slowest
        {{ truncated.toLocaleString() }} are only in the download.
      </template>
      <template v-if="narrowed">{{ plansText(view.matched) }} match{{ view.matched === 1 ? 'es' : '' }}. </template>
      {{ shownText }}
    </p>
    <p v-if="href" class="text-[11px]">
      <a
        :href="href"
        class="font-bold text-indigo-700 underline hover:text-indigo-900"
        title="The run's whole table as the collector stores it: one row per ascension of every plan, with each leg's strategy, dates and delivery. A .csv.gz file, which every operating system opens."
        >Download all {{ plansText(total) }} (.csv.gz) ↓</a
      >
    </p>

    <div class="overflow-x-auto">
      <table class="text-[11px] tabular-nums">
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
            <th class="text-right py-1 pr-5" :aria-sort="ariaSort('rank')">
              <button
                type="button"
                :class="sortHeadClass('rank')"
                title="1 is the fastest plan in this run's table"
                @click="sortBy('rank')"
              >
                Rank<span aria-hidden="true">{{ sortArrow('rank') }}</span>
              </button>
            </th>
            <th class="text-left py-1 pr-5" :aria-sort="ariaSort('chain')">
              <button
                type="button"
                :class="sortHeadClass('chain')"
                title="Checkpoint by checkpoint, lowest first"
                @click="sortBy('chain')"
              >
                Chain<span aria-hidden="true">{{ sortArrow('chain') }}</span>
              </button>
            </th>
            <th class="text-right py-1 pr-5">Asc.</th>
            <th class="text-right py-1 pr-5" title="Days from this run's plan start to the target">
              <!-- Days order is rank order. -->
              <button type="button" :class="sortHeadClass('rank')" @click="sortBy('rank')">Days</button>
            </th>
            <th
              class="text-right py-1 pr-5"
              title="Days after this run's fastest plan. Every plan here was priced from one save, so the gap is the plans alone."
            >
              vs best
            </th>
            <th class="text-left py-1" title="The plan start plus its days, in your timezone">Finishes</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="p in view.rows" :key="p.rank" class="hover:bg-slate-50">
            <td class="py-1 pr-5 text-right text-slate-400">{{ p.rank.toLocaleString() }}</td>
            <td class="py-1 pr-5 font-mono-premium text-slate-700 whitespace-nowrap">{{ p.chain.join(' ') }}</td>
            <td class="py-1 pr-5 text-right text-slate-500">{{ p.ascensions }}</td>
            <td class="py-1 pr-5 text-right font-bold text-slate-700 whitespace-nowrap">{{ p.days.toFixed(2) }} d</td>
            <td class="py-1 pr-5 text-right whitespace-nowrap">
              <span
                v-if="p.rank === 1"
                class="rounded bg-emerald-100 px-1 text-[9px] font-black text-emerald-800"
                title="The fastest plan in this run's table"
                >best</span
              >
              <span v-else class="text-slate-500">{{ behindText(p.behind, false) }}</span>
            </td>
            <td class="py-1 text-slate-500 whitespace-nowrap" :title="finishTitle(finishOf(p.days), run.timezone)">
              {{ finishDateText(finishOf(p.days), viewZone) }}
            </td>
          </tr>
          <tr v-if="!view.rows.length">
            <td colspan="6" class="py-3 text-center text-slate-400">No plan in this table matches.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav
      v-if="limit === 'all' && view.pages > 1"
      class="flex flex-wrap items-center gap-1 text-[10px] font-bold"
      aria-label="Pages of plans"
    >
      <button type="button" :class="pageButtonClass(false)" :disabled="view.page === 0" @click="page = view.page - 1">
        ‹ Previous
      </button>
      <template v-for="(p, i) in pageButtons" :key="p ?? `gap-${i}`">
        <span v-if="p === null" class="px-1 text-slate-400" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          :class="pageButtonClass(p === view.page)"
          :aria-current="p === view.page ? 'page' : undefined"
          :aria-label="`Page ${p + 1}`"
          @click="page = p"
        >
          {{ (p + 1).toLocaleString() }}
        </button>
      </template>
      <button
        type="button"
        :class="pageButtonClass(false)"
        :disabled="view.page >= view.pages - 1"
        @click="page = view.page + 1"
      >
        Next ›
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PricedChain } from '@/search/types';
import { DAY_MS, finishDateText, finishTitle, signedDays } from '@/lib/leaderboardRank';
import { SAME_FINISH_DAYS } from './analysis';
import type { CollectorRow } from './collector';
import {
  bestByCount,
  countsIn,
  csvHref,
  pageList,
  parseTeFilter,
  PLAN_LIMITS,
  rankPlans,
  selectPlans,
  type PlanLimit,
  type PlanSort,
  type PlanSortKey,
} from './runPlans';

const props = defineProps<{
  /** The run's whole table as parsed (`parseRunCsv(...).chains`), every count in it. */
  chains: PricedChain[];
  /** The run the table belongs to: its id for the download, its proof, its timezone. */
  run: CollectorRow;
  /** The collector's base URL, for the download link. Empty hides the link. */
  base: string;
  /** When the run's plan starts, in ms (the page's `judged`, else `startMs`). Null: no finish dates. */
  planStart: number | null;
  /** The zone finish dates are shown in: the viewer's, like every date on the page. */
  viewZone: string;
  /** Plans the parse dropped at its cap (`parseRunCsv(...).truncated`). */
  truncated?: number;
}>();

const limit = ref<PlanLimit>(10);
const count = ref<number | 'all'>('all');
const filterText = ref('');
const sort = ref<PlanSort>({ by: 'rank', dir: 'asc' });
const page = ref(0);

/** Ranked once per table; everything after is a pass over numbers. */
const ranked = computed(() => rankPlans(props.chains));
const counts = computed(() => countsIn(ranked.value));
const truncated = computed(() => props.truncated ?? 0);
/** Every plan the stored file holds, read or not. */
const total = computed(() => props.chains.length + truncated.value);

const parsedFilter = computed(() => parseTeFilter(filterText.value));
const filterError = computed(() => ('error' in parsedFilter.value ? parsedFilter.value.error : ''));
const terms = computed(() => ('terms' in parsedFilter.value ? parsedFilter.value.terms : []));

const view = computed(() =>
  selectPlans(ranked.value, {
    count: count.value,
    terms: terms.value,
    sort: sort.value,
    limit: limit.value,
    page: page.value,
  })
);
const pageButtons = computed(() => pageList(view.value.page, view.value.pages));

/** Whether a filter is cutting the list down, so the count that matches is worth saying. */
const narrowed = computed(() => count.value !== 'all' || terms.value.length > 0);

const shownText = computed(() => {
  const v = view.value;
  if (!v.listed) return '';
  const order =
    sort.value.by === 'chain' ? ', in checkpoint order' : sort.value.dir === 'desc' ? ', slowest first' : '';
  if (limit.value === 'all') {
    return v.pages > 1
      ? `Showing ${v.from.toLocaleString()}–${v.to.toLocaleString()} of ${v.listed.toLocaleString()}${order}.`
      : `Showing all ${v.listed.toLocaleString()}${order}.`;
  }
  return v.listed < limit.value
    ? `Showing all ${v.listed.toLocaleString()}${order}.`
    : `Showing the fastest ${v.listed.toLocaleString()}${order}.`;
});

const href = computed(() => (props.base && props.run.id ? csvHref(props.base, props.run.id) : ''));

const countBests = computed(() => bestByCount(ranked.value, props.run.proof, truncated.value));
const countBestDays = computed(() => Math.min(...countBests.value.map(b => b.days)));

// A new choice starts at the first page; a new table starts over entirely.
watch([limit, count, terms, sort], () => (page.value = 0));
watch(
  () => props.run.id,
  () => {
    limit.value = 10;
    count.value = 'all';
    filterText.value = '';
    sort.value = { by: 'rank', dir: 'asc' };
    page.value = 0;
  }
);
watch(counts, list => {
  if (count.value !== 'all' && !list.includes(count.value)) count.value = 'all';
});

function plansText(n: number): string {
  return `${n.toLocaleString()} plan${n === 1 ? '' : 's'}`;
}

/** Days after the best, the way the runs table says it. */
function behindText(behind: number, isBest: boolean): string {
  if (isBest) return 'best';
  return behind < SAME_FINISH_DAYS ? 'same finish' : signedDays(behind);
}

function finishOf(days: number): number | null {
  return props.planStart == null ? null : props.planStart + days * DAY_MS;
}

/** Picking the order in force flips it, the way the runs table's headers do. */
function sortBy(by: PlanSortKey): void {
  sort.value = sort.value.by === by ? { by, dir: sort.value.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: 'asc' };
}

function ariaSort(by: PlanSortKey): 'ascending' | 'descending' | 'none' {
  if (sort.value.by !== by) return 'none';
  return sort.value.dir === 'asc' ? 'ascending' : 'descending';
}

function sortArrow(by: PlanSortKey): string {
  return sort.value.by === by ? (sort.value.dir === 'asc' ? ' ↑' : ' ↓') : '';
}

function sortHeadClass(by: PlanSortKey): string {
  return `uppercase tracking-widest [text-align:inherit] hover:text-slate-600 ${sort.value.by === by ? 'text-slate-700' : ''}`;
}

function pageButtonClass(current: boolean): string {
  return `min-w-[1.75rem] px-1.5 py-0.5 rounded-md border transition-colors disabled:opacity-40 ${
    current
      ? 'bg-slate-900 text-white border-slate-900'
      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
  }`;
}
</script>
