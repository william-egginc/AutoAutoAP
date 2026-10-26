<!--
  One of the three main sections of a search screen (Instant answer, Stronger check, Exhaustive) that a
  player can hide (the user, 12 Oct 2026). Open: the section as it is, with a small Hide button in its
  top corner (the section keeps its own heading). Hidden: one bar with the section's name and its
  one-line result, and Show. Remembered per section in this browser.

  Hidden with v-show, never v-if: a search running in a hidden section keeps running, and the places
  other parts of the page send things to (the stronger check's results, By a date's run controls) stay
  on the page.
-->
<template>
  <div class="relative" :data-testid="`section-${id}`">
    <!-- Hide: a small pill on the section's edge. On a phone the button itself is 44 px round the pill, centred where
         the pill was (UX review 26 Oct 2026, item 12: the pill measured 45×20; was an invisible before: area since
         23 Oct). From sm up the button is the pill's own size, as it was. -->
    <button
      v-if="open"
      type="button"
      class="group absolute -top-[22px] right-2 z-20 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 sm:-top-2.5 sm:right-4 sm:min-h-0 sm:min-w-0 sm:px-0"
      :aria-expanded="true"
      :data-testid="`hide-${id}`"
      @click="set(false)"
    >
      <span
        class="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-800"
        >Hide</span
      >
    </button>
    <button
      v-else
      type="button"
      class="w-full flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300"
      :aria-expanded="false"
      :data-testid="`show-${id}`"
      @click="set(true)"
    >
      <span class="text-body font-black text-slate-900">{{ title }}</span>
      <span class="min-w-0 flex-1 text-small text-slate-600 break-words">{{ summary || 'Hidden' }}</span>
      <span class="text-[9px] font-black uppercase tracking-widest text-indigo-700">Show</span>
    </button>
    <div v-show="open"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  /** Remembered under this name: 'instant', 'stronger', 'exhaustive'. */
  id: string;
  title: string;
  /** The section's one-line result, shown when it is hidden. */
  summary?: string;
}>();

const KEY = `aap-section-hidden-${props.id}`;
function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}
const open = ref(read());
function set(v: boolean): void {
  open.value = v;
  try {
    localStorage.setItem(KEY, v ? '0' : '1');
  } catch {
    /* this visit only */
  }
}
</script>
