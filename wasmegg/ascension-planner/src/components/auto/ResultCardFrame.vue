<!--
  The green answer card, the same frame on every search screen: what the answer is (`heading`, e.g.
  "Fastest found" or "Highest by Jul 14"), the route (`headline`), its number on the right (`aside`, the
  days on Fastest), the "still going" line while it is a best so far, the screen's details (default
  slot) and the row of things to do with it (`actions`). Fastest's card is RouteResultCard.vue, By a
  date's ByDateRouteCard.vue; both draw this frame.
-->
<template>
  <!-- data-result-card: the instant card's "See it ↓" scrolls here (InstantRoute.vue `seeResult`). -->
  <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2 scroll-mt-24" data-result-card>
    <div class="flex items-baseline justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <p class="label text-emerald-800"><slot name="heading" /></p>
        <slot name="headline" />
      </div>
      <div v-if="$slots.aside" class="sm:text-right"><slot name="aside" /></div>
    </div>
    <p v-if="stillGoing" class="text-body text-emerald-800" data-testid="route-card-still-going">
      The search is still going, so this can still improve.
    </p>
    <slot />
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2 pt-2"><slot name="actions" /></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** A best so far: say the search is still going. */
    stillGoing?: boolean;
  }>(),
  { stillGoing: false }
);
</script>
