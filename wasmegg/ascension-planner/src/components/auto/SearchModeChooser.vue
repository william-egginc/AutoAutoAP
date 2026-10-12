<!--
  Under the instant answer, on Fastest and By a date (decision A, the user, 12 Oct 2026): one control,
  "Search around this answer", that runs the search which starts from the instant answer (Fastest's
  Smart search, By a date's Simple routes) right here, and the exhaustive search below it as the other
  way. It replaces the Simple / Advanced cards ("How thorough", ModeChooser.vue) and the stronger
  check's Refine button, which was a smaller copy of the same idea.

  Fastest has three levels (Fast / Exact / Very high, the Smart search's effort, `levels`); By a date's
  search sizes itself, so it has one. The screen owns which way is shown and remembers it.
-->
<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="search-mode">
    <template v-if="modelValue === around">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-base font-black text-slate-900">{{ NAMES.smart }}</h3>
        <span
          v-if="running === around"
          class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest"
          >Running</span
        >
      </div>
      <p class="text-[12px] text-slate-600 leading-relaxed">{{ aroundBlurb }}</p>
      <!-- The level bar: the Smart search's effort, each level the one before plus more steps. -->
      <div v-if="levels" class="space-y-2">
        <div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="How hard to look">
          <button
            v-for="tier in EFFORT_ORDER"
            :key="tier"
            type="button"
            role="radio"
            :aria-checked="store.effort === tier"
            :disabled="store.isRunning"
            :data-testid="`level-${tier}`"
            class="rounded-lg px-2 py-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-60"
            :class="store.effort === tier ? 'bg-white text-emerald-700 shadow' : 'text-slate-500 hover:text-slate-800'"
            @click="store.effort = tier"
          >
            {{ EFFORT_NOTES[tier].label }}
          </button>
        </div>
        <p class="text-[11px] text-slate-600 leading-relaxed" data-testid="level-note">
          <span class="font-bold text-slate-800">{{ EFFORT_NOTES[store.effort].typicalTime }}</span>
          {{ LEVEL_WORDS[store.effort] }}
        </p>
      </div>
      <button
        type="button"
        class="text-[11px] font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
        data-testid="to-exhaustive"
        @click="emit('update:modelValue', exhaustive)"
      >
        Or: {{ EXHAUSTIVE_TITLE }} ›
      </button>
      <span v-if="running === exhaustive" class="ml-2 text-[10px] font-black uppercase tracking-widest text-indigo-700"
        >Running</span
      >
    </template>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-base font-black text-slate-900">{{ EXHAUSTIVE_TITLE }}</h3>
        <span
          v-if="running === exhaustive"
          class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest"
          >Running</span
        >
      </div>
      <p class="text-[12px] text-slate-600 leading-relaxed">{{ exhaustiveBlurb }}</p>
      <button
        type="button"
        class="text-[11px] font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
        data-testid="to-around"
        @click="emit('update:modelValue', around)"
      >
        ‹ Back to {{ NAMES.smart }}
      </button>
      <span v-if="running === around" class="ml-2 text-[10px] font-black uppercase tracking-widest text-indigo-700"
        >Running</span
      >
    </template>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
import { NAMES, EXHAUSTIVE_TITLE } from '@/lib/siteNav';
import { EFFORT_NOTES, EFFORT_ORDER } from '@/search/effort';
import { useChainSearchStore } from '@/stores/chainSearch';

defineProps<{
  modelValue: T;
  /** The screen's id for each way: Fastest 'smart' / 'full', By a date 'simple' / 'advanced'. */
  around: T;
  exhaustive: T;
  aroundBlurb: string;
  exhaustiveBlurb: string;
  /** Show the level bar (Fastest's Smart search effort). */
  levels?: boolean;
  /** The way whose search is running. */
  running?: T | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [id: T] }>();
const store = useChainSearchStore();

/** Each level in plain words (the same steps Science › How it works describes). */
const LEVEL_WORDS: Record<string, string> = {
  quick: 'Moves each stop a few TE either way until nothing gets faster, then gives every other number of ascensions in your limits one quick try.',
  normal: 'Fast, plus moving neighbouring stops together, then one ascension more or fewer.',
  thorough: 'Exact, plus moving groups of three stops together.',
};
</script>
