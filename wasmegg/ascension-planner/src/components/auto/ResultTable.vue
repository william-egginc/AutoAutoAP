<!--
  A small table of results under a search's answer, the same look on every screen: a heading line
  (`title`, or the `title` slot when it needs markup), optional column heads, and one row per result
  whose cells are the screen's (default slot, given `row` and `index`). By a date's top routes and best
  per stop count, and the Full sweep's chains from the last click.

  With an `expand` slot each row gets an arrow in its first cell, and the open row's drill-down (the slot,
  given `row`) shows in a full-width row under it, stacked text that wraps on a phone. One row open at a
  time, held here. `canExpand` leaves the arrow off rows with nothing to show.
-->
<template>
  <div class="overflow-x-auto">
    <p v-if="title || $slots.title" class="label text-slate-500 pb-1">
      <slot name="title">{{ title }}</slot>
    </p>
    <table class="w-full text-small tabular-nums whitespace-nowrap">
      <thead v-if="columns.length">
        <tr class="text-left label text-slate-400">
          <th v-if="$slots.expand" class="w-4 py-1"><span class="sr-only">Details</span></th>
          <th v-for="c in columns" :key="c" class="pr-4 py-1">{{ c }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, i) in rows" :key="rowKey(row, i)">
          <tr class="border-t border-slate-100">
            <td v-if="$slots.expand" class="w-4 py-1 pr-1 align-top">
              <button
                v-if="!canExpand || canExpand(row)"
                type="button"
                class="px-0.5 text-slate-400 hover:text-emerald-700"
                :aria-expanded="openKey === rowKey(row, i)"
                :aria-label="`Show when each stop of ${label(row)} happens`"
                data-testid="result-row-expand"
                @click="toggle(rowKey(row, i))"
              >
                {{ openKey === rowKey(row, i) ? '⌄' : '›' }}
              </button>
            </td>
            <slot :row="row" :index="i" />
          </tr>
          <tr v-if="$slots.expand && openKey === rowKey(row, i)" class="bg-slate-50" data-testid="result-row-detail">
            <td :colspan="100" class="px-2 py-2 whitespace-normal">
              <slot name="expand" :row="row" :index="i" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts" generic="T">
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    rows: T[];
    rowKey: (row: T, index: number) => string | number;
    title?: string;
    columns?: string[];
    /** With the `expand` slot: which rows get an arrow (all when absent). */
    canExpand?: (row: T) => boolean;
    /** The row open at first (its key), e.g. a spec's; none by default. */
    initialOpen?: string | number | null;
  }>(),
  { title: '', columns: () => [], canExpand: undefined, initialOpen: null }
);
defineSlots<{
  default(props: { row: T; index: number }): unknown;
  title?(): unknown;
  expand?(props: { row: T; index: number }): unknown;
}>();

/** The open row's key; null for none. */
const openKey = ref<string | number | null>(props.initialOpen);
function toggle(k: string | number): void {
  openKey.value = openKey.value === k ? null : k;
}
/** The route a row stands for, for the arrow's label (rows here are routes with a `chain`). */
function label(row: T): string {
  const chain = (row as { chain?: unknown }).chain;
  return Array.isArray(chain) ? chain.join(' ') : 'this route';
}
</script>
