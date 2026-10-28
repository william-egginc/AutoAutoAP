<!--
  Why this search's times can differ from the instant answer's (By a date, DeadlinePanel.vue: under Custom's boxes
  and under the results). Folded, closed by default (ux35-e, 28 Oct 2026: it read as a wall of text). A plain
  <details> like the page's other small explainers (ByDateScreen's "How … works", MaxedWhatIf), so not remembered.
-->
<template>
  <details class="start-timing max-w-prose text-small text-slate-500">
    <summary
      class="flex min-h-[44px] cursor-pointer select-none items-center gap-1 font-bold text-slate-500 hover:text-slate-700"
    >
      Why times can differ
      <span aria-hidden="true" class="start-timing-chevron leading-none text-slate-400">›</span>
    </summary>
    <ul class="list-disc space-y-0.5 pb-1 pl-5">
      <li>
        This search starts each fresh ascension the moment the last one ends, or, with your awake hours set, as soon as
        you are next available.
      </li>
      <li>The instant answer starts it on the next whole hour inside your awake hours.</li>
      <li>Without awake hours, the two differ by up to about an hour per ascension.</li>
      <li>
        With your awake hours set, that can move the same route by days: one route measured on Oct 24, 2026 moved 6.3
        days.
      </li>
    </ul>
  </details>
</template>

<style scoped>
.start-timing > summary {
  list-style: none;
}
.start-timing > summary::-webkit-details-marker {
  display: none;
}
.start-timing-chevron {
  display: inline-block;
  transition: transform 150ms;
}
.start-timing[open] > summary .start-timing-chevron {
  transform: rotate(90deg);
}
</style>
