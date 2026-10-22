<!--
  My runs' filters and sort (lib/myRuns.ts), as one row of small selects that wraps. MyRunsList shows it
  twice: folded under "Filters (n active)" on a phone, inline from sm up. Both edit the same filters.
-->
<template>
  <div class="flex flex-wrap items-end gap-3" role="group" aria-label="Filter your runs">
    <label class="block">
      <span :class="LABEL">Kind</span>
      <select
        :value="modelValue.kind"
        :class="SELECT"
        data-testid="my-runs-kind"
        @change="set('kind', pickKind($event))"
      >
        <option value="all">All</option>
        <option value="eggday">Egg Day {{ eggDayYear }}</option>
        <option value="race">Race to {{ modelValue.target ?? 'a target TE' }}</option>
        <option value="dates">By a date</option>
      </select>
    </label>
    <label v-if="modelValue.kind === 'race'" class="block">
      <span :class="LABEL">Target TE</span>
      <select
        :value="modelValue.target == null ? '' : String(modelValue.target)"
        :class="SELECT"
        data-testid="my-runs-target"
        @change="set('target', numberOrNull($event))"
      >
        <option value="">any</option>
        <option v-for="te in targets" :key="te" :value="String(te)">{{ te }}</option>
      </select>
    </label>
    <label class="block">
      <span :class="LABEL">Awake hours</span>
      <select :value="modelValue.hours" :class="SELECT" @change="set('hours', pickHours($event))">
        <option value="either">either</option>
        <option value="any">any time of day</option>
        <option value="awake">planned around awake hours</option>
      </select>
    </label>
    <label class="block">
      <span :class="LABEL">Ascensions</span>
      <select
        :value="modelValue.ascensions == null ? '' : String(modelValue.ascensions)"
        :class="SELECT"
        @change="set('ascensions', numberOrNull($event))"
      >
        <option value="">any</option>
        <option v-for="n in MAX_ASCENSIONS_CHOICE" :key="n" :value="String(n)">{{ n }}</option>
      </select>
    </label>
    <label class="block">
      <span :class="LABEL" title="Routes that stop at every number you type, e.g. 200 250">Stops</span>
      <input
        :value="modelValue.stops"
        type="text"
        inputmode="numeric"
        placeholder="e.g. 200 250"
        aria-label="Routes with these stops"
        class="w-28 rounded-lg border-indigo-200 text-xs font-bold text-slate-700 py-1.5"
        data-testid="my-runs-stops"
        @input="set('stops', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="block">
      <span :class="LABEL">Sort</span>
      <select :value="modelValue.sort" :class="SELECT" @change="set('sort', pickSort($event))">
        <option v-for="(label, key) in SORT_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <button
      v-if="activeFilterCount(modelValue)"
      type="button"
      class="text-[10px] font-black uppercase tracking-widest text-indigo-700/70 hover:text-indigo-900 pb-2"
      @click="emit('update:modelValue', { ...DEFAULT_MY_RUNS_FILTERS, sort: modelValue.sort })"
    >
      Clear
    </button>
  </div>
</template>

<script setup lang="ts">
import {
  DEFAULT_MY_RUNS_FILTERS,
  MAX_ASCENSIONS_CHOICE,
  SORT_LABELS,
  activeFilterCount,
  type HoursFilter,
  type KindFilter,
  type MyRunsFilters,
  type RunSort,
} from '@/lib/myRuns';

const props = defineProps<{
  modelValue: MyRunsFilters;
  /** The race targets among the runs, for the Target TE choice. */
  targets: number[];
  eggDayYear: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [filters: MyRunsFilters] }>();

const LABEL = 'block text-[9px] font-black uppercase tracking-widest text-indigo-700/70 mb-1';
const SELECT = 'rounded-lg border-indigo-200 text-xs font-bold text-slate-700 py-1.5';

function set<K extends keyof MyRunsFilters>(key: K, value: MyRunsFilters[K]): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value });
}
const valueOf = (e: Event): string => (e.target as HTMLSelectElement).value;
const numberOrNull = (e: Event): number | null => (valueOf(e) ? Number(valueOf(e)) : null);
const pickKind = (e: Event) => valueOf(e) as KindFilter;
const pickHours = (e: Event) => valueOf(e) as HoursFilter;
const pickSort = (e: Event) => valueOf(e) as RunSort;
</script>
