<!--
  "Stronger check" under the instant answer, on Fastest and By a date (the user, 12 Oct 2026): one box
  for "Try: stronger check" and "Search around this answer", with a level bar for how much stronger.
  Light is the stronger check alone (InstantRoute.vue teleports StrongerCheck into `#stronger-check-results`
  here, always on): your earlier routes priced on this save and, by a date, one TE lower, after Check
  exactly. The levels above it also run the search around the instant answer (the default slot:
  Fastest's Smart search at that effort, By a date's routes around the answer), its controls and results
  in this box. What it promises, and what it doesn't, is said here.
-->
<template>
  <section class="rounded-2xl border border-indigo-200 bg-white p-4 space-y-3" data-testid="stronger-box">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="text-base font-black text-slate-900">Stronger check</h3>
      <span
        v-if="running"
        class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest"
        >Running</span
      >
    </div>
    <p class="text-[12px] text-slate-600 leading-relaxed">
      Checks the instant answer harder, with the full simulator on your save. Light prices routes you have already
      found; Fast, Exact and Very high also search the routes near the instant answer's ({{ NAMES.smart }}). Pick how
      much harder:
    </p>
    <div
      class="grid gap-1 rounded-xl bg-slate-100 p-1"
      :class="'grid-cols-2 sm:grid-cols-4'"
      role="radiogroup"
      aria-label="How much stronger"
    >
      <button
        v-for="l in levels"
        :key="l.id"
        type="button"
        role="radio"
        :aria-checked="level === l.id"
        :disabled="running"
        :data-testid="`level-${l.id}`"
        class="rounded-lg px-2 py-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-60"
        :class="level === l.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-800'"
        @click="pick(l.id)"
      >
        {{ l.label }}
      </button>
    </div>
    <p class="text-[11px] text-slate-700 leading-relaxed" data-testid="level-note">
      <span class="font-bold text-slate-900">{{ current.time }}</span> {{ current.words }}
    </p>
    <!-- By a date: each search level's cost on this computer, before anything starts. -->
    <ul v-if="estimates && Object.keys(estimates).length" class="text-[11px] space-y-0.5" data-testid="level-estimates">
      <li
        v-for="l in levels.filter(x => estimates![x.id])"
        :key="l.id"
        :class="l.id === level ? 'font-bold text-indigo-800' : 'text-slate-500'"
      >
        {{ l.label }}: {{ estimates![l.id] }}
      </li>
    </ul>
    <details class="text-[11px] text-slate-600" data-testid="stronger-promise">
      <summary class="cursor-pointer font-bold text-slate-700">What this does and does not promise</summary>
      <ul class="mt-1 pl-4 list-disc space-y-0.5 leading-relaxed">
        <li>
          Every route it shows is priced with the full simulator on your save, the same as Check exactly, so its
          times are your own.
        </li>
        <li>
          It finds a strong nearby answer, not a proven best: a better route far from the instant answer's can be
          missed. {{ NAMES.full }}, below, is proven only inside the boxes you set.
        </li>
        <li>Light needs Check exactly to have finished; it waits while a search is running.</li>
      </ul>
    </details>
    <!-- The stronger check's own results (earlier routes, one TE lower, Best now). -->
    <h4 class="pt-1 text-[10px] font-black uppercase tracking-widest text-slate-500" data-testid="light-results-heading">
      {{ goal === 'date' ? 'Your earlier routes, and one TE lower' : 'Your earlier routes' }}
    </h4>
    <div id="stronger-check-results" />
    <!-- At Fast and above: the search of the routes near the instant answer's, its controls and results. -->
    <h4
      v-if="level !== 'light'"
      class="pt-2 border-t border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500"
      data-testid="nearby-heading"
    >
      {{ NAMES.smart }}: the best routes found near the instant answer's
    </h4>
    <slot :level="level" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { EFFORT_NOTES } from '@/search/effort';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useStrongerStore, type StrongerLevel } from '@/stores/stronger';

const props = defineProps<{
  /** 'fastest': Light, Fast, Exact, Very high (the Smart search's effort). 'date': Light and Around. */
  goal: 'fastest' | 'date';
  /** A search in this box is running: the level can't change. */
  running?: boolean;
  /** By a date: what each search level would cost on this computer (DeadlinePanel.vue). */
  estimates?: Partial<Record<StrongerLevel, string>>;
}>();

const store = useChainSearchStore();
const stronger = useStrongerStore();

const LIGHT = {
  id: 'light' as StrongerLevel,
  label: 'Light',
  time: 'Seconds to a few minutes.',
  words: 'After Check exactly, prices your own earlier routes for this goal on this save, and by a date tries a TE lower when the top route misses it. No search.',
};
/** The same bar on both screens; what each search level does differs (By a date: box sizes). */
const levels = computed(() => [
  LIGHT,
  {
    id: 'quick' as StrongerLevel,
    label: 'Fast',
    time: props.goal === 'fastest' ? EFFORT_NOTES.quick.typicalTime : 'Under half an hour on a typical 8-core computer.',
    words:
      props.goal === 'fastest'
        ? "Light, plus Nearby routes from the instant answer's route: moves each stop a few TE either way until nothing gets faster, and gives every other number of ascensions in your limits one quick try."
        : "Light, plus Nearby routes: every route near the instant answer's route for each number of ascensions, each early stop up to 3 TE either side (fewer on long routes), the last stop found to the exact TE.",
  },
  {
    id: 'normal' as StrongerLevel,
    label: 'Exact',
    time: props.goal === 'fastest' ? EFFORT_NOTES.normal.typicalTime : 'Up to about 2 hours on a typical 8-core computer.',
    words:
      props.goal === 'fastest'
        ? 'Fast, plus moving neighbouring stops together, then one ascension more or fewer.'
        : 'The same, with one more TE either side of each early stop.',
  },
  {
    id: 'thorough' as StrongerLevel,
    label: 'Very high',
    time: props.goal === 'fastest' ? EFFORT_NOTES.thorough.typicalTime : 'Up to about 8 hours on a typical 8-core computer.',
    words:
      props.goal === 'fastest'
        ? 'Exact, plus moving groups of three stops together.'
        : 'The same, with two more TE either side of each early stop.',
  },
]);
const level = computed<StrongerLevel>(() => stronger.level);
const current = computed(() => levels.value.find(l => l.id === level.value) ?? LIGHT);

function pick(id: StrongerLevel): void {
  stronger.level = id;
  if (id === 'quick' || id === 'normal' || id === 'thorough') store.effort = id;
}
</script>
