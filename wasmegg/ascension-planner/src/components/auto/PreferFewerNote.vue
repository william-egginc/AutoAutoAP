<!--
  "Prefer fewer ascensions" in the green box (Q6, search/preferFewer.ts): the cost-then-saving line and "Show the
  fastest instead ›" when the box leads with a route with fewer ascensions; "Show the fewest-ascensions route ›" back
  while the best is shown for now (the setting stays as it is); a muted line when nothing with fewer ascensions fits.
  Nothing at all when the setting is off or the best already has the fewest ascensions.
-->
<template>
  <div v-if="copy.line || copy.muted" class="space-y-0.5" data-testid="prefer-fewer-note">
    <template v-if="copy.line">
      <p v-if="!showingBest" class="text-[12px] text-slate-700" data-testid="prefer-fewer-line">{{ copy.line }}</p>
      <p v-else class="text-[11px] text-slate-500" data-testid="prefer-fewer-showing-best">
        Showing the {{ bestWord }} for now; Prefer fewer ascensions is still on.
      </p>
      <button
        type="button"
        class="min-h-[44px] sm:min-h-0 text-[11px] font-bold text-emerald-800 underline hover:text-emerald-950"
        :aria-pressed="showingBest"
        data-testid="prefer-fewer-toggle"
        @click="emit('toggle')"
      >
        {{ showingBest ? 'Show the fewest-ascensions route ›' : `Show the ${bestWord} instead ›` }}
      </button>
    </template>
    <p v-else class="text-[11px] text-slate-400" data-testid="prefer-fewer-muted">{{ copy.muted }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PreferCopy, PreferGoal } from '@/search/preferFewer';

const props = defineProps<{ copy: PreferCopy; goal: PreferGoal; showingBest: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const bestWord = computed(() => (props.goal === 'fastest' ? 'fastest' : 'highest TE'));
</script>
