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
  older save, it says so; not priced, it says so. ONE PATH PER CARD (25 Oct 2026): the follow line's "Run Fast ›",
  "Simulate it ›" and "Use the planner's route ›" and the card's Run Fast button are gone (Try next has the runs); the
  way back is one quiet "Stop following: use the planner's route" under Earlier versions.
  INSTANT FIRST (part B, wireframes/price-route-v2 R1 and R2, 23 Oct 2026; there is no Check exactly any more): the plan
  is the instant answer's ("from the instant answer": times rounded to the hour, no calendar buttons, a "run Fast" link
  that only opens the panel) until a Fast, Exact or Custom result for the same goal takes over (lib/searchPlan.ts: By a
  date, it makes the date; Fastest, always, since the instant answer's finish is an estimate, math review 24 Oct
  2026): "from your Fast run, on your account", exact times, calendar Add buttons and
  "Go back to the instant answer". A result that doesn't take over is named in one line. Recalculate is "Run Fast"
  (lib/recalc.ts): the goal's screen with Fast selected.
  FOLLOWED ROUTE SAVED ONLINE (23 Oct 2026, lib/followCloud.ts): a followed route is never replaced by a new result; a
  newer, better one is asked about (BetterRoutePrompt.vue: "Follow it" / "Keep mine"). "Earlier versions"
  (FollowHistory.vue) lists the last 5 saved for the goal, each with Restore. A route read back from online that was
  set with other hours or another simulator says so in one quiet line.
  A FOLLOWED ROUTE KEEPS ITS TIMELINE (23 Oct 2026, lib/followPrice.ts step 0): following this save's instant answer's own
  route keeps the instant timeline and its pill ("from the instant answer", rounded, no calendar, "run Fast"); following
  this save's Fast, Exact or Custom result keeps that result's ("from your Fast run, on your account", exact times,
  calendar). Only a route that is neither says "not priced on this save yet".
  EVERY ASCENSION (26 Oct 2026): the table lists each ascension's prestige (one that waits for the hours or past a
  no-prestige day says so); the ascension you are in is simulated on the save in the background ("Working out your
  shifts…", lib/followSim.ts) and its exact shifts replace the table's; and the Full timeline of a plan with no exact legs lists A1..An with each one's shifts from
  the instant answer (AscensionList.vue).
  A FOLLOWED ROUTE ALWAYS HAS A TIMELINE (24 Oct 2026, lib/followEstimate.ts): that route is then priced on the instant
  answer's data (the same pricing the instant answer uses, in a route worker) and its steps shown "estimated from the
  instant answer's data (times rounded to the hour)"; while it is worked out the Next step says so. Only when it can't be
  (no instant answer of this save, a route past the data, a failure) does the old "Simulate it ›" line show.
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
        <span class="block text-[11px]" :class="g.state === 'plan' || g.follow ? 'text-slate-500' : 'text-slate-400'" :data-follow="g.follow?.times">{{ optionSub(g) }}</span>
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
    <div v-if="card && pill" class="space-y-0.5" data-testid="now-source" :data-source="card.plan.from ? 'search' : 'instant'">
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

    <!-- The player's own pick (lib/follow.ts) and where its price came from. One path per card (25 Oct 2026): no Run
         Fast, Simulate it or way back on this line; the way back is the quiet line under Earlier versions. -->
    <p v-if="follow" class="text-[12px] text-slate-600" data-testid="now-follow" :data-price="follow.price" :data-source="follow.source ?? ''">
      <span class="font-bold text-indigo-800" data-testid="now-follow-whose">{{ followWhose }}</span><template v-if="followNote">{{ ' ' }}· {{ followNote }}</template
      ><template v-if="follow.missesDate">{{ ' ' }}· {{ lateMark }}</template>
    </p>

    <!-- Saved online (lib/followCloud.ts): set elsewhere with other hours or another simulator; a save that failed. -->
    <p v-if="follow && followSetWith" class="text-[12px] text-slate-500" data-testid="now-follow-set-with">{{ followSetWith }}</p>
    <!-- Not saved online (a press that didn't get through, its retry too): said, with "Save it online" (stores/follow.ts
         `notSaved`). -->
    <p v-if="follow && (followSaveWords || followNotSaved)" class="text-[12px] text-amber-800" role="status" :data-testid="followSaveWords ? 'now-follow-save' : 'now-follow-unsaved'">
      {{ followSaveWords || NOT_SAVED_WORDS }}<template v-if="followNotSaved">{{ ' ' }}</template>
      <button
        v-if="followNotSaved"
        type="button"
        class="inline-flex min-h-[44px] items-center font-bold text-indigo-700 underline sm:min-h-0"
        data-testid="now-follow-save-now"
        @click="emit('saveOnline')"
      >
        Save it online ›
      </button>
    </p>
    <!-- The routes saved online couldn't be read on this load: amber with Retry, never red, as following still works in
         this browser (UX review, 25 Oct 2026). -->
    <p v-if="followCloudUnreachable" class="text-[12px] text-amber-800" role="status" data-testid="now-follow-cloud-unreachable">
      {{ UNREACHABLE_NOTE }} Following still works in this browser.{{ ' ' }}
      <button
        type="button"
        class="inline-flex min-h-[44px] items-center font-bold text-indigo-700 underline sm:min-h-0"
        data-testid="now-follow-cloud-retry"
        @click="emit('retryCloud')"
      >
        Retry ›
      </button>
    </p>
    <!-- A newer, better result for the goal while a route is followed: asked, never swapped in (lib/searchPlan.ts). -->
    <BetterRoutePrompt
      v-if="follow && betterRoute"
      :goal-key="betterRoute.goalKey"
      :goal="betterRoute.goal"
      :deadline="betterRoute.deadline"
      :candidate="betterRoute.candidate"
      :followed-finish="betterRoute.followedFinish"
      :followed-priced="!!betterRoute.followedPriced"
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
    <!-- The only way to stop following (25 Oct 2026: off the follow line, quiet, under Earlier versions). -->
    <p v-if="follow" class="text-[11px] text-slate-500" data-testid="now-follow-back-line">
      <button type="button" class="inline-flex min-h-[44px] items-center underline hover:text-slate-700 sm:min-h-0" data-testid="now-follow-back" @click="emit('unfollow')">
        Stop following: use the planner's route
      </button>
    </p>

    <!-- Follow another route: typed stops (lib/follow.ts parseTypedRoute). -->
    <details v-if="selectedOption && !notOnVirtue" class="text-[12px]" data-testid="now-follow-typed">
      <summary class="min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0 cursor-pointer font-semibold text-indigo-700" data-testid="now-follow-typed-summary">Follow another route</summary>
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
      Setup changed since this plan.
      <button type="button" class="font-bold underline" @click="emit('open', goalOpen)">Get the instant answer for your Setup ›</button>
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
      <!-- A followed route with no timeline: the ascension you are in, simulated on your save, still gives the next
           action and the first shifts (26 Oct 2026); the lines below say why the rest has no times. -->
      <template v-if="!card && follow && (actionText || simWorking)">
        <p v-if="actionText" class="text-[13px] text-slate-800" data-testid="now-next-action" :data-kind="nextStep!.kind">
          <b>{{ actionText }}</b>
        </p>
        <div v-if="nextShiftLines && nextShiftLines.length" class="mt-1.5" data-testid="now-next-shifts">
          <p class="text-[10px] font-black uppercase tracking-widest text-indigo-700">Next shifts</p>
          <ul class="list-none pl-0 text-[12px] text-slate-700">
            <li v-for="(l, i) in nextShiftLines" :key="i" :data-kind="l.kind" data-testid="now-next-shift">{{ shiftLineText(l) }}</li>
          </ul>
        </div>
        <p v-if="simWorking" class="mt-0.5 text-[12px] text-slate-600" role="status" data-testid="now-sim-working" :data-state="simWorking">
          <template v-if="simWorking === 'working'">Working out your shifts…<template v-if="simSlow">{{ ' ' }}(can take a few minutes)</template></template>
          <template v-else>Your shifts are worked out once the search running now ends.</template>
        </p>
      </template>
      <template v-if="card">
        <!-- The next action from the ascension you are in, simulated on your save (lib/nextAction.ts); until it is in, the
             line from the plan's events. -->
        <p v-if="actionText" class="text-[13px] text-slate-800" data-testid="now-next-action" :data-kind="nextStep!.kind">
          <b>{{ actionText }}</b>
        </p>
        <p v-else-if="nextText" class="text-[13px] text-slate-800">
          <b>{{ nextText }}</b>
          <span v-if="nextEvent && !rounded" class="ml-1.5 align-middle"><CalendarButton :events="[nextCal!]" label="Add to calendar" /></span>
        </p>
        <p v-else class="text-[13px] text-slate-700">Nothing left in this plan: work out a new one.</p>
        <p v-if="card.plan.estimated" class="mt-0.5 text-[12px] text-slate-600" data-testid="now-next-estimated">
          <template v-if="simulatedNow">The ascension you are in, simulated on your save; the rest of your route's steps, {{ ESTIMATE_WORDS }}.</template>
          <template v-else>Your route's steps, {{ ESTIMATE_WORDS }}.</template>
        </p>
        <!-- Next shifts (lib/nextAction.ts `nextShifts`): one quiet list, always shown, not interactive. -->
        <div v-if="nextShiftLines && nextShiftLines.length" class="mt-1.5" data-testid="now-next-shifts">
          <p class="text-[10px] font-black uppercase tracking-widest text-indigo-700">Next shifts</p>
          <ul class="list-none pl-0 text-[12px] text-slate-700">
            <li v-for="(l, i) in nextShiftLines" :key="i" :data-kind="l.kind" data-testid="now-next-shift">{{ shiftLineText(l) }}</li>
          </ul>
        </div>
        <!-- The ascension you are in, simulated on your save in the background (lib/followSim.ts). -->
        <p v-if="simWorking" class="mt-0.5 text-[12px] text-slate-600" role="status" data-testid="now-sim-working" :data-state="simWorking">
          <template v-if="simWorking === 'working'">Working out your shifts…<template v-if="simSlow">{{ ' ' }}(can take a few minutes)</template></template>
          <template v-else>Your shifts are worked out once the search running now ends.</template>
        </p>
        <p v-if="track?.kind === 'behind'" class="mt-1 text-[12px] text-rose-800" data-testid="now-behind">
          {{ paceBadge }}.
          <button type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold underline" data-testid="now-behind-run-fast" @click="emit('recalc', recalcRequest)">Run Fast ›</button>
        </p>
      </template>
      <p
        v-else-if="follow && (follow.estimating === 'working' || follow.estimating === 'waiting')"
        class="text-[13px] text-slate-700"
        role="status"
        data-testid="now-follow-estimating"
        :data-state="follow.estimating"
      >
        <template v-if="follow.estimating === 'working'">Working out your route's times from the instant answer's data…</template>
        <template v-else>Your route's times are worked out from the instant answer's data once the search running now ends.</template>
      </p>
      <p v-else-if="follow && follow.estimating === 'nosource'" class="text-[13px] text-slate-700" data-testid="now-follow-nosource">
        No timeline for your route yet: the instant answer hasn't been worked out for this save and setup, so there is
        nothing to estimate it from.{{ ' ' }}<button
          type="button"
          class="inline-flex min-h-[44px] items-center font-bold text-indigo-700 underline sm:min-h-0"
          data-testid="now-follow-open-screen"
          @click="emit('open', goalOpen)"
        >
          Open {{ screenName }} once so the instant answer can price it ›
        </button>
      </p>
      <p v-else-if="follow" class="text-[13px] text-slate-700" data-testid="now-follow-next" :data-estimating="follow.estimating ?? ''">
        <template v-if="follow.estimating === 'beyond'"
          >Your route goes past what the instant answer covers, so it has no estimate:{{ ' ' }}</template
        ><template v-else-if="follow.estimating === 'failed'"
          >Your route couldn't be priced on the instant answer's data:{{ ' ' }}</template
        ><template v-else>No timeline for your route on this save yet:{{ ' ' }}</template>a run from Try next, below, works
        out its times on your account.
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
        <button type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline" data-testid="now-work-out-plan" @click="emit('open', { auto: 'fastest', depth: 'smart', target: 490 })">
          Work out my plan ›
        </button>
      </p>
    </div>

    <GearBlock
      v-if="gear"
      :equipped="gear.equipped"
      :earnings="gear.earnings"
      :production="gear.production"
      :clothed-equipped="gear.clothedEquipped"
      :clothed-earnings="gear.clothedEarnings"
      :what-if="gear.whatIf"
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
      />
      <details class="mt-2" data-testid="now-timeline">
        <summary class="min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0 cursor-pointer text-[13px] font-semibold text-indigo-700" data-testid="now-timeline-summary">
          Full timeline (every ascension, each egg's first and last shift)
        </summary>
        <div class="mt-2">
          <!-- No exact legs: every ascension with the instant answer's shifts (lib/instantSteps.ts `ascensionSteps`). -->
          <AscensionList v-if="!card.plan.legs && ascensions && ascensions.length" :lines="ascensions" :zone="zone" :working="simWorking === 'working'" />
          <RouteTimeline
            v-else
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
import AscensionList from './AscensionList.vue';
import { nextActionWords, nextShiftWords, type NextAction, type NextShiftLine } from '@/lib/nextAction';
import { roundToHourIn } from '@/lib/nowWords';
import { showDateTime } from '@/lib/displayTime';
import type { AscensionStep } from '@/lib/instantSteps';
import { dateAt, dayWords, relativeWords } from '@/lib/eventWhen';
import { chainStops, followingLine, nextStepText } from '@/lib/nowWords';
import { emptyGoalWords, followNoTimesWords, followOptionWords, nextGoalIndex, type GoalKey, type GoalOption } from '@/lib/planGoals';
import { type PlanEvent, type TrackState } from '@/lib/nowPlan';
import { paceWords } from '@/lib/planPace';
import { planCalEvent } from '@/lib/calendarEvents';
import { secondaryLine } from '@/lib/currentAnswer';
import { NAMES, fastestName } from '@/lib/siteNav';
import { eggIconPath, virtueEggName } from '@/lib/virtueEggs';
import type { CardPlan } from '@/composables/useNowPage';
import type { MyRunsOpen } from '@/lib/myRunsDashboard';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SnapWhatIf } from '@/search/instantSnapshot';
import type { SetMatch } from '@/lib/gearMatch';
import { phaseWords, type PhaseBadge } from '@/lib/nowPhase';
import { NOTHING_PRICED, type StartLine } from '@/lib/nowStart';
import { askGoal, type RecalcRequest } from '@/lib/recalc';
import { keepWords, replaceWords, sourcePill } from '@/lib/searchPlan';
import { NOT_SAVED_WORDS, UNREACHABLE_NOTE } from '@/lib/followCloud';
import { ESTIMATE_WORDS } from '@/lib/followEstimate';
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
    /** Its finish here came from a priced result: an instant answer never asks (lib/searchPlan.ts `followIsPriced`). */
    followedPriced?: boolean;
  } | null;
  /** "This route was set with a different hours window / simulator version." ('' or absent: none). */
  followSetWith?: string;
  /** The last Follow press couldn't be saved online: why, in words. */
  followSaveWords?: string;
  /** The followed route isn't saved online (stores/follow.ts `notSaved`): said, with "Save it online". */
  followNotSaved?: boolean;
  /** The routes saved online couldn't be read on this load (stores/follow.ts `cloudStatus` 'unreachable'). */
  followCloudUnreachable?: boolean;
  /** Every ascension and its shifts (useNowPage `ascensions`), for the Full timeline when the plan has no exact legs. */
  ascensions?: AscensionStep[];
  /** The ascension you are in is being simulated on your save ('working'), or waits for a search (useNowPage
   *  `simWorking`); null or absent: not. */
  simWorking?: 'working' | 'waiting' | null;
  /** It has run over 20 s: "(can take a few minutes)". */
  simSlow?: boolean;
  /** The next action from the simulated ascension (useNowPage `nextStep`); null or absent: the events' line. */
  nextStep?: NextAction | null;
  /** The next 3 to 5 shifts (useNowPage `nextShiftLines`); empty or absent: none shown. */
  nextShiftLines?: NextShiftLine[];
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
  /** "Stop following: use the planner's route": back to the planner's pick for this goal. */
  unfollow: [];
  saveOnline: [];
  /** Retry reading the routes saved online (stores/follow.ts `loadCloud(true)`). */
  retryCloud: [];
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
    : fastestName(props.card?.goal.target)
);
/** The goal in the route line and the calendar: "Race to 490", "Egg Day 2027", "By Mar 3, 2027". */
const followName = computed(() => {
  const name =
    props.card?.name ??
    (props.card ? (props.card.goal.goal === 'fastest' ? `Fastest to ${props.card.goal.target} TE` : goalName.value) : (selectedOption.value?.name ?? ''));
  return props.follow ? `${name} · ${props.follow.label ?? 'your pick'}` : name;
});
/** "Following your pick" (a Follow press), "From the instant answer" or "From your Fast run" (the first answer for the
 *  goal, followed on its own, lib/followPolicy.ts). */
