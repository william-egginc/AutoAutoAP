<!--
  My runs' save-age strip (spec myruns-now v3, section 1; lib/saveFreshness.ts): every time on the page comes
  from the save, so its age is said first. Green under 6 h, amber to 24 h, red past it. The link loads a fresh
  save (App's `prepareAutoPlanner`, as entering the Auto Planner does) and stays on this page.
-->
<template>
  <div
    class="rounded-xl border px-3 py-2 text-[13px]"
    :class="strip ? TONE[strip.tone] : 'border-slate-200 bg-slate-50 text-slate-700'"
    data-testid="now-save-strip"
    :data-tone="strip?.tone ?? 'none'"
  >
    <template v-if="strip">{{ strip.text }}{{ ' ' }}</template>
    <template v-else>No save loaded: the page reads everything from your save.{{ ' ' }}</template>
    <button type="button" class="font-bold underline disabled:opacity-50" :disabled="loading" @click="emit('fresh')">
      {{ loading ? 'Loading your save…' : strip ? strip.link : 'Load your save' }}<template v-if="!loading"> ›</template>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SaveStrip } from '@/lib/saveFreshness';

defineProps<{ strip: SaveStrip | null; loading: boolean }>();
const emit = defineEmits<{ fresh: [] }>();
const TONE = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-rose-300 bg-rose-50 text-rose-900',
} as const;
</script>
