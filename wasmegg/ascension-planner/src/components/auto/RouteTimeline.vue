<!--
  When each stop of a route is reached, and inside each ascension every stretch on an egg in order
  (search/routeTimeline.ts shiftSteps): "A2 → 230 TE · reached Nov 5 at 4:00 pm", each line a native
  <details> (the sub-arrow) listing "C1 · Curiosity · Oct 29 at 7:00 pm · 29 min · 28 TE", then one
  small line with each egg's first and last shift. Native details: no state to keep, and keyboards and phones open it as they open anything.

  Shown under a row's arrow (ResultTable's expand slot and the tables that keep their own rows): By a
  date, the instant answer's counts after Check exactly, Fastest's leg table and Your latest run.
  Nothing is worked out here: a route priced without its legs says so rather than guessing.
-->
<template>
  <div class="space-y-1 text-body whitespace-normal text-left" data-testid="route-timeline">
    <p v-if="!lines.length" class="text-slate-500" data-testid="route-timeline-none">
      {{ noLegsText || "When each stop happens wasn't kept for this route." }}
    </p>
    <template v-for="l in lines" :key="l.asc">
      <details
        v-if="l.eggs.length"
        :open="open || undefined"
        class="rounded-md border border-slate-200 bg-white/80 px-2 py-1"
        data-testid="route-timeline-line"
      >
        <summary class="cursor-pointer text-slate-700 marker:text-slate-400">
          <span class="font-black">A{{ l.asc }}</span> &rarr; <span class="font-bold">{{ l.stopTE }} TE</span>
          <template v-if="l.reachedAt">
            · reached <span class="whitespace-nowrap">{{ when(l.reachedAt) }}</span></template
          >
        </summary>
        <!-- Every stretch in order, so the build-up shows: "C1 · Curiosity · Oct 29 at 7:00 pm · 29 min · 28 TE". -->
        <ol class="mt-1 mb-0.5 ml-3 space-y-0.5 text-slate-600">
          <li v-for="(s, k) in l.steps" :key="k" class="break-words" data-testid="route-timeline-step">
            <template v-if="s.label"
              ><span class="font-black text-slate-700">{{ s.label }}</span> ·
            </template>
            <span class="font-bold text-slate-700">{{ eggName(s.egg) }}</span> ·
            <span class="whitespace-nowrap">{{ when(s.start) }}</span> ·
            <span class="whitespace-nowrap">{{ stepLength(s.seconds) }}</span>
            <template v-if="s.te !== null">
              · <span class="whitespace-nowrap">{{ s.te }} TE</span></template
            >
            <span v-if="s.noLaying" class="text-slate-400"> (no laying: artifact swap / build step)</span>
          </li>
        </ol>
        <!-- Each egg's first and last shift, one small line under the list. -->
        <p class="mt-0.5 ml-3 text-small text-slate-400" data-testid="route-timeline-egg-summary">
          Each egg, first to last:
          <template v-for="(e, k) in l.eggs" :key="e.egg"
            >{{ k ? ' · ' : '' }}{{ eggName(e.egg) }} {{ when(e.firstAt) }} to {{ when(e.lastAt)
            }}{{ e.te !== null ? ` (${e.te} TE)` : '' }}</template
          >
        </p>
      </details>
      <!-- No eggs kept (a leg read back from a saved run): the stop and when, without an arrow. -->
      <p v-else class="px-2 py-1 pl-5 text-slate-700" data-testid="route-timeline-line">
        <span class="font-black">A{{ l.asc }}</span> &rarr; <span class="font-bold">{{ l.stopTE }} TE</span>
        <template v-if="l.reachedAt">
          · reached <span class="whitespace-nowrap">{{ when(l.reachedAt) }}</span></template
        >
      </p>
    </template>
    <p v-if="lines.some(l => !l.eggs.length)" class="text-small text-slate-400" data-testid="route-timeline-no-eggs">
      Each egg's times weren't kept for
      {{ lines.every(l => !l.eggs.length) ? 'this route' : 'the ascensions without an arrow' }} (read back from a saved
      run, or priced before they were kept).
    </p>
    <p v-if="lines.length && missingTE" class="text-small text-slate-400" data-testid="route-timeline-no-te">
      This route was priced before the planner kept each egg's TE at its shifts, so it shows when you lay each egg, not
      the TE it reaches.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { showWhen, spansYears } from '@/lib/displayTime';
import { routeTimeline, stepLength, timelineMoments } from '@/search/routeTimeline';
import type { LegSummary } from '@/search/types';
import { VIRTUE_EGG_NAMES } from '@/types';

const props = defineProps<{
  chain: number[];
  /** The route's simulated legs; null or empty when they weren't kept. */
  legs: LegSummary[] | null | undefined;
  /** The planner's time zone, for every moment shown. */
  zone: string;
  /** Only this ascension (0-based), e.g. under one row of a leg table. */
  only?: number;
  /** Every line opened (one ascension shown on its own). */
  open?: boolean;
  /** What to say when there are no legs, instead of the default line. */
  noLegsText?: string;
}>();

const all = computed(() => routeTimeline(props.chain, props.legs));
const lines = computed(() =>
  props.only === undefined ? all.value : all.value.filter(l => l.asc === (props.only ?? 0) + 1)
);
/** Eggs with times but no TE: legs simulated before shifts kept their TE. */
const missingTE = computed(() => lines.value.some(l => l.eggs.some(e => e.te === null)));

/** The route runs into another calendar year: every date shows its year, not only next year's (one
 *  decision for the whole route, also when only one ascension is shown). */
const withYear = computed(() => spansYears(timelineMoments(all.value), props.zone));
function when(t: number | null): string {
  return showWhen(t, props.zone, undefined, undefined, withYear.value) || '—';
}
function eggName(egg: string): string {
  return (VIRTUE_EGG_NAMES as Record<string, string>)[egg] ?? egg.charAt(0).toUpperCase() + egg.slice(1);
}
</script>
