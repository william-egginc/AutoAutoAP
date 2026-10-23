<!--
  My runs' Right now card (spec myruns-now v3, section 2), from a SAVED plan only (composables/useNowPage.ts):
  the egg the save is on, how the save compares with the plan, the next step, the gear, the next events with
  their dates, times and distances, and the whole route folded. The plan is the instant answer kept after Check
  exactly (for this save; else the same save under an older setup; else an earlier save's), so its times are
  the simulator's. Without one the card says so and opens a screen that works one out; nothing is worked out here.
  Which plan (Jordan, 16 Oct): a switch at the top picks the goal (Race to 490 | Egg Day 2027 | By a date), the one
  checked last by default (lib/planGoals.ts); everything below follows it. The header names the route followed,
  the ascension the save is in highlighted, the ones already passed greyed.
  16 Oct 2026: not on virtue yet (lib/onVirtue.ts, the test "When should I start?" uses), the card says so and leads
  with "When should I start?"; no Next step, no events, no calendar, only each goal's saved plan as "If you start
  <date>: …" (lib/nowStart.ts). On virtue, a badge in the corner says Building or Producing with the rate
  (lib/nowPhase.ts), and "Recalculate" opens the goal's screen with the save and runs Check exactly there
  (lib/recalc.ts): this card still works nothing out.
  "Follow this route" (lib/follow.ts): a route the player picked for the goal (on the instant answer, a saved answer or
  run, a board row, or typed in the box under the route line) replaces the planner's pick: the route line, the events,
  the timeline and the calendar text follow it, priced from a save's Check exactly (lib/followPrice.ts). Priced on an
  older save, it says so; not priced, it says so and offers "Price it ›" (Recalculate with the route attached) and
  "Simulate it ›" (Single run). "Use the checked route ›" goes back to the planner's pick.
  INSTANT FIRST (part B, wireframes/price-route-v2 R1 and R2, 23 Oct 2026; there is no Check exactly any more): the plan
  is the instant answer's ("from the instant answer": times rounded to the hour, no calendar buttons, a "run Fast" link
  that only opens the panel) until a Fast, Exact or Custom result for the same goal takes over (lib/searchPlan.ts: it
  makes the date, or finishes sooner): "from your Fast run, on your account", exact times, calendar Add buttons and
  "Go back to the instant answer". A result that doesn't take over is named in one line. Recalculate is "Run Fast"
  (lib/recalc.ts): the goal's screen with Fast selected.
  FOLLOWED ROUTE SAVED ONLINE (23 Oct 2026, lib/followCloud.ts): a followed route is never replaced by a new result; a
  newer, better one is asked about (BetterRoutePrompt.vue: "Follow it" / "Keep mine"). "Earlier versions"
  (FollowHistory.vue) lists the last 5 saved for the goal, each with Restore. A route read back from online that was
  set with other hours or another simulator says so in one quiet line.
