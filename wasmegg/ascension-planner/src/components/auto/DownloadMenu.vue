<!--
  "Download ▾" on the result cards (UX fluff review 2, 5 Nov 2026, items C5, C8 and D9; mocks fluff2-custom-v1,
  fluff2-bydate-v1): the CSV, the Excel file and (Custom) the diagnostics under one button, in place of two or three
  buttons in the row and a second CSV row under the card. A real button with aria-expanded / aria-controls; the list
  stays in the page (v-show), each item a 44 px button. Escape or a pick closes it. Each screen's own handlers.
-->
<template>
  <div class="relative inline-block" @keydown.esc="open = false">
    <button
      type="button"
      :class="SECONDARY_BUTTON"
      :aria-expanded="open"
      :aria-controls="listId"
      :data-testid="testid"
      @click="open = !open"
    >
      Download ▾
    </button>
    <div
      v-show="open"
      :id="listId"
      class="absolute left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-emerald-200 bg-white p-1 shadow-lg"
    >
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="flex w-full min-h-[44px] items-center rounded-md px-3 py-2 text-left text-body font-bold text-emerald-800 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        :title="item.title"
        :data-testid="item.testid"
        @click="pick(item.key)"
      >
        {{ item.text }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { SECONDARY_BUTTON } from './resultCardStyle';

export interface DownloadItem {
  key: string;
  text: string;
  title?: string;
  testid?: string;
}
defineProps<{ items: DownloadItem[]; testid?: string }>();
const emit = defineEmits<{ pick: [key: string] }>();
const open = ref(false);
const listId = `download-${useId()}`;

function pick(key: string): void {
  open.value = false;
  emit('pick', key);
}
</script>
