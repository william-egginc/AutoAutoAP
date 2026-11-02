<!--
  A status string from a module that ends it in "…" or "..." while something runs (lib/pendingWords.ts): its words,
  then the moving dots (AnimatedDots.vue) in place of the typed ones. Any other string shows as it is. The dots are
  aria-hidden, so a screen reader reads the words; the element around it keeps its own role="status" / aria-busy.
-->
<template>
  <template v-if="parts.pending">{{ parts.words }}<AnimatedDots /></template
  ><template v-else>{{ text }}</template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { splitPending } from '@/lib/pendingWords';
import AnimatedDots from './AnimatedDots.vue';

const props = defineProps<{ text: string }>();
const parts = computed(() => splitPending(props.text));
</script>
