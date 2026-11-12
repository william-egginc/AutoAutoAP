<!--
  "Follow this route" (lib/follow.ts, stores/follow.ts): My runs' Right now follows this route for the goal (its key,
  lib/planGoals.ts `goalKeyOf`) instead of the planner's checked pick, remembered per account in this browser.
  "Following ✓" when it is the one kept; "Checking" with moving dots (disabled) while the answer it is on is from before (`stale`). Small beside the buttons it sits with; `main` fills it (the answer's own, the screen's one main button; "Follow this route instead" while another route is followed); `primary` makes it a 44 px tap
  target on a phone. A press is the only thing that saves the route online (stores/follow.ts, lib/followCloud.ts):
  the summary props (where it came from, its finish, TE and plan start) go with it when the screen knows them.
-->
<template>
  <!-- Its tip (Tip.vue, lib/tipWords.ts; Allan, 9 Nov 2026) in place of the native title: at once on hover and focus,
       the "i" beside it on a phone where it is a 44 px button (`primary`). The parent's class and attributes go on the
       button itself, as before. -->
  <Tip :text="on ? TIP_FOLLOWING : TIP_FOLLOW" name="Follow this route" :info="primary" v-slot="{ describedby }">
    <button
      v-bind="$attrs"
      type="button"
      class="inline-flex items-center rounded-lg border font-bold disabled:opacity-60 disabled:cursor-default"
      :class="[
        on
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : main
            ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1'
            : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50',
        primary ? 'min-h-[44px] sm:min-h-0 px-3 py-1.5 text-body' : 'px-2 py-0.5 text-body',
      ]"
      :aria-label="ariaLabel"
      :aria-pressed="on ? 'true' : 'false'"
      :aria-describedby="describedby"
      :disabled="stale && !on"
      data-testid="follow-route"
      :data-goal="goalKey"
      @click.stop="pick"
    >
      <template v-if="on">Following ✓</template><template v-else-if="stale">Checking<AnimatedDots /></template
      ><template v-else-if="instead">{{ FOLLOW_THIS_ROUTE_INSTEAD }}</template><template v-else>Follow this route</template>
    </button>
  </Tip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import Tip from '@/components/Tip.vue';
import { TIP_FOLLOW, TIP_FOLLOWING } from '@/lib/tipWords';
import { FOLLOW_THIS_ROUTE_INSTEAD } from '@/lib/instantCardWords';
import { useFollowStore } from '@/stores/follow';
import type { FollowFrom } from '@/lib/follow';
import type { FollowSource } from '@/lib/followCloud';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  chain: readonly number[];
  goalKey: string;
  from: FollowFrom;
  label?: string;
  primary?: boolean;
  /** The answer's own button: the screen's one main (filled) button (the simpler default page, 9 Nov 2026). */
  main?: boolean;
  /** Saved online with the route (lib/followCloud.ts): where it came from (default: from `from`), when it reaches its
   *  last stop (unix seconds), the TE it ends at, its plan start, and By a date's deadline (for the spare). */
  source?: FollowSource;
  finish?: number | null;
  endTE?: number | null;
  planStart?: number | null;
  deadline?: number | null;
  /** The answer it is on is from before and being worked out again (InstantRoute.vue `staleAt`): held until the
   *  fresh one is in, so a stale route is never followed or saved online. */
  stale?: boolean;
  /** The route as the row shows it ("166 198 222 249"): the button's name then carries it ("Follow 166 198 222 249"),
   *  so a table's buttons are told apart by a screen reader (red team R7 M3, 1 Nov 2026). The visible words stay. */
  routeLabel?: string;
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
/** The answer's own button (`main`, the instant card's) while another route is followed for this goal: "Follow this
 *  route instead" (the card clean-up, Jordan 12 Nov 2026; the better-route line in the Following bar has no button of
 *  its own). The same press. */
const instead = computed(() => !!props.main && !on.value && !!follows?.followed(props.goalKey));
const ariaLabel = computed(() =>
  props.routeLabel ? `${on.value ? 'Following' : props.stale ? 'Checking' : 'Follow'} ${props.routeLabel}` : undefined
);
function pick(): void {
  if (!follows || on.value || props.stale || !props.chain.length) return;
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
