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
}>();

/** What the line has been checked against so far (the prestige-warn research, 11 Oct 2026). */
const EVIDENCE =
  'Checked on 5 test cases so far (4 within an hour of the full simulator, 1 two hours early). Treat it as a hint.';

function hours(seconds: number): string {
  const h = seconds / 3600;
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
}
</script>
