<!--
  "How high can I get by a date?" -- Insane mode's second goal (search/deadline.ts).

  The finish line is a moment (Egg Day by default) and the answer is the highest last stop a route
  reaches by then. Uses the same schedule, time off and machine settings as the rest of the panel.
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
    <!-- THE one offer to carry on a run that stopped before finishing (a reload, a crash, or Stop).
         Everything else on the page (the black box notice, Stepping away?) points here. -->
    <div
      v-if="store.deadlineUnfinished && !store.busy"
      id="by-date-unfinished"
      class="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2 text-[11px] text-amber-900 leading-relaxed"
    >
      <h3 class="text-[10px] font-black text-amber-800 uppercase tracking-widest">Unfinished By a date search</h3>
      <p>
        <template v-if="store.deadlineUnfinished.spec.sets">
          <span class="font-bold">{{ store.deadlineUnfinished.spec.sets.toLocaleString() }}</span> sets of early stops,
        </template>
        <span class="font-bold">{{ store.deadlineUnfinished.priced.toLocaleString() }}</span> routes priced so far.
        Started {{ startedLabel(store.deadlineUnfinished) }}. Deadline
        {{ inPlannerZone(store.deadlineUnfinished.spec.deadline) }}, from {{ store.deadlineUnfinished.te }} TE.
        <template v-if="store.deadlineUnfinished.saveKept">
          Carrying on replays the priced routes instantly, continues on the save it started with, and puts its deadline,
          chains and sliders back in the boxes below.</template
        >
        <template v-else> Its save wasn't kept on this device, so it can't carry on.</template>
        Starting a new search replaces it.
      </p>
      <p v-if="autoCountdown > 0" class="font-bold" role="status">
        The last run stopped without finishing. Carrying on by itself in {{ autoCountdown }} s, with fewer workers.
      </p>
      <RunGoingElsewhere v-if="store.runElsewhere.deadline" />
      <div v-else class="flex flex-wrap gap-3">
        <button
          v-if="store.deadlineUnfinished.saveKept"
          type="button"
          class="px-4 py-2 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800"
          @click="resume"
        >
          Carry on from where it stopped
        </button>
        <button
          v-if="autoCountdown > 0"
          type="button"
          class="px-3 py-1.5 rounded-lg border border-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-white"
          @click="stepAway?.cancel()"
        >
          Cancel the automatic carry on
        </button>
        <button
          type="button"
          class="text-[10px] font-black uppercase tracking-widest text-amber-700/70 hover:text-amber-900"
          @click="store.discardDeadlineRun(playerId)"
        >
          Discard it
        </button>
      </div>
    </div>

    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">The deadline</h3>
    <!-- Egg Day or a date of your own, as one choice of two: a dark "Egg Day" button beside date
         boxes that already held Egg Day read oddly (the user, 30 Sept). The boxes show for a date
         of your own. -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="The deadline">
      <button
        type="button"
        role="radio"
        :aria-checked="!showCustomDate"
        :disabled="store.busy"
        class="rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50"
        :class="!showCustomDate ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'"
        @click="chooseEggDay"
      >
        <span class="block text-sm font-black text-slate-900">Egg Day {{ eggDayYear }}</span>
        <span class="block mt-0.5 text-[11px] text-slate-600 leading-relaxed"
          >14 July {{ eggDayYear }}, 9:00 AM Pacific. Answers go on {{ NAMES.compare }}'s Egg Day
          {{ eggDayYear }} tab.</span
        >
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="showCustomDate"
        :disabled="store.busy"
        class="rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50"
        :class="showCustomDate ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'"
        @click="customDate = true"
      >
        <span class="block text-sm font-black text-slate-900">Another date</span>
        <span class="block mt-0.5 text-[11px] text-slate-600 leading-relaxed"
          >Any date and time you like. Answers go on {{ NAMES.compare }}'s By a date tab.</span
        >
      </button>
    </div>
    <div v-if="showCustomDate" class="flex flex-wrap items-end gap-3">
      <label class="space-y-1">
        <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</span>
        <input
          v-model="date"
          type="date"
          :disabled="store.busy"
          class="rounded-lg border-slate-200 text-sm font-bold"
        />
      </label>
      <label class="space-y-1">
        <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Time</span>
        <input
          v-model="time"
          type="time"
          :disabled="store.busy"
          class="rounded-lg border-slate-200 text-sm font-bold"
        />
      </label>
      <label class="space-y-1 max-w-full">
        <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest">In</span>
        <select v-model="zone" :disabled="store.busy" class="max-w-full rounded-lg border-slate-200 text-sm font-bold">
          <option value="America/Los_Angeles">Pacific time</option>
          <option :value="plannerZone">Your planner's time ({{ plannerZone }})</option>
        </select>
      </label>
    </div>
    <p class="text-[11px] text-slate-500 leading-relaxed">
      <template v-if="deadline"
        >That is {{ inPlannerZone(deadline) }} in your planner's time, {{ daysAway.toFixed(0) }} days after the plan
        starts.</template
      >
      <template v-else>Pick a date and time.</template>
      The weekly Research Sale and Monday 2× earnings boost are in the plan; other game events (including Egg Day's own
      bonuses) aren't. The plan is for reaching the TE by then.
    </p>

    <!-- The instant answer from the precomputed table (the precompute fork): the highest TE by this
         date, from every route at once. Check exactly sets its stops in the boxes below. -->
    <InstantRoute v-if="deadline" :deadline="deadline" @check="checkByDate" @routes="onInstantRoutes" />

    <!-- How thorough (Simple or Advanced, batch 3), then how it works, then the mode's content. -->
    <slot name="mode" />
    <details class="rounded-xl border border-slate-200 bg-white">
      <summary class="cursor-pointer px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
        How {{ NAMES.byDate }} works
      </summary>
      <div class="px-4 pb-4 text-xs text-slate-600 leading-relaxed">
        Finds the highest TE you can reach by a date. In Simple it picks the early stops for you: the instant answer's
        route for each number of ascensions and a few TE either side of each stop. In Advanced you set the early stops
        and it tries every route in them. Either way the last stop is found to the exact TE. Like any run, it uses the
        plan start, hours, time off and computer settings in Your setup.
      </div>
    </details>

    <!-- Simple (batch 3): no chain editor. The routes it tries, in one line, and a way to see them as
         boxes in Advanced (to widen them, say). -->
    <div
      v-if="simple"
      class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-1.5 text-[11px] text-slate-700 leading-relaxed"
      data-test="simple-summary"
    >
      <p v-if="simpleSummary" class="font-bold text-slate-900">{{ simpleSummary }}</p>
      <p v-else class="font-semibold text-rose-700">Nothing to check yet: the save hasn't loaded.</p>
      <p v-if="simpleSpace">
        <template v-if="simpleFrom === 'instant'"
          >Around the instant answer's route for each number of ascensions<template v-if="instantMax !== null">
            (at most {{ instantMax }}, as its filter says)</template
          >: {{ simpleWidthsText }}, and its last stop found to the exact TE.</template
        >
        <template v-else
          ><span class="font-bold">No instant answer yet</span> (none for your account, or it is still working), so this
          checks suggested routes for 1-5 ascensions instead: {{ simpleWidthsText }}. When the instant answer arrives,
          the routes follow it.</template
        >
      </p>
      <p v-if="simpleSpace">
        <button
          type="button"
          class="font-bold text-indigo-700 underline hover:text-indigo-900 disabled:opacity-40"
          :disabled="store.busy"
          data-test="open-in-advanced"
          @click="openInAdvanced"
        >
          Open in Advanced</button
        ><span class="text-slate-500"> with these boxes filled in, to widen them or add your own.</span>
      </p>
    </div>

    <!-- Batch 3's Simple mode can leave the chain editor out (`hideRoutes`); nothing else reads it. -->
    <template v-if="!hideRoutes">
      <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-1">The routes to try</h3>
      <!-- One way only (the user, 5 Oct: "just have I'll set the stops, make it simpler"). "Pick them for
         me" is gone from the page; an unfinished run started in it can still be carried on, which is
         the only way `mode` becomes 'auto' now. -->
      <!-- The player's own space, Insane-style: one box per chain, and as many chains as you like. -->
      <template v-if="mode === 'space'">
        <!-- The chain rows (RoutesToTry.vue, shared with the Full sweep). Suggest a space's two sliders sit
           small and under the box they fill (the user, 4 Oct), per chain; moving one re-fills the boxes
           Suggest filled, not ones typed by hand. -->
        <RoutesToTry
          v-model:linked="linkSliders"
          class="space-y-4"
          :rows="chains"
          :sliders="rowSliders"
          :kept-notes="keptNotes"
          :problems="rowProblems"
          :summaries="rowSummaries"
          :disabled="store.busy"
          :current-t-e="store.currentTE"
          :final-t-e="490"
          :max-asc="8"
          :min-rows="1"
          placeholder="138-142:1; 160-200:10; 200-240:10"
          slider-lead="Suggest a space tries"
          linkable
          footer-class="items-end gap-4"
          @asc="(k, n) => (chains[k].asc = n)"
          @text="typedRow"
          @suggest="suggestRow"
          @remove="k => chains.splice(k, 1)"
          @add="addChain"
          @slider="setSlider"
          @use-sliders="suggestRow"
        >
          <template #row-notes="{ row, k }">
            <span v-if="instantNote(k)" class="block text-[10px] text-indigo-700" data-test="instant-set-note">{{
              instantNote(k)
            }}</span>
            <span v-else-if="chains[k].centre && !chains[k].centredOn" class="block text-[10px] text-slate-500"
              >No instant answer for {{ row.asc }} ascensions yet, so the boxes after the first are the card's wider
              ones.</span
            >
            <p v-if="chains[k].restored && row.asc >= 2" class="text-[10px] text-slate-400">
              Restored from the unfinished run (the sliders apply when you press Suggest a space).
            </p>
          </template>
          <!-- A step wider than the ± leaves only the centre of every stop after the first (the user, 5 Oct:
             ±3 every 10 gave "231; 277"). Say so rather than let it look like a bug. -->
          <template #row-after="{ row, k }">
            <p
              v-if="row.asc >= 3 && stepOf(chains[k]) > widthOf(chains[k])"
              class="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1"
            >
              Every {{ stepOf(chains[k]) }} TE is wider than ±{{ widthOf(chains[k]) }}, so after the first stop only the
              suggested TE itself is tried. Widen the ± slider or pick a smaller step to try more around it.
            </p>
          </template>
          <template #footer>
            <label class="space-y-1">
              <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest"
                >Last stop: where to start looking</span
              >
              <input
                v-model="lastBox"
                type="text"
                :disabled="store.busy"
                placeholder="e.g. 220-320"
                class="w-40 rounded-lg border-slate-300 text-sm font-mono-premium font-bold text-slate-800 disabled:opacity-50"
              />
            </label>
            <span class="text-[10px] pb-2" :class="lastRange ? 'text-slate-500' : 'text-rose-600'">
              {{
                lastRange
                  ? `starts at ${lastRange[0]}-${lastRange[1]} and looks higher or lower if the answer is outside it; found to the exact TE`
                  : 'give it a rough range, e.g. 300-340'
              }}
            </span>
          </template>
        </RoutesToTry>
        <p class="text-[11px] text-slate-500 leading-relaxed">
          Each chain is one box of bands, like {{ fastestName(store.finalTE) }} › {{ NAMES.fullFirst }}'s: one band per
          ascension before the last, separated by <span class="font-mono-premium">;</span>. A band is
          <span class="font-mono-premium">lo-hi:step</span>, a single value, or several values with commas. Chains with
          other ascension counts all run from the same click, and a 1- or 2-ascension chain costs next to nothing. Every
          route in your chains is tried, and nothing outside them, so the answer is proven for that space. The last stop
          is found to the exact TE.
          <template v-if="suggestFrom">{{ suggestFrom }}</template>
        </p>
        <p v-if="instantSets.length" class="text-[10px] text-slate-500 leading-relaxed" data-test="handoff-note">
          This search starts each fresh ascension the moment the last one ends; the instant answer's exact check starts
          it on the next whole hour, so the same route's times here and there can differ by up to about an hour per
          fresh ascension.
        </p>
      </template>

      <!-- Let it pick: the guided search (seed, grid, homing in). -->
      <template v-else>
        <div class="flex flex-wrap items-end gap-4">
          <label class="space-y-1">
            <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest"
              >Stops, including the last</span
            >
            <div class="flex items-center gap-2">
              <input
                v-model.number="minStops"
                type="number"
                min="1"
                max="8"
                :disabled="store.busy"
                class="w-16 rounded-lg border-slate-200 text-sm font-bold"
              />
              <span class="text-slate-400">to</span>
              <input
                v-model.number="maxStops"
                type="number"
                min="1"
                max="8"
                :disabled="store.busy"
                class="w-16 rounded-lg border-slate-200 text-sm font-bold"
              />
            </div>
          </label>
          <label class="space-y-1">
            <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest"
              >Rough guess for the last stop</span
            >
            <input
              v-model.number="lastHi"
              type="number"
              :min="store.currentTE + 2"
              max="490"
              :disabled="store.busy"
              class="w-24 rounded-lg border-slate-200 text-sm font-bold"
              @input="lastHiTouched = true"
            />
          </label>
          <!-- How thorough, as one slider (the user, 30 Sept): how many sets of early stops the first
             look tries; the grid it uses follows, and so do the routes and the time below. -->
          <label class="space-y-1">
            <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest">How thorough</span>
            <span class="flex items-center gap-2">
              <input
                v-model.number="thoroughIx"
                type="range"
                min="0"
                :max="THOROUGH.length - 1"
                step="1"
                :disabled="store.busy"
                class="w-36 accent-slate-800"
                aria-label="How thorough the first look is"
              />
              <span class="text-[11px] font-bold text-slate-700"
                >{{ THOROUGH[thoroughIx].label }} · first look every {{ usedStep }} TE</span
              >
            </span>
          </label>
        </div>
        <div class="text-[11px] text-slate-600 leading-relaxed space-y-1.5">
          <p>
            <span class="font-bold text-slate-800">It looks wide, then zooms in.</span> The first look tries early stops
            every {{ usedStep }} TE ({{ shapes.toLocaleString() }} sets, plus every TE for the first 5 above yours, and
            the chain in your planner and your last best): rough, but across everything, so it can't miss a whole
            region. Then it zooms in on the best few, moving one stop at a time by {{ resolutionsText }} TE and keeping
            anything that helps, so the answer ends up placed to the exact TE, not on the grid. The last stop is always
            found to the exact TE.
          </p>
          <p>
            <span class="font-bold text-slate-800">Why not every TE from the start?</span> Good and bad stops sit a few
            TE apart (each missed Research Sale is a jump), so you can't just walk downhill from one guess, and every TE
            for every stop is tens of thousands of routes. A wide first look finds the right area; the zoom does the
            fine work only there. It's the same idea as {{ fastestName(store.finalTE) }} › {{ NAMES.smartFirst }}.
          </p>
          <p>
            <span class="font-bold text-slate-800">The other way, "I'll set the stops",</span> tries every route in
            boxes you give, so its answer is proven for those boxes, but only as good as the boxes. This way covers far
            more ground for the time, but isn't proven: a narrow winner between first-look points could be missed if the
            zoom doesn't start near it.
          </p>
        </div>
      </template>
    </template>

    <!-- The numbers that should decide whether you press the button. -->
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sets of early stops</div>
          <div class="text-lg font-black text-slate-900 tabular-nums">{{ plannedShapes.toLocaleString() }}</div>
        </div>
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Legs to simulate</div>
          <div class="text-lg font-black text-slate-900 tabular-nums">
            ~{{ roundedRoutes(plannedLegs).toLocaleString() }}
          </div>
          <div class="text-[9px] text-slate-400">~{{ roundedRoutes(plannedRoutes).toLocaleString() }} routes</div>
        </div>
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            {{ store.deadlineRunning ? 'Time left' : 'Est. wall clock' }}
          </div>
          <div class="text-lg font-black text-slate-900 tabular-nums" data-test="estimate">{{ estimateLabel }}</div>
          <div v-if="store.deadlineRunning && timeLeft?.measuring" class="text-[9px] text-slate-400">measuring…</div>
          <div v-else-if="store.deadlineRunning && firstGuessLabel" class="text-[9px] text-slate-400">
            first guess {{ firstGuessLabel }}
          </div>
        </div>
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assumed cost</div>
          <div class="text-lg font-black text-slate-900 tabular-nums">{{ costLabel }}</div>
          <div class="text-[9px] text-slate-400">a leg</div>
        </div>
      </div>
      <p class="pt-2 text-[10px] text-slate-500 leading-relaxed">
        Counted in legs (one ascension each), not routes: a set's first route simulates its early legs, shared with the
        sets that start the same way, and every later try at its last stop only the last leg. About
        {{ plan.sets ? (plan.routes / plan.sets).toFixed(1) : 4 }} routes per set<template
          v-if="mode === 'space' && rememberedPerSet"
        >
          (what this machine's last run over a space this shape needed)</template
        >: the last stop is narrowed down, not tried at every TE. During a run the time left is the legs left at the
        rate of the last 12 minutes. The estimate uses
        <template v-if="store.deadlineWorkerSeconds">this machine's speed from its last deadline search</template
        ><template v-else
          >the typical speed for chains this long in players' runs, until this machine has done a deadline search of its
          own</template
        >, on {{ store.workerBudget }} workers.
      </p>
      <p v-if="store.longRunWorkers" class="text-[10px] font-semibold text-amber-800" data-testid="long-run-workers">
        {{ longRunLine(store.longRunWorkers) }}
      </p>
    </div>

    <label v-if="store.scheduleEnabled" class="flex items-start gap-3 cursor-pointer">
      <input v-model="ascendNeeded" type="checkbox" :disabled="store.busy" class="mt-0.5 rounded border-slate-300" />
      <span class="text-[11px] text-slate-600 leading-relaxed">
        <span class="font-bold text-slate-800">I need to ascend at the last stop before the deadline.</span> Counts the
        wait until your awake hours after reaching it, so you reach the last stop in time to act on it.
      </span>
    </label>

    <!-- Keep awake is in Your setup at the top, with the other computer settings. -->
    <SafariNotice />
    <IntegrityNotice :deadline-offer="!!store.deadlineUnfinished" />
    <!-- A Find and submit that finished (and shared) while this panel was closed for another tab. -->
    <!-- Finished results kept until sent (search/pendingSends.ts): "This result wasn't sent: Send it now". -->
    <UnsentResults kind="deadline" :player-id="playerId" />
    <AutoSendReport v-if="!shareMessage" kind="by-date" />
    <!-- Find / Find and submit: the same bar as Fastest route (FindBar.vue), with this screen's own
         consent wording. The same share settings as the Share this result box under the result. -->
    <FindBar
      v-model:opt-in="shareOptIn"
      v-model:anonymous="shareAnonymous"
      v-model:nickname="shareName"
      v-model:note="store.runNote"
      :find-disabled="store.busy || store.integrityBlocked || store.staleBackupBlocked || !canStart"
      :running="store.deadlineRunning"
      :stopping="stopAsked"
      :running-label="autoShare ? 'Searching, then submitting...' : 'Searching...'"
      :show-submit="collectorConfigured"
      goal-word="deadline"
      best-so-far-kind="deadline"
      @find="andSubmit => void start(andSubmit)"
      @stop="stopDeadline"
      @nickname-typed="shareNameTouched = true"
    >
    </FindBar>
    <!-- Stepping away? Carry on by itself, a watcher tab, fewer workers (StepAwayOptions.vue). -->
    <StepAwayOptions
      ref="stepAway"
      kind="deadline"
      countdown-elsewhere
      @countdown="n => (autoCountdown = n)"
      :player-id="playerId"
      :can-carry-on="!!store.deadlineUnfinished?.saveKept && !store.runElsewhere.deadline"
      @carry-on="resume"
    />
    <!-- Everything above greys out while anything else in this tab is busy; say what, and offer a way out. -->
    <div
      v-if="store.busy && !store.deadlineRunning"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-700"
    >
      <span>
        <span class="font-bold">Waiting for another run in this tab:</span>
        <template v-if="store.isRunning">
          the fastest-to-a-target search ({{ store.stage || 'running' }}, {{ store.chainsDone.toLocaleString() }} of
          {{ store.chainsEstimated.toLocaleString() }})</template
        >
        <template v-else-if="store.preparing">getting an unfinished run ready to carry on</template>
        <template v-else>re-checking routes on your latest save</template>. The deadline search can start once it is
        done.
      </span>
      <button
        v-if="store.isRunning"
        type="button"
        class="px-3 py-1.5 rounded-lg border border-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-white"
        @click="emit('show-fastest')"
      >
        Show that run
      </button>
      <button
        v-if="store.isRunning"
        type="button"
        class="px-3 py-1.5 rounded-lg border border-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-white"
        @click="store.stop()"
      >
        Stop that run
      </button>
    </div>
    <p v-if="startIssue" class="text-[11px] font-semibold text-rose-700">{{ startIssue }}</p>
    <p v-if="store.error && !store.errorIsIntegrityNotice" class="text-[11px] font-semibold text-rose-700">
      {{ store.error }}
    </p>

    <!-- Live progress, Insane-style. -->
    <div v-if="store.deadlineRunning && store.deadlineProgress" class="space-y-2" data-run-progress="by-date">
      <ProgressBar :percent="progressPct" />
      <p class="text-[11px] text-slate-600">
        <span class="font-bold">{{ liveDone.toLocaleString() }}</span
        ><template v-if="liveTotal && liveDone < liveTotal">
          of ~{{ roundedRoutes(liveTotal).toLocaleString() }}</template
        >
        routes priced<template v-if="liveTotal && liveDone >= liveTotal">
          (more than the ~{{ roundedRoutes(liveTotal).toLocaleString() }} estimated)</template
        ><template v-if="estNow.learned"> ({{ estimateNote(estNow) }})</template> · {{ elapsedLabel }} so far<template
          v-if="remainingLabel"
        >
          · about {{ remainingLabel }} left<template v-if="timeLeft?.measuring"> (measuring…)</template
          ><template v-else-if="firstGuessLabel"> (first guess {{ firstGuessLabel }})</template></template
        ><template v-if="store.deadlineLegSims">
          · {{ store.deadlineLegSims.toLocaleString() }} legs simulated</template
        >
      </p>
      <p class="text-[11px] text-slate-500">{{ store.deadlineProgress.stage }}</p>
      <div v-if="store.deadlineProgress.top.length" class="overflow-x-auto">
        <table class="w-full text-[11px] tabular-nums">
          <thead>
            <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
              <th class="pr-4 py-1">Best so far</th>
              <th class="pr-4 py-1">Last stop reached</th>
              <th class="pr-4 py-1">Spare</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in store.deadlineProgress.top.slice(0, 5)"
              :key="r.chain.join(',')"
              class="border-t border-slate-100"
            >
              <td class="pr-4 py-1 font-bold">{{ r.chain.join(' ') }}</td>
              <td class="pr-4 py-1">{{ inPlannerZone(r.reachAt) }}</td>
              <td class="pr-4 py-1">{{ spareLabel(r.spare) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="result" class="space-y-3">
      <div v-if="best" class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
        <p class="text-[10px] font-black uppercase tracking-widest text-emerald-800">
          Highest by {{ inPlannerZone(result.deadline) }}
          <span v-if="!store.deadlineRunning && fromEarlier" class="font-semibold normal-case tracking-normal">
            · saved result from {{ ago(result.at) }}</span
          >
        </p>
        <p class="text-lg font-black text-emerald-900">
          {{ best.chain[best.chain.length - 1] }} TE
          <span class="text-sm font-bold">via {{ best.chain.join(' ') }}</span>
        </p>
        <p class="text-[11px] text-emerald-900 leading-relaxed">
          Reached {{ inPlannerZone(best.reachAt)
          }}<template v-if="best.ascendAt !== best.reachAt">
            (you can ascend from {{ inPlannerZone(best.ascendAt) }})</template
          >, with {{ spareLabel(best.spare) }} to spare.
          <template v-if="result.stoppedEarly"> Stopped early, so a better route may not have been tried.</template>
          <template v-if="atCeiling">
            <span class="font-bold">That is the highest last stop it was allowed to try</span>, so more may be
            reachable: raise
            {{ result.step ? '"Rough guess for the last stop"' : "the top of the last stop's range" }} and run it
            again.</template
          >
        </p>
        <div class="overflow-x-auto">
          <table class="text-[11px] tabular-nums">
            <thead>
              <tr class="text-left text-[9px] font-black uppercase tracking-widest text-emerald-700">
                <th class="pr-4 py-1">Stop</th>
                <th class="pr-4 py-1">Reached</th>
                <th class="pr-4 py-1">Leg</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(leg, i) in best.legs" :key="i" class="border-t border-emerald-100">
                <td class="pr-4 py-1 font-bold">{{ leg.endTE }}</td>
                <td class="pr-4 py-1">{{ inPlannerZone(leg.endTime) }}</td>
                <td class="pr-4 py-1">{{ (leg.durationSeconds / 86400).toFixed(1) }} d</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-else class="text-[11px] font-semibold text-rose-700">
        No route tried reaches any stop by then. Try a later date, a lower last stop, or more stops.
      </p>
      <!-- The best route on the edge of its box (the Full sweep's check, bandCheck.ts): a wider box may
           find better. -->
      <EdgeWarning
        v-if="edges.length && !store.deadlineRunning"
        :lines="edges.map(edgeText)"
        :can-widen="!!edgeWiden"
        :disabled="store.busy || !canStart"
        @widen="widenAndRun"
      >
        <template v-if="edgeWiden && simple">
          This opens Advanced with the boxes Simple used, that one widened to
          <span class="font-mono-premium">{{ edgeWiden.text }}</span
          >, and runs it.
        </template>
        <template v-else-if="edgeWiden">
          Chain {{ edgeWiden.row + 1 }} becomes <span class="font-mono-premium">{{ edgeWiden.text }}</span
          >.
        </template>
      </EdgeWarning>

      <!-- How long the run took and what it searched (search/deadlineSummary.ts), kept with the result so
           a saved answer and a carried-on run say it too. -->
      <div class="text-[11px] text-slate-600 leading-relaxed space-y-0.5" data-testid="by-date-took">
        <p>{{ summary.line }}</p>
        <p v-if="summary.chains.length" data-testid="by-date-chains">
          Chains: {{ shownChains.join(' · ') }}<template v-if="chainsTruncated && !showAllChains">…</template
          ><template v-if="summary.lastStop"> · {{ summary.lastStop }}</template>
          <button
            v-if="chainsTruncated"
            type="button"
            class="ml-1 font-black uppercase tracking-widest text-[9px] text-slate-500 hover:text-slate-800 underline"
            @click="showAllChains = !showAllChains"
          >
            {{ showAllChains ? 'Show fewer' : 'Show all' }}
          </button>
        </p>
      </div>

      <div v-if="result.byStops.length > 1" class="overflow-x-auto">
        <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 pb-1">Best for each stop count</p>
        <table class="w-full text-[11px] tabular-nums">
          <tbody>
            <tr v-for="r in result.byStops" :key="r.chain.join(',')" class="border-t border-slate-100">
              <td class="pr-4 py-1 text-slate-500">{{ r.chain.length }} stop{{ r.chain.length === 1 ? '' : 's' }}</td>
              <td class="pr-4 py-1 font-bold">{{ r.chain.join(' ') }}</td>
              <td class="pr-4 py-1">{{ spareLabel(r.spare) }} spare</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="overflow-x-auto">
        <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 pb-1">
          <template v-if="!result.step && !result.stoppedEarly"
            >Every route in your space: {{ result.priced.toLocaleString() }} priced, run complete. Top routes</template
          ><template v-else
            >Top routes ({{ result.priced.toLocaleString() }} priced,
            {{
              result.step ? `early stops every ${result.step} TE, then refined` : 'every combination in your space'
            }})</template
          >
        </p>
        <table class="w-full text-[11px] tabular-nums">
          <thead>
            <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
              <th class="pr-4 py-1">Route</th>
              <th class="pr-4 py-1">Last stop reached</th>
              <th class="pr-4 py-1">Spare</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in result.routes.slice(0, 15)" :key="r.chain.join(',')" class="border-t border-slate-100">
              <td class="pr-4 py-1 font-bold">{{ r.chain.join(' ') }}</td>
              <td class="pr-4 py-1">{{ inPlannerZone(r.reachAt) }}</td>
              <td class="pr-4 py-1">{{ spareLabel(r.spare) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- Save this answer and Saved answers (SavedAnswers.vue), with Download CSV beside Save. -->
      <SavedAnswers :player-id="playerId" :default-label="defaultAnswerLabel" :zone="plannerZone">
        <template #actions>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"
            @click="downloadByDateCsv"
          >
            Download CSV
          </button>
        </template>
        <p v-if="downloadError" class="text-[11px] font-semibold text-red-700">{{ downloadError }}</p>
        <p class="text-[11px] text-slate-500 leading-relaxed">
          Priced from {{ inPlannerZone(result.planStart) }} at {{ result.te }} TE, with the hours and time off in Your
          setup. A route that reaches one more TE usually has much less time to spare: the table shows both so you can
          choose.
        </p>
      </SavedAnswers>

      <!-- Share: Compare's Egg Day tab for an Egg Day answer, else "By a date". Same opt-in as Insane. -->
      <ShareResult
        v-if="best && collectorConfigured"
        :replaces-best-so-far="!!store.provisionalRows.deadline"
        v-model:opt-in="shareOptIn"
        v-model:anonymous="shareAnonymous"
        v-model:nickname="shareName"
        v-model:note="resultNote"
        goal-word="deadline"
        @nickname-typed="shareNameTouched = true"
      >
        <template #intro>
          <p class="text-[11px] text-indigo-900/80 leading-relaxed">
            Sends the best route above to {{ NAMES.compare }}'s <span class="font-bold">{{ shareTab }}</span> tab, where
            answers for the same deadline are ranked by the highest TE reached, then the time to spare. It stays out of
            the race to 490.
          </p>
        </template>
        <template #opted>
          <p class="text-[11px] text-indigo-900/80">
            Only named answers are ranked. Anonymous ones are listed below the ranking.
          </p>
          <button
            type="button"
            :disabled="sharing || store.deadlineRunning || sentKey === resultKey"
            class="px-4 py-2 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
            @click="share"
          >
            <SendingText v-if="sharing" />
            <template v-else>{{
              sentKey === resultKey ? 'Sent' : `Send ${best.chain[best.chain.length - 1]} TE by this date`
            }}</template>
          </button>
          <ShareStatus
            :message="shareMessage"
            :ok="shareOk"
            :partial="sharePartial"
            :pending-table="store.pendingTable?.source === 'deadline'"
            :retrying="retryingTable"
            @retry="retryTable"
          />
        </template>
      </ShareResult>
    </div>
  </div>
</template>

<script lang="ts">
import { ref as keptRef } from 'vue';
import { nextEggDayYear as keptEggDayYear } from '@/lib/eggDay';
import {
  DEFAULT_STEP_IX as KEPT_STEP_IX,
  DEFAULT_WIDTH_IX as KEPT_WIDTH_IX,
  suggestBase,
} from '@/search/deadlineSuggest';

/**
 * What the player set on this screen, kept for the page load rather than per mount. Since the
 * planner's tabs, leaving this screen unmounts it, and everything typed (the date, the boxes, the
 * sliders) came back as the defaults; the Egg Day link's boxes came back instead, every visit.
 */
const eggDayYearAtLoad = keptEggDayYear();
const kept = {
  date: keptRef(`${eggDayYearAtLoad}-07-14`),
  time: keptRef('09:00'),
  zone: keptRef('America/Los_Angeles'),
  customDate: keptRef(false),
  minStops: keptRef(3),
  maxStops: keptRef(5),
  lastHi: keptRef(490),
  lastHiTouched: keptRef(false),
  step: keptRef(5),
  ascendNeeded: keptRef(false),
  thoroughIx: keptRef(2),
  mode: keptRef<'space' | 'auto'>('space'),
  chains: keptRef<
    {
      asc: number;
      text: string;
      auto?: boolean;
      widthIx?: number;
      stepIx?: number;
      /** A width only a Science card's request can ask for (+-1, +-2): overrides the slider. */
      pm?: number;
      /** `pm` is Simple's width (Open in Advanced), not a Science card's. */
      simple?: boolean;
      restored?: boolean;
      /** A Science card's "centre the later boxes on the instant answer" (byDateRequest.ts `centre`):
       *  each later box's TE either side and step. Dropped once the box is typed in. */
      centre?: { pm: number; step: number }[];
      /** The instant answer's route the later boxes were centred on, when they were. */
      centredOn?: number[];
      /** The typed box a slider move left alone (RoutesToTry's "Your typed box is kept" note). */
      keptText?: string;
    }[]
  >([{ asc: 4, text: '' }]),
  lastBox: keptRef(''),
  suggestFrom: keptRef(''),
  widthIx: keptRef(KEPT_WIDTH_IX),
  stepIx: keptRef(KEPT_STEP_IX),
  linkSliders: keptRef(false),
  /** Whose save the boxes were filled for: another player's stops are meaningless on this one. */
  forPlayer: keptRef(''),
  /** The boxes Simple's last run used (its Find, or a carried-on Simple run's spec): what Simple shows
   *  while that run goes, rather than boxes worked out again from an instant answer that moved. */
  simpleUsed: keptRef<{ chains: { asc: number; text: string }[]; lastBox: string } | null>(null),
};
</script>

<script setup lang="ts">
import {
  byDatePlan,
  estimateNote,
  fallbackWorkerSecondsPerLeg,
  legSeconds,
  longRunLine,
  plannedRoutes as plannedRoutesFor,
  roundedRoutes,
} from '@/search/deadlineEstimate';
import { maxPoolSize } from '@/search/batch';
import { findBandEdges, widenEdges, type BandEdge } from '@/search/bandCheck';
import FindBar from './FindBar.vue';
import RunGoingElsewhere from './RunGoingElsewhere.vue';
import ShareResult from './ShareResult.vue';
import ShareStatus from './ShareStatus.vue';
import SendingText from './SendingText.vue';
import UnsentResults from './UnsentResults.vue';
import { useByDateShare, useShareIdentity } from '@/composables/useShareResult';
import { useShareExtras } from '@/composables/useShareExtras';
import RoutesToTry from './RoutesToTry.vue';
import SavedAnswers from './SavedAnswers.vue';
import ProgressBar from './ProgressBar.vue';
import EdgeWarning from './EdgeWarning.vue';
import { durationLabel, useRunClock } from '@/composables/useRunClock';
import { useRunDownloads } from '@/composables/useRunDownloads';
import { useDateRowSliders } from '@/composables/useRowSliders';
import StepAwayOptions from './StepAwayOptions.vue';
import AutoSendReport from './AutoSendReport.vue';
import { NAMES, fastestName } from '@/lib/siteNav';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { formatInZone } from '@/search/csv';
import {
  countBandShapes,
  countShapes,
  countSpaceShapes,
  parseChainText,
  parseStopBox,
  stepForBudget,
} from '@/search/deadline';
import { formatBand, formatHours } from '@/search/exhaustive';
import { summariseByDate } from '@/search/deadlineSummary';
import { rowSettingsFor, type DeadlineRunSpec, type SavedDeadlineResult } from '@/search/deadlineStore';
import { SPACE_STEPS, SPACE_WIDTHS, stopsByWidth } from '@/search/deadlineSuggest';
import { simpleByDateSpace, type SimpleSpace } from '@/search/simpleByDate';
import { writeSearchMode } from '@/lib/searchMode';
import { firstTime } from '@/lib/linkOnce';
import { parseByDateRequest, SCIENCE_WIDTHS, type ByDateRequest } from '@/search/byDateRequest';
import { useUIStore } from '@/stores/ui';
import type { SearchMode } from '@/lib/searchMode';
import { eggDayYearOf } from '@/lib/eggDay';
import { showDateTime } from '@/lib/displayTime';
import IntegrityNotice from './IntegrityNotice.vue';
import InstantRoute from './InstantRoute.vue';
import SafariNotice from './SafariNotice.vue';

const props = defineProps<{
  playerId: string;
  /** Leave out The routes to try (a Simple mode that picks the routes itself). */
  hideRoutes?: boolean;
}>();
const emit = defineEmits<{ (e: 'show-fastest'): void }>();
const store = useChainSearchStore();
const ui = useUIStore();
const initialState = useInitialStateStore();
const planner = useAutoPlannerStore();

const plannerZone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

/** The next Egg Day (14 July) at 9:00 AM Pacific that has not passed yet (lib/eggDay.ts). */
const eggDayYear = eggDayYearAtLoad;
const { date, time, zone } = kept;
const isEggDay = computed(
  () => date.value === `${eggDayYear}-07-14` && time.value === '09:00' && zone.value === 'America/Los_Angeles'
);
function useEggDay(): void {
  date.value = `${eggDayYear}-07-14`;
  time.value = '09:00';
  zone.value = 'America/Los_Angeles';
}
/** "Another date" picked: its boxes show (holding Egg Day until changed). */
const { customDate } = kept;
const showCustomDate = computed(() => customDate.value || !isEggDay.value);
function chooseEggDay(): void {
  customDate.value = false;
  useEggDay();
}

const deadline = computed(() => {
  if (!date.value || !time.value) return 0;
  const t = getLocalTimestampInTimezone(date.value, time.value, zone.value);
  return Number.isFinite(t) ? t : 0;
});
const daysAway = computed(() => (deadline.value - store.planStart) / 86400);

const { minStops, maxStops } = kept;
/** 200 TE above where you are, unless you set it: the save usually loads after this panel does. */
const { lastHi, lastHiTouched } = kept;
watch(
  () => store.currentTE,
  te => {
    if (te > 0 && (!lastHiTouched.value || lastHi.value <= te + 1)) lastHi.value = Math.min(490, Math.floor(te) + 200);
  },
  { immediate: true }
);
/** The finest first-look grid allowed; the thoroughness slider decides how far it widens. */
const { step, ascendNeeded } = kept;

/** The first look's budget in sets of early stops; the middle one is the long-standing default. */
const THOROUGH = [
  { label: 'Quick', shapes: 500 },
  { label: 'Light', shapes: 1500 },
  { label: 'Standard', shapes: 3000 },
  { label: 'Thorough', shapes: 6000 },
  { label: 'Very thorough', shapes: 12000 },
] as const;
const { thoroughIx } = kept;
const maxShapes = computed(() => THOROUGH[thoroughIx.value]?.shapes ?? 3000);

const specForCount = computed(() => ({
  maxShapes: maxShapes.value,
  firstStopFine: 5,
  currentTE: store.currentTE,
  lastHi: lastHi.value,
  minStops: Math.max(1, Math.floor(minStops.value || 1)),
  maxStops: Math.max(1, Math.floor(maxStops.value || 1)),
}));
const usedStep = computed(() =>
  stepForBudget({ ...specForCount.value, planStart: 0, deadline: 0, lastLo: 0, step: step.value })
);
const shapes = computed(() => countShapes(specForCount.value, usedStep.value));
/** The pattern search's resolutions for this grid, as search/deadline.ts picks them. */
const resolutionsText = computed(() => {
  const st = usedStep.value;
  const rs = [...new Set([Math.floor(st / 2), Math.floor(st / 4), 2, 1])]
    .filter(r => r >= 1 && r < st)
    .sort((a, b) => b - a);
  return rs.length > 1 ? `${rs.slice(0, -1).join(', ')} and finally ${rs[rs.length - 1]}` : String(rs[0] ?? 1);
});

// ------------------------------------------------------------------ your own space (Insane-style)

const { mode } = kept;
// A setting left on "Pick them for me" from before it was removed comes back as the one way left.
if (mode.value === 'auto' && !store.deadlineRunning) mode.value = 'space';

/** The chains to run from one click: each an ascension count and one box of bands. */
const { chains, lastBox, suggestFrom, simpleUsed } = kept;
const rowBands = (k: number) => parseChainText(chains.value[k]?.text ?? '');
function rangeOf(box: string): [number, number] | null {
  const v = parseStopBox(box, 1);
  if (!v.length) return null;
  const lo = Math.max(v[0], Math.floor(store.currentTE) + 1);
  const hi = Math.min(490, v[v.length - 1]);
  return hi >= lo ? [lo, hi] : null;
}
/** Advanced's last-stop box, as read. */
const lastRange = computed<[number, number] | null>(() => rangeOf(lastBox.value));

/**
 * SIMPLE (batch 3): the chain editor is left out (`hideRoutes`) and the boxes are picked here, one
 * chain per number of ascensions the instant answer has a route for (search/simpleByDate.ts), each
 * early stop its TE either side at step 1, sized to take about 10-30 minutes on a typical 8-core
 * machine. Without an instant answer, the routes Suggest a space would centre on, for 1-5 ascensions.
 */
const simple = computed(() => !!props.hideRoutes);
/** The instant answer's "At most N ascensions", null for any. */
const instantMax = ref<number | null>(null);
/** What a typical 8-core machine costs, for sizing Simple's boxes the same on every computer. */
const TYPICAL_WORKERS = 8;
const SIMPLE_MAX_SECONDS = 25 * 60;
const simpleCentres = computed<{ from: 'instant' | 'suggested'; routes: Record<number, number[]> }>(() => {
  const te = Math.floor(store.currentTE);
  const max = instantMax.value;
  const fits = (k: number, r: number[] | undefined): r is number[] =>
    !!r && r.length === k && (max === null || k <= max) && r[0] > te;
  const routes: Record<number, number[]> = {};
  for (const [k, r] of Object.entries(instantByCount.value)) if (fits(Number(k), r)) routes[Number(k)] = [...r];
  if (Object.keys(routes).length) return { from: 'instant', routes };
  for (let n = 1; n <= Math.min(5, max ?? 5); n++) {
    const base = suggestBase(n, te, {
      instant: null,
      answer: store.deadlineResult?.byStops.find(r => r.chain.length === n)?.chain ?? null,
      anyAnswer: store.deadlineResult?.routes[0]?.chain ?? null,
      route: store.seedChain,
    });
    routes[n] = [...base.early, base.last];
  }
  return { from: 'suggested', routes };
});
const simpleFrom = computed(() => simpleCentres.value.from);
/** The leg-based estimate of a Simple space (deadlineEstimate.ts `byDatePlan`) at these workers and speed. */
function simplePlanOf(sp: SimpleSpace, workers: number, workerSecondsPerLeg: number) {
  return byDatePlan({
    rows: sp.rows.map(r => ({ asc: r.asc, bands: r.bands })),
    currentTE: store.currentTE,
    lastHi: sp.lastHi,
    instantSets:
      simpleCentres.value.from === 'instant' ? sp.rows.filter(r => r.asc >= 2).map(r => r.centre.slice(0, -1)) : [],
    workers,
    workerSecondsPerLeg,
  });
}
/**
 * The typical worker-seconds a leg for a Simple space, until this machine has measured its own: each
 * chain at the board's speed for its own length, weighted by its rough legs (sets x stops). Simple
 * tries a route for every count the instant answer has, up to 12 ascensions, and pricing every leg at
 * the 12-ascension speed (Advanced's rule, the longest chain's) read about 3x long.
 */
function weightedSecondsPerLeg(sp: SimpleSpace): number {
  let w = 0;
  let legs = 0;
  for (const r of sp.rows) {
    const l = Math.max(1, r.asc <= 1 ? 1 : countBandShapes(r.bands, store.currentTE, sp.lastHi)) * r.asc;
    w += l * fallbackWorkerSecondsPerLeg(r.asc);
    legs += l;
  }
  return legs ? w / legs : fallbackWorkerSecondsPerLeg(1);
}
const simpleSpace = computed<SimpleSpace | null>(() => {
  if (!(store.currentTE > 0)) return null;
  return simpleByDateSpace({
    currentTE: store.currentTE,
    routes: simpleCentres.value.routes,
    secondsOf: sp => simplePlanOf(sp, TYPICAL_WORKERS, weightedSecondsPerLeg(sp)).seconds,
    maxSeconds: SIMPLE_MAX_SECONDS,
  });
});
/** Simple's boxes as chain rows: the last run's while it goes, else the ones worked out now. */
const simpleLive = computed(() =>
  simpleSpace.value
    ? {
        chains: simpleSpace.value.rows.map(r => ({ asc: r.asc, text: r.text })),
        lastBox: `${simpleSpace.value.lastLo}-${simpleSpace.value.lastHi}`,
      }
    : { chains: [] as { asc: number; text: string }[], lastBox: '' }
);
const simpleBoxes = computed(() =>
  (store.deadlineRunning || store.preparing) && simpleUsed.value ? simpleUsed.value : simpleLive.value
);
/** The boxes the Simple run on screen searched (its own record, or the frozen ones while it goes), not
 *  the ones the instant answer would give now: that answer can change mid-run. Before any Simple run,
 *  the live ones. Planning the NEXT run (`simpleBoxes`) still follows the live ones. */
const simpleRunBoxes = computed(() => {
  if ((store.deadlineRunning || store.preparing) && simpleUsed.value) return simpleUsed.value;
  const r = result.value;
  if (r?.simple && r.bandSets?.length)
    return {
      chains: r.bandSets.map(set => ({ asc: set.length + 1, text: set.map(b => formatBand(b)).join('; ') })),
      lastBox: `${r.lastLo ?? Math.floor(r.te) + 1}-${r.lastHi}`,
    };
  return simpleLive.value;
});
/** "±3 TE for 1-3 ascensions, ±2 for 4-5, ±1 for 6" */
const simpleWidthsText = computed(() => {
  const rows = simpleSpace.value?.rows ?? [];
  const groups: { w: number; ks: number[] }[] = [];
  for (const r of rows) {
    const g = groups[groups.length - 1];
    if (g && g.w === r.width) g.ks.push(r.asc);
    else groups.push({ w: r.width, ks: [r.asc] });
  }
  const ks = (a: number[]) => (a.length > 1 ? `${a[0]}-${a[a.length - 1]}` : `${a[0]}`);
  return groups
    .map((g, i) =>
      g.w
        ? `${i ? '' : 'each early stop '}±${g.w} TE for ${ks(g.ks)} ascension${g.ks.length > 1 || g.ks[0] > 1 ? 's' : ''}`
        : `just the route itself for ${ks(g.ks)}`
    )
    .join(', ');
});

/** The rows a run reads: Advanced's chains, or Simple's. */
const activeChains = computed<{ asc: number; text: string }[]>(() =>
  simple.value ? simpleBoxes.value.chains : chains.value
);
const runLastRange = computed<[number, number] | null>(() =>
  simple.value ? rangeOf(simpleBoxes.value.lastBox) : lastRange.value
);
const bandsOf = (row: { text: string } | undefined) => parseChainText(row?.text ?? '');
function shapesOf(row: { asc: number; text: string } | undefined, range: [number, number] | null): number {
  if (!row || !range) return 0;
  if (row.asc <= 1) return 1;
  const b = bandsOf(row);
  return b.length === row.asc - 1 ? countBandShapes(b, store.currentTE, range[1]) : 0;
}
function problemOf(row: { asc: number; text: string } | undefined, range: [number, number] | null): string {
  if (!row || row.asc <= 1) return '';
  const b = bandsOf(row);
  if (!b.length) return 'Nothing readable yet: press Suggest a space or type bands.';
  if (b.length !== row.asc - 1) return `These bands make ${b.length + 1} ascensions, not ${row.asc}.`;
  return range && !shapesOf(row, range) ? 'No route in these bands goes up to the last stop.' : '';
}
/** Advanced's chain `k`, as the editor shows it. */
const rowShapes = (k: number) => shapesOf(chains.value[k], lastRange.value);
const rowProblem = (k: number) => problemOf(chains.value[k], lastRange.value);

/** "Checks 5 ascension counts, 1,240 routes, about 18 min on this computer" */
const simpleSummary = computed(() => {
  const rows = simpleRunBoxes.value.chains;
  if (!simple.value || !rows.length) return '';
  const counts = new Set(rows.map(r => r.asc)).size;
  // Planned for the run's own boxes once a Simple run is on screen; else the plan Find would run.
  const shown = simpleRunBoxes.value === simpleLive.value ? plan.value : summaryPlan.value;
  const time = shown.legs ? formatHours(shown.seconds / 3600) : '';
  return `Checks ${counts} ascension count${counts === 1 ? '' : 's'}, ~${roundedRoutes(shown.routes).toLocaleString()} routes${time ? `, about ${time} on this computer` : ''}.`;
});
const summaryPlan = computed(() =>
  byDatePlan({
    rows: simpleRunBoxes.value.chains.map(row => ({ asc: row.asc, bands: bandsOf(row) })),
    currentTE: store.currentTE,
    lastHi: rangeOf(simpleRunBoxes.value.lastBox)?.[1] ?? 0,
    instantSets: result.value?.instantSets ?? [],
    workers: store.workerBudget,
    rememberedPerSet: rememberedPerSet.value,
    workerSecondsPerLeg: workerSecondsPerLeg.value,
  })
);

/** Simple's boxes into Advanced's chain editor, and Advanced shown: to widen them, or add chains. */
function openInAdvanced(): void {
  const used = simpleRunBoxes.value;
  if (!used.chains.length) return;
  // Each row keeps the width Simple built it with, so its slider says "±2 TE around each stop (from
  // Simple)" rather than the default ±10; moving the width slider clears that, as for a Science card.
  chains.value = used.chains.map(r => {
    const width = simpleSpace.value?.rows.find(x => x.asc === r.asc)?.width ?? 0;
    return { asc: r.asc, text: r.text, ...(width > 0 ? { pm: width, simple: true, widthIx: 0, stepIx: 0 } : {}) };
  });
  lastBox.value = used.lastBox;
  suggestFrom.value = "Set from Simple's routes, around the instant answer.";
  mode.value = 'space';
  writeSearchMode('by-date', 'advanced');
  setMode('advanced');
}
/** Show Simple or Advanced (ByDateScreen.vue reads it). Not remembered as the player's choice. */
function setMode(m: SearchMode): void {
  ui.byDateMode = m;
}
/** The instant answer's early stops for each ascension count in the chains: tried as sets of their own
 *  on top of the boxes (the run drops any already in one), so its route is always in the space. */
const instantSets = computed<number[][]>(() => {
  const te = Math.floor(store.currentTE);
  const out: number[][] = [];
  for (const asc of [...new Set(activeChains.value.map(r => Math.floor(r.asc)))].sort((a, b) => a - b)) {
    const route = instantByCount.value[asc];
    if (asc < 2 || !route || route.length !== asc) continue;
    const early = route.slice(0, -1);
    if (early.every((v, i) => v > (i ? early[i - 1] : te))) out.push(early);
  }
  return out;
});
/** Whether chain `k`'s own box already holds the instant answer's early stops. */
function instantInBox(k: number, early: number[]): boolean {
  const b = rowBands(k);
  return b.length === early.length && early.every((v, i) => b[i].includes(v));
}
/** "Also tries the instant answer's route 159 195 217" under a chain, for its ascension count. */
function instantNote(k: number): string {
  const row = chains.value[k];
  const early = row && instantSets.value.find(s => s.length === row.asc - 1);
  if (!row || !early) return '';
  const route = instantByCount.value[row.asc] ?? [];
  const lead = row.centredOn
    ? `The boxes after the first are centred on the instant answer's route ${route.join(' ')}`
    : '';
  const also = instantInBox(k, early)
    ? `the instant answer's route ${early.join(' ')} is in this box`
    : `also tries the instant answer's route ${early.join(' ')}, which is outside this box`;
  return lead ? `${lead}; ${also}.` : `${also.charAt(0).toUpperCase()}${also.slice(1)}.`;
}

function rowSummary(k: number): string {
  const row = chains.value[k];
  if (!row) return '';
  if (row.asc <= 1) return 'No ascension: keep going on this farm to the last stop. One route.';
  const sizes = rowBands(k).map(b => b.length);
  const all = sizes.reduce((n, x) => n * x, 1);
  const sets = rowShapes(k);
  // Only the playable sets are run (each stop above the one before): say so when the bands overlap,
  // or "12 x 31 x 31" next to a smaller count reads as a mistake (the user, 1 Oct).
  return sets < all
    ? `${sets.toLocaleString()} playable sets of early stops (each above the one before), of ${sizes.join(' x ')} = ${all.toLocaleString()} combinations`
    : `${sets.toLocaleString()} sets of early stops · ${sizes.join(' x ')} values`;
}

/** The instant answer's route for each number of ascensions (InstantRoute's `routes` event), for this
 *  save and plan start: what Suggest a space centres on first. */
const instantByCount = ref<Record<number, number[]>>({});
/**
 * The instant answer arrived (or its exact check refined it): fill every chain box that is empty or
 * was filled by Suggest a space around it, at that chain's own sliders (a Science request's included).
 * A box typed by hand, set by a link or request, or restored from an unfinished run is left alone;
 * nothing changes while a run is going or being restored.
 */
function onInstantRoutes(byCount: Record<number, number[]>, max: number | null = null): void {
  instantByCount.value = byCount;
  instantMax.value = max;
  if (store.deadlineRunning || store.preparing) return;
  chains.value.forEach((row, k) => {
    // A row carried on from an unfinished run keeps its boxes.
    if (row.restored || row.asc < 2) return;
    if (row.centre) centreRow(k);
    else if (!row.text || row.auto) suggestRow(k);
  });
}

/**
 * A Science card's chain (`centre`): keep its first box, and put each later box around the instant
 * answer's stop for that many ascensions -- its TE either side, at its step, the stop itself on the
 * grid. Without an instant answer for that count the card's own (wider) boxes stay. The instant
 * answer's own route is tried as well either way (`instantSets`).
 */
function centreRow(k: number): void {
  const row = chains.value[k];
  const route = row && instantByCount.value[row.asc];
  if (!row?.centre || !route || route.length !== row.asc) return;
  const te = Math.floor(store.currentTE);
  const first = row.text.split(';')[0]?.trim();
  if (!first) return;
  const later = row.centre.slice(0, row.asc - 2).map((c, i) => {
    const stop = route[i + 1];
    const reach = Math.floor(c.pm / c.step) * c.step;
    let lo = stop - reach;
    while (lo <= te + 1) lo += c.step;
    return `${lo}-${Math.min(489, stop + reach)}:${c.step}`;
  });
  if (later.length !== row.asc - 2) return;
  row.text = [first, ...later].join('; ');
  row.centredOn = [...route];
  // The last stop's box must reach above the centred stops, or no route in them counts: start
  // looking around the instant answer's own last stop when the box sits below it.
  const last = route[route.length - 1];
  const r = lastRange.value;
  if (r && last > r[1]) lastBox.value = `${r[0]}-${Math.min(490, last + 20)}`;
}

/**
 * Fill one chain's box (search/deadlineSuggest.ts `suggestBase`): around the instant answer's route
 * for that many ascensions, else your last deadline answer, else your own route (the chain in the
 * planner), else evenly spaced. Also sets the last-stop range around it when that is empty.
 */
/** What Suggest a space would put in chain `k`'s box right now, without changing anything. */
function suggestion(k: number): { text: string; from: string; lastGuess: number } | null {
  const row = chains.value[k];
  if (!row) return null;
  const n = Math.max(1, Math.min(8, Math.floor(row.asc || 1)));
  const te = Math.floor(store.currentTE);
  const last = store.deadlineResult?.byStops.find(r => r.chain.length === n) ?? null;
  const base = suggestBase(n, te, {
    instant: instantByCount.value[n] ?? null,
    answer: last?.chain ?? null,
    anyAnswer: store.deadlineResult?.routes[0]?.chain ?? null,
    route: store.seedChain,
  });
  const early = base.early;
  const lastGuess = base.last;
  const from =
    base.from === 'instant'
      ? `Chain ${k + 1} was suggested around the instant answer, ${base.around.join(' ')}.`
      : base.from === 'answer'
        ? `Chain ${k + 1} was suggested around your last answer, ${base.around.join(' ')}.`
        : base.from === 'route'
          ? `Chain ${k + 1} was suggested around your route, ${base.around.join(' ')}.`
          : `Chain ${k + 1} was spaced evenly: no answer or route to start from yet.`;
  // Sized to the slider (search/deadlineSuggest.ts): the first stop at every TE from just above
  // yours, the later ones as fine and as wide as the size allows.
  const lastHi = lastRange.value?.[1] ?? Math.min(490, lastGuess + 20);
  const sug = stopsByWidth(te, early, lastHi, widthOf(row), stepOf(row));
  return sug ? { text: sug.text, from, lastGuess } : null;
}

function suggestRow(k: number): void {
  const row = chains.value[k];
  const sug = row && suggestion(k);
  if (!row || !sug) return;
  const te = Math.floor(store.currentTE);
  suggestFrom.value = sug.from;
  if (!lastRange.value) lastBox.value = `${Math.max(te + 2, sug.lastGuess - 20)}-${Math.min(490, sug.lastGuess + 20)}`;
  row.text = sug.text;
  row.auto = true;
  row.restored = false;
  row.centre = undefined;
  row.centredOn = undefined;
}

/** Suggest a space's two sliders, per chain (the user, 4 Oct: separate by default, with an option to
 *  move them together). A chain without its own setting uses the last one set (`widthIx`/`stepIx`). */
const { widthIx, stepIx, linkSliders } = kept;
/** Each chain's sliders and what moving one does (composables/useRowSliders.ts, batch 1's rules). */
const {
  rowWidthIx,
  rowStepIx,
  widthOf,
  stepOf,
  views: rowSliders,
  keptNotes,
  setSlider,
} = useDateRowSliders({
  rows: chains,
  widthIx,
  stepIx,
  linked: linkSliders,
  refill: suggestRow,
  suggestedText: k => suggestion(k)?.text ?? null,
});

const rowProblems = computed(() => chains.value.map((_, k) => rowProblem(k)));
const rowSummaries = computed(() => chains.value.map((_, k) => rowSummary(k)));
/** A box typed in (or a band checker's "did you mean" taken): the player's own now, so Suggest a space
 *  and the sliders leave it alone, and a Science card's centring no longer applies. */
function typedRow(k: number, text: string): void {
  const row = chains.value[k];
  if (!row) return;
  row.text = text;
  row.auto = false;
  row.restored = false;
  row.centre = undefined;
  row.centredOn = undefined;
}

/**
 * The instant answer's Check exactly: its route as one chain of single-value boxes, with the last stop
 * looked for around where it lands, so Find prices exactly that route with the full simulator.
 */
function checkByDate(chain: number[]): void {
  const last = chain[chain.length - 1];
  const te = Math.floor(store.currentTE);
  mode.value = 'space';
  // Single-value boxes are Advanced's: show them there.
  setMode('advanced');
  chains.value = [{ asc: chain.length, text: chain.slice(0, -1).join('; ') }];
  lastBox.value = `${Math.max(te + 1, last - 5)}-${Math.min(490, last + 5)}`;
  suggestFrom.value = `Set from the instant answer's route, ${chain.join(' ')}.`;
}

/** A new chain one ascension shorter than the shortest, since the short ones are what get added. */
function addChain(): void {
  const used = chains.value.map(r => r.asc);
  let asc = Math.max(1, Math.min(...used) - 1);
  while (used.includes(asc) && asc < 8) asc++;
  chains.value.push({ asc, text: '' });
  if (asc >= 2) suggestRow(chains.value.length - 1);
}

/**
 * A link can set the search up: `?insane=1&goal=deadline&eggday=1&asc=1,2,3` opens this panel on
 * Egg Day with one chain per ascension count, each suggested from the opener's own save (like
 * Suggest; no account is in the link). `chain2=150-160:2` (the chain with that many ascensions) and
 * `last=220-300` set a box exactly instead. `pm5=3&step5=1` set Suggest a space's two sliders for the chain with that many
 * ascensions (`pm`/`step` alone: every chain), so the suggestion is wide or narrow as asked.
 * The request's own format and bounds are in search/byDateRequest.ts.
 *
 * The same request arrives in place from the Science tab (the ui store's `byDateRequest`), when the
 * planner is already open and no link is followed.
 *
 * THE SEEDING HOOK: a chain with no box of its own is filled by `suggestRow`, whose centre is
 * `suggestion(k)`'s `early` list (the last answer, else the route in the planner, else evenly
 * spaced). To centre on another source, change the `early` that function picks; nothing else here
 * knows where a centre comes from.
 */
// Once per page load (lib/linkOnce.ts): coming back to this screen keeps what the player typed.
const linkRequest =
  typeof window !== 'undefined' && firstTime('by-date-link') ? parseByDateRequest(window.location.search) : null;
/** A request was applied on this mount: the boxes it left empty are filled when the save loads, and
 *  they are not reset for "another player" the way the kept boxes are. */
const linked = ref(false);
function applyRequest(req: ByDateRequest): void {
  // A Science card fills boxes: always Advanced, where they show.
  setMode('advanced');
  if (req.eggDay) {
    useEggDay();
    customDate.value = false;
  }
  mode.value = 'space';
  // The sliders a request names go on that chain's own row, so the panel's shared sliders (and a normal
  // By a date run) stay as they were.
  chains.value = req.asc.map(asc => {
    const a = req.around?.[asc];
    const own = a && SCIENCE_WIDTHS.includes(a.pm);
    const wi = a ? (own ? 0 : SPACE_WIDTHS.indexOf(a.pm)) : -1;
    const si = a ? SPACE_STEPS.indexOf(a.step) : -1;
    const centre = req.centre?.[asc];
    return {
      asc,
      text: req.chains[asc] ?? '',
      ...(wi >= 0 && si >= 0 ? { widthIx: wi, stepIx: si, ...(own ? { pm: a.pm } : {}) } : {}),
      ...(centre?.length && req.chains[asc] ? { centre: centre.map(c => ({ ...c })) } : {}),
    };
  });
  lastBox.value = req.last ?? '';
  suggestFrom.value = '';
  linked.value = true;
  fillLinked();
  chains.value.forEach((row, k) => row.centre && centreRow(k));
}
/** Suggest the chains the request left without a box, once the save has said where you are. */
function fillLinked(): void {
  const te = store.currentTE;
  if (!linked.value || !(te > 0)) return;
  chains.value.forEach((row, k) => {
    if (row.asc >= 2 && !row.text) suggestRow(k);
  });
  if (!lastBox.value) lastBox.value = `${Math.floor(te) + 2}-${Math.min(490, Math.floor(te) + 130)}`;
}
if (linkRequest) applyRequest(linkRequest);
// A request from the Science tab (App.vue sends the player here with it): applied once, never while a
// run is going or being restored, which has its own boxes.
watch(
  () => ui.byDateRequest,
  req => {
    if (!req) return;
    ui.byDateRequest = null;
    if (!store.deadlineRunning && !store.preparing) applyRequest(req);
  },
  { immediate: true }
);

// First fill once the save has loaded, so the box starts from something real. A request's chains are
// each filled the same way, where it didn't give them.
watch(
  () => store.currentTE,
  te => {
    if (!(te > 0)) return;
    if (linked.value) {
      fillLinked();
      return;
    }
    if (!chains.value[0]?.text && !lastBox.value) suggestRow(0);
  },
  { immediate: true }
);

// The boxes outlive the screen and the save (kept refs), so a box filled for another account -- or
// for this one before its TE moved past the first stops -- can describe no playable route at all
// (the user, 5 Oct: Chain 1 read 158-178 on an account at TE 187). Another player: suggest every
// chain afresh around this save. The same player: re-suggest the chains that can no longer reach
// the last stop. Never while a run is going or being restored, which sets its own boxes.
const { forPlayer } = kept;
watch(
  () => [store.currentTE, initialState.playerId] as const,
  ([te, player]) => {
    if (!(te > 0) || linked.value || store.deadlineRunning || store.preparing) return;
    const otherPlayer = !!player && player !== forPlayer.value;
    if (player) forPlayer.value = player;
    if (otherPlayer) {
      lastBox.value = '';
      chains.value.forEach((row, k) => row.asc >= 2 && suggestRow(k));
      return;
    }
    chains.value.forEach((row, k) => {
      if (row.asc >= 2 && row.text && rowProblem(k)) suggestRow(k);
    });
  },
  { immediate: true }
);

/**
 * Sets of early stops the run will try. Two chains with the same number of ascensions can share
 * some, and the run tries each once -- so they are counted once, by listing them, when that is
 * cheap; past that the plain sum is close enough for an estimate.
 */
const spaceShapes = computed(() =>
  runLastRange.value
    ? countSpaceShapes(
        activeChains.value.map(row => ({ asc: row.asc, bands: bandsOf(row) })),
        store.currentTE,
        runLastRange.value[1]
      )
    : 0
);

// ------------------------------------------------------------------ estimate and live progress

/** Sets of early stops the run tries: the boxes plus the instant answer's sets outside them. */
const plannedShapes = computed(() => (mode.value === 'space' ? spacePlan.value.sets : shapes.value));
/**
 * Seconds of one worker per LEG: this machine's own measure from its last deadline run, else the
 * board's speed for chains this long. Charged through `legSeconds`, which counts the workers once
 * (with their contention).
 */
const longestChain = computed(() =>
  mode.value === 'space'
    ? Math.max(1, ...activeChains.value.map(r => Math.floor(r.asc) || 1))
    : Math.max(1, maxStops.value)
);
const workerSecondsPerLeg = computed(
  () =>
    store.deadlineWorkerSeconds ||
    (simple.value && simpleSpace.value
      ? weightedSecondsPerLeg(simpleSpace.value)
      : fallbackWorkerSecondsPerLeg(longestChain.value))
);
/** The rows as the run reads them. */
const spaceRows = computed(() => activeChains.value.map(row => ({ asc: row.asc, bands: bandsOf(row) })));
/** Routes a set needed in this machine's last finished run over a space of this shape, or 0. */
const rememberedPerSet = computed(() =>
  store.deadlineRoutesPerSet(spaceRows.value.map(r => (r.asc <= 1 ? [] : r.bands.map(b => [...b]))))
);
/**
 * The estimate, counted in legs (deadlineEstimate.ts `byDatePlan`): each set's first route simulates
 * its early legs (shared with the sets that start the same way), every later route one leg. Routes per
 * set from this machine's last run over a space of the same shape, else about 4.
 */
const spacePlan = computed(() =>
  byDatePlan({
    rows: spaceRows.value,
    currentTE: store.currentTE,
    lastHi: runLastRange.value?.[1] ?? 0,
    instantSets: instantSets.value,
    workers: store.workerBudget,
    rememberedPerSet: rememberedPerSet.value,
    workerSecondsPerLeg: workerSecondsPerLeg.value,
  })
);
/** The retired "pick them for me" mode's estimate (a run of it can still be carried on): routes, one
 *  leg and a bit each. */
const autoPlan = computed(() => {
  const routes = plannedRoutesFor({
    sets: shapes.value,
    workers: store.workerBudget,
    currentTE: store.currentTE,
    picked: true,
  });
  const legs = Math.round(routes * 1.5);
  return {
    sets: shapes.value,
    firstLegs: shapes.value * 2,
    routes,
    legs,
    workerSecondsPerLeg: workerSecondsPerLeg.value,
    seconds: (legs * workerSecondsPerLeg.value) / Math.max(1, store.workerBudget),
  };
});
const plan = computed(() => (mode.value === 'space' ? spacePlan.value : autoPlan.value));
/** The run's time on every core but one: a long one defaults to fewer workers (store `fitWorkersToRun`),
 *  unless the count was set by hand. */
const secondsAtDefault = computed(() =>
  plan.value.legs ? legSeconds(plan.value.legs, maxPoolSize(), workerSecondsPerLeg.value) : 0
);
watch(secondsAtDefault, s => store.fitWorkersToRun(s), { immediate: true });
const plannedRoutes = computed(() => plan.value.routes);
const plannedLegs = computed(() => plan.value.legs);
const secondsPerLeg = computed(() => (plan.value.legs ? plan.value.seconds / plan.value.legs : 0));
/** ONE figure: before a run the plan's time, during it the store's legs left over the recent rate. */
const timeLeft = computed(() => store.deadlineTimeLeft);
const estimateLabel = computed(() => {
  if (store.deadlineRunning) return timeLeft.value ? durationLabel(timeLeft.value.seconds) : '—';
  return plannedLegs.value ? formatHours(plan.value.seconds / 3600) : '—';
});
/** The run's own first guess, quoted beside the live figure. */
const firstGuessLabel = computed(() =>
  timeLeft.value?.firstGuess ? formatHours(timeLeft.value.firstGuess / 3600) : ''
);
const costLabel = computed(() => `${secondsPerLeg.value.toFixed(secondsPerLeg.value < 10 ? 2 : 1)} s`);

const runEstimate = ref(0);
const now = useRunClock(() => store.deadlineRunning);

const liveDone = computed(() => (store.deadlineProgress?.priced ?? 0) + store.deadlineInBatch);
/** The store's one route total (never below what is done: an estimate is a guess, a count is a fact),
 *  and its one fill for the bar, so this, the bar on every tab and the time left agree. */
const estNow = computed(() => store.deadlineEstimateNow);
const liveTotal = computed(() => store.deadlineRoutesTotal);
const progressPct = computed(() => store.deadlineProgressPercent ?? 0);
const elapsedSeconds = computed(() => (store.deadlineStartedAt ? (now.value - store.deadlineStartedAt) / 1000 : 0));
const elapsedLabel = computed(() => durationLabel(elapsedSeconds.value));
/** The same figure as the box's (`estimateLabel` during a run). */
const remainingLabel = computed(() => (timeLeft.value ? durationLabel(timeLeft.value.seconds) : ''));

const startIssue = computed(() => {
  if (!deadline.value) return '';
  if (deadline.value <= store.planStart) return 'The deadline is before the plan starts.';
  if (simple.value && !activeChains.value.length) return 'Nothing to check yet: the save has to load first.';
  if (mode.value === 'space') {
    if (!runLastRange.value) return 'Give the last stop a range above your TE now.';
    const bad = activeChains.value.findIndex(row => !!problemOf(row, runLastRange.value));
    if (bad >= 0) return `Chain ${bad + 1}: ${problemOf(activeChains.value[bad], runLastRange.value)}`;
    if (!spaceShapes.value && !instantSets.value.length)
      return 'No route in these chains goes up from your TE to the last stop.';
    return '';
  }
  if (minStops.value > maxStops.value) return 'The fewest stops is more than the most.';
  if (maxStops.value > 8) return 'Up to 8 stops.';
  if (!(lastHi.value > store.currentTE + 1)) return 'The highest last stop has to be above your TE now.';
  return '';
});
const canStart = computed(() => !!deadline.value && !startIssue.value && store.currentTE > 0);

/** Carry on the unfinished run, with the estimate it started with (0 for one saved before runs
 *  kept it: the bar then counts routes without guessing at a total). */
/**
 * Put a run's own settings back in the boxes: the deadline, the chains or the stop counts, the last
 * stop's range, "must ascend while awake". A carried-on run replays the spec it was started with,
 * whatever the boxes say -- so the boxes used to show whatever was typed since, and the result read
 * as the answer to a question nobody could see.
 */
function fillDateFromSpec(spec: DeadlineRunSpec): void {
  if (eggDayYearOf(spec.deadline)) {
    date.value = `${eggDayYearOf(spec.deadline)}-07-14`;
    time.value = '09:00';
    zone.value = 'America/Los_Angeles';
  } else {
    const [d, t] = formatInZone(spec.deadline, zone.value).split(' ');
    if (d && t) {
      date.value = d;
      time.value = t;
    }
  }
  ascendNeeded.value = spec.ascendNeeded;
}
function fillFromSpec(spec: DeadlineRunSpec): void {
  fillDateFromSpec(spec);
  const sets = spec.bandSets?.length ? spec.bandSets : spec.bands?.length ? [spec.bands] : null;
  if (sets) {
    mode.value = 'space';
    // The sliders and "filled by Suggest" go back with the boxes. A run saved before they were kept
    // has none: its sliders stay as they are and its boxes count as typed by hand.
    chains.value = sets.map((set, i) => {
      const saved = rowSettingsFor(spec, i);
      return {
        asc: set.length + 1,
        text: set.map(b => formatBand(b)).join('; '),
        auto: saved?.auto ?? false,
        ...(saved ? { widthIx: saved.widthIx, stepIx: saved.stepIx } : {}),
      };
    });
    lastBox.value = `${spec.lastLo ?? Math.floor(store.currentTE) + 1}-${spec.lastHi}`;
    // A box the sliders would not suggest now says so (decided here, while the last answer that
    // Suggest reads is still on screen: a carried-on run clears it).
    chains.value.forEach((row, k) => {
      const sug = row.asc >= 2 ? suggestion(k) : null;
      row.restored = !!sug && sug.text !== row.text;
    });
  } else {
    mode.value = 'auto';
    minStops.value = spec.minStops;
    maxStops.value = spec.maxStops;
    lastHi.value = spec.lastHi;
    lastHiTouched.value = true;
    step.value = spec.step;
    // Its thoroughness (runs from before the slider ran on the old default, the middle step).
    const ix = THOROUGH.findIndex(t => t.shapes === (spec.maxShapes ?? 3000));
    thoroughIx.value = ix >= 0 ? ix : 2;
  }
}

const stepAway = ref<InstanceType<typeof StepAwayOptions> | null>(null);
/** Seconds left of Stepping away?'s automatic carry-on, shown in the unfinished run's offer. */
const autoCountdown = ref(0);

/** "Started Oct 6, 2026, 2:02 PM (12 min ago)", in the planner's zone and date style; a run saved before the start was kept says when it last saved. */
function startedLabel(u: { spec: DeadlineRunSpec; updatedAt: number }): string {
  return u.spec.startedAt
    ? `${showDateTime(Math.floor(u.spec.startedAt / 1000), plannerZone.value)} (${ago(u.spec.startedAt)})`
    : `at an unknown time, last saved ${ago(u.updatedAt)}`;
}

async function resume(): Promise<void> {
  const spec = store.deadlineUnfinished?.spec;
  // Back in the mode it was started in: a Simple run's boxes are Simple's (its spec), not the editor's.
  if (spec?.simple && spec.bandSets?.length) {
    fillDateFromSpec(spec);
    simpleUsed.value = {
      chains: spec.bandSets.map(set => ({ asc: set.length + 1, text: set.map(b => formatBand(b)).join('; ') })),
      lastBox: `${spec.lastLo ?? Math.floor(store.currentTE) + 1}-${spec.lastHi}`,
    };
    mode.value = 'space';
    setMode('simple');
  } else if (spec) {
    fillFromSpec(spec);
    setMode('advanced');
  }
  runEstimate.value = spec?.estimate ?? 0;
  // A run started with Find and submit (or agreed to share during it) carries on doing so, on its own
  // name, CSV and diagnostics choices: on 9 Oct a carried-on Find and submit run ended as a plain
  // Find and sent nothing.
  const submit = store.deadlineUnfinished?.submit ?? null;
  if (submit) {
    shareOptIn.value = true;
    shareAnonymous.value = !submit.nickname;
    if (submit.nickname) {
      shareName.value = submit.nickname;
      shareNameTouched.value = true;
    }
    shareExtras.sendCsv.value = submit.sendCsv;
    shareExtras.sendDiagnostics.value = submit.sendDiagnostics;
  }
  autoShare.value = !!submit?.whenDone;
  store.lastAutoSend = null;
  store.submitsWhenDone = autoShare.value;
  store.beginBestSoFar('deadline', submit ? { nickname: submit.nickname } : null);
  let go = false;
  try {
    await store.resumeDeadline(props.playerId);
    go = autoShare.value || (await owesAnswer());
  } finally {
    store.submitsWhenDone = false;
    autoShare.value = false;
    store.endBestSoFar();
  }
  // Its best so far (sent before the interruption, or since) is replaced by its answer.
  try {
    if (go) await shareFinished();
  } finally {
    store.endResultSend();
  }
}

/** The name a best so far goes under, as `share` would send it. */
function bestSoFarName(): string {
  return shareAnonymous.value ? '' : shareName.value.trim().slice(0, 40);
}

/**
 * Whether the run that just ended owes the board its answer: the player agreed to share during the run
 * (Send best so far's box), or it sent a best so far, which its answer replaces. A carried-on run's
 * best so far went under a name from before the reload: the answer goes under it too.
 */
async function owesAnswer(): Promise<boolean> {
  const agreed = !!store.bestSoFar?.consent;
  await store.bestSoFarSettled();
  const owed = store.provisionalRows.deadline;
  if (!agreed && owed) {
    shareAnonymous.value = !owed.nickname;
    if (owed.nickname) shareName.value = owed.nickname;
  }
  return agreed || !!owed;
}

/** Send the answer on screen, as Find and submit does at the end. */
async function shareFinished(): Promise<void> {
  if (!result.value || !best.value || store.error) return;
  shareOptIn.value = true;
  await share();
  store.lastAutoSend = { kind: 'by-date', ok: shareOk.value, text: shareMessage.value };
}

/** Set while a Find and submit run is going: it shares its best answer when it finishes. */
const autoShare = ref(false);

/** Find, and with `andSubmit` share the best answer at the end (not when stopped early or failed). */
/** Stop pressed, until the run ends: the store's stop flag for a date search isn't reactive. */
const stopAsked = ref(false);
watch(
  () => store.deadlineRunning,
  running => {
    if (!running) stopAsked.value = false;
  }
);
function stopDeadline(): void {
  stopAsked.value = true;
  store.stopDeadline();
}

async function start(andSubmit: boolean): Promise<void> {
  autoShare.value = andSubmit && shareOptIn.value;
  store.lastAutoSend = null;
  // For the progress bar on other tabs: this run shares its answer when it finishes.
  store.submitsWhenDone = autoShare.value;
  // Send best so far, with the consent Find and submit already has (or asked for during the run).
  store.beginBestSoFar('deadline', autoShare.value ? { nickname: bestSoFarName() } : null);
  try {
    await find();
  } finally {
    store.submitsWhenDone = false;
    const go = autoShare.value || (await owesAnswer());
    autoShare.value = false;
    store.endBestSoFar();
    // Stopped early it still shares: its best is a real route to that TE by the date, just maybe not
    // the highest, and on a board ranked by TE that only ever ranks it lower.
    try {
      if (go) await shareFinished();
    } finally {
      store.endResultSend();
    }
  }
}

async function find(): Promise<void> {
  runEstimate.value = plannedRoutes.value;
  // Simple runs in its own boxes (always a space), frozen for the run.
  if (simple.value) {
    mode.value = 'space';
    simpleUsed.value = {
      chains: simpleLive.value.chains.map(r => ({ ...r })),
      lastBox: simpleLive.value.lastBox,
    };
  }
  const range = runLastRange.value;
  if (mode.value === 'space' && range) {
    const rows = activeChains.value;
    const counts = rows.map(r => Math.max(1, Math.floor(r.asc)));
    // Kept with the run (not worked out again on a carry-on), so a saved run replays the same way.
    const extra = instantSets.value.map(s => [...s]);
    await store.startDeadline(props.playerId, {
      deadline: deadline.value,
      minStops: Math.min(...counts),
      maxStops: Math.max(...counts),
      lastLo: range[0],
      lastHi: range[1],
      step: 1,
      ascendNeeded: ascendNeeded.value,
      estimate: plannedRoutes.value,
      extend: true,
      bandSets: rows.map(r => (r.asc <= 1 ? [] : bandsOf(r).map(b => [...b]))),
      ...(extra.length ? { instantSets: extra } : {}),
      legPlan: { ...spacePlan.value },
      sets: spacePlan.value.sets,
      rows: simple.value
        ? rows.map(() => ({ widthIx: widthIx.value, stepIx: stepIx.value, auto: false }))
        : chains.value.map(r => ({ widthIx: rowWidthIx(r), stepIx: rowStepIx(r), auto: !!r.auto })),
      ...(simple.value ? { simple: true } : {}),
    });
    return;
  }
  await store.startDeadline(props.playerId, {
    deadline: deadline.value,
    minStops: specForCount.value.minStops,
    maxStops: specForCount.value.maxStops,
    lastHi: Math.min(490, Math.floor(lastHi.value)),
    step: step.value,
    maxShapes: maxShapes.value,
    ascendNeeded: ascendNeeded.value,
    estimate: plannedRoutes.value,
    extend: true,
    legPlan: { ...autoPlan.value },
  });
}

// ------------------------------------------------------------------ share to the board

/** Consent, anonymous-or-named and the name box: the same choices as Find and submit's bar
 *  (composables/useShareResult.ts). */
const shareIdentity = useShareIdentity(() => props.playerId);
/** The CSV and diagnostics choices (one set for the site), put back by a carry-on that sends. */
const shareExtras = useShareExtras();
const {
  optIn: shareOptIn,
  anonymous: shareAnonymous,
  nickname: shareName,
  nicknameTouched: shareNameTouched,
} = shareIdentity;
/** The send to Compare's Egg Day or By a date tab (useShareResult.ts `useByDateShare`). */
const {
  collectorConfigured,
  sharing,
  shareMessage,
  shareOk,
  sharePartial,
  retryingTable,
  retryTable,
  resultKey,
  sentKey,
  shareTab,
  share,
} = useByDateShare(
  store,
  shareIdentity,
  computed(() => store.deadlineResult),
  computed(() => store.deadlineResult?.routes[0] ?? null)
);

/** Download CSV: every leg of every route priced (composables/useRunDownloads.ts). */
const { downloadByDateCsv, downloadError } = useRunDownloads(store);

const result = computed(() => store.deadlineResult);
/** Share this result's "Note on this run": the result's own note, edited in place, so the send and
 *  its CSV carry what the box says. */
const resultNote = computed({
  get: () => store.deadlineResult?.note ?? '',
  set: (v: string) => {
    if (store.deadlineResult) store.deadlineResult.note = v;
  },
});
/** A result loaded from this browser rather than produced since the panel opened. */
const openedAt = Date.now();
const fromEarlier = computed(() => !!result.value && result.value.at < openedAt);
/** What Save this answer names an answer saved with an empty box (SavedAnswers.vue). */
const defaultAnswerLabel = computed(() => {
  const r = store.deadlineResult;
  const best = r?.routes[0];
  return best ? `${best.chain[best.chain.length - 1]} TE by ${inPlannerZone(r.deadline)}` : 'Name this answer';
});
onMounted(() => void store.loadDeadlineState(props.playerId));
watch(
  () => props.playerId,
  id => void store.loadDeadlineState(id)
);

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
const best = computed(() => result.value?.routes[0] ?? null);

/** What the shown result says about its run: time, workers, the space (and, on Advanced, the boxes). */
const summary = computed(() =>
  result.value
    ? summariseByDate(result.value as SavedDeadlineResult)
    : { line: '', chains: [] as string[], lastStop: '' }
);
const SHOWN_CHAINS = 2;
const CHAIN_CHARS = 90;
const showAllChains = ref(false);
const chainsTruncated = computed(
  () => summary.value.chains.length > SHOWN_CHAINS || summary.value.chains.some(c => c.length > CHAIN_CHARS)
);
const shownChains = computed(() =>
  showAllChains.value
    ? summary.value.chains
    : summary.value.chains.slice(0, SHOWN_CHAINS).map(c => (c.length > CHAIN_CHARS ? c.slice(0, CHAIN_CHARS) : c))
);

/**
 * Where the best route's stops sit on the lowest or highest value their box allows while the box
 * could go further that way (search/bandCheck.ts `findBandEdges`, the Full sweep's check): a wider
 * box may find a better route. The box is the chain of the run whose boxes hold every early stop of
 * the best route; the instant answer's own route, outside every box, has none.
 */
const edgeBox = computed<{ row: number; bands: number[][] } | null>(() => {
  const r = result.value as SavedDeadlineResult | null;
  const b = best.value;
  if (!r?.bandSets?.length || !b) return null;
  const early = b.chain.slice(0, -1);
  const row = r.bandSets.findIndex(set => set.length === early.length && early.every((v, i) => set[i].includes(v)));
  return row >= 0 && early.length ? { row, bands: r.bandSets[row] } : null;
});
const edges = computed<BandEdge[]>(() => {
  const box = edgeBox.value;
  const b = best.value;
  if (!box || !b || !result.value) return [];
  return findBandEdges(box.bands, b.chain, { currentTE: result.value.te, finalTE: b.chain[b.chain.length - 1] });
});
const ORDINAL = ['1st', '2nd', '3rd'];
function edgeText(e: BandEdge): string {
  const nth = ORDINAL[e.band - 1] ?? `${e.band}th`;
  return `Your best route's ${nth} stop (${e.value}) is the ${e.side === 'low' ? 'lowest' : 'highest'} value its box allows; a wider box may find better.`;
}
/** The box widened on those edges, and which chain row it goes in: the same row when its box is still
 *  the run's, else the first row with that many ascensions. */
const edgeWiden = computed<{ row: number; text: string } | null>(() => {
  const box = edgeBox.value;
  if (!box || !edges.value.length || !result.value) return null;
  const text = widenEdges(box.bands, edges.value, { currentTE: result.value.te, finalTE: 490 });
  if (!text) return null;
  const asc = box.bands.length + 1;
  // From Simple the rows are the run's boxes (widenAndRun opens them in Advanced in this order).
  const rows = simple.value ? simpleRunBoxes.value.chains : activeChains.value;
  const same = (k: number) => formatBands(bandsOf(rows[k])) === formatBands(box.bands);
  let row = rows.findIndex((r, k) => r.asc === asc && same(k));
  if (row < 0) row = rows.findIndex(r => r.asc === asc);
  return row >= 0 ? { row, text } : null;
});
const formatBands = (bands: number[][]) => bands.map(b => formatBand(b)).join('; ');
/** Widen the box on its edge and run again. Routes in both spaces are priced again: a By a date run
 *  does not carry another run's routes over. */
async function widenAndRun(): Promise<void> {
  const w = edgeWiden.value;
  if (!w || store.busy) return;
  // From Simple: its boxes into Advanced first (the same rows, in the same order), widened there.
  if (simple.value) {
    openInAdvanced();
    // The screen shows Advanced through two components above this one.
    for (let i = 0; i < 5 && simple.value; i++) await nextTick();
    if (simple.value) return;
  }
  typedRow(w.row, w.text);
  await nextTick();
  if (canStart.value) await start(false);
}
const atCeiling = computed(
  () => !!best.value && best.value.chain[best.value.chain.length - 1] >= (result.value!.ceiling ?? result.value!.lastHi)
);

function inPlannerZone(unixSeconds: number): string {
  return showDateTime(unixSeconds, plannerZone.value);
}
function spareLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.max(0, Math.round(seconds / 60))} min`;
  if (seconds < 2 * 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}
</script>
