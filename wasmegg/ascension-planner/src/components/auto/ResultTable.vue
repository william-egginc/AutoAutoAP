<!--
  A small table of results under a search's answer, the same look on every screen: a heading line
  (`title`, or the `title` slot when it needs markup), optional column heads, and one row per result
  whose cells are the screen's (default slot, given `row` and `index`). By a date's top routes and best
  per stop count, and the Full sweep's chains from the last click.
-->
<template>
  <div class="overflow-x-auto">
    <p v-if="title || $slots.title" class="text-[10px] font-black uppercase tracking-widest text-slate-500 pb-1">
      <slot name="title">{{ title }}</slot>
    </p>
    <table class="w-full text-[11px] tabular-nums">
      <thead v-if="columns.length">
        <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
          <th v-for="c in columns" :key="c" class="pr-4 py-1">{{ c }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="rowKey(row, i)" class="border-t border-slate-100">
          <slot :row="row" :index="i" />
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts" generic="T">
withDefaults(
  defineProps<{
    rows: T[];
    rowKey: (row: T, index: number) => string | number;
    title?: string;
    columns?: string[];
  }>(),
  { title: '', columns: () => [] }
);
defineSlots<{
  default(props: { row: T; index: number }): unknown;
  title?(): unknown;
}>();
</script>
