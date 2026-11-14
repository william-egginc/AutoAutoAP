<!--
  THE INTRO IN A "?" (Jordan, 14 Nov 2026: the tabs are the page headings and bigger, so the intro line under the switch
  moves into a "?" beside the Target TE | By a date switch). The words are the screens' own, unchanged (lib/layoutWords.ts
  fastestLine, BYDATE_LINE), passed in. Closed by default; a real button with aria-expanded and aria-controls, a 44 px tap
  area with a 24 px circle. `display: contents`: the "?" sits on the switch's row, the panel takes a row of its own.
-->
<template>
  <span class="contents">
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-label="GOAL_HELP_LABEL"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="id"
      data-testid="goal-help"
      @click="open = !open"
    >
      <span aria-hidden="true" class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-400 text-body font-bold leading-none text-slate-600 hover:border-slate-600 hover:text-slate-800">?</span>
    </button>
    <div :id="id" class="basis-full min-w-0 text-center" :hidden="!open" data-testid="goal-help-panel">
      <p class="mx-auto text-body text-slate-600 max-w-prose" :data-testid="testid">{{ text }}</p>
    </div>
  </span>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { GOAL_HELP_LABEL } from '@/lib/layoutWords';

defineProps<{ /** The screen's intro, word for word. */ text: string; /** Its test id (fastest-line, bydate-line). */ testid?: string }>();
const open = ref(false);
const id = `goal-help-${useId()}`;
</script>
