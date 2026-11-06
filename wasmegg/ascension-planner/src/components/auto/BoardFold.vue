<!--
  A "How it's judged ›" fold on the Leaderboard (UX fluff review 2, 5 Nov 2026): the views' long intros became one line,
  and the rest of each sits here, closed at first and not remembered. A real button (aria-expanded, aria-controls, 44 px
  tall on a phone, a visible focus ring) over a body that is `hidden="until-found"` while closed, so find in page still
  reaches the words inside.
-->
<template>
  <div :data-testid="testid">
    <button
      type="button"
      class="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 py-1 text-left text-small font-bold text-slate-600 hover:text-indigo-800 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="bodyId"
      :data-testid="`${testid}-button`"
      @click="open = !open"
    >
      <span aria-hidden="true" class="inline-block transition-transform" :class="open ? 'rotate-90' : ''">›</span>
      <span>{{ title }}</span>
    </button>
    <div
      :id="bodyId"
      :hidden.attr="open ? undefined : 'until-found'"
      class="mt-1 text-small text-slate-500"
      @beforematch="open = true"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  /** The button's words, e.g. "How it's judged". */
  title: string;
  /** The fold's test id; its body's id is `${testid}-body`. Unique on the page. */
  testid: string;
}>();

const open = ref(false);
const bodyId = `${props.testid}-body`;
</script>
