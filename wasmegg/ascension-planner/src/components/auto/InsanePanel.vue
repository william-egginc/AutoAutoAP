<!--
  The exhaustive search, unguarded. Reached only by URL (`?insane=1`), never linked.

  WHAT MAKES IT DIFFERENT FROM THE MAIN PANEL. That one runs the staged search: coordinate descent
  with slices, which returns a strong local optimum and says so. This prices EVERY chain over a
  pool you describe, so its winner is the true optimum of that space. It is the only mode in this
  project that can prove anything, and the only reason the README can say "rank 1 of 4913".

  NO EFFORT TIER. Effort tiers are stop points in the staged search's stage list; exhaustive has no
  stages. The knobs here are the ones that actually define the space: which checkpoint values to
  choose from, how finely, and how many ascensions.

  NO SAFETY CAP. The CLI refuses past 5,000 chains without `--yes`, which is right for a flag you
  can typo into a terminal. Here the count and the wall-clock estimate update as you type, on a page
  you had to know the URL for, so a cap would only ever block someone who already knew.

  NO PRUNING TOGGLE, because there is nothing honest to put behind it. Pruning by prefix cost is
  inadmissible -- a prefix that arrives later can arrive with a higher delivery rate and win overall
  -- and when it was implemented and measured it cut 0 of 69 chains. Exhaustive means exhaustive.