-->
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" data-testid="now-card">
    <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
      <div class="min-w-0 flex flex-wrap items-baseline gap-x-3">
        <p class="text-[11px] font-black uppercase tracking-widest text-slate-500">Right now</p>
        <p v-if="card" class="text-[12px] text-slate-500" data-testid="now-calculated">
          Plan for {{ followName }} calculated {{ calculatedWhen }} ({{ howText }})<template
            v-if="card.pricedWith"
            >{{ ' ' }}· <span data-testid="now-priced-with">{{ card.pricedWith }}</span></template
          >
          · from your save of {{ planSaveWhen }}
        </p>
      </div>
    </div>
    <!-- Which plan: a radiogroup, one option per goal (lib/planGoals.ts goalOptions); arrows move and pick. -->
    <div
      v-if="goals && goals.length"
      role="radiogroup"
      aria-label="Which plan"
      class="flex flex-wrap gap-2"
      data-testid="now-goal-switch"
      @keydown="onSwitchKey"
    >
      <button
        v-for="(g, i) in goals"
        :key="g.key"
        :ref="el => (radios[i] = el as HTMLButtonElement | null)"
        type="button"
        role="radio"
        :aria-checked="g.key === selectedGoal ? 'true' : 'false'"
        :tabindex="g.key === selectedGoal || (!selectedGoal && i === 0) ? 0 : -1"
        class="min-h-[44px] min-w-[44px] rounded-xl border px-3 py-1.5 text-left leading-tight"
        :class="g.key === selectedGoal ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
        :data-testid="`now-goal-${g.key}`"
        :data-state="g.state"
        @click="emit('select', g.key)"
      >
        <span class="block text-[13px] font-bold">{{ g.label }}</span>
        <span class="block text-[11px]" :class="g.state === 'plan' ? 'text-slate-500' : 'text-slate-400'">{{ optionSub(g) }}</span>
      </button>
    </div>

    <!-- The route followed: the ascension the save is in highlighted, the stops passed greyed; wraps. -->
    <p v-if="shownChain.length" class="text-[13px] text-slate-700 break-words" data-testid="now-chain">
      <template v-if="notOnVirtue">If you start then:{{ ' ' }}</template>Following<template v-for="(s, i) in stops" :key="i"
        >{{ i ? ' → ' : ' '
        }}<span
          :class="
            s.state === 'now'
              ? 'font-black text-indigo-800 underline decoration-indigo-500 decoration-2 underline-offset-2'
              : s.state === 'passed'
                ? 'text-slate-400'
                : ''
          "
          :aria-current="s.state === 'now' ? 'step' : undefined"
          :data-stop="s.state"
          >{{ s.te }}</span
        ></template
      >{{ ' ' }}({{ followName }})
    </p>

    <!-- Where the plan comes from (lib/searchPlan.ts): the instant answer or a search's result on the account. -->
    <div v-if="card && pill && !follow" class="space-y-0.5" data-testid="now-source" :data-source="card.plan.from ? 'search' : 'instant'">
      <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-500">
        <span
          class="rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest"
          :class="card.plan.from ? 'bg-indigo-600 text-white' : 'bg-emerald-100 text-emerald-800'"
          data-testid="now-source-pill"
          >{{ pill }}</span
        >
        <span data-testid="now-source-sub">{{ pillSub }}</span>
      </p>
      <p v-if="replaceLine" class="text-[12px] text-slate-600" data-testid="now-replaces">
        {{ replaceLine }}
        <button type="button" class="font-bold text-indigo-700 underline" data-testid="now-go-back" @click="emit('goBack')">
          Go back to the instant answer
        </button>
      </p>
      <p v-else-if="backLine" class="text-[12px] text-slate-600" data-testid="now-went-back">
        {{ backLine }}
        <button type="button" class="font-bold text-indigo-700 underline" data-testid="now-use-search" @click="emit('useSearch')">
          Use your {{ card.driving?.search?.from?.level }} run
        </button>
      </p>
      <p v-else-if="keepLine" class="text-[12px] text-slate-600" data-testid="now-keeps-instant">{{ keepLine }}</p>
    </div>

    <!-- The player's own pick (lib/follow.ts): where its price came from, Price it / Simulate it, and the way back. -->
    <p v-if="follow" class="text-[12px] text-slate-600" data-testid="now-follow" :data-price="follow.price" :data-source="follow.source ?? ''">
      <span class="font-bold text-indigo-800">Following your pick</span><template v-if="followNote">{{ ' ' }}· {{ followNote }}</template
      ><template v-if="follow.missesDate">{{ ' ' }}· {{ lateMark }}</template
      ><template v-if="offerPrice"
        >{{ ' ' }}·
        <button type="button" class="font-bold text-indigo-700 underline" data-testid="now-follow-price" title="Opens the goal's screen with Fast selected; it starts when you press Find" @click="priceIt">
          Run Fast ›
        </button>
        ·
        <button type="button" class="font-bold text-indigo-700 underline" data-testid="now-follow-simulate" title="Opens Single run with this route on your save (nothing is kept for this page)" @click="emit('simulate', [...follow.chain])">
          Simulate it ›
        </button></template
      >{{ ' ' }}·
      <button type="button" class="font-bold text-indigo-700 underline" data-testid="now-follow-back" @click="emit('unfollow')">
        Use the checked route ›
      </button>
    </p>

    <!-- Saved online (lib/followCloud.ts): set elsewhere with other hours or another simulator; a save that failed. -->
    <p v-if="follow && followSetWith" class="text-[12px] text-slate-500" data-testid="now-follow-set-with">{{ followSetWith }}</p>
    <p v-if="follow && followSaveWords" class="text-[12px] text-amber-800" role="status" data-testid="now-follow-save">{{ followSaveWords }}</p>
    <!-- A newer, better result for the goal while a route is followed: asked, never swapped in (lib/searchPlan.ts). -->
    <BetterRoutePrompt
      v-if="follow && betterRoute"
      :goal-key="betterRoute.goalKey"
      :goal="betterRoute.goal"
      :deadline="betterRoute.deadline"
      :candidate="betterRoute.candidate"
      :followed-finish="betterRoute.followedFinish"
      :zone="zone"
    />
    <!-- The last 5 versions saved online for this goal, with Restore (GET /follow/history). -->
    <FollowHistory
      v-if="follow && selectedGoal"
      :goal-key="selectedGoal"
      :goal="askFor.goal"
      :deadline="askFor.deadline"
      :zone="zone"
      :now="now"
    />

    <!-- Follow another route: typed stops (lib/follow.ts parseTypedRoute). -->
    <details v-if="selectedOption && !notOnVirtue" class="text-[12px]" data-testid="now-follow-typed">
      <summary class="cursor-pointer font-semibold text-indigo-700">Follow another route</summary>
      <form class="mt-1.5 flex flex-wrap items-center gap-2" @submit.prevent="followTyped">
        <label class="sr-only" for="now-follow-input">Stops of the route</label>
        <input
          id="now-follow-input"
          v-model="typed"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :placeholder="typedHint"
          class="min-h-[44px] w-56 max-w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px]"
          data-testid="now-follow-input"
        />
        <button type="submit" class="min-h-[44px] rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-[13px] font-bold text-indigo-700 hover:bg-indigo-50">
          Follow
        </button>
        <span v-if="typedError" class="w-full text-rose-700" data-testid="now-follow-error">{{ typedError }}</span>
        <span v-else class="w-full text-slate-500">Stops split by spaces, commas or arrows; Right now follows it for {{ selectedOption.name }}.</span>
      </form>
    </details>

    <!-- A better plan of this save priced with other hours: named, never the lead (fix 22, lib/currentAnswer.ts). -->
    <p v-if="card?.secondary" class="text-[12px] text-slate-500" data-testid="now-secondary">
      {{ secondaryText }}<template v-if="card.secondary.plan.calculatedAt">
        (calculated {{ dateAt(card.secondary.plan.calculatedAt / 1000, now, zone) }})</template
      >
    </p>

    <p v-if="card?.state === 'setup-changed'" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12px] text-amber-900" data-testid="now-setup-changed">
      Your setup changed since this plan.
      <button type="button" class="font-bold underline" @click="emit('open', goalOpen)">Get the instant answer for your setup ›</button>
    </p>
    <p v-else-if="card?.state === 'older-save' && !follow" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12px] text-amber-900" data-testid="now-older-save">
      This plan was worked out from your save of {{ planSaveWhen }}, an older one than you loaded.
    </p>

    <!-- The egg. -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- The picture and its frame as FloatingStats.vue shows the current egg (lib/virtueEggs.ts eggIconPath). -->
      <div v-if="eggPicture" class="w-14 h-14 shrink-0 rounded-xl border border-slate-200/50 bg-white/50 p-1.5 shadow-inner overflow-hidden">
        <img :src="iconURL(eggPicture, 64)" :alt="eggName" class="w-full h-full object-contain" data-testid="now-egg-picture" />
      </div>
      <div class="min-w-0">
        <div class="flex flex-wrap items-start gap-x-2.5 gap-y-1">
          <p v-if="onVirtue" class="text-xl font-black text-slate-900">{{ eggName || 'Your virtue farm' }}</p>
          <p v-else-if="notOnVirtue" class="text-sm font-bold text-slate-800" data-testid="now-not-virtue">
            No virtue farm in this save, so nothing to do on a farm yet.
          </p>
          <p v-else class="text-sm font-bold text-slate-800" data-testid="now-not-virtue">
            No virtue farm in this save<template v-if="card?.plan.planStart">: the plan starts with a fresh ascension {{ dateAt(card.plan.planStart, now, zone) }}</template>.
          </p>
          <!-- The state, as a badge on the egg's own line (lib/nowPhase.ts), its rate smaller underneath. -->
          <span v-if="notOnVirtue || phaseText" class="inline-flex flex-col items-start">
            <span
              v-if="notOnVirtue"
              class="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[12px] font-bold text-amber-900"
              data-testid="now-not-virtue-pill"
              >Not on virtue yet</span
            >
            <span
              v-else-if="phaseText"
              class="rounded-full border px-2.5 py-0.5 text-[12px] font-bold"
              :class="phase!.phase === 'building' ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-emerald-300 bg-emerald-50 text-emerald-800'"
              data-testid="now-phase"
              :data-phase="phase!.phase"
              >{{ phaseText.title }}</span
            >
            <span v-if="phaseText && phaseText.rate && !notOnVirtue" class="mt-0.5 text-[11px] text-slate-500" data-testid="now-phase-rate">{{ phaseText.rate }}</span>
          </span>
        </div>
        <p class="text-[12px] text-slate-500">
          <template v-if="card && ascNow > 0">ascension {{ ascNow }} of {{ card.plan.chain.length }} · </template>
          <template v-else-if="card && card.plan.planStart && ascNow === 0">plan starts {{ dateAt(card.plan.planStart, now, zone) }} · </template>
          {{ Math.floor(teSoFar) }} TE so far
        </p>
      </div>
      <span v-if="chip" class="ml-auto rounded-full border px-2.5 py-0.5 text-[12px] font-bold" :class="CHIP[chip.tone]" data-testid="now-track">
        {{ chip.text }}
      </span>
    </div>

    <!-- Not on virtue yet: when to start, from each goal's saved plan (lib/nowStart.ts); nothing worked out here. -->
    <div v-if="notOnVirtue" class="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2" data-testid="now-start">
      <p class="text-[10px] font-black uppercase tracking-widest text-indigo-700">When to start</p>
      <ul v-if="startInfo && startInfo.length" class="mt-0.5 space-y-0.5 text-[13px] text-slate-800" data-testid="now-start-lines">
        <li v-for="l in startInfo" :key="l.key">{{ l.text }}</li>
      </ul>
      <p v-else class="text-[13px] text-slate-700" data-testid="now-start-none">{{ NOTHING_PRICED }}</p>
      <button
        type="button"
        class="mt-2 min-h-[44px] rounded-xl bg-indigo-600 px-4 py-2 text-[14px] font-bold text-white hover:bg-indigo-700"
        data-testid="now-when-start"
        @click="emit('startTimes', card?.plan.chain.length ? [...card.plan.chain] : null)"
      >
        When should I start? ›
      </button>
      <span class="block mt-1 text-[11px] text-slate-500"
        >Prices a route at every hour of the next week for this save ({{ NAMES.science }} › {{ NAMES.start }}).</span
      >
    </div>

    <!-- Next step. -->
    <div v-else class="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2" data-testid="now-next">
      <p class="text-[10px] font-black uppercase tracking-widest text-indigo-700">Next step</p>
      <template v-if="card">
        <p v-if="nextText" class="text-[13px] text-slate-800">
          <b>{{ nextText }}</b>
          <span v-if="nextEvent && !rounded" class="ml-1.5 align-middle"><CalendarButton :events="[nextCal!]" label="Add to calendar" /></span>
        </p>
        <p v-else class="text-[13px] text-slate-700">Nothing left in this plan: work out a new one.</p>
        <p v-if="track?.kind === 'behind'" class="mt-1 text-[12px] text-rose-800" data-testid="now-behind">
          {{ paceBadge }}.
          <button type="button" class="font-bold underline" @click="emit('recalc', recalcRequest)">Run Fast ›</button>
        </p>
      </template>
      <p v-else-if="follow" class="text-[13px] text-slate-700" data-testid="now-follow-next">
        No timeline for your route on this save yet: Simulate it › shows its times in Single run, or Run Fast › for a
        result on your account.
      </p>
      <!-- By a date (Egg Day too): plans kept, none in time (lib/eggDayRule.ts): said plainly, the nearest shown, marked. -->
      <p v-else-if="selectedOption?.state === 'late'" class="text-[13px] text-slate-700" data-testid="now-no-route-in-time">
        {{ lateWords }}<template v-if="selectedOption.late?.chain"
          >{{ ' ' }}<span class="font-mono" data-testid="now-late-route">{{ selectedOption.late.chain.join(' ') }}</span> · {{ lateMark }}</template
        >
        ·
        <button type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline" data-testid="now-work-it-out" @click="emit('open', selectedOption.open)">
          Work it out ›
        </button>
      </p>
      <p v-else-if="selectedOption" class="text-[13px] text-slate-700" data-testid="now-no-plan">
        {{ selectedOption.label }}: {{ emptyGoalWords(selectedOption.state) }} ·
        <button type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline" data-testid="now-work-it-out" @click="emit('open', selectedOption.open)">
          Work it out ›
        </button>
        <span class="block mt-0.5 text-[11px] text-slate-500"
          >The instant answer for a goal is kept for a day after its screen works it out; a Fast, Exact or Custom result
          for it takes over when it is better.</span
        >
      </p>
      <p v-else class="text-[13px] text-slate-700" data-testid="now-no-plan">
        No plan with its times is saved for this save yet: the instant answer for a goal is kept for a day after its
        screen works it out.
        <button type="button" class="font-bold text-indigo-700 underline" @click="emit('open', { auto: 'fastest', depth: 'smart', target: 490 })">
          Work out my plan ›
        </button>
      </p>
    </div>

    <!-- Run Fast (was Recalculate): the goal's screen with this save and Fast selected (lib/recalc.ts). -->
    <div v-if="card && !notOnVirtue" class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="now-recalc">
      <button
        type="button"
        class="min-h-[44px] rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-[13px] font-bold text-indigo-700 hover:bg-indigo-50"
        data-testid="now-recalc-button"
        @click="emit('recalc', recalcRequest)"
      >
        {{ recalcLabel }}
      </button>
      <span class="text-[11px] text-slate-500">{{ recalcLine }}</span>
    </div>

    <GearBlock
      v-if="gear"
      :equipped="gear.equipped"
      :earnings="gear.earnings"
      :production="gear.production"
      :clothed-equipped="gear.clothedEquipped"
      :clothed-earnings="gear.clothedEarnings"
      :what-if="gear.whatIf"
      :what-if-when="gear.whatIf ? dateAt(gear.whatIf.at / 1000, now, zone) : ''"
      :goal="card?.goal.goal ?? 'fastest'"
      :match="gear.match ?? null"
    />

    <template v-if="card">
      <EventsTable
        v-if="shownEvents.length && !notOnVirtue"
        class="mt-3"
        :events="shownEvents"
        :goal="card.goal.goal"
        :goal-name="goalName"
        :now="now"
        :zone="zone"
        :save-when="planSaveWhen"
        :calculated-when="calculatedWhen"
        :following="following"
        :rounded="rounded"
        @run-fast="emit('recalc', recalcRequest)"
      />
      <details class="mt-2" data-testid="now-timeline">
        <summary class="cursor-pointer text-[13px] font-semibold text-indigo-700">
          Full timeline (every ascension, each egg's first and last shift)
        </summary>
        <div class="mt-2">
          <RouteTimeline
            :chain="card.plan.chain"
            :legs="card.plan.legs"
            :zone="zone"
            :no-legs-text="rounded ? NO_LEGS_INSTANT : NO_LEGS_KEPT"
          />
        </div>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { iconURL } from 'lib';
import CalendarButton from './CalendarButton.vue';
import FollowHistory from './FollowHistory.vue';
import BetterRoutePrompt from '../BetterRoutePrompt.vue';
import type { FollowPrompt, RouteFinish } from '@/lib/searchPlan';
import EventsTable from './EventsTable.vue';
import GearBlock from './GearBlock.vue';
import RouteTimeline from '../auto/RouteTimeline.vue';
import { dateAt, relativeWords } from '@/lib/eventWhen';
import { chainStops, followingLine, nextStepText } from '@/lib/nowWords';
import { emptyGoalWords, nextGoalIndex, type GoalKey, type GoalOption } from '@/lib/planGoals';
import { type PlanEvent, type TrackState } from '@/lib/nowPlan';
import { paceWords } from '@/lib/planPace';
import { planCalEvent } from '@/lib/calendarEvents';
import { secondaryLine } from '@/lib/currentAnswer';
import { formatDate } from '@/lib/leaderboardRank';
import { NAMES } from '@/lib/siteNav';
import { eggIconPath, virtueEggName } from '@/lib/virtueEggs';
import type { CardPlan } from '@/composables/useNowPage';
import type { MyRunsOpen } from '@/lib/myRunsDashboard';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SnapWhatIf } from '@/search/instantSnapshot';
import type { SetMatch } from '@/lib/gearMatch';
import { phaseWords, type PhaseBadge } from '@/lib/nowPhase';
import { NOTHING_PRICED, type StartLine } from '@/lib/nowStart';
import { askGoal, recalcButton, recalcWords, type RecalcRequest } from '@/lib/recalc';
import { keepWords, replaceWords, sourcePill } from '@/lib/searchPlan';
import { deadlineKind } from '@/lib/eggDayRule';
import { parseTypedRoute } from '@/lib/follow';
import { lateMarker, noRouteInTimeWords } from '@/lib/eggDayRule';
import type { FollowCard } from '@/composables/useNowPage';

