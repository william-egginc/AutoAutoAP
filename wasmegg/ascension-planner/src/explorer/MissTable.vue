<!--
  What missing a checkpoint costs, for one run's best plan, read off that run's own table (miss.ts).
  Rows are the best plan's checkpoints, columns a miss of 1 or 2 TE either way. Each cell says, in
  days after the best, what keeping the old plan costs and what re-planning the rest costs; at the
  last checkpoint the two are one plan, so it says one number. A plan the run never priced is "not
  tried", never a guess; when the page read only the fastest part of the table (`truncated`), a
  missing plan may be in the slow tail it did not read, so it says "not read" instead. When no cell
  has a number at all (a box at every 5th TE never moves a checkpoint by 1 or 2), only the advice
  line shows: a grid of blanks says nothing and does not fit a phone.
-->
<template>
  <p v-if="table && !anyPriced" class="text-[11px] font-bold text-slate-700 leading-relaxed max-w-3xl">
    {{ advice }}
  </p>
  <div v-else-if="table" class="space-y-2">
    <p class="text-[10px] text-slate-400 leading-relaxed">
      Days after this run's best,
      <span class="font-mono-premium text-slate-500">{{ table.best.chain.join(' ') }}</span>
      ({{ table.best.days.toFixed(2) }} d), looked up among {{ truncatedCount ? 'the' : 'its' }}
      {{ table.priced.toLocaleString() }} plans at {{ table.ascensions }} ascensions{{
        truncatedCount ? ' this page read' : ''
      }}. Every one was priced from the same save, so the days compare directly.
    </p>
    <div class="overflow-x-auto">
      <table class="text-[11px] tabular-nums">
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <th class="text-left py-1 pr-2 align-bottom">Checkpoint</th>
            <th
              v-for="d in table.offsets"
              :key="d"
              class="text-right py-1 px-1 align-bottom"
              :title="`Ascending ${Math.abs(d)} TE ${d < 0 ? 'before' : 'after'} the planned checkpoint`"
            >
              {{ offsetText(d) }}
              <div class="normal-case tracking-normal font-bold">{{ d < 0 ? 'early' : 'late' }}</div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="row in table.rows" :key="row.index">
            <!-- The keep / re-plan labels sit once per row, beside the checkpoint, so each cell is only
                 its two numbers and the table fits a phone. Every line is leading-4 so they align. -->
            <th scope="row" class="py-1.5 pr-2 text-left align-top whitespace-nowrap">
              <div class="flex items-start justify-between gap-2">
                <div class="font-bold leading-4 text-slate-700">
                  {{ row.index + 1 }} · {{ row.te }} TE
                  <div v-if="row.last" class="text-[9px] font-black text-slate-400 uppercase tracking-widest">last</div>
                </div>
                <div v-if="!row.last" class="text-right text-[9px] font-normal text-slate-400">
                  <div class="leading-4">keep</div>
                  <div class="leading-4">re-plan</div>
                </div>
              </div>
            </th>
            <td
              v-for="cell in row.cells"
              :key="cell.offset"
              class="py-1.5 px-1 text-right align-top whitespace-nowrap"
              :class="replanPays(cell) ? 'bg-emerald-50' : ''"
              :title="cellTitle(row, cell)"
            >
              <div class="leading-4">
                <span v-if="cell.keep" class="font-bold text-slate-700">{{ cellDays(cell.keep.behind) }}</span>
                <span v-else class="italic text-slate-400">{{ missingText }}</span>
              </div>
              <div v-if="!row.last" class="leading-4">
                <span
                  v-if="cell.replan"
                  :class="replanPays(cell) ? 'font-black text-emerald-800' : 'font-bold text-slate-700'"
                  >{{ cellDays(cell.replan.behind) }}</span
                >
                <span v-else class="italic text-slate-400">{{ missingText }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-[10px] text-slate-400 leading-relaxed max-w-3xl">
      <b class="text-slate-500">Keep</b>: the same plan with only that checkpoint moved.
      <b class="text-slate-500">Re-plan</b>: the fastest plan in this table with the same earlier checkpoints and that
      one moved, whatever it does after. At the last checkpoint they are the same plan.
      <span class="rounded bg-emerald-50 px-1 font-bold text-emerald-800">Green</span>: re-planning saves more than
      {{ REPLAN_WORTH_DAYS === 1 ? 'a day' : `${REPLAN_WORTH_DAYS} days` }}. <i>Same</i>: the same finish as the best,
      to a few minutes.
      <template v-if="truncatedCount">
        <i>Not read</i>: not in the part of the table read. This page read the fastest
        {{ chains.length.toLocaleString() }} plans of this run's table and left out the slowest
        {{ truncatedCount.toLocaleString() }}, so that plan was either never priced or is among those.
      </template>
      <template v-else>
        <i>Not tried</i>: this run never priced that plan (outside its search box, or a TE it stepped over), so there is
        no number to show.
      </template>
      Hover a cell for the plans behind it.
    </p>
    <p class="text-[11px] font-bold text-slate-700 leading-relaxed max-w-3xl">{{ advice }}</p>
  </div>
  <p v-else class="text-[11px] text-slate-400">
    This table holds no plan at {{ ascensions }} ascensions with a checkpoint to miss.
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PricedChain } from '@/search/types';
import { signedDays } from '@/lib/leaderboardRank';
import { SAME_FINISH_DAYS } from './analysis';
import {
  hasPricedCell,
  missAdvice,
  missTable,
  replanPays,
  REPLAN_WORTH_DAYS,
  type MissCell,
  type MissRow,
} from './miss';

