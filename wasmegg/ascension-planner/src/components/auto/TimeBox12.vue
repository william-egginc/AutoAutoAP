<!--
  A time of day as 12-hour text ("9:00 AM"), not the browser's own picker (R11, Jordan 21 Nov 2026). The screen keeps
  "HH:MM" (v-model); what is typed is read on Enter or leaving the box (lib/time12.ts: "9am", "9:30 pm", "21:00" all
  work). Something that is not a time goes back to the last good one, so the screen never holds nonsense.
-->
<template>
  <input
    :value="shown"
    type="text"
    inputmode="text"
    autocomplete="off"
    spellcheck="false"
    :disabled="disabled"
    aria-label="Time of day, for example 9:00 AM"
    class="min-h-[44px] sm:min-h-0 w-28 rounded-lg border-slate-200 text-base sm:text-body font-bold"
    data-testid="time-box"
    @input="draft = ($event.target as HTMLInputElement).value"
    @change="commit(($event.target as HTMLInputElement))"
    @keydown.enter="commit($event.target as HTMLInputElement)"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatTime12, parseTime12 } from '@/lib/time12';

const model = defineModel<string>({ required: true });
defineProps<{ disabled?: boolean }>();

/** What is being typed, until it is read. */
const draft = ref<string | null>(null);
const shown = computed(() => draft.value ?? formatTime12(model.value));

function commit(el: HTMLInputElement): void {
  const kept = draft.value === null ? null : parseTime12(draft.value);
  if (kept) model.value = kept;
  draft.value = null;
  // Show the time read (or the last good one), whatever was typed.
  el.value = formatTime12(model.value);
}
</script>