const props = defineProps<{
  card: CardPlan | null;
  onVirtue: boolean | null;
  currentEgg: string | null;
  teSoFar: number;
  ascNow: number;
  track: TrackState | null;
  events: PlanEvent[];
  shownEvents: PlanEvent[];
  gear: {
    equipped: EquippedArtifact[] | null;
    earnings: EquippedArtifact[] | null;
    production: EquippedArtifact[] | null;
    clothedEquipped: number | null;
    clothedEarnings: number | null;
    whatIf: SnapWhatIf | null;
    match?: SetMatch;
  } | null;
  now: number;
  zone: string;
  saveSeconds: number;
  eggDayYear: number;
  /** The switch's options (lib/planGoals.ts); absent: no switch. */
  goals?: GoalOption[];
  selectedGoal?: GoalKey | null;
  /** The corner badge (lib/nowPhase.ts); null or absent: none. */
  phase?: PhaseBadge | null;
  /** Not on virtue yet: each goal's saved plan as "If you start <date>: …" (lib/nowStart.ts). */
  startInfo?: StartLine[];
  /** The route the player follows for this goal (lib/follow.ts) and how it is priced; null or absent: none. */
  follow?: FollowCard | null;
  /** With a followed route: the planner's newer pick to offer when better (useNowPage `betterRoute`). */
  betterRoute?: {
    goalKey: string;
    goal: 'fastest' | 'date';
    deadline: number | null;
    candidate: RouteFinish & { chain: number[]; at: number; source: FollowPrompt['source']; planStart: number | null };
    followedFinish: RouteFinish | null;
  } | null;
  /** "This route was set with a different hours window / simulator version." ('' or absent: none). */
  followSetWith?: string;
  /** The last Follow press couldn't be saved online: why, in words. */
  followSaveWords?: string;
}>();
const emit = defineEmits<{
  open: [to: MyRunsOpen];
  select: [key: GoalKey];
  /** "When should I start?": Science › When should I start? for this save, on this route when there is one. */
  startTimes: [chain: number[] | null];
  /** "Run Fast": open the goal's screen with the save and Fast selected (App, lib/recalc.ts). */
  recalc: [req: RecalcRequest];
  /** "Go back to the instant answer" (useNowPage `goBackToInstant`). */
  goBack: [];
  /** "Use your Fast run": undo going back. */
  useSearch: [];
  /** A route typed in "Follow another route": follow it for this goal. */
  follow: [chain: number[]];
  /** "Use the checked route ›": back to the planner's pick for this goal. */
  unfollow: [];
  /** "Simulate it ›": the followed route in Single run (search/simulateRoute.ts). */
  simulate: [chain: number[]];
}>();

