<!--
  No instant answer for this save: no table on this site yet, a table from another simulator, or a TE
  outside the table. One plain card where the answer would be. (From the AutoAutoAP fork's
  NoInstantAnswer.vue, without its quick-estimate button: the Auto Planner tab is the way on.)
-->
<template>
  <div class="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-1.5" data-testid="instant-none">
    <p class="text-sm font-black text-slate-900" data-testid="instant-none-heading">{{ words.heading }}</p>
    <p class="text-[11px] text-slate-600 leading-relaxed">{{ words.sub }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NoAnswer } from '@/instant/instantAnswer';

const props = defineProps<{ reason: NoAnswer }>();

const words = computed(() => noAnswerWords(props.reason));
</script>

<script lang="ts">
/** The card's two lines for each reason. */
export function noAnswerWords(r: NoAnswer): { heading: string; sub: string } {
  const plan = 'The Auto Planner tab works as always.';
  switch (r.kind) {
    case 'no-table':
      return { heading: 'No instant answer yet: the table for this simulator is still being built.', sub: plan };
    case 'other-sim':
      return {
        heading: 'No instant answer yet: the table for this simulator is still being built.',
        sub: `The table on this site was ${r.why}, so its routes could differ from this planner's. ${plan}`,
      };
    case 'below':
      return { heading: `No instant answer below TE ${r.from}.`, sub: `Your save is at TE ${r.te}. ${plan}` };
    case 'above':
      return { heading: `No instant answer above TE ${r.to} yet.`, sub: `Your save is at TE ${r.te}. ${plan}` };
    case 'at-target':
      return { heading: `You are at TE ${r.te}: there is no route left to find to 490.`, sub: 'Pick a date to see how far you can get by then.' };
    case 'pick-date':
      return { heading: 'Pick a date.', sub: 'The answer shows the highest TE you can reach by 9:00 am that day.' };
    case 'date-passed':
      return { heading: 'That date has passed: pick a later one.', sub: 'The deadline is 9:00 am that day, your timezone.' };
  }
}
</script>