const followWhose = computed(() => {
  const l = props.follow?.label ?? 'your pick';
  return l === 'your pick' ? 'Following your pick' : l.charAt(0).toUpperCase() + l.slice(1);
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
  // The same words as its pill (lib/planGoals.ts `followNoTimesWords`): being worked out, or not priced.
  if (f.price === 'none')
    return followNoTimesWords(
      f.estimating === 'working' || f.estimating === 'waiting'
        ? f.estimating
        : f.estimating === 'beyond' || f.estimating === 'failed'
          ? 'failed'
          : 'none'
    );
  if (f.price === 'estimate')
    return simulatedNow.value
      ? "the ascension you are in simulated on your save, the rest estimated from the instant answer's data"
      : "estimated from the instant answer's data";
  if (f.price === 'finish' && f.finish) {
    const lands = dateAt(f.finish.end, props.now, props.zone);
    return `checked ${dateAt(f.finish.at / 1000, props.now, props.zone)}: lands ${lands}, no timeline kept`;
  }
  if (f.source === 'older-save' && f.pricedSave) return `priced on your save of ${dateAt(f.pricedSave, props.now, props.zone)}, may have drifted`;
  return '';
});
/** The ascension you are in is the simulation's (lib/followSim.ts `withCurrentSim`), not the table's. */
const simulatedNow = computed(() => !!props.card?.plan.tableLegs?.[0]?.simulated);
/** The goal asked for: the card's, else the selected option's (a followed route with no plan yet). */
const askFor = computed<{ goal: 'fastest' | 'date'; target: number; deadline: number | null }>(() => {
  if (props.card) return props.card.goal;
  const o = selectedOption.value;
  if (o && o.kind !== 'race' && o.deadline) return { goal: 'date', target: 0, deadline: o.deadline };
  const t = Number(/^fastest-(\d+)$/.exec(o?.key ?? '')?.[1] ?? 490);
  return { goal: 'fastest', target: t, deadline: null };
});
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
/** Under the pill's name: the plan's state. (A By a date pill's date is its name now, "By Feb 10, 2027", so the
 *  line no longer starts with it.) */
