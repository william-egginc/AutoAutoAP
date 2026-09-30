<!-- How dates and hours are shown on this site, in this browser (lib/displayTime.ts). -->
<template>
  <label class="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
    <span class="font-bold text-slate-700">Show dates as</span>
    <select v-model="dateStyle" class="rounded-md border-slate-300 py-1 text-[11px] font-bold text-slate-800">
      <option value="local">{{ example('local') }} (your browser's format)</option>
      <option value="iso">{{ example('iso') }}</option>
    </select>
  </label>
</template>

<script setup lang="ts">
import { dateStyle, showDateTime, type DateStyle } from '@/lib/displayTime';

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** 18 March 2027, 13:15 here: the day is past 12, so a day/month mix-up would show. */
const sample = new Date(2027, 2, 18, 13, 15).getTime() / 1000;
function example(style: DateStyle): string {
  return showDateTime(sample, tz, style);
}
</script>