-->
<template>
  <div :class="embedded ? 'relative overflow-hidden' : 'section-premium p-4 sm:p-8 max-w-4xl mx-auto mt-6 relative overflow-hidden'">
    <div class="absolute -right-20 -top-20 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl"></div>

    <div class="relative z-10 space-y-6">
      <!-- Each screen has its own heading (FastestRoute.vue, ByDateScreen.vue). -->
      <!-- A sweep requested from the Science tab's "What we need to check" list: everything is filled
           in already, so the only decisions left are how much of the machine to give it and whether
           the time is acceptable. -->
      <div v-if="sweepRequest" class="p-4 rounded-xl border border-indigo-200 bg-indigo-50 space-y-3">
        <div class="space-y-1">
          <p class="text-indigo-400 label">
            Sweep request from {{ NAMES.science }}
          </p>
          <h3 class="text-body font-bold text-slate-900">{{ sweepRequest.label }}</h3>
          <p class="text-body text-slate-600 max-w-prose">
            Ranges <code class="rounded bg-white px-1 text-small">{{ bandsText }}</code
            >, minimum gap {{ minGap
            }}<template v-if="sweepRequest.firstAscension !== null"
              >, {{ describeFirstAscension(sweepRequest.firstAscension) }}</template
            >. These are already filled in below.
          </p>
          <p class="text-body text-slate-600 max-w-prose">
            This sweep fills a gap in the shared data for science. It isn't tuned to find your best route; use
            {{ NAMES.smartFirst }} or the instant answer for that.
          </p>
          <p class="text-body text-slate-600 max-w-prose">
            <template v-if="timeOffText">
              Planned around time off: <b>{{ timeOffText }}</b
              >. It still prices every route, but the result goes on the Leaderboard with the time-off runs and won't fill
              this gap.
            </template>
            <template v-else>
              Taking time off, like Egg Day or a trip?
              <button type="button" class="font-bold text-indigo-700 underline" @click="ui.openSetupRequested++">
                Add it in Setup
              </button>
              and the sweep still prices every route around it.
            </template>
          </p>
        </div>

        <div class="grid gap-2 sm:grid-cols-3 text-small">
          <div class="rounded-lg bg-white px-3 py-2">
            <div class="label text-slate-400">Routes</div>
            <div class="font-bold text-slate-800">{{ chainCountLabel }}</div>
          </div>
          <div class="rounded-lg bg-white px-3 py-2">
            <div class="label text-slate-400">Estimated time</div>
            <div class="font-bold text-slate-800">{{ estimateLabel }}</div>
            <div class="text-small text-slate-400">
              {{ measuredCost ? 'measured on this machine' : speedSourceLabel }}
            </div>
          </div>
          <div class="rounded-lg bg-white px-3 py-2 flex items-center">
            <button
              type="button"
              :disabled="store.isRunning"
              class="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 text-body font-bold hover:bg-indigo-50 disabled:opacity-40"
              @click="benchmark"
            >
              {{ measuredCost ? 'Re-benchmark' : 'Benchmark my PC' }}
            </button>
          </div>
        </div>

        <label class="block space-y-1">
          <span class="flex items-baseline justify-between text-body font-bold text-slate-700">
            <span>How much of {{ thisDevice() }} to use</span>
            <span>{{ store.workerBudget }} of {{ store.machineThreads }} workers</span>
          </span>
          <input
            type="range"
            min="1"
            :max="store.machineThreads"
            :value="store.workerBudget"
            class="w-full accent-indigo-600"
            @input="setWorkers(($event.target as HTMLInputElement).value)"
          />
          <span class="block text-small text-slate-500">
            Fewer workers keep the computer usable and quieter; more finish sooner, up to a point (on the one 20-thread
            PC we measured, 12 workers were as fast as 19). The estimate above follows the
            slider. You can move it during a run too: the change takes effect within about a minute, and no route in
            progress is lost.
          </span>
        </label>

        <!-- The account's "I understand" for a science sweep (ConsentBox.vue, composables/useConsent.ts), the
             same one as Science's sweep runner. Withdrawn during the run: the result is not sent. -->
        <ConsentBox
          v-model="sweepConsent"
          consent-id="scienceSweep"
          testid="sweep-consent"
          label-class="text-body text-slate-700"
          summary-class="text-body text-slate-700"
          withdrawn-text="Withdrawn: this sweep's result will not be sent."
        >
          <template #summary>
            <span>You agreed this sweep is sent to the board automatically when it finishes</span>
          </template>
          <template #text>
          <span>
            I understand this takes about <b>{{ estimateLabel }}</b
            >, that this tab has to stay open (and the computer awake) until it finishes, and that the result is then
            <b>sent to the board automatically</b>. What gets sent: the route, its timings and the full CSV, with my
            artifact inventory, timezone and local plan start, plus a random code this browser keeps for the account
            (never my player ID, and never shown). The code folds my repeated sends together, lets me put my name on a
            run sent anonymously, and lets my own later runs replace my older plans. In its last few seconds the sweep
            also re-prices my best three plans already on the board from this save, and those are sent too (named ones
            with a named send, anonymous ones with an anonymous send).
          </span>
          </template>
        </ConsentBox>
        <!-- The one sharing line and its Change (SharingSummary.vue, ux29 #11), on the same values as the Submit
             section at the bottom: anonymous unless the player picks otherwise. -->
        <SharingSummary
          ref="sweepSharing"
          v-model:anonymous="anonymous"
          v-model:nickname="nickname"
          :on="sweepConsent"
          :disabled="store.isRunning"
          class="pl-6 text-body text-slate-700"
          @nickname-typed="nicknameTouched = true"
        />
        <RunNoteBox v-model="store.runNote" :disabled="store.isRunning" class="pl-6 text-small text-slate-700" />

        <IntegrityNotice />
        <p
          v-if="ascMismatch"
          class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-body font-bold text-rose-800"
        >
          The Ascensions box ({{ suggestAsc }}) no longer matches this sweep ({{
            plural(bands.length + 1, 'ascension')
          }}). To start, set it back to {{ bands.length + 1 }} under The space to search.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            :disabled="
              !sweepConsent ||
              store.busy ||
              store.integrityBlocked ||
              store.staleBackupBlocked ||
              !chainCount ||
              ascMismatch
            "
            class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-body font-bold hover:bg-indigo-500 disabled:opacity-40"
            @click="start(false)"
          >
            {{ store.isRunning ? 'Running...' : 'Start this sweep' }}
          </button>
          <span class="text-small text-slate-500">
            One press starts it (the button further down does the same). When the sweep finishes, the result is
            submitted automatically, tagged {{ sweepRequest.preset }}. If you stop it early, what it priced so far is
            sent, marked as partial.
          </span>
        </div>
        <!-- The automatic submission, reported where the player pressed Start. -->
        <RunSendReport
          kind="full"
          :own="autoSubmitted"
          :running="store.isRunning"
          :message="submitMessage"
          :ok="submitOk"
          :partial="submitPartial"
          :name-to-claim="nameToClaim"
          :offer-name="offerName"
          :claiming="claiming"
          :pending-table="store.pendingTable?.source === 'fastest'"
          :retrying="retryingTable"
          quiet
          @claim="claim"
          @retry="retryTable"
          @name-it="sweepSharing?.openForName()"
        />
        <!-- Said HERE as well as further down: the card's Start is at the top of a long page, and a
             refusal that only appears below the fold reads as "the button does nothing". -->
        <p
          v-if="store.noFeasibleChain && !store.error"
          class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-body text-rose-800"
        >
          <b>No route finished</b>, so there is nothing to save or submit. The reason is further down.
        </p>
        <p
          v-if="store.error && !store.errorIsIntegrityNotice"
          class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-body text-red-800"
        >
          <b>{{ store.errorBeforeStart ? "Didn't start" : 'Search failed' }}:</b> {{ store.error }}
        </p>
        <p
          v-else-if="store.runNotes.length"
          class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-body text-amber-900"
        >
          <span v-for="n in store.runNotes" :key="n" class="block">{{ n }}</span>
        </p>
        <p v-else-if="store.isRunning" class="text-body font-bold text-indigo-700 max-w-prose">
          Running: progress is shown further down. Leave this tab open<template v-if="autoSubmitArmed"
            >; the result is submitted automatically when it finishes</template
          >.
        </p>
      </div>

      <!--
        Two questions. The first is everything below as it always was; the second
        (DeadlinePanel, search/deadline.ts) turns the finish line into a date.
      -->
      <!-- The site's tabs pick the goal now (Fastest route / Highest TE by a date); this switch is
           only for the panel on its own. -->
      <div v-if="!props.goal" class="flex flex-wrap items-center gap-2">
        <span class="text-small font-bold text-slate-500">What are you after?</span>
        <button
          v-for="g in GOALS"
          :key="g.id"
          type="button"
          :disabled="store.busy"
          class="px-3 py-1.5 rounded-lg border text-body font-bold disabled:opacity-40"
          :class="
            goal === g.id
              ? 'border-slate-800 bg-slate-800 text-white'
              : 'border-slate-200 text-slate-500 hover:text-slate-700'
          "
          @click="goal = g.id"
        >
          {{ g.label }}
        </button>
      </div>
      <details v-if="goal === 'fastest'" class="rounded-xl border border-slate-200 bg-white">
        <summary class="cursor-pointer px-4 py-3 text-body font-bold text-slate-500">
          How {{ NAMES.fullFirst }} works, and what it costs
        </summary>
        <div class="px-4 pb-4 text-body text-slate-600 space-y-2">
          <p>
            This prices <span class="font-bold">every</span> route in the ranges you describe, with no descent, stages or
            pruning, so the winner is the true optimum of that space, not a local one. It is also the mode that gets out
            of hand fastest: the ranges multiply, so halving the step in each does far more than double the work.
          </p>
          <p>
            Nothing here is capped. Above 100,000 routes, Run Custom asks you to confirm first; above 500,000 it asks twice.
            The count and estimate below update as you type, so check them before you press Run Custom.
          </p>
          <!-- How the work is split: explanation, so it sits here with the rest (it was between the
               estimate and Find). -->
          <p class="pt-2 font-bold text-slate-800">How the work is split</p>
          <p>
            <span class="font-bold text-slate-800">Routes are sorted so related ones sit together.</span> Every route
            starting <code class="tabular-nums">195 229</code> sits next to the others that start that way, because
            the expensive unit is the <span class="font-bold">ascension</span>, not the route. Two routes that share their
            first three stops share those three ascensions' simulations exactly.
          </p>
          <p>
            <span class="font-bold text-slate-800"
              >The sorted list is cut into chunks of {{ store.workersInPool * 2 }}</span
            >
            (workers × 2) and handed to the pool one chunk at a time. The pool splits each chunk across workers by
            prefix, so each worker gets a family of related routes instead of a random handful, and its memo pays off.
          </p>
          <p>
            <span class="font-bold text-slate-800">Each worker simulates ascensions and remembers them.</span> An ascension is a full
            farm simulation: research purchases, hab and vehicle upgrades, twelve egg shifts, sale timing. That is
            where the ~15 s goes. A route whose prefix the worker has already priced only pays for its new ascensions, which
            is why the real cost lands well under the estimate.
          </p>
          <p>
            <span class="font-bold text-slate-800">Progress comes from the workers themselves.</span> Each worker
            reports after every route it finishes, so the bar moves steadily and you can tell a dead worker from one
            that is still thinking. The s/route figure under the bar is measured on this machine, not carried over from
            another one.
          </p>
          <p>
            <span class="font-bold text-slate-800">Stop is checked between chunks.</span> A chunk in flight finishes
            first, so on a space with long routes "Stopping…" can sit for a minute or two. Nothing is lost: everything
            priced so far stays, and the best of it is your answer.
          </p>
        </div>
      </details>

      <!--
        An interrupted run, found on load. Above everything, because it is time-sensitive in a way
        nothing else on this page is: starting anything else overwrites the checkpoint it lives in.
      -->
      <CarryOnOffer
        v-if="goal === 'fastest' && store.crashedRun && !store.isRunning && queueAt < 0"
        :title="store.crashedQueue ? 'Unfinished queue found' : 'Unfinished run found'"
        :elsewhere="store.runElsewhere.sweep"
        :run-key="store.crashedRun.updatedAt"
        :carry-label="
          store.crashedQueue
            ? `Carry on the queue (box ${store.crashedQueue.next + 1} of ${store.crashedQueue.record.chains.length})`
            : 'Carry on from where it stopped'
        "
        :disabled="store.busy || resuming !== ''"
        @carry-on="resumeCrashed"
      >
        <p>
          <template v-if="store.crashedQueue">{{ crashedQueueNote }}</template>
          <template v-else>A run on this machine stopped without finishing.</template>
          <template v-if="!store.crashedQueue || store.crashedQueue.next === store.crashedQueue.record.at">
            <span class="font-bold">{{ (store.crashedRun.durations?.length ?? 0).toLocaleString() }}</span> routes are
            already priced and will be replayed instead of simulated again.
          </template>
          It was last saved {{ agoLabel(store.crashedRun.updatedAt) }}.
          <template v-if="store.runSaveFor(store.crashedRun.inputsKey)">
            It carries on with the save it started with (from
            {{ saveWhen(store.runSaveFor(store.crashedRun.inputsKey)?.backupAt) }}, TE
            {{ store.runSaveFor(store.crashedRun.inputsKey)?.te }}), so both halves are priced on the same farm.
          </template>
          Starting a different search moves it to the list below, so it isn't lost.
          <template v-if="store.settingsRestoreNote(store.crashedRun.fingerprint)">
            Carrying on also puts your settings back to the run's (<span class="font-bold">{{
              store.settingsRestoreNote(store.crashedRun.fingerprint)
            }}</span
            >), so you don't have to set them up again.
          </template>
          <template v-if="store.planStartRestoreNote(store.crashedRun.fingerprint)">
            Carrying on puts the plan start back to
            <span class="font-bold">{{ store.planStartRestoreNote(store.crashedRun.fingerprint) }}</span
            >, the time it was priced from.
          </template>
        </p>
      </CarryOnOffer>

      <UnfinishedRuns v-if="goal === 'fastest'" :player-id="playerId" kind="exhaustive" @resume="resumeCrashed" />

      <!--
        An interrupted run that cannot carry on, with the reason. It used to just not appear, so a
        crashed overnight run looked as if it had never been saved.
      -->
      <BlockedRunNotice v-if="goal === 'fastest' && store.blockedCheckpoint && !store.crashedRun && !store.isRunning" />

      <DeadlinePanel
        v-if="goal === 'deadline'"
        :player-id="playerId"
        @show-fastest="goal = 'fastest'"
      >
        <template #mode><slot name="mode" /></template>
      </DeadlinePanel>
      <template v-else>
        <!-- A screen-level choice above the form (batch 3: Simple or Advanced). -->
        <slot name="mode" />
        <!-- The space. These numbers are the whole definition of the search. Batch 3's Simple mode can
             leave it out (`hideRoutes`). -->
        <div v-if="!hideRoutes" class="rounded-xl border border-slate-200 bg-white p-4 space-y-5">
          <h3 class="text-slate-500 label">The space to search</h3>

          <!-- Workers are in Your setup (This computer), with the other machine settings. -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label class="space-y-1">
              <span class="flex items-center gap-1.5">
                <span class="text-slate-400 label">Final target TE</span>
                <HelpTip
                  >The TE every route ends at. It's added to the end of each route automatically, so it never goes in
                  the ranges below.</HelpTip
                >
              </span>
              <input
                v-model.number="store.finalTE"
                type="number"
                min="1"
                :disabled="store.isRunning"
                class="w-full rounded-lg border-slate-300 text-body font-bold text-slate-800 disabled:opacity-50"
              />
            </label>
            <label class="space-y-1">
              <span class="flex items-center gap-1.5">
                <span class="text-slate-400 label">Your TE now</span>
                <HelpTip
                  >Read from your backup, not editable here. It is the floor for every stop in the ranges.</HelpTip
                >
              </span>
              <input
                :value="store.currentTE"
                type="number"
                disabled
                class="w-full rounded-lg border-slate-200 bg-slate-50 text-body font-bold text-slate-500"
              />
            </label>
          </div>

          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <label class="space-y-1 block">
              <!-- Labelled like the chains added below it (Chain 2, 3...), so it reads as one of them. -->
              <span v-if="!sweepRequest" class="block text-slate-600 label">
                Box 1<template v-if="bands.length"> · {{ plural(bands.length + 1, 'ascension') }}</template>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="text-slate-400 label">
                  Ranges, one per stop
                </span>
                <HelpTip>
                  Semicolon separated, each `lo-hi` with an optional `:step`. `185-200:5; 210-240:10; 250-290:20` means
                  the first ascension lands between 185 and 200, the second between 210 and 240, the third between 250
                  and 290, then the target. Ranges may overlap; routes still have to increase.
                </HelpTip>
              </span>
              <input
                v-model="bandsText"
                type="text"
                :disabled="store.isRunning"
                placeholder="185-200:5; 210-240:10; 250-290:20"
                class="w-full rounded-lg border-slate-300 text-body tabular-nums font-bold text-slate-800 disabled:opacity-50"
              />
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <label
                  class="flex items-center gap-1.5 text-slate-500 label"
                >
                  Ascensions
                  <input
                    v-model.number="suggestAsc"
                    type="number"
                    :min="suggestRange[0]"
                    :max="suggestRange[1]"
                    :disabled="store.isRunning"
                    class="w-16 rounded-md border-slate-300 text-body font-bold text-slate-800 disabled:opacity-50"
                    @input="markAscTouched"
                  />
                </label>
                <span v-if="chain1FromInstant" class="text-small text-slate-400" data-testid="asc-follow-hint"
                  >(from the instant answer)</span
                >
                <SpaceSliders
                  :width-ix="chain1View.widthIx"
                  :step-ix="chain1View.stepIx"
                  :half-width="chain1View.halfWidth"
                  :step="chain1View.step"
                  :disabled="store.isRunning"
                  @width="v => moveChain1('widthIx', v)"
                  @step="v => moveChain1('stepIx', v)"
                />
                <button
                  type="button"
                  :disabled="store.isRunning || !suggestion"
                  class="px-3 py-1.5 rounded-md bg-slate-800 text-white text-body font-bold hover:bg-slate-700 disabled:opacity-40"
                  @click="applySuggestion"
                >
                  Suggest a space
                </button>
                <HelpTip>
                  Fills the boxes with a space of the size set beside it. When the whole reachable range fits (at two
                  ascensions, and three on most accounts), it suggests that at step 1, so the run proves the optimum and
                  no measurement is involved. Above that, it uses where near-best routes have actually landed across
                  this project's runs, refined as close to 5 TE as the budget allows before any of it goes to widening
                  the ranges. It also adds a box for one ascension fewer and one more, at half the size, so a sweep
                  covers three counts; remove them under Box 2 and 3 if you only want one. Either way it's a starting
                  point you can edit.
                </HelpTip>
                <span v-if="suggestion" class="text-small text-slate-500">
                  Suggest would fill in {{ plural(suggestAsc, 'ascension') }}, {{ plural(suggestion.chains, 'route') }},
                  about {{ chainsTimeLabel(suggestion.chains) }} &middot;
                  <template v-if="suggestion.kind === 'complete'">
                    <span class="font-bold text-emerald-700">complete sweep</span>
                    {{
                      suggestion.exact
                        ? 'of every reachable TE, so the run proves the optimum'
                        : 'of the whole reachable range on a 2 TE grid'
                    }}
                  </template>
                  <template v-else-if="suggestion.kind === 'instant'">
                    around
                    {{ suggestion.fromInstant ? "the instant answer's route" : "the measured shape's middles" }} ({{
                      suggestion.around.join(' ')
                    }}), {{ suggestion.halfWidth }} TE either side{{
                      suggestion.step > 1 ? `, every ${suggestion.step} TE` : ''
                    }}<template v-if="suggestion.coarse">. {{ COARSE_SUGGESTION_NOTE }}</template>
                  </template>
                  <template v-else>
                    measured shape, from {{ plural(suggestion.runs, 'run') }} across {{ plural(suggestion.accounts, 'account') }}
                  </template>
                </span>
                <span v-else class="text-small text-amber-700">
                  No suggestion for this target or ascension count.
                </span>
                <KeptBoxNote
                  v-if="chain1KeptNote"
                  class="basis-full"
                  :disabled="store.isRunning"
                  @use="applySuggestion"
                />
              </div>

              <span class="block text-small text-slate-400">
                <template v-if="bands.length">
                  {{ plural(bands.length, 'range') }} → {{ plural(bands.length + 1, 'ascension') }} ·
                  {{ bands.map(b => b.length).join(' × ') }} values
                </template>
                <template v-else>Nothing readable yet.</template>
              </span>
              <!-- Plain words for the step, right under the bands it describes: "181-250:5" means 181,
                   186, 191... and never 227, so a faster Smart search result between grid points is no surprise. -->
              <p v-if="!plannedGridComplete && gridExample" class="text-body text-slate-600">
                <span class="font-bold text-slate-800">This space tries {{ plannedGridLabel }}</span> (for example
                {{ gridExample }}), not every TE in between, which would take weeks. The winner is the best on this
                grid, and a route between grid points can be faster.
              </p>
              <BandCheckNotice
                :text="bandsText"
                :current-t-e="store.currentTE"
                :final-t-e="store.finalTE"
                :disabled="store.isRunning"
                @use="t => (bandsText = t)"
              />
              <!-- The box only chooses what Suggest a space fills in; the bands decide what runs. A
                 player set it to 2 and then 8 on a 3-ascension sweep and it ran as 3 without a word,
                 so a mismatch is now an error that blocks Start until one of the two is changed. -->
              <p
                v-if="ascMismatch"
                class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-body font-bold text-rose-800"
              >
                Your ranges make {{ plural(bands.length + 1, 'ascension') }}, and that is what would run, but the
                Ascensions box says {{ suggestAsc }}. The box only chooses what Suggest a space fills in: press Suggest
                a space to switch to {{ plural(suggestAsc, 'ascension') }}, or set the box back to
                {{ bands.length + 1 }}.
              </p>
            </label>

            <!--
              More chains for the same click: each its own space and ascension count, run one after
              another. Short ones (1 or 2 ascensions) cost little alone; queued behind the main run
              they need no second visit.
            -->
            <!-- The added chains (RoutesToTry.vue, shared with By a date). -->
            <RoutesToTry
              v-if="!sweepRequest"
              class="space-y-2"
              :rows="extraChains"
              :sliders="extraViews"
              :kept-notes="extraKeptNotes"
              :problems="extraProblems"
              :summaries="extraSummaries"
              :disabled="store.isRunning"
              :current-t-e="store.currentTE"
              :final-t-e="store.finalTE"
              :max-asc="12"
              :first-number="2"
              placeholder="185-200:5; 210-240:10"
              check-ascensions
              @asc="(k, n) => (extraChains[k].asc = n)"
              @text="typedExtra"
              @suggest="suggestExtra"
              @remove="k => extraChains.splice(k, 1)"
              @add="addChain"
              @slider="moveExtra"
              @use-sliders="suggestExtra"
            >
              <template #row-after="{ row, k }">
                <span v-if="row.asc >= 2 && extraSugs[k]" class="block text-small text-slate-500">
                  Suggest would fill in {{ plural(extraSugs[k]!.chains, 'route') }}, about
                  {{ chainsTimeLabel(extraSugs[k]!.chains)
                  }}<template v-if="extraCoarse(k)"
                    >. {{ COARSE_SUGGESTION_NOTE }}</template
                  >
                </span>
              </template>
              <template #footer>
                <span v-if="extraChains.length" class="text-body text-slate-500">
                  One click runs {{ extraChains.length === 1 ? 'both' : 'all ' + (extraChains.length + 1) }} boxes, one
                  after another. Each finished one is saved under Saved for later.
                </span>
              </template>
            </RoutesToTry>

            <label class="space-y-1 block max-w-xs">
              <span class="flex items-center gap-1.5">
                <span class="text-small font-bold text-slate-400">
                  Keep stops at least this many TE apart
                </span>
                <HelpTip>
                  Skips any route where two stops in a row are closer than this, to save time on routes you'd never
                  play. 0 means no limit. Be careful raising it: on one account the best 7-ascension route found, 185
                  200 215 230 290 380 490, has stops only 15 TE apart, so anything above 15 would have skipped it. It
                  never applies to the last jump, up to the target.
                </HelpTip>
              </span>
              <input
                v-model.number="minGap"
                type="number"
                min="0"
                :disabled="store.isRunning"
                class="w-full rounded-lg border-slate-300 text-body font-bold text-slate-800 disabled:opacity-50"
              />
              <span class="block text-small text-slate-500">
                {{
                  minGap > 0
                    ? `e.g. after ascending at 200, the next stop is ${200 + minGap} or higher. 0 = no limit.`
                    : 'No limit: stops can be any distance apart.'
                }}
              </span>
            </label>

            <p class="text-body text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              The winner will be the best <span class="font-bold">of the ranges you set</span>, not of everything
              reachable. That's still a stronger claim than the {{ NAMES.smartFirst }} search makes, which homes in rather than
              trying everything.
            </p>
          </div>

          <p class="text-body text-slate-500 max-w-prose">
            The ascension count includes the final target, so 4 ranges is 5 ascensions. Values at or below your current
            TE, and at or above the target, are dropped: neither is an ascension you can perform.
          </p>
        </div>

        <!-- The number that should decide whether you press the button. -->
        <div
          class="rounded-xl border p-4 space-y-2"
          :class="tooBig ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'"
        >
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-slate-400 label">Values tried</span>
                <HelpTip
                  >Stop values across all the ranges, after anything outside (your TE, target) is dropped.</HelpTip
                >
              </div>
              <div class="text-title font-bold text-slate-900 tabular-nums">{{ poolSize }}</div>
            </div>
            <div>
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-slate-400 label">Routes it will run</span>
                <HelpTip
                  >Every route through the ranges that can actually be played: each stop above the one before it (and at
                  least the minimum gap above it), with the target added at the end. Combinations that go down, stand
                  still, or fall outside your TE and the target can't be played, so they aren't counted or run. It's
                  counted, never built as a list: at small steps the list wouldn't fit in memory, and this number warns
                  you before that happens.</HelpTip
                >
              </div>
              <div class="text-title font-bold tabular-nums" :class="tooBig ? 'text-red-700' : 'text-slate-900'">
                {{ chainCountLabel }}
              </div>
              <!-- Only the playable ones (the user, 1 Oct: "we are running the feasible total chains... however
                   the lay user may not know that"). -->
              <div v-if="runChainsNote" class="text-small text-slate-500">{{ runChainsNote }}</div>
              <div
                v-else-if="!runLeft && unplayable > 0 && totalChains === chainCount"
                class="text-small text-slate-500"
              >
                playable, of {{ combinations.toLocaleString() }} the ranges could make
              </div>
            </div>
            <div>
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-small font-bold text-slate-400">Est. time</span>
                <HelpTip
                  >Routes x assumed cost / workers. It errs high on purpose: the assumed cost is the typical cost of a
                  route this long in players' runs until this machine has its own measured or benchmarked rate, and
                  prefix sharing means most routes cost far less than a full simulation. As a guide from players' runs:
                  about 1 minute per 70 routes on an 8-core computer, per 120 on 16. A hidden tab runs several times
                  slower.</HelpTip
                >
              </div>
              <div class="text-title font-bold tabular-nums" :class="tooBig ? 'text-red-700' : 'text-slate-900'">
                {{ estimateLabel }}
              </div>
            </div>
            <div>
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-slate-400 label">Assumed cost</span>
                <HelpTip
                  >What the estimate charges per route. It starts at the typical cost for routes this long in players'
                  runs and switches to this machine's own measured rate once the first chunk lands, or as soon as you
                  press "Benchmark my PC" below, which prices that first chunk right away instead of waiting for a real
                  run.</HelpTip
                >
              </div>
              <div
                class="text-title font-bold tabular-nums"
                :class="{
                  'text-emerald-700': store.rateSource === 'live',
                  'text-indigo-700': store.rateSource === 'benchmark',
                  'text-slate-900': !store.rateSource,
                }"
              >
                {{ assumedCostLabel }}
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              :disabled="store.isRunning || store.benchmarking || !chainCount"
              class="px-3 py-1.5 rounded-md border border-indigo-300 text-indigo-700 text-body font-bold hover:bg-indigo-50 disabled:opacity-40"
              @click="benchmark"
            >
              {{ store.benchmarking ? 'Benchmarking…' : store.benchmarkedAt ? 'Re-benchmark' : 'Benchmark my PC' }}
            </button>
            <span v-if="store.benchmarking" class="text-body text-slate-500">
              Pricing the first {{ Math.max(store.workerBudget * 2, 32) }} routes as a throwaway run, at the same cost
              as a real run's opening chunk.
            </span>
            <span v-else-if="store.benchmarkedAt" class="text-body text-slate-500">
              {{ store.rateSource === 'live' ? 'Measured' : 'Benchmarked' }} on this machine ·
              {{ plural(store.benchmarkChainCount, 'route') }} · {{ agoLabel(store.benchmarkedAt) }}
            </span>
          </div>
          <p v-if="store.benchmarkError" class="text-body font-bold text-red-700">{{ store.benchmarkError }}</p>

          <p v-if="coverageBefore" class="text-body font-bold text-slate-700">
            {{ coverageBefore }}
            <template v-if="suggestedCountNote">{{ suggestedCountNote }}</template>
          </p>
          <p class="text-body" :class="tooBig ? 'text-red-800' : 'text-slate-500'">
            <template v-if="!poolSize">
              The ranges are empty once values outside ({{ store.currentTE }}, {{ store.finalTE }}) are dropped.
            </template>
            <template v-else-if="!chainCount">
              No routes: no way through these ranges goes up at every stop{{
                minGap > 0 ? ` by at least ${minGap} TE` : ''
              }}.
            </template>
            <template v-else-if="tooBig">
              This will not finish. The estimate assumes {{ assumedCostLabel }} per route on
              {{ store.workerBudget }} workers{{ measuredCost ? ', measured on this machine' : '' }}. Raise the step or
              narrow the ascension range.
            </template>
            <template v-else>
              The estimate assumes {{ assumedCostLabel }} per route on {{ store.workerBudget }} workers,
              {{ measuredCost ? 'measured on this machine' : speedSourceLabel }}.
              <template v-if="!measuredCost"
                >Press Benchmark my PC above for a number from your own computer.</template
              >
              Leave the tab open: a closed tab stops the workers.
            </template>
          </p>
          <!-- Above 300,000 routes (search/bigBox.ts): about how many hours here, and the command line. -->
          <BigBoxNote :note="bigBox" />
        </div>

        <!-- The run controls (RunControls.vue): the same block on every search screen. A sweep link
             already sends itself, so it gets the button alone (no send tick), labelled as the card at the top labels it. -->
        <RunControls
          long-run
          v-model:opt-in="optIn"
          v-model:anonymous="anonymous"
          v-model:nickname="nickname"
          v-model:note="store.runNote"
          kind="full"
          :player-id="playerId"
          :find-disabled="
            store.busy ||
            store.integrityBlocked ||
            store.staleBackupBlocked ||
            !chainCount ||
            ascMismatch ||
            (!!sweepRequest && !sweepConsent) ||
            (!sweepRequest && !extrasReady) ||
            queueAt >= 0
          "
          :running="(store.isRunning && ownRun) || queueAt >= 0"
          :stopping="store.stopRequested || queueCancelled"
          option="custom"
          :find-label="
            sweepRequest
              ? sweepConsent
                ? 'Start this sweep'
                : 'Start this sweep (tick &quot;I understand&quot; at the top first)'
              : ''
          "
          running-word="Pricing every route"
          :show-submit="!sweepRequest && !!store.submitUrl"
          consent-note="each box's, when you queued several"
          :can-carry-on="!!store.crashedRun && !store.runElsewhere.sweep && queueAt < 0"
          :integrity-notice="!sweepRequest"
          :report="{
            own: autoSubmitted && !sweepRequest,
            message: submitMessage,
            ok: submitOk,
            partial: submitPartial,
            nameToClaim,
            offerName,
            claiming,
            pendingTable: store.pendingTable?.source === 'fastest',
            retrying: retryingTable,
            quiet: autoSubmitted,
          }"
          @find="andSubmit => void start(andSubmit)"
          @stop="stopRun"
          @nickname-typed="nicknameTouched = true"
          @carry-on="resumeCrashed"
          @claim="claim"
          @retry="retryTable"
        >
          <template #above-find>
            <!-- The same carry-on as the box at the top, next to Start where people look for it. -->
            <div
              v-if="store.crashedRun && !store.busy && !store.runElsewhere.sweep && queueAt < 0"
              class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
            >
              <button
                type="button"
                class="px-4 py-2 rounded-lg bg-amber-700 text-white text-body font-bold hover:bg-amber-800"
                @click="resumeCrashed"
              >
                {{ store.crashedQueue ? 'Carry on the unfinished queue' : 'Carry on the unfinished run' }}
              </button>
              <span v-if="store.crashedQueue" class="text-body text-amber-900">
                Box {{ store.crashedQueue.next + 1 }} of {{ store.crashedQueue.record.chains.length }} next; its
                settings are put back for you.
              </span>
              <span v-else class="text-body text-amber-900">
                {{ (store.crashedRun.durations?.length ?? 0).toLocaleString() }} routes already priced; its settings are
                put back for you.
              </span>
            </div>
          </template>
          <template #progress>
            <!-- The run's place on the page, for the run bar's Jump to it (lib/runAnchor.ts). Its progress is in
                 that bar only (Jordan, 16 Oct 2026; the measured speed is under the bar's Details). -->
            <div
              v-if="ownRun && store.stage && store.chainRunLive"
              data-run-progress="full"
              class="scroll-mt-24"
            >
              <p v-if="!store.isRunning && store.runCost" class="text-small text-slate-400 font-bold tabular-nums">
                Took {{ describeCompute(store.runCost.minutes, store.runCost.workers) }}
              </p>
            </div>

            <!-- Which chain of a multi-chain click is running, and what the finished ones found. -->
            <div
              v-if="queueAt >= 0 || queueResults.length"
              class="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
            >
              <p class="text-small font-bold text-slate-500">
                <template v-if="queueAt >= 0">Running box {{ queueAt + 1 }} of {{ store.sweepQueue.total }}</template>
                <template v-else>All boxes from the last click</template>
              </p>
              <ResultTable
                v-if="queueResults.length"
                :columns="['Box', 'Best found', 'Days', 'Finishes', '']"
                :rows="queueResults"
                :row-key="q => q.label"
              >
                <template #default="{ row: q }">
                  <td class="pr-4 py-1 text-slate-500">
                    {{ q.label }}<template v-if="q.stopped"> (stopped)</template>
                  </td>
                  <td class="pr-4 py-1 font-bold">{{ q.chain.join(' ') }}</td>
                  <td class="pr-4 py-1">{{ q.days ? q.days.toFixed(3) : '—' }}</td>
                  <td class="pr-4 py-1">{{ q.finish ? saveWhen(q.finish) : '—' }}</td>
                  <td class="pr-4 py-1">
                    <!-- Follow this route (Jordan, 23 Oct 2026): any box's best, as the card's. -->
                    <FollowButton
                      v-if="rowFollow && q.finish && q.chain[q.chain.length - 1] === store.finalTE"
                      class="min-h-[44px] sm:min-h-0"
                      :chain="q.chain"
                      :goal-key="rowFollow.goalKey"
                      from="saved"
                      :source="rowFollow.source"
                      :finish="q.finish"
                      :end-t-e="store.finalTE"
                      :plan-start="rowFollow.planStart"
                    />
                  </td>
                </template>
              </ResultTable>
              <p class="text-small text-slate-500">
                Each is saved under Saved for later, so you can open any of them again. Compare them by finish date.
              </p>
            </div>
          </template>
          <template #after>
            <RunErrorNotes
              :notes="store.runNotes"
              :error="store.errorIsIntegrityNotice ? null : store.error"
              :before-start="store.errorBeforeStart"
            />
          </template>
        </RunControls>

        <!-- The results (RunResults.vue): the same order on every search screen. -->
        <RunResults>
          <template #card>
            <!-- The outcome with no best chain. Without it a finished run simply lacked the result card,
               the Save button stayed grey and Submit never appeared, with nothing saying why -- which
               read as three separate bugs to the person looking at it. -->
            <div
              v-if="store.noFeasibleChain && !store.error"
              class="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-2"
            >
              <p class="text-small font-bold text-rose-800">
                No route in this space finishes
              </p>
              <p class="text-body text-rose-900/90 max-w-prose">
                Every route was simulated, and none of them reaches {{ store.finalTE }} TE in any time the planner can
                put a date on. That is a result, not a crash, so there is nothing to save or submit.
              </p>
              <p class="text-body text-rose-900/90 max-w-prose">
                The usual cause is earnings. On a low-TE account the early ascensions cannot earn enough to buy the habs
                and vehicles the plan is waiting on, so the very first ascension stalls and every ascension after it inherits the
                stall. A different space won't fix that. More Truth Eggs or a stronger earnings set (totem, ankh,
                necklace and their stones) will. If you think the planner has this wrong, download the diagnostics below
                and send them in.
              </p>
            </div>

            <!-- The answer: the same card as Smart search (RouteResultCard.vue). -->
            <RouteResultCard
              :priced-with="pricedWith"
              v-if="ownRun && store.bestDays > 0"
              :chain="store.bestChain"
              :days="store.bestDays"
              :final-t-e="store.finalTE"
              :end-label="endDate"
              :running="store.isRunning"
              :claim="store.stoppedEarly ? '' : resultClaim"
              :busy="store.busy"
              :follow="customFollow"
              can-save
              :saving="saving"
              @build="buildPlan"
              @csv="downloadCsv"
              @save="save"
              :last-run="lastRunLabel"
              :ran-line="ranLine"
            >
              <RouteExtras
                v-if="!store.isRunning"
                :chain="store.bestChain"
                :legs="store.bestLegs"
                :reach-at="store.planStart + store.bestDays * 86400"
                :zone="autoPlannerStore.timezone || plannerTzFallback"
                green
              />
              <!-- Soul eggs the route's shifts would leave: one amber line under a quarter (lib/soulEggs.ts). -->
              <SoulEggWarning v-if="!store.isRunning" :legs="store.bestLegs" :ascensions="store.bestChain.length" planner />
              <p v-if="!store.isRunning && resultExplain" class="text-body text-emerald-900/80">
                {{ resultExplain }}
              </p>
              <p v-if="coverageAfter" class="text-body text-emerald-900/80">
                {{ coverageAfter }}
                <template v-if="suggestedCountNote">{{ suggestedCountNote }}</template>
              </p>
              <EdgeWarning
                v-if="edges.length"
                class="mt-2"
                :lines="edges.map(edgeWords)"
                :can-widen="!!edgeWiden"
                :disabled="store.busy || queueAt >= 0"
                @widen="widenAndRun"
              >
                <template v-if="edgeWiden">
                  The wider space is {{ plural(edgeWiden.chains, 'route') }}. Routes already priced are reused when your
                  setup hasn't changed.
                </template>
              </EdgeWarning>
              <!-- Fastest is fast, not best: when a longer route might win, say so (never runs anything). -->
              <LongerRouteHint
                v-if="goal === 'fastest'"
                class="mt-2"
                mode="chain"
                :running="store.isRunning || queueAt >= 0"
                :disabled="store.busy || queueAt >= 0"
                :can-add="!sweepRequest"
                :on-add="addChainOfCount"
                @check="checkRouteExactly"
              />
              <p class="text-small text-emerald-900/60">
                Compare runs by finish date. Two runs started hours apart have different plan starts, so their day
                counts don't measure the same thing, but the dates they land on do.
              </p>
              <p
                v-if="store.continueWarning"
                class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-body text-amber-900"
              >
                {{ store.continueWarning }}
              </p>
              <ResultHealth class="mt-2" :issues="store.resultContradictions" />
              <p v-if="store.stoppedEarly" class="text-body text-emerald-900/70 pt-1 max-w-prose">
                You stopped it early, so this is the best of what was priced, not the optimum of the space.
              </p>
              <p v-if="store.timeOff.length && !store.isRunning" class="text-body text-emerald-900/80 max-w-prose">
                Your time off goes into the plan too: the ascension it interrupts ends when the time off starts
                (going to the home farm is a prestige), and a rebuild starts after it.
              </p>
            </RouteResultCard>
          </template>
          <!-- When to start this route: Science › When should I start? (StartTimeCard.vue), opened on it. Not for a
             player already on virtue (lib/onVirtue.ts): their first ascension has started. -->
          <p v-if="offerStart && ownRun && store.bestChain.length && store.bestDays > 0 && !store.isRunning" class="text-body">
            <button
              type="button"
              class="font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
              data-testid="check-start-times"
              @click="startTimes.show(store.bestChain)"
            >
              Check start times for this route</button
            >
            <span class="text-slate-500"> (opens {{ NAMES.science }} › {{ NAMES.start }})</span>
          </p>
          <!-- The run's charts are on My runs › Your latest run (LatestRunView.vue; moved off this screen,
               15 Oct 2026): "Dig deeper into your plan ›". -->
          <DigDeeperLink
            v-if="ownRun && store.pricedCount"
            detail="other options, charts, and when each stop and egg happens"
          />
          <template #keep>
            <!-- Saved runs: the same list on both depths (SavedRuns.vue); carrying a sweep on is this one's. -->
            <SavedRuns :player-id="playerId" can-resume heading="Saved for later" />

            <!-- Diagnostics are offered on a run with no answer too: that is exactly when someone wants to
               report what went in. -->
            <CsvCard v-if="ownRun && (store.pricedCount || store.noFeasibleChain)" :csv="store.csvRows > 0" diagnostics>
              <template #csv>
                <span class="text-body text-slate-500">
                  {{ countLabel(store.csvRows) }}, one row per ascension. Safe to download mid-run.
                </span>
              </template>
            </CsvCard>
          </template>
          <template #share>
            <!-- Submission. Same payload, same opt-in, same disclosure as the main panel. -->
            <!-- Not while a Find and submit run is going: it sends itself with the choice made at Find,
                 and a box here saying "anonymously" would not be what goes. -->
            <!-- Sent by the run itself: one line instead of the box (SentByRunNote.vue). -->
            <SentByRunNote
              v-if="ownRun && store.bestDays > 0 && !store.isRunning && sentByRun"
              :sending="submitting"
            />
            <ShareResult
              v-else-if="ownRun && store.bestDays > 0 && !(store.isRunning && store.submitsWhenDone)"
              compact
              :replaces-best-so-far="!!store.provisionalRows.fastest"
              v-model:opt-in="optIn"
              v-model:anonymous="anonymous"
              v-model:nickname="nickname"
              :note="store.runNoteUsed ?? ''"
              @update:note="(v?: string) => (store.runNoteUsed = v ?? '')"
              :nickname-max="NICKNAME_MAX"
              :csv-detail="`(${store.csvRows.toLocaleString()} routes, one row per ascension; routes past the memory budget export with their per-ascension cells blank)`"
              @nickname-typed="nicknameTouched = true"
            >
              <template #intro>
                <p class="text-body text-indigo-900/80 max-w-prose">
                  A Custom result is the most useful thing the Leaderboard can get: the best of a stated grid rather than
                  a search result. It is sent with the space it covered and what it found there (the runners-up, the
                  best route at each ascension count, and the spread), so a reader can tell a real find from a flat
                  neighbourhood without downloading the CSV. A run opened from Saved for later above is sent without a run
                  cost, because the time it took wasn't this machine's.
                </p>
                <p class="text-body text-indigo-900/80 max-w-prose">
                  The Leaderboard uses the random code so that a run landing on the flagged Leaderboard shows to you as yours and to
                  everyone else anonymously, the same result sent twice is stored once, you can put your name on a run
                  you sent anonymously, and your own later runs can replace your older plans on the Leaderboard (nobody else's
                  can). A named run shows a short tag made from the code. An anonymous run shows nothing that links it
                  to you. Your best three plans already on the Leaderboard go named with a named send and anonymous with an
                  anonymous one, so a re-check never ties the two together.
                </p>
              </template>
              <template #opted>
                <label class="flex items-start gap-3 cursor-pointer text-body text-indigo-900/80">
                  <input
                    v-model="stampName"
                    type="checkbox"
                    :disabled="anonymous"
                    class="mt-0.5 rounded border-indigo-300 text-indigo-600 disabled:opacity-40"
                  />
                  <span>
                    <span class="font-bold">Add the time to the name.</span> Optional. The Leaderboard already keeps each
                    space you prove as its own row, so nothing is lost without it. It just makes your own runs easier to
                    tell apart at a glance when several are on the Leaderboard.
                  </span>
                </label>
                <p v-if="!anonymous" class="text-body text-indigo-900/70">
                  Submitting as
                  <span class="tabular-nums font-bold">{{ effectiveNickname || '(blank, so anonymous)' }}</span>
                </p>
              </template>

              <BoardSubmitButtons
                :opt-in="optIn"
                :submit-url="store.submitUrl"
                :name-to-claim="nameToClaim"
                :offer-name="offerName"
                :claiming="claiming"
                :sending="submitting"
                :already-submitted="store.alreadySubmitted"
                :on-board-line="fastestOnBoardLine"
                :message="submitMessage"
                :ok="submitOk"
                :partial="submitPartial"
                :pending-table="store.pendingTable?.source === 'fastest'"
                :retrying="retryingTable"
                :preview="payloadPreview"
                @claim="claim"
                @submit="submit()"
                @save="downloadSubmission"
                @retry="retryTable"
              />
            </ShareResult>
          </template>
        </RunResults>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { formatMoment } from '@/lib/clock';
