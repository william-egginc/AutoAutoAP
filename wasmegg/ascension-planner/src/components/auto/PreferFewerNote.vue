<!--
  "Prefer fewer ascensions" in the green box (Q6, search/preferFewer.ts): one plain sentence saying what the box
  shows (Prefer fewer is on by default since 26 Oct 2026, so a player who never set it is told), the cost-then-saving line and "Show the
  fastest instead ›" when the box leads with a route with fewer ascensions; "Show the fewest-ascensions route ›" back
  while the best is shown for now (the setting stays as it is). Nothing at all when the setting is off, the best
  already has the fewest ascensions, or nothing with fewer ascensions fits (the muted "No route with fewer ascensions
  is within 12 h." is hidden since 26 Oct 2026, Jordan: with the margin on by default it showed to most players).
-->
<template>
  <div v-if="copy.line" class="space-y-0.5" data-testid="prefer-fewer-note">
    <template v-if="!showingBest">
      <p v-if="copy.what" class="text-body text-slate-700" data-testid="prefer-fewer-what">{{ copy.what }}</p>
      <p class="text-body text-slate-700" data-testid="prefer-fewer-line">{{ copy.line }}</p>
    </template>
    <p v-else class="text-body text-slate-500" data-testid="prefer-fewer-showing-best">
      Showing the {{ bestWord }} for now; Prefer fewer ascensions is still on.
    </p>
    <button
      type="button"
      class="min-h-[44px] sm:min-h-0 text-small font-bold text-emerald-800 underline hover:text-emerald-950"
      :aria-pressed="showingBest"
      data-testid="prefer-fewer-toggle"
      @click="emit('toggle')"
    >
      {{ showingBest ? 'Show the fewest-ascensions route ›' : `Show the ${bestWord} instead ›` }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PreferCopy, PreferGoal } from '@/search/preferFewer';

const props = defineProps<{ copy: PreferCopy; goal: PreferGoal; showingBest: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const bestWord = computed(() => (props.goal === 'fastest' ? 'fastest' : 'highest TE'));
</script>