/** Not on virtue yet (null: not known, the card stays as it is). */
const notOnVirtue = computed(() => props.onVirtue === false);
const phaseText = computed(() => (props.phase ? phaseWords(props.phase) : null));

const CHIP = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  bad: 'border-rose-300 bg-rose-50 text-rose-800',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  plain: 'border-slate-200 bg-slate-50 text-slate-600',
} as const;

const eggName = computed(() => virtueEggName(props.currentEgg));
const eggPicture = computed(() => eggIconPath(props.currentEgg));
const goalName = computed(() =>
  props.card?.goal.goal === 'date'
    ? (props.card.name ?? `Egg Day ${props.eggDayYear}`)
    : `Fastest to ${props.card?.goal.target ?? 490}`
);
/** The goal in the route line and the calendar: "Race to 490", "Egg Day 2027", "By Mar 3, 2027". */
const followName = computed(() => {
  const name =
    props.card?.name ??
    (props.card ? (props.card.goal.goal === 'fastest' ? `Race to ${props.card.goal.target}` : goalName.value) : (selectedOption.value?.name ?? ''));
  return props.follow ? `${name} · your pick` : name;
});
/** The route on the line: the plan's, else (a followed route not priced yet) the followed one. */
const shownChain = computed(() => props.card?.plan.chain ?? props.follow?.chain ?? []);
const stops = computed(() => chainStops(shownChain.value, props.card ? props.ascNow : 0));
/** "Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)": the same words go into each calendar event. */
const following = computed(() => followingLine(props.card?.plan.chain ?? [], followName.value));

