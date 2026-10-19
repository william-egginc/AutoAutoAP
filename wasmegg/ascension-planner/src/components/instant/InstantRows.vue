<!--
  Find a run's rows: the best route for each number of ascensions (instant/instantAnswer.ts `rowsShown`,
  the best first), each saying how far it is from the best. A row opens to its ascensions' starts and
  ends (estimates: the route finder's own leg times, instant/findRun.ts `ascensionTimes`, replaced by
  the exact ones once Check exactly ran, ExactCheck.vue) and the buttons. One layout: a wrapped line per row on a phone, one line on a computer; the opened row's
  buttons stack full width (44 px) under 640 px.
-->
<template>
  <ul class="divide-y divide-slate-100 border-t border-slate-100" data-testid="find-rows">
    <li v-for="row in rows" :key="row.ascensions" data-testid="find-row">
      <button
        type="button"
        class="w-full min-h-[44px] py-2 text-left flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-700 hover:bg-slate-50 rounded-lg"
        :aria-expanded="open === row.ascensions"
        data-testid="find-row-toggle"
        @click="open = open === row.ascensions ? null : row.ascensions"
      >
        <span class="text-slate-400 w-3" aria-hidden="true">{{ open === row.ascensions ? '▾' : '▸' }}</span>
        <span class="font-black text-slate-900">{{ row.ascensions }} asc</span>
        <span class="font-mono font-bold text-slate-900 tracking-wide break-words min-w-0">{{ row.route.chain.join(' ') }}</span>
        <span>
          <template v-if="dated">{{ row.endTE }} TE · </template>{{ atText(finishOf(row, dated), timezone, { year: true }) }}
        </span>
        <span
          class="font-bold"
          :class="behind(row) === 'the best' ? 'text-emerald-700' : 'text-slate-900'"
          data-testid="find-behind"
          >· {{ behind(row) }}</span
        >
      </button>

      <div v-if="open === row.ascensions" class="pl-5 pb-3 space-y-3" data-testid="find-open">
        <table class="w-full text-left text-[11px] sm:text-xs" data-testid="find-times">
          <thead>
            <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400">
              <th class="py-1.5 pr-2 font-black">Ascension</th>
              <th class="py-1.5 pr-2 font-black">Starts</th>
              <th class="py-1.5 font-black">Ends</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in timesOf(row)" :key="a.n" class="border-t border-slate-100 align-top">
              <td class="py-1.5 pr-2 whitespace-nowrap">{{ a.n }} · {{ a.to }} TE</td>
              <td class="py-1.5 pr-2">{{ cellText(a.start, timezone, nowSeconds) }}</td>
              <td class="py-1.5">{{ cellText(a.end, timezone, nowSeconds) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="exactOf(row)" class="text-[11px] text-slate-500">
          <span class="text-emerald-800 bg-emerald-50 rounded px-1.5 py-0.5 font-bold" data-testid="find-exact">exact</span>
          from Joo’s simulator on this route (Check exactly).
        </p>
        <p v-else class="text-[11px] text-slate-500">
          <span class="text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 font-bold" data-testid="find-estimate">estimate</span>
          from the instant answer’s table, any hour.
        </p>
        <ExactCheck
          :check-key="keyOf(row)"
          :route="{ chain: row.route.chain, a1: row.route.legs[0]?.label ?? '', start: row.route.legs[0]?.start ?? nowSeconds }"
          :timezone="timezone"
          :save-when="saveWhen ?? ''"
          :start-te="startTe"
          :estimate-finish="finishOf(row, dated)"
          :deadline="deadline"
          :on-done="(r: ExactResult) => emit('checked', row, r)"
          :now="now"
        >
          <button
            type="button"
            class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest"
            data-testid="find-import"
            @click="emit('simulate', row)"
          >
            Import into the planner ›
          </button>
          <button
            type="button"
            class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest"
            :class="
              isSaved(row)
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600'
            "
            :disabled="isSaved(row)"
            data-testid="find-save"
            @click="emit('save', row)"
          >
            {{ isSaved(row) ? 'Saved ✓' : 'Save this plan' }}
          </button>
        </ExactCheck>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { AnswerRow } from '@/instant/instantAnswer';
import { ascensionTimes, atText, behindText, cellText, finishOf, type AscensionTime } from '@/instant/findRun';
import { exactTimes, type ExactResult } from '@/instant/exactCheck';
import { checkResult } from '@/instant/exactClient';
import ExactCheck from './ExactCheck.vue';

const props = defineProps<{
  /** The best first. */
  rows: AnswerRow[];
  /** By a date: the rows say the TE reached and when the last ascension ends. */
  dated: boolean;
  timezone: string;
  /** Routes already saved for this goal (stops joined with spaces). */
  saved?: string[];
  /** Unix seconds now (specs): a cell shows its year when it is not this year's. */
  now?: number;
  /** The row opened at first (specs). */
  opened?: number;
  /** The exact check's memory key for a row (exactCheck.ts checkKey: save, goal, route, build). */
  keyOf?: (row: AnswerRow) => string;
  /** "Oct 19 at 7:03 am": the save, for the calendar's words. */
  saveWhen?: string;
  /** The save's TE, for the calendar titles. */
  startTe?: number;
  /** By a date: the deadline (unix seconds). */
  deadline?: number;
}>();
const emit = defineEmits<{ simulate: [row: AnswerRow]; save: [row: AnswerRow]; checked: [row: AnswerRow, result: ExactResult] }>();

const open = ref<number | null>(props.opened ?? null);
const nowSeconds = props.now ?? Math.floor(Date.now() / 1000);

function behind(row: AnswerRow): string {
  return behindText(row, props.rows, props.dated);
}
function keyOf(row: AnswerRow): string {
  return props.keyOf ? props.keyOf(row) : `${row.route.chain.join(' ')}|${row.route.legs[0]?.label ?? ''}`;
}
/** The row's exact check, when one finished (kept in memory for the page's life). */
function exactOf(row: AnswerRow): ExactResult | null {
  return checkResult(keyOf(row));
}
/** The table's rows: the exact check's when there is one, else the instant estimate's. */
function timesOf(row: AnswerRow): AscensionTime[] {
  const r = exactOf(row);
  return r ? exactTimes(r) : ascensionTimes(row.route);
}
function isSaved(row: AnswerRow): boolean {
  return !!props.saved?.includes(row.route.chain.join(' '));
}
</script>
