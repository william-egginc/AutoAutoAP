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
    <table class="w-full text-small sm:text-small">
      <thead>
        <tr class="text-[10px] font-black uppercase tracking-widest text-slate-500 text-left">
          <th class="py-1.5 pr-1 w-5"></th>
          <th class="py-1.5 pr-2">What</th>
          <th class="py-1.5 pr-2 hidden sm:table-cell">When</th>
          <th class="py-1.5 pr-2 hidden sm:table-cell">How far</th>
          <th class="py-1.5 hidden sm:table-cell"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="e in events"
          :key="`${e.kind}-${e.at}`"
          class="border-t border-slate-100 align-top"
          :class="e.past ? 'text-slate-400' : e.notDone ? 'bg-amber-50 text-amber-900' : e.next ? 'bg-indigo-50' : 'text-slate-800'"
          :data-testid="e.past ? 'now-event-past' : e.notDone ? 'now-event-notdone' : e.next ? 'now-event-next' : 'now-event'"
        >
          <td class="py-2 pr-1" aria-hidden="true">{{ e.kind === 'shift' ? '⇄' : e.kind === 'prestige' ? '↑' : '⚑' }}</td>
          <td class="py-2 pr-2">
            <span v-if="e.kind === 'prestige'" class="text-slate-500" data-testid="now-event-asc">A{{ e.asc }} ends ·{{ ' ' }}</span
            ><span :class="e.next ? 'font-bold' : ''">{{ title(e) }}</span>
            <!-- Every ascension's prestige is listed (26 Oct 2026); one that waits says why and when it happens. -->
            <p v-if="e.kind === 'prestige' && e.wait && e.prestigeAt && !e.past" class="text-small text-amber-800" data-testid="now-event-wait">
              {{ e.wait === 'days' ? 'Waits past your no-prestige days' : 'Waits for your hours' }}: prestige
              {{ whenAt(e.prestigeAt) }}
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
      </tbody>
    </table>
    <div v-if="upcoming.length > 1" class="mt-2">
      <CalendarButton :events="upcoming.map(calOf)" :label="`Add all ${upcoming.length} upcoming to calendar`" primary />
    </div>
    <p v-if="rounded" class="mt-1.5 text-body text-slate-500" data-testid="now-events-rounded">
      <!-- Plain words, no link (ux review 26 Oct, row 15; 25 Oct 2026: the card's Run Fast went, Try next has the runs). -->
      From the instant answer, rounded to the hour. For exact times on your account, use a run from Try next below.
    </p>
    <p v-else-if="upcoming.length" class="mt-1.5 text-body text-slate-500">
      Calendar events carry a 10-minute alert and say "from your save of {{ saveWhen }}". Built on {{ device }};
      nothing is sent. If the plan changes, add them again after a new run.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CalendarButton from './CalendarButton.vue';
import { dateAt } from '@/lib/eventWhen';
import { eventTitle, howFar, notDoneTitle, whenWords } from '@/lib/nowWords';
import { planCalEvent } from '@/lib/calendarEvents';
import { virtueEggName } from '@/lib/virtueEggs';
import type { PlanEvent } from '@/lib/nowPlan';
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
}>();
const when = (e: PlanEvent) => whenWords(e, props.goal, props.now, props.zone, !!props.rounded);
const far = (e: PlanEvent) => howFar(e, props.now, props.zone, !!props.rounded, props.goal);
/** When a waiting prestige happens, in the row's own words (rounded like the row). */
const whenAt = (at: number) => whenWords({ at, kind: 'prestige' }, props.goal, props.now, props.zone, !!props.rounded);

const device = thisDevice();
const title = (e: PlanEvent) =>
  e.notDone ? notDoneTitle(e, props.goal, props.now, props.zone, props.goalName) : eventTitle(e, props.goal, props.goalName);
const addable = (e: PlanEvent) => !props.rounded && !e.past && !e.notDone && e.kind !== 'goal';
const upcoming = computed(() => props.events.filter(addable));
function calOf(e: PlanEvent) {
  return planCalEvent(e, {
    eggName: virtueEggName,
    saveWhen: props.saveWhen,
    calculatedWhen: props.calculatedWhen,
    following: props.following,
  });
}
</script>
