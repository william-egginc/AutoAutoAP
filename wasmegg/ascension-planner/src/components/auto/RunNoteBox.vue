<template>
  <label class="block">
    <span class="font-bold">Note on this run</span>
    <span class="text-slate-500">
      (optional): what you were trying or testing. Kept with the run and its CSV, and sent with it when it goes to the
      board.</span
    >
    <textarea
      v-model="note"
      :maxlength="MAX_NOTE"
      :disabled="disabled"
      rows="2"
      placeholder="e.g. testing 3 sales on the first ascension"
      aria-label="Note on this run"
      class="mt-1 block w-full rounded-lg border-indigo-200 text-sm font-normal text-slate-800 disabled:opacity-40"
    ></textarea>
    <span class="block text-right text-xs text-slate-500">{{ note.length }} / {{ MAX_NOTE }}</span>
  </label>
</template>

<script setup lang="ts">
// The run note box (store `runNote`): one per place a run starts. Plain text; submission.ts
// `cleanNote` makes it one line without player ids when the run captures it.
import { MAX_NOTE } from '@/search/submission';

defineProps<{ disabled?: boolean }>();
const note = defineModel<string>({ required: true });
</script>
