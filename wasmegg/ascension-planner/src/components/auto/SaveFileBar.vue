<!--
  Under Saved answers and Saved runs: "Load a save file" (a save from "Download this save", or the
  game's backup as JSON) as the planner's active save, the one-line warning about sharing those files,
  and why the last Use / Download / Load did not happen.
-->
<template>
  <div class="space-y-1">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
      <!-- A button, not a heading (ux review 26 Oct, row 19: "LOAD A SAVE FILE" had no button in sight): the label
           opens the file picker; the input stays focusable (sr-only), so Tab and Enter reach it too. 44 px on phones. -->
      <label
        class="inline-flex items-center min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-400"
        :class="disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'"
        data-testid="save-file-load"
      >
        {{ loading ? 'Loading the save…' : 'Load a save file' }}
        <input type="file" accept=".json,application/json" class="sr-only" :disabled="disabled" @change="onFile" />
      </label>
      <span class="text-slate-400">This file is your game save; don't share it publicly.</span>
    </div>
    <p v-if="store.olderSaveError" class="text-body font-semibold text-rose-700">{{ store.olderSaveError }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import { readUploadText } from '@/lib/uploadGuard';
import { plainError } from '@/lib/plainError';

const props = defineProps<{ playerId: string }>();
const store = useChainSearchStore();
const ui = useUIStore();

const loading = ref(false);
const disabled = computed(() => loading.value || store.busy || ui.loading);

async function onFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  loading.value = true;
  try {
    // Size cap, a capped gzip unpack and strict text first (lib/uploadGuard.ts); the save itself is checked
    // by the store's parseSaveFile.
    let text: string;
    try {
      text = await readUploadText(file, 'save');
    } catch (e) {
      store.olderSaveError = plainError(e, 'That file could not be read as a save.');
      return;
    }
    await store.loadSaveFile(props.playerId, text);
  } finally {
    loading.value = false;
  }
}
</script>
