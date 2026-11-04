<!--
  By a date's answers kept under a name (the user, 5 Oct: a new search no longer loses one): "Save this
  answer" ("Saved ✓" once the answer on screen is in the list, one entry however often it is saved) beside the result's other buttons (`actions` slot: Download CSV), whatever the screen says
  under it (default slot), then the list with Open and Delete, and each entry's save (EntrySaveActions:
  Use the save from…, Download this save). Kept in this browser per player by the
  store (`saveCurrentAnswer`, `savedAnswers`), in By a date's own format.

  Not the same list as Saved runs (SavedRuns.vue), which holds Smart search and Full sweep runs in the
  run library, carries them on and names them after saving: the two stores hold different records,
  and joining them would change both. Several roots, so it sits in the screen's own spacing.

  `list-only` (My runs, 15 Oct 2026): the list alone, without Save this answer or the slots, and Open says
  so (`opened`) for My runs to show By a date. There, each answer says how the latest save is doing against
  it (R6, PaceBadge.vue), worked out while `pace-active` (My runs' "Saved on this device" is open).
-->
<template>
  <div v-if="!listOnly" class="flex flex-wrap items-center gap-2">
    <slot name="actions" />
    <input
      v-model="label"
      type="text"
      maxlength="80"
      :placeholder="defaultLabel"
      aria-label="Name for this answer"
      class="w-64 max-w-full rounded-lg border-slate-300 text-body text-slate-800"
    />
    <button
      type="button"
      class="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-body font-bold hover:bg-slate-700 disabled:opacity-40"
      :disabled="saving"
      @click="save"
    >
      {{ savedHere ? 'Saved ✓' : 'Save this answer' }}
    </button>
  </div>
  <slot v-if="!listOnly" />
  <div v-if="store.savedAnswers.length" class="space-y-1">
    <h4 class="text-slate-500 label">Saved answers</h4>
    <div
      v-for="a in store.savedAnswers"
      :key="a.id"
      class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 text-small"
    >
      <span class="font-bold text-slate-800">{{ a.label }}</span>
      <span class="text-slate-500"
        >{{ a.result.routes[0] ? a.result.routes[0].chain.join(' ') : 'no route' }} · saved
        {{ showDateTime(a.savedAt / 1000, zone) }}</span
      >
      <button
        type="button"
        class="ml-auto text-body font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
        :disabled="store.deadlineRunning"
        @click="open(a.id)"
      >
        Open
      </button>
      <FollowButton
        v-if="a.result.routes[0]?.chain.length && followableAnswer(a.result.routes[0], a.result.deadline)"
        :chain="a.result.routes[0].chain"
        :goal-key="screenGoalKey(a.result.deadline, a.result.te)"
        from="saved"
        :label="a.label"
        :source="sourceOfLevel(foundLevel({ custom: !a.result.simple, effort: a.result.level }))"
        :finish="a.result.routes[0].reachAt"
        :end-te="a.result.routes[0].chain[a.result.routes[0].chain.length - 1]"
        :plan-start="a.result.planStart"
        :deadline="a.result.deadline"
      />
      <button
        type="button"
        class="text-body font-bold text-slate-400 hover:text-rose-600"
        @click="store.removeSavedAnswer(playerId, a.id)"
      >
        Delete
      </button>
      <EntrySaveActions
        :player-id="playerId"
        :entry="{ label: a.label, save: a.save, planStart: a.result.planStart, settings: a.result.settings }"
        :zone="zone"
        @used="open(a.id)"
      />
      <PaceBadge
        v-if="listOnly"
        :words="pace.paceOf({ kind: 'answer', answer: a, goalKey: screenGoalKey(a.result.deadline, a.result.te) })"
      />
      <BaselineChip v-if="listOnly && baselineOf(a)" :line="baselineOf(a)" />
    </div>
    <SaveFileBar v-if="!listOnly" :player-id="playerId" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { showDateTime } from '@/lib/displayTime';
import EntrySaveActions from './EntrySaveActions.vue';
import FollowButton from '../FollowButton.vue';
import { followableAnswer, screenGoalKey } from '@/lib/follow';
import { sourceOfLevel } from '@/lib/followCloud';
import SaveFileBar from './SaveFileBar.vue';
import PaceBadge from '../myruns/PaceBadge.vue';
import { usePlanPace } from '@/composables/usePlanPace';
import BaselineChip from '../myruns/BaselineChip.vue';
import { useBaselines } from '@/composables/useBaselines';
import { foundLevel } from '@/lib/searchPointer';

const props = defineProps<{
  playerId: string;
  /** The name an answer saved with an empty box gets ("377 TE by Jul 14, 2027, 9:00 AM"). */
  defaultLabel: string;
  /** The planner's time zone, for "saved Oct 8, 2026, 2:22 PM". */
  zone: string;
  /** My runs: the list alone (no Save this answer, no slots, no save-file bar). */
  listOnly?: boolean;
  /** My runs' "Saved on this device" is open: the badges may load what they need (one answer at a time). */
  paceActive?: boolean;
}>();
const emit = defineEmits<{ opened: [] }>();
const store = useChainSearchStore();

/** "vs your instant baseline: −1 TE (313 → 312), 0.28 days more spare (Fast)" (My runs, wireframe B1): the instant
 *  answer for the answer's date and save, logged here (lib/instantBaseline.ts); null without one. */
const baselines = props.listOnly ? useBaselines() : null;
function baselineOf(a: (typeof store.savedAnswers)[number]) {
  const route = a.result.routes[0];
  if (!baselines || !route) return null;
  return baselines.lineFor({
    goal: `date ${a.result.deadline}`,
    backupTime: a.save?.backupAt ?? null,
    run: { goal: 'date', deadline: a.result.deadline, end: route.reachAt, endTE: route.chain[route.chain.length - 1] ?? 0 },
    level: foundLevel({ custom: !a.result.simple, effort: a.result.level }),
  });
}

function open(id: string): void {
  store.openSavedAnswer(id);
  emit('opened');
}

const label = ref('');
const saving = ref(false);
/** "Saved ✓" while the answer on screen is in the list (from either save button: the card's Save answer too), unless
 *  a name is typed, which saving again gives it. Saving again never adds a second entry (store `saveCurrentAnswer`). */
const savedHere = computed(() => store.currentAnswerSaved && !label.value.trim());
async function save(): Promise<void> {
  saving.value = true;
  try {
    const named = !!label.value.trim();
    await store.saveCurrentAnswer(props.playerId, label.value || props.defaultLabel, named);
    label.value = '';
  } finally {
    saving.value = false;
  }
}

onMounted(() => void store.refreshSavedAnswers(props.playerId));

/** "N hours ahead / behind" on each answer (My runs only). */
const pace = usePlanPace({
  playerId: () => props.playerId,
  active: () => !!props.listOnly && !!props.paceActive,
  entries: () =>
    store.savedAnswers.map(answer => ({
      kind: 'answer' as const,
      answer,
      goalKey: screenGoalKey(answer.result.deadline, answer.result.te),
    })),
});
watch(
  () => props.playerId,
  id => void store.refreshSavedAnswers(id)
);
</script>
