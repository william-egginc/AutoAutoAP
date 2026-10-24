<!--
  The experimental "Prestige by" line under the instant answer (search/prestigeBy.ts), only with the
  flag on (composables/usePrestigeBy.ts). It says how long the next prestige can wait before the
  answer gets worse, and what it gets after that.
-->
<template>
  <p v-if="status === 'running'" class="text-[11px] text-slate-400" data-testid="prestige-by-running">
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
    <p class="text-[10px] text-slate-500 leading-relaxed">
      Worked out on the instant answer's prices, each later start on the whole hour, with your farm laying while you
      wait for as long as its silos hold.<template v-if="line.spareSeconds !== null">
        At the latest start it lands {{ hours(line.spareSeconds) }} before the date.</template
      >
      Work it out again from your new save after you prestige.
    </p>
    <p v-if="hoursOn" class="text-[10px] text-slate-700" data-testid="prestige-by-hours">{{ HOURS_NOTE }}</p>
    <p class="text-[10px] text-violet-800" data-testid="prestige-by-evidence">{{ EVIDENCE }}</p>
    <p v-if="mismatch" class="text-[10px] text-amber-800">{{ mismatch }}</p>
  </div>
  <!-- Beta only: hidden by the 7-day rule, but say it is there, so the line can be seen working. -->
  <p v-else-if="beta && status === 'done' && line?.farOff" class="text-[11px] text-slate-400" data-testid="prestige-by-far">
    Prestige by: your next prestige is more than 7 days away (the cutoff is about {{ line.farOff }}). This line
    shows when it's closer.
  </p>
</template>

<script setup lang="ts">
import type { PrestigeLine } from '@/search/prestigeBy';

defineProps<{
  line: PrestigeLine | null;
  status: 'idle' | 'running' | 'done' | 'error';
  /** Set when the exact check disagrees with the instant answer the line was worked out on. */
  mismatch?: string;
  /** The beta site: also say when the line is hidden only because the next prestige is far off. */
  beta?: boolean;
  /** The player's hours are set (Let me pick my hours, a window that isn't any hour). */
  hoursOn?: boolean;
}>();

/** What the line has been checked against so far (the prestige-warn research, 11 Oct 2026): the alt's save alone,
 *  one date, hours off, and the older farm that stopped laying while the prestige waited (the math review's second
 *  check, 24 Oct 2026, finding 4). Not checked with hours on, nor on the laying farm the line now uses. */
const EVIDENCE =
  "Checked on 5 cases from one account, with hours off and an older model where the farm stopped laying while you waited: 4 within an hour of the full simulator, 1 two hours early. Not checked with hours on yet. Treat it as a hint.";
/** With hours on, the same route moved by days between prestiging at once and on the hour (the math review's second
 *  check, 24 Oct 2026: 6.3 days on one route, and the instant route at its own times landed up to 154 h late). */
const HOURS_NOTE =
  'With your hours on, a prestige even a few minutes off the time shown can move your finish by days, so prestige at the time shown.';

function hours(seconds: number): string {
  const h = seconds / 3600;
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
}
</script>
