<!--
  Unfinished runs a later run moved aside (search/persistence.ts keeps the last few), each with the
  save it was priced on when that was kept. Starting a new run used to overwrite the one unfinished
  run there was, silently; now it lands here and can be carried on or thrown away.
-->
<template>
  <div
    v-if="items.length && !store.busy"
    class="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2 text-[11px] text-amber-900"
  >
    <h3 class="text-[10px] font-black text-amber-800 uppercase tracking-widest">Earlier unfinished runs</h3>
    <!-- Runs more than a day old fold into one line (the user, 12 Oct: clutter); Show lists them. -->
    <p v-if="old.length && !showOld" class="flex flex-wrap items-center gap-x-2" data-testid="unfinished-old">
      <span
        >{{ old.length === 1 ? '1 older run' : `${old.length} older runs` }}, the newest {{ ago(newestOld) }}</span
      >
      <button
        type="button"
        class="font-bold text-amber-800 underline decoration-dotted underline-offset-2 hover:text-amber-950"
        data-testid="unfinished-old-show"
        @click="showOld = true"
      >
        Show
      </button>
    </p>
    <div v-for="item in shown" :key="item.id" class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="leading-relaxed">
        <span class="font-bold">{{ item.record.durations.length.toLocaleString() }}</span>
        <template v-if="item.record.space?.chains"> of {{ item.record.space.chains.toLocaleString() }}</template>
        plans priced, best {{ item.record.bestChain.join(' ') }} · {{ ago(item.record.updatedAt) }}
        <template v-if="item.save"> · save from {{ when(item.save.backupAt) }}, TE {{ item.save.te }} </template>
        <template v-else> · no save kept, so it can only carry on if your save still matches</template>
      </span>
      <button
        type="button"
        :disabled="busy || store.busy"
        class="px-3 py-1 rounded-md bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800 disabled:opacity-40"
        @click="carryOn(item.id)"
      >
        Carry on
      </button>
      <button
        type="button"
        :disabled="busy || store.busy"
        class="text-[10px] font-black uppercase tracking-widest text-amber-700/70 hover:text-amber-900"
        @click="store.discardInterruptedRun(playerId, item.id)"
      >
        Discard
      </button>
    </div>
    <p v-if="note" class="font-semibold text-amber-800">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { showDateTime } from '@/lib/displayTime';
import { interruptedId } from '@/search/persistence';

const props = defineProps<{
  playerId: string;
  /** Exhaustive runs carry a space; staged ones do not. Each panel lists its own kind. */
  kind: 'exhaustive' | 'staged';
}>();
const emit = defineEmits<{ (e: 'resume'): void }>();

const store = useChainSearchStore();
const planner = useAutoPlannerStore();
const busy = ref(false);
const note = ref('');
const showOld = ref(false);

const items = computed(() =>
  store.interrupted
    .map(record => ({ record, id: interruptedId(record), save: store.runSaveFor(record.inputsKey) }))
    .filter(i => (props.kind === 'exhaustive' ? !!i.record.space : !i.record.space))
    // Another account's runs are never offered here (stores/chainSearch.ts `otherAccountKeys`).
    .filter(i => !i.record.inputsKey || !store.otherAccountKeys.has(i.record.inputsKey))
);

/** More than a day old: folded into one line until Show. */
const DAY_MS = 24 * 3600 * 1000;
const old = computed(() => items.value.filter(i => Date.now() - i.record.updatedAt > DAY_MS));
const newestOld = computed(() => Math.max(...old.value.map(i => i.record.updatedAt)));
const shown = computed(() =>
  showOld.value ? items.value : items.value.filter(i => Date.now() - i.record.updatedAt <= DAY_MS)
);

/** By the run's id (persistence.ts `interruptedId`): the list can change between drawing and the click. */
async function carryOn(id: string): Promise<void> {
  busy.value = true;
  note.value = '';
  try {
    // Into the checkpoint slot first (the run there now takes its place in this list), then the
    // panel's own Resume, which knows how to carry on its kind of run.
    if (await store.promoteInterrupted(props.playerId, id)) emit('resume');
    else
      note.value = store.blockedCheckpoint
        ? `Can't carry on: ${store.blockedCheckpoint.changes.join('; ')}.`
        : "Can't carry on.";
  } finally {
    busy.value = false;
  }
}

function when(unixSeconds: number): string {
  if (!unixSeconds) return 'an unknown time';
  return showDateTime(unixSeconds, planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
</script>
