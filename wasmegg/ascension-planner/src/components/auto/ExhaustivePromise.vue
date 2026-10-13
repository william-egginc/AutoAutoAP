<!--
  "What this does and does not promise" for Exhaustive, amber like the Stronger check's per-level box
  (StrongerBox.vue), on both screens (the user, 12 Oct): what proving a space means, and what it leaves
  out. `goal` only changes the line about the last stop: By a date finds it to the exact TE, Fastest's is
  the target.
-->
<template>
  <details
    open
    class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
    data-testid="exhaustive-promise"
  >
    <summary class="cursor-pointer font-black uppercase tracking-wide text-amber-800">
      What this does and does not promise
    </summary>
    <ul class="mt-1 pl-4 list-disc space-y-0.5 leading-relaxed" data-testid="exhaustive-promise-lines">
      <li v-for="(line, k) in lines" :key="k">{{ line }}</li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ goal: 'fastest' | 'deadline' }>();

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
