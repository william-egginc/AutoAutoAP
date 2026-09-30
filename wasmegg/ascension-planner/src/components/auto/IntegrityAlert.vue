<!--
  "This account can't be planned yet", as a dialog the moment the save loads, instead of a box found
  only after filling everything in (the user, 30 Sept). The same message as the box by Start, which
  stays as the reminder. Shown once per account and TE: a new save (or another account) asks again.
-->
<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/50 p-4"
    @click.self="dismiss"
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="integrity-alert-title"
      class="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl space-y-3"
    >
      <p id="integrity-alert-title" class="text-[11px] font-black uppercase tracking-widest text-rose-800">
        This account can't be planned yet
      </p>
      <p class="text-[13px] leading-relaxed text-slate-700">
        <template v-for="(part, i) in parts" :key="i"
          ><b v-if="part.bold" class="font-black text-slate-900">{{ part.text }}</b
          ><template v-else>{{ part.text }}</template></template
        >
      </p>
      <div class="flex flex-wrap justify-end gap-3 pt-1">
        <button
          ref="okButton"
          type="button"
          class="px-5 py-2.5 rounded-xl bg-rose-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-rose-800"
          @click="dismiss"
        >
          Got it
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { integrityHighlights } from '@/search/rules';

const store = useChainSearchStore();
const initialState = useInitialStateStore();
/** The account and TE this was last dismissed for: the same one isn't asked about twice. */
const dismissedFor = ref('');
const okButton = ref<HTMLButtonElement | null>(null);
const parts = computed(() => integrityHighlights(store.integrityNotice?.text ?? '', store.integrityWait));

const key = computed(() => `${initialState.playerId}|${Math.floor(store.currentTE)}`);
const open = computed(() => !!store.integrityNotice?.blocked && dismissedFor.value !== key.value);

function dismiss(): void {
  dismissedFor.value = key.value;
}
function onKey(e: KeyboardEvent): void {
  if (open.value && e.key === 'Escape') dismiss();
}
watch(open, v => {
  if (v) void nextTick(() => okButton.value?.focus());
});
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>