import { plural } from '@/lib/format';
import { useIntegrityProbe } from '@/composables/useIntegrityProbe';
import { ref as keptRef } from 'vue';

/**
 * The space the player set up, kept for the page load rather than per mount: leaving the screen
 * unmounts it (the planner's tabs), and the bands typed came back as the defaults. A sweep link still
 * fills them in when it opens the screen, until its sweep starts.
 */
const kept = {
  // Empty until the player's TE is known: the default is Suggest a space for THIS player (it used to
  // be a fixed 185-360 that suited one account and was nonsense for a 130 or a 250).
  bandsText: keptRef(''),
  /** The text the panel filled in by itself (the default space). A box that still holds it is the
   *  panel's to refill when the save changes; a box that doesn't is the player's own. */
  autoFilled: keptRef(''),
  minGap: keptRef(0),
  suggestAsc: keptRef(6),
  /** The Ascensions box was changed by hand: the default space stops following the instant answer's
   *  count (lib/limitsFollow.ts's rule for the Limits box, here for chain 1's one count). */
  ascTouched: keptRef(false),
  /** Chain 1's two Suggest a space sliders; null until moved (then the space is sized to the default chain budget). */
  suggestWidthIx: keptRef<number | null>(null),
  suggestStepIx: keptRef<number | null>(null),
  /** The bands text the panel last wrote into Chain 1's box (default, Suggest, or a slider). A box that
   *  still holds it is the panel's to rewrite when a slider moves; anything else is the player's. */
  suggested: keptRef(''),
  extraChains: keptRef<
    { asc: number; text: string; auto?: boolean; widthIx?: number; stepIx?: number; sug?: string; keptText?: string }[]
  >([]),
};
</script>

