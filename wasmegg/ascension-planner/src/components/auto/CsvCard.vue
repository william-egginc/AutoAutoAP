<!--
  Download CSV (and on the Full sweep, Download diagnostics) under a search's result: the same row on
  Smart search and the Full sweep, with each screen's words on what the file holds (`csv` slot). The
  handlers are composables/useRunDownloads.ts, so a failed download says so here on either screen.
  By a date's CSV is a button in its result row (a different file, the same handler).
-->
<template>
  <div class="flex flex-wrap items-center gap-3">
    <template v-if="csv">
      <button
        type="button"
        class="px-4 py-2 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
        @click="downloadCsv"
      >
        Download CSV
      </button>
      <slot name="csv" />
    </template>
    <!-- The input side. The CSV records what came OUT; when a result looks wrong the question is
         always what went IN. -->
    <template v-if="diagnostics">
      <button
        type="button"
        class="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
        @click="downloadDiagnostics"
      >
        Download diagnostics
      </button>
      <span class="text-[11px] text-slate-500">
        A small JSON file of what this run was <em>given</em>: backup age, TE, research and loadout. No save data and no
        player ID. Attach it when you report a result that looks wrong.
      </span>
    </template>
    <p v-if="downloadError" class="w-full text-[11px] font-semibold text-red-700">{{ downloadError }}</p>
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { useRunDownloads } from '@/composables/useRunDownloads';

withDefaults(defineProps<{ csv?: boolean; diagnostics?: boolean }>(), { csv: true, diagnostics: false });
const { downloadError, downloadCsv, downloadDiagnostics } = useRunDownloads(useChainSearchStore());
</script>
