<!--
  Saved runs: the run library (search/runLibrary.ts), kept in this browser per player. Was the Full
  sweep's alone; the user asked whether they could all save (30 Sept), and the library already
  holds Smart search runs too (a staged run is saved without a space), so both depths of Fastest
  route show it now. Highest TE by a date keeps its answers in a different shape and has its own
  carry-on instead.

  Resume (carry on an unfinished run) is the Full sweep's: it re-enters `startExhaustive` with the
  saved space, so it is offered only there, and only for a sweep. Open works for either kind.
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saved runs</h3>
      <span class="text-[10px] font-bold text-slate-400">{{ store.savedRuns.length }} / {{ MAX_RUNS }}</span>
    </div>
    <p class="text-[11px] text-slate-500 leading-relaxed">
      Kept in this browser, per player, for both {{ NAMES.smartFirst }} and {{ NAMES.fullFirst }}. A saved run carries on with
      the save it started with while that save is kept here, and puts its target, schedule, time off and plan start
      back; without that save, your TE has to be the same. Past {{ MAX_RUNS }}, the oldest is dropped. Each run also
      keeps the save it was priced from, so you can go back to it after the game has moved on.
    </p>

    <div class="flex flex-wrap gap-2">
      <input
        v-model="label"
        type="text"
        placeholder="Name this run (optional)"
        class="flex-1 min-w-[12rem] rounded-lg border-slate-300 text-sm text-slate-800"
      />
      <button
        type="button"
        :disabled="store.bestDays <= 0 || store.isRunning || saving"
        class="px-4 py-2 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40"
        @click="save"
      >
        {{ saving ? 'Saving...' : 'Save this run' }}
      </button>
    </div>

    <p v-if="note" class="text-[11px] font-semibold text-amber-700 leading-relaxed">{{ note }}</p>

    <p v-if="!store.savedRuns.length" class="text-[11px] text-slate-400">Nothing saved yet.</p>
    <div v-else class="divide-y divide-slate-100">
      <div v-for="run in store.savedRuns" :key="run.id" class="flex flex-wrap items-center gap-3 py-2">
        <div class="flex-1 min-w-[14rem]">
          <div class="text-xs font-bold text-slate-800">
            {{ run.label }}
            <span class="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-black uppercase text-slate-500">{{
              run.space ? NAMES.full : NAMES.smart
            }}</span>
          </div>
          <div class="text-[10px] text-slate-400 font-mono-premium">
            {{ run.bestChain.join(' ') }} · {{ run.bestDays.toFixed(3) }} d · {{ run.chainsPriced }} chains<template
              v-if="!run.complete"
            >
              · stopped early<template v-if="run.space?.chains">
                at {{ run.chainsPriced.toLocaleString() }} of {{ run.space.chains.toLocaleString() }}</template
              ></template
            >
          </div>
        </div>
        <!-- Resume, not just Open: an unfinished sweep holds every chain it priced, and without this
             the only way to use them was to retype the space and let the search rediscover them. -->
        <button
          v-if="canResume && !run.complete && run.space"
          type="button"
          :disabled="store.busy || resuming !== ''"
          class="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-40"
          @click="resume(run.id)"
        >
          {{ resuming === run.id ? 'Resuming…' : 'Resume' }}
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40"
          :disabled="store.busy || store.sweepQueue.at >= 0"
          title="Opening a run replaces the results on screen, so it's off while a run is going"
          @click="open(run.id)"
        >
          Open
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-red-300 hover:text-red-600"
          @click="store.deleteSavedRun(playerId, run.id)"
        >
          Delete
        </button>
        <EntrySaveActions
          :player-id="playerId"
          :entry="{ label: run.label, save: run.save, fingerprint: run.fingerprint }"
          :zone="zone"
          @used="open(run.id)"
        />
      </div>
    </div>
    <SaveFileBar :player-id="playerId" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { MAX_RUNS } from '@/search/runLibrary';
import { NAMES } from '@/lib/siteNav';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import EntrySaveActions from './EntrySaveActions.vue';
import SaveFileBar from './SaveFileBar.vue';

const props = defineProps<{
  playerId: string;
  /** The Full sweep's screen: an unfinished sweep can be carried on from here. */
  canResume?: boolean;
}>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();
/** The planner's time zone, for the save's date. */
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

onMounted(() => void store.refreshSavedRuns(props.playerId));

const label = ref('');
const saving = ref(false);
const note = ref('');
const resuming = ref('');

async function save(): Promise<void> {
  saving.value = true;
  try {
    await store.saveCurrentRun(props.playerId, label.value);
    label.value = '';
  } finally {
    saving.value = false;
  }
}

async function open(id: string): Promise<void> {
  store.sweepQueue.results = [];
  await store.openSavedRun(props.playerId, id);
  note.value =
    props.canResume && store.openedRun?.space && !store.canResumeOpenedRun
      ? `Cannot resume: ${store.resumeBlocker}.`
      : '';
}

/**
 * Load a saved sweep and carry straight on from where it stopped. Opening first is what puts its
 * priced chains into the store's cache, which `startExhaustive` carries forward; resuming without it
 * would re-price everything.
 */
async function resume(id: string): Promise<void> {
  resuming.value = id;
  note.value = '';
  try {
    if (!(await store.openSavedRun(props.playerId, id))) {
      note.value = 'That run could not be opened.';
      return;
    }
    if (!store.canResumeOpenedRun) {
      note.value = `Cannot resume: ${store.resumeBlocker}.`;
      return;
    }
    const restored = store.planStartRestoreNote(store.openedRun?.fingerprint);
    if (restored) note.value = `Plan start set back to ${restored}, the time this run was priced from.`;
    await store.resumeOpenedRun(props.playerId);
  } finally {
    resuming.value = '';
  }
}
</script>
