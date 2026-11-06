<!--
  Under Custom's boxes (By a date, DeadlinePanel.vue): what a box holds, as a lead line, a Format example and one fact
  per bullet, rather than one paragraph (Jordan, ux35-e, 28 Oct 2026: "reads as a wall of text"). Same facts as before; the
  list is in CustomBoxesHelp.spec.ts.
-->
<template>
  <div class="max-w-prose space-y-1.5 text-body text-slate-500" data-testid="custom-boxes-help">
    <p data-testid="custom-boxes-lead">
      Each box is one range of TEs per ascension before the last, like {{ fastestName(finalTe) }} ›
      {{ NAMES.fullFirst }}'s.
    </p>
    <!-- The Format and its facts behind a "Format ?" tip (UX fluff review 2, 5 Nov 2026, item C-pre10), word for word. -->
    <p class="flex items-center gap-1.5" data-testid="custom-boxes-format">
      <span class="label text-slate-400">Format</span>
      <HelpTip
        ><span
          class="rounded bg-slate-100 px-1.5 tabular-nums text-slate-700 whitespace-nowrap"
          data-testid="custom-boxes-example"
          >210-230:1; 240-260:1</span
        >{{ ' ' }}Put <span class="tabular-nums">;</span> between ascensions. Each range is
        <span class="tabular-nums">lo-hi:step</span>, a single value, or several values with commas. Boxes with other
        ascension counts all run from the same click. A 1- or 2-ascension box costs next to nothing.</HelpTip
      >
    </p>
    <p v-if="from" class="text-small" data-testid="custom-boxes-from">{{ from }}</p>
  </div>
</template>

<script setup lang="ts">
import { NAMES, fastestName } from '@/lib/siteNav';
import HelpTip from './HelpTip.vue';

defineProps<{
  /** The screen's final TE (the store's `finalTE`), for "like Fastest to 490 TE › Custom's". */
  finalTe: number;
  /** Where the boxes were filled from (the panel's `suggestFrom`), '' when typed by hand. */
  from: string;
}>();
</script>
