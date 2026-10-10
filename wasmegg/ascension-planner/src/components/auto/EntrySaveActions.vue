<!--
  On a Saved answers or Saved runs entry: the save it was priced from (search/keptSaves.ts). "Use the
  save from <date> (TE N)" makes that save the planner's active save (RunSaveNotice then says so, with
  Load my latest save) and opens the entry; "Download this save" keeps it outside the browser as a
  JSON file that "Load a save file" (SaveFileBar.vue) reads back. Entries without a kept save say why.
-->
<template>
  <div class="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
    <template v-if="state === 'kept' && entry.save">
      <button
        type="button"
        class="font-black uppercase tracking-widest text-violet-700 hover:text-violet-900 disabled:opacity-40"
        :disabled="store.busy || ui.loading || using"
        title="Load this save into the planner as your active save, with this entry's plan start and settings"
        @click="use"
      >
        {{ using ? 'Loading the save…' : `Use the save from ${when} (TE ${teLabel})` }}
      </button>
      <button
        type="button"
        class="font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 disabled:opacity-40"
        :disabled="downloading"
        @click="download"
      >
        Download this save
      </button>
    </template>
    <span v-else-if="state === 'dropped'" class="text-slate-400">
      The save for this one was dropped to make room (only the {{ MAX_KEPT_SAVES }} newest saves are kept here).
    </span>
    <span v-else-if="state === 'missing'" class="text-slate-400">
      The save for this one wasn't kept (it was no longer on this device when this was saved).
    </span>
    <span v-else class="text-slate-400">The save for this one wasn't kept (saved before 10 Oct).</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import { showDateTime } from '@/lib/displayTime';
import { MAX_KEPT_SAVES, type EntrySave } from '@/search/keptSaves';

const props = defineProps<{
  playerId: string;
  entry: { label: string; save?: EntrySave | null; planStart?: number; fingerprint?: string; settings?: unknown };
  /** The planner's time zone, for the save's date. */
  zone: string;
}>();
const emit = defineEmits<{ (e: 'used'): void }>();
const store = useChainSearchStore();
const ui = useUIStore();

const state = computed(() => store.entrySaveState(props.entry));
const when = computed(() =>
  props.entry.save?.backupAt ? showDateTime(props.entry.save.backupAt, props.zone) : 'an unknown time'
);
const teLabel = computed(() => Math.round(props.entry.save?.te ?? 0));

const using = ref(false);
async function use(): Promise<void> {
  using.value = true;
  try {
    if (await store.useEntrySave(props.playerId, props.entry)) emit('used');
  } finally {
    using.value = false;
  }
}

const downloading = ref(false);
async function download(): Promise<void> {
  if (!props.entry.save) return;
  downloading.value = true;
  try {
    const file = await store.entrySaveFile(props.playerId, props.entry.save);
    if (!file) return;
    const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } finally {
    downloading.value = false;
  }
}
</script>
