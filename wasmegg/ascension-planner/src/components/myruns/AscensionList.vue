<!--
  Right now's Full timeline for a plan with no exact legs (26 Oct 2026, Jordan: it said "the instant answer keeps when
  each ascension ends, not each shift"). Every ascension A1..An, as the instant answer's "When each step happens" has
  it (lib/instantSteps.ts): when its prestige happens (marked when it waits for the hours or past a no-prestige day)
  and when its stop is reached; under each, its build-up in one line (lib/buildUpLine.ts: the opening's shifts are not in
  the table) and its shifts. The table's shifts come from its replay (search/legShifts.ts),
  each after the build-up, to the hour; the current ascension's, once simulated on the live save, are exact. Nothing
  is worked out here.
-->
<template>
  <div class="text-[12px] text-slate-700" data-testid="now-ascensions">
    <ol class="space-y-1.5 list-none pl-0">
      <li v-for="l in lines" :key="l.asc" class="break-words" data-testid="now-ascension" :data-asc="l.asc">
        <span class="font-black text-slate-800">A{{ l.asc }}</span>
        <template v-if="l.now">{{ ' ' }}· now, in the ascension you are in</template>
        <template v-else>
          <template v-if="l.prestigeInTimeOff"
            >{{ ' ' }}· prestige <span class="text-amber-800 font-bold" data-testid="ascension-prestige-timeoff"
              >falls in your time off {{ timeOffDays(l.prestigeInTimeOff, zone) }}: Fast prices it</span
            ></template
          >
          <template v-else>{{ ' ' }}· prestige <span class="whitespace-nowrap font-bold">{{ about(l.prestigeAt) }}</span></template>
          <template v-if="l.onNoPrestigeDay"
            >{{ ' ' }}<span class="text-amber-800 font-bold" data-testid="ascension-no-prestige-day"
              >on a no-prestige day: it waits past your no-prestige days (Fast prices it)</span
            ></template
          >
          <template v-if="l.wait === 'days'">
            {{ ' ' }}<span class="text-amber-800 font-bold" data-testid="ascension-waits-days">waits past your no-prestige days</span>
            (ready {{ about(l.readyAt!) }})
          </template>
          <template v-else-if="l.wait === 'hours'">
            {{ ' ' }}<span class="text-amber-800 font-bold" data-testid="ascension-waits-hours">waits for your hours</span>
            (ready {{ about(l.readyAt!) }})
          </template>
        </template>
        {{ ' ' }}→ <span class="font-bold">{{ l.stopTE }} TE</span> reached
        <span class="whitespace-nowrap">{{ l.simulated ? exact(l.reachedAt) : about(l.reachedAt) }}</span>
        <p v-if="l.cutByTimeOff" class="mt-0.5 ml-4 text-[11px] text-amber-800 break-words" data-testid="now-ascension-cut">
          Runs into your time off {{ timeOffDays(l.cutByTimeOff, zone) }}: it ends when the time off starts (going to your
          home farm is a prestige) and is built again after it. The instant answer doesn't price time off: Fast prices it.
        </p>
        <p v-if="l.timeOff" class="mt-0.5 ml-4 text-[11px] text-amber-800 break-words" data-testid="now-ascension-timeoff">
          Your time off starts {{ exact(l.timeOff.from) }}: this ascension ends there at {{ l.timeOff.te }} TE (going
          to your home farm is a prestige), and is built again from {{ exact(l.timeOff.to) }}.
        </p>
        <p v-if="l.buildUp" class="mt-0.5 ml-4 text-[11px] text-slate-600 break-words" data-testid="now-ascension-buildup">{{ l.buildUp }}</p>
        <ul v-if="l.shifts.length" class="mt-0.5 ml-4 list-none pl-0 text-[11px] text-slate-600" data-testid="now-ascension-shifts">
          <li v-for="(s, k) in l.shifts" :key="k" data-testid="now-ascension-shift">
            Shift to {{ virtueEggName(s.egg) }} · <span class="whitespace-nowrap">{{ l.simulated ? exact(s.at) : about(s.at) }}</span>
          </li>
          <li class="text-slate-500" data-testid="now-ascension-shifts-source">
            {{ l.simulated ? 'worked out on your save, to the minute' : 'from the instant answer, to the hour' }}
          </li>
        </ul>
        <p v-else class="ml-4 text-[11px] text-slate-500" data-testid="now-ascension-no-shifts">{{ noShifts(l) }}</p>
      </li>
    </ol>
    <p class="mt-1.5 text-[11px] text-slate-500 leading-relaxed" data-testid="now-ascensions-note">
      Times from the instant answer are to the hour. Its shifts start at each ascension's swap to Humility (H1): the
      first hours' shifts of a fresh ascension are not in it yet. For every shift on your account, use a run from Try
      next below.
    </p>
  </div>
</template>

<script setup lang="ts">
import { showDateTime } from '@/lib/displayTime';
import { virtueEggName } from '@/lib/virtueEggs';
import { roundToHourIn } from '@/lib/nowWords';
import { timeOffDays, type AscensionStep } from '@/lib/instantSteps';

const props = defineProps<{
  lines: AscensionStep[];
  zone: string;
  /** The current ascension's simulation is being worked out (lib/followSim.ts). */
  working?: boolean;
}>();

/** The table's times: to the hour on the player's clock. */
const about = (t: number) => `about ${showDateTime(roundToHourIn(t, props.zone), props.zone)}`;
const exact = (t: number) => showDateTime(t, props.zone);
function noShifts(l: AscensionStep): string {
  if (l.asc === 1 && props.working) return 'Working out your shifts…';
  if (l.simulated) return 'No shifts left in it: worked out on your save.';
  return l.now ? "The instant answer doesn't keep the shifts of the ascension you are in." : 'No shifts kept for it.';
}
</script>