// ------------------------------------------------------------------------------- following your pick
/** Where the followed route's price came from, in words. */
const followNote = computed(() => {
  const f = props.follow;
  if (!f) return '';
  if (f.price === 'none') return 'not priced on this save yet';
  if (f.price === 'finish' && f.finish) {
    const lands = dateAt(f.finish.end, props.now, props.zone);
    return `checked ${dateAt(f.finish.at / 1000, props.now, props.zone)}: lands ${lands}, no timeline kept`;
  }
  if (f.source === 'older-save' && f.pricedSave) return `priced on your save of ${dateAt(f.pricedSave, props.now, props.zone)}, may have drifted`;
  return '';
});
/** "Price it ›" and "Simulate it ›": whenever the route has no Check exactly times of this save. */
const offerPrice = computed(() => !!props.follow && (props.follow.price !== 'exact' || props.follow.source === 'older-save'));
/** The goal asked for: the card's, else the selected option's (a followed route with no plan yet). */
const askFor = computed<{ goal: 'fastest' | 'date'; target: number; deadline: number | null }>(() => {
  if (props.card) return props.card.goal;
  const o = selectedOption.value;
  if (o && o.kind !== 'race' && o.deadline) return { goal: 'date', target: 0, deadline: o.deadline };
  const t = Number(/^fastest-(\d+)$/.exec(o?.key ?? '')?.[1] ?? 490);
  return { goal: 'fastest', target: t, deadline: null };
});
/** "Run Fast ›" beside a followed route not priced on this save: the goal's screen with Fast selected (lib/recalc.ts). */
function priceIt(): void {
  if (!props.follow) return;
  emit('recalc', recalcRequest.value);
}
const typed = ref('');
const typedError = ref('');
const typedHint = computed(() => (askFor.value.goal === 'fastest' ? `e.g. 197 222 247 ${askFor.value.target}` : 'e.g. 197 222 247'));
function followTyped(): void {
  const r = parseTypedRoute(typed.value, {
    currentTE: props.teSoFar,
    target: askFor.value.goal === 'fastest' ? askFor.value.target : null,
  });
  if ('error' in r) {
    typedError.value = r.error;
    return;
  }
  typedError.value = '';
  typed.value = '';
  emit('follow', r.chain);
}

