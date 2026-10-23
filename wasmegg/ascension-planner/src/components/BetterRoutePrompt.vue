<!--
  A newer, better result for a goal the player follows a route for (lib/searchPlan.ts `followPrompt`, the 'prompt'
  path; 23 Oct 2026): the followed route is never replaced on its own, so this asks. "Follow it" is a Follow press
  (stores/follow.ts: kept here and saved online); "Keep mine" hides it for this result (remembered in this browser).
  On Right now (RightNowCard.vue, with the followed route's own price as `followedFinish`) and on the result cards
  (the instant card, Fastest's and By a date's search results). Nothing shows without a followed route.
-->
<template>
  <div
    v-if="prompt"
    class="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-[12px] text-indigo-950 space-y-1.5"
    role="status"
    data-testid="better-route"
    :data-id="prompt.id"
  >
    <p data-testid="better-route-words">{{ prompt.words }}</p>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="min-h-[44px] rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-indigo-700"
        data-testid="better-route-follow"
        @click.stop="followIt"
      >
        Follow it
      </button>
      <button
        type="button"
        class="min-h-[44px] rounded-xl border border-indigo-300 bg-white px-4 py-2 text-[13px] font-bold text-indigo-700 hover:bg-indigo-50"
        data-testid="better-route-keep"
        @click.stop="keepIt"
      >
        Keep mine
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFollowStore } from '@/stores/follow';
import { followPrompt, keepMine, readKeptMine, type FollowPrompt, type RouteFinish } from '@/lib/searchPlan';
import { dateAt } from '@/lib/eventWhen';

const props = defineProps<{
  goalKey: string | null | undefined;
  goal: 'fastest' | 'date';
  deadline: number | null;
  /** The new result: its route, finish, TE, when it was found (ms), where from and its plan start. */
  candidate: (RouteFinish & { chain: readonly number[]; at: number; source: FollowPrompt['source']; planStart?: number | null }) | null;
  /** The followed route's finish as priced on this save (Right now); absent: the one saved with it. */
  followedFinish?: RouteFinish | null;
  zone?: string;
}>();

/** No store without Pinia (a card rendered on its own in a spec): nothing shows. */
const follows = (() => {
  try {
    return useFollowStore();
  } catch {
    return null;
  }
})();
const kept = ref<string[]>(readKeptMine());
const zone = computed(() => props.zone || Intl.DateTimeFormat().resolvedOptions().timeZone);

const prompt = computed<FollowPrompt | null>(() => {
  if (!follows || !props.goalKey || !props.candidate) return null;
  const f = follows.followed(props.goalKey);
  if (!f) return null;
  const finish =
    props.followedFinish ??
    (typeof f.finish === 'number' ? { end: f.finish, endTE: f.endTE ?? f.chain[f.chain.length - 1] ?? 0 } : null);
  const nowSec = Date.now() / 1000;
  return followPrompt({
    goalKey: props.goalKey,
    goal: props.goal,
    deadline: props.deadline,
    followed: { chain: f.chain, at: f.at, finish },
    candidate: props.candidate,
    keptMine: kept.value,
    when: t => dateAt(t, nowSec, zone.value),
  });
});

function followIt(): void {
  const p = prompt.value;
  if (!p || !follows || !props.goalKey) return;
  void follows.followBetter(props.goalKey, p, props.goal === 'date' ? props.deadline : null);
}
function keepIt(): void {
  const p = prompt.value;
  if (!p) return;
  keepMine(p.id);
  kept.value = [...kept.value.filter(x => x !== p.id), p.id];
}
</script>
