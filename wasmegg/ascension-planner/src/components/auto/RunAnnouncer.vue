<!--
  A running search's progress, for a screen reader only (the UX review of 25 Oct 2026; lib/liveStatus.ts): one
  visually hidden status line, "Fast search: 3 of 12 routes done", said at most every 10 s, and "Fast search
  finished" when the run's progress goes. Mounted once in App, whatever the tab, so the end is heard anywhere.
-->
<template>
  <p class="sr-only" role="status" aria-live="polite" data-testid="run-live">{{ said?.text ?? '' }}</p>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { runEndText, runLiveText, runName, shouldSay } from '@/lib/liveStatus';

const store = useChainSearchStore();
const said = ref<{ text: string; at: number } | null>(null);
/** The running search's name, kept for its end line once its progress is gone. */
let name = '';

watch(
  () => store.runProgress,
  p => {
    const now = Date.now();
    if (p) {
      name = runName(p.kind, store.effort);
      const text = runLiveText(p, name);
      if (shouldSay(said.value, text, now, false)) said.value = { text, at: now };
    } else if (name) {
      const text = runEndText(name);
      if (shouldSay(said.value, text, now, true)) said.value = { text, at: now };
      name = '';
    }
  },
  { immediate: true }
);
</script>
