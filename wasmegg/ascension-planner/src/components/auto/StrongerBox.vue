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
    <!-- The level picked, in three plain lines: what it does, how long, what it can and can't find. -->
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] leading-relaxed" data-testid="level-note">
      <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">What it does</dt>
      <dd class="text-slate-800">{{ current.does }}</dd>
      <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">How long</dt>
      <dd class="text-slate-800">{{ current.time }}</dd>
      <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">What it finds</dt>
      <dd class="text-slate-800">{{ current.finds }}</dd>
    </dl>
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
    <!-- Open until closed (remembered in this browser), amber like the other promise boxes. -->
    <details
      :open="promiseOpen"
      class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
      data-testid="stronger-promise"
      @toggle="onPromiseToggle"
    >
      <summary class="cursor-pointer font-black uppercase tracking-wide text-amber-800">
        What this does and does not promise
      </summary>
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
        <li>A search you stop early keeps the best it found so far.</li>
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
import { computed, ref } from 'vue';
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

interface LevelText {
  id: StrongerLevel;
  label: string;
  does: string;
  time: string;
  finds: string;
}
/** Each level in plain words, per screen: what it does, how long, what it can and can't find. */
const levels = computed<LevelText[]>(() =>
  props.goal === 'fastest'
    ? [
        {
          id: 'light',
          label: 'Light',
          does: 'After Check exactly, prices the routes you have already found for this target (your searches here, saved runs, earlier checks, and board runs sent from this browser) on your save as it is now.',
          time: 'Seconds to a few minutes, once Check exactly has finished.',
          finds: 'One of your own routes, if it is now faster than the instant answer. It does not look for new routes.',
        },
        {
          id: 'quick',
          label: 'Fast',
          does: `Light, then ${NAMES.smart}: from the instant answer's route it moves each stop a few TE either way until nothing gets faster, then gives every other number of ascensions in your limits one quick try.`,
          time: `${EFFORT_NOTES.quick.typicalTime}`,
          finds: "A faster route close to the instant answer's. It can miss one where several stops have to move together, or one far from it.",
        },
        {
          id: 'normal',
          label: 'Exact',
          does: 'Fast, plus moving neighbouring stops together, then one ascension more or fewer.',
          time: EFFORT_NOTES.normal.typicalTime,
          finds: 'Also routes where two stops have to move together. Still a search near the instant answer, not of every route.',
        },
        {
          id: 'thorough',
          label: 'Very high',
          does: 'Exact, plus moving groups of three stops together.',
          time: EFFORT_NOTES.thorough.typicalTime,
          finds: `The strongest search near the instant answer. Still not a proven best: for that, use ${NAMES.full} below with boxes you set.`,
        },
      ]
    : [
        {
          id: 'light',
          label: 'Light',
          does: "After Check exactly, prices your own earlier routes for this date on your save, and when the instant answer's top route misses the date on your account, tries its route one TE lower (two if needed).",
          time: 'Seconds to a few minutes, once Check exactly has finished.',
          finds: 'One of your routes that does better, or a route one TE lower that really makes the date. It does not look for new routes.',
        },
        {
          id: 'quick',
          label: 'Fast',
          does: `Light, then ${NAMES.smart}: for each number of ascensions the instant answer has, every route with each early stop up to 3 TE either side of its route (fewer on long routes), each last stop found to the exact TE.`,
          time: 'Under half an hour on a typical 8-core computer; yours is below.',
          finds: "The highest TE near the instant answer's routes. It can miss a route whose early stops are further away.",
        },
        {
          id: 'normal',
          label: 'Exact',
          does: 'The same, with one more TE either side of each early stop.',
          time: 'Up to about 2 hours on a typical 8-core computer; yours is below.',
          finds: 'A wider net around the same routes.',
        },
        {
          id: 'thorough',
          label: 'Very high',
          does: 'The same, with two more TE either side of each early stop.',
          time: 'Up to about 8 hours on a typical 8-core computer; yours is below.',
          finds: `The widest net near the instant answer. Still not a proven best: for that, use ${NAMES.full} below with boxes you set.`,
        },
      ]
);
const level = computed<StrongerLevel>(() => stronger.level);
const current = computed(() => levels.value.find(l => l.id === level.value) ?? levels.value[0]);

/** "What this does and does not promise": open unless the player closed it (this browser). */
const PROMISE_KEY = 'aap-stronger-promise-closed';
function readPromiseOpen(): boolean {
  try {
    return localStorage.getItem(PROMISE_KEY) !== '1';
  } catch {
    return true;
  }
}
const promiseOpen = ref(readPromiseOpen());
function onPromiseToggle(e: Event): void {
  promiseOpen.value = (e.target as HTMLDetailsElement).open;
  try {
    localStorage.setItem(PROMISE_KEY, promiseOpen.value ? '0' : '1');
  } catch {
    /* this visit only */
  }
}

function pick(id: StrongerLevel): void {
  stronger.level = id;
  if (id === 'quick' || id === 'normal' || id === 'thorough') store.effort = id;
}
</script>