const props = defineProps<{
  /** The run's whole table (`parseRunCsv(...).chains`); only its own count is read. */
  chains: PricedChain[];
  /** The run's ascension count: the count its best plan, and so every row here, has. */
  ascensions: number;
  /** Plans the parse dropped at its cap (`parseRunCsv(...).truncated`, the page's `loadedTruncated`). */
  truncated?: number;
}>();

const truncatedCount = computed(() => props.truncated ?? 0);
const table = computed(() => missTable(props.chains, props.ascensions));
const anyPriced = computed(() => (table.value ? hasPricedCell(table.value) : false));
const advice = computed(() => (table.value ? missAdvice(table.value, truncatedCount.value) : ''));
/** A cell with no number: never priced, or, when the table was cut, perhaps in the part not read. */
const missingText = computed(() => (truncatedCount.value ? 'not read' : 'not tried'));

/** `−2 TE`, `+1 TE`, with a real minus. */
function offsetText(d: number): string {
  return `${d < 0 ? '−' : '+'}${Math.abs(d)} TE`;
}

/** Days after the best: `+0.39 d`, `+12.4 d`, or `same finish` closer than two decimals can show. */
function daysText(behind: number): string {
  return behind < SAME_FINISH_DAYS ? 'same finish' : signedDays(behind);
}

/** The same in a cell, where "same finish" is shortened to "same" so four columns fit a phone. */
function cellDays(behind: number): string {
  return behind < SAME_FINISH_DAYS ? 'same' : signedDays(behind);
}

function planText(chain: number[], behind: number): string {
  return `${chain.join(' ')}, ${daysText(behind)}`;
}

/** The plans behind a cell, in full, or why there is no number. */
function cellTitle(row: MissRow, cell: MissCell): string {
  const head = `Ascend at ${cell.te} TE instead of ${row.te}.`;
  const never = truncatedCount.value
    ? `Not in the part of the table read: no plan among the fastest ${props.chains.length.toLocaleString()} this page read has checkpoint ${row.index + 1} at ${cell.te} TE after the same earlier checkpoints. The run may have priced one among the ${truncatedCount.value.toLocaleString()} slowest, which were not read.`
    : `This run never priced a plan with checkpoint ${row.index + 1} at ${cell.te} TE after the same earlier checkpoints: outside its search box, or a TE it stepped over.`;
  if (row.last) {
    return cell.keep
      ? `${head}\n${planText(cell.keep.chain, cell.keep.behind)} after the best.\nNothing comes after the last checkpoint, so keeping the plan and re-planning are the same plan.`
      : `${head}\n${never}`;
  }
  if (!cell.replan) return `${head}\n${never}`;
  const keep = cell.keep
    ? `Keep the plan: ${planText(cell.keep.chain, cell.keep.behind)}.`
    : truncatedCount.value
      ? `Keep the plan: not in the part of the table read (never priced, or among the slowest plans this page did not read).`
      : `Keep the plan: not tried. That exact plan was not priced (the box's rules left it out, for example a minimum gap between checkpoints).`;
  const saves =
    cell.saving != null && cell.saving >= SAME_FINISH_DAYS
      ? ` Saves ${signedDays(cell.saving).slice(1)} over keeping the plan.`
      : cell.saving != null
        ? ' No better than keeping the plan.'
        : '';
  return `${head}\n${keep}\nRe-plan the rest: ${planText(cell.replan.chain, cell.replan.behind)}.${saves}`;
}
</script>