// ------------------------------------------------------------------------------------- the switch
const selectedOption = computed(() => props.goals?.find(g => g.key === props.selectedGoal) ?? null);
/** "No route finishes before Egg Day starts. The nearest is 7 hours after." (lib/eggDayRule.ts); `lateMark` also marks
 *  a followed route that lands late (the player's own pick: kept and marked, never the planner's). */
const lateKind = computed(() => (selectedOption.value?.kind === 'eggday' ? 'eggday' : 'date'));
const lateWords = computed(() => noRouteInTimeWords(lateKind.value, selectedOption.value?.late?.seconds ?? null));
const lateMark = computed(() => lateMarker(lateKind.value));
const radios = ref<(HTMLButtonElement | null)[]>([]);
function optionSub(g: GoalOption): string {
  if (g.state === 'late') return 'no route in time';
  if (g.state !== 'plan') return g.state === 'answer-only' ? 'no saved plan with its times yet' : 'no saved plan yet';
  const day = g.kind === 'date' && g.deadline ? `${dateAt(g.deadline, props.now, props.zone).replace(/ at .*$/, '')} · ` : '';
  return g.calculatedAt ? `${day}calculated ${relativeWords(g.calculatedAt / 1000 - props.now)}` : `${day}saved plan`;
}
/** Arrow keys, Home and End move the pick and the focus (a radiogroup). */
function onSwitchKey(ev: KeyboardEvent): void {
  const list = props.goals ?? [];
  const at = Math.max(0, list.findIndex(g => g.key === props.selectedGoal));
  const to = nextGoalIndex(ev.key, at, list.length);
  if (to == null) return;
  ev.preventDefault();
  emit('select', list[to].key);
  void nextTick(() => radios.value[to]?.focus());
}
const calculatedWhen = computed(() => {
  const at = props.card ? props.card.plan.calculatedAt / 1000 : 0;
  return at ? `${dateAt(at, props.now, props.zone)} (${relativeWords(at - props.now)})` : '';
});
/** The save the plan was made from: its own (an older save's), else the loaded one. */
const planSaveWhen = computed(() => dateAt(props.card?.plan.meta?.backupTime || props.saveSeconds, props.now, props.zone));
const secondaryText = computed(() => {
  const sec = props.card?.secondary;
  if (!sec) return '';
  return secondaryLine(sec.label, sec.plan, t => formatDate(t * 1000, props.zone, { month: 'short', day: 'numeric', year: 'numeric' }));
});
/** The chip: lib/planPace.ts's words, the same as My runs' saved plans ("3 hours behind, as of 3:42 pm"). */
const pace = computed(() => (props.track ? paceWords(props.track, props.now, props.zone) : null));
const chip = computed(() => (pace.value?.text ? { tone: pace.value.tone, text: pace.value.text } : null));
const paceBadge = computed(() => pace.value?.badge ?? '');
const nextText = computed(() =>
  props.card ? nextStepText(props.events, props.card.goal.goal, props.now, props.zone, rounded.value) : ''
);
/** The calendar button's event: the first one ahead (a step not done yet is already due: nothing to add). */
const nextEvent = computed(() => props.events.find(e => !e.past && !e.notDone && e.kind !== 'goal') ?? null);
const nextCal = computed(() =>
  nextEvent.value
    ? planCalEvent(nextEvent.value, {
        eggName: virtueEggName,
        saveWhen: planSaveWhen.value,
        calculatedWhen: calculatedWhen.value,
        following: following.value,
      })
    : null
);
const goalOpen = computed<MyRunsOpen>(() =>
  selectedOption.value
    ? selectedOption.value.open
    : props.card?.goal.goal === 'date'
    ? { auto: 'by-date', byDate: { eggDay: true } }
    : { auto: 'fastest', depth: 'smart', target: props.card?.goal.target ?? 490 }
);
const recalcRequest = computed<RecalcRequest>(() => ({
  open: goalOpen.value,
  goal: askGoal(askFor.value),
}));
const recalcLine = computed(() => recalcWords(goalOpen.value));
const recalcLabel = computed(() => recalcButton(props.card?.plan.from?.level === 'Fast'));

