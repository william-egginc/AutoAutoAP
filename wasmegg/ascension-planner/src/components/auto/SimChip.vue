<!--
  The "sim" chip beside a board run's finish (lib/simLabel.ts): which simulator priced it, in plain
  words, with the stamp itself on hover and, for a phone, on a tap (a small box under the chip). The
  button is a 44 px tap target; its negative margin keeps the row as tall as it was.
-->
<template>
  <span class="relative inline-block align-middle" data-testid="sim-chip" :data-kind="label.kind">
    <button
      type="button"
      class="inline-flex items-center min-h-[44px] -my-[14px] px-0.5 whitespace-nowrap"
      :title="label.title"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-label="`Simulator: ${label.words}. Show its stamp`"
      @click.stop="open = !open"
    >
      <span class="px-1 rounded text-[9px] font-black leading-4" :class="CHIP_CLASS[label.kind]">{{ chipText }}</span>
    </button>
    <span
      v-if="open"
      role="note"
      class="absolute left-0 top-full z-20 mt-1 w-max max-w-[16rem] whitespace-normal rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-[10px] font-normal leading-snug text-slate-600 shadow"
      @click.stop
    >
      <span class="block font-mono text-slate-800">{{ label.stamp ?? 'no stamp' }}</span>
      {{ label.title }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { SIM_VERSION } from '@/search/simVersion';
import { simLabel, type SimKind } from '@/lib/simLabel';

const props = defineProps<{
  /** The run's `simVersion`, as the collector sent it. */
  stamp?: unknown;
  /** The simulator this page runs; a spec may pass another. */
  current?: string;
}>();

const label = computed(() => simLabel(props.stamp, props.current ?? SIM_VERSION));
const open = ref(false);
/** "older simulator" says what it is; "current" and "unknown (…)" get "sim:" in front. */
const chipText = computed(() =>
  label.value.words.includes('simulator') ? label.value.words : `sim: ${label.value.words}`
);

/** The current simulator's chip has a quiet accent, so its runs stand out; the rest are grey. */
const CHIP_CLASS: Record<SimKind, string> = {
  current: 'bg-emerald-50 border border-emerald-300 text-emerald-800',
  older: 'bg-slate-100 border border-slate-200 text-slate-500',
  newer: 'bg-slate-100 border border-slate-200 text-slate-500',
  other: 'bg-slate-100 border border-slate-200 text-slate-500',
  unknown: 'border border-dashed border-slate-300 text-slate-400',
};
</script>