<script setup lang="ts">
import { pricedWithLine } from '@/lib/pricedWith';
import { offerStartTimes } from '@/lib/onVirtue';
import { useInitialStateStore } from '@/stores/initialState';
import { lastRunLine } from '@/lib/lastRunLine';
import { backupSecondsOf } from '@/lib/saveFreshness';
import { thisDevice } from '@/search/device';
import { NAMES } from '@/lib/siteNav';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useStartTimesStore } from '@/stores/startTimes';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import RunNoteBox from './RunNoteBox.vue';
import BigBoxNote from './BigBoxNote.vue';
import { bigBoxNote, type BigBoxInput } from '@/search/bigBox';
import { confirmBigBox } from '@/composables/useBigBoxConfirm';
import ShareResult from './ShareResult.vue';
import SentByRunNote from './SentByRunNote.vue';
import { NICKNAME_MAX, useFastestShare } from '@/composables/useFastestShare';
import BoardSubmitButtons from './BoardSubmitButtons.vue';
import SavedRuns from './SavedRuns.vue';
import RouteResultCard from './RouteResultCard.vue';
import RouteExtras from './RouteExtras.vue';
import SoulEggWarning from '../SoulEggWarning.vue';
import { queueCountLine } from '@/lib/queueCount';
import ResultHealth from './ResultHealth.vue';
import { parseSweepRequest, withoutSweepParams } from '@/search/sweepRequest';
import { describeFirstAscension } from '@/search/firstAscension';
import {
  countBanded,
  parseBands,
  formatBands,
  suggestBands,
  SUGGESTION_CHAIN_BUDGET,
  SUGGESTABLE_ASCENSIONS,
  formatHours,
} from '@/search/exhaustive';
import { COARSE_SUGGESTION_NOTE, routeFromBands, spaceBySliders, type SpaceSliderPos } from '@/search/deadlineSuggest';
import SpaceSliders from './SpaceSliders.vue';
import RoutesToTry from './RoutesToTry.vue';
import KeptBoxNote from './KeptBoxNote.vue';
import { pinSliders, sweepSliderView } from '@/composables/useRowSliders';
import { chainCount as countLabel } from '@/lib/chartThin';
import HelpTip from './HelpTip.vue';
import BandCheckNotice from './BandCheckNotice.vue';
import { coverageAfterText, coverageBeforeText, describeEdge, findBandEdges, widenEdges } from '@/search/bandCheck';
import { showDateTime } from '@/lib/displayTime';
import { sweepSeconds, workerSecondsFromRate, workerSecondsPerChain } from '@/search/speed';
import { describeCompute } from '@/utils/computeTime';
import IntegrityNotice from './IntegrityNotice.vue';
import type { SweepQueueChain, SweepQueueRecord, SweepQueueResult } from '@/search/persistence';
import { runSweepQueue } from '@/search/sweepQueueRun';
import UnfinishedRuns from './UnfinishedRuns.vue';
import CarryOnOffer from './CarryOnOffer.vue';
import BlockedRunNotice from './BlockedRunNotice.vue';
import DeadlinePanel from './DeadlinePanel.vue';
import { formatTimeLeft } from '@/search/sweepEstimate';
import { describeTimeOff, usableTimeOff } from '@/search/timeOff';
import { gridIsComplete, gridStepLabel } from '@/search/grid';
import { useRunDownloads } from '@/composables/useRunDownloads';
import CsvCard from './CsvCard.vue';
import RunSendReport from './RunSendReport.vue';
import RunResults from './RunResults.vue';
import SharingSummary from '../SharingSummary.vue';
import EdgeWarning from './EdgeWarning.vue';
import RunErrorNotes from './RunErrorNotes.vue';
import RunControls from './RunControls.vue';
import ResultTable from './ResultTable.vue';
import DigDeeperLink from './DigDeeperLink.vue';
import FollowButton from '../FollowButton.vue';
import { sourceOfLevel } from '@/lib/followCloud';
import { foundLevel as levelOfRun } from '@/lib/searchPointer';
import type { ResultFollow } from '@/lib/follow';
import LongerRouteHint from './LongerRouteHint.vue';
import ConsentBox from './ConsentBox.vue';
import { agreeThisVisit, useConsent } from '@/composables/useConsent';

