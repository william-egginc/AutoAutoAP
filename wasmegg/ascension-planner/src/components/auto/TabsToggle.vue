<!-- Which optional tabs show, in this browser (composables/useTabPrefs.ts, 21 Oct 2026): Setup › How the site shows
     things. Both off by default; with no collector both boxes are greyed out, since there is no board to show. -->
<template>
  <div class="space-y-1" data-testid="tabs-toggle">
    <p class="text-body text-slate-500">{{ TABS_HIDDEN_NOTE }}</p>
    <label
      v-for="t in ROWS"
      :key="t.id"
      class="flex min-h-[44px] items-start gap-3 py-1.5"
      :class="collector ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'"
      :data-testid="`tabs-toggle-${t.id}`"
    >
      <input
        type="checkbox"
        class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-indigo-600"
        :checked="collector && prefs[t.id]"
        :disabled="!collector"
        @change="setTabPref(t.id, ($event.target as HTMLInputElement).checked)"
      />
      <span class="text-body text-slate-600">
        <span class="font-bold text-slate-800">{{ t.label }}</span>
        <span class="block">{{ collector ? t.what : NO_COLLECTOR }}</span>
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { setTabPref, useTabPrefs, type OptionalTab } from '@/composables/useTabPrefs';
import { NAMES } from '@/lib/siteNav';

const store = useChainSearchStore();
const collector = !!store.submitUrl;
const { prefs } = useTabPrefs(() => collector);

/** For players who used the Leaderboard before it went behind this box. */
const TABS_HIDDEN_NOTE = `The ${NAMES.compare} and ${NAMES.science} tabs show only when you turn them on here.`;
const NO_COLLECTOR = 'This build has no leaderboard, so there is nothing to show.';
const ROWS: { id: OptionalTab; label: string; what: string }[] = [
  {
    id: 'leaderboard',
    label: `Show the ${NAMES.compare} tab`,
    what: "Everyone’s shared runs: Egg Day, Fastest to 490 TE and the charts.",
  },
  {
    id: 'science',
    label: `Show the ${NAMES.science} tab`,
    what: 'How the planner works and how its answers were checked, and the sweeps still to run.',
  },
];
</script>
