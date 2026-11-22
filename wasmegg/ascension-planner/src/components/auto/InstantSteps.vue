<!--
  "When each step happens" (Jordan, 24 Oct 2026), folded under the instant answer's green box: per ascension, when the
  prestige happens and when its stop is reached, with "waits past your no-prestige days" or "waits for your hours" on
  a prestige that waited (lib/instantSteps.ts). Times are the instant answer's own, to the hour; the egg shifts are not
  in them (Simulate this route lists each one). Closed by default: native <details>, no state to keep. Since 17 Nov 2026 the summary is a
  bordered link named for what is inside (lib/instantStepsWords.ts), as a tester did not find that the dates were already there.
-->
<template>
  <details v-if="lines.length" class="text-body text-slate-700" data-testid="instant-steps">
    <summary
      class="cursor-pointer inline-flex items-center min-h-[44px] sm:min-h-0 rounded-lg border border-emerald-300 bg-white px-3 font-bold text-emerald-800 underline decoration-2 underline-offset-2 hover:bg-emerald-50 list-none [&::-webkit-details-marker]:hidden"
    >
      {{ STEPS_LINK }}
    </summary>
    <ol class="mt-1 space-y-1 list-none pl-0" data-testid="instant-steps-list">
      <li v-for="l in lines" :key="l.asc" class="break-words" data-testid="instant-step">
        <span class="font-bold text-slate-800">A{{ l.asc }}</span>
        <template v-if="l.now && l.fresh">{{ ' ' }}· {{ STEP_FRESH_NOW }}</template>
        <template v-else-if="l.now">{{ ' ' }}· now, in the ascension you are in</template>
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
        <!-- R1 would come after the player's hours end (Jordan's option a, 15 Nov 2026; lib/sleepBeforeR1.ts, Words' text). -->
        <!-- The prestige-window hint (R10, 21 Nov 2026; lib/prestigeWindow.ts, off unless Setup's More options box is ticked). -->
        <p v-if="windowOf(l)" class="mt-0.5 ml-4 text-body text-slate-700 break-words max-w-prose" data-testid="step-prestige-window">
          {{ prestigeWindowLine(windowOf(l)!.deadline, zone) }}
        </p>
        <p v-if="r1Of(l)" class="mt-0.5 ml-4 text-body text-amber-800 break-words max-w-prose" data-testid="step-r1-sleep">
          {{ sleepBeforeR1Card(r1Of(l)!, show) }}
        </p>
      </li>
    </ol>
    <p class="mt-1 text-small text-slate-600" data-testid="instant-steps-note">
      {{ STEPS_NOTE }}
    </p>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cardTime } from './instantCardTime';
import { instantSteps, type StepLeg } from '@/lib/instantSteps';
import { STEPS_LINK, STEPS_NOTE } from '@/lib/instantStepsWords';
import { STEP_FRESH_NOW } from '@/lib/instantWords';
import type { Availability } from '@/search/availabilitySchedule';
import type { TimeOffWindow } from '@/search/types';
import { r1OfTableAscension } from '@/lib/sleepBeforeR1View';
import { sleepBeforeR1Card } from '@/lib/sleepBeforeR1Words';
import { prestigeWindow, usePrestigeHint } from '@/lib/prestigeWindow';
import { prestigeWindowLine } from '@/lib/prestigeWindowWords';

const props = defineProps<{
  legs: readonly StepLeg[] | null | undefined;
  zone: string;
  /** The hours the answer was held to (null: any time). */
  hours?: Availability | null;
  noPrestige?: readonly TimeOffWindow[] | null;
  /** The player's shifts wait for their hours (deferShifts): the plan already waits, so the softer "R1 waits until …" line. */
  heldShifts?: boolean;
}>();

const lines = computed(() => instantSteps(props.legs, props.hours ?? null, props.noPrestige ?? null));
/** The warning for an ascension the table starts (never the one the farm is in): R1 bounded by the opening's span. */
// A fresh first ascension is a real prestige now: its R1 is checked like the others' (17 Nov 2026).
const r1Of = (l: { now: boolean; fresh?: boolean; prestigeAt: number; fromTE: number }) =>
  l.now && !l.fresh ? null : r1OfTableAscension({ start: l.prestigeAt, fromTE: l.fromTE, hours: props.hours, held: props.heldShifts });
const hintOn = usePrestigeHint();
const windowOf = (l: { now: boolean; fresh?: boolean; fromTE: number; stopTE: number; prestigeAt: number }) =>
  hintOn.value ? prestigeWindow({ fromTE: l.fromTE, stopTE: l.stopTE, prestigeAt: l.prestigeAt, now: l.now && !l.fresh }) : null;
/** Without this year's year (./instantCardTime.ts; Jordan, 12 Nov 2026 pm). */
const show = (t: number) => cardTime(t, props.zone);
</script>
