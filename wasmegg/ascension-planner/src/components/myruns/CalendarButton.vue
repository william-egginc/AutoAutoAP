<!--
  "+ Add to calendar" for one event or several (My runs' Right now card; lib/calendarEvents.ts): opens two
  choices, a downloaded .ics (Apple Calendar, Outlook; Google Calendar imports it too) with a 10-minute alert, and
  for a single event Google Calendar's own "new event" page filled in. Built on this device; nothing is sent.
-->
<template>
  <details class="relative inline-block" data-testid="calendar-button" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary
      class="list-none cursor-pointer inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-0.5 text-small font-bold"
      :class="primary ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700' : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'"
    >
      ＋ {{ label }}
    </summary>
    <div
      v-if="open"
      class="absolute z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg space-y-1 text-body"
      :class="alignRight ? 'right-0' : 'left-0'"
    >
      <button
        type="button"
        class="block w-full text-left rounded-md px-2 py-1 font-bold text-slate-700 hover:bg-slate-50"
        data-testid="calendar-ics"
        @click="download"
      >
        Download .ics (Apple, Outlook)
      </button>
      <a
        v-if="events.length === 1"
        :href="google"
        target="_blank"
        rel="noopener noreferrer"
        class="block rounded-md px-2 py-1 font-bold text-slate-700 hover:bg-slate-50"
        data-testid="calendar-google"
        >Add to Google Calendar</a
      >
      <p v-else class="px-2 text-small text-slate-500">Google Calendar: import the .ics (Settings › Import).</p>
      <p class="px-2 text-small text-slate-400">10-minute alert. Made on {{ device }}; nothing is sent.</p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { downloadIcs, googleCalendarUrl, type CalEvent } from '@/lib/calendarEvents';
import { thisDevice } from '@/search/device';

const props = defineProps<{ events: CalEvent[]; label: string; primary?: boolean; alignRight?: boolean }>();
const open = ref(false);
const device = thisDevice();
const google = computed(() => (props.events[0] ? googleCalendarUrl(props.events[0]) : '#'));
function download(): void {
  downloadIcs(props.events);
}
</script>
