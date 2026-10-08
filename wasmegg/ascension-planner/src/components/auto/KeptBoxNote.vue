<!--
  Under a chain's Suggest-a-space sliders: the sliders moved, but the box holds bands the player typed,
  and typed bands are never overwritten. Says so, with one button that does overwrite them with the
  slider-sized suggestion (the same as Suggest a space at those settings).
-->
<template>
  <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500" data-test="kept-box-note">
    <span>Your typed box is kept.</span>
    <button
      type="button"
      :disabled="disabled"
      class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      @click="emit('use')"
    >
      Use the sliders' box
    </button>
  </p>
</template>

<script setup lang="ts">
defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ (e: 'use'): void }>();
</script>
