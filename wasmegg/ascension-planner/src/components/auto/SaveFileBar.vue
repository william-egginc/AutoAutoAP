<!--
  Under Saved answers and Saved runs: "Load a save file" (a save from "Download this save", or the
  game's backup as JSON) as the planner's active save, the one-line warning about sharing those files,
  and why the last Use / Download / Load did not happen. Also under the player ID box when no account is entered
  (App.vue, spec-savescrub): the save then loads with no account (`loaded` tells the page to show it); on the
  first visit `compact` reads "or load a save file" with the warning as a clause.
-->
<template>
  <div class="space-y-1">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-small" :class="compact ? 'justify-center' : ''">
      <!-- A button, not a heading (ux review 26 Oct, row 19: "LOAD A SAVE FILE" had no button in sight): the label
           opens the file picker; the input stays focusable (sr-only), so Tab and Enter reach it too. 44 px on phones. Bold body
           text like every other button, not the small caps of a heading (spec-tidy). -->
      <label
        class="inline-flex items-center min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-indigo-400"
        :class="[disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer', 'text-body font-bold']"
        data-testid="save-file-load"
      >
        <template v-if="loading">Loading the save<AnimatedDots /></template><template v-else>{{ compact ? 'or load a save file' : 'Load a save file' }}</template>
        <input type="file" accept=".json,application/json" class="sr-only" :disabled="disabled" @change="onFile" />
      </label>
      <!-- First visit (App.vue, spec-fluff3-chrome F6): the warning as a clause after "or load a save file". -->
      <span v-if="compact" class="text-slate-500">(it is your game save: don't share it publicly)</span>
      <span v-else class="text-slate-400">This file is your game save; don't share it publicly.</span>
    </div>
    <p v-if="store.olderSaveError" class="text-body font-bold text-rose-700">{{ store.olderSaveError }}</p>
  </div>
</template>

<script setup lang="ts">
import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import { readUploadText } from '@/lib/uploadGuard';
import { plainError } from '@/lib/plainError';

const props = defineProps<{ playerId: string; compact?: boolean }>();
const emit = defineEmits<{ (e: 'loaded'): void }>();
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
    if (await store.loadSaveFile(props.playerId, text)) emit('loaded');
  } finally {
    loading.value = false;
  }
}
</script>
