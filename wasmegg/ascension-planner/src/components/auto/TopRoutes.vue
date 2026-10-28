<!--
  More than the single best (item 12, beta feedback 27 Oct 2026): under the result card (RouteResultCard.vue on Fastest,
  ByDateRouteCard.vue on Highest TE by a date), closed by default in a native details, "More routes":

    the best 5 routes the search priced, each with its rank, stops, finish (By a date: the TE it reaches), how far
      behind the best, its number of ascensions, and the card's own Simulate this plan and Follow this route;
    the best for each number of ascensions as a dot chart (one row per count, a dot on a shared scale: Fastest the
      finish, sooner to the left; By a date the TE, higher to the right), each row a button that shows that route's
      line and its two buttons under the chart.

  Read off what the run kept (lib/topRoutes.ts; Fastest: store `topPricedRoutes`, By a date: the result's routes and
  best per stop count). `routes` is a getter read only while open, so a closed section costs nothing. Simulate goes
  through the panel's own handler (`simulate` with the route's stops), Follow through the same FollowButton as the
  card. Sharing is unchanged: only the best is sent.
-->
<template>
  <details
    class="rounded-xl border border-slate-200 bg-white"
    :open="isOpen"
    data-testid="top-routes"
    @toggle="onToggle"
  >
    <summary class="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-2 px-4 py-2 text-body sm:min-h-0">
      <span class="font-bold text-slate-700">More routes ›</span>
      <span class="text-slate-500">Best 5 routes · best per ascension count</span>
    </summary>

    <div v-if="isOpen" class="space-y-5 border-t border-slate-100 px-4 pb-4 pt-3" data-testid="top-routes-body">
      <p v-if="!top.length" class="text-body text-slate-500">No other route was priced.</p>

      <section v-if="top.length" aria-labelledby="top-routes-list-h" class="space-y-2">
        <h4 id="top-routes-list-h" class="label text-slate-500">
          Best {{ top.length }} route{{ top.length === 1 ? '' : 's' }}
        </h4>
        <ol class="divide-y divide-slate-100" data-testid="top-routes-list">
          <li
            v-for="r in top"
            :key="r.chain.join(',')"
            class="space-y-1.5 py-2.5"
            :class="r.best ? 'rounded-lg bg-emerald-50 px-2' : ''"
            :data-best="r.best ? 'true' : undefined"
            data-testid="top-route-row"
          >
            <div class="flex flex-wrap items-baseline gap-x-2 text-small text-slate-500">
              <span class="font-bold text-slate-700 tabular-nums" :aria-label="`Rank ${r.rank}`">{{ r.rank }}.</span>
              <span v-if="r.best" class="rounded bg-emerald-600 px-1.5 font-bold text-white">Best</span>
              <span>{{ plural(r.ascensions, 'ascension') }}</span>
              <span v-if="!r.best" class="tabular-nums" data-testid="top-route-behind">{{ behindLabel(goal, r) }}</span>
            </div>
            <p class="break-words text-body font-bold text-slate-900 tabular-nums">{{ r.chain.join(' ') }}</p>
            <p class="break-words text-small text-slate-600 tabular-nums">{{ whenLine(r) }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                :class="SECONDARY_BUTTON"
                :disabled="busy"
                :aria-label="`Simulate this plan: ${r.chain.join(' ')}`"
                data-testid="top-route-simulate"
                @click="emit('simulate', [...r.chain])"
              >
                Simulate this plan
              </button>
              <FollowButton
                v-if="canFollow(r)"
                primary
                :chain="r.chain"
                :goal-key="follow!.goalKey"
                from="saved"
                :source="follow!.source"
                :finish="r.finish"
                :end-t-e="r.te"
                :plan-start="follow!.planStart"
                :deadline="deadline ?? null"
              />
            </div>
          </li>
        </ol>
      </section>

      <section v-if="perCount.length" aria-labelledby="top-routes-chart-h" class="space-y-2" data-testid="top-routes-chart">
        <h4 id="top-routes-chart-h" class="label text-slate-500">Best per number of ascensions</h4>
        <p class="text-small text-slate-500">
          {{
            goal === 'date'
              ? 'The highest TE each number of ascensions reaches: further right is higher. Tap one for its route.'
              : 'The earliest finish for each number of ascensions: further left is sooner. Tap one for its route.'
          }}
        </p>
        <ul class="space-y-0.5" role="list">
          <li v-for="c in perCount" :key="c.ascensions">
            <button
              type="button"
              class="grid min-h-[44px] w-full grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-lg px-1 text-left text-small hover:bg-slate-50 sm:min-h-[32px]"
              :class="chosen?.ascensions === c.ascensions ? 'bg-emerald-50 ring-1 ring-emerald-200' : ''"
              :aria-pressed="chosen?.ascensions === c.ascensions ? 'true' : 'false'"
              :aria-label="`${plural(c.ascensions, 'ascension')}: ${valueLabel(c)}, ${behindLabel(goal, c)}`"
              data-testid="top-routes-bar"
              :data-count="c.ascensions"
              :data-best="c.best ? 'true' : undefined"
              @click="selected = c.ascensions"
            >
              <span class="text-slate-600">{{ plural(c.ascensions, 'ascension') }}</span>
              <span class="relative block h-2 rounded-full bg-slate-200" aria-hidden="true">
                <span
                  class="absolute top-1/2 block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                  :class="c.best ? 'bg-emerald-600' : 'bg-slate-400'"
                  :style="{ left: `${dotAt(c)}%` }"
                ></span>
              </span>
              <span class="break-words text-right tabular-nums" :class="c.best ? 'font-bold text-emerald-800' : 'text-slate-600'">{{
                goal === 'date' ? `${c.te} TE` : behindLabel(goal, c)
              }}</span>
            </button>
          </li>
        </ul>
        <div v-if="chosen" class="space-y-1.5 rounded-lg border border-slate-200 p-3" data-testid="top-routes-chosen">
          <p class="break-words text-body text-slate-700 tabular-nums">
            <span class="font-bold">{{ plural(chosen.ascensions, 'ascension') }}</span>
            <template v-if="chosen.best"> (the best)</template>: <span class="font-bold">{{ chosen.chain.join(' ') }}</span>
          </p>
          <p class="break-words text-small text-slate-600 tabular-nums">
            {{ whenLine(chosen) }}<template v-if="!chosen.best"> · {{ behindLabel(goal, chosen) }}</template>
          </p>
          <p v-if="!chosen.hasLegs" class="text-small text-slate-500">
            Its time for each ascension wasn't kept; Simulate this plan works it out again.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              :class="SECONDARY_BUTTON"
              :disabled="busy"
              :aria-label="`Simulate this plan: ${chosen.chain.join(' ')}`"
              data-testid="top-route-simulate"
              @click="emit('simulate', [...chosen.chain])"
            >
              Simulate this plan
            </button>
            <FollowButton
              v-if="canFollow(chosen)"
              primary
              :chain="chosen.chain"
              :goal-key="follow!.goalKey"
              from="saved"
              :source="follow!.source"
              :finish="chosen.finish"
              :end-t-e="chosen.te"
              :plan-start="follow!.planStart"
              :deadline="deadline ?? null"
            />
          </div>
        </div>
      </section>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import FollowButton from '../FollowButton.vue';
import { SECONDARY_BUTTON } from './resultCardStyle';
import { plural } from '@/lib/format';
import { compactDuration } from '@/lib/duration';
import { showDateTime } from '@/lib/displayTime';
import type { ResultFollow } from '@/lib/follow';
import { behindLabel, bestPerCount, topN, type PricedRoute, type RankedRoute, type TopGoal } from '@/lib/topRoutes';

const props = withDefaults(
  defineProps<{
    goal: TopGoal;
    /** The priced routes, read only while open (lib/topRoutes.ts `PricedRoute`). */
    routes: () => readonly PricedRoute[];
    zone: string;
    /** Highest TE by a date's date: each route's spare, and Follow's. */
    deadline?: number | null;
    /** The finished result's goal, source and plan start for Follow this route; null: no Follow buttons. */
    follow?: Pick<ResultFollow, 'goalKey' | 'source' | 'planStart'> | null;
    /** Which routes may be followed (By a date: only one that makes the date). Default: every one. */
    followable?: ((r: RankedRoute) => boolean) | null;
    busy?: boolean;
    /** Open from the start (specs and screenshots; the screens leave it closed). */
    open?: boolean;
  }>(),
  { deadline: null, follow: null, followable: null, busy: false, open: false }
);
const emit = defineEmits<{ simulate: [chain: number[]] }>();

const isOpen = ref(props.open);
function onToggle(e: Event): void {
  isOpen.value = (e.target as HTMLDetailsElement).open;
}

const all = computed(() => (isOpen.value ? props.routes() : []));
const top = computed(() => topN(all.value, props.goal, 5));
const perCount = computed(() => bestPerCount(all.value, props.goal));

/** The chart row picked; until one is, the best's. */
const selected = ref<number | null>(null);
const chosen = computed(
  () => perCount.value.find(c => c.ascensions === selected.value) ?? perCount.value.find(c => c.best) ?? null
);

function canFollow(r: RankedRoute): boolean {
  return !!props.follow && (!props.followable || props.followable(r));
}

function when(t: number): string {
  return showDateTime(t, props.zone, undefined, { dateOnlyWhenFar: true });
}
/** Fastest: "Finishes Feb 10, 2027, 3:00 PM"; By a date: "312 TE, reached ..., 27h to spare". */
function whenLine(r: RankedRoute): string {
  if (props.goal === 'fastest') return `Finishes ${when(r.finish)}`;
  const spare = props.deadline ? props.deadline - r.finish : NaN;
  return `${r.te} TE, reached ${when(r.finish)}${Number.isFinite(spare) && spare >= 0 ? `, ${compactDuration(spare)} to spare` : ''}`;
}
function valueLabel(r: RankedRoute): string {
  return props.goal === 'date' ? `${r.te} TE` : `finishes ${when(r.finish)}`;
}

/** Where the dot sits, 4% to 96% of the track: Fastest by finish (sooner left), By a date by TE (higher right). */
function dotAt(r: RankedRoute): number {
  const v = (x: RankedRoute) => (props.goal === 'date' ? x.te : x.finish);
  const vals = perCount.value.map(v);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const f = hi > lo ? (v(r) - lo) / (hi - lo) : 0;
  return Math.round((4 + f * 92) * 10) / 10;
}
</script>
