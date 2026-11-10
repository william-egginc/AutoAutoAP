<!--
  One short amber line when a plan's shifts would leave under a quarter of the soul eggs (lib/soulEggs.ts; the math
  review's second check, 24 Oct 2026, finding 15), and the details behind a closed "?" (Jordan, 9 Nov 2026: the one long
  line nagged a tester; lib/soulEggs.ts `soulEggWarningParts`, words in lib/soulEggWords.ts). Nothing that does anything:
  it only says so. One component for its four places (the Fastest result cards, By a date's result, My runs).

  The plan's shifts: `shifts`, or counted from simulated `legs` (search/preferFewer.ts `shiftCount`: null when a leg
  didn't keep its shifts, a table estimate, and then nothing shows). The save's shifts since its last Path reset:
  `done` (My runs passes its save's), or with `planner` the Auto Planner's loaded save (none loaded: "in this plan
  alone").
-->
<template>
  <div v-if="parts" class="text-body text-amber-800" data-testid="soul-egg-warning">
    <span data-testid="soul-egg-line">{{ parts.line }}</span>{{ ' ' }}<details class="inline" data-testid="soul-egg-tip">
      <summary
        class="inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 cursor-pointer list-none [&::-webkit-details-marker]:hidden font-bold underline decoration-dotted underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        :aria-label="SOUL_EGG_TIP_LABEL"
      >?</summary>
      <span class="block mt-1 max-w-prose text-slate-700" data-testid="soul-egg-tip-text">{{ parts.fold }}</span>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { soulEggWarningParts } from '@/lib/soulEggs';
import { SOUL_EGG_TIP_LABEL } from '@/lib/soulEggWords';
import { shiftCount } from '@/search/preferFewer';
import type { LegSummary } from '@/search/types';
import { useInitialStateStore } from '@/stores/initialState';
import { useVirtueStore } from '@/stores/virtue';

const props = withDefaults(
  defineProps<{
    shifts?: number | null;
    legs?: readonly Pick<LegSummary, 'shifts'>[] | null;
    /** How many of `legs` are the plan's (the route's length). */
    ascensions?: number;
    done?: number | null;
    soulEggs?: number | null;
    /** Take `done` and the soul eggs from the Auto Planner's loaded save. */
    planner?: boolean;
  }>(),
  { shifts: null, legs: null, ascensions: 0, done: null, soulEggs: null, planner: false }
);

const parts = computed(() => {
  const planShifts = props.shifts ?? (props.legs ? shiftCount(props.legs, props.ascensions) : null);
  if (planShifts == null) return null;
  if (props.planner) {
    const save = useInitialStateStore();
    return soulEggWarningParts({
      planShifts,
      done: save.hasData ? useVirtueStore().initialShiftCount : null,
      soulEggs: save.hasData ? save.soulEggs : null,
    });
  }
  return soulEggWarningParts({ planShifts, done: props.done, soulEggs: props.soulEggs });
});
</script>
