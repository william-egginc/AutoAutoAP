<!--
  The Right now card's events (spec myruns-now v3, section 2): What / When / How far / Calendar. Each row has the
  calendar date AND the time AND how far away it is. The next one is highlighted; one that has passed stays,
  greyed, as "passed" (a passed prestige says when the plan had you prestige: load a newer save). "+ Add" on each
  upcoming shift and prestige (not the goal); on a phone When and How far sit under the title with the button. Nothing is worked out here.
  A step whose time has passed but the save doesn't show done (lib/nowPlan.ts `notDone`) stays, in amber, as "Not done
  yet: shift to Curiosity (due 8:03 pm)", with no calendar button.
  `rounded` (the instant answer drives Right now, wireframe R1): times to the hour, "at around 3:00 pm", "in about
  28 h", and no calendar buttons at all (rounded times in a calendar would look exact).
-->
<template>
  <div data-testid="now-events">
    <table class="w-full text-small">
      <thead>
        <tr class="label text-slate-500 text-left">
          <th class="py-1.5 pr-1 w-5"></th>
          <th class="py-1.5 pr-2">What</th>
          <th class="py-1.5 pr-2 hidden sm:table-cell">When</th>
          <th class="py-1.5 pr-2 hidden sm:table-cell">How far</th>
          <th class="py-1.5 hidden sm:table-cell"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(e, i) in events" :key="`${e.kind}-${e.at}`">
        <tr
          v-if="here && hereAt === i"
          class="border-t border-slate-100 align-top bg-emerald-50 text-emerald-900"
          data-testid="now-event-here"
        >
          <td class="py-2 pr-1" aria-hidden="true">●</td>
          <td class="py-2 pr-2 font-bold">
            {{ hereText }}
            <p class="sm:hidden text-small font-normal">Now</p>
          </td>
          <td class="py-2 pr-2 whitespace-nowrap hidden sm:table-cell">Now</td>
          <td class="py-2 pr-2 hidden sm:table-cell"></td>
          <td class="py-2 hidden sm:table-cell"></td>
        </tr>
        <tr
          class="border-t border-slate-100 align-top"
          :class="e.past ? 'text-slate-400' : e.notDone ? 'bg-amber-50 text-amber-900' : e.next ? 'bg-indigo-50' : 'text-slate-800'"
          :data-testid="e.past ? 'now-event-past' : e.notDone ? 'now-event-notdone' : e.next ? 'now-event-next' : 'now-event'"
        >
          <td class="py-2 pr-1" aria-hidden="true">{{ e.kind === 'shift' ? '⇄' : e.kind === 'prestige' ? '↑' : '⚑' }}</td>
          <td class="py-2 pr-2">
            <span v-if="e.kind === 'prestige' && !e.timeOff" class="text-slate-500" data-testid="now-event-asc">A{{ e.asc }} ends ·{{ ' ' }}</span
            ><span :class="e.next ? 'font-bold' : ''">{{ title(e) }}</span>
            <!-- Every ascension's prestige is listed (26 Oct 2026). One that waits: When and How far are the time it
                 happens; the note gives the time its stop is reached and why it waits (spec-uxpass item 10, 8 Nov
                 2026: the reached time in When read as the prestige time). DRAFT words. -->
            <p v-if="heldAt(e) != null" class="text-small text-amber-800" data-testid="now-event-wait">
              Reached {{ whenAt(e, e.at) }}, {{ e.wait === 'days' ? 'waits past your no-prestige days' : 'waits for your hours' }}
            </p>
            <!-- What the instant estimate doesn't price (lib/instantSteps.ts): said in amber, Fast prices it. -->
            <p v-if="e.kind === 'prestige' && !e.past && e.cutByTimeOff" class="text-small text-amber-800" data-testid="now-event-cut">
              Runs into your time off {{ timeOffDays(e.cutByTimeOff, zone) }}: the ascension ends when it starts (going to
              your home farm is a prestige). Fast prices it.
            </p>
            <p v-else-if="e.kind === 'prestige' && !e.past && e.prestigeInTimeOff" class="text-small text-amber-800" data-testid="now-event-in-timeoff">
              Falls in your time off {{ timeOffDays(e.prestigeInTimeOff, zone) }}: Fast prices it.
            </p>
            <p v-if="e.kind === 'prestige' && !e.past && e.onNoPrestigeDay" class="text-small text-amber-800" data-testid="now-event-no-prestige-day">
              Falls on a no-prestige day: it waits past your no-prestige days. Fast prices it.
            </p>
            <p v-if="e.past && e.kind === 'prestige'" class="text-small text-amber-800">
              The plan had you prestige {{ dateAt(e.at, now, zone, true) }}: load a newer save.
            </p>
            <p class="sm:hidden text-small">
              {{ when(e) }}{{ ' · ' }}<b>{{ far(e) }}</b>
            </p>
            <div v-if="addable(e)" class="mt-1 sm:hidden">
              <CalendarButton :events="[calOf(e)]" label="Add" />
            </div>
          </td>
          <td class="py-2 pr-2 whitespace-nowrap hidden sm:table-cell">{{ when(e) }}</td>
          <td class="py-2 pr-2 font-bold hidden sm:table-cell">{{ far(e) }}</td>
          <td class="py-2 hidden sm:table-cell text-right">
            <CalendarButton v-if="addable(e)" :events="[calOf(e)]" label="Add" align-right />
          </td>
        </tr>
        </template>
        <tr
          v-if="here && hereAt === events.length"
          class="border-t border-slate-100 align-top bg-emerald-50 text-emerald-900"
          data-testid="now-event-here"
        >
          <td class="py-2 pr-1" aria-hidden="true">●</td>
          <td class="py-2 pr-2 font-bold">
            {{ hereText }}
            <p class="sm:hidden text-small font-normal">Now</p>
          </td>
          <td class="py-2 pr-2 whitespace-nowrap hidden sm:table-cell">Now</td>
          <td class="py-2 pr-2 hidden sm:table-cell"></td>
          <td class="py-2 hidden sm:table-cell"></td>
        </tr>
      </tbody>
    </table>
    <div v-if="upcoming.length > 1" class="mt-2">
      <CalendarButton :events="upcoming.map(calOf)" :label="`Add all ${upcoming.length} upcoming to calendar`" primary />
    </div>
    <!-- Rounded (the instant answer's): no footer; the card's tag line says it once (spec-uxpass item 1, 8 Nov 2026). -->
    <!-- One clause, the rest behind a "?" (UX fluff review 2, 5 Nov 2026, item R15). DRAFT (Words). -->
    <p v-if="!rounded && upcoming.length" class="mt-1.5 flex items-center gap-1.5 text-body text-slate-500 max-w-prose">
      If the plan changes, add them again.
      <HelpTip>
        Calendar events carry a 10-minute alert and say "from your save of {{ saveWhen }}". Built on {{ device }};
        nothing is sent. Add them again after a new run.
      </HelpTip>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CalendarButton from './CalendarButton.vue';
import HelpTip from '@/components/auto/HelpTip.vue';
import { dateAt } from '@/lib/eventWhen';
import { eventTitle, howFar, notDoneTitle, whenWords } from '@/lib/nowWords';
import { planCalEvent } from '@/lib/calendarEvents';
import { virtueEggName } from '@/lib/virtueEggs';
import type { PlanEvent } from '@/lib/nowPlan';
import { timeOffDays } from '@/lib/instantSteps';
import { thisDevice } from '@/search/device';

const props = defineProps<{
  events: PlanEvent[];
  goal: 'fastest' | 'date';
  goalName: string;
  now: number;
  zone: string;
  /** "Oct 15 at 2:36 pm": the save the plan was made from. */
  saveWhen: string;
  calculatedWhen: string;
  /** "Following 197 → 222 → … (Egg Day 2027)": each calendar event says it. */
  following?: string;
  /** The instant answer's times (estimates): rounded to the hour, no calendar buttons. */
  rounded?: boolean;
  /** "You are here" (Jordan, 1 Nov 2026): the egg the loaded save is on, its TE so far and its time (said as the
   *  row's text), shown between the last passed row and the next one. Absent: no row. */
  here?: { egg: string | null; te: number; saveWhen: string } | null;
}>();
/** Where the row goes: before the first row that hasn't passed (the same clock-and-save rule `past` uses). */
const hereAt = computed(() => {
  const i = props.events.findIndex(e => !e.past);
  return i < 0 ? props.events.length : i;
});
const hereText = computed(() =>
  props.here
    ? `You are here · ${virtueEggName(props.here.egg)} · ${Math.floor(props.here.te)} TE · from your save of ${props.here.saveWhen}`
    : ''
);
/** Rounded to the hour: the instant answer's times, never the ascension you are in simulated on the save (`exact`). */
const roundedFor = (e: PlanEvent) => !!props.rounded && !e.exact;
/** A prestige that waits (for the hours or past the no-prestige days, lib/instantSteps.ts `markPrestigeWaits`): when it
 *  happens, `prestigeAt`, already worked out; null for every other row. */
const heldAt = (e: PlanEvent): number | null => (e.kind === 'prestige' && e.wait && e.prestigeAt && !e.past ? e.prestigeAt : null);
/** The row as it happens: a waiting prestige at its held time (When, How far, the calendar). */
const shown = (e: PlanEvent): PlanEvent => {
  const h = heldAt(e);
  return h == null ? e : { ...e, at: h };
};
const when = (e: PlanEvent) => whenWords(shown(e), props.goal, props.now, props.zone, roundedFor(e));
const far = (e: PlanEvent) => howFar(shown(e), props.now, props.zone, roundedFor(e), props.goal);
/** When a waiting prestige happens, in the row's own words (rounded like the row). */
const whenAt = (e: PlanEvent, at: number) => whenWords({ at, kind: 'prestige' }, props.goal, props.now, props.zone, roundedFor(e));

const device = thisDevice();
const title = (e: PlanEvent) =>
  e.notDone ? notDoneTitle(e, props.goal, props.now, props.zone, props.goalName) : eventTitle(e, props.goal, props.goalName);
const addable = (e: PlanEvent) => !props.rounded && !e.past && !e.notDone && e.kind !== 'goal';
const upcoming = computed(() => props.events.filter(addable));
function calOf(e: PlanEvent) {
  return planCalEvent(shown(e), {
    eggName: virtueEggName,
    saveWhen: props.saveWhen,
    calculatedWhen: props.calculatedWhen,
    following: props.following,
  });
}
</script>
