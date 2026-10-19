<!--
  Find a run's Filters, built but DISABLED: they need Joo's planner to support playing hours (a start
  delayed to 5 am, avoided dates as time off). Every control is disabled and says so; every row is any
  hour for now.
-->
<template>
  <section
    class="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-4 sm:p-6 space-y-3"
    aria-disabled="true"
    data-testid="find-filters"
  >
    <h2 class="text-[11px] font-black text-slate-500 uppercase tracking-widest">Filters</h2>
    <fieldset disabled aria-disabled="true" class="opacity-60 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      <legend class="sr-only">Filters (coming)</legend>
      <label class="flex items-center gap-1.5">
        Ascensions
        <select class="min-h-[44px] min-w-[3.5rem] sm:min-h-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 cursor-not-allowed" aria-label="Fewest ascensions">
          <option v-for="n in counts" :key="n" :selected="n === 4">{{ n }}</option>
        </select>
        to
        <select class="min-h-[44px] min-w-[3.5rem] sm:min-h-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 cursor-not-allowed" aria-label="Most ascensions">
          <option v-for="n in counts" :key="n" :selected="n === 9">{{ n }}</option>
        </select>
      </label>
      <label class="flex items-center gap-1.5 min-h-[44px] sm:min-h-0">
        <input type="checkbox" class="cursor-not-allowed" />
        No ascension starts between 10 pm and 5 am
      </label>
      <label class="flex items-center gap-1.5">
        Avoid dates
        <input type="date" class="min-h-[44px] sm:min-h-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 cursor-not-allowed" />
      </label>
      <label class="flex items-center gap-1.5">
        Gear
        <select class="min-h-[44px] min-w-[3.5rem] sm:min-h-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 cursor-not-allowed">
          <option>your gear</option>
        </select>
      </label>
    </fieldset>
    <p class="text-[11px] text-slate-500" data-testid="find-filters-note">
      Filters are coming: they need Joo's planner to support playing hours. For now every row is any hour.
    </p>
  </section>
</template>

<script setup lang="ts">
const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
</script>