function optionSub(g: GoalOption): string {
  // A followed route: what is true of it, never "no saved plan yet" (25 Oct 2026).
  if (g.follow) return followOptionWords(g.follow, t => dayWords(t, props.zone), lateMarker(g.kind === 'eggday' ? 'eggday' : 'date'));
  if (g.state === 'late') return 'no route in time';
  if (g.state !== 'plan') return g.state === 'answer-only' ? 'no saved plan with its times yet' : 'no saved plan yet';
  return g.calculatedAt ? `calculated ${relativeWords(g.calculatedAt / 1000 - props.now)}` : 'saved plan';
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
  return secondaryLine(sec.label, sec.plan, t => dayWords(t, props.zone));
});
/** The chip: lib/planPace.ts's words, the same as My runs' saved plans ("3 hours behind, as of 3:42 pm"). */
const pace = computed(() => (props.track ? paceWords(props.track, props.now, props.zone) : null));
const chip = computed(() => (pace.value?.text ? { tone: pace.value.tone, text: pace.value.text } : null));
const paceBadge = computed(() => pace.value?.badge ?? '');
const nextText = computed(() =>
  props.card ? nextStepText(props.events, props.card.goal.goal, props.now, props.zone, rounded.value) : ''
);
/** "Shift to Humility at …", "Building up until about …", "Prestige at …" (lib/nextAction.ts). */
const actionText = computed(() => (props.nextStep ? nextActionWords(props.nextStep, t => showDateTime(t, props.zone)) : ''));
/** "Shift to Humility · about …": exact from the simulation, to the hour from the table. */
const shiftLineText = (l: NextShiftLine) =>
  nextShiftWords(l, (t, exact) => showDateTime(exact ? t : roundToHourIn(t, props.zone), props.zone));
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
/** The screen that works the goal's instant answer out: "Highest TE by a date", "Fastest to 490 TE". */
const screenName = computed(() => (askFor.value.goal === 'date' ? NAMES.byDate : fastestName(askFor.value.target)));

// ------------------------------------------------------------------- instant answer or search result
/** The instant answer's plan (not a search's, not an older snapshot's Check exactly): times rounded, no calendar. */
const rounded = computed(() => !!props.card && !props.card.plan.exact);
const NO_LEGS_INSTANT = 'The instant answer keeps when each ascension ends, not each shift: run Fast for the shifts on your account.';
const NO_LEGS_KEPT = "This plan was kept without each ascension's shifts (it was too big to keep whole): open its screen for them.";
/** "(instant answer)", "(Fast run)", "(Check exactly)" for an older snapshot's. */
const howText = computed(() => {
  const p = props.card?.plan;
  if (!p) return '';
  return p.from ? `${p.from.level} run` : p.exact ? 'simulator check' : p.estimated ? "estimate from the instant answer's data" : 'instant answer';
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
  if (p.estimated) return ESTIMATE_WORDS;
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
