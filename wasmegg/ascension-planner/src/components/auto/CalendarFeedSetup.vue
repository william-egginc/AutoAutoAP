<!--
  Setup › Sharing: "Put my plan in my calendar" (spec-calendar-ui, 14 Nov 2026; Jordan: option B, a private link a calendar
  subscribes to, off by default behind its OWN switch). composables/useCalendarFeed.ts is what it does, lib/calendarCloud.ts
  the calls, lib/calendarFeedWords.ts Words' text. The link is shown ONCE (in memory only, never stored here), with Copy,
  Add to Apple Calendar (webcal://) and Add to Google Calendar. Reset link asks first. Hidden without a collector or with
  Save online off (the same online target as the other synced records), and while the build flag is off (lib/calendarCloud.ts
  CALENDAR_FEED: beta's collector is the live one, which has no /cal yet). The privacy text (Words' part 1C) is not here yet.
-->
<template>
  <div v-if="feed.available.value" class="space-y-2" data-testid="calendar-feed">
    <label class="flex items-start gap-3 cursor-pointer min-h-[44px]">
      <input
        type="checkbox"
        class="mt-0.5 rounded border-slate-300 text-indigo-600"
        aria-describedby="calendar-feed-line"
        data-testid="calendar-feed-switch"
        :checked="feed.enabled.value"
        :disabled="feed.busy.value"
        @change="toggle(($event.target as HTMLInputElement).checked)"
      />
      <span class="text-body text-slate-600"><span class="font-bold text-slate-800">{{ CAL_LABEL }}</span></span>
    </label>
    <p id="calendar-feed-line" class="ml-7 text-body text-slate-600 max-w-prose" data-testid="calendar-feed-line">
      {{ feed.enabled.value ? CAL_LINE : CAL_OFF }}
    </p>

    <div v-if="feed.enabled.value" class="ml-7 space-y-2">
      <p class="text-body text-slate-600 max-w-prose" data-testid="calendar-feed-stale">{{ CAL_STALE }}</p>

      <!-- No link yet. -->
      <button
        v-if="!feed.linked.value"
        type="button"
        class="inline-flex min-h-[44px] items-center rounded-lg bg-indigo-600 px-4 text-body font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
        :disabled="feed.busy.value"
        data-testid="calendar-feed-get"
        @click="feed.getLink()"
      >
        {{ CAL_GET }}
      </button>

      <!-- The link, once. -->
      <div v-if="feed.link.value" class="space-y-2" data-testid="calendar-feed-link-box">
        <input
          type="text"
          readonly
          :value="feed.link.value"
          class="block w-full max-w-prose rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-body text-slate-800"
          aria-label="Your calendar link"
          data-testid="calendar-feed-link"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <p class="text-body text-amber-800 max-w-prose" data-testid="calendar-feed-once">{{ CAL_SHOWN_ONCE }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            data-testid="calendar-feed-copy"
            @click="feed.copy()"
          >
            {{ feed.copied.value ? CAL_COPIED : CAL_COPY }}
          </button>
          <a
            :href="webcalUrl(feed.link.value)"
            class="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            data-testid="calendar-feed-apple"
          >
            {{ CAL_APPLE }}
          </a>
          <a
            :href="googleCalendarUrl(feed.link.value)"
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            data-testid="calendar-feed-google"
          >
            {{ CAL_GOOGLE }}
          </a>
        </div>
      </div>
      <p v-else-if="feed.linked.value && feed.phase.value !== 'confirm'" class="text-body text-slate-600 max-w-prose" data-testid="calendar-feed-linked">
        {{ CAL_LINKED }}
      </p>

      <!-- Reset link: asks first. -->
      <template v-if="feed.linked.value">
        <button
          v-if="feed.phase.value !== 'confirm'"
          type="button"
          class="inline-flex min-h-[44px] items-center rounded text-left text-body font-bold text-rose-700 underline hover:text-rose-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
          :disabled="feed.busy.value"
          data-testid="calendar-feed-reset"
          @click="feed.askReset()"
        >
          {{ CAL_RESET }}
        </button>
        <div v-else class="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2" role="alertdialog" aria-labelledby="calendar-feed-reset-text" data-testid="calendar-feed-confirm">
          <p id="calendar-feed-reset-text" class="text-body text-slate-700 max-w-prose">{{ CAL_RESET_ASK }}</p>
          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              class="inline-flex min-h-[44px] items-center rounded-lg bg-rose-700 px-4 text-body font-bold text-white hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
              :disabled="feed.busy.value"
              data-testid="calendar-feed-reset-yes"
              @click="feed.confirmReset()"
            >
              {{ CAL_RESET_YES }}
            </button>
            <button
              type="button"
              class="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              data-testid="calendar-feed-reset-no"
              @click="feed.keepIt()"
            >
              {{ CAL_RESET_NO }}
            </button>
          </div>
        </div>
      </template>
      <p v-if="feed.phase.value === 'reset-done'" class="text-body text-emerald-800 max-w-prose" role="status" data-testid="calendar-feed-reset-done">{{ CAL_RESET_DONE }}</p>
      <p v-if="feed.error.value" class="text-body text-rose-700 max-w-prose" role="alert" data-testid="calendar-feed-error">{{ CAL_ERRORS[feed.error.value] }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCalendarFeed, type CalendarFeed } from '@/composables/useCalendarFeed';
import { googleCalendarUrl, webcalUrl } from '@/lib/calendarCloud';
import {
  CAL_APPLE,
  CAL_COPIED,
  CAL_COPY,
  CAL_ERRORS,
  CAL_GET,
  CAL_GOOGLE,
  CAL_LABEL,
  CAL_LINE,
  CAL_LINKED,
  CAL_OFF,
  CAL_RESET,
  CAL_RESET_ASK,
  CAL_RESET_DONE,
  CAL_RESET_NO,
  CAL_RESET_YES,
  CAL_SHOWN_ONCE,
  CAL_STALE,
} from '@/lib/calendarFeedWords';

const props = defineProps<{ /** Specs: a feed made with a fake collector. */ feed?: CalendarFeed }>();
const feed = props.feed ?? useCalendarFeed();
function toggle(on: boolean): void {
  if (on) feed.turnOn();
  else void feed.turnOff();
}
</script>
