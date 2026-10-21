<!--
  "N hours ahead / behind" on a saved plan (R6 simple, lib/planPace.ts `paceWords`, composables/usePlanPace.ts):
  one line, the pill and "as of 3:42 pm"; a tap on the pill opens its one detail line (a button with
  aria-expanded, so it works on touch; 44 px tall on a phone). Greyed when it is not the route followed for its
  goal. A state without a pill (your TE is below where the plan starts) shows its detail line on its own. Nothing
  while the plan's line is still loading.
-->
<template>
  <div
    v-if="words && (words.badge || words.detail)"
    class="w-full flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"
    :class="words.greyed ? 'opacity-60' : ''"
    data-testid="pace-badge"
    :data-tone="tone"
    :data-greyed="words.greyed ? 'true' : 'false'"
  >
    <button
      v-if="words.badge && words.detail"
      type="button"
      class="inline-flex items-center min-h-[44px] sm:min-h-0 rounded-full border px-2.5 py-0.5 font-bold text-left"
      :class="TONE[tone]"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="detailId"
      data-testid="pace-pill"
      @click="open = !open"
    >
      {{ words.badge }}
    </button>
    <span
      v-else-if="words.badge"
      class="inline-flex items-center rounded-full border px-2.5 py-0.5 font-bold"
      :class="TONE[tone]"
      data-testid="pace-pill"
      >{{ words.badge }}</span
    >
    <span v-if="words.asOf || words.greyed" class="text-slate-500" data-testid="pace-asof"
      >{{ words.asOf }}<template v-if="words.asOf && words.greyed">{{ ' · ' }}</template
      ><template v-if="words.greyed">{{ NOT_FOLLOWED_WORDS }}</template></span
    >
    <p
      v-if="words.detail && (open || !words.badge)"
      :id="detailId"
      class="w-full text-slate-600 leading-relaxed"
      data-testid="pace-detail"
    >
      {{ words.detail }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { NOT_FOLLOWED_WORDS, type PaceWords } from '@/lib/planPace';

const props = defineProps<{
  words: PaceWords | null;
  /** Open the detail line from the start (a spec, a screenshot). */
  startOpen?: boolean;
}>();

const open = ref(!!props.startOpen);
const detailId = `pace-detail-${useId()}`;
/** Greyed: the plain look, whatever the state. */
const tone = computed(() => (props.words?.greyed ? 'plain' : (props.words?.tone ?? 'plain')));
const TONE = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  bad: 'border-rose-300 bg-rose-50 text-rose-800',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  plain: 'border-slate-200 bg-slate-50 text-slate-600',
} as const;
</script>
