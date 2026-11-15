<!--
  The "?" under the sharing lines: what goes online, what it is keyed by, and what never leaves the browser
  (lib/privacyWords.ts; Jordan, 6 Nov 2026). A native <details>, closed, 44 px tall on a phone; the words are one fact
  a line.
-->
<template>
  <details class="privacy-tip max-w-prose text-small text-slate-600" data-testid="privacy-tip">
    <summary
      class="inline-flex min-h-[44px] cursor-pointer select-none items-center gap-1 sm:min-h-0 font-bold text-indigo-700 hover:text-indigo-900"
      :aria-label="PRIVACY_TIP_LABEL"
      :title="PRIVACY_TIP_LABEL"
    >
      <span aria-hidden="true" class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-indigo-300">?</span>
      <span>What goes online</span>
    </summary>
    <ul class="list-disc space-y-1 pb-1 pl-5">
      <li v-for="line in lines" :key="line">{{ line }}</li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { PRIVACY_TIP_CALENDAR_LINE, PRIVACY_TIP_LABEL, PRIVACY_TIP_LINES } from '@/lib/privacyWords';
import { CALENDAR_FEED } from '@/lib/calendarCloud';

/** The calendar line only while the calendar feed is on (lib/calendarFlag.ts: its Setup card ships dark until the live collector has /cal). */
const lines = CALENDAR_FEED.enabled ? [...PRIVACY_TIP_LINES, PRIVACY_TIP_CALENDAR_LINE] : PRIVACY_TIP_LINES;
</script>

<style scoped>
.privacy-tip > summary {
  list-style: none;
}
.privacy-tip > summary::-webkit-details-marker {
  display: none;
}
</style>
