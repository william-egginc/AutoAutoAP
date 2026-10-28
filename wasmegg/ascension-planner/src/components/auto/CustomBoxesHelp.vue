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
    <p data-testid="custom-boxes-format">
      <span class="label text-slate-400">Format</span>{{ ' ' }}<span
        class="rounded bg-slate-100 px-1.5 tabular-nums text-slate-700 whitespace-nowrap"
        data-testid="custom-boxes-example"
        >210-230:1; 240-260:1</span
      >
    </p>
    <!-- One fact per line (Jordan, ux35-e: bullets over prose). -->
    <ul class="list-disc space-y-0.5 pl-5" data-testid="custom-boxes-points">
      <li>Put <span class="tabular-nums">;</span> between ascensions.</li>
      <li>
        Each range is <span class="tabular-nums">lo-hi:step</span>, a single value, or several values with commas.
      </li>
      <li>Boxes with other ascension counts all run from the same click.</li>
      <li>A 1- or 2-ascension box costs next to nothing.</li>
    </ul>
    <p v-if="from" class="text-small" data-testid="custom-boxes-from">{{ from }}</p>
  </div>
</template>

<script setup lang="ts">
import { NAMES, fastestName } from '@/lib/siteNav';

defineProps<{
  /** The screen's final TE (the store's `finalTE`), for "like Fastest to 490 TE › Custom's". */
  finalTe: number;
  /** Where the boxes were filled from (the panel's `suggestFrom`), '' when typed by hand. */
  from: string;
}>();
</script>
