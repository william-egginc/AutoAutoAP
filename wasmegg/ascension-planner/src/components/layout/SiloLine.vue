<!--
  THE SILO LINE (Jordan, 12 Nov 2026; lib/saveBanner.ts `siloLineState`): one small line under the save strip, when the
  virtue farm's silos run out, as of the save (it cannot be live). Always shown with a virtue farm, nothing without. Under
  30% of the silo time left it turns amber, and its words say "low" too (lib/saveFreshnessWords.ts `siloLine`), so the
  colour is never alone. On the save line (layout/SaveLine.vue) and Single run's setup bar (auto/AutoSaveStrip.vue).
-->
<template>
  <p
    v-if="silo"
    class="min-w-0 break-words text-small tabular-nums"
    :class="silo.low ? 'text-amber-800' : 'text-slate-600'"
    :data-low="silo.low ? 'true' : 'false'"
    data-testid="silo-line"
  >
    {{ silo.text }}
  </p>
</template>

<script setup lang="ts">
import type { SiloLineState } from '@/lib/saveBanner';

defineProps<{ silo: SiloLineState | null }>();
</script>
