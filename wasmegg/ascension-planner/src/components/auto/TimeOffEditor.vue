<!--
  Time off from the virtue farm: Egg Day, a week chasing a legendary deflector on the home farm.
  Each stretch ends the ascension in progress (it keeps the TE it reached), nothing happens while
  away, and coming back is a complete rebuild. The search prices every chain with those gaps in it,
  so the winner is the best plan AROUND the time off, not the best plan with a hole cut in it.
-->
<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-[11px] font-bold text-slate-800">Time off from virtue</span>
      <button
        type="button"
        :disabled="store.isRunning || store.timeOff.length >= 8"
        class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        @click="add"
      >
        Add time off
      </button>
    </div>
    <p class="text-[11px] text-slate-500 leading-relaxed">
      Days you will be off the virtue farm, in the plan's timezone. The ascension you are in ends when the time off
      starts and keeps the TE it has; when you come back it is a complete rebuild. Egg Day (July 14) is the usual one.
    </p>
    <div v-for="(row, i) in store.timeOff" :key="i" class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
        From
        <input
          v-model="row.from"
          type="date"
          :disabled="store.isRunning"
          class="rounded-md border-slate-300 text-[12px] text-slate-800 disabled:opacity-50"
          @change="keepOrder(row)"
        />
      </label>
      <label class="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
        to
        <input
          v-model="row.to"
          type="date"
          :min="row.from"
          :disabled="store.isRunning"
          class="rounded-md border-slate-300 text-[12px] text-slate-800 disabled:opacity-50"
        />
      </label>
      <span class="text-[10px] text-slate-400">{{ days(row) }}</span>
      <button
        type="button"
        :disabled="store.isRunning"
        class="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-600 disabled:opacity-40"
        @click="store.timeOff.splice(i, 1)"
      >
        Remove
      </button>
    </div>
    <p v-if="store.isRunning && store.timeOff.length" class="text-[11px] font-semibold text-amber-700">
      Locked while a run is going: time off changes which chain is fastest.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { nextDate, type TimeOffDates } from '@/search/timeOff';

const store = useChainSearchStore();

/** Starts on the next Egg Day, the one date nearly everybody takes off. */
function add(): void {
  const now = new Date();
  const year = now.getMonth() > 6 || (now.getMonth() === 6 && now.getDate() > 14) ? now.getFullYear() + 1 : now.getFullYear();
  const eggDay = `${year}-07-14`;
  store.timeOff.push({ from: eggDay, to: eggDay });
}

/** A new start after the old end would leave the row backwards; follow it rather than drop the row. */
function keepOrder(row: TimeOffDates): void {
  if (!row.to || row.to < row.from) row.to = row.from;
}

function days(row: TimeOffDates): string {
  if (!row.from || !row.to || row.to < row.from) return '';
  let n = 1;
  for (let d = row.from; d < row.to && n < 400; d = nextDate(d)) n++;
  return n === 1 ? '1 day' : `${n} days`;
}
</script>
