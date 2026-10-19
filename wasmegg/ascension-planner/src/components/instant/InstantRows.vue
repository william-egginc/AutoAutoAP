<!--
  The instant answer's rows: the best route for each number of ascensions (instant/instantAnswer.ts
  `rowsShown`), each with "Simulate this plan" (Joo's Auto Planner on that route).
-->
<template>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs" data-testid="instant-rows">
      <thead>
        <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400">
          <th class="py-2 pr-3">Ascensions</th>
          <th class="py-2 pr-3">Route (TE stops)</th>
          <th class="py-2 pr-3">{{ dated ? 'TE by then' : 'Reaches 490' }}</th>
          <th class="py-2 pr-3">{{ dated ? 'Last ascension' : 'Days' }}</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.ascensions"
          class="border-t border-slate-100"
          :class="row.best ? 'bg-indigo-50/70' : ''"
          data-testid="instant-row"
        >
          <td class="py-2 pr-3 font-black text-slate-800">
            {{ row.ascensions }}
            <span v-if="row.best" class="ml-1 text-[9px] font-black uppercase tracking-widest text-indigo-600">best</span>
          </td>
          <td class="py-2 pr-3 font-mono text-slate-700">{{ row.route.chain.join(' → ') }}</td>
          <td class="py-2 pr-3 text-slate-700">
            <template v-if="dated">{{ row.endTE }} TE</template>
            <template v-else>{{ when(row.route.end) }}</template>
          </td>
          <td class="py-2 pr-3 text-slate-700">
            <template v-if="dated">{{ when(lastAscension(row)) }}</template>
            <template v-else>{{ (row.route.seconds / 86400).toFixed(1) }} d</template>
          </td>
          <td class="py-2 text-right">
            <button
              type="button"
              class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-600 text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
              data-testid="instant-simulate"
              @click="emit('simulate', row)"
            >
              Simulate this plan
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { AnswerRow } from '@/instant/instantAnswer';

const props = defineProps<{
  rows: AnswerRow[];
  /** By a date: the rows say the TE reached and when the last ascension is made. */
  dated: boolean;
  timezone: string;
}>();
const emit = defineEmits<{ simulate: [row: AnswerRow] }>();

/** When the route's last ascension starts (By a date: the prestige that has to happen by the date). */
function lastAscension(row: AnswerRow): number {
  return row.route.legs[row.route.legs.length - 1]?.end ?? row.route.end;
}

function when(unix: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: props.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(unix * 1000));
}
</script>
