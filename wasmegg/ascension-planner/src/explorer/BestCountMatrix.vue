<!--
  Which ascension count finishes first, account by account: a table, not a chart.

  One row per account, one column per ascension count. Each cell is that account's best standing plan
  at that count as days after the account's own earliest finish, so a row compares finish dates of one
  account's plans (THE RULE) and nothing compares down a column. The rows are ordered by starting TE,
  Clothed TE or delivery score, so whether the winning count moves with where an account is or with its
  gear shows as the dark cells drifting across the table.

  THE FILL is one hue: darkest at the account's earliest finish, palest at 20 days or more behind. THE
  BORDER is how the run behind the cell searched (bestCount.ts `gradeStyle`): a best count found only by
  a coarse or staged search is visibly weaker than one from a finished box at every TE. The logic is in
  bestCount.ts; this file only draws it.
-->
<template>
  <div class="space-y-2">
    <div v-if="table.rows.length" class="flex flex-wrap items-center gap-1.5">
      <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Order accounts by</span>
      <button
        v-for="opt in ORDERS"
        :key="opt.id"
        type="button"
        class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
        :class="
          order === opt.id
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
        "
        :aria-pressed="order === opt.id"
        @click="order = opt.id"
      >
        {{ opt.label }}
      </button>
      <span class="text-[10px] text-slate-400">lowest first, from each account's earliest-finish run</span>
    </div>

    <div v-if="table.rows.length" class="overflow-x-auto">
      <table class="text-[11px] border-separate [border-spacing:3px]">
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <th rowspan="2" class="sticky left-0 z-10 bg-white text-left align-bottom py-1 pr-3">Account</th>
            <th :colspan="table.columns.length" class="text-center pt-1">Ascensions</th>
          </tr>
          <tr>
            <th
              v-for="col in table.columns"
              :key="col.key"
              scope="col"
              class="text-center text-[11px] font-black w-[5rem] min-w-[5rem]"
              :class="col.tried ? 'text-slate-700' : 'text-slate-300'"
              :title="
                col.tried ? `${col.label} ascensions` : `Nobody here tried ${col.label.replace('–', ' to ')} ascensions`
              "
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in table.rows" :key="row.key">
            <!-- Only the name refuses to wrap: on a phone the rest wraps under it, so the pinned
                 column leaves room for the counts. -->
            <th scope="row" class="sticky left-0 z-10 bg-white text-left font-normal py-0.5 pr-3">
              <span class="whitespace-nowrap"
                ><span
                  class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                  :style="{ background: colorAt(row.color) }"
                  aria-hidden="true"
                /><b class="text-slate-700">{{ row.label }}</b></span
              >
              <div class="text-[10px] text-slate-400">
                <template v-for="(part, k) in gearParts(row)" :key="part.id"
                  >{{ k ? ' · ' : ''
                  }}<span :class="part.id === order ? 'font-black text-slate-600' : ''">{{ part.text }}</span></template
                >
              </div>
              <div v-if="row.anchor && !row.anchorShown" class="text-[10px] text-slate-400">
                earliest finish: {{ row.anchor.row.ascensions }} asc., not in this table
              </div>
              <div v-else-if="!row.anchor" class="text-[10px] text-slate-400">no finish still stands</div>
            </th>
            <td v-for="cell in row.cells" :key="cell.column.key" class="p-0" :title="cellTitle(row, cell, viewZone)">
              <div
                class="h-7 rounded flex items-center justify-center px-1 font-bold whitespace-nowrap [background-clip:padding-box]"
                :style="cellStyle(cell)"
              >
                <span
                  v-if="cell.text"
                  :class="cell.style === 'hatched' ? 'rounded px-0.5' : ''"
                  :style="cell.style === 'hatched' ? { background: fillOf(cell).color } : undefined"
                  >{{ cell.text }}</span
                >
                <i v-else-if="cell.state === 'hidden'" class="text-[10px] font-normal text-slate-400">hidden</i>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="text-[10px] text-slate-500">
            <th scope="row" class="sticky left-0 z-10 bg-white text-left font-bold pt-1 pr-3 whitespace-nowrap">
              Accounts that tried it
            </th>
            <td
              v-for="(t, i) in table.tried"
              :key="table.columns[i].key"
              class="text-center pt-1 font-bold"
              :class="t.accounts ? 'text-slate-600' : 'text-slate-300'"
              :title="t.accounts ? t.labels.join(', ') : 'Nobody here'"
            >
              {{ t.accounts }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-else class="px-4 py-8 text-center text-[11px] text-slate-400">No run to this target yet.</p>

    <div
      v-if="table.rows.length"
      class="space-y-1.5 px-1 text-[10px] text-slate-500"
      aria-label="How to read the fills and borders"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="font-black text-slate-400 uppercase tracking-widest text-[9px]"
          >Fill: days after the account's earliest finish</span
        >
        <span v-for="bin in FILL_BINS" :key="bin.label" class="inline-flex items-center gap-1">
          <span class="inline-block w-5 h-3 rounded-sm" :style="{ background: bin.color }" aria-hidden="true" />
          {{ bin.label }}
        </span>
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-block w-5 h-3 rounded-sm border border-slate-200"
            :style="{ background: ONLY_FILL.color }"
            aria-hidden="true"
          />
          only count with a finish (nothing to compare)
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="font-black text-slate-400 uppercase tracking-widest text-[9px]">Border: how the run searched</span>
        <span v-for="g in GRADE_KEY" :key="g.style" class="inline-flex items-center gap-1">
          <span
            class="inline-block w-5 h-3 rounded-sm [background-clip:padding-box]"
            :style="keyStyle(g.style)"
            aria-hidden="true"
          />
          {{ g.text }}
        </span>
      </div>
      <p>
        <b class="text-slate-600">—</b> tried, but no finish at that count still stands (a what-if, a replaced plan, one
        the player has fallen behind; the reason is on hover). <i class="text-slate-400">hidden</i>: tried, but with no
        finished box at that count, so Proofs only leaves those runs out. Blank: not tried. Hover a cell for the chain,
        its finish date, how it searched and how the step from the next count down weighs up.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { localZone } from '@/lib/leaderboardRank';
import type { CollectorRow } from './collector';
import type { FinishJudgement } from './analysis';
import {
  bestCountTable,
  cellTitle,
  FILL_BINS,
  GRADE_KEY,
  ONLY_FILL,
  type BestCountCell,
  type BestCountOrder,
  type BestCountRow,
  type GradeStyle,
} from './bestCount';
import { colorAt } from './palette';

const props = defineProps<{
  /** The runs the page shows at the picked target (Proofs only applied), every count. */
  rows: CollectorRow[];
  /**
   * The same runs before Proofs only (ChainExplorer's `usable` at the target), so a count an account
   * tried only with runs Proofs only hides says so instead of "not tried". Optional.
   */
  tried?: CollectorRow[];
  /** The page's `judgeFinishes`. */
  judged: FinishJudgement;
  accountColors: Map<string, number>;
  accountLabels: Map<string, string>;
}>();

const ORDERS: { id: BestCountOrder; label: string }[] = [
  { id: 'te', label: 'TE' },
  { id: 'cte', label: 'Clothed TE' },
  { id: 'delivery', label: 'Delivery' },
];
const order = ref<BestCountOrder>('te');

/** Finish dates in the viewer's timezone, as everywhere else on the page. */
const viewZone = localZone();

const table = computed(() =>
  bestCountTable(props.rows, props.judged, {
    labels: props.accountLabels,
    colors: props.accountColors,
    order: order.value,
    tried: props.tried,
  })
);

/** The row label's second line, piece by piece, so the order in force can be bold. */
function gearParts(row: BestCountRow): { id: BestCountOrder; text: string }[] {
  const parts: { id: BestCountOrder; text: string }[] = [];
  parts.push({ id: 'te', text: row.te != null ? `TE ${row.te}` : 'TE ?' });
  parts.push({ id: 'cte', text: row.clothedTE != null ? `CTE ${row.clothedTE.toFixed(1)}` : 'CTE ?' });
  parts.push({
    id: 'delivery',
    text: row.delivery != null ? `delivery ${Math.round(row.delivery * 100)}%` : 'delivery ?',
  });
  return parts;
}

/** Border colour: dark enough to read against the white gap between cells, whatever the fill. */
const EDGE = '#334155';
const RING = 'inset 0 0 0 1px #ffffff';

function fillOf(cell: BestCountCell): { color: string; ink: string } {
  return cell.bin >= 0 ? FILL_BINS[cell.bin] : ONLY_FILL;
}

/** Diagonal stripes over the fill: white on the dark steps, dark on the pale ones. */
function hatch(fill: { color: string; ink: string }): string {
  const stripe = fill.ink === '#ffffff' ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.3)';
  return `repeating-linear-gradient(135deg, transparent 0 3px, ${stripe} 3px 5px)`;
}

function cellStyle(cell: BestCountCell): Record<string, string> {
  if (cell.state === 'untried' || cell.state === 'hidden') return { border: '2px solid transparent' };
  if (cell.state === 'not-standing') return { border: '2px solid transparent', color: '#94a3b8' };
  const fill = fillOf(cell);
  const style = cell.style ?? 'solid';
  if (style === 'hatched') {
    return {
      border: '2px solid transparent',
      backgroundColor: fill.color,
      backgroundImage: hatch(fill),
      color: fill.ink,
    };
  }
  // A white hairline inside the border, so a dashed or dotted edge reads on the darkest fill too.
  return { border: `2px ${style} ${EDGE}`, boxShadow: RING, backgroundColor: fill.color, color: fill.ink };
}

/** The key's samples, on a mid step of the ramp. */
function keyStyle(style: GradeStyle): Record<string, string> {
  const fill = FILL_BINS[3];
  if (style === 'hatched') {
    return { border: '2px solid transparent', backgroundColor: fill.color, backgroundImage: hatch(fill) };
  }
  return { border: `2px ${style} ${EDGE}`, boxShadow: RING, backgroundColor: fill.color };
}
</script>
