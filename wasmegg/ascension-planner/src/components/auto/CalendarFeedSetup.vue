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
    <!-- Always there, filled when there is something to say (an element added already full is not announced): the link, once, and Copied (review W6). -->
    <p class="sr-only" role="status" aria-live="polite" data-testid="calendar-feed-live">{{ liveText }}</p>
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
        v-if="!feed.linked.value && savedState !== 'checking'"
        type="button"
        class="inline-flex min-h-[44px] items-center rounded-lg bg-indigo-600 px-4 text-body font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
        :disabled="feed.busy.value"
        data-testid="calendar-feed-get"
        @click="feed.getLink()"
      >
        {{ CAL_GET }}
      </button>

      <!-- The saved link is being fetched (callink): a quiet line, no Get link yet. -->
      <p v-if="savedState === 'checking'" class="text-body text-slate-600 max-w-prose" data-testid="calendar-feed-checking">{{ CAL_CHECKING }}</p>

      <!-- The link: once, when it was just made here; the saved one, read back (callink), without the once-only warning. -->
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
        <p v-if="fromSave" class="text-body text-slate-600 max-w-prose" data-testid="calendar-feed-saved">{{ CAL_SAVED }}</p>
        <p v-else class="text-body text-amber-800 max-w-prose" data-testid="calendar-feed-once">{{ CAL_SHOWN_ONCE }}</p>
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
      <!-- A saved copy this browser can't read (callink): say so, and offer a new link, asking first (it stops every link already added). -->
      <div v-else-if="savedState === 'unreadable'" class="space-y-2" data-testid="calendar-feed-unreadable">
        <p class="text-body text-slate-600 max-w-prose">{{ CAL_UNREADABLE }}</p>
        <button
          v-if="!askingReplace"
          ref="replaceBtn"
          type="button"
          class="inline-flex min-h-[44px] items-center rounded-lg bg-indigo-600 px-4 text-body font-bold text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          :disabled="feed.busy.value"
          data-testid="calendar-feed-replace"
          @click="askingReplace = true"
        >
          {{ CAL_REPLACE }}
        </button>
        <div v-else class="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2" role="alertdialog" aria-labelledby="calendar-feed-replace-text" data-testid="calendar-feed-replace-confirm">
          <p id="calendar-feed-replace-text" class="text-body text-slate-700 max-w-prose">{{ CAL_REPLACE_ASK }}</p>
          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              class="inline-flex min-h-[44px] items-center rounded-lg bg-rose-700 px-4 text-body font-bold text-white hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              :disabled="feed.busy.value"
              data-testid="calendar-feed-replace-yes"
              @click="doReplace()"
            >
              {{ CAL_REPLACE_YES }}
            </button>
            <button
              ref="replaceKeepBtn"
              type="button"
              class="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              data-testid="calendar-feed-replace-no"
              @click="askingReplace = false"
            >
              {{ CAL_RESET_NO }}
            </button>
          </div>
        </div>
      </div>
      <p v-else-if="feed.linked.value && savedState !== 'checking' && feed.phase.value !== 'confirm'" class="text-body text-slate-600 max-w-prose" data-testid="calendar-feed-linked">
        {{ CAL_LINKED }}
      </p>

      <!-- Reset link: asks first. -->
      <template v-if="feed.canReset.value || feed.phase.value === 'confirm'">
        <button
          v-if="feed.phase.value !== 'confirm'"
          ref="resetBtn"
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
              ref="keepBtn"
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
      <p v-if="feed.needsMyRuns.value && !feed.onMyRuns.value" class="text-body text-slate-600 max-w-prose" data-testid="calendar-feed-open-myruns">{{ CAL_OPEN_MYRUNS }}</p>
      <p v-if="feed.working.value" class="text-body text-slate-600 max-w-prose" data-testid="calendar-feed-working">{{ CAL_WORKING }}</p>
      <p v-if="feed.phase.value === 'reset-done'" class="text-body text-emerald-800 max-w-prose" role="status" data-testid="calendar-feed-reset-done">{{ CAL_RESET_DONE }}</p>
      <p v-if="feed.error.value" class="text-body text-rose-700 max-w-prose" role="alert" data-testid="calendar-feed-error">{{ CAL_ERRORS[feed.error.value] }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { useCalendarFeed, type CalendarFeed } from '@/composables/useCalendarFeed';
import { googleCalendarUrl, webcalUrl } from '@/lib/calendarCloud';
import {
  CAL_APPLE,
  CAL_CHECKING,
  CAL_REPLACE,
  CAL_REPLACE_ASK,
  CAL_REPLACE_YES,
  CAL_SAVED,
  CAL_UNREADABLE,
  CAL_COPIED,
  CAL_COPY,
  CAL_ERRORS,
  CAL_OPEN_MYRUNS,
  CAL_WORKING,
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
/** The saved link's surface (callink, 17 Nov 2026), from the composable when it has it: where the link stands in this browser, whether the
 *  link on screen was read back from the saved copy, and a new link (it revokes every link: the card asks first). A feed without it is
 *  today's card. */
const saved = feed as CalendarFeed & {
  savedState?: Ref<'none' | 'checking' | 'loaded' | 'unreadable'>;
  linkFromSave?: Ref<boolean>;
  replaceLink?: () => Promise<unknown>;
};
const savedState = computed(() => saved.savedState?.value ?? 'none');
const fromSave = computed(() => !!saved.linkFromSave?.value);
/** What the live region says: Copied, else the saved line or the shown-once line while the link is on screen (review W6). */
const liveText = computed(() => (feed.copied.value ? CAL_COPIED : feed.link.value ? (fromSave.value ? CAL_SAVED : CAL_SHOWN_ONCE) : ''));
const askingReplace = ref(false);
const replaceBtn = ref<HTMLElement | null>(null);
const replaceKeepBtn = ref<HTMLElement | null>(null);
// The new-link confirm takes focus on its safe button and, dismissed, hands it back to the first button when it would be lost to the page.
watch(askingReplace, (now, was) => {
  if (now) void nextTick(() => replaceKeepBtn.value?.focus());
  else if (was)
    void nextTick(() => {
      if (typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body)) replaceBtn.value?.focus();
    });
});
async function doReplace(): Promise<void> {
  askingReplace.value = false;
  await saved.replaceLink?.();
}
const resetBtn = ref<HTMLElement | null>(null);
const keepBtn = ref<HTMLElement | null>(null);
// The Reset confirm takes focus (on the safe button) and, dismissed, gives it back to Reset link when it would be lost to the page.
watch(
  () => feed.phase.value,
  (phase, was) => {
    if (phase === 'confirm') void nextTick(() => keepBtn.value?.focus());
    else if (was === 'confirm')
      void nextTick(() => {
        if (typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body)) resetBtn.value?.focus();
      });
  }
);
function toggle(on: boolean): void {
  if (on) feed.turnOn();
  else void feed.turnOff();
}
</script>
