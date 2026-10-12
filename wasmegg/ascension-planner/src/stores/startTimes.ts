/**
 * "When should I start?" at the top of Fastest route (StartTimeCard.vue): whether it is open, and a
 * route asked for from elsewhere (the Fastest answer's "Check start times for this route" link).
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useStartTimesStore = defineStore('startTimes', () => {
  const open = ref(false);
  /** A route to price, asked for by a link; null: the card's own pick (the instant answer's best). */
  const requested = ref<number[] | null>(null);
  /** Open the card on this route and bring it into view. */
  function show(chain: number[]): void {
    requested.value = [...chain];
    open.value = true;
    if (typeof document !== 'undefined')
      setTimeout(() => document.getElementById('start-times')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  return { open, requested, show };
});
