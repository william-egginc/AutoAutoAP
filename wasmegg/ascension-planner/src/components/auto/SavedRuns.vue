<!--
  Saved runs: the run library (search/runLibrary.ts), kept in this browser per player. Was the Full
  sweep's alone; the user asked whether they could all save (30 Sept), and the library already
  holds Smart search runs too (a staged run is saved without a space), so both depths of Fastest
  route show it now. Highest TE by a date keeps its answers in a different shape and has its own
  carry-on instead. One entry per run: saving it again says Saved ✓ and refreshes it (red team R7).

  Resume (carry on an unfinished run) is the Full sweep's: it re-enters `startExhaustive` with the
  saved space, so it is offered only there, and only for a sweep. Open works for either kind.

  Saved from the result card's one Save (RouteResultCard.vue, UX fluff review 2, 5 Nov 2026): this list had its own
  name box and "Save this run" for the same run until then.

  `list-only` (My runs, 15 Oct 2026): the list alone, without the explanation, Save this run or the
  save-file bar, and Open says so (`opened`) for My runs to show the screen it opened on. There, each run
  says how the latest save is doing against it (R6, PaceBadge.vue); its legs are in the run's body, read
  only while `pace-active` (My runs' "Saved on this device" is open), one run at a time.
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-slate-500 label">{{ heading || 'Saved runs' }}</h3>
      <span class="text-small font-bold text-slate-400">{{ store.savedRuns.length }} / {{ MAX_RUNS }}</span>
    </div>
    <!-- One line and a fold (UX fluff review 2, 5 Nov 2026, item C7); the run is saved from the result card's one Save
         (item C7b: the name box and "Save this run" here were a second Save for the same run). DRAFT (Words). -->
    <div v-if="!listOnly" class="text-body text-slate-500 max-w-prose">
      <p>
        Kept in this browser; past {{ MAX_RUNS }}, the oldest goes.{{ ' ' }}<button
          type="button"
          class="inline-flex min-h-[44px] items-center font-bold text-slate-600 underline decoration-dotted underline-offset-2 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 sm:min-h-0"
          :aria-expanded="howOpen"
          :aria-controls="howId"
          data-testid="saved-runs-how"
          @click="howOpen = !howOpen"
        >
          How carrying on works {{ howOpen ? '⌄' : '›' }}
        </button>
      </p>
      <p v-show="howOpen" :id="howId" class="mt-1">
        Kept per player, for both {{ NAMES.smartFirst }} and {{ NAMES.fullFirst }}. A saved run carries on with the save
        it started with while that save is kept here, and puts its target, schedule, time off and plan start back;
        without that save, your TE has to be the same. Each run also keeps the save it was priced from, so you can go
        back to it after the game has moved on.
      </p>
    </div>

    <p v-if="note" class="text-body font-bold text-amber-700">{{ note }}</p>

    <p v-if="!store.savedRuns.length" class="text-body text-slate-400">Nothing saved yet.</p>
    <div v-else class="divide-y divide-slate-100">
      <div v-for="run in store.savedRuns" :key="run.id" class="flex flex-wrap items-center gap-3 py-2">
        <div class="flex-1 min-w-[14rem]">
          <div class="text-small font-bold text-slate-800">
            {{ run.label }}
            <span class="ml-1 px-1.5 py-0.5 rounded bg-slate-100 label text-slate-500">{{
              run.space ? NAMES.full : NAMES.smart
            }}</span>
          </div>
          <div class="text-small text-slate-400 tabular-nums">
            {{ run.bestChain.join(' ') }} · {{ run.bestDays.toFixed(3) }} d · {{ plural(run.chainsPriced, 'route') }}<template
              v-if="!run.complete"
            >
              · stopped early<template v-if="run.space?.chains">
                at {{ run.chainsPriced.toLocaleString() }} of {{ run.space.chains.toLocaleString() }}</template
              ></template
            >
          </div>
          <PaceBadge
            v-if="listOnly"
            class="mt-1"
            :words="pace.paceOf({ kind: 'run', run, goalKey: `fastest-${run.finalTE}` })"
          />
          <BaselineChip v-if="listOnly && baselineOf(run)" class="mt-1" :line="baselineOf(run)" />
        </div>
        <!-- Resume, not just Open: an unfinished sweep holds every chain it priced, and without this
             the only way to use them was to retype the space and let the search rediscover them. -->
        <button
          v-if="canResume && !run.complete && run.space"
          type="button"
          :disabled="store.busy || resuming !== ''"
          class="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-body font-bold hover:bg-indigo-700 disabled:opacity-40"
          @click="resume(run.id)"
        >
          <template v-if="resuming === run.id">Carrying on<AnimatedDots /></template><template v-else>Carry on</template>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-md border border-slate-300 text-body font-bold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40"
          :disabled="store.busy || store.sweepQueue.at >= 0"
          title="Opening a run replaces the results on screen, so it's off while a run is going"
          @click="open(run.id)"
        >
          Open
        </button>
        <FollowButton
          v-if="run.bestChain.length"
          :chain="run.bestChain"
          :goal-key="`fastest-${run.finalTE}`"
          from="saved"
          :label="run.label"
          :source="sourceOfLevel(foundLevel({ custom: !!run.space, effort: run.effort }))"
          :finish="runFinish(run)"
          :end-te="run.finalTE"
          :plan-start="fingerprintPlanStart(run.fingerprint)"
        />
        <button
          type="button"
          class="px-3 py-1.5 rounded-md border border-slate-300 text-body font-bold text-slate-500 hover:border-red-300 hover:text-red-600"
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
    <SaveFileBar v-if="!listOnly" :player-id="playerId" />
  </div>
</template>

<script setup lang="ts">
import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import { plural } from '@/lib/format';
import { computed, onMounted, ref, useId } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { MAX_RUNS } from '@/search/runLibrary';
import { NAMES } from '@/lib/siteNav';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import EntrySaveActions from './EntrySaveActions.vue';
import FollowButton from '../FollowButton.vue';
import { sourceOfLevel } from '@/lib/followCloud';
import SaveFileBar from './SaveFileBar.vue';
import PaceBadge from '../myruns/PaceBadge.vue';
import { usePlanPace } from '@/composables/usePlanPace';
import BaselineChip from '../myruns/BaselineChip.vue';
import { useBaselines } from '@/composables/useBaselines';
import { fingerprintPlanStart } from '@/search/persistence';
import { foundLevel } from '@/lib/searchPointer';
import type { RunSummary } from '@/search/runLibrary';

const props = defineProps<{
  playerId: string;
  /** The Full sweep's screen: an unfinished sweep can be carried on from here. */
  canResume?: boolean;
  /** My runs: the list alone (no explanation, no Save this run, no save-file bar). */
  listOnly?: boolean;
  /** My runs' "Saved on this device" is open: the badges may read the runs' bodies (one at a time). */
  paceActive?: boolean;
  /** The list's heading: Custom's says "Saved for later", as its text does (Words, 26 Oct 2026); "Saved runs" else. */
  heading?: string;
}>();
/** A run was opened: `full` when it is an Exhaustive run (it has a space), for My runs to show its screen. */
const emit = defineEmits<{ opened: [run: { full: boolean }] }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();
/** The planner's time zone, for the save's date. */
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

onMounted(() => void store.refreshSavedRuns(props.playerId));

/** "N hours ahead / behind" on each run (My runs only). */
const pace = usePlanPace({
  playerId: () => props.playerId,
  active: () => !!props.listOnly && !!props.paceActive,
  entries: () => store.savedRuns.map(run => ({ kind: 'run' as const, run, goalKey: `fastest-${run.finalTE}` })),
});

/** "vs your instant baseline: 1.2 days sooner (Fast)" (My runs, wireframe B1): the instant answer for the run's
 *  target and save, logged here (lib/instantBaseline.ts); null without one or without the run's start. */
/** A saved run's finish: its plan start (from its fingerprint) plus its best days; null when either is unknown. */
function runFinish(run: RunSummary): number | null {
  const start = fingerprintPlanStart(run.fingerprint);
  return start && run.bestDays > 0 ? Math.round(start + run.bestDays * 86400) : null;
}
const baselines = props.listOnly ? useBaselines() : null;
function baselineOf(run: RunSummary) {
  const start = fingerprintPlanStart(run.fingerprint);
  if (!baselines || !start) return null;
  return baselines.lineFor({
    goal: `target ${run.finalTE}`,
    backupTime: run.save?.backupAt ?? null,
    run: { goal: 'fastest', end: start + run.bestDays * 86400, endTE: run.finalTE },
    level: run.space ? 'Custom' : foundLevel({ custom: false, effort: String(run.effort) }),
  });
}

/** "How carrying on works ›", folded by default (item C7). */
const howOpen = ref(false);
const howId = `saved-runs-how-${useId()}`;
const note = ref('');
const resuming = ref('');

async function open(id: string): Promise<void> {
  store.sweepQueue.results = [];
  const opened = await store.openSavedRun(props.playerId, id);
  if (opened) emit('opened', { full: !!store.savedRuns.find(r => r.id === id)?.space });
  note.value =
    props.canResume && store.openedRun?.space && !store.canResumeOpenedRun
      ? `Can't carry on: ${store.resumeBlocker}.`
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
      note.value = `Can't carry on: ${store.resumeBlocker}.`;
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