const props = defineProps<{
  playerId: string;
  /** Set by the site's tabs, which then own the choice: a change here asks them (update:goal). */
  goal?: 'fastest' | 'deadline';
  /** Leave out the space to search / The routes to try (a Simple mode that picks the routes itself). */
  hideRoutes?: boolean;
  /** Inside a box of the screen's own (FastestRoute.vue's Exhaustive box): no frame of its own. */
  embedded?: boolean;
}>();
const emit = defineEmits<{ 'update:goal': [goal: 'fastest' | 'deadline'] }>();

const store = useChainSearchStore();
const startTimes = useStartTimesStore();
/** The store's chain-search state is this panel's (Full sweep), not the other Fastest panel's: its
 *  progress, answer, charts and share show only then (store `chainRunKind`). */
const ownRun = computed(() => store.chainRunKind === 'full');
// The integrity check up front (search/rules.ts), so a stalled account says so before Start.
useIntegrityProbe(() => props.playerId);
const autoPlannerStore = useAutoPlannerStore();
const plannerTzFallback = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ui = useUIStore();
/** The result card's Download CSV (composables/useRunDownloads.ts): the same handler as the CSV row. */
const { downloadCsv } = useRunDownloads(store);

/** Past this the estimate is longer than anyone will wait, and the form says so rather than
 *  refusing: the point of this page is that the decision is the operator's. */
const TOO_BIG_HOURS = 24 * 14;

/**
 * The space is bands: one per checkpoint. There was also "One range", a single pool every checkpoint
 * drew from; it was removed on 1 Oct (the user: "if it doesn't have any worth"). It let every
 * checkpoint take any value, so the chain count was combinatorial in the pool and the space was
 * mostly chains nobody would run, and no run on the board used it. Saved runs over a range still
 * open and resume: that is the store's, which keeps both kinds.
 */
const { bandsText, minGap } = kept;

/**
 * A sweep handed over by the Chain Explorer's "Run this sweep" link (format in search/sweepRequest).
 * Read once, at setup, and applied to the same refs a person would type into, so the panel below
 * shows exactly what will run and can still be edited.
 */
// Not on Highest TE by a date, which this panel also draws: a sweep is a fastest-route run, and a
// sweep link left in the address put its banner and its tag on the date search too.
const sweepRequest =
  typeof window === 'undefined' || props.goal === 'deadline' ? null : parseSweepRequest(window.location.search);
/** "I understand ... sent to the board automatically": the account's `scienceSweep` consent. */
const sweepConsent = useConsent('scienceSweep').agreed;
/** The sweep card's sharing line, for Put my name on it on a sweep sent anonymously (SharingSummary.vue). */
const sweepSharing = ref<InstanceType<typeof SharingSummary> | null>(null);
if (sweepRequest) {
  bandsText.value = sweepRequest.bands;
  minGap.value = sweepRequest.minGap;
  store.sweepTag = { preset: sweepRequest.preset, bands: sweepRequest.bands, minGap: sweepRequest.minGap };
  // The link's first ascension is the sweep's, not the player's: not remembered (lib/setupMemory.ts).
  if (sweepRequest.firstAscension !== null) store.muteSetupMemory(() => store.setFirstAscension(sweepRequest.firstAscension!));
}
// A route handed over by the instant answer's "Check exactly" (InstantRoute.vue): its checkpoints as
// single-value bands, so the sweep prices exactly that route. Taken once and cleared.
watch(
  () => ui.fullSweepBands,
  text => {
    if (!text) return;
    bandsText.value = text;
    minGap.value = 0;
    // `kept`, not the `extraChains` binding: that is declared further down, and this runs at once.
    kept.extraChains.value = [];
    ui.fullSweepBands = null;
  },
  { immediate: true }
);
// The tag holds only while the space is still the one the link asked for. Edit the bands (or press
// Suggest a space) and it is somebody's own run, which must not count toward that preset's coverage;
// put them back and it is the preset again.
watch([bandsText, minGap], ([text, gap]) => {
  if (!sweepRequest) return;
  const same = text.trim() === sweepRequest.bands.trim() && gap === sweepRequest.minGap;
  store.sweepTag = same
    ? { preset: sweepRequest.preset, bands: sweepRequest.bands, minGap: sweepRequest.minGap }
    : null;
});

/** Ascension count the suggestion is built for. Bands fix the count, so this picks how many boxes. */
const { suggestAsc } = kept;

/**
 * A space sized to a few hours of this machine's time, or null when there isn't one.
 *
 * Two ascensions on any account, and three on most, come back as the COMPLETE sweep: every
 * reachable TE at step 1, which proves the optimum outright and needs no corpus, so it is offered
 * on targets the measured shape declines. Above that it is the measured shape, tuned to spend the
 * same budget on resolution first and width second.
 *
 * Deliberately not auto-applied. Anything but the complete sweep narrows the space, and the whole
 * value of this mode is that an unconstrained run proves something; taking that away should be a
 * decision, not a default.
 */
const suggestBudget = SUGGESTION_CHAIN_BUDGET;
/** About how long a space of `chains` takes here, at this chain length and worker count. */
const chainsTimeLabel = (chains: number) =>
  formatHours(sweepSeconds(chains, store.workerBudget, workerSeconds.value) / 3600);
/**
 * Precompute: Suggest a space for `n` ascensions. A complete sweep still wins (it proves the optimum)
 * unless the sliders were moved; otherwise the space is centred on the instant answer's route for that
 * count (`store.instantRoutes`) and sized by `deadlineSuggest.ts spaceBySliders`: to `maxChains` while
 * the sliders are unmoved (`routeSpace`), to the sliders once they are. With no instant route, unmoved
 * sliders give the measured shape, and moved ones centre on that shape's middles.
 */
type SpaceSuggestion =
  | (ReturnType<typeof suggestBands> & object)
  | {
      kind: 'instant';
      text: string;
      chains: number;
      around: number[];
      halfWidth: number;
      step: number;
      fromInstant: boolean;
      /** Coarsened to stay under the budget (deadlineSuggest.ts `cappedStopsByWidth`). */
      coarse: boolean;
    };
const NO_SLIDERS: SpaceSliderPos = { widthIx: null, stepIx: null };
function spaceFor(n: number, maxChains: number, sl: SpaceSliderPos = NO_SLIDERS): SpaceSuggestion | null {
  const moved = sl.widthIx != null || sl.stepIx != null;
  const plain = suggestBands(store.currentTE, store.finalTE, n, { maxChains });
  if (plain?.kind === 'complete' && !moved) return plain;
  const route = store.instantRoutes?.find(r => r.length === n && r[r.length - 1] === store.finalTE);
  const base =
    route ?? (moved && plain && plain.kind !== 'complete' ? routeFromBands(plain.bands, store.finalTE) : null);
  const around = base ? spaceBySliders(store.currentTE, base, sl, maxChains) : null;
  if (around)
    return {
      kind: 'instant',
      text: around.text,
      chains: around.sets,
      around: base!,
      halfWidth: around.halfWidth,
      step: around.step,
      fromInstant: !!route,
      coarse: !!around.coarse,
    };
  return plain;
}
/** Where a chain's two sliders sit and what they say (composables/useRowSliders.ts). */
const viewOf = sweepSliderView;
const chain1Sliders = computed<SpaceSliderPos>(() => ({
  widthIx: kept.suggestWidthIx.value,
  stepIx: kept.suggestStepIx.value,
}));
const suggestion = computed(() => spaceFor(suggestAsc.value, suggestBudget, chain1Sliders.value));
const chain1View = computed(() => viewOf(suggestion.value, chain1Sliders.value));
/** The box holds bands the player typed (or a sweep link filled), not ones the panel wrote. */
const chain1Typed = computed(() => {
  const cur = bandsText.value.trim();
  const s = suggestion.value;
  return !!cur && !!s && cur !== s.text && cur !== kept.suggested.value.trim() && cur !== kept.autoFilled.value.trim();
});
/** The typed box a Chain 1 slider move left alone; the note shows while the box still reads so. */
const chain1KeptText = ref('');
const chain1KeptNote = computed(
  () => !!chain1KeptText.value && chain1KeptText.value === bandsText.value.trim() && chain1Typed.value
);
/** Move one of Chain 1's sliders. Rewrites the box only when the panel wrote what is in it (the default,
 *  Suggest, or an earlier slider move): bands the player typed, or a sweep link filled, are left alone. */
function moveChain1(key: 'widthIx' | 'stepIx', value: number): void {
  const pinned = pinSliders(chain1View.value, key, value);
  kept.suggestWidthIx.value = pinned.widthIx;
  kept.suggestStepIx.value = pinned.stepIx;
  const s = suggestion.value;
  const cur = bandsText.value.trim();
  if (cur && cur !== kept.suggested.value.trim() && cur !== kept.autoFilled.value.trim()) {
    chain1KeptText.value = cur; // typed: kept, and the note says so
    return;
  }
  if (!s || store.isRunning) return;
  if (cur === kept.autoFilled.value.trim()) kept.autoFilled.value = s.text;
  bandsText.value = s.text;
  kept.suggested.value = s.text;
}

function applySuggestion(): void {
  const s = suggestion.value;
  if (!s) return;
  bandsText.value = s.text;
  kept.suggested.value = s.text;
  kept.autoFilled.value = '';
  queueNeighbours(suggestAsc.value);
}

/**
 * A suggested space only covers its own ascension count, and the best count is often one off. So
 * Suggest a space also queues the count one lower and one higher as added chains (the three run
 * one after another from one click), each at half the size so three chains cost about twice one,
 * not three times. They are the player's to remove, and any they typed themselves stay.
 */
function queueNeighbours(asc: number): void {
  if (sweepRequest) return;
  const rows = kept.extraChains.value.filter(r => !r.auto);
  const used = new Set([asc, ...rows.map(r => r.asc)]);
  const added: { asc: number; text: string; auto: boolean; sug?: string }[] = [];
  for (const n of [asc - 1, asc + 1]) {
    if (n < 1 || n > 12 || used.has(n)) continue;
    if (n === 1) {
      added.push({ asc: 1, text: '', auto: true });
      continue;
    }
    const sug = spaceFor(n, Math.floor(suggestBudget / 2));
    if (sug) added.push({ asc: n, text: sug.text, auto: true, sug: sug.text });
  }
  kept.extraChains.value = [...rows, ...added].sort((a, b) => a.asc - b.asc);
}

/**
 * The default space, for a player who has not typed one: Suggest a space for their TE, with the
 * counts either side queued. Tries the usual six ascensions and works down to the nearest count
 * the suggester can speak to. Leaves alone a box the player has touched.
 */
function fillDefault(): void {
  if (sweepRequest || store.isRunning || !(store.currentTE > 0) || !(store.finalTE > store.currentTE)) return;
  const typed = bandsText.value.trim();
  if (typed && typed !== kept.autoFilled.value) return;
  // The Ascensions box set by hand: the player's count, not the instant answer's, from then on.
  if (kept.ascTouched.value) return;
  // Precompute: the instant answer's count first (`store.suggestedCount`), then the usual six and down.
  const counts = [...new Set([store.suggestedCount ?? 6, 6, 5, 4, 3, 2])];
  for (const n of counts) {
    const sug = spaceFor(n, suggestBudget, chain1Sliders.value);
    if (!sug) continue;
    bandsText.value = sug.text;
    kept.suggested.value = sug.text;
    kept.autoFilled.value = sug.text;
    suggestAsc.value = n;
    queueNeighbours(n);
    return;
  }
}
watch(() => [store.currentTE, store.finalTE, store.suggestedCount, store.instantRoutes], fillDefault, {
  immediate: true,
});
/** The Ascensions box typed in: the default space keeps the player's count from now on. */
function markAscTouched(): void {
  kept.ascTouched.value = true;
}
/** Chain 1 is still the default space, at the instant answer's count (the grey hint beside Ascensions). */
const chain1FromInstant = computed(
  () =>
    !kept.ascTouched.value &&
    !!kept.autoFilled.value &&
    bandsText.value.trim() === kept.autoFilled.value.trim() &&
    store.suggestedCount !== null &&
    suggestAsc.value === store.suggestedCount
);

