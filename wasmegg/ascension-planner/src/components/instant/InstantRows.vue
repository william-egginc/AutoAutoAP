<!--
  Find a run's rows: the best route for each number of ascensions (instant/instantAnswer.ts `rowsShown`,
  the best first), each saying how far it is from the best. A row opens to its ascensions' starts and
  ends (estimates: the route finder's own leg times, instant/findRun.ts `ascensionTimes`) and the
  buttons. One layout: a wrapped line per row on a phone, one line on a computer; the opened row's
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
            <tr v-for="a in ascensionTimes(row.route)" :key="a.n" class="border-t border-slate-100 align-top">
              <td class="py-1.5 pr-2 whitespace-nowrap">{{ a.n }} · {{ a.to }} TE</td>
              <td class="py-1.5 pr-2">{{ atText(a.start, timezone, { weekday: true }) }}</td>
              <td class="py-1.5">{{ atText(a.end, timezone, { weekday: true }) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-[11px] text-slate-500">
          <span class="text-amber-800 bg-amber-50 rounded px-1.5 py-0.5 font-bold" data-testid="find-estimate">estimate</span>
          from the instant answer’s table, any hour.
        </p>
        <div class="flex flex-col sm:flex-row sm:flex-wrap gap-2">
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
          <!-- Part B placeholders: the exact check and the calendar. -->
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Coming next"
            class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest cursor-not-allowed"
            data-testid="find-check-exactly"
          >
            Check exactly
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Coming next"
            class="w-full sm:w-auto min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest cursor-not-allowed"
            data-testid="find-calendar"
          >
            Add shifts to calendar
          </button>
        </div>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { AnswerRow } from '@/instant/instantAnswer';
import { ascensionTimes, atText, behindText, finishOf } from '@/instant/findRun';

const props = defineProps<{
  /** The best first. */
  rows: AnswerRow[];
  /** By a date: the rows say the TE reached and when the last ascension ends. */
  dated: boolean;
  timezone: string;
  /** Routes already saved for this goal (stops joined with spaces). */
  saved?: string[];
  /** The row opened at first (specs). */
  opened?: number;
}>();
const emit = defineEmits<{ simulate: [row: AnswerRow]; save: [row: AnswerRow] }>();

const open = ref<number | null>(props.opened ?? null);

function behind(row: AnswerRow): string {
  return behindText(row, props.rows, props.dated);
}
function isSaved(row: AnswerRow): boolean {
  return !!props.saved?.includes(row.route.chain.join(' '));
}
</script>
