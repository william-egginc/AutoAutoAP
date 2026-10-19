<!--
  Ask before a big box starts (search/bigBox.ts `confirmBigBoxFlow`, composables/useBigBoxConfirm.ts):
  above 100,000 routes the note's own words, then above 500,000 a second, stronger question. Mounted
  once, in App.vue. Cancel has the focus when it opens, Esc is Cancel, and a click outside is Cancel:
  only Start (or "Yes, start it") starts anything. The amber note under the estimate stays as it was.
-->
<template>
  <div
    v-if="ask"
    class="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-900/50 p-4"
    data-testid="big-box-confirm"
    @click.self="answer(false)"
    @keydown="onKey"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="big-box-confirm-title"
      aria-describedby="big-box-confirm-text"
      class="w-full max-w-lg rounded-2xl border border-amber-300 bg-white p-5 shadow-2xl space-y-3"
    >
      <p id="big-box-confirm-title" class="text-[11px] font-black uppercase tracking-widest text-amber-800">
        {{ ask.step === 1 ? 'Start this big box?' : 'A very big box' }}
      </p>
      <p id="big-box-confirm-text" class="text-[13px] leading-relaxed text-slate-700">{{ ask.text }}</p>
      <div class="flex flex-wrap justify-end gap-3 pt-1">
        <button
          ref="cancelButton"
          type="button"
          data-testid="big-box-cancel"
          class="min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          @click="answer(false)"
        >
          Cancel
        </button>
        <button
          ref="startButton"
          type="button"
          data-testid="big-box-start"
          class="min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-xl bg-amber-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          @click="answer(true)"
        >
          {{ ask.step === 1 ? 'Start' : 'Yes, start it' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { bigBoxAsk, bigBoxHostMounted } from '@/composables/useBigBoxConfirm';

const ask = computed(() => bigBoxAsk.value);
const cancelButton = ref<HTMLButtonElement | null>(null);
const startButton = ref<HTMLButtonElement | null>(null);
/** Where the focus was before the question, to put it back after. */
let before: HTMLElement | null = null;

function answer(yes: boolean): void {
  bigBoxAsk.value?.answer(yes);
}
/** Tab stays on the two buttons while the question is open. */
function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const next = document.activeElement === cancelButton.value ? startButton.value : cancelButton.value;
  next?.focus();
}
/** Esc is Cancel, wherever the focus is. Caught first (capture) and kept from going further, so the
 *  window under the question (a Science sweep's, SweepRunner.vue) is not closed by the same key. */
function onWindowKey(e: KeyboardEvent): void {
  if (!bigBoxAsk.value || e.key !== 'Escape') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  answer(false);
}
watch(
  () => bigBoxAsk.value,
  (now, was) => {
    if (now && !was && typeof document !== 'undefined') before = document.activeElement as HTMLElement | null;
    if (now) void nextTick(() => cancelButton.value?.focus());
    else if (was) {
      before?.focus?.();
      before = null;
    }
  }
);
let release: (() => void) | null = null;
onMounted(() => {
  release = bigBoxHostMounted();
  window.addEventListener('keydown', onWindowKey, true);
});
onUnmounted(() => {
  release?.();
  window.removeEventListener('keydown', onWindowKey, true);
  // Nobody left to answer: the question is a no.
  bigBoxAsk.value?.answer(false);
});
</script>
