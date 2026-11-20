<!--
  A NOD TO THE CLOUD CALENDAR (Jordan, 15 Nov 2026), under "Add all N upcoming to calendar" on My Runs' plan table. That button makes one-off
  events that go stale; the subscription feed (Setup › Sharing, composables/useCalendarFeed.ts) updates itself. Not set up: a line suggesting it.
  Set up: "Update cloud calendar", which sends the current plan now, in addition to the automatic pushes. It writes nothing when the calendar
  already has this plan and can be pressed once every 15 s (the account's sync budget is 60 writes an hour); a failure is the card's own upload
  line. Nothing at all while the calendar flag is off or there is no online target (feed.available). DRAFT words (lib/calendarFeedWords.ts).
-->
<template>
  <div v-if="feed.available.value" class="mt-1.5 space-y-1" data-testid="cal-nod">
    <template v-if="feed.enabled.value && feed.linked.value">
      <button
        type="button"
        class="inline-flex min-h-[44px] items-center rounded-lg border border-indigo-300 bg-white px-4 text-body font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
        :disabled="feed.pushCoolingDown.value"
        data-testid="cal-nod-update"
        @click="void feed.pushNow()"
      >
        {{ CAL_NOD_UPDATE }}
      </button>
      <p class="text-small text-slate-600 max-w-prose" data-testid="cal-nod-hint">{{ CAL_NOD_HINT }}</p>
      <p v-if="feed.pushed.value && !feed.error.value" class="text-body text-emerald-800 max-w-prose" role="status" data-testid="cal-nod-result">
        {{ feed.pushed.value === 'sent' ? CAL_NOD_SENT : CAL_NOD_SAME }}
      </p>
      <p v-if="feed.error.value === 'upload'" class="text-body text-rose-700 max-w-prose" role="alert" data-testid="cal-nod-error">{{ CAL_ERRORS.upload }}</p>
    </template>
    <p v-else class="text-body text-slate-600 max-w-prose" data-testid="cal-nod-suggest">{{ CAL_NOD_SUGGEST }}</p>
  </div>
</template>

<script setup lang="ts">
import { useCalendarFeed, type CalendarFeed } from '@/composables/useCalendarFeed';
import { CAL_ERRORS, CAL_NOD_HINT, CAL_NOD_SAME, CAL_NOD_SENT, CAL_NOD_SUGGEST, CAL_NOD_UPDATE } from '@/lib/calendarFeedWords';

const props = defineProps<{ /** Specs: a feed made with a fake collector. */ feed?: CalendarFeed }>();
const feed = props.feed ?? useCalendarFeed();
</script>
