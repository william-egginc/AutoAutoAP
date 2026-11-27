<!--
  THE EXACT LINE (R10 option C, 21 Nov 2026), under the instant answer's headline: the route worked out exactly in the background by
  composables/useInstantExact.ts. Waiting (a search runs), working (progress, moving dots, Stop), done (an "exact" tag, the quick
  estimate it replaced, and for By a date a plain line when the route misses the date), idle (a button: a phone, or after Stop).
  Failed shows nothing: the box keeps its quick estimate. The box itself swaps its headline for the exact finish (InstantRoute.vue).
  Words: lib/exactLineWords.ts (placeholders). Takes a plain state, so specs draw it without a worker.
-->
<template>
  <div v-if="view" class="space-y-1" data-testid="exact-line" role="status" aria-live="polite">
    <template v-if="view === 'idle'">
      <button
        type="button"
        class="inline-flex min-h-[44px] sm:min-h-0 items-center rounded-lg border border-emerald-300 bg-white px-3 py-1 text-body font-bold text-emerald-800 hover:bg-emerald-50"
        data-testid="exact-start"
        @click="emit('start')"
      >
        {{ EXACT_START }}
      </button>
    </template>
    <p v-else-if="view === 'waiting'" class="text-body text-slate-600" data-testid="exact-waiting">{{ EXACT_WAITING }}</p>
    <template v-else-if="view === 'running' && state?.status === 'running'">
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-slate-700" data-testid="exact-running">
        <span>{{ EXACT_RUNNING }}<AnimatedDots /></span>
        <span class="tabular-nums">{{ exactProgress(state.done, state.total) }}</span>
        <button
          type="button"
          class="inline-flex min-h-[44px] sm:min-h-0 items-center text-body font-bold text-indigo-700 underline hover:text-indigo-900"
          data-testid="exact-stop"
          @click="emit('stop')"
        >
          {{ EXACT_STOP }}
        </button>
      </p>
      <p v-if="long" class="text-small text-slate-600" data-testid="exact-long">{{ EXACT_LONG }}</p>
    </template>
    <template v-else-if="view === 'done' && state?.status === 'done'">
      <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-slate-700">
        <span class="px-1.5 py-0.5 rounded bg-emerald-700 text-white label" data-testid="exact-tag">{{ EXACT_TAG }}</span>
        <CardHelp>{{ EXACT_TAG_HELP }}</CardHelp>
        <span v-if="same" data-testid="exact-same">{{ EXACT_SAME }}</span>
        <span v-else data-testid="exact-was">{{ exactWas(cardTime(instantEnd, zone)) }}</span>
      </p>
      <p v-if="misses" class="text-body font-bold text-amber-800" data-testid="exact-misses">{{ exactMisses(headlineGap(Math.abs(state.spare as number))) }}</p>
      <p v-if="two" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-slate-700" data-testid="exact-faster">
        <span>{{ two === 'offered' ? EXACT_FASTER_OFFERED : goal === 'date' ? EXACT_FASTER_DATE : EXACT_FASTER }}</span>
        <button
          type="button"
          class="inline-flex min-h-[44px] sm:min-h-0 items-center text-body font-bold text-indigo-700 underline hover:text-indigo-900"
          data-testid="exact-toggle-faster"
          @click="emit('toggle-faster')"
        >
          {{ two === 'swapped' ? EXACT_SHOW_FIRST : EXACT_SHOW_FASTER }}
        </button>
      </p>
      <p class="text-small text-slate-600" data-testid="exact-steps-note">{{ EXACT_STEPS_NOTE }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AnimatedDots from './AnimatedDots.vue';
import CardHelp from './CardHelp.vue';
import { cardTime } from './instantCardTime';
import { headlineGap } from '@/lib/format';
import type { ExactState } from '@/composables/useInstantExact';
import {
  EXACT_FASTER, EXACT_FASTER_DATE, EXACT_FASTER_OFFERED, EXACT_SHOW_FASTER, EXACT_SHOW_FIRST,
  EXACT_LONG, EXACT_RUNNING, EXACT_SAME, EXACT_START, EXACT_STEPS_NOTE, EXACT_STOP, EXACT_TAG, EXACT_TAG_HELP, EXACT_WAITING,
  exactMisses, exactProgress, exactWas,
} from '@/lib/exactLineWords';

const props = defineProps<{
  state: ExactState | null;
  /** The quick estimate's finish for this route, unix seconds. */
  instantEnd: number;
  zone: string;
  goal: 'fastest' | 'date';
  /** Two routes: `swapped` (the box shows the faster one), `offered` (it does not, because Follow or Simulate was pressed first) or `undone` (the player went back to the first). */
  two?: 'swapped' | 'offered' | 'undone' | null;
  /** Specs: the clock, ms. */
  now?: number;
}>();
const emit = defineEmits<{ start: []; stop: []; 'toggle-faster': [] }>();

/** What to draw: failed and no state draw nothing. */
const view = computed(() => {
  const s = props.state?.status;
  return s === 'idle' || s === 'waiting' || s === 'running' || s === 'done' ? s : '';
});

const tick = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => (timer = setInterval(() => (tick.value = Date.now()), 5000)));
onUnmounted(() => timer && clearInterval(timer));
/** Past 20 s: it can take several minutes (one ascension measured 36 to 199 s on a synthetic save). */
const long = computed(() => props.state?.status === 'running' && (props.now ?? tick.value) - props.state.startedAt > 20_000);

const same = computed(() => props.state?.status === 'done' && Math.abs(props.state.end - props.instantEnd) < 60);
const misses = computed(() => props.goal === 'date' && props.state?.status === 'done' && props.state.spare !== null && props.state.spare < 0);
</script>