/**
 * Both budget cards start collapsed.
 *
 * They are set-once settings in a panel whose subject is the space to search, and leaving them open
 * pushed the thing people came for below the fold. The header keeps a one-line summary so a
 * collapsed card still says what it is holding -- a collapsed setting that hides its own value is
 * how people end up running with a schedule they forgot they set.
 */

/** The time off this run is planned around, or '' for none. */
const timeOffText = computed(() => (usableTimeOff(store.timeOff).length ? describeTimeOff(store.timeOff) : ''));

/** Held to the machine's cores here as well as in the pool, so the field cannot read 19 on an
 *  8-core box and quietly run 8. The store's value is the one the run uses either way. */
function setWorkers(raw: string): void {
  const n = Number(raw);
  store.setWorkersByHand(Number.isFinite(n) ? Math.max(1, Math.min(store.machineThreads, Math.floor(n))) : 1);
}

const saving = ref(false);

/** Off by default, because it is now a convenience rather than a fix.
 *
 *  It was introduced as a workaround: the board collapsed re-runs on
 *  (nickname, target, chain, effort, window, shifts), so two exhaustive runs by the same person
 *  that landed on the same chain over DIFFERENT spaces became one row, and the survivor was
 *  whichever was posted first rather than the one that proved more. The collector now puts the
 *  space in that key, so both rows stand on their own and a dated name buys nothing but
 *  legibility. Defaulting it on would be decorating every name to solve a problem that is fixed. */
const stampName = ref(false);
/** Consent, anonymous-or-named, the name box, the CSV and diagnostics boxes, the status line, Put my
 *  name on it (with "Add the time to the name" ticked the stamp is part of the name, as it would be on
 *  a send), Retry the table and the send (composables/useFastestShare.ts, shared with Smart search). */
const {
  optIn,
  anonymous,
  nickname,
  nicknameTouched,
  carryName,
  dropCarried,
  plainName,
  effectiveNickname,
  submitMessage,
  submitOk,
  submitPartial,
  retryingTable,
  retryTable,
  nameToClaim,
  offerName,
  claiming,
  claim,
  submitting,
  submit,
  payloadPreview,
  downloadSubmission,
  fastestOnBoardLine,
} = useFastestShare(store, () => props.playerId, stampName);

/** Values across all the bands (the "Values tried" figure). */
const poolSize = computed(() => bands.value.reduce((n, b) => n + b.length, 0));

/** Counted combinatorially, never by enumerating: at step 1 over a wide range the array of chains
 *  does not fit in memory, and the whole point of showing this is to say so before that happens. */
const bands = computed(() => parseBands(bandsText.value));

// The Ascensions box follows the bands whenever they change -- typed, suggested, or filled in by a
// Chain Explorer link -- so it only ever disagrees with them when someone changes the box itself.
watch(
  () => bands.value.length,
  n => {
    if (n) suggestAsc.value = n + 1;
  },
  { immediate: true }
);
/** The box says one count and the bands another: the run would use the bands, silently. */
const ascMismatch = computed(() => bands.value.length > 0 && suggestAsc.value !== bands.value.length + 1);

/** The grid the inputs above describe, before a run: for the step note. */
const plannedGridComplete = computed(() => gridIsComplete(bands.value.length ? bands.value : undefined, undefined));
const plannedGridLabel = computed(() => gridStepLabel(bands.value.length ? bands.value : undefined, undefined));
/** The first band's first few values, so "every 5 TE" has something concrete beside it. */
const gridExample = computed(() => (bands.value[0] ?? []).slice(0, 3).join(', ') + ', ...');

/** What the winner is, in words that hold: a grid's best is not the best of every TE. */
const resultClaim = computed(() => {
  const sp = store.searchSpace;
  if (!sp) return 'best found';
  const complete = gridIsComplete(sp.bands, sp.range?.step);
  if (complete) return 'the best of every route in this space';
  return `best on this grid (${gridStepLabel(sp.bands, sp.range?.step)})`;
});
const resultExplain = computed(() => {
  const sp = store.searchSpace;
  if (!sp || gridIsComplete(sp.bands, sp.range?.step)) return '';
  const step = gridStepLabel(sp.bands, sp.range?.step);
  return `Every route on the grid (${step}) was priced, and this is the fastest. Values between grid points were not tried, so Fast and Exact can land on something faster in between.`;
});

/** The ascension counts this click will try: chain 1 and each added chain that can run. */
const coveredCounts = computed(() => {
  const set = new Set<number>();
  if (bands.value.length) set.add(bands.value.length + 1);
  if (!sweepRequest) {
    extraChains.value.forEach((row, k) => {
      if (row.asc <= 1 || extraCount(k) > 0) set.add(row.asc);
    });
  }
  return [...set].sort((a, b) => a - b);
});
const ascWord = (n: number) => (n === 1 ? '1 ascension' : `${n} ascensions`);
/** `4`, `4 and 5`, `4, 5 and 6`. */
function countList(counts: number[]): string {
  const c = counts.map(String);
  return c.length < 2 ? c.join('') : `${c.slice(0, -1).join(', ')} and ${c[c.length - 1]}`;
}
const coverageBefore = computed(() => coverageBeforeText(coveredCounts.value));
/** What the finished (or running) sweep covered. A queue of several chains shows its own table. */
const coverageAfter = computed(() => {
  const sp = store.searchSpace;
  if (!sp || queueResults.value.length > 1) return '';
  return coverageAfterText(sp.minAscensions, sp.maxAscensions);
});
/** The instant answer's count (set by the branch that has one), when this sweep doesn't cover it. */
const suggestedCountNote = computed(() => {
  const n = store.suggestedCount;
  if (!n || coveredCounts.value.includes(n)) return '';
  return `The instant answer suggests ${ascWord(n)}; this sweep only searches ${countList(coveredCounts.value)}.`;
});

/** Where the winner sits on the first or last value of its band, with room to go further. */
const edges = computed(() => {
  const sp = store.searchSpace;
  if (store.isRunning || store.bestDays <= 0 || !sp?.bands?.length) return [];
  return findBandEdges(sp.bands, store.bestChain, {
    currentTE: store.currentTE,
    finalTE: store.finalTE,
    minGap: sp.minGap,
  });
});
/** The bands widened on those edges, and what the wider space would cost. */
const edgeWiden = computed(() => {
  const sp = store.searchSpace;
  if (!edges.value.length || !sp?.bands) return null;
  const text = widenEdges(sp.bands, edges.value, { currentTE: store.currentTE, finalTE: store.finalTE });
  if (!text) return null;
  const wider = parseBands(text);
  return { text, bands: wider, chains: countBanded(wider, store.finalTE, store.currentTE, sp.minGap) };
});
const edgeWords = describeEdge;

/** Widen those bands and run the wider space. Chains already priced are carried over by the store
 *  when nothing about the setup changed, so only the new ones are priced. */
async function widenAndRun(): Promise<void> {
  const w = edgeWiden.value;
  const sp = store.searchSpace;
  if (!w || !sp?.bands || store.busy) return;
  // The wider box asks first when it is big, before the boxes on screen change (search/bigBox.ts).
  if (!(await confirmBigBox(bigBoxInputFor(w.chains)))) return;
  const was = formatBands(sp.bands);
  const k = extraChains.value.findIndex((_, i) => formatBands(extraBands(i)) === was);
  if (formatBands(bands.value) !== was && k >= 0) {
    typedExtra(k, w.text);
  } else bandsText.value = w.text;
  // The sweep link's tag follows the box on the next tick; the run reads it as it starts.
  await nextTick();
  autoSubmitArmed.value = false;
  autoSubmitted.value = false;
  await store.startExhaustive(
    props.playerId,
    {
      lo: 0,
      hi: 0,
      step: 1,
      minAsc: w.bands.length + 1,
      maxAsc: w.bands.length + 1,
      minGap: sp.minGap,
      bands: w.bands,
    },
    { recheck: false }
  );
}

const chainCount = computed(() =>
  bands.value.length ? countBanded(bands.value, store.finalTE, store.currentTE, minGap.value) : 0
);

/** Every pick of one value per band, playable or not, and how many of those can't be played (a
 *  checkpoint at or below the one before it, or closer than the minimum gap). Chain 1 only. */
const combinations = computed(() => (bands.value.length ? bands.value.reduce((n, b) => n * b.length, 1) : 0));
const unplayable = computed(() => Math.max(0, combinations.value - chainCount.value));

// While a run goes, the chains IT prices (the queue's, carried on or not, or the one chain a lone
// carry-on runs), the count the time left beside it is for; the form's figure counted the added
// chains on a carry-on too.
const chainCountLabel = computed(() => {
  const n = runLeft.value ? runLeft.value.chainsTotal : totalChains.value;
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '∞';
});
/** Under the count while a run goes: which chain of a queue, or that a carry-on runs its own only. */
const runChainsNote = computed(() => {
  const left = runLeft.value;
  if (!left) return '';
  if (left.chain)
    return `all boxes · ${queueCountLine({ chain: left.chain, done: pricedSoFar.value, total: store.chainsEstimated, queueTotal: null })}`;
  return !sweepRequest && extraChains.value.length ? 'the box running; the added boxes are not part of it' : '';
});

// ------------------------------------------------------------------ more chains for one click

/** Chains to run after the first, each with its own ascension count and bands. */
const { extraChains } = kept;
// Parsed and counted once per edit, not on every call from the template (each row asks several
// times a render, and a run re-renders every second).
const extraParsed = computed(() => extraChains.value.map(row => parseBands(row.text)));
const extraCounts = computed(() =>
  extraChains.value.map((row, k) => {
    if (row.asc <= 1) return 1;
    const b = extraParsed.value[k];
    return b.length === row.asc - 1 ? countBanded(b, store.finalTE, store.currentTE, minGap.value) : 0;
  })
);
function extraBands(k: number): number[][] {
  return extraParsed.value[k] ?? [];
}
function extraCount(k: number): number {
  return extraCounts.value[k] ?? 0;
}
function extraProblem(k: number): string {
  const row = extraChains.value[k];
  if (!row || row.asc <= 1) return '';
  const b = extraBands(k);
  if (!b.length) return 'Nothing readable yet: press Suggest a space or type bands.';
  if (b.length !== row.asc - 1) return `These ranges make ${b.length + 1} ascensions, not ${row.asc}.`;
  return extraCount(k) ? '' : 'No route in these ranges goes up to the target.';
}
function extraSummary(k: number): string {
  const row = extraChains.value[k];
  if (!row) return '';
  if (row.asc <= 1) return `Straight to ${store.finalTE}: one route.`;
  return `${extraCount(k).toLocaleString()} routes · ${extraBands(k)
    .map(b => b.length)
    .join(' × ')} values`;
}
function suggestExtra(k: number): void {
  const row = extraChains.value[k];
  if (!row) return;
  const sug = spaceFor(row.asc, extraBudget(row), rowSliders(row));
  if (sug) {
    row.text = sug.text;
    row.sug = sug.text;
  }
}
type ExtraRow = (typeof extraChains.value)[number];
/** An added chain Suggest queued is half the size; one the player added is full size (sliders unmoved). */
const extraBudget = (row: ExtraRow) => (row.auto ? Math.floor(suggestBudget / 2) : suggestBudget);
const rowSliders = (row: ExtraRow): SpaceSliderPos => ({ widthIx: row.widthIx ?? null, stepIx: row.stepIx ?? null });
const extraSugs = computed(() =>
  extraChains.value.map(row => (row.asc >= 2 ? spaceFor(row.asc, extraBudget(row), rowSliders(row)) : null))
);
/** An added chain's suggestion was coarsened to stay under its budget (the note says so). */
function extraCoarse(k: number): boolean {
  const s = extraSugs.value[k];
  return s?.kind === 'instant' && s.coarse;
}
const extraViews = computed(() => extraChains.value.map((row, k) => viewOf(extraSugs.value[k], rowSliders(row))));
/** The box holds bands the player typed, not ones the panel wrote. */
function extraTyped(k: number): boolean {
  const row = extraChains.value[k];
  const s = extraSugs.value[k];
  const cur = row?.text.trim();
  return !!cur && !!s && cur !== s.text && cur !== (row.sug ?? '').trim();
}
/** Move one of an added chain's sliders; its box is rewritten only if the panel wrote what is in it. */
function moveExtra(k: number, key: 'widthIx' | 'stepIx', value: number): void {
  const row = extraChains.value[k];
  if (!row) return;
  const pinned = pinSliders(extraViews.value[k], key, value);
  row.widthIx = pinned.widthIx ?? undefined;
  row.stepIx = pinned.stepIx ?? undefined;
  const s = extraSugs.value[k];
  const cur = row.text.trim();
  if (cur && cur !== (row.sug ?? '').trim()) {
    row.keptText = cur; // typed: kept, and the note says so
    return;
  }
  if (!s || store.isRunning) return;
  row.text = s.text;
  row.sug = s.text;
}
/** Per added chain: a slider moved while its typed box stayed, and the box still differs from the sliders'. */
const extraKeptNotes = computed(() =>
  extraChains.value.map((row, k) => !!row.keptText && row.keptText === row.text.trim() && extraTyped(k))
);
/** The added chains as RoutesToTry draws them. */
const extraProblems = computed(() => extraChains.value.map((_, k) => extraProblem(k)));
const extraSummaries = computed(() => extraChains.value.map((_, k) => extraSummary(k)));
/** A box typed in, or a band checker's "did you mean" taken: the player's own now. */
function typedExtra(k: number, text: string): void {
  const row = extraChains.value[k];
  if (!row) return;
  row.text = text;
  row.auto = false;
}
/** A new chain one ascension shorter than the last, since the short ones are what get queued. */
function addChain(): void {
  const used = [bands.value.length + 1, ...extraChains.value.map(r => r.asc)];
  let asc = Math.max(1, Math.min(...used) - 1);
  while (used.includes(asc) && asc < 12) asc++;
  extraChains.value.push({ asc, text: '' });
  if (asc >= 2) suggestExtra(extraChains.value.length - 1);
}
/**
 * "A longer route might win" (LongerRouteHint.vue): add a chain with `n` ascensions, its box filled in
 * by Suggest a space (centred on the instant answer's route for that count when there is one). Adds
 * nothing when a row for that count is already queued with the suggested box; the player presses Find.
 */
