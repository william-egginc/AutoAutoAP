/**
 * "When should I start?" (StartTimeCard.vue, in Science › When should I start?, #/science/start since
 * 14 Oct 2026; it was at the top of Fastest route): a route asked for from elsewhere (a result's "Check
 * start times for this route" link), and the ask itself, which App.vue answers by opening that page and
 * scrolling to the card.
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useStartTimesStore = defineStore('startTimes', () => {
  /** A route to price, asked for by a link; null: the card's own pick (the instant answer's best). */
  const requested = ref<number[] | null>(null);
  /** Counts the asks; App.vue watches it and goes to Science › When should I start?. */
  const asked = ref(0);
  /** Open the card on this route and bring it into view. */
  function show(chain: number[]): void {
    requested.value = [...chain];
    asked.value++;
  }
  /** Open the card on its own pick (no route asked for): My runs' "When should I start?" with no saved plan. */
  function open(): void {
    requested.value = null;
    asked.value++;
  }
  return { requested, asked, show, open };
});
