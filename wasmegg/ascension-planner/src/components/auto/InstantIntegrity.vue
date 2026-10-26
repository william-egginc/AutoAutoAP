<!--
  The integrity check on the instant answer (search/instantIntegrity.ts): the same measurement and
  numbers as "This account can't be planned yet" beside every Start, said inside the answer itself.
  Blocked (over a week on the Integrity shift): the reason and the Clothed TE advice, and the panel
  shows no routes. Over an hour: an amber note that the times include the wait. While the check runs:
  one grey line (the panel holds the routes back for those seconds).
-->
<template>
  <p v-if="state.kind === 'checking'" class="text-body text-slate-400" data-testid="instant-integrity">
    Checking whether this account can build…
  </p>
  <div
    v-else-if="state.kind === 'blocked'"
    class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1"
    data-testid="instant-integrity"
  >
    <p class="text-[10px] font-black uppercase tracking-widest text-red-800">This account can't be planned yet</p>
    <p class="text-body text-red-900">
      <template v-for="(part, i) in parts" :key="i"
        ><b v-if="part.bold" class="font-black">{{ part.text }}</b
        ><template v-else>{{ part.text }}</template></template
      >
    </p>
  </div>
  <p
    v-else-if="state.kind === 'warn'"
    class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-body text-amber-900"
    data-testid="instant-integrity"
  >
    <span class="font-black uppercase tracking-wide">This account stalls.</span>
    <template v-for="(part, i) in parts" :key="i"
      ><b v-if="part.bold" class="font-black">{{ part.text }}</b
      ><template v-else>{{ part.text }}</template></template
    >
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { integrityHighlights } from '@/search/rules';
import type { InstantIntegrity } from '@/search/instantIntegrity';

const props = defineProps<{ state: InstantIntegrity }>();
const parts = computed(() =>
  props.state.kind === 'blocked' || props.state.kind === 'warn'
    ? integrityHighlights(' ' + props.state.text, props.state.wait)
    : []
);
</script>
