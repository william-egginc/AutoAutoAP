<!--
  Under Exhaustive's estimate (InsanePanel.vue on Fastest, DeadlinePanel.vue on By a date): an amber
  note when the box is above 300,000 routes, with about how many hours it takes here and a pointer to
  the command line. The words are search/bigBox.ts `bigBoxNote`'s, the same the command line prints.
-->
<template>
  <p v-if="note" class="text-body font-bold text-amber-800" data-testid="big-box-note">
    {{ note }}
  </p>
</template>

<script setup lang="ts">
defineProps<{ note: string | null }>();
</script>
