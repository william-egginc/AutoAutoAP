<!--
  One plain amber line when a plan's shifts would leave under a quarter of the soul eggs (lib/soulEggs.ts; the math
  review's second check, 24 Oct 2026, finding 15). Nothing to press and nothing disabled: it only says so.

  The plan's shifts: `shifts`, or counted from simulated `legs` (search/preferFewer.ts `shiftCount`: null when a leg
  didn't keep its shifts, a table estimate, and then nothing shows). The save's shifts since its last Path reset:
  `done` (My runs passes its save's), or with `planner` the Auto Planner's loaded save (none loaded: "in this plan
  alone").
-->
<template>
  <p v-if="line" class="text-[11px] text-amber-800 leading-relaxed" data-testid="soul-egg-warning">{{ line }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { soulEggWarning } from '@/lib/soulEggs';
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

const line = computed(() => {
  const planShifts = props.shifts ?? (props.legs ? shiftCount(props.legs, props.ascensions) : null);
  if (planShifts == null) return '';
  if (props.planner) {
    const save = useInitialStateStore();
    return soulEggWarning({
      planShifts,
      done: save.hasData ? useVirtueStore().initialShiftCount : null,
      soulEggs: save.hasData ? save.soulEggs : null,
    });
  }
  return soulEggWarning({ planShifts, done: props.done, soulEggs: props.soulEggs });
});
</script>
