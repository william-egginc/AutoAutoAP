<!--
  "How Custom works" (was "What this does and does not promise" until 5 Nov 2026; UX fluff review 2, items C-pre1 and
  C-pre2: Custom's one fold, holding the evidence that was Custom's lead bullets, and on Fastest how the sweep works,
  the default slot). For Exhaustive, amber like the Stronger check's per-level box
  (StrongerBox.vue), on both screens (the user, 12 Oct): what proving a space means, and what it leaves
  out. `goal` only changes the line about the last stop: By a date finds it to the exact TE, Fastest's is
  the target. Closed until opened, and its open/closed state remembered in this browser, as Fast and
  Exact's box does (StrongerBox.vue; 22 Oct 2026): Custom's own key.
-->
<template>
  <details
    :open="promiseOpen"
    class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-small text-amber-900"
    data-testid="exhaustive-promise"
    @toggle="onPromiseToggle"
  >
    <!-- 44 px to tap on a phone (list-item kept for the marker); unchanged from sm up. -->
    <summary class="cursor-pointer font-bold text-amber-800 min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0" data-testid="exhaustive-promise-summary">
      How Custom works ›
    </summary>
    <ul class="mt-1 pl-4 list-disc space-y-0.5 leading-relaxed" data-testid="exhaustive-promise-lines">
      <li v-for="(line, k) in [...EVIDENCE[goal], ...lines]" :key="k">{{ line }}</li>
    </ul>
    <slot />
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ goal: 'fastest' | 'deadline' }>();

/** Open only if the player opened it last time (this browser), like Fast and Exact's box. */
const PROMISE_KEY = 'aap-exhaustive-promise-closed';
function readPromiseOpen(): boolean {
  try {
    return localStorage.getItem(PROMISE_KEY) === '0';
  } catch {
    return false;
  }
}
const promiseOpen = ref(readPromiseOpen());
function onPromiseToggle(e: Event): void {
  promiseOpen.value = (e.target as HTMLDetailsElement).open;
  try {
    localStorage.setItem(PROMISE_KEY, promiseOpen.value ? '0' : '1');
  } catch {
    /* this visit only */
  }
}

/** What Custom's lead said under it, one fact per bullet (FastestRoute.vue, DeadlinePanel.vue `CUSTOM_POINTS` until
 *  5 Nov 2026), now inside the fold: the lead is one line (UX fluff review 2, item C-pre1). Word for word. */
const EVIDENCE: Record<'fastest' | 'deadline', string[]> = {
  fastest: [
    'It is for proving an answer, not for finding a much better one.',
    'The answer is proven for those boxes only.',
    "In players' runs so far it found routes minutes to hours sooner, not days.",
    'It takes about 1 minute per 70 routes on an 8-core computer, so big boxes take hours.',
  ],
  deadline: [
    'It is for proving an answer, not for finding a much better one.',
    "The answer is proven for those boxes only. So far no search has beaten the instant answer's TE by a date.",
    'You set a range of TEs for each ascension. The last stop is found to the exact TE.',
  ],
};
/** Exported for the spec: the words are the promise. */
const lines = computed<string[]>(() => [
  'It tries every route in your boxes, so the answer is the best for that space and says nothing about routes outside it.',
  ...(props.goal === 'deadline' ? ['The last stop is found to the exact TE.'] : []),
  'A step above 1 TE skips values between its grid points, so a route that sits between them can be missed. Step 1 misses none.',
  'A big space can take hours, sometimes overnight.',
  'A refresh is safe: its progress is saved and it carries on without re-simulating anything.',
  '"Let me pick my hours" (in Your setup) makes each prestige and each egg shift wait for your hours, and those waits are counted in the times.',
]);
</script>
