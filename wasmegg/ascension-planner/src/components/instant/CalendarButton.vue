<!--
  "Add N shifts to calendar" (instant/calendarEvents.ts): a menu with the .ics download (every event,
  10-minute alert; Apple Calendar, Outlook, Google's import) and a Google Calendar link per event. The
  file is made in this browser; nothing is sent. Ported in small from the AutoAutoAP fork's
  components/myruns/CalendarButton.vue.
-->
<template>
  <details
    class="relative w-full sm:w-auto"
    data-testid="calendar-menu"
    :open="startOpen || undefined"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary
      class="list-none cursor-pointer w-full sm:w-auto min-h-[44px] px-4 rounded-xl border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1"
      data-testid="calendar-summary"
    >
      {{ label }} ▾
    </summary>
    <div
      v-if="open || startOpen"
      class="sm:absolute z-20 mt-1 w-full sm:w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg space-y-1 text-[11px]"
      data-testid="calendar-items"
    >
      <button
        type="button"
        class="block w-full min-h-[44px] text-left rounded-md px-2 font-bold text-slate-700 hover:bg-slate-50"
        data-testid="calendar-ics"
        @click="download"
      >
        Download .ics: {{ events.length === 1 ? 'the shift' : `all ${events.length} shifts` }} (Apple, Outlook, Google import)
      </button>
      <a
        v-for="(e, i) in events"
        :key="e.at"
        :href="googleCalendarUrl(e)"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center min-h-[44px] rounded-md px-2 font-bold text-slate-700 hover:bg-slate-50"
        :data-testid="`calendar-google-${i}`"
        >Google Calendar: {{ shortTitle(e) }} · {{ atText(e.at, timezone) }}</a
      >
      <p class="px-2 text-[10px] text-slate-400">10-minute alert in the .ics. Made on {{ device }}; nothing is sent.</p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { downloadIcs, googleCalendarUrl, type CalEvent } from '@/instant/calendarEvents';
import { atText } from '@/instant/findRun';
import { thisDevice } from '@/instant/device';

const props = defineProps<{
  events: CalEvent[];
  label: string;
  timezone: string;
  /** Opened at first (specs). */
  startOpen?: boolean;
}>();
const open = ref(false);
const device = thisDevice();
/** "Shift to Kindness" (the title without the route). */
const shortTitle = (e: CalEvent) => e.title.replace(/ \(Find a run:.*\)$/, '');
function download(): void {
  downloadIcs(props.events);
}
</script>
