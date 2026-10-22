<!--
  Light's status line at the top of the search panel (SearchPanel.vue, 22 Oct 2026). Light is no longer a
  choice: it runs by itself after Check exactly (the instant answer's routes priced ascending at once on
  your hours, then your earlier routes priced on this save and, by a date, one TE lower), so it is a
  status sign, waiting -> running -> done, with its summary, its results (InstantRoute.vue teleports
  StrongerCheck into `#stronger-check-results` here, always on) and, once it has a result, its Send
  (LightShare.vue).
-->
<template>
  <div class="space-y-2" data-testid="light-block">
    <p
      class="flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px]"
      :class="
        stronger.light.state === 'done'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-indigo-100 bg-indigo-50/50 text-slate-700'
      "
      data-testid="light-status"
    >
      <!-- Running: "Searching" with the CSS dots (AnimatedDots.vue, no timer), then what it is on now
           ("Looking at 7 ascensions (1 of 5)…", "Your earlier routes: 3 of 6…"; Jordan, 14 Oct). -->
      <span v-if="stronger.light.state === 'running'" data-testid="light-searching"
        ><b>Light: searching<AnimatedDots /></b>{{ ' ' }}{{ lightText }}</span
      >
      <span v-else>{{ lightText }}</span>
    </p>
    <!-- Light's own result, as soon as one route is priced at once: the fastest as you'd play it. -->
    <p v-if="stronger.light.summary" class="text-[12px] font-bold text-indigo-900" data-testid="light-as-played">
      {{ stronger.light.summary }}
    </p>
    <!-- The stronger check's own results (earlier routes, one TE lower, Best now); they carry their own
         headings ("Your earlier routes", "A TE lower"). -->
    <div id="stronger-check-results" />
    <!-- Light's result to the board (Jordan, 15 Oct): once Light is done with one, a Send like Fast's. -->
    <LightShare :goal="goal" :player-id="playerId" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStrongerStore } from '@/stores/stronger';
import { doneWhat } from '@/search/lightAtOnce';
import AnimatedDots from './AnimatedDots.vue';
import LightShare from './LightShare.vue';

defineProps<{
  goal: 'fastest' | 'date';
  /** The header's player ID, for Light's Share box (LightShare.vue). */
  playerId?: string;
}>();

const stronger = useStrongerStore();

/** Light's status sign: "runs by itself" -> "Searching… Looking at 7 ascensions (1 of 5)…" -> "Done: priced the
 *  instant answer's 5 routes at once, and 2 of your 3 earlier routes". */
const lightText = computed(() => {
  const l = stronger.light;
  const ex = stronger.exact;
  const instant = l.instant?.total ?? 0;
  // Check exactly comes first: Light waits for it, so say so, with how far it is (the user, 14 Oct: "nothing to
  // start" read as if nothing would happen).
  if (ex.running && l.state !== 'running') {
    const progress = ex.total ? ` (${ex.done} of ${ex.total} routes)` : '';
    const next = l.total ? `${l.total} earlier route${l.total === 1 ? '' : 's'} of yours` : 'your earlier routes';
    return `Waiting for Check exactly to finish${progress}… then Light prices the instant answer's routes at once, and ${next}, on your hours.`;
  }
  if (l.state === 'running') {
    if (l.step) return l.step;
    return l.total
      ? `Pricing your ${l.total} earlier route${l.total === 1 ? '' : 's'} on this save…`
      : 'Pricing your earlier routes on this save…';
  }
  if (l.state === 'done') {
    const at = l.at ? ` at ${clock(l.at)}` : '';
    const what = doneWhat({ instantPriced: l.instant?.priced ?? 0, instantTotal: instant, earlierPriced: l.priced, earlierTotal: l.total });
    if (!what) return 'Nothing of yours to price yet. Find searches for new routes.';
    const none = l.total ? '' : ' Nothing of yours to price yet.';
    // Where the earlier routes came from: "from your board runs sent from another browser" (18 Oct 2026).
    const from = l.total && l.from ? `, ${l.from}` : '';
    return `Light ran by itself${at}: priced ${what}${from}.${none}`;
  }
  if (l.state === 'error') return 'Light stopped before it finished. It runs again after the next Check exactly.';
  return "Light runs by itself after Check exactly: it prices the instant answer's routes ascending at once, and your earlier routes, on your hours. Nothing to start.";
});
/** "12:31 pm" */
function clock(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms))
    .toLowerCase();
}
</script>
