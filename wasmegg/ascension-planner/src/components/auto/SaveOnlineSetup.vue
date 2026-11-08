<!--
  Setup › Sharing: the master "Save online" switch and "Delete everything saved online for this account" (Jordan,
  7 Nov 2026; client brief notes/sync-client-brief-2026-11-07.md section 4). The switch is this browser's own
  (lib/saveOnline.ts), on by default; off, nothing is read from or written to /follow, /prefs, /answers or /sync. The
  delete flow is composables/useForgetEverything.ts; it is shown only with SYNC_RECORDS on (lib/syncedRecords.ts).
  Words: lib/syncWords.ts (Words'), placeholders in lib/saveOnlineWords.ts.
-->
<template>
  <div class="space-y-2" data-testid="save-online">
    <label class="flex items-start gap-3 cursor-pointer min-h-[44px]">
      <input
        v-model="on"
        type="checkbox"
        class="mt-0.5 rounded border-slate-300 text-indigo-600"
        aria-describedby="save-online-line"
        data-testid="save-online-switch"
      />
      <span class="text-body text-slate-600">
        <span class="font-bold text-slate-800">{{ SAVE_ONLINE_LABEL }}</span>
      </span>
    </label>
    <p id="save-online-line" class="ml-7 text-body text-slate-600 max-w-prose" data-testid="save-online-line">{{ line }}</p>

    <!-- Delete everything: a real button, then a confirm in place (never a native dialog). -->
    <div v-if="forget.available.value" class="ml-7 space-y-2" data-testid="sync-delete">
      <button
        v-if="forget.phase.value !== 'confirm'"
        type="button"
        class="inline-flex min-h-[44px] items-center rounded text-left text-body font-bold text-rose-700 underline hover:text-rose-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 disabled:no-underline"
        :disabled="forget.busy.value"
        data-testid="sync-delete-button"
        @click="forget.ask()"
      >
        {{ forget.busy.value ? SYNC_DELETE_RUNNING : SYNC_DELETE_LABEL }}
      </button>
      <div
        v-else
        class="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2"
        role="alertdialog"
        aria-labelledby="sync-delete-confirm-text"
        data-testid="sync-delete-confirm"
      >
        <div id="sync-delete-confirm-text" class="space-y-1">
          <p v-for="(l, i) in forget.confirmLines.value" :key="i" class="text-body text-slate-700 max-w-prose">{{ l }}</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="inline-flex min-h-[44px] items-center rounded-lg bg-rose-700 px-4 text-body font-bold text-white hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            data-testid="sync-delete-yes"
            @click="forget.confirm()"
          >
            {{ SYNC_DELETE_YES }}
          </button>
          <button
            type="button"
            class="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            data-testid="sync-delete-no"
            @click="forget.cancel()"
          >
            {{ SYNC_DELETE_NO }}
          </button>
        </div>
      </div>
      <div v-if="forget.lines.value.length" role="status" data-testid="sync-delete-result">
        <p
          v-for="(l, i) in forget.lines.value"
          :key="i"
          class="text-body max-w-prose"
          :class="forget.phase.value === 'failed' ? 'text-amber-800' : 'text-slate-600'"
        >
          {{ l }}
        </p>
        <button
          v-if="forget.canRetry.value"
          type="button"
          class="inline-flex min-h-[44px] items-center rounded text-body font-bold text-indigo-700 underline hover:text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          data-testid="sync-delete-retry"
          @click="forget.confirm()"
        >
          {{ SYNC_DELETE_RETRY }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { saveOnlineSwitch } from '@/lib/saveOnline';
import { SYNC_RECORDS } from '@/lib/syncedRecords';
import { deletedThisVisit, useForgetEverything } from '@/composables/useForgetEverything';
import {
  SAVE_ONLINE_LABEL,
  SAVE_ONLINE_LINE_OFF,
  SAVE_ONLINE_LINE_ON,
  SAVE_ONLINE_OFF_AFTER_DELETE,
  SYNC_DELETE_LABEL,
  SYNC_DELETE_NO,
  SYNC_DELETE_YES,
} from '@/lib/syncWords';
import { SAVE_ONLINE_LINE_ON_NO_SYNC, SYNC_DELETE_RETRY, SYNC_DELETE_RUNNING } from '@/lib/saveOnlineWords';

const sw = saveOnlineSwitch();
const on = computed({
  get: () => sw.value,
  set: v => (sw.value = v),
});
const forget = useForgetEverything();
// Words' on line names the starting TE and the tracker, saved online only once SYNC_RECORDS is on.
const line = computed(() =>
  on.value
    ? SYNC_RECORDS.enabled
      ? SAVE_ONLINE_LINE_ON
      : SAVE_ONLINE_LINE_ON_NO_SYNC
    : deletedThisVisit()
      ? SAVE_ONLINE_OFF_AFTER_DELETE
      : SAVE_ONLINE_LINE_OFF
);
</script>
