<!--
  Under Saved answers and Saved runs: "Load a save file" (a save from "Download this save", or the
  game's backup as JSON) as the planner's active save, the one-line warning about sharing those files,
  and why the last Use / Download / Load did not happen.
-->
<template>
  <div class="space-y-1">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
      <label
        class="font-black uppercase tracking-widest text-slate-500 hover:text-slate-800"
        :class="disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'"
      >
        {{ loading ? 'Loading the save…' : 'Load a save file' }}
        <input type="file" accept=".json,application/json" class="hidden" :disabled="disabled" @change="onFile" />
      </label>
      <span class="text-slate-400">This file is your game save; don't share it publicly.</span>
    </div>
    <p v-if="store.olderSaveError" class="text-[11px] font-semibold text-rose-700">{{ store.olderSaveError }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';

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
    await store.loadSaveFile(props.playerId, await file.text());
  } finally {
    loading.value = false;
  }
}
</script>
