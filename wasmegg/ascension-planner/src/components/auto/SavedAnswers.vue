<!--
  By a date's answers kept under a name (the user, 5 Oct: a new search no longer loses one): "Save this
  answer" beside the result's other buttons (`actions` slot: Download CSV), whatever the screen says
  under it (default slot), then the list with Open and Delete. Kept in this browser per player by the
  store (`saveCurrentAnswer`, `savedAnswers`), in By a date's own format.

  Not the same list as Saved runs (SavedRuns.vue), which holds Smart search and Full sweep runs in the
  run library, carries them on and names them after saving: the two stores hold different records,
  and joining them would change both. Several roots, so it sits in the screen's own spacing.
-->
<template>
  <div class="flex flex-wrap items-center gap-2">
    <slot name="actions" />
    <input
      v-model="label"
      type="text"
      maxlength="80"
      :placeholder="defaultLabel"
      aria-label="Name for this answer"
      class="w-64 max-w-full rounded-lg border-slate-300 text-xs text-slate-800"
    />
    <button
      type="button"
      class="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40"
      :disabled="saving"
      @click="save"
    >
      {{ flash ? 'Saved' : 'Save this answer' }}
    </button>
  </div>
  <slot />
  <div v-if="store.savedAnswers.length" class="space-y-1">
    <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saved answers</h4>
    <div
      v-for="a in store.savedAnswers"
      :key="a.id"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 text-[11px]"
    >
      <span class="font-bold text-slate-800">{{ a.label }}</span>
      <span class="text-slate-500"
        >{{ a.result.routes[0] ? a.result.routes[0].chain.join(' ') : 'no route' }} · saved
        {{ showDateTime(a.savedAt / 1000, zone) }}</span
      >
      <button
        type="button"
        class="ml-auto text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
        :disabled="store.deadlineRunning"
        @click="store.openSavedAnswer(a.id)"
      >
        Open
      </button>
      <button
        type="button"
        class="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600"
        @click="store.removeSavedAnswer(playerId, a.id)"
      >
        Delete
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { showDateTime } from '@/lib/displayTime';

const props = defineProps<{
  playerId: string;
  /** The name an answer saved with an empty box gets ("377 TE by Jul 14, 2027, 9:00 AM"). */
  defaultLabel: string;
  /** The planner's time zone, for "saved Oct 8, 2026, 2:22 PM". */
  zone: string;
}>();
const store = useChainSearchStore();

const label = ref('');
const saving = ref(false);
const flash = ref(false);
async function save(): Promise<void> {
  saving.value = true;
  try {
    await store.saveCurrentAnswer(props.playerId, label.value || props.defaultLabel);
    label.value = '';
    flash.value = true;
    setTimeout(() => (flash.value = false), 2000);
  } finally {
    saving.value = false;
  }
}

onMounted(() => void store.refreshSavedAnswers(props.playerId));
watch(
  () => props.playerId,
  id => void store.refreshSavedAnswers(id)
);
</script>
