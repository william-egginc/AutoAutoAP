<!--
  What the page prices by itself after Check exactly, at the top of the search panel (SearchPanel.vue,
  22 Oct 2026). Internally this is still "Light" (stores/stronger.ts `light`, search/lightResult.ts, the
  board's `level: 'light'`), but players no longer pick it or read its name (Jordan, 22 Oct: "I thought we
  got rid of Light"): no status line. It shows only what it found: the instant answer's fastest route as
  you'd play it (ascending at once, on your hours), its results (InstantRoute.vue teleports StrongerCheck
  into `#stronger-check-results` here, always on: your earlier routes, one TE lower, Best now) and, once
  it has a result, a Send (LightShare.vue: "Send this route").
-->
<template>
  <div class="space-y-2" data-testid="light-block">
    <!-- The fastest as you'd play it, as soon as one route is priced at once. -->
    <p v-if="stronger.light.summary" class="text-[12px] font-bold text-indigo-900" data-testid="light-as-played">
      {{ stronger.light.summary }}
    </p>
    <!-- The stronger check's own results (earlier routes, one TE lower, Best now); they carry their own
         headings ("Your earlier routes", "A TE lower"). -->
    <div id="stronger-check-results" />
    <LightShare :goal="goal" :player-id="playerId" />
  </div>
</template>

<script setup lang="ts">
import { useStrongerStore } from '@/stores/stronger';
import LightShare from './LightShare.vue';

defineProps<{
  goal: 'fastest' | 'date';
  /** The header's player ID, for the Send box (LightShare.vue). */
  playerId?: string;
}>();

const stronger = useStrongerStore();
</script>
