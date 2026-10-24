<!--
  The Right now card's events (spec myruns-now v3, section 2): What / When / How far / Calendar. Each row has the
  calendar date AND the time AND how far away it is. The next one is highlighted; one that has passed stays,
  greyed, as "passed" (a passed prestige says when the plan had you prestige: load a newer save). "+ Add" on each
  upcoming shift and prestige (not the goal); on a phone When and How far sit under the title with the button. Nothing is worked out here.
  A step whose time has passed but the save doesn't show done (lib/nowPlan.ts `notDone`) stays, in amber, as "Not done
  yet: shift to Curiosity (due 8:03 pm)", with no calendar button.
-->
<template>
  <div data-testid="now-events">
    <table class="w-full text-[12px] sm:text-[13px]">
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
            <span :class="e.next ? 'font-bold' : ''">{{ title(e) }}</span>
            <p v-if="e.past && e.kind === 'prestige'" class="text-[11px] text-amber-800">
              The plan had you prestige {{ dateAt(e.at, now, zone, true) }}: load a newer save.
            </p>
            <p class="sm:hidden text-[12px]">
              {{ dateAt(e.at, now, zone, true) }}{{ ' · ' }}<b>{{ howFar(e, now, zone) }}</b>
            </p>
            <div v-if="addable(e)" class="mt-1 sm:hidden">
              <CalendarButton :events="[calOf(e)]" label="Add" />
            </div>
          </td>
          <td class="py-2 pr-2 whitespace-nowrap hidden sm:table-cell">{{ dateAt(e.at, now, zone, true) }}</td>
          <td class="py-2 pr-2 font-bold hidden sm:table-cell">{{ howFar(e, now, zone) }}</td>
          <td class="py-2 hidden sm:table-cell text-right">
            <CalendarButton v-if="addable(e)" :events="[calOf(e)]" label="Add" align-right />
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="upcoming.length > 1" class="mt-2">
      <CalendarButton :events="upcoming.map(calOf)" :label="`Add all ${upcoming.length} upcoming to calendar`" primary />
    </div>
    <p v-if="upcoming.length" class="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
      Calendar events carry a 10-minute alert and say "from your save of {{ saveWhen }}". Built on {{ device }};
      nothing is sent. If the plan changes, add them again after a new check.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CalendarButton from './CalendarButton.vue';
import { dateAt } from '@/lib/eventWhen';
import { eventTitle, howFar, notDoneTitle } from '@/lib/nowWords';
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
}>();

const device = thisDevice();
const title = (e: PlanEvent) =>
  e.notDone ? notDoneTitle(e, props.goal, props.now, props.zone, props.goalName) : eventTitle(e, props.goal, props.goalName);
const addable = (e: PlanEvent) => !e.past && !e.notDone && e.kind !== 'goal';
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
