<!--
  The best route sits on the lowest or highest value its box allowed, with room to go further
  (search/bandCheck.ts `findBandEdges`): a wider box may find better. One box on the Full sweep and By a
  date: each screen's own sentence per edge (`lines`; a band of a chain vs a stop of a route), "Widen
  and run again", and under it what the wider box would be (default slot).
-->
<template>
  <div
    :class="bare ? 'space-y-2' : 'rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-body text-amber-900'"
    data-test="edge-warning"
  >
    <p v-for="line in lines" :key="line">{{ line }}</p>
    <template v-if="canWiden">
      <button
        type="button"
        :disabled="disabled"
        class="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-body font-bold hover:bg-amber-800 disabled:opacity-40"
        @click="emit('widen')"
      >
        Widen and run again<template v-if="routes">{{ ' ' }}({{ routes }})</template>
      </button>
      <p v-if="$slots.default" class="text-small text-amber-800/80"><slot /></p>
    </template>
  </div>
</template>

<script setup lang="ts">
/** `bare`: inside a box of the screen's own (Custom's one amber box for every edge, UX fluff review 2, item C0b). */
/** `routes`: the wider space's size on the button, "13 routes" (Custom; UX fluff review 2, 5 Nov 2026, item C0b, DRAFT). */
defineProps<{ lines: string[]; canWiden: boolean; disabled: boolean; bare?: boolean; routes?: string }>();
const emit = defineEmits<{ widen: [] }>();
</script>