// ------------------------------------------------------------------- instant answer or search result
/** The instant answer's plan (not a search's, not an older snapshot's Check exactly): times rounded, no calendar. */
const rounded = computed(() => !!props.card && !props.card.plan.exact);
const NO_LEGS_INSTANT = 'The instant answer keeps when each ascension ends, not each shift: run Fast for the shifts on your account.';
const NO_LEGS_KEPT = "This plan was kept without each ascension's shifts (it was too big to keep whole): open its screen for them.";
/** "(instant answer)", "(Fast run)", "(Check exactly)" for an older snapshot's. */
const howText = computed(() => {
  const p = props.card?.plan;
  if (!p) return '';
  return p.from ? `${p.from.level} run` : p.exact ? 'simulator check' : 'instant answer';
});
const pill = computed(() => {
  const p = props.card?.plan;
  if (!p || (p.exact && !p.from)) return '';
  return sourcePill(p.from?.level ?? null);
});
/** "done Oct 22 at 4:47 pm, your save of Oct 22 at 11:03 am, priced with your hours …" / "worked out ahead of time;
 *  times rounded to the hour". */
const pillSub = computed(() => {
  const p = props.card?.plan;
  if (!p) return '';
  if (!p.from) return 'worked out ahead of time; times rounded to the hour';
  const done = dateAt(p.from.at / 1000, props.now, props.zone);
  return `done ${done}, your save of ${planSaveWhen.value}${props.card?.pricedWith ? `, ${props.card.pricedWith}` : ''}`;
});
const replaceLine = computed(() => {
  const d = props.card?.driving;
  if (!d?.search || !d.takeover || props.card?.plan !== d.search || !d.instant) return '';
  return replaceWords(d.takeover, d.search, d.instant);
});
const backLine = computed(() => {
  const d = props.card?.driving;
  if (!d?.search?.from || !d.wentBack) return '';
  return `You went back from your ${d.search.from.level} run (done ${dateAt(d.search.from.at / 1000, props.now, props.zone)}).`;
});
const keepLine = computed(() => {
  const d = props.card?.driving;
  if (!d?.search?.from || !d.takeover || d.wentBack || props.card?.plan === d.search) return '';
  const kind = props.card?.goal.deadline ? deadlineKind(props.card.goal.deadline) : 'date';
  return keepWords(d.takeover, d.search.from.level, d.search, d.instant, kind);
});
</script>
