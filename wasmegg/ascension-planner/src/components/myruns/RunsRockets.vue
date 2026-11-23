<!--
  My runs' rockets row (Jordan, 23 Nov 2026: "move the rockets to a section on My runs, in the ascent plan"). At the Humility
  stop of the ascension being followed (the one the player is on, or the next to come; lib/humilityStop.ts), collapsed. A
  tap opens the mission optimizer there, READ-ONLY: it is a plan to follow, with the Manual Planner's "Stage into plan"
  left out and a link to stage it there. The stop's own length and dates are the visit's; the fuel and ships are the loaded
  save's, so there is no "Reload it" step. The panel, the solver and the 84 MB loot data load only when the row is
  opened, as in the Manual Planner (HumilityOptimizer.vue).
-->
<template>
  <section v-if="stop && initialStateStore.proPermit" class="rounded-lg border border-indigo-200 bg-indigo-50/40" data-testid="runs-rockets">
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left min-h-[44px]"
      :aria-expanded="open"
      data-testid="runs-rockets-toggle"
      @click="open = !open"
    >
      <span>
        <span class="label text-indigo-700">Plan the rockets for your Humility stop</span>
        <span class="block text-small text-gray-600 mt-0.5">{{ stopLine }}</span>
      </span>
      <span
        class="flex-shrink-0 px-2 py-1 text-small font-bold rounded-md border"
        :class="open ? 'border-gray-300 bg-white text-gray-600' : 'border-indigo-600 bg-indigo-600 text-white'"
      >
        {{ open ? 'Hide' : 'Plan the rockets' }}
      </span>
    </button>

    <div v-if="open" class="border-t border-indigo-100 p-3">
      <template v-if="current">
        <component :is="panel" v-if="panel" :stop="current" />
        <p v-else-if="loadError" class="text-small text-red-600">{{ loadError }}</p>
        <p v-else role="status" class="flex items-center gap-2 text-small text-gray-600">
          <InlineSpinner />
          Loading the optimizer and its drop data<AnimatedDots />
        </p>
      </template>
      <p v-else-if="!store.player" class="text-small text-gray-600">
        The optimizer needs your ship levels and inventory from your save.
        <button type="button" class="font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50" :disabled="store.saveLoading" @click="store.loadSave()">
          <template v-if="store.saveLoading">Loading<AnimatedDots /></template><template v-else>Load my save</template>
        </button>
      </p>
      <p v-else class="text-small text-gray-600">Your save has no readable fuel tank, so the stop cannot be planned from here.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch, type Component, type ShallowRef } from 'vue';

import { safeImport } from 'lib/planners/import';
import InlineSpinner from 'ui/components/planners/InlineSpinner.vue';

import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import { formatDuration } from '@/lib/format';
import { formatMoment } from '@/lib/clock';
import { stopDurationText, type HumilityStop } from '@/lib/humilityStop';
import { visitForStop } from '@/lib/optimizerStop';
import { plainError } from '@/lib/plainError';
import { useHumilityOptimizerStore } from '@/stores/humilityOptimizer';
import { useInitialStateStore } from '@/stores/initialState';

const props = defineProps<{
  /** The Humility stop of the ascension being followed (useNowPage `humilityStop`); null: nothing to show. */
  stop: HumilityStop | null;
  /** The page's minute clock, unix seconds. */
  now: number;
  zone: string;
}>();

const store = useHumilityOptimizerStore();
const initialStateStore = useInitialStateStore();

const open = ref(false);
// The time on the stop at the moment it was opened: the visit does not move with the minute clock, which would re-solve
// every minute while the player is on the stop.
const openedAt = ref(0);
watch(open, o => {
  if (o) openedAt.value = props.now;
});

/** "Fri, May 14, 11:04 PM to Mon, May 17, 11:00 PM · 3d". */
const stopLine = computed(() => {
  const s = props.stop;
  if (!s) return '';
  const at = (t: number) => formatMoment(t * 1000, { zone: props.zone, weekday: true, year: 'auto' });
  const rough = s.approximate ? 'about ' : '';
  return `${s.current ? 'Now on it, until' : at(s.arrival) + ' to'} ${rough}${at(s.end)} · ${rough}${formatDuration(s.lengthSeconds)}`;
});

const current = computed(() => (props.stop && store.player ? visitForStop(props.stop, openedAt.value || props.now, store.player) : null));

// The days start from the stop's own length (what is left of it when the player is on it); a typed value is kept.
watch(
  current,
  c => {
    if (!c || !props.stop || !open.value) return;
    if (!store.hasSettings(c.visit)) {
      const left = props.stop.end - Math.max(openedAt.value || props.now, props.stop.arrival);
      store.update(c.visit, { duration: stopDurationText(left) });
    }
  },
  { immediate: true }
);

// Loaded on the first open, kept for the session; nothing is fetched before.
const panel: ShallowRef<Component | null> = shallowRef(null);
const loadError = ref('');
watch(
  open,
  async o => {
    if (!o || panel.value) return;
    loadError.value = '';
    try {
      panel.value = (await safeImport(() => import('@/components/actions/rockets/HumilityOptimizerPanel.vue'))).default;
    } catch (err) {
      loadError.value = plainError(err, "Couldn't load the optimizer. Try again.");
    }
  },
  { immediate: true }
);
</script>
