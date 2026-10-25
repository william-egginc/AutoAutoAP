<!--
  "When should I start?", Science › When should I start? (#/science/start). It sat folded at the top of
  Fastest route (the user, egg-beta review 11 Oct) until Allan's "too many boxes" (14 Oct 2026): it is a
  tool for a player coming back after a break, not a step of the search, so it has a page of its own.

  It prices the instant answer's best route by default; the other routes the instant answer listed, and
  the last search's best, are in the menu. The instant answer isn't on this page, so its routes are the
  ones Fastest last showed for this target (stores/instantSummary.ts `lastListed`). The pricing is
  StartTimeFinder.vue's (stores/chainSearch.ts `findBestStart`), unchanged, on the save and setup the
  Auto Planner has loaded. A result's "Check start times for this route" opens this page on that route
  (stores/startTimes.ts, App.vue `showStartTimes`). The run bar's kind for its sweep is 'start-times'.
-->
<template>
  <section id="start-times" class="space-y-4 scroll-mt-24" data-testid="start-times-card">
    <div class="space-y-1">
      <h2 class="text-2xl font-black text-slate-900">{{ NAMES.start }}</h2>
      <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
        For coming back after a break: one route priced as a fresh start at every hour of the next week, to see
        whether waiting for the weekly sales finishes sooner. It uses your save and Setup from the
        {{ NAMES.auto }}.
      </p>
    </div>
    <!-- Already on virtue (lib/onVirtue.ts, Jordan 16 Oct 2026): the tab and the links are hidden; a link from
         before still lands here, so say why there is nothing to pick. -->
    <p
      v-if="onVirtue"
      class="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 leading-relaxed"
      data-testid="start-times-on-virtue"
    >
      You're already ascending, so there's no start to pick.
    </p>
    <div v-else class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <p v-if="!(store.currentTE > 0)" class="text-[11px] font-semibold text-amber-700" data-testid="start-times-no-save">
        Load your save first: open {{ fastestName(store.finalTE) }} in the {{ NAMES.auto }}, then come back here.
      </p>
      <p v-else-if="store.saveNotReady" class="text-[11px] font-semibold text-amber-700">{{ store.saveNotReady }}</p>
      <p v-if="!choices.length" class="text-[11px] text-slate-500 leading-relaxed" data-testid="start-times-empty">
        It prices the instant answer's best route. Open {{ fastestName(store.finalTE) }} once so the instant answer
        loads, or use "Check start times for this route" under a search's result.
      </p>
      <label v-else class="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        <span class="font-bold text-slate-700">Route</span>
        <select
          v-model="pick"
          :disabled="store.startSweepRunning"
          class="max-w-full rounded-md border-slate-300 py-1 text-[11px] font-bold text-slate-800"
          data-testid="start-times-route"
        >
          <option v-for="c in choices" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
      </label>
      <StartTimeFinder v-if="chosen" :chain="chosen.chain" bare />
      <p v-if="newError" class="text-[11px] font-semibold text-rose-700" data-testid="start-times-error">{{ newError }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import StartTimeFinder from './StartTimeFinder.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInstantSummaryStore } from '@/stores/instantSummary';
import { useStartTimesStore } from '@/stores/startTimes';
import { startTimeChoices } from '@/lib/startTimeChoices';
import { NAMES, fastestName } from '@/lib/siteNav';
import { useInitialStateStore } from '@/stores/initialState';
import { saveOnVirtue } from '@/lib/onVirtue';

const store = useChainSearchStore();
const instant = useInstantSummaryStore();
const st = useStartTimesStore();
const initial = useInitialStateStore();
/** The save has a virtue farm going: nothing to pick a start for. No save: unknown, so the page shows. */
const onVirtue = computed(() => saveOnVirtue(initial.rawBackup) === true);

/** Why Find the best time to start didn't start (the store's error, set by `findBestStart`): only one
 *  that appeared while this page was open, not a search's error from another screen. */
const errorAtOpen = store.error;
const newError = computed(() => (!store.busy && store.error && store.error !== errorAtOpen ? store.error : ''));

/** The instant answer's routes: on screen now, else the ones Fastest last listed for this target. */
const instantRoutes = computed(() => {
  if (instant.listed.length) return instant.listed;
  const last = instant.lastListed;
  return last && last.finalTE === store.finalTE ? last.routes : [];
});
const choices = computed(() =>
  startTimeChoices({
    instant: instantRoutes.value,
    search: store.bestDays > 0 && !store.isRunning ? store.bestChain : null,
    requested: st.requested,
  })
);
/** The route picked: a link's route when one asked, else the first (the instant answer's best). */
const pick = ref('');
watch(
  () => st.requested?.join(','),
  key => {
    if (key) pick.value = key;
  },
  { immediate: true }
);
const chosen = computed(() => choices.value.find(c => c.key === pick.value) ?? choices.value[0] ?? null);
watch(chosen, c => {
  if (c && c.key !== pick.value) pick.value = c.key;
});
</script>