function addChainOfCount(n: number): string {
  const suggested = spaceFor(n, suggestBudget)?.text ?? '';
  const queued = extraChains.value.findIndex(r => r.asc === n && r.text.trim() === suggested);
  if (queued >= 0) return `Box ${queued + 2} already has ${n} ascensions. Press Run Custom to run it.`;
  extraChains.value.push({ asc: n, text: '' });
  const k = extraChains.value.length - 1;
  suggestExtra(k);
  return `Added Box ${k + 2} with ${n} ascensions under The space to search. Press Run Custom to run it.`;
}
/** The instant answer's route, handed to the Full sweep as one-value bands (taken by the watch on `ui.fullSweepBands`). */
function checkRouteExactly(chain: number[]): void {
  if (sweepRequest) return;
  ui.fullSweepBands = chain.slice(0, -1).join('; ');
}
const extraTotal = computed(() => extraChains.value.reduce((n, _, k) => n + extraCount(k), 0));
const extrasReady = computed(() => extraChains.value.every((_, k) => !extraProblem(k)));
/** Every chain the one click will price. */
// The added chains only run in "Set each checkpoint" mode (they are hidden in the others), so they
// only count there -- otherwise the estimate warned about chains that were never going to run.
const totalChains = computed(() => chainCount.value + (!sweepRequest ? extraTotal.value : 0));
function specOfExtra(k: number): ReturnType<typeof currentSpec> {
  const row = extraChains.value[k];
  if (row.asc <= 1) {
    // One ascension: straight to the target, which the pool form expresses as 1..1 ascensions.
    const te = Math.floor(store.currentTE) + 1;
    return { lo: te, hi: te, step: 1, minAsc: 1, maxAsc: 1, minGap: 0 };
  }
  return { lo: 0, hi: 0, step: 1, minAsc: row.asc, maxAsc: row.asc, minGap: minGap.value, bands: extraBands(k) };
}

/** What each chain of a multi-chain click found, for the table under the result. */
/** The queue lives in the store (sweepQueue), so it keeps going, and shows again, when this panel
 *  closes for another tab and opens again. */
const queueResults = computed({
  get: () => store.sweepQueue.results,
  set: v => (store.sweepQueue.results = v),
});
// The table is the last click's; a single run afterwards replaces it (the store does that now).
const queueAt = computed({
  get: () => store.sweepQueue.at,
  set: v => (store.sweepQueue.at = v),
});

/**
 * Chains finished, counting the chunk in flight.
 *
 * `chainsDone` only advances when a whole chunk resolves, so on its own the counter sits still for
 * as long as a chunk takes and the run looks hung. The pool reports within-batch progress for
 * exactly this reason; the main panel already shows it as a second bar, and here it just folds into
 * the first.
 */
const pricedSoFar = computed(() => store.chainsDone + (store.isRunning ? store.batchDone : 0));

/**
 * The finish INSTANT, not the duration. Durations from different plan starts are not comparable --
 * two runs started an hour apart produce day counts that cannot be ranked against each other -- and
 * the date is what a player actually plans around. The main panel has shown this all along; the
 * exhaustive panel printed days only, which is exactly the comparison people were getting wrong.
 */
const endDate = computed(() => {
  if (!(store.bestDays > 0)) return '—';
  const tz = autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatMoment((store.planStart + store.bestDays * 86400) * 1000, { zone: tz, weekday: true, dateOnlyWhenFar: true });
});
/**
 * The rate this machine is actually managing, once it has managed anything. The 15 s assumption is
 * a floor for a cold leg, and prefix sharing means most chains cost a fraction of that -- on these
 * runs the real figure has landed anywhere from 0.66 to 3.2 s, which is the difference between an
 * estimate that means something and one that is off by a factor of twenty.
 */
/** The ascension counts the measured corpus can actually speak to, not a hardcoded 5-7. */
const suggestRange = computed<[number, number]>(() => [
  Math.min(...SUGGESTABLE_ASCENSIONS),
  Math.max(...SUGGESTABLE_ASCENSIONS),
]);

const measuredCost = computed(() => (store.secondsPerChain > 0 ? store.secondsPerChain : 0));

/**
 * THE ESTIMATE (search/speed.ts), in worker-seconds per chain so it carries across worker counts:
 * measured on this machine when there is a benchmark or a finished run, otherwise the typical
 * figure for this chain length from players' recorded runs. It used to divide a rate that was
 * ALREADY wall-clock across the whole pool by the worker count a second time, which after any run
 * made the next estimate about the worker count too short (7 min read as "1 min").
 */
const sweepAscensions = computed(() => bands.value.length + 1);
const workerSeconds = computed(() =>
  measuredCost.value
    ? workerSecondsFromRate(measuredCost.value, store.rateWorkers || store.workerBudget)
    : workerSecondsPerChain(sweepAscensions.value)
);
/** Wall-clock seconds per chain on the workers the slider asks for. */
const wallPerChain = computed(() => sweepSeconds(1, store.workerBudget, workerSeconds.value));
const speedSourceLabel = computed(() => `typical for ${sweepAscensions.value}-ascension routes in players' runs`);
/** What the paragraph under the estimate says it charges per chain, on the chosen workers. */
const assumedCostLabel = computed(() => `${wallPerChain.value.toFixed(2)} s`);

const hours = computed(() => sweepSeconds(totalChains.value, store.workerBudget, workerSeconds.value) / 3600);

/**
 * Once a run is going, the store's ONE time left (search/sweepEstimate.ts `sweepTimeLeft`), the same
 * figure the progress bar shows on every tab: the whole queue's, over the chains this session really
 * priced. It used to be elapsed x remaining / done here, with the chains REPLAYED by a carry-on in
 * `done` ("8 min left" on a queue hours long, the user, 9 Oct) and only the chain running in
 * "remaining", while the bar said something else again.
 */
const runLeft = computed(() => (store.isRunning ? store.sweepLeft : null));
const estimateLabel = computed(() => {
  const left = runLeft.value;
  if (left) {
    if (left.seconds === null) return 'measuring…';
    const words = formatTimeLeft(left.seconds);
    return words ? `${words} left${left.measuring ? ' (measuring…)' : ''}` : 'almost done';
  }
  return chainCount.value ? formatHours(hours.value) : '—';
});
const tooBig = computed(() => chainCount.value > 0 && hours.value > TOO_BIG_HOURS);
/**
 * Above 300,000 routes, the amber note under the estimate (search/bigBox.ts): the count shown as
 * Routes it will run and the hours shown as Est. wall clock, with what the speed came from. Before a
 * run only: during one the time left is the run's own.
 */
const bigBox = computed(() => (runLeft.value ? null : bigBoxNote(bigBoxInputFor(totalChains.value))));
/** The note's figures for a box of `routes` (the count on screen, or Widen and run again's wider box):
 *  the hours as Est. wall clock works them out, what the speed came from. What Start asks with too. */
function bigBoxInputFor(routes: number): BigBoxInput {
  return {
    routes,
    seconds: sweepSeconds(routes, store.workerBudget, workerSeconds.value),
    workers: store.workerBudget,
    basis: measuredCost.value
      ? `${store.rateSource === 'benchmark' ? 'benchmarked' : 'measured'} on ${thisDevice()}`
      : speedSourceLabel.value,
    device: thisDevice(),
    where: 'site',
  };
}

onMounted(() => {
  void store.refreshSavedRuns(props.playerId);
  // Look for an interrupted run. Nothing else on this panel did, so a checkpoint written by a run
  // the browser killed sat there unread until somebody happened to set up the identical space.
  void store.checkResumable(props.playerId);
  // A rate measured in an earlier session beats the 15 s assumption on a fresh page load, whether it
  // came from a benchmark or from a real run that finished a chunk.
  store.restoreBenchmark(props.playerId);
});

// Re-check whenever what decides resumability moves (TE, target, schedule...), so "can't continue"
// goes away when the player puts a setting back, and appears when a fresh save changes the TE.
watch(
  // `busy` too: a run ending (or a stored save finishing loading) is when the lists change.
  () => [props.playerId, store.resumeInputsKey, store.busy],
  () => {
    if (!store.busy) void store.checkResumable(props.playerId);
  }
);

/** The space `startExhaustive` and `benchmarkMachine` both need — one literal, so the two can never
 *  be asked to look at different spaces. The range fields are unused with bands. */
function currentSpec(): {
  lo: number;
  hi: number;
  step: number;
  minAsc: number;
  maxAsc: number;
  minGap: number;
  bands?: number[][];
} {
  return {
    lo: 0,
    hi: 0,
    step: 1,
    minAsc: bands.value.length + 1,
    maxAsc: bands.value.length + 1,
    minGap: minGap.value,
    bands: bands.value,
  };
}

/**
 * ONE CLICK for a sweep opened from the Chain Explorer: the card's checkbox is the consent to send,
 * so pressing Start arms an automatic submission, and a run that finishes sends itself -- summary and
 * CSV -- with no second visit to the bottom of the page. A run stopped early, one that failed, or one
 * where nothing finished is not sent; the manual Submit section stays for those.
 */
const autoSubmitArmed = ref(false);
const autoSubmitted = ref(false);
/** The result on screen went with its run (Find and submit, a sweep link, or a run that owed it): Share
 *  this result gives way to one line. A send that failed keeps the box, so it can still be sent by hand. */
const sentByRun = computed(() => autoSubmitted.value && submitOk.value && (submitting.value || store.alreadySubmitted));

/** Set for the length of a Find and submit click (one run or a whole queue). */
const findAndSubmit = ref(false);

/** Find; with `andSubmit`, each finished result is sent as Share this result would send it. */
async function start(andSubmit = false): Promise<void> {
  // Above 100,000 routes (all the boxes this click runs) it asks first, before anything is set: a
  // Cancel starts nothing and leaves nothing behind (search/bigBox.ts, BigBoxConfirm.vue).
  if (!(await confirmBigBox(bigBoxInputFor(totalChains.value)))) return;
  findAndSubmit.value = andSubmit && optIn.value;
  // A fresh run goes under the account's own choice, not the last carried-on run's name.
  dropCarried();
  store.lastAutoSend = null;
  // The sweep link has done its job: later visits to this screen (and reloads) start from the
  // player's own settings, not the link's again.
  if (sweepRequest && sweepConsent.value) history.replaceState(null, '', withoutSweepParams(location.href));
  // For the progress bar on other tabs: this run sends itself when it finishes.
  store.submitsWhenDone = findAndSubmit.value || (!!sweepRequest && sweepConsent.value);
  // Send best so far, with the consent this click already has (or that the box asks for mid-run).
  store.beginBestSoFar('fastest', store.submitsWhenDone ? { nickname: plainName.value } : null);
  try {
    // A fresh click: an unfinished queue from before (a crash, a reload) is over, so a later carry-on
    // of the run in the slot runs that chain alone, not the old queue's rest.
    if (!store.busy && queueAt.value < 0) await store.persistQueue(props.playerId, null);
    await startOne();
  } finally {
    findAndSubmit.value = false;
    store.submitsWhenDone = false;
    store.endBestSoFar();
  }
}

/**
 * Whether the run that just ended owes the board its result: the player agreed to share during the
 * run (Send best so far's box), or the run sent a best so far, which its result replaces. For a
 * carried-on run, its best so far went under a name from before the reload: the result goes under it.
 */
async function owesResult(): Promise<boolean> {
  const agreed = !!store.bestSoFar?.consent;
  await store.bestSoFarSettled();
  // Not once the player withdrew (store `owedRow`).
  const owed = store.owedRow('fastest');
  // Under the name its best so far went with, on this screen only (never the account's choice).
  if (!agreed && owed) carryName(owed.nickname ?? '');
  return agreed || !!owed;
}

