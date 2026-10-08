<!--
  Highest TE by a date: the screen, framed like Fastest route (FastestRoute.vue) so the Auto
  Planner's search screens read the same way: a plain heading and one line, then the panel with
  Your setup, the search's own settings, the Find bar and the answer. The panel is the Full sweep's
  (InsanePanel, `goal="deadline"`), which hosts DeadlinePanel.

  Simple or Advanced (batch 3), the same two cards as Fastest's (ModeChooser.vue): Simple leaves the
  chain editor out and picks the routes around the instant answer (DeadlinePanel `hideRoutes`);
  Advanced is the chain editor. The choice is remembered (lib/searchMode.ts). A player who never chose
  gets Simple, unless they already have By a date work of the Advanced kind (an unfinished run or a
  last answer), which Simple would hide. A run going, or carried on, shows in its own mode, and a
  Science card's set-up opens Advanced (DeadlinePanel sets those).
-->
<template>
  <div class="max-w-4xl mx-auto space-y-4">
    <div>
      <h2 class="text-2xl font-black text-slate-900">{{ NAMES.byDate }}</h2>
      <p class="text-sm text-slate-600">
        Finds the highest TE you can reach by a date (Egg Day by default), from your save and your setup. Plans include
        the weekly Research Sale and the Monday 2× earnings boost, the same as Your plan; other game events aren't
        simulated.
      </p>
    </div>
    <InsanePanel :player-id="playerId" goal="deadline" :hide-routes="mode === 'simple'" @update:goal="onGoal">
      <template #mode>
        <ModeChooser
          :model-value="mode"
          :options="MODES"
          :running="store.deadlineRunning ? (store.deadlineRunSimple ? 'simple' : 'advanced') : null"
          @update:model-value="pick"
        />
      </template>
    </InsanePanel>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { safeAsyncComponent } from '@/lib/import';
import { readSearchMode, writeSearchMode, type SearchMode } from '@/lib/searchMode';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import ModeChooser from './ModeChooser.vue';

defineProps<{ playerId: string }>();
const emit = defineEmits<{ goal: [goal: 'fastest' | 'deadline'] }>();

const InsanePanel = safeAsyncComponent(() => import('./InsanePanel.vue'));
const store = useChainSearchStore();
const ui = useUIStore();

const MODES: { id: SearchMode; label: string; blurb: string }[] = [
  {
    id: 'simple',
    label: 'Simple',
    blurb:
      "Pick a date and press Find: it checks the instant answer's best route for each number of ascensions and a few TE either side with the full simulator.",
  },
  {
    id: 'advanced',
    label: 'Advanced',
    blurb: 'You set the chains, their boxes and sliders, and it tries every route in them.',
  },
];

/** Once per page load: the player's last pick, else Simple (the watch below may move it to Advanced). */
if (ui.byDateMode === null) ui.byDateMode = readSearchMode('by-date') ?? 'simple';
const mode = computed<SearchMode>(() => ui.byDateMode ?? 'simple');

function pick(m: SearchMode): void {
  writeSearchMode('by-date', m);
  ui.byDateMode = m;
}

// Work Simple would hide, for a player who never chose: an unfinished Advanced run or an Advanced
// answer (both load after the screen opens). And whatever the choice, a run going is shown in its
// own mode (a carry-on started by Stepping away, say).
watch(
  () =>
    [
      store.deadlineRunning,
      store.deadlineRunSimple,
      store.deadlineUnfinished?.spec,
      store.deadlineResult?.bandSets?.length ?? 0,
      store.deadlineResult?.simple,
    ] as const,
  ([running, runSimple, unfinished, resultBoxes, resultSimple]) => {
    if (running) {
      ui.byDateMode = runSimple ? 'simple' : 'advanced';
      return;
    }
    if (readSearchMode('by-date') !== null) return;
    if ((unfinished && !unfinished.simple) || (resultBoxes && !resultSimple)) ui.byDateMode = 'advanced';
  },
  { immediate: true }
);

/** Carrying on a fastest run from here: App changes screen. */
function onGoal(g: 'fastest' | 'deadline'): void {
  emit('goal', g);
}
</script>
