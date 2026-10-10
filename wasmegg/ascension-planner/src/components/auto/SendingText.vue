<!--
  "Sending..." that shows it is alive: the dots cycle (. .. ...), in CSS only, and past 20 s the time
  it has been going is added ("Sending... 35 s"), so a slow send never looks frozen (the user, 10 Oct:
  a Send best so far sat on "SENDING..." until its run ended). With reduced motion the dots stay put.
  `text` is the words before the dots ("Sending", "Sending the table").
-->
<template>
  <span class="whitespace-nowrap" :aria-label="`${text}...`" role="status"
    >{{ text }}<span class="sending-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span
    ><template v-if="elapsed >= SHOW_AFTER_S"> {{ elapsed }} s</template></span
  >
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{ text?: string; /** When it began, ms; default: when this appeared. */ since?: number }>(),
  {
    text: 'Sending',
  }
);

/** Seconds before the elapsed time is shown. */
const SHOW_AFTER_S = 20;
const start = props.since ?? Date.now();
const elapsed = ref(0);
const timer = setInterval(() => (elapsed.value = Math.floor((Date.now() - start) / 1000)), 1000);
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.sending-dots span:nth-child(2) {
  animation: sending-dot-2 1.2s steps(1, end) infinite;
}
.sending-dots span:nth-child(3) {
  animation: sending-dot-3 1.2s steps(1, end) infinite;
}
@keyframes sending-dot-2 {
  0% {
    opacity: 0;
  }
  33.3% {
    opacity: 1;
  }
}
@keyframes sending-dot-3 {
  0% {
    opacity: 0;
  }
  66.6% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sending-dots span {
    animation: none !important;
    opacity: 1 !important;
  }
}
</style>
