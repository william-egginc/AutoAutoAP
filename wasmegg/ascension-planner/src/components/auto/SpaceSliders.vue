<template>
  <!-- Suggest a space's two sliders (search/deadlineSuggest.ts SPACE_WIDTHS and SPACE_STEPS): one
       implementation for every chain row on the Full sweep and By a date (RoutesToTry.vue). The parent
       owns the positions; the first stop is always tried at every TE. Anything after the sliders (By a
       date's "move every chain's sliders together") goes in the default slot, on the same line. -->
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
    <span v-if="lead" class="font-bold text-slate-600">{{ lead }}</span>
    <label class="flex items-center gap-1.5">
      <input
        :value="widthIx"
        type="range"
        min="0"
        :max="SPACE_WIDTHS.length - 1"
        step="1"
        :disabled="disabled"
        class="w-20 accent-slate-700"
        aria-label="How far around each stop"
        @input="emit('width', +($event.target as HTMLInputElement).value)"
      />
      <span
        ><b class="text-slate-700">±{{ halfWidth }}</b> TE around each stop<template v-if="fromCard">
          (from a Science card)</template
        ><template v-else-if="fromSimple"> (from Simple)</template></span
      >
    </label>
    <label class="flex items-center gap-1.5">
      <input
        :value="stepIx"
        type="range"
        min="0"
        :max="SPACE_STEPS.length - 1"
        step="1"
        :disabled="disabled"
        class="w-16 accent-slate-700"
        aria-label="Step between the TEs tried"
        @input="emit('step', +($event.target as HTMLInputElement).value)"
      />
      <span
        title="The first stop is tried at every TE: it sits nearest your farm as it is now, where one TE either way can move the whole route by days."
        >every <b class="text-slate-700">{{ step === 1 ? 'TE' : step + ' TE' }}</b> (the first stop: every TE)</span
      >
    </label>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { SPACE_STEPS, SPACE_WIDTHS } from '@/search/deadlineSuggest';

defineProps<{
  widthIx: number;
  stepIx: number;
  halfWidth: number;
  step: number;
  disabled?: boolean;
  /** Words before the sliders (By a date: "Suggest a space tries"). */
  lead?: string;
  /** The ± came from a Science card's request (±1, ±2), not the slider. */
  fromCard?: boolean;
  /** The ± is the width Simple's boxes were built with (Open in Advanced). */
  fromSimple?: boolean;
}>();
const emit = defineEmits<{ (e: 'width', ix: number): void; (e: 'step', ix: number): void }>();
</script>
