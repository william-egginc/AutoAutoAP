<!--
  "When each step happens" (Jordan, 24 Oct 2026), folded under the instant answer's green box: per ascension, when the
  prestige happens and when its stop is reached, with "waits past your no-prestige days" or "waits for your hours" on
  a prestige that waited (lib/instantSteps.ts). Times are the instant answer's own, to the hour; the egg shifts are not
  in them (Simulate this plan lists each one). Closed by default: native <details>, no state to keep.
-->
<template>
  <details v-if="lines.length" class="text-body text-slate-700" data-testid="instant-steps">
    <summary
      class="cursor-pointer inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-emerald-800 underline decoration-dotted underline-offset-2 marker:text-emerald-600"
    >
      When each step happens
    </summary>
    <ol class="mt-1 space-y-1 list-none pl-0" data-testid="instant-steps-list">
      <li v-for="l in lines" :key="l.asc" class="break-words" data-testid="instant-step">
        <span class="font-bold text-slate-800">A{{ l.asc }}</span>
        <template v-if="l.now">{{ ' ' }}· now, in the ascension you are in</template>
        <template v-else>
          {{ ' ' }}· prestige <span class="whitespace-nowrap font-bold">{{ show(l.prestigeAt) }}</span>
          <template v-if="l.wait === 'days'">
            {{ ' ' }}<span class="text-amber-800 font-bold" data-testid="step-waits-days">waits past your no-prestige days</span>
            (ready {{ show(l.readyAt!) }})
          </template>
          <template v-else-if="l.wait === 'hours'">
            {{ ' ' }}<span class="text-amber-800 font-bold" data-testid="step-waits-hours">waits for your hours</span>
            (ready {{ show(l.readyAt!) }})
          </template>
        </template>
        {{ ' ' }}→ <span class="font-bold">{{ l.stopTE }} TE</span> reached
        <span class="whitespace-nowrap">{{ show(l.reachedAt) }}</span>
      </li>
    </ol>
    <p class="mt-1 text-small text-slate-500" data-testid="instant-steps-note">
      Times as the instant answer works them out, to the hour. Each egg shift is in Simulate this plan.
    </p>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { showDateTime } from '@/lib/displayTime';
import { instantSteps, type StepLeg } from '@/lib/instantSteps';
import type { Availability } from '@/search/availabilitySchedule';
import type { TimeOffWindow } from '@/search/types';

const props = defineProps<{
  legs: readonly StepLeg[] | null | undefined;
  zone: string;
  /** The hours the answer was held to (null: any time). */
  hours?: Availability | null;
  noPrestige?: readonly TimeOffWindow[] | null;
}>();

const lines = computed(() => instantSteps(props.legs, props.hours ?? null, props.noPrestige ?? null));
const show = (t: number) => showDateTime(t, props.zone);
</script>
