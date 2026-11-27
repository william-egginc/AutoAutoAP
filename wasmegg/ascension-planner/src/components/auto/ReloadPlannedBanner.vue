<!--
  The planned-update banner (Jordan, 7 Nov 2026). When the maintainer plans to force open pages to reload, version.json
  says so (`reloadPlanned`, lib/reloadPlanned.ts); a page whose long search (2 hours or more, lib/runBeacon.ts `longRun`)
  is still running asks its player to message him, so the update waits. Not at a search's start, not for a short one,
  not once the notice is cleared or its time has passed. Local: it does not depend on the long-run alert's switch.
  Close hides it for that planned time only. In the run controls' flow under Run / Stop (RunControls.vue), never
  floating over them. A notice, not an error. Words: lib/runBeaconWords.ts. The owner's note shows as text only.
-->
<template>
  <div
    v-if="shown"
    class="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 pl-3 min-w-0"
    role="status"
    data-testid="reload-planned-banner"
  >
    <div class="min-w-0 flex-1 py-2 space-y-1">
      <p class="text-body text-indigo-900 break-words tabular-nums">{{ text }}</p>
      <p v-if="shown.note" class="text-body text-indigo-800 break-words" data-testid="reload-planned-note">
        {{ shown.note }}
      </p>
    </div>
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-3 text-body font-bold text-indigo-700 hover:text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-label="LONG_RUN_BANNER_CLOSE"
      data-testid="reload-planned-close"
      @click="close"
    >
      {{ LONG_RUN_BANNER_CLOSE }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { longRun } from '@/lib/runBeacon';
import {
  dismissReloadPlanned,
  parseReloadPlanned,
  plannedAtWords,
  reloadBannerFor,
  reloadPlannedDismissed,
} from '@/lib/reloadPlanned';
import { LONG_RUN_BANNER_CLOSE, longRunBannerWords } from '@/lib/runBeaconWords';
import { liveVersionJson } from '@/composables/useNewVersion';
import { useMinuteClock } from '@/composables/useMinuteClock';

/** Unix seconds, once a minute while visible: the banner goes once the planned time has passed. */
const nowSec = useMinuteClock();

/** This device's own time zone: the planned time is read on the player's clock. */
function zone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The clock and Date.now(), whichever is later (a render between minute ticks still sees a passed time). */
const nowMs = () => Math.max(nowSec.value * 1000, Date.now());

const shown = computed(() =>
  reloadBannerFor(parseReloadPlanned(liveVersionJson.value, nowMs()), longRun.value, reloadPlannedDismissed())
);
const text = computed(() => (shown.value ? longRunBannerWords(plannedAtWords(shown.value.atMs, nowMs(), zone())) : ''));

function close(): void {
  if (shown.value) dismissReloadPlanned(shown.value.at);
}
</script>
