<!--
  One run against the player's instant baseline (lib/instantBaseline.ts, wireframes/price-route-v2 B1 and B2):
  "vs your instant baseline: 1.2 days sooner (Fast)". Green when the run beats it, plain otherwise. Nothing without a
  baseline. The space before "(Fast)" is an explicit {{ ' ' }}: a template's leading space is dropped ("2.0 days
  later(Exact)", 23 Oct 2026).
-->
<template>
  <span
    v-if="line"
    class="inline-block rounded-full border px-2 py-0.5 text-[11px]"
    :class="line.tone === 'better' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-600'"
    data-testid="baseline-chip"
    :data-tone="line.tone"
    >{{ line.lead }} <b>{{ line.words }}</b><template v-if="line.tail">{{ ' ' }}{{ line.tail }}</template></span
  >
</template>

<script setup lang="ts">
import type { BaselineChipWords } from '@/composables/useBaselines';

defineProps<{ line: BaselineChipWords | null }>();
</script>
