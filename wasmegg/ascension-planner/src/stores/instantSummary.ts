/**
 * A small read-only summary of the instant answer's fastest route, for the screens that sit beside
 * it. The answer itself is local state in components/auto/InstantRoute.vue; that component writes
 * this (Fastest route only) and clears it when it goes, and the result cards read it to say when a
 * longer route might win (lib/longerRouteHint.ts).
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { InstantRouteSummary } from '@/lib/longerRouteHint';

export const useInstantSummaryStore = defineStore('instantSummary', () => {
  /** The fastest route the instant answer has for this save (the full simulator's time once the exact
   *  check is in), or null while it is loading, has none, or is not on screen. */
  const fastest = ref<InstantRouteSummary | null>(null);
  return { fastest };
});
