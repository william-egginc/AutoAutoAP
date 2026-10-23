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
    <!-- Hide: a small pill on the section's edge; on a phone an invisible area round it (before:) makes it 44 px
         to tap without moving the section (23 Oct 2026). Unchanged from sm up. -->
    <button
      v-if="open"
      type="button"
      class="absolute -top-2.5 right-4 z-20 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] sm:before:hidden"
      :aria-expanded="true"
      :data-testid="`hide-${id}`"
      @click="set(false)"
    >
      Hide
    </button>
    <button
      v-else
      type="button"
      class="w-full flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300"
      :aria-expanded="false"
      :data-testid="`show-${id}`"
      @click="set(true)"
    >
      <span class="text-sm font-black text-slate-900">{{ title }}</span>
      <span class="min-w-0 flex-1 text-[12px] text-slate-600 break-words">{{ summary || 'Hidden' }}</span>
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
