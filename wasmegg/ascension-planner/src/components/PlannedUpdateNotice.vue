<!--
  The planned-update notice on every page (R8.1, 18 Nov 2026). version.json `reloadPlanned` (lib/reloadPlanned.ts) used to
  reach only a page running a long search (ReloadPlannedBanner.vue, under Run / Stop); every other open page learned of the
  reload when it happened. This shows it on the planner page for everyone, except where that banner already shows (a long
  search is running: it says more, and asks the player to message the maintainer). Close hides it for that planned time
  only, for this page. Gone once the time has passed. Starts below a floating update banner (NewVersionBanner.vue) rather
  than under it (QA at 390 px, 18 Nov 2026; lib/updateOverlay.ts floatingBannerBottom). The owner's note shows as text
  only, never as HTML. Words: lib/runBeaconWords.ts `plannedUpdateWords`.
-->
<template>
  <div
    v-if="shown"
    class="mb-4 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 pl-3 min-w-0"
    :style="floatingBannerBottom > 0 ? { marginTop: `${floatingBannerBottom}px` } : undefined"
    role="status"
    data-testid="planned-update-notice"
  >
    <div class="min-w-0 flex-1 py-2 space-y-1">
      <p class="text-body text-indigo-900 break-words tabular-nums">{{ text }}</p>
      <p v-if="shown.note" class="text-body text-indigo-800 break-words" data-testid="planned-update-note">
        {{ shown.note }}
      </p>
    </div>
    <button
      type="button"
      class="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-3 text-body font-bold text-indigo-700 hover:text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-label="LONG_RUN_BANNER_CLOSE"
      data-testid="planned-update-close"
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
  dismissPlannedNotice,
  parseReloadPlanned,
  plannedAtWords,
  plannedNoticeDismissed,
  reloadBannerFor,
  reloadPlannedDismissed,
} from '@/lib/reloadPlanned';
import { LONG_RUN_BANNER_CLOSE, plannedUpdateWords } from '@/lib/runBeaconWords';
import { liveVersionJson } from '@/composables/useNewVersion';
import { useMinuteClock } from '@/composables/useMinuteClock';
import { floatingBannerBottom } from '@/lib/updateOverlay';

/** Unix seconds, once a minute while visible: the notice goes once the planned time has passed. */
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

const shown = computed(() => {
  const planned = parseReloadPlanned(liveVersionJson.value, nowMs());
  if (!planned || plannedNoticeDismissed() === planned.at) return null;
  // Where the long-run banner shows, it says this already (and more).
  return reloadBannerFor(planned, longRun.value, reloadPlannedDismissed()) ? null : planned;
});
const text = computed(() => (shown.value ? plannedUpdateWords(plannedAtWords(shown.value.atMs, nowMs(), zone())) : ''));

function close(): void {
  if (shown.value) dismissPlannedNotice(shown.value.at);
}
</script>
