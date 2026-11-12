<!--
  A newer, better result for a goal the player follows a route for (lib/searchPlan.ts `followPrompt`, the 'prompt'
  path; 23 Oct 2026): the followed route is never replaced on its own, so this asks. "Follow it" is a Follow press
  (stores/follow.ts: kept here and saved online); "Keep mine" hides it for this result (remembered in this browser).
  On the result cards (the instant card, Fastest's and By a date's search results). On Right now (RightNowCard.vue,
  with the followed route's own price as `followedFinish`) only the "Re-plan from this save" kind (`replanOnly`; Jordan,
  13 Nov 2026: following is done from the Auto Planner, so My runs drops the better-route box). Nothing shows without a followed route. An instant
  answer never asks about a PRICED follow (lib/searchPlan.ts `followIsPriced`, Jordan 23 Oct 2026): one from a Fast,
  Exact or Custom result, the route of such a result for this account and goal (kept, or in the search store now), or
  one Right now priced from a result (`followedPriced`). A Fast, Exact or Custom result asks about an unpriced route
  followed from the instant answer without comparing finishes (lib/searchPlan.ts `simulatedOverEstimate`: simulated
  against the table's estimate, math review 24 Oct 2026). When the save contradicts the followed route (`stale`,
  lib/followStale.ts; Right now only, alt A1 30 Oct 2026) the new result is offered as "Re-plan from this save", the
  reason first, whatever the finishes and over a priced follow too; the press is the same Follow press
  (stores/follow.ts `replanFromSave`). After it, the offer's place says "Now following the answer for this save"
  (REPLAN_DONE_WORDS, DRAFT for Words review, R7 red-team 1 Nov 2026) while the follow is the one that press made and
  is the answer shown; not after "Follow it", not on load. The words, the press and "Keep mine" show together or not
  at all: from a press on (stores/follow.ts `offerPressed`) nothing of the offer shows, and a press that doesn't follow
  brings it back whole (R7 red-team QA, 1 Nov 2026).
-->
<template>
  <div
    v-if="prompt && prompt.words"
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
        {{ prompt.stale ? 'Re-plan from this save' : 'Follow it' }}
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
  <p v-else-if="replanDone" class="text-small text-emerald-800" role="status" data-testid="better-route-replanned">{{ REPLAN_DONE_WORDS }}</p>
</template>

<script lang="ts">
/** The line after Right now's "Re-plan from this save" press (DRAFT words, for Words review). */
export const REPLAN_DONE_WORDS = 'Now following the answer for this save';
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { getActivePinia } from 'pinia';
import { useFollowStore } from '@/stores/follow';
import { followIsPriced, followPrompt, keepMine, readKeptMine, readKeptSearches, type FollowPrompt, type RouteFinish } from '@/lib/searchPlan';
import { dateAt } from '@/lib/eventWhen';
import { useInitialStateStore } from '@/stores/initialState';
import { hoursOf, sameHours, sourceOfFrom, type CloudHours } from '@/lib/followCloud';
import { SIM_VERSION } from '@/search/simVersion';
import { versionPriceWords } from '@/lib/followOldPriceWords';
import { offerAt } from '@/lib/followOfferWords';
import type { Availability } from '@/search/availability';
import type { StaleReason } from '@/lib/followStale';
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
  /** The save contradicts the followed route (lib/followStale.ts `followStaleness`): asked as "Re-plan from this save".
   *  Absent or null: the better-route rules only. */
  stale?: StaleReason | null;
  /** Right now (My runs): only the "Re-plan from this save" offer (`stale` set); the better-route offer is asked on the
   *  Auto Planner's cards, where following is done (Jordan, 13 Nov 2026). */
  replanOnly?: boolean;
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

/** The follow's saved price was worked out by another version of the planner or with other awake hours than now. */
function savedPriceIsOld(f: { simVersion?: string; hours?: CloudHours | null }): 'version' | StaleReason | null {
  if (f.simVersion && f.simVersion !== SIM_VERSION) return 'version';
  if (f.hours !== undefined) {
    let availability: Availability | null = null;
    try {
      const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
      if (pinia && 'chainSearch' in pinia.state.value) availability = useChainSearchStore().availability ?? null;
    } catch {
      // no store (a card on its own in a spec)
    }
    if (!sameHours(f.hours, hoursOf(availability))) return { kind: 'hours' };
  }
  return null;
}

const prompt = computed<FollowPrompt | null>(() => {
  // From the press on, nothing of the offer (its words, its press and Keep mine go together; R7 red-team QA).
  if (!follows || !props.goalKey || !props.candidate || follows.offerPressed(props.goalKey)) return null;
  if (props.replanOnly && !props.stale) return null;
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
  // The price saved with the follow is only compared when it is for this setup: not when another version of the planner or
  // other awake hours worked it out (M13: "yours: 313 TE, 37h 6m to spare" on the instant card, over My runs' fresh Jul 17).
  // Right now passes its own fresh price (`followedFinish`) or its own `stale`; a card without either checks here.
  const savedPriceOld = !props.followedFinish && !props.stale ? savedPriceIsOld(f) : null;
  const p = followPrompt({
    goalKey: props.goalKey,
    goal: props.goal,
    deadline: props.deadline,
    followed: { chain: f.chain, at: f.at, finish, priced, source },
    candidate: offerAt(props.candidate, f.at),
    keptMine: kept.value,
    when: t => dateAt(t, nowSec, zone.value),
    // 'version': the kind that says "Re-plan from this save" (the hours', a stale price is the same offer), its words below.
    stale: props.stale ?? (savedPriceOld === 'version' ? { kind: 'hours' } : savedPriceOld),
  });
  return p && savedPriceOld === 'version' && p.stale
    ? { ...p, words: versionPriceWords(props.candidate, props.goal, t => dateAt(t, nowSec, zone.value)) }
    : p;
});

/** A "Re-plan from this save" press made the follow (stores/follow.ts `replanned`) and it is the answer shown. */
const replanDone = computed(() => {
  if (!follows || !props.goalKey || !props.candidate || !follows.replanned(props.goalKey)) return false;
  const f = follows.followed(props.goalKey);
  return !!f && f.chain.join(',') === props.candidate.chain.join(',');
});

function followIt(): void {
  const p = prompt.value;
  if (!p || !follows || !props.goalKey) return;
  const deadline = props.goal === 'date' ? props.deadline : null;
  void (p.stale ? follows.replanFromSave(props.goalKey, p, deadline) : follows.followBetter(props.goalKey, p, deadline));
}
function keepIt(): void {
  const p = prompt.value;
  if (!p) return;
  keepMine(p.id);
  kept.value = [...kept.value.filter(x => x !== p.id), p.id];
}
</script>