/** The result on screen, sent the way the sweep card sends one (CSV included, no time stamp on the name). */
async function sendFinished(): Promise<void> {
  // Stopped early it still sends: the board labels it partial rather than exhaustive (leaderboardRank).
  // Withdrawn during the run (the agreement, or the sweep card's "I understand"): nothing goes.
  if (store.shareWithdrawn || store.error || store.bestDays <= 0) return;
  stampName.value = false;
  // The send needs the box ticked; the run's yes counts for this visit only.
  agreeThisVisit('leaderboard');
  autoSubmitted.value = true;
  await submit(!!sweepRequest);
  store.lastAutoSend = { kind: 'full', ok: submitOk.value, text: submitMessage.value };
}

async function startOne(): Promise<void> {
  if (!sweepRequest && extraChains.value.length) {
    await startQueue();
    return;
  }
  autoSubmitArmed.value = (!!sweepRequest && sweepConsent.value) || findAndSubmit.value;
  autoSubmitted.value = false;
  // Armed: the sweep sends itself at the end, so its last seconds may re-price the player's best
  // earlier plans on the workers before they are shut down (the store's "re-checks").
  await store.startExhaustive(props.playerId, currentSpec(), { recheck: autoSubmitArmed.value });
  // Read live: a withdraw during the run cleared `submitsWhenDone` (store `withdrawShareConsent`).
  if (!(autoSubmitArmed.value && store.submitsWhenDone) && !(await owesResult())) return;
  autoSubmitArmed.value = false;
  // The card's own choice (anonymous by default, or the nickname box) is what goes; blank name with
  // "credit me" picked still goes anonymously, as `effectiveNickname` already decides.
  await sendFinished();
}

/**
 * Run chain 1 and every added chain, one after another, from one click. Each is an ordinary run
 * over its own space -- its own checkpoint, its own result -- and each finished one is saved to the
 * run library so the earlier ones are still there to open once the next has taken the panel.
 */
async function startQueue(): Promise<void> {
  if (queueAt.value >= 0 || store.busy) return;
  const chains: SweepQueueChain[] = [
    {
      label: `Box 1 · ${bands.value.length + 1} ascensions`,
      spec: currentSpec(),
      count: chainCount.value,
      ascensions: bands.value.length + 1,
    },
    ...extraChains.value.map((row, k) => ({
      label: `Box ${k + 2} · ${row.asc} ascension${row.asc === 1 ? '' : 's'}`,
      spec: specOfExtra(k),
      count: extraCount(k),
      ascensions: Math.max(1, row.asc),
    })),
  ];
  await runQueue(props.playerId, chains, { from: 0, results: [], carry: null, name: plainName.value });
}

/**
 * Carry on a queue a crash or a reload interrupted: the chain it was on (or the next one, when that
 * chain had already finished and been recorded), then the rest, as the click would have. The queue's
 * own Find and submit (and the name it sent under) comes back with it.
 */
async function resumeQueue(q: SweepQueueRecord, next: number): Promise<void> {
  if (queueAt.value >= 0 || store.busy) return;
  resuming.value = 'checkpoint';
  // Its recorded Find and submit holds unless the account's agreement was withdrawn since.
  findAndSubmit.value = q.submit && store.carriedYesHolds();
  // Its own name, on this screen only (never the account's choice).
  if (q.submit) carryName(q.name ?? '');
  store.lastAutoSend = null;
  store.submitsWhenDone = findAndSubmit.value;
  store.beginBestSoFar('fastest', findAndSubmit.value ? { nickname: q.name ?? '' } : null);
  try {
    await runQueue(props.playerId, q.chains, {
      from: next,
      results: q.results,
      carry: next === q.at ? 'same' : 'next',
      name: q.name ?? '',
    });
  } finally {
    resuming.value = '';
    findAndSubmit.value = false;
    store.submitsWhenDone = false;
    store.endBestSoFar();
  }
}

/** Run the queue's chains from `from` on (search/sweepQueueRun.ts); `carry`: the first is a carry-on. */
async function runQueue(
  player: string,
  chains: SweepQueueChain[],
  o: { from: number; results: SweepQueueResult[]; carry: 'same' | 'next' | null; name: string }
): Promise<void> {
  await runSweepQueue(
    {
      queue: store.sweepQueue,
      playerNow: () => props.playerId,
      busy: () => store.busy,
      start: (spec, opts) => store.startExhaustive(player, spec, opts),
      resume: (next, opts) => store.resumeCrashedRun(player, next, opts),
      outcome: () => ({
        error: store.error,
        failed: store.stage === 'failed',
        stoppedEarly: store.stoppedEarly,
        days: store.bestDays,
        chain: [...store.bestChain],
        // The finish is fixed now, against this run's own start: worked out later it used whatever
        // run was on screen by then.
        finish: store.planStartUsed + store.bestDays * 86400,
      }),
      chainStarting: () => (autoSubmitted.value = false),
      // Find and submit: each chain's result goes as it finishes, before the next takes the panel.
      // So does one whose best so far is on the board (its result replaces it, stopped or not), and
      // every one once the player agreed during the queue (Send best so far's box).
      sendIfOwed: async stopped => {
        await store.bestSoFarSettled();
        // Live: a withdraw during the queue cleared `submitsWhenDone` and the yes, and `owedRow` is null.
        const armed = findAndSubmit.value && store.submitsWhenDone;
        const owes = !!store.owedRow('fastest') || (!armed && !!store.bestSoFar?.consent);
        if ((armed && !stopped) || owes) await sendFinished();
      },
      save: async label => void (await store.saveCurrentRun(player, label)),
      persistQueue: handled => store.persistQueue(player, handled),
    },
    { player, chains, ...o, submit: findAndSubmit.value }
  );
}

/** Set by Stop (the store's stop() sets it too, for the progress bar's): the queue checks it between
 *  chains. No longer set by the panel going away: with the planner's tabs that happens whenever
 *  someone looks at the leaderboard, and the queue is meant to keep going. */
const queueCancelled = computed({
  get: () => store.sweepQueue.cancelled,
  set: v => (store.sweepQueue.cancelled = v),
});
watch(
  () => store.stopRequested,
  v => {
    if (v && queueAt.value >= 0) queueCancelled.value = true;
  }
);
function stopRun(): void {
  if (queueAt.value >= 0) queueCancelled.value = true;
  if (store.isRunning) store.stop();
}

async function benchmark(): Promise<void> {
  await store.benchmarkMachine(props.playerId, currentSpec());
}

/** Coarse "Xs/Xm/Xh ago" for the benchmark caption. Backed by its own slow ticker rather than the
 *  run's 1 s one, which only exists while `store.isRunning` — a benchmarked-but-not-yet-started rate
 *  needs its age to keep advancing too. */
const nowForAge = ref(Date.now());
let ageTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  ageTimer = setInterval(() => (nowForAge.value = Date.now()), 30_000);
});
onUnmounted(() => ageTimer && clearInterval(ageTimer));

const GOALS = [
  { id: 'fastest', label: 'Fastest to a target' },
  { id: 'deadline', label: 'Highest TE by a date' },
] as const;
/** Opens on the date question with `#deadline` in the link, for sharing the Egg Day search. With the
 *  site's tabs in charge (the `goal` prop), theirs is the answer and a switch here goes to them. */
const ownGoal = ref<'fastest' | 'deadline'>(
  typeof window !== 'undefined' &&
    (/deadline/.test(window.location.hash) || new URLSearchParams(window.location.search).get('goal') === 'deadline')
    ? 'deadline'
    : 'fastest'
);
const goal = computed<'fastest' | 'deadline'>({
  get: () => props.goal ?? ownGoal.value,
  set: g => {
    ownGoal.value = g;
    if (props.goal && props.goal !== g) emit('update:goal', g);
  },
});

/** Into the Auto Planner with this run's best chain -- time off worked in -- and build it there. */
function buildPlan(): void {
  store.applyChain([...store.bestChain]);
  store.generateWhenPlannerOpens = true;
  ui.openPlannerRequested++;
}

/** "This search ran on ..., on your save of ..., and found 307 TE." (lib/lastRunLine.ts) */
const ranLine = computed(() =>
  store.chainResultAt && !store.isRunning
    ? lastRunLine({
        level: 'exhaustive',
        at: store.chainResultAt,
        saveAt: store.chainRunSaveAt,
        loadedSaveAt: backupSecondsOf(useInitialStateStore().rawBackup),
        te: store.finalTE,
        zone: autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        now: Math.floor(Date.now() / 1000),
      })
    : ''
);

/** The card's "Your last run · ..." when its result isn't from a run in this visit on these settings
 *  (store `chainRunLive`); '' for a live one. */
const lastRunLabel = computed(() => {
  if (store.chainRunLive) return '';
  const at = store.chainResultAt;
  return at
    ? showDateTime(at / 1000, autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
    : 'from an earlier visit';
});
/** "Follow this route" on the result card (RouteResultCard.vue): the finished result for this race, its level as the
 *  source (Custom for this screen's own run). */
/** The same for a row of the boxes' results (once the queue is done): the goal, source and plan start. */
const rowFollow = computed<Pick<ResultFollow, 'goalKey' | 'source' | 'planStart'> | null>(() =>
  store.isRunning || queueAt.value >= 0
    ? null
    : {
        goalKey: `fastest-${store.finalTE}`,
        source: sourceOfLevel(levelOfRun({ custom: store.runKindUsed === 'full', effort: store.runSettingsUsed?.effort })),
        planStart: store.planStartUsed || store.planStart,
      }
);
const customFollow = computed<ResultFollow | null>(() => {
  const chain = store.bestChain;
  if (store.isRunning || !chain.length || !(store.bestDays > 0) || chain[chain.length - 1] !== store.finalTE) return null;
  const start = store.planStartUsed || store.planStart;
  return {
    goalKey: `fastest-${store.finalTE}`,
    source: sourceOfLevel(levelOfRun({ custom: store.runKindUsed === 'full', effort: store.runSettingsUsed?.effort })),
    finish: start + store.bestDays * 86400,
    endTE: store.finalTE,
    planStart: start,
  };
});
function saveWhen(unixSeconds: number | undefined): string {
  if (!unixSeconds) return 'an unknown time';
  return showDateTime(unixSeconds, autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function agoLabel(ms: number): string {
  const diffS = Math.max(0, Math.round((nowForAge.value - ms) / 1000));
  if (diffS < 60) return `${diffS} s ago`;
  const diffM = Math.round(diffS / 60);
  if (diffM < 60) return `${diffM} min ago`;
  const diffH = Math.round(diffM / 60);
  if (diffH < 48) return `${diffH} h ago`;
  return `${Math.round(diffH / 24)} days ago`;
}

/** The result card's Save run (named later, or not, in Saved runs). */
async function save(): Promise<void> {
  saving.value = true;
  try {
    await store.saveCurrentRun(props.playerId);
  } finally {
    saving.value = false;
  }
}

async function resumeCrashed(): Promise<void> {
  // A carried-on run is a "fastest to a target" run: show that view, or its progress is hidden and
  // the deadline panel just says it is waiting (a player clicked this from the deadline view).
  goal.value = 'fastest';
  // One chain of a Full sweep queue: carry on the queue, not that chain alone.
  const queued = store.crashedQueue;
  if (queued) {
    await resumeQueue(queued.record, queued.next);
    return;
  }
  resuming.value = 'checkpoint';
  store.beginBestSoFar('fastest', null);
  let owes = false;
  try {
    await store.resumeCrashedRun(props.playerId);
    owes = await owesResult();
  } finally {
    resuming.value = '';
    store.endBestSoFar();
  }
  // Its best so far (sent before the interruption, or since) is replaced by its result.
  if (owes) await sendFinished();
}

/** The carry-on offer's words for an interrupted queue: which chain, of how many, and what is done. */
const crashedQueueNote = computed(() => {
  const q = store.crashedQueue;
  if (!q) return '';
  const of = q.record.chains.length;
  const done = q.record.results.filter(r => r.days > 0).length;
  const doneText = done ? ` ${done} finished ${done === 1 ? 'box is' : 'boxes are'} kept in the table.` : '';
  const rest = of - q.next - 1;
  const restText = rest ? `, then the ${rest === 1 ? 'last one' : `other ${rest}`}` : '';
  const head = `A Custom run of ${of} boxes stopped without finishing, at box ${q.record.at + 1} of ${of}.${doneText}`;
  return q.next === q.record.at
    ? `${head} Carrying on finishes box ${q.next + 1}${restText}${q.record.submit ? ', sending each as it finishes, as you asked' : ''}.`
    : `${head} That box finished; carrying on starts box ${q.next + 1}${restText}${q.record.submit ? ', sending each as it finishes, as you asked' : ''}.`;
});

/** Which run is mid-resume, for the button's own label. Empty when none is. */
const resuming = ref('');

/** "Check start times for this route" only before the player is on virtue (lib/onVirtue.ts). */
const offerStart = computed(() => offerStartTimes(useInitialStateStore().rawBackup));
/** The hours and time off this run was priced with (its own settings, not the live setup); '' when no run's
 *  settings are known (lib/pricedWith.ts). */
const pricedWith = computed(() => (store.runSettingsUsed ? pricedWithLine(store.runSettingsUsed) : ''));
</script>
