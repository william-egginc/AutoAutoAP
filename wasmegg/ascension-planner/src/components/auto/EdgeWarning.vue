<!--
  The best route sits on the lowest or highest value its box allowed, with room to go further
  (search/bandCheck.ts `findBandEdges`): a wider box may find better. One box on the Full sweep and By a
  date: each screen's own sentence per edge (`lines`; a band of a chain vs a stop of a route), "Widen
  and run again", and under it what the wider box would be (default slot).
-->
<template>
  <div
    class="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-[11px] text-amber-900 leading-relaxed"
    data-test="edge-warning"
  >
    <p v-for="line in lines" :key="line">{{ line }}</p>
    <template v-if="canWiden">
      <button
        type="button"
        :disabled="disabled"
        class="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800 disabled:opacity-40"
        @click="emit('widen')"
      >
        Widen and run again
      </button>
      <p class="text-[10px] text-amber-800/80"><slot /></p>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{ lines: string[]; canWiden: boolean; disabled: boolean }>();
const emit = defineEmits<{ widen: [] }>();
</script>
