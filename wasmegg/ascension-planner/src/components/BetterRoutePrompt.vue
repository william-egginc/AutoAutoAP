<!--
  A newer, better result for a goal the player follows a route for (lib/searchPlan.ts `followPrompt`, the 'prompt'
  path; 23 Oct 2026): the followed route is never replaced on its own, so this asks. "Follow it" is a Follow press
  (stores/follow.ts: kept here and saved online); "Keep mine" hides it for this result (remembered in this browser).
  On Right now (RightNowCard.vue, with the followed route's own price as `followedFinish`) and on the result cards
  (the instant card, Fastest's and By a date's search results). Nothing shows without a followed route. An instant
  answer never asks about a PRICED follow (lib/searchPlan.ts `followIsPriced`, Jordan 23 Oct 2026): one from a Fast,
  Exact or Custom result, the route of such a result for this account and goal (kept, or in the search store now), or
  one Right now priced from a result (`followedPriced`). A Fast, Exact or Custom result asks about an unpriced route
  followed from the instant answer without comparing finishes (lib/searchPlan.ts `simulatedOverEstimate`: simulated
  against the table's estimate, math review 24 Oct 2026).
-->
<template>
  <div
    v-if="prompt"
    class="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-2 text-small text-indigo-950 space-y-1.5"
    role="status"
    data-testid="better-route"
    :data-id="prompt.id"
  >
    <p data-testid="better-route-words">{{ prompt.words }}</p>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="min-h-[44px] rounded-xl bg-indigo-600 px-4 py-2 text-body font-bold text-white hover:bg-indigo-700"
        data-testid="better-route-follow"
        @click.stop="followIt"
      >
        Follow it
      </button>
      <button
        type="button"
        class="min-h-[44px] rounded-xl border border-indigo-300 bg-white px-4 py-2 text-body font-bold text-indigo-700 hover:bg-indigo-50"
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
import { getActivePinia } from 'pinia';
import { useFollowStore } from '@/stores/follow';
import { followIsPriced, followPrompt, keepMine, readKeptMine, readKeptSearches, type FollowPrompt, type RouteFinish } from '@/lib/searchPlan';
import { dateAt } from '@/lib/eventWhen';
import { useInitialStateStore } from '@/stores/initialState';
import { sourceOfFrom } from '@/lib/followCloud';
import { useChainSearchStore } from '@/stores/chainSearch';
import { accountOf } from '@/search/runSaves';
import { SAME_DEADLINE_SECONDS } from '@/search/strongerCheck';

const props = defineProps<{
  goalKey: string | null | undefined;
  goal: 'fastest' | 'date';
  deadline: number | null;
  /** The new result: its route, finish, TE, when it was found (ms), where from and its plan start. */
  candidate: (RouteFinish & { chain: readonly number[]; at: number; source: FollowPrompt['source']; planStart?: number | null }) | null;
  /** The followed route's finish as priced on this save (Right now); absent: the one saved with it. */
  followedFinish?: RouteFinish | null;
  /** Right now's finish for the followed route came from a priced result (a Fast, Exact or Custom timeline, or Check
   *  exactly's): an instant answer never asks then. */
  followedPriced?: boolean;
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

/** The Fast, Exact and Custom results of this account for the goal (their routes): the ones kept in this browser
 *  (aap-search-plans) and the search store's finished one, for `followIsPriced`. Only read for an instant candidate. */
function resultRoutes(): number[][] {
  const out: number[][] = [];
  const target = props.goal === 'fastest' ? Number(/^fastest-(\d+)$/.exec(props.goalKey ?? '')?.[1] ?? NaN) : NaN;
  const sameGoal = (words: string) => {
    const m = /^(target|date) (\d+)$/.exec(words);
    if (!m) return false;
    return props.goal === 'fastest'
      ? m[1] === 'target' && Number(m[2]) === target
      : m[1] === 'date' && props.deadline != null && Math.abs(Number(m[2]) - props.deadline) <= SAME_DEADLINE_SECONDS;
  };
  try {
    const account = accountOf(useInitialStateStore().rawBackup);
    if (account) for (const k of readKeptSearches()) if (k.account === account && sameGoal(k.goal)) out.push(k.search.chain);
  } catch {
    // no stores (a card on its own in a spec)
  }
  try {
    // Only the store the page already made (making it here would write to storage, stores/follow.ts says why).
    const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
    if (!pinia || !('chainSearch' in pinia.state.value)) return out;
    const s = useChainSearchStore();
    const me = follows?.partition ?? '';
    const mine = (owner: string) => !owner || !me || owner === me;
    if (props.goal === 'fastest') {
      const c = s.bestChain;
      if (!s.isRunning && s.bestDays > 0 && c.length && c[c.length - 1] === target && mine(s.chainResultOwner)) out.push([...c]);
    } else {
      const r = s.deadlineResult;
      if (r && !s.deadlineRunning && props.deadline != null && Math.abs(r.deadline - props.deadline) <= SAME_DEADLINE_SECONDS && mine(s.deadlineResultOwner))
        for (const x of r.routes) if (x.chain.length) out.push([...x.chain]);
    }
  } catch {
    // no search store
  }
  return out;
}

const prompt = computed<FollowPrompt | null>(() => {
  if (!follows || !props.goalKey || !props.candidate) return null;
  const f = follows.followed(props.goalKey);
  if (!f) return null;
  const source = f.source ?? sourceOfFrom(f.from);
  // Read for an instant candidate (it never asks about a priced follow) and for a result against an instant-sourced
  // follow (it asks without comparing, unless that route has a simulated price: lib/searchPlan.ts simulatedOverEstimate).
  const priced =
    (props.candidate.source === 'instant' || source === 'instant') &&
    followIsPriced({ source, chain: f.chain, pricedByResult: !!props.followedPriced, results: resultRoutes() });
  const finish =
    props.followedFinish ??
    (typeof f.finish === 'number' ? { end: f.finish, endTE: f.endTE ?? f.chain[f.chain.length - 1] ?? 0 } : null);
  const nowSec = Date.now() / 1000;
  return followPrompt({
    goalKey: props.goalKey,
    goal: props.goal,
    deadline: props.deadline,
    followed: { chain: f.chain, at: f.at, finish, priced, source },
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
