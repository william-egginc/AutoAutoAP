<!--
  The results, in one order on every search screen, under the run controls (RunControls.vue):

    the answer (`card`: RouteResultCard.vue or ByDateRouteCard.vue, or why there is none)
    what the screen adds about it (default slot: when to start it, edge warnings; the top routes and Fastest's
      other options and charts are on My runs › Your latest run, with a line here linking to them)
    keeping it (`keep`: Saved runs or Saved answers, and the CSV)
    sharing it (`share`: ShareResult.vue), under the anchor the card's Share button scrolls to

  Smart search shows its answer inside the run's progress instead (it doubles as the best so far),
  so its `card` is empty.
-->
<template>
  <div class="space-y-4" data-testid="run-results">
    <slot name="card" />
    <slot />
    <slot name="keep" />
    <div v-if="$slots.share" id="share-this-result" class="scroll-mt-4"><slot name="share" /></div>
  </div>
</template>
