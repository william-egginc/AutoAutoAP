<!--
  The experimental "Prestige by" line under the instant answer (search/prestigeBy.ts), only with the
  flag on (composables/usePrestigeBy.ts). It says how long the next prestige can wait before the
  answer gets worse, and what it gets after that.
-->
<template>
  <!-- A quiet one-liner only while it is working, and for at most STILL_WORKING_MS: past that it says nothing until a
       line comes (UX review 26 Oct 2026, item 7: it sat in the green box until the player had scrolled away). -->
  <p v-if="status === 'running' && working" class="text-[11px] text-slate-400" data-testid="prestige-by-running">
    Working out how long your next prestige can wait…
  </p>
  <div
    v-else-if="line?.show"
    class="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 space-y-1"
    data-testid="prestige-by"
  >
    <p class="text-[12px] text-slate-800 leading-relaxed">
      <span
        class="mr-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 text-[9px] font-black uppercase tracking-widest"
        :title="EVIDENCE"
        data-testid="prestige-by-tag"
        >Experimental · needs more data</span
      >
      <b>{{ line.text }}</b>
      <span
        v-if="line.tight"
        class="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-widest"
        data-testid="prestige-by-tight"
        >tight</span
      >
    </p>
    <!-- How it is worked out, the hours note and the evidence: folded under one "Why? ›" (Jordan, 25 Oct 2026; one line
         per number, the rest behind Why, as under the answer itself: AnswerCaveatLine.vue). -->
    <details data-testid="prestige-by-why">
      <summary
        class="cursor-pointer min-h-[44px] sm:min-h-0 py-2.5 sm:py-0 text-[11px] font-bold text-violet-800 underline decoration-dotted underline-offset-2"
        data-testid="prestige-by-why-summary"
      >
        Why? ›
      </summary>
      <div class="mt-1 space-y-1">
        <p class="text-[10px] text-slate-500 leading-relaxed">
          Worked out on the instant answer's prices, each later start on the whole hour, with your farm laying while
          you wait for as long as its silos hold.<template v-if="line.spareSeconds !== null">
            At the latest start it lands {{ hours(line.spareSeconds) }} before the date.</template
          >
          Work it out again from your new save after you prestige.
        </p>
        <p v-if="hoursOn" class="text-[10px] text-slate-700" data-testid="prestige-by-hours">{{ HOURS_NOTE }}</p>
        <p class="text-[10px] text-violet-800" data-testid="prestige-by-evidence">{{ EVIDENCE }}</p>
      </div>
    </details>
    <p v-if="mismatch" class="text-[10px] text-amber-800">{{ mismatch }}</p>
  </div>
  <!-- Beta only: hidden by the 7-day rule, but say it is there, so the line can be seen working. Not on By a date
       (UX review 26 Oct 2026, item 8): nothing there until it is closer. -->
  <p v-else-if="beta && !dated && status === 'done' && line?.farOff" class="text-[11px] text-slate-400" data-testid="prestige-by-far">
    Prestige by: your next prestige is more than 7 days away (the cutoff is about {{ line.farOff }}). This line
    shows when it's closer.
  </p>
</template>

<script setup lang="ts">
import { useStillWorking } from '@/composables/useStillWorking';
import type { PrestigeLine } from '@/search/prestigeBy';
// With hours on: prestige at the time shown (shared with the instant card and Insights, lib/hoursNote.ts).
import { HOURS_NOTE } from '@/lib/hoursNote';

const props = defineProps<{
  line: PrestigeLine | null;
  status: 'idle' | 'running' | 'done' | 'error';
  /** Set when the exact check disagrees with the instant answer the line was worked out on. */
  mismatch?: string;
  /** The beta site: also say when the line is hidden only because the next prestige is far off. */
  beta?: boolean;
  /** The player's hours are set (Let me pick my hours, a window that isn't any hour). */
  hoursOn?: boolean;
  /** Under By a date's box: no far-off note, nothing until the next prestige is closer. */
  dated?: boolean;
}>();

/** How long "Working out…" shows before it gives way to nothing (the line still shows if it comes later). */
const STILL_WORKING_MS = 20_000;
const working = useStillWorking(() => props.status, STILL_WORKING_MS);

/** What the line has been checked against so far (the prestige-warn research, 11 Oct 2026): the alt's save alone,
 *  one date, hours off, and the older farm that stopped laying while the prestige waited (the math review's second
 *  check, 24 Oct 2026, finding 4). Not checked with hours on, nor on the laying farm the line now uses. */
const EVIDENCE =
  "Checked on 5 cases from one account, with hours off and an older model where the farm stopped laying while you waited: 4 within an hour of the full simulator, 1 two hours early. Not checked with hours on yet. Treat it as a hint.";

function hours(seconds: number): string {
  const h = seconds / 3600;
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
}
</script>
