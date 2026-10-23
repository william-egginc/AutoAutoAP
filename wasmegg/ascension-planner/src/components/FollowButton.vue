<!--
  "Follow this route" (lib/follow.ts, stores/follow.ts): My runs' Right now follows this route for the goal (its key,
  lib/planGoals.ts `goalKeyOf`) instead of the planner's checked pick, remembered per account in this browser.
  "Following ✓" when it is the one kept. Small beside the buttons it sits with; `primary` makes it a 44 px tap
  target on a phone. A press is the only thing that saves the route online (stores/follow.ts, lib/followCloud.ts):
  the summary props (where it came from, its finish, TE and plan start) go with it when the screen knows them.
-->
<template>
  <button
    type="button"
    class="inline-flex items-center rounded-lg border font-bold"
    :class="[
      on ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50',
      primary ? 'min-h-[44px] sm:min-h-0 px-3 py-1.5 text-[12px]' : 'px-2 py-0.5 text-[11px]',
    ]"
    :aria-pressed="on ? 'true' : 'false'"
    :title="on ? `Right now (My runs) follows this route for ${goalName}` : `Right now (My runs) follows this route for ${goalName} instead of the checked one`"
    data-testid="follow-route"
    :data-goal="goalKey"
    @click.stop="pick"
  >
    {{ on ? 'Following ✓' : 'Follow this route' }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFollowStore } from '@/stores/follow';
import type { FollowFrom } from '@/lib/follow';
import type { FollowSource } from '@/lib/followCloud';

const props = defineProps<{
  chain: readonly number[];
  goalKey: string;
  from: FollowFrom;
  label?: string;
  primary?: boolean;
  /** Saved online with the route (lib/followCloud.ts): where it came from (default: from `from`), when it reaches its
   *  last stop (unix seconds), the TE it ends at, its plan start, and By a date's deadline (for the spare). */
  source?: FollowSource;
  finish?: number | null;
  endTE?: number | null;
  planStart?: number | null;
  deadline?: number | null;
}>();

/** No store without Pinia (a board list rendered on its own in a spec): the button still shows, and does nothing. */
const follows = (() => {
  try {
    return useFollowStore();
  } catch {
    return null;
  }
})();
const on = computed(() => !!follows?.isFollowed(props.goalKey, props.chain));
const goalName = computed(() => {
  const k = props.goalKey;
  if (k.startsWith('fastest-')) return `Race to ${k.slice(8)}`;
  if (k.startsWith('eggday-')) return `Egg Day ${k.slice(7)}`;
  return 'this date';
});
function pick(): void {
  if (!follows || on.value || !props.chain.length) return;
  const fin = typeof props.finish === 'number' && Number.isFinite(props.finish) ? Math.round(props.finish) : undefined;
  void follows.follow(props.goalKey, props.chain, props.from, props.label, {
    ...(props.source ? { source: props.source } : {}),
    ...(fin !== undefined ? { finish: fin } : {}),
    ...(typeof props.endTE === 'number' ? { endTE: Math.floor(props.endTE) } : {}),
    ...(props.planStart ? { planStart: Math.floor(props.planStart) } : {}),
    ...(fin !== undefined && props.deadline ? { spareSeconds: props.deadline - fin } : {}),
  });
}
</script>
