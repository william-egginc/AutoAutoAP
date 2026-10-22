<!--
  "How high can I get by a date?" -- Insane mode's second goal (search/deadline.ts).

  The finish line is a moment (Egg Day by default) and the answer is the highest last stop a route
  reaches by then. Uses the same schedule, time off and machine settings as the rest of the panel.
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
    <!-- THE one offer to carry on a run that stopped before finishing (a reload, a crash, or Stop).
         Everything else on the page (the black box notice, Stepping away?) points here. -->
    <CarryOnOffer
      v-if="store.deadlineUnfinished && !store.busy"
      id="by-date-unfinished"
      title="Unfinished By a date search"
      :elsewhere="store.runElsewhere.deadline"
      :can-carry-on="store.deadlineUnfinished.saveKept"
      discardable
      @carry-on="resume"
      @discard="store.discardDeadlineRun(playerId)"
    >
      <p>
        <template v-if="store.deadlineUnfinished.spec.sets">
          <span class="font-bold">{{ store.deadlineUnfinished.spec.sets.toLocaleString() }}</span> sets of early stops,
        </template>
        <span class="font-bold">{{ store.deadlineUnfinished.priced.toLocaleString() }}</span> routes priced so far.
        Started {{ startedLabel(store.deadlineUnfinished) }}. Deadline
        {{ inPlannerZone(store.deadlineUnfinished.spec.deadline) }}, from {{ store.deadlineUnfinished.te }} TE.
        <template v-if="store.deadlineUnfinished.saveKept">
          Carrying on replays the priced routes instantly, continues on the save it started with, and puts its deadline,
          boxes and sliders back below.</template
        >
        <template v-else> Its save wasn't kept on {{ thisDevice() }}, so it can't carry on.</template>
        Starting a new search replaces it.
      </p>
      <p v-if="autoCountdown > 0" class="font-bold" role="status">
        The last run stopped without finishing. Carrying on by itself in {{ autoCountdown }} s, with fewer workers.
      </p>
      <template #actions>
        <button
          v-if="autoCountdown > 0"
          type="button"
          class="px-3 py-1.5 rounded-lg border border-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-white"
          @click="cancelAutoCarryOn()"
        >
          Cancel the automatic carry on
        </button>
      </template>
    </CarryOnOffer>

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
          >14 July {{ eggDayYear }}, 9:00 AM Pacific. Answers you send go on the {{ NAMES.compare }}'s Egg Day
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
          >Any date and time you like. Answers you send go on the {{ NAMES.compare }}'s By a date tab.</span
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
        >That is {{ inPlannerZone(deadline) }} in your planner's time, {{ plural(Math.round(daysAway), 'day') }} after the plan
        starts.</template
      >
      <template v-else>Pick a date and time.</template>
      The weekly Research Sale and Monday 2× earnings boost are in the plan; other game events (including Egg Day's own
      bonuses) aren't. The plan is for reaching the TE by then.
    </p>
    <!-- For both searches (Nearby routes and Exhaustive), so it sits with the deadline. -->
    <label v-if="store.scheduleEnabled" class="flex items-start gap-3 cursor-pointer">
      <input v-model="ascendNeeded" type="checkbox" :disabled="store.busy" class="mt-0.5 rounded border-slate-300" />
      <span class="text-[11px] text-slate-600 leading-relaxed">
        <span class="font-bold text-slate-800">I need to ascend at the last stop before the deadline.</span> Counts the
        wait until your awake hours after reaching it, so you reach the last stop in time to act on it.
      </span>
    </label>

    <!-- The instant answer from the precomputed table (the precompute fork): the highest TE by this
         date, from every route at once. Check exactly sets its stops in the boxes below. -->
    <CollapsibleSection v-if="deadline" id="instant" title="Instant answer" :summary="lines.instant">
      <InstantRoute
        :deadline="deadline"
        stronger-to="#stronger-check-results"
        @check="checkByDate"
        @routes="onInstantRoutes"
        @state="st => (instantLoad = st)"
        @unloaded="u => (instantUnloaded = u)"
      >
        <!-- No instant answer for this TE (NoInstantAnswer.vue): the fallback's own button, the same run as
             Find on Nearby routes without one (`start`, then `findWithoutInstant`; Jordan, 18 Oct 2026). -->
        <template #no-answer>
          <div class="space-y-2" data-testid="quick-estimate">
            <template v-if="quickBest && result">
              <ByDateRouteCard :route="quickBest" :deadline="result.deadline" :zone="plannerZone" />
              <p class="text-[11px] text-slate-700 leading-relaxed" data-testid="quick-estimate-note">
                {{ quickEstimateNote(!!edges.length && !!edgeWiden) }}
              </p>
            </template>
            <template v-if="quickRunning">
              <p class="text-[11px] font-semibold text-slate-700" data-testid="quick-estimate-status">
                {{ quickStatus }}
              </p>
              <button
                type="button"
                class="min-h-[44px] px-4 rounded-lg border border-slate-400 bg-white text-[11px] font-black uppercase tracking-widest text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                :disabled="stopAsked"
                data-testid="quick-estimate-stop"
                @click="stopDeadline"
              >
                <SendingText v-if="stopAsked" text="Stopping" /><template v-else>Stop &amp; keep best</template>
              </button>
              <p v-if="stopAsked" class="text-[11px] text-slate-600" data-testid="stopping-note">{{ STOPPING_NOTE }}</p>
            </template>
            <template v-else>
              <p v-if="!quickBest" class="text-[12px] text-slate-700 leading-relaxed">
                A quick scan of 1 to 5 ascensions, then {{ NAMES.smart }} near its best, held to about
                {{ Math.round(FALLBACK_BUDGET_SECONDS / 60) }} min on {{ thisDevice() }}. Stop keeps the best route so far.
              </p>
              <button
                type="button"
                class="min-h-[44px] px-4 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-40"
                :disabled="!!quickIssue"
                data-testid="quick-estimate-button"
                @click="quickEstimate"
              >
                {{ QUICK_ESTIMATE_LABEL }}
              </button>
              <p v-if="quickIssue" class="text-[11px] font-semibold text-slate-600" data-testid="quick-estimate-issue">
                {{ quickIssue }}
              </p>
            </template>
            <button
              v-if="quickRunning || quickBest"
              type="button"
              class="min-h-[44px] text-[11px] font-bold text-indigo-700 underline hover:text-indigo-900"
              data-testid="quick-estimate-show"
              @click="showQuickRun"
            >
              {{ quickRunning ? 'Show its progress' : `See it under ${NAMES.smart}` }}
            </button>
          </div>
        </template>
      </InstantRoute>
    </CollapsibleSection>
    <!-- The answers side by side (SearchCompare.vue): instant answer, stronger check, Exhaustive. -->
    <SearchCompare v-if="SHOW_COMPARE && deadline" goal="date" />

    <!-- The search panel (SearchPanel.vue, 22 Oct 2026): Light's status, then Fast | Exact | Custom. Both of
         its parts stay mounted (v-show): the teleport targets below (#bd-around-*, #bd-exh-*) must be on the
         page before the run controls move in, and a run in the hidden part keeps going. -->
    <SearchPanel
      screen="by-date"
      :player-id="playerId"
      :running="!!runKind"
      :estimates="levelEstimates"
      :opens-on="unfinishedChoice"
    >
    <template #nearby>
    <!-- Fast and Exact (StrongerBox.vue): what they do, and the routes around the instant answer, their run
         controls and results here. -->
    <StrongerBox
      goal="date"
      :running="store.deadlineRunning && !!store.deadlineRunSimple"
      :estimates="levelEstimates"
    >
      <template v-if="true">
        <!-- Simple (batch 3): no chain editor. The routes it tries, in one line, and a way to see them as
             boxes in Advanced (to widen them, say). -->
        <div
          class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-1.5 text-[11px] text-slate-700 leading-relaxed"
          data-test="simple-summary"
        >
          <p v-if="simpleSummary" class="font-bold text-slate-900">{{ simpleSummary }}</p>
          <p v-else-if="nearbyRangeEmpty" class="font-semibold text-rose-700" data-test="nearby-range-empty">
            The instant answer has no route with {{ nearbyRange.min }} to {{ nearbyRange.max }} ascensions: widen the
            range below.
          </p>
          <p v-else class="font-semibold text-rose-700">Nothing to check yet: the save hasn't loaded.</p>
          <!-- 3 to one more than the instant answer's count until set (lib/ascRange.ts; Jordan, 22 Oct 2026). -->
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1" data-test="nearby-range">
            <span class="font-bold text-slate-800">Ascensions</span>
            <input
              v-model.number="nearbyMin"
              type="number"
              :min="DATE_RANGE_BOUNDS.floor"
              :max="nearbyRange.max"
              :disabled="store.busy"
              aria-label="Fewest ascensions"
              class="min-h-[44px] w-14 rounded-lg border-slate-200 py-0.5 text-[11px] font-bold sm:min-h-0"
            />
            <span class="text-slate-400">to</span>
            <input
              v-model.number="nearbyMax"
              type="number"
              :min="nearbyRange.min"
              :max="DATE_RANGE_BOUNDS.ceil"
              :disabled="store.busy"
              aria-label="Most ascensions"
              class="min-h-[44px] w-14 rounded-lg border-slate-200 py-0.5 text-[11px] font-bold sm:min-h-0"
            />
            <span v-if="nearbyRangeHint" class="text-[10px] text-slate-400" data-test="nearby-range-hint">{{
              nearbyRangeHint
            }}</span>
            <button
              v-if="canFollowNearbyRange"
              type="button"
              class="inline-flex min-h-[44px] items-center text-[10px] font-bold text-indigo-700 underline hover:text-indigo-900 disabled:opacity-40 sm:min-h-0"
              :disabled="store.busy"
              data-test="nearby-range-reset"
              @click="followNearbyRange"
            >
              Use the instant answer's range
            </button>
          </div>
          <p v-if="simpleSpace">
            <template v-if="simpleFrom === 'instant'"
              >Around the instant answer's route for each number of ascensions from {{ nearbyRange.min }} to
              {{ nearbyRange.max }}<template v-if="instantMax !== null">
                (at most {{ instantMax }}, as its filter says)</template
              >: {{ simpleWidthsText }}, and its last stop found to the exact TE.</template
            >
            <template v-else
              ><span class="font-bold">No instant answer yet</span> (none for your account, or it is still working), so this
              checks suggested routes for {{ nearbyRange.min }}-{{ Math.min(5, nearbyRange.max) }} ascensions instead:
              {{ simpleWidthsText }}. When the instant answer arrives, the routes follow it.</template
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
              Open in Custom</button
            ><span class="text-slate-500"> with these boxes filled in, to widen them or add your own.</span>
          </p>
        </div>
      </template>
      <!-- Nearby routes' own run controls and results (teleported in from below): always on the page, as a
           Teleport needs its target there before it moves in. -->
      <div id="bd-around-controls" />
      <div id="bd-around-results" />
    </StrongerBox>
    </template>

    <!-- Custom is Exhaustive, unchanged: the chain editor, and its run controls and results. -->
    <template #custom>
    <section id="exhaustive" class="space-y-3 scroll-mt-24">
      <p class="text-[12px] text-slate-700 leading-relaxed" data-testid="custom-intro">{{ CUSTOM_INTRO }}</p>
      <ExhaustivePromise goal="deadline" />
      <template v-if="true">
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
            @asc="setRowAsc"
            @text="typedRow"
            @suggest="suggestRow"
            @remove="removeRow"
            @add="addChain"
            @slider="setSlider"
            @use-sliders="suggestRow"
          >
            <template #asc-after="{ k }">
              <span v-if="k === 0 && boxFromInstant" class="text-[10px] text-slate-400" data-testid="asc-follow-hint"
                >(from the instant answer)</span
              >
            </template>
            <template #row-notes="{ row, k }">
              <span v-if="instantNote(k)" class="block text-[10px] text-indigo-700" data-test="instant-set-note">{{
                instantNote(k)
              }}</span>
              <span v-else-if="chains[k].centre && !chains[k].centredOn" class="block text-[10px] text-slate-500"
                >No instant answer for {{ plural(row.asc, 'ascension') }} yet, so the boxes after the first are the card's
                wider ones.</span
              >
              <p v-if="chains[k].restored && row.asc >= 2" class="text-[10px] text-slate-400">
                Restored from the unfinished run (the sliders apply when you press Suggest a space).
              </p>
              <span v-if="coarseRows[k]" class="block text-[10px] text-amber-700" data-test="coarse-note">{{
                COARSE_SUGGESTION_NOTE
              }}</span>
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
              <span class="text-[10px] pb-2" :class="lastRange && !lastTooHigh ? 'text-slate-500' : 'text-rose-600'">
                {{
                  lastTooHigh
                    ? LAST_TOO_HIGH
                    : lastRange
                    ? `starts at ${lastRange[0]}-${lastRange[1]} and looks higher or lower if the answer is outside it; found to the exact TE`
                    : 'give it a rough range, e.g. 300-340'
                }}
              </span>
            </template>
          </RoutesToTry>
          <p class="text-[11px] text-slate-500 leading-relaxed">
            Each box is one band of TEs per ascension before the last, like {{ fastestName(store.finalTE) }} ›
            {{ NAMES.fullFirst }}'s, separated by <span class="font-mono-premium">;</span>. A band is
            <span class="font-mono-premium">lo-hi:step</span>, a single value, or several values with commas. Boxes with
            other ascension counts all run from the same click, and a 1- or 2-ascension box costs next to nothing. Every
            route in your boxes is tried, and nothing outside them, so the answer is proven for that space. The last stop
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
              the route in your planner and your last best): rough, but across everything, so it can't miss a whole
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
              <span class="font-bold text-slate-800">The other way, Exhaustive,</span> tries every route in
              boxes you give, so its answer is proven for those boxes, but only as good as the boxes. This way covers far
              more ground for the time, but isn't proven: a narrow winner between first-look points could be missed if the
              zoom doesn't start near it.
            </p>
          </div>
        </template>
      </template>
      <!-- Exhaustive's own run controls and results (teleported in from below). -->
      <div id="bd-exh-controls" />
      <div id="bd-exh-results" />
    </section>
    </template>
    </SearchPanel>

    <!-- Keep awake is in Your setup at the top, with the other computer settings. -->
    <!-- The run controls (RunControls.vue), one set in each box, as on Fastest: Nearby routes' in the
         Stronger check box, Exhaustive's under its boxes. Each shows only its own run (`runKind`); the store
         holds one deadline run, so while one goes the other's Find is greyed out (store.busy). Two
         Stepping away? boxes, as on Fastest; StepAwayOptions makes one automatic carry-on decision per
         kind, and only the box of the unfinished run's kind can carry it on. -->
    <Teleport v-for="k in BY_DATE_KINDS" :key="`controls-${k}`" defer :to="TARGETS[k].controls">
    <RunControls
      v-if="showControls(k)"
      :long-run="k === 'boxes' || stronger.level === 'thorough'"
      ref="stepAway"
      v-model:opt-in="shareOptIn"
      v-model:anonymous="shareAnonymous"
      v-model:nickname="shareName"
      v-model:note="store.runNote"
      kind="by-date"
      :player-id="playerId"
      :find-disabled="
        store.busy ||
        !!instantWait ||
        store.integrityBlocked ||
        store.staleBackupBlocked ||
        !(k === 'around' ? canStartAround : canStart)
      "
      :running="runKind === k"
      :stopping="stopAsked && runKind === k"
      :show-submit="collectorConfigured"
      :can-carry-on="!!store.deadlineUnfinished?.saveKept && !store.runElsewhere.deadline && unfinishedKind === k"
      countdown-elsewhere
      :run-save-notice="!!ui.runSaveLoaded"
      :deadline-offer="!!store.deadlineUnfinished"
      :report="{
        own: autoShared && reportKind === k,
        message: shareMessage,
        ok: shareOk,
        partial: sharePartial,
        pendingTable: store.pendingTable?.source === 'deadline',
        retrying: retryingTable,
        quiet: !!shareMessage,
      }"
      @find="andSubmit => void start(andSubmit, k)"
      @stop="stopDeadline"
      @nickname-typed="shareNameTouched = true"
      @carry-on="resume"
      @countdown="n => (autoCountdown = n)"
      @retry="retryTable"
    >
      <!-- What Exhaustive will cost, then why Find is greyed out, right above it. Nearby routes' cost is
           under the level bar and in its summary above. -->
      <template #above-find>
        <!-- Find on Nearby routes waits for the instant answer still being worked out (search/autoWiden.ts). -->
        <p
          v-if="k === 'around' && instantWait"
          class="text-[11px] font-semibold text-slate-700"
          data-test="instant-wait-status"
        >
          {{ instantWait }}
        </p>
        <!-- The numbers that should decide whether you press the button (not while Nearby routes runs:
             the time left would be that run's). -->
        <div v-if="k === 'boxes' && runKind !== 'around'" class="rounded-xl border border-slate-200 bg-slate-50 p-3">
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
              <div class="text-[9px] text-slate-400">~{{ plural(roundedRoutes(plannedRoutes), 'route') }}</div>
            </div>
            <div>
              <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {{ store.deadlineRunning ? 'Time left' : 'Est. time' }}
              </div>
              <div class="text-lg font-black text-slate-900 tabular-nums" data-test="estimate">{{ estimateLabel }}</div>
              <div v-if="store.deadlineRunning && timeLeft?.measuring" class="text-[9px] text-slate-400">measuring…</div>
              <div v-else-if="store.deadlineRunning && firstGuessLabel" class="text-[9px] text-slate-400">
                first guess {{ firstGuessLabel }}
              </div>
              <div v-else-if="backgroundLabel" class="text-[9px] text-slate-400" data-test="background-estimate">
                {{ backgroundLabel }}
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
            <template v-if="store.deadlineWorkerSeconds">this machine's speed from its last By a date search</template
            ><template v-else
              >the typical speed for routes this long in players' runs, until this machine has done a By a date search of its
              own</template
            >, on {{ store.workerBudget }} workers.
          </p>
          <!-- Above 300,000 routes (search/bigBox.ts): about how many hours here, and the command line. -->
          <BigBoxNote :note="bigBox" />
          <p v-if="store.longRunNote" class="text-[10px] font-semibold text-amber-800" data-testid="long-run-workers">
            <template v-if="store.longRunNote.kind === 'default'">{{ longRunLine(store.longRunNote.workers) }}</template>
            <template v-else>
              {{ longRunHandLine(LONG_RUN_WORKERS, store.longRunNote.have) }}
              <button
                type="button"
                class="ml-1 underline"
                data-testid="use-long-run-workers"
                @click="store.useLongRunWorkers()"
              >
                Use {{ LONG_RUN_WORKERS }}
              </button>
            </template>
          </p>
        </div>

        <p
          v-if="k === 'around' ? aroundIssue : startIssue"
          class="text-[11px] font-semibold text-rose-700"
          data-testid="by-date-start-issue"
        >
          {{ k === 'around' ? aroundIssue : startIssue }}
        </p>
      </template>
      <template #progress>
        <!-- Live progress, Insane-style. -->
        <!-- Only in the box whose run it is (and so the one `data-run-progress` block, for Jump to it). -->
        <div v-if="runKind === k && store.deadlineProgress" class="space-y-2">
          <!-- The run's place on the page, for the run bar's Jump to it (lib/runAnchor.ts). Its progress is in
               that bar only (Jordan, 16 Oct 2026): time so far, the first guess, the estimate's basis and the
               legs simulated are under the bar's Details. -->
          <div data-run-progress="by-date" class="scroll-mt-24"></div>
          <!-- No instant answer for this TE: which step of the fallback is going (search/autoWiden.ts). -->
          <p v-if="autoStatus" class="text-[11px] font-semibold text-slate-700" data-test="auto-widen-status">
            {{ autoStatus }}
          </p>
          <!-- The best so far in the finished answer's card (ByDateRouteCard.vue), then the next ones. -->
          <ByDateRouteCard
            v-if="liveBest"
            :route="liveBest"
            :deadline="store.deadlineRunDeadline || deadline"
            :zone="plannerZone"
            running
            simulate
            :simulate-note="liveSim?.note"
            @simulate="simulateLive"
          />
          <!-- Its top routes so far are on My runs › Your latest run (LatestRunView.vue; moved off here, Jordan
               16 Oct 2026). -->
          <DigDeeperLink
            v-if="store.deadlineProgress.top.length > 1"
            detail="its top routes so far, and when each stop and egg happens"
          />
        </div>
      </template>
      <template #after>
        <!-- Everything above greys out while anything else in this tab is busy; say what, and offer a way out. -->
        <div
          v-if="store.busy && !store.deadlineRunning && reportKind === k"
          class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-700"
        >
          <span>
            <span class="font-bold">Waiting for another run in this tab:</span>
            <template v-if="store.isRunning">
              the {{ fastestName(store.finalTE) }} search ({{ store.stage || 'running' }}, {{ store.chainsDone.toLocaleString() }} of
              {{ store.chainsEstimated.toLocaleString() }})</template
            >
            <template v-else-if="store.preparing">getting an unfinished run ready to carry on</template>
            <template v-else>re-checking routes on your latest save</template>. This search can start once it is
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
            class="px-3 py-1.5 rounded-lg border border-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-white disabled:opacity-60"
            :disabled="store.stopRequested"
            @click="store.stop()"
          >
            <SendingText v-if="store.stopRequested" text="Stopping" /><template v-else>Stop that run</template>
          </button>
          <p v-if="store.isRunning && store.stopRequested" class="w-full text-[11px] text-slate-600" data-testid="stopping-note">{{ STOPPING_NOTE }}</p>
        </div>
        <RunErrorNotes
          v-if="reportKind === k"
          :error="store.errorIsIntegrityNotice ? null : store.error"
          :labelled="false"
        />
      </template>
    </RunControls>
    </Teleport>

    <!-- The results (RunResults.vue): the same order on every search screen. One answer in the store, shown
         in the box of the search that found it (`resultKind`), whatever the level. -->
    <Teleport v-for="k in BY_DATE_KINDS" :key="`results-${k}`" defer :to="TARGETS[k].results">
    <RunResults v-if="result && resultKind === k">
      <template #card>
        <!-- Say whose results these are (the Stronger check box has its own heading above Light). -->
        <h4
          v-if="k === 'boxes' || stronger.level === 'light'"
          class="text-[10px] font-black uppercase tracking-widest text-slate-500"
          data-testid="exhaustive-results-heading"
        >
          {{ result.simple ? `${NAMES.smart}: the best routes found near the instant answer's` : 'Exhaustive: the best routes in your boxes' }}
        </h4>
        <ByDateRouteCard
          v-if="best"
          :route="best"
          :deadline="result.deadline"
          :zone="plannerZone"
          :priced-with="resultPricedWith"
          simulate
          :simulate-note="resultSim?.note"
          :can-share="collectorConfigured"
          can-csv
          can-save
          :saving="quickSaving"
          :note="quickSaveNote"
          :run-cost="result.lastTECost ?? null"
          :last-run="store.dateRunLive ? '' : inPlannerZone(Math.floor(result.at / 1000))"
          @simulate="simulateResult"
          @csv="downloadByDateCsv"
          @save="quickSave"
        >
          <!-- One more TE (search/oneMoreTE.ts): stopped early, or narrow or edge boxes, with more spare
               than one more TE costs. Otherwise the plain "stopped early". -->
          <span v-if="oneMoreTE" class="block mt-1 font-semibold text-amber-800" data-testid="one-more-te-hint">{{
            oneMoreTE.text
          }}</span>
          <template v-else-if="result.stoppedEarly">
            Stopped early, so a better route may not have been tried.</template
          >
          <template v-if="atCeiling">
            <span class="font-bold">That is the highest last stop it was allowed to try</span>, so more may be
            reachable: raise
            {{ result.step ? '"Rough guess for the last stop"' : "the top of the last stop's range" }} and run it
            again.</template
          >
        </ByDateRouteCard>
        <p v-else class="text-[11px] font-semibold text-rose-700">
          No route tried reaches any stop by then. Try a later date, a lower last stop, or more stops.
        </p>
        <!-- Its top routes with when each stop and egg happens, on My runs › Your latest run (LatestRunView.vue). -->
        <DigDeeperLink v-if="best && !store.deadlineRunning" detail="its top 50 routes and when each stop and egg happens" />
      </template>
      <!-- Where Advanced's box already says this (above, with the chains) it is not repeated here. -->
      <p
        v-if="best && (result.simple || mode !== 'space' || !instantSets.length)"
        class="text-[10px] text-slate-500 leading-relaxed"
        data-test="start-timing-note"
      >
        This search starts each fresh ascension the moment the last one ends; the instant answer starts them on the
        hour, so times can differ by up to about an hour per ascension.
      </p>
      <!-- The best route on the edge of its box (the Full sweep's check, bandCheck.ts): a wider box may
           find better. -->
      <EdgeWarning
        v-if="edges.length && !store.deadlineRunning"
        :lines="noInstantNote ? [...edges.map(edgeText), noInstantNote] : edges.map(edgeText)"
        :can-widen="!!edgeWiden"
        :disabled="store.busy || (!result.simple && !canStart)"
        @widen="widenAndRun"
      >
        <template v-if="edgeWiden && result.simple">
          This opens Exhaustive with the boxes Nearby routes used, that one widened to
          <span class="font-mono-premium">{{ edgeWiden.text }}</span
          >, and runs it.
        </template>
        <template v-else-if="edgeWiden">
          Box {{ edgeWiden.row + 1 }} becomes <span class="font-mono-premium">{{ edgeWiden.text }}</span
          >.
        </template>
      </EdgeWarning>
      <!-- No instant answer for this TE: the boxes were a rough guess (with an edge it is said in the box
           above, beside the button). -->
      <p
        v-else-if="noInstantNote && !store.deadlineRunning"
        class="text-[11px] text-amber-900 leading-relaxed"
        data-test="no-instant-note"
      >
        {{ noInstantNote }}
      </p>

      <!-- How long the run took and what it searched (search/deadlineSummary.ts), kept with the result so
           a saved answer and a carried-on run say it too. -->
      <div class="text-[11px] text-slate-600 leading-relaxed space-y-0.5" data-testid="by-date-took">
        <p>{{ summary.line }}</p>
        <p v-if="summary.chains.length" data-testid="by-date-chains">
          Boxes: {{ shownChains.join(' · ') }}<template v-if="chainsTruncated && !showAllChains">…</template
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

      <ResultTable
        v-if="result.byStops.length > 1"
        title="Best for each stop count"
        :rows="result.byStops"
        :row-key="r => r.chain.join(',')"
        :can-expand="hasLegs"
      >
        <template #expand="{ row: r }">
          <RouteTimeline :chain="r.chain" :legs="r.legs" :zone="plannerZone" />
        </template>
        <template #default="{ row: r }">
          <td class="pr-4 py-1 text-slate-500">{{ r.chain.length }} stop{{ r.chain.length === 1 ? '' : 's' }}</td>
          <td class="pr-4 py-1 font-bold">{{ r.chain.join(' ') }}</td>
          <td class="pr-4 py-1">{{ spareLabel(r.spare) }} spare</td>
        </template>
      </ResultTable>

      <!-- The top routes and how many were priced ("Every route in your space: N priced, run complete") are on
           My runs › Your latest run (LatestRunView.vue; Jordan, 16 Oct 2026): the result keeps its best, the best
           for each stop count and the share box. -->
      <template #keep>
        <!-- Save this answer and Saved answers (SavedAnswers.vue), with Download CSV beside Save. -->
        <!-- CSV and a quick save are on the card (as on Fastest's); here, a save under a name of your own. -->
        <SavedAnswers :player-id="playerId" :default-label="defaultAnswerLabel" :zone="plannerZone">
          <p v-if="downloadError" class="text-[11px] font-semibold text-red-700">{{ downloadError }}</p>
          <p class="text-[11px] text-slate-500 leading-relaxed">
            Priced from {{ inPlannerZone(result.planStart) }} at {{ result.te }} TE<template v-if="result.backupAt"
              >, on your save from {{ inPlannerZone(result.backupAt) }}</template
            >.<template v-if="resultPricedWith">{{ ' ' }}{{ resultPricedWith }}.</template> A route that reaches one more TE
            usually has much less time to spare: the table shows both so you can choose.
          </p>
        </SavedAnswers>
      </template>
      <template #share>
        <!-- Share: Compare's Egg Day tab for an Egg Day answer, else "By a date". Same opt-in as Insane. -->
        <!-- Sent by the run itself: one line instead of the box (SentByRunNote.vue). -->
        <SentByRunNote v-if="best && collectorConfigured && sentByRun" :sending="sharing" />
        <ShareResult
          v-else-if="best && collectorConfigured"
          compact
          :send-label="`Send ${best.chain[best.chain.length - 1]} TE by this date`"
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
              Sends the best route above to the {{ NAMES.compare }}'s <span class="font-bold">{{ shareTab }}</span> tab,
              where answers for the same deadline are ranked by the highest TE reached, then the time to spare. It stays
              out of the race to 490.
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
      </template>
    </RunResults>
    </Teleport>
  </div>
</template>

<script lang="ts">
import { plural } from '@/lib/format';
import { ref as keptRef } from 'vue';
import { byDateForm, eggDayYearAtLoad } from '@/lib/byDateForm';
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
const kept = {
  // The deadline (date, time, zone, "Another date") lives in lib/byDateForm.ts, so My runs can preset it.
  ...byDateForm,
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
  /** The one default box's Ascensions still follows the instant answer's best route's count (the 4 above
   *  is only for before it is in). Cleared for good (this page load) by anything that sets the boxes on
   *  purpose: the Ascensions box, Add/Remove, a typed box, a link or Science request, Open in Custom,
   *  Check exactly, a carried-on run's boxes. */
  ascFollows: keptRef(true),
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
  /** Nearby routes' ascension range as the player set it, each end null while it follows the instant answer
   *  (lib/ascRange.ts). This page load, like the rest. */
  nearbyLo: keptRef<number | null>(null),
  nearbyHi: keptRef<number | null>(null),
};
</script>

<script setup lang="ts">
import { pricedWithLine } from '@/lib/pricedWith';
import { thisDevice } from '@/search/device';
import {
  byDatePlan,
  fallbackWorkerSecondsPerLeg,
  legSeconds,
  longRunLine,
  longRunHandLine,
  plannedRoutes as plannedRoutesFor,
  roundedRoutes,
} from '@/search/deadlineEstimate';
import { defaultWorkerCount } from '@/search/batch';
import { findBandEdges, noInstantAnswerText, widenEdges, type BandEdge } from '@/search/bandCheck';
import {
  FALLBACK_BUDGET_SECONDS,
  INSTANT_TIMEOUT_STATUS,
  INSTANT_WAIT_STATUS,
  NO_INSTANT_SUMMARY,
  UNLOADED_INSTANT_SUMMARY,
  QUICK_ESTIMATE_LABEL,
  QUICK_SCAN_STATUS,
  afterScanStatus,
  autoFallbackNote,
  awaitInstant,
  betterRoute,
  canCentreOn,
  nearbyBudgetSeconds,
  needsQuickScan,
  quickEstimateIssue,
  quickEstimateNote,
  quickScanSpec,
  roundChains,
  roundFits,
  runAutoWiden,
  type InstantState,
} from '@/search/autoWiden';
import CarryOnOffer from './CarryOnOffer.vue';
import BigBoxNote from './BigBoxNote.vue';
import { bigBoxNote, type BigBoxInput } from '@/search/bigBox';
import { confirmBigBox } from '@/composables/useBigBoxConfirm';
import ShareResult from './ShareResult.vue';
import SentByRunNote from './SentByRunNote.vue';
import ShareStatus from './ShareStatus.vue';
import SendingText from './SendingText.vue';
import { STOPPING_NOTE } from '@/search/stopNote';
import { useByDateShare, useShareIdentity } from '@/composables/useShareResult';
import { useShareExtras } from '@/composables/useShareExtras';
import { agreeThisVisit } from '@/composables/useConsent';
import RoutesToTry from './RoutesToTry.vue';
import SavedAnswers from './SavedAnswers.vue';
import EdgeWarning from './EdgeWarning.vue';
import RunErrorNotes from './RunErrorNotes.vue';
import RunControls from './RunControls.vue';
import ResultTable from './ResultTable.vue';
import RouteTimeline from './RouteTimeline.vue';
import DigDeeperLink from './DigDeeperLink.vue';
import RunResults from './RunResults.vue';
import { durationLabel } from '@/composables/useRunClock';
import { useRunDownloads } from '@/composables/useRunDownloads';
import { useDateRowSliders } from '@/composables/useRowSliders';
import { NAMES, fastestName } from '@/lib/siteNav';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { LONG_RUN_WORKERS, useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useIntegrityProbe } from '@/composables/useIntegrityProbe';
import { useStrongerStore, type LevelEstimate, type StrongerLevel } from '@/stores/stronger';
import StrongerBox from './StrongerBox.vue';
import ExhaustivePromise from './ExhaustivePromise.vue';
import {
  BY_DATE_KINDS as BY_DATE_KIND_LIST,
  BY_DATE_TARGETS,
  kindOfSimple,
  readsAround,
  reportKindOf,
  runKindOf,
  showsControls,
  type ByDateKind,
} from '@/search/byDateKinds';
import CollapsibleSection from './CollapsibleSection.vue';
import SearchPanel from './SearchPanel.vue';
import { choiceForEffort, type SearchChoice } from '@/lib/searchOption';
import { scrollToShownId, selectSearchTab } from '@/lib/searchTab';
import { useSearchSnapshots } from '@/composables/useSearchSnapshots';
import { routeLine } from '@/search/sectionSummary';
import SearchCompare from './SearchCompare.vue';
import { SHOW_COMPARE } from '@/lib/features';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { formatInZone } from '@/search/csv';
import {
  countBandShapes,
  countShapes,
  countSpaceShapes,
  parseChainText,
  parseStopBox,
  stopBoxTop,
  stepForBudget,
} from '@/search/deadline';
import { formatBand, formatHours } from '@/search/exhaustive';
import { spareLabel, summariseByDate } from '@/search/deadlineSummary';
import ByDateRouteCard from './ByDateRouteCard.vue';
import { oneMoreTEHint } from '@/search/oneMoreTE';
import { byDateSimulate } from '@/search/byDateSimulate';
import { readFirstAscension } from '@/search/firstAscension';
import { simulateRoute } from '@/search/simulateRoute';
import {
  rowSettingsFor,
  type DeadlineFallback,
  type DeadlineRunSpec,
  type SavedDeadlineResult,
} from '@/search/deadlineStore';
import { COARSE_SUGGESTION_NOTE, SPACE_STEPS, SPACE_WIDTHS, cappedStopsByWidth } from '@/search/deadlineSuggest';
import { boxCountFromBest, limitsHint } from '@/lib/limitsFollow';
import { DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, rangeFromCount, rangeNow } from '@/lib/ascRange';
import { BY_DATE_LEVELS, simpleByDateSpace, widthForLevel, type ByDateLevel, type SimpleSpace } from '@/search/simpleByDate';
import { firstTime } from '@/lib/linkOnce';
import { parseByDateRequest, SCIENCE_WIDTHS, type ByDateRequest } from '@/search/byDateRequest';
import { useUIStore } from '@/stores/ui';
import { eggDayYearOf } from '@/lib/eggDay';
import { applyByDatePreset, byDatePresetPending, takeByDatePreset } from '@/lib/byDateForm';
import { showDateTime } from '@/lib/displayTime';
import InstantRoute from './InstantRoute.vue';

const props = defineProps<{
  playerId: string;
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
// A deadline asked for by another page (My runs' "Find my Egg Day answer", lib/byDateForm.ts): taken
// once, when this screen mounts or at once if it is open, and never applied under a run going or being
// restored, which owns its date.
watch(
  byDatePresetPending,
  p => {
    if (!p) return;
    const preset = takeByDatePreset();
    if (preset && !store.deadlineRunning && !store.preparing) applyByDatePreset(preset);
  },
  { immediate: true }
);

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
  { label: 'Brief', shapes: 1500 },
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
const { chains, lastBox, suggestFrom, simpleUsed, ascFollows } = kept;
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
/** The last stop asks past 490 TE (`1-999999999` was read as up to 490 and Find stayed on; QA break-it #7). */
const LAST_TOO_HIGH = 'The last stop goes up to 490 TE at most.';
const lastTooHigh = computed(() => stopBoxTop(lastBox.value) > 490);

/**
 * NEARBY ROUTES (was Simple, batch 3): no chain editor; the boxes are picked here, one
 * chain per number of ascensions the instant answer has a route for (search/simpleByDate.ts), each
 * early stop its TE either side at step 1, sized to take about 10-30 minutes on a typical 8-core
 * machine. Without an instant answer, the routes Suggest a space would centre on, for 1-5 ascensions.
 */
/**
 * Two searches on the page, each in its own box with its own run controls and results, like Fastest's
 * (the user, 12 Oct 2026: "the same, just different steps"): Nearby routes (the routes around the
 * instant answer, in the Stronger check box) and Exhaustive (the boxes below). The store holds one
 * deadline run and one answer; each box shows only its own (`runKind`, `resultKind`), as Fastest's
 * panels do with `ownRun`.
 */
const BY_DATE_KINDS = BY_DATE_KIND_LIST;
const TARGETS = BY_DATE_TARGETS;
const stronger = useStrongerStore();
/** The box whose Find was pressed, for the length of that run (the store's flag for which kind is
 *  running is only set once the run has set itself up). */
const startingKind = ref<ByDateKind | null>(null);
/** The kind of run last started or carried on here: its box reports the send and the error. */
const lastKind = ref<ByDateKind | null>(null);
const runState = () => ({
  running: store.deadlineRunning,
  starting: startingKind.value,
  runSimple: !!store.deadlineRunSimple,
});
/** The run going, by box. */
const runKind = computed(() => runKindOf(runState()));
/** A run that starts (Find, a carry-on, the countdown) or is going when the screen opens shows its own
 *  tab (not remembered: the next visit opens on the tab the player picked). */
watch(
  runKind,
  k => {
    if (k) selectSearchTab('by-date', k === 'around' ? 'nearby' : 'exhaustive');
  },
  { immediate: true }
);
/** An unfinished run opens on its own option (SearchPanel.vue): Custom for boxes, else its level. */
const unfinishedChoice = computed<SearchChoice | null>(() => {
  const u = store.deadlineUnfinished;
  if (!u || runKind.value) return null;
  return choiceForEffort(u.spec.simple ? u.spec.level ?? 'quick' : 'boxes');
});
/** Custom's first line (it is the Exhaustive search, unchanged): what it is for and how long it takes. */
const CUSTOM_INTRO =
  "For proving an answer, not for finding a much better one: it tries every route in the boxes you set (Exhaustive), and nothing outside them, so its answer is proven for that space, and so far no search has beaten the instant answer's TE by a date. You set a band of TEs for each ascension, the last stop found to the exact TE. Big boxes take hours.";
/** The answer on screen, by box. */
const resultKind = computed(() => kindOfSimple(result.value));
/** The unfinished run, by box. */
const unfinishedKind = computed(() => kindOfSimple(store.deadlineUnfinished?.spec));
/** The box that says how the last run went (its send report, its error, a wait for another run). */
const reportKind = computed(() =>
  reportKindOf({ run: runKind.value, last: lastKind.value, result: resultKind.value })
);
const showControls = (k: ByDateKind) =>
  showsControls(k, {
    level: stronger.level,
    run: runKind.value,
    result: resultKind.value,
    unfinished: unfinishedKind.value,
    report: reportKind.value,
  });
/**
 * What the run being planned or going reads: Nearby's boxes (`simple`) or Exhaustive's chains. Idle,
 * Exhaustive (its estimate box is the one on the page); Nearby's own numbers are `aroundPlan`.
 */
const simple = computed(() => readsAround(runState()));
/** The instant answer's "At most N ascensions", null for any. */
const instantMax = ref<number | null>(null);
/** What a typical 8-core machine costs, for sizing Simple's boxes the same on every computer. */
const TYPICAL_WORKERS = 8;
/**
 * Nearby routes' ascension range (Jordan, 22 Oct 2026; lib/ascRange.ts): 3 to one more than the instant answer's
 * count (the route its box leads with under Prefer fewer, else the best; chainSearch.ts `rangeCount.date`), each
 * end the player set kept; 1 to 5 without an instant answer, as before. It was every count the instant answer has.
 */
const { nearbyLo, nearbyHi } = kept;
const nearbyRange = computed(() =>
  rangeNow(store.rangeCount.date, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: nearbyLo.value, max: nearbyHi.value })
);
/** The range inputs: a value typed in is the player's own until "Use the instant answer's range". */
function rangeInput(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(DATE_RANGE_BOUNDS.ceil, Math.max(DATE_RANGE_BOUNDS.floor, n)) : null;
}
const nearbyMin = computed<number>({
  get: () => nearbyRange.value.min,
  set: v => {
    const n = rangeInput(v);
    if (n !== null) nearbyLo.value = n;
  },
});
const nearbyMax = computed<number>({
  get: () => nearbyRange.value.max,
  set: v => {
    const n = rangeInput(v);
    if (n !== null) nearbyHi.value = n;
  },
});
/** The grey hint beside the range: which ends follow the instant answer now. */
const nearbyRangeHint = computed(() => {
  const want = rangeFromCount(store.rangeCount.date, DATE_RANGE_BOUNDS);
  if (!want) return '';
  return limitsHint({
    min: nearbyLo.value === null && nearbyRange.value.min === want.min,
    max: nearbyHi.value === null && nearbyRange.value.max === want.max,
  });
});
/** An end was set by hand and the instant answer has a count: offer to follow it again. */
const canFollowNearbyRange = computed(
  () => store.rangeCount.date !== null && (nearbyLo.value !== null || nearbyHi.value !== null)
);
function followNearbyRange(): void {
  nearbyLo.value = null;
  nearbyHi.value = null;
}
const inNearbyRange = (k: number) => k >= nearbyRange.value.min && k <= nearbyRange.value.max;
/** The instant answer's route for each count it has (under its "At most N ascensions"), before the range. */
const instantCentres = computed<Record<number, number[]>>(() => {
  const te = Math.floor(store.currentTE);
  const max = instantMax.value;
  const fits = (k: number, r: number[] | undefined): r is number[] =>
    !!r && r.length === k && (max === null || k <= max) && r[0] > te;
  const all: Record<number, number[]> = {};
  for (const [k, r] of Object.entries(instantByCount.value)) if (fits(Number(k), r)) all[Number(k)] = [...r];
  return all;
});
/** The instant answer has routes, but none with a count in the range. */
const nearbyRangeEmpty = computed(() => {
  const ks = Object.keys(instantCentres.value).map(Number);
  return ks.length > 0 && !ks.some(inNearbyRange);
});
const simpleCentres = computed<{ from: 'instant' | 'suggested'; routes: Record<number, number[]> }>(() => {
  const te = Math.floor(store.currentTE);
  const max = instantMax.value;
  const all = instantCentres.value;
  if (Object.keys(all).length) {
    const routes: Record<number, number[]> = {};
    for (const [k, r] of Object.entries(all)) if (inNearbyRange(Number(k))) routes[Number(k)] = r;
    return { from: 'instant', routes };
  }
  const routes: Record<number, number[]> = {};
  for (let n = 1; n <= Math.min(5, max ?? 5); n++) {
    if (!inNearbyRange(n)) continue;
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
// Each search's latest answer (stores/stronger.ts lastSearch), for the comparison block.
useSearchSnapshots('date');
const lines = computed(() => ({
  instant: routeLine(
    'date',
    stronger.instant.date,
    inPlannerZone,
    instantLoad.value === 'none'
      ? instantUnloaded.value
        ? UNLOADED_INSTANT_SUMMARY
        : NO_INSTANT_SUMMARY
      : 'working out…'
  ),
}));
/** The fallback's Nearby routes: how long its boxes may take on this machine; null otherwise. */
const fallbackSeconds = ref<number | null>(null);
/** The routes near the instant answer at a level (simpleByDate.ts BY_DATE_LEVELS), sized on a typical
 *  machine so every computer gets the same boxes. In the no-instant-answer fallback (`fallbackSeconds`)
 *  sized instead to what is left of its time on this machine (search/autoWiden.ts). */
function spaceFor(level: ByDateLevel): SimpleSpace | null {
  if (!(store.currentTE > 0)) return null;
  const cfg = BY_DATE_LEVELS[level];
  const own = fallbackSeconds.value;
  return simpleByDateSpace({
    currentTE: store.currentTE,
    routes: simpleCentres.value.routes,
    widthFor: widthForLevel(level),
    maxSetsPerRow: cfg.maxSetsPerRow,
    secondsOf: own
      ? sp => simplePlanOf(sp, store.workerBudget, store.deadlineWorkerSeconds || weightedSecondsPerLeg(sp)).seconds
      : sp => simplePlanOf(sp, TYPICAL_WORKERS, weightedSecondsPerLeg(sp)).seconds,
    maxSeconds: own ? Math.min(cfg.maxSeconds, own) : cfg.maxSeconds,
  });
}
/** The level the bar is on (Light searches nothing: its boxes are Fast's, for the summary). */
const dateLevel = computed<ByDateLevel>(() =>
  stronger.level === 'normal' || stronger.level === 'thorough' ? stronger.level : 'quick'
);
const simpleSpace = computed<SimpleSpace | null>(() => spaceFor(dateLevel.value));
/** What each level would cost on this computer, before starting (shown under the level bar). */
const levelEstimates = computed<Partial<Record<StrongerLevel, LevelEstimate>>>(() => {
  const out: Partial<Record<StrongerLevel, LevelEstimate>> = {};
  const speed = store.deadlineWorkerSeconds ? `${thisDevice()}'s measured speed` : 'the typical speed';
  for (const l of ['quick', 'normal', 'thorough'] as const) {
    const sp = l === dateLevel.value ? simpleSpace.value : spaceFor(l);
    if (!sp) continue;
    const p = simplePlanOf(sp, store.workerBudget, store.deadlineWorkerSeconds || weightedSecondsPerLeg(sp));
    const t = formatHours(p.seconds / 3600);
    out[l] = {
      short: `~${t}`,
      line: `About ${t} on ${thisDevice()} (${plural(store.workerBudget, 'worker')}, ${speed}): ${plural(p.sets, 'set')} of early stops.`,
    };
  }
  return out;
});
/** The boxes an automatic widening round runs next (search/autoWiden.ts): the last round's, one of
 *  them widened. Only while the fallback goes; null otherwise. */
const simpleNext = ref<{ chains: { asc: number; text: string }[]; lastBox: string } | null>(null);
/** Simple's boxes as chain rows: the last run's while it goes, else the ones worked out now. */
const simpleLive = computed(() =>
  simpleNext.value
    ? simpleNext.value
    : simpleSpace.value
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
  if (!rows.length) return '';
  const counts = new Set(rows.map(r => r.asc)).size;
  // Planned for the run's own boxes once a Nearby run is on screen; else the plan its Find would run.
  const shown = simpleRunBoxes.value === simpleLive.value ? aroundPlan.value : summaryPlan.value;
  const time = shown.legs ? formatHours(shown.seconds / 3600) : '';
  return `Checks ${counts} ascension count${counts === 1 ? '' : 's'}, ~${roundedRoutes(shown.routes).toLocaleString()} routes${time ? `, about ${time} on ${thisDevice()}` : ''}.`;
});
const summaryPlan = computed(() =>
  byDatePlan({
    rows: simpleRunBoxes.value.chains.map(row => ({ asc: row.asc, bands: bandsOf(row) })),
    currentTE: store.currentTE,
    lastHi: rangeOf(simpleRunBoxes.value.lastBox)?.[1] ?? 0,
    instantSets: result.value?.instantSets ?? [],
    workers: store.workerBudget,
    rememberedPerSet: rememberedPerSetOf(simpleRunBoxes.value.chains),
    workerSecondsPerLeg: aroundSecondsPerLeg.value,
  })
);
/** Nearby routes' own numbers, whichever box's run is being planned (`plan` is the run in hand's). */
const aroundSecondsPerLeg = computed(
  () =>
    store.deadlineWorkerSeconds ||
    (simpleSpace.value
      ? weightedSecondsPerLeg(simpleSpace.value)
      : fallbackWorkerSecondsPerLeg(Math.max(1, ...simpleBoxes.value.chains.map(r => Math.floor(r.asc) || 1))))
);
const aroundPlan = computed(() =>
  byDatePlan({
    rows: simpleBoxes.value.chains.map(row => ({ asc: row.asc, bands: bandsOf(row) })),
    currentTE: store.currentTE,
    lastHi: rangeOf(simpleBoxes.value.lastBox)?.[1] ?? 0,
    instantSets: instantSetsOf(simpleBoxes.value.chains),
    workers: store.workerBudget,
    rememberedPerSet: rememberedPerSetOf(simpleBoxes.value.chains),
    workerSecondsPerLeg: aroundSecondsPerLeg.value,
  })
);
/** Why Nearby routes' Find is greyed out, or ''. */
const aroundIssue = computed(() => {
  if (!deadline.value) return '';
  if (deadline.value <= store.planStart) return 'The deadline is before the plan starts.';
  if (!simpleBoxes.value.chains.length || !rangeOf(simpleBoxes.value.lastBox))
    return 'Nothing to check yet: the save has to load first.';
  if (!aroundPlan.value.sets) return 'No route in these boxes goes up from your TE to the last stop.';
  return '';
});
const canStartAround = computed(() => !!deadline.value && !aroundIssue.value && store.currentTE > 0);

/** Simple's boxes into Advanced's chain editor, and Advanced shown: to widen them, or add chains. */
function openInAdvanced(): void {
  const used = simpleRunBoxes.value;
  if (!used.chains.length) return;
  ascFollows.value = false;
  // Each row keeps the width Simple built it with, so its slider says "±2 TE around each stop (from
  // Simple)" rather than the default ±10; moving the width slider clears that, as for a Science card.
  chains.value = used.chains.map(r => {
    const width = simpleSpace.value?.rows.find(x => x.asc === r.asc)?.width ?? 0;
    return { asc: r.asc, text: r.text, ...(width > 0 ? { pm: width, simple: true, widthIx: 0, stepIx: 0 } : {}) };
  });
  lastBox.value = used.lastBox;
  suggestFrom.value = "Set from the routes around the instant answer.";
  mode.value = 'space';
  showExhaustive();
}
/** Scroll to the Exhaustive box (its boxes were just filled in, from Nearby routes or Check exactly). */
function showExhaustive(): void {
  // Its tab first: a hidden tab has no place on the page to scroll to.
  selectSearchTab('by-date', 'exhaustive');
  void nextTick(() => {
    if (typeof document !== 'undefined')
      document.getElementById('exhaustive')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
/** The instant answer's early stops for each ascension count in the chains: tried as sets of their own
 *  on top of the boxes (the run drops any already in one), so its route is always in the space. */
const instantSets = computed<number[][]>(() => instantSetsOf(activeChains.value));
function instantSetsOf(rows: { asc: number }[]): number[][] {
  const te = Math.floor(store.currentTE);
  const out: number[][] = [];
  for (const asc of [...new Set(rows.map(r => Math.floor(r.asc)))].sort((a, b) => a - b)) {
    const route = instantByCount.value[asc];
    if (asc < 2 || !route || route.length !== asc) continue;
    const early = route.slice(0, -1);
    if (early.every((v, i) => v > (i ? early[i - 1] : te))) out.push(early);
  }
  return out;
}
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
function suggestion(k: number): { text: string; from: string; lastGuess: number; coarse: boolean } | null {
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
      ? `Box ${k + 1} was suggested around the instant answer, ${base.around.join(' ')}.`
      : base.from === 'answer'
        ? `Box ${k + 1} was suggested around your last answer, ${base.around.join(' ')}.`
        : base.from === 'route'
          ? `Box ${k + 1} was suggested around your route, ${base.around.join(' ')}.`
          : `Box ${k + 1} was spaced evenly: no answer or route to start from yet.`;
  // Sized to the slider (search/deadlineSuggest.ts): the first stop at every TE from just above
  // yours, the later ones as fine and as wide as the size allows, and never over MAX_SUGGESTED_SETS
  // (coarser steps first): a TE 93 box at ±30 every TE was 57,650,850 sets.
  const lastHi = lastRange.value?.[1] ?? Math.min(490, lastGuess + 20);
  const sug = cappedStopsByWidth(te, early, lastHi, widthOf(row), stepOf(row));
  return sug ? { text: sug.text, from, lastGuess, coarse: sug.coarse } : null;
}

/** Per chain: its box is Suggest a space's, coarsened to stay under MAX_SUGGESTED_SETS (the note says so). */
const coarseRows = computed(() =>
  chains.value.map((row, k) => {
    if (!row.auto || row.asc < 2 || !row.text) return false;
    const sug = suggestion(k);
    return !!sug?.coarse && sug.text === row.text;
  })
);

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

/** The Ascensions box of a row changed by hand: that count is the player's from now on. */
function setRowAsc(k: number, n: number): void {
  const row = chains.value[k];
  if (!row) return;
  ascFollows.value = false;
  row.asc = n;
}
function removeRow(k: number): void {
  ascFollows.value = false;
  chains.value.splice(k, 1);
}
/** The instant answer's best By a date route's count (InstantRoute's lead, stores/stronger.ts). */
const dateBestCount = computed(() => stronger.instant.date?.chain.length ?? null);
/**
 * With no instant answer (below TE 120), the best count of a By a date answer the boxes can centre on
 * (autoWiden.ts `canCentreOn`: this date, priced near this TE), e.g. the quick scan's. The default box
 * follows it, so Suggest a space centres on that answer's own route ("answer") rather than spacing a
 * count it never tried evenly: the quick scan answers 1 to 5 ascensions, and a 6-ascension box spaced
 * evenly was the 57,650,850-set box of the 18 Oct beta test.
 */
const answerBestCount = computed(() => {
  const r = store.deadlineResult;
  if (!r || !deadline.value) return null;
  const answer = { deadline: r.deadline, te: r.te, chains: r.byStops.map(x => x.chain) };
  if (!canCentreOn({ answer, deadline: deadline.value, currentTE: store.currentTE })) return null;
  const best = r.routes[0]?.chain;
  return best && r.byStops.some(x => x.chain.length === best.length) ? best.length : null;
});
/** The count the default box follows: the instant answer's, else that answer's. */
const followCount = computed(() => dateBestCount.value ?? answerBestCount.value);
/**
 * The one default box follows that count (lib/limitsFollow.ts `boxCountFromBest`, 1..8): it was a fixed
 * 4, so a player whose best By a date route had 6 ascensions proved the best of 4s. Only the default:
 * one box, filled by Suggest a space or empty, not restored or from a request, and only while nothing
 * runs or is being carried on (a run keeps its own boxes).
 */
function followDateBest(): void {
  if (!ascFollows.value || linked.value || store.deadlineRunning || store.preparing) return;
  const n = boxCountFromBest(followCount.value);
  const row = chains.value[0];
  if (n === null || chains.value.length !== 1 || !row || row.restored || row.centre) return;
  if (row.text && !row.auto) return;
  if (row.asc === n) {
    // Same count, but an answer to centre on may have just arrived (a run ended): re-suggest around it.
    if (dateBestCount.value === null && row.auto && store.currentTE > 0) suggestRow(0);
    return;
  }
  row.asc = n;
  if (n < 2) {
    row.text = '';
    return;
  }
  if (store.currentTE > 0) suggestRow(0);
}
/** Box 1 is still the default, at the instant answer's count (the grey hint beside its Ascensions). */
const boxFromInstant = computed(
  () =>
    ascFollows.value &&
    chains.value.length === 1 &&
    dateBestCount.value !== null &&
    chains.value[0]?.asc === boxCountFromBest(dateBestCount.value)
);

const rowProblems = computed(() => chains.value.map((_, k) => rowProblem(k)));
const rowSummaries = computed(() => chains.value.map((_, k) => rowSummary(k)));
/** A box typed in (or a band checker's "did you mean" taken): the player's own now, so Suggest a space
 *  and the sliders leave it alone, and a Science card's centring no longer applies. */
function typedRow(k: number, text: string): void {
  const row = chains.value[k];
  if (!row) return;
  ascFollows.value = false;
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
  // Single-value boxes are Exhaustive's: show them there.
  showExhaustive();
  ascFollows.value = false;
  chains.value = [{ asc: chain.length, text: chain.slice(0, -1).join('; ') }];
  lastBox.value = `${Math.max(te + 1, last - 5)}-${Math.min(490, last + 5)}`;
  suggestFrom.value = `Set from the instant answer's route, ${chain.join(' ')}.`;
}

/** A new chain one ascension shorter than the shortest, since the short ones are what get added. */
function addChain(): void {
  ascFollows.value = false;
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
  // A Science card fills Exhaustive's boxes (always on the page now).
  if (req.eggDay) {
    useEggDay();
    customDate.value = false;
  }
  mode.value = 'space';
  ascFollows.value = false;
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
// Box 1 follows the instant answer's count (`followDateBest`), after `linked` and the first fill.
watch([followCount, () => store.deadlineRunning, () => store.preparing], followDateBest, { immediate: true });

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
const rememberedPerSet = computed(() => rememberedPerSetOf(activeChains.value));
function rememberedPerSetOf(rows: { asc: number; text: string }[]): number {
  return store.deadlineRoutesPerSet(
    rows.map(row => (row.asc <= 1 ? [] : bandsOf(row).map(b => [...b])))
  );
}
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
    workers: Math.max(1, store.workerBudget),
  };
});
const plan = computed(() => (mode.value === 'space' ? spacePlan.value : autoPlan.value));
/** The run's time on the default count (half the cores): a long one is held to LONG_RUN_WORKERS (store
 *  `fitWorkersToRun`), unless the count was set by hand. */
const secondsAtDefault = computed(() =>
  plan.value.legs ? legSeconds(plan.value.legs, defaultWorkerCount(), workerSecondsPerLeg.value) : 0
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
/** The run's own first guess, quoted beside the live figure, with the workers it was for when the run
 *  is on a different count now (hidden onto fewer, the slider moved): "6 min for 7 workers, 2 now". */
const firstGuessLabel = computed(() => {
  const t = timeLeft.value;
  if (!t?.firstGuess) return '';
  const label = formatHours(t.firstGuess / 3600);
  return t.firstGuessWorkers && t.firstGuessWorkers !== t.workersNow
    ? `${label} for ${t.firstGuessWorkers} workers, ${t.workersNow} now`
    : label;
});
/** Before a run, with "When this tab is in the background" set lower: the time on that many workers,
 *  since a run left in the background spends its time there (Safari, 10 Oct: 6 min said, 20 taken). */
const backgroundLabel = computed(() => {
  const bg = store.backgroundWorkers;
  if (store.deadlineRunning || !plannedLegs.value || !(bg > 0) || bg >= store.workerBudget) return '';
  return `${formatHours(legSeconds(plan.value.legs, bg, workerSecondsPerLeg.value) / 3600)} if left in the background (${bg} worker${bg === 1 ? '' : 's'})`;
});
const costLabel = computed(() => `${secondsPerLeg.value.toFixed(secondsPerLeg.value < 10 ? 2 : 1)} s`);
/**
 * Above 300,000 routes, the amber note under the estimate (search/bigBox.ts): the "~N routes" shown
 * under Legs to simulate and the Est. wall clock beside it, with what the speed came from. Before a
 * run only: during one the time left is the run's own.
 */
const bigBox = computed(() => (store.deadlineRunning || !plannedLegs.value ? null : bigBoxNote(bigBoxInput.value)));
/** The note's figures: the "~N routes" and Est. wall clock, what the speed came from. What Exhaustive's
 *  Find asks with too. */
const bigBoxInput = computed<BigBoxInput>(() => ({
  routes: roundedRoutes(plannedRoutes.value),
  approximate: true,
  seconds: plan.value.seconds,
  workers: store.workerBudget,
  basis: store.deadlineWorkerSeconds
    ? `${thisDevice()}'s speed from its last By a date search`
    : "the typical speed for routes this long in players' runs",
  device: thisDevice(),
  where: 'site',
}));

const runEstimate = ref(0);
// The run's live figures (time so far, the estimate's basis, legs simulated) are in the run bar's Details
// (RunProgressBar.vue, lib/runDetails.ts) since the in-page progress went (16 Oct 2026).

const startIssue = computed(() => {
  if (!deadline.value) return '';
  if (deadline.value <= store.planStart) return 'The deadline is before the plan starts.';
  if (simple.value && !activeChains.value.length) return 'Nothing to check yet: the save has to load first.';
  if (mode.value === 'space') {
    if (!simple.value && lastTooHigh.value) return LAST_TOO_HIGH;
    if (!runLastRange.value) return 'Give the last stop a range above your TE now.';
    const bad = activeChains.value.findIndex(row => !!problemOf(row, runLastRange.value));
    if (bad >= 0) return `Box ${bad + 1}: ${problemOf(activeChains.value[bad], runLastRange.value)}`;
    if (!spaceShapes.value && !instantSets.value.length)
      return 'No route in these boxes goes up from your TE to the last stop.';
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
    ascFollows.value = false;
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

/** Each box's run controls (Stepping away?'s countdown Cancel is in whichever started it). */
const stepAway = ref<InstanceType<typeof RunControls>[]>([]);
function cancelAutoCarryOn(): void {
  for (const c of stepAway.value) c?.cancel();
}
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
  // Back in its own box: a Nearby routes run's boxes are its spec's, not the editor's.
  lastKind.value = spec?.simple ? 'around' : 'boxes';
  if (spec?.simple && spec.bandSets?.length) {
    fillDateFromSpec(spec);
    simpleUsed.value = {
      chains: spec.bandSets.map(set => ({ asc: set.length + 1, text: set.map(b => formatBand(b)).join('; ') })),
      lastBox: `${spec.lastLo ?? Math.floor(store.currentTE) + 1}-${spec.lastHi}`,
    };
    mode.value = 'space';
  } else if (spec) {
    fillFromSpec(spec);
  }
  runEstimate.value = spec?.estimate ?? 0;
  // A run started with Find and submit (or agreed to share during it) carries on doing so, on its own
  // name, CSV and diagnostics choices: on 9 Oct a carried-on Find and submit run ended as a plain
  // Find and sent nothing.
  // Not once the account's agreement was withdrawn since (store `carriedYesHolds`).
  const recorded = store.deadlineUnfinished?.submit ?? null;
  const submit = recorded && store.carriedYesHolds() ? recorded : null;
  if (submit) {
    // The run's recorded yes, for this visit only.
    agreeThisVisit('leaderboard');
    shareAnonymous.value = !submit.nickname;
    // This screen's alone (composables/useShareResult.ts): the run's own name, not typed now.
    if (submit.nickname) shareName.value = submit.nickname;
    shareExtras.sendCsv.value = submit.sendCsv;
    shareExtras.sendDiagnostics.value = submit.sendDiagnostics;
  }
  autoShare.value = !!submit?.whenDone;
  autoShared.value = false;
  store.lastAutoSend = null;
  store.submitsWhenDone = autoShare.value;
  store.beginBestSoFar('deadline', submit ? { nickname: submit.nickname } : null);
  let go = false;
  try {
    await store.resumeDeadline(props.playerId);
    // Read live: a withdraw during the run cleared `submitsWhenDone` (store `withdrawShareConsent`).
    go = (autoShare.value && store.submitsWhenDone) || (await owesAnswer());
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
  // Not once the player withdrew (store `owedRow`).
  const owed = store.owedRow('deadline');
  if (!agreed && owed) {
    shareAnonymous.value = !owed.nickname;
    if (owed.nickname) shareName.value = owed.nickname;
  }
  return agreed || !!owed;
}

/** Send the answer on screen, as Find and submit does at the end. */
async function shareFinished(): Promise<void> {
  // Withdrawn during the run: nothing goes.
  if (!result.value || !best.value || store.error || store.shareWithdrawn) return;
  // The send needs the box ticked; the run's yes counts for this visit only.
  agreeThisVisit('leaderboard');
  autoShared.value = true;
  await share();
  store.lastAutoSend = { kind: 'by-date', ok: shareOk.value, text: shareMessage.value };
}

/** Set while a Find and submit run is going: it shares its best answer when it finishes. */
const autoShare = ref(false);
/** This panel shared the last answer by itself (Find and submit, or a run that owed its answer): the
 *  report beside Find says how it went. Cleared when a run starts. */
const autoShared = ref(false);
/** The answer on screen went with its run: Share this result gives way to one line. A send that failed
 *  (or was kept off the board) keeps the box, so it says so and can still be sent by hand. */
const sentByRun = computed(
  () => autoShared.value && !store.deadlineRunning && shareOk.value && (sharing.value || sentKey.value === resultKey.value)
);

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
  autoStop.value = true;
  store.stopDeadline();
}

/** Find (or Find and submit) in box `kind`: Nearby routes' or Exhaustive's. */
async function start(andSubmit: boolean, kind: ByDateKind, asked = false): Promise<void> {
  if (store.busy || instantWait.value) return;
  // Exhaustive above 100,000 routes asks first, before anything is set: a Cancel starts nothing and
  // leaves nothing behind (search/bigBox.ts, BigBoxConfirm.vue). Read before `startingKind` is set, while
  // the plan is Exhaustive's (`readsAround`). Nearby routes (and its automatic widening) does not ask;
  // `asked`: Widen and run again already did.
  if (kind === 'boxes' && !asked && !(await confirmBigBox(bigBoxInput.value))) return;
  if (store.busy || instantWait.value) return;
  // The run reads this box's routes from here on (`simple`), and its workers fit this run.
  startingKind.value = kind;
  lastKind.value = kind;
  store.fitWorkersToRun(secondsAtDefault.value);
  autoShare.value = andSubmit && shareOptIn.value;
  autoShared.value = false;
  store.lastAutoSend = null;
  // For the progress bar on other tabs: this run shares its answer when it finishes.
  store.submitsWhenDone = autoShare.value;
  // Send best so far, with the consent Find and submit already has (or asked for during the run).
  store.beginBestSoFar('deadline', autoShare.value ? { nickname: bestSoFarName() } : null);
  try {
    if (kind === 'around' && simple.value && simpleFrom.value !== 'instant') {
      // The instant answer still being worked out: wait for it to settle (at most 10 seconds), then run
      // around it if it came in with a route, else the fallback (search/autoWiden.ts `awaitInstant`).
      const d = await awaitInstant({
        read: () => instantNow.value,
        onWait: () => (instantWait.value = INSTANT_WAIT_STATUS),
        cancelled: () => unmounted,
      });
      instantWait.value = '';
      if (unmounted) return;
      if (d.go === 'normal') await find();
      else await findWithoutInstant(d.timedOut);
    } else await find();
  } finally {
    startingKind.value = null;
    // Read live: a withdraw during the run cleared `submitsWhenDone` (store `withdrawShareConsent`).
    const armed = autoShare.value && store.submitsWhenDone;
    store.submitsWhenDone = false;
    const go = armed || (await owesAnswer());
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

async function find(fallback?: DeadlineFallback): Promise<void> {
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
      // The level bar's level (Fast / Exact / Very high), for the board row's `level`.
      ...(simple.value ? { simple: true, level: dateLevel.value } : {}),
      ...(simple.value && fallback ? { fallback: { ...fallback } } : {}),
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

/**
 * Nearby routes with no instant answer for this TE (search/autoWiden.ts): a quick scan places the
 * boxes when there is no earlier answer to centre them on, Nearby routes runs in them, and a box whose
 * edge the best route sits on is widened and run again (`AUTO_WIDEN_ROUNDS`, only that box). All of it
 * is held to about 15 min on this machine (`FALLBACK_BUDGET_SECONDS`): Nearby routes' boxes are sized
 * to what is left after the scan, and a round starts only when it fits. Each run is an ordinary By a
 * date run on the player's own settings; Stop ends it all, and the best route found so far stays.
 */
const autoStatus = ref('');
/** InstantRoute's `state`: its answer still being worked out, in, or settled with none. */
const instantLoad = ref<InstantState>('none');
/** InstantRoute's `unloaded`: its file couldn't be loaded. */
const instantUnloaded = ref(false);
/** The instant answer as Find on Nearby routes reads it: in only with a route the boxes centre on. */
const instantNow = computed<InstantState>(() =>
  instantLoad.value === 'loading' ? 'loading' : simpleFrom.value === 'instant' ? 'answer' : 'none'
);
/** Find waits for the instant answer to settle: the line it shows meanwhile, '' otherwise. */
const instantWait = ref('');
let unmounted = false;
onUnmounted(() => (unmounted = true));
/** A widening round's boxes: the box holding the best route widened to `text`, the other counts as their
 *  best route (search/autoWiden.ts `roundChains`). */
function nextRoundChains(text: string): { asc: number; text: string }[] {
  return roundChains({
    chains: simpleRunBoxes.value.chains,
    row: edgeBox.value?.row ?? -1,
    text,
    byStops: store.deadlineResult?.byStops.map(r => r.chain) ?? [],
  });
}
/** About how long these boxes take on this machine (the same estimate as Nearby routes' own). */
function boxesSeconds(rows: { asc: number; text: string }[], lastBox: string): number {
  return byDatePlan({
    rows: rows.map(row => ({ asc: row.asc, bands: bandsOf(row) })),
    currentTE: store.currentTE,
    lastHi: rangeOf(lastBox)?.[1] ?? 0,
    instantSets: [],
    workers: store.workerBudget,
    rememberedPerSet: rememberedPerSetOf(rows),
    workerSecondsPerLeg: aroundSecondsPerLeg.value,
  }).seconds;
}
/** Stop pressed during the fallback: no further run starts (the store's own flag resets each run). */
const autoStop = ref(false);

/**
 * Get a quick estimate, where the instant answer would be (NoInstantAnswer.vue): exactly Find on Nearby
 * routes with no instant answer, with no send (`start`, which goes to `findWithoutInstant`). Nothing new
 * runs here; the card reads the same status line and answer the Nearby routes box shows.
 */
const quickIssue = computed(() =>
  quickEstimateIssue({
    setupLoaded: store.setupLoaded,
    busy: store.busy || !!instantWait.value,
    blocked: store.integrityBlocked || store.staleBackupBlocked,
    canStart: canStartAround.value,
    issue: aroundIssue.value,
  })
);
function quickEstimate(): void {
  if (quickIssue.value) return;
  void start(false, 'around');
}
/** Nearby routes' run going (or Find waiting on the instant answer for it): with no instant answer, the
 *  fallback. */
const quickRunning = computed(() => runKind.value === 'around');
const quickStatus = computed(
  () =>
    instantWait.value ||
    autoStatus.value ||
    `${NAMES.smart} is checking the routes near your last answer. Stop keeps the best route so far…`
);
/** The fallback's answer (`fallback` on the result), once it is done. */
const quickBest = computed(() => {
  const r = result.value as SavedDeadlineResult | null;
  return r?.fallback && resultKind.value === 'around' && !store.deadlineRunning ? best.value : null;
});
/** The Nearby routes tab, at its run or its answer. */
function showQuickRun(): void {
  selectSearchTab('by-date', 'nearby');
  void nextTick(() => scrollToShownId(quickRunning.value ? 'bd-around-controls' : 'bd-around-results'));
}

async function findWithoutInstant(timedOut = false): Promise<void> {
  autoStop.value = false;
  /** The whole fallback is held to about 15 min on this machine (search/autoWiden.ts). */
  const t0 = Date.now();
  const elapsed = () => (Date.now() - t0) / 1000;
  /** Every answer the fallback went past, for dropping its kept send at the end (store `dropDeadlineSends`). */
  const went: number[] = [];
  /** The last run was stopped (here, or by the run bar's Stop & keep best) or failed: read from the run
   *  itself, before an earlier answer is put back over it. */
  let lastStopped = false;
  const noteRun = () => {
    const now = store.deadlineResult;
    lastStopped = autoStop.value || !now || !!store.error || now.stoppedEarly;
    if (now) went.push(now.at);
  };
  const ended = () => autoStop.value || lastStopped;
  /** After a run: the answer before it comes back if this one did not match it (stopped, or failed). */
  const keepBest = async (prev: SavedDeadlineResult | null): Promise<void> => {
    noteRun();
    if (prev && !betterRoute(store.deadlineResult?.routes[0], prev.routes[0])) await store.restoreDeadlineResult(prev);
  };
  try {
    // An earlier answer centres the boxes only for this date and near this TE (`canCentreOn`).
    const earlier = store.deadlineResult;
    const scanned = needsQuickScan({
      hadInstant: false,
      answer: earlier
        ? { deadline: earlier.deadline, te: earlier.te, chains: earlier.byStops.map(r => r.chain) }
        : null,
      deadline: deadline.value,
      currentTE: store.currentTE,
    });
    // Gave up waiting for the instant answer: the line says so.
    if (timedOut) autoStatus.value = INSTANT_TIMEOUT_STATUS;
    if (scanned) {
      autoStatus.value = timedOut ? `${INSTANT_TIMEOUT_STATUS} ${QUICK_SCAN_STATUS}` : QUICK_SCAN_STATUS;
      // Nothing frozen from an older run while the scan goes: its boxes come from the scan's answer.
      simpleUsed.value = null;
      await store.startDeadline(
        props.playerId,
        quickScanSpec({
          currentTE: store.currentTE,
          deadline: deadline.value,
          guessHi: rangeOf(simpleLive.value.lastBox)?.[1] ?? 0,
          ascendNeeded: ascendNeeded.value,
          level: dateLevel.value,
        })
      );
      noteRun();
      if (ended()) return;
    }
    // Nearby routes' boxes sized to what is left of the time.
    fallbackSeconds.value = nearbyBudgetSeconds(elapsed());
    if (scanned) autoStatus.value = afterScanStatus(fallbackSeconds.value);
    // Whatever Nearby routes' Find would have refused (the deadline moved, nothing to check).
    if (aroundIssue.value) return;
    // The boxes now centre on the scan's best route for each count (`simpleCentres`, "answer").
    // Only this fallback's own answers are put back: an older run's may be for another date.
    let prev = scanned ? store.deadlineResult : null;
    await find({ scanned, widenRounds: 0 });
    await keepBest(prev);
    await runAutoWiden({
      read: () => ({
        hadInstant: !!result.value?.instantSets?.length,
        bands: edgeBox.value?.bands ?? null,
        chain: best.value?.chain ?? null,
        currentTE: edgeTE.value,
        stopped: ended(),
        busy: store.busy,
      }),
      onStatus: text => (autoStatus.value = text),
      // A round starts only when its estimate on this machine fits what is left of the time.
      fits: d =>
        roundFits({
          elapsedSeconds: elapsed(),
          roundSeconds: boxesSeconds(nextRoundChains(d.text), simpleRunBoxes.value.lastBox),
        }),
      runRound: async d => {
        const used = simpleRunBoxes.value;
        // Only the widened box runs again; every other count as just its best route (`roundChains`).
        simpleNext.value = { chains: nextRoundChains(d.text), lastBox: used.lastBox };
        prev = store.deadlineResult;
        await find({ scanned, widenRounds: d.round });
        await keepBest(prev);
      },
    });
  } finally {
    simpleNext.value = null;
    fallbackSeconds.value = null;
    autoStatus.value = '';
    // Only the answer on screen waits to be sent; the rounds it went past don't.
    const kept = store.deadlineResult?.at;
    const drop = went.filter(at => at !== kept);
    if (drop.length) void store.dropDeadlineSends(drop);
  }
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
/** A row's arrow (RouteTimeline.vue): only a route with its legs has stops to show. */
const hasLegs = (r: { legs?: unknown }): boolean => Array.isArray(r.legs) && r.legs.length > 0;
/** Share this result's "Note on this run": the result's own note, edited in place, so the send and
 *  its CSV carry what the box says. */
const resultNote = computed({
  get: () => store.deadlineResult?.note ?? '',
  set: (v: string) => {
    if (store.deadlineResult) store.deadlineResult.note = v;
  },
});
/** What Save this answer names an answer saved with an empty box (SavedAnswers.vue). */
const defaultAnswerLabel = computed(() => {
  const r = store.deadlineResult;
  const best = r?.routes[0];
  return best ? `${best.chain[best.chain.length - 1]} TE by ${inPlannerZone(r.deadline)}` : 'Name this answer';
});
/** The card's Save answer: kept under the default name, as Fastest's Save run (SavedAnswers below
 *  saves under a name of your own). */
const quickSaving = ref(false);
const quickSaveNote = ref('');
async function quickSave(): Promise<void> {
  quickSaving.value = true;
  try {
    await store.saveCurrentAnswer(props.playerId, defaultAnswerLabel.value);
    quickSaveNote.value = `Saved as "${defaultAnswerLabel.value}".`;
  } catch {
    quickSaveNote.value = "Couldn't save it in this browser.";
  } finally {
    quickSaving.value = false;
  }
}
watch(
  () => store.deadlineResult,
  () => (quickSaveNote.value = '')
);
onMounted(() => void store.loadDeadlineState(props.playerId));
// The integrity check up front, as Fastest's panel has it: By a date must not depend on Fastest
// having been opened for the notice beside Find (and Find's block) to show.
useIntegrityProbe(() => props.playerId);
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
/** The running search's best so far, for its card: the live top's first, else the progress's own. */
const liveBest = computed(() => {
  const p = store.deadlineProgress;
  return p?.top[0] ?? p?.best ?? null;
});

/** Simulate this plan on the answer, or on the best so far (search/byDateSimulate.ts): the run's own
 *  plan start and first-ascension setting, into Your plan as the instant answer's rows go. */
const resultSim = computed(() => {
  const r = result.value as SavedDeadlineResult | null;
  return r && best.value
    ? byDateSimulate(best.value, {
        planStart: r.planStart,
        firstAscension: r.settings ? readFirstAscension(r.settings) : null,
      })
    : null;
});
const liveSim = computed(() =>
  liveBest.value
    ? byDateSimulate(liveBest.value, {
        planStart: store.deadlineRunPlan?.planStart,
        firstAscension: store.deadlineRunPlan?.firstAscension,
      })
    : null
);
function simulateResult(): void {
  const s = resultSim.value;
  if (s) simulateRoute(s.chain, 'by-date', s.opts);
}
function simulateLive(): void {
  const s = liveSim.value;
  if (s) simulateRoute(s.chain, 'by-date', s.opts);
}

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
/**
 * The TE "Widen and run again" would start from: the save loaded now, or the run's own TE if that is
 * higher. A result priced on an older save (a lower TE) used to judge the 1st stop against that TE,
 * so a 1st stop at your TE + 1 read as an edge the wider box could not move.
 */
const edgeTE = computed(() => Math.max(result.value?.te ?? 0, store.currentTE > 0 ? store.currentTE : 0));
const edges = computed<BandEdge[]>(() => {
  const box = edgeBox.value;
  const b = best.value;
  if (!box || !b || !result.value) return [];
  return findBandEdges(box.bands, b.chain, { currentTE: edgeTE.value, finalTE: b.chain[b.chain.length - 1] });
});
/** The run had no instant answer to start from (none for this TE yet): its boxes were a rough guess.
 *  Runs record the instant answer's early stops they tried (`instantSets`); a route of one stop has
 *  no boxes to guess. */
const noInstantNote = computed(() => {
  const r = result.value as SavedDeadlineResult | null;
  if (!r || !best.value || store.deadlineRunning || best.value.chain.length < 2) return '';
  if (r.instantSets?.length) return '';
  // Found by the no-instant-answer fallback (search/autoWiden.ts): it says what it did instead.
  if (r.fallback) return autoFallbackNote(r.fallback);
  return noInstantAnswerText(!!edges.value.length && !!edgeWiden.value);
});
/** A Simple run's box around the best route is narrow: each early stop ±1 TE or less, or the best
 *  route is the instant answer's own, outside every box. Unknown (no boxes recorded): not narrow. */
const narrowBox = computed(() => {
  const r = result.value as SavedDeadlineResult | null;
  if (!r?.simple || !r.bandSets?.length || !best.value) return false;
  const box = edgeBox.value;
  return !box || box.bands.every(b => b.length <= 3);
});
/** "A better route may exist: ..." (search/oneMoreTE.ts), not while a run is going. */
const oneMoreTE = computed(() => {
  const r = result.value as SavedDeadlineResult | null;
  if (!r || !best.value || store.deadlineRunning) return null;
  return oneMoreTEHint({
    route: best.value,
    stoppedEarly: !!r.stoppedEarly,
    narrow: narrowBox.value,
    onEdge: edges.value.length > 0,
    runCost: r.lastTECost ?? null,
  });
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
  const text = widenEdges(box.bands, edges.value, { currentTE: edgeTE.value, finalTE: 490 });
  if (!text) return null;
  const asc = box.bands.length + 1;
  // From Nearby routes the rows are the run's boxes (widenAndRun opens them in Exhaustive in this order).
  const rows = result.value.simple ? simpleRunBoxes.value.chains : chains.value;
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
  // From Nearby routes: its boxes into Exhaustive first (the same rows, in the same order), widened
  // there, and run as Exhaustive.
  // What a Cancel of the big-box question puts back: the boxes as they were before the widening.
  const before = {
    chains: chains.value.map(r => ({ ...r })),
    lastBox: lastBox.value,
    mode: mode.value,
    ascFollows: ascFollows.value,
    suggestFrom: suggestFrom.value,
  };
  if (result.value?.simple) openInAdvanced();
  typedRow(w.row, w.text);
  await nextTick();
  if (!canStart.value) return;
  // The wider box asks first when it is big (search/bigBox.ts), with its own estimate now on screen; a
  // Cancel leaves the boxes as they were and starts nothing.
  if (!(await confirmBigBox(bigBoxInput.value))) {
    chains.value = before.chains;
    lastBox.value = before.lastBox;
    mode.value = before.mode;
    ascFollows.value = before.ascFollows;
    suggestFrom.value = before.suggestFrom;
    return;
  }
  await start(false, 'boxes', true);
}
const atCeiling = computed(
  () => !!best.value && best.value.chain[best.value.chain.length - 1] >= (result.value!.ceiling ?? result.value!.lastHi)
);

function inPlannerZone(unixSeconds: number): string {
  return showDateTime(unixSeconds, plannerZone.value);
}
/** The hours and time off the answer was priced with: its own recorded settings, never the live setup
 *  (lib/pricedWith.ts); '' for an answer from before settings were recorded. */
const resultPricedWith = computed(() => (result.value?.settings ? pricedWithLine(result.value.settings) : ''));
</script>
