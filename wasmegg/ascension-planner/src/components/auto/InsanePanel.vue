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
  <div class="section-premium p-4 sm:p-8 max-w-4xl mx-auto mt-6 relative overflow-hidden">
    <div class="absolute -right-20 -top-20 w-64 h-64 bg-rose-500/5 rounded-full blur-3xl"></div>

    <div class="relative z-10 space-y-6">
      <!-- Each screen has its own heading (FastestRoute.vue, ByDateScreen.vue). -->
      <!-- A sweep requested from the Science tab's "What we need to check" list: everything is filled
           in already, so the only decisions left are how much of the machine to give it and whether
           the time is acceptable. -->
      <div v-if="sweepRequest" class="p-4 rounded-xl border border-indigo-200 bg-indigo-50 space-y-3">
        <div class="space-y-1">
          <p class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
            Sweep request from {{ NAMES.science }}
          </p>
          <h3 class="text-sm font-black text-slate-900">{{ sweepRequest.label }}</h3>
          <p class="text-[11px] text-slate-600">
            Bands <code class="rounded bg-white px-1 text-[10px]">{{ bandsText }}</code
            >, minimum gap {{ minGap
            }}<template v-if="sweepRequest.forceContinue !== null"
              >,
              {{
                sweepRequest.forceContinue ? 'finishing your current run first' : 'prestiging straight away'
              }}</template
            >. These are already filled in below, so you don't need to change anything else.
          </p>
          <p class="text-[11px] text-slate-600">
            <template v-if="timeOffText">
              Planned around time off: <b>{{ timeOffText }}</b
              >. It still prices every chain, but the result goes on the board with the time-off runs and won't fill
              this gap.
            </template>
            <template v-else>
              Taking time off, like Egg Day or a trip?
              <button type="button" class="font-bold text-indigo-700 underline" @click="ui.openSetupRequested++">
                Add it in Your setup
              </button>
              and the sweep still prices every chain around it.
            </template>
          </p>
        </div>

        <div class="grid gap-2 sm:grid-cols-3 text-[11px]">
          <div class="rounded-lg bg-white px-3 py-2">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Chains</div>
            <div class="font-bold text-slate-800">{{ chainCountLabel }}</div>
          </div>
          <div class="rounded-lg bg-white px-3 py-2">
            <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Estimated time</div>
            <div class="font-bold text-slate-800">{{ estimateLabel }}</div>
            <div class="text-[10px] text-slate-400">
              {{ measuredCost ? 'measured on this machine' : speedSourceLabel }}
            </div>
          </div>
          <div class="rounded-lg bg-white px-3 py-2 flex items-center">
            <button
              type="button"
              :disabled="store.isRunning"
              class="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 disabled:opacity-40"
              @click="benchmark"
            >
              {{ measuredCost ? 'Re-benchmark' : 'Benchmark this machine' }}
            </button>
          </div>
        </div>

        <label class="block space-y-1">
          <span class="flex items-baseline justify-between text-[11px] font-bold text-slate-700">
            <span>How much of this computer to use</span>
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
          <span class="block text-[10px] text-slate-500">
            Fewer workers keep the computer usable and quieter; more finish sooner. The estimate above follows the
            slider. You can move it during a run too: the change takes effect within about a minute, and no chain in
            progress is lost.
          </span>
        </label>

        <label class="flex items-start gap-2 text-[11px] text-slate-700">
          <input v-model="sweepConsent" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
          <span>
            I understand this takes about <b>{{ estimateLabel }}</b
            >, that this tab has to stay open (and the computer awake) until it finishes, and that the result is then
            <b>sent to the board automatically</b>. What gets sent: the chain, its timings and the full CSV, with my
            artifact inventory, timezone and local plan start, plus a random code this browser keeps for the account
            (never my player ID, and never shown). The code folds my repeated sends together, lets me put my name on a
            run sent anonymously, and lets my own later runs replace my older plans. In its last few seconds the sweep
            also re-prices my best three plans already on the board from this save, and those are sent too (named ones
            with a named send, anonymous ones with an anonymous send).
          </span>
        </label>
        <!-- The same two choices, and the same values, as the Submit section at the bottom: anonymous
             unless the player picks otherwise, and the name box starts from their own nickname. -->
        <div class="flex flex-wrap items-center gap-4 pl-6 text-[11px] font-bold text-slate-700">
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="anonymous" type="radio" :value="true" :disabled="store.isRunning" class="text-indigo-600" />
            Submit anonymously
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              v-model="anonymous"
              type="radio"
              :value="false"
              :disabled="store.isRunning"
              class="text-indigo-600"
            />
            Credit me as
          </label>
          <input
            v-model="nickname"
            type="text"
            maxlength="40"
            placeholder="nickname"
            aria-label="Nickname"
            :disabled="store.isRunning || anonymous"
            class="w-48 rounded-md border-indigo-200 text-[12px] font-normal text-slate-800 disabled:opacity-40"
            @input="nicknameTouched = true"
          />
        </div>
        <RunNoteBox v-model="store.runNote" :disabled="store.isRunning" class="pl-6 text-[11px] text-slate-700" />

        <IntegrityNotice />
        <p
          v-if="ascMismatch"
          class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-800"
        >
          The Ascensions box ({{ suggestAsc }}) no longer matches this sweep ({{ bands.length + 1 }} ascensions). To
          start, set it back to {{ bands.length + 1 }} under The space to search.
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
            class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-40"
            @click="start(false)"
          >
            {{ store.isRunning ? 'Running...' : 'Start this sweep' }}
          </button>
          <span class="text-[10px] text-slate-500">
            One press starts it (the button further down does the same). When the sweep finishes, the result is
            submitted automatically, tagged {{ sweepRequest.preset }}. If you stop it early, what it priced so far is
            sent, marked as partial.
          </span>
        </div>
        <!-- The automatic submission, reported where the player pressed Start. -->
        <div
          v-if="autoSubmitted && submitMessage"
          class="rounded-lg border px-3 py-2 text-[11px] space-y-2"
          :class="
            !submitOk
              ? 'bg-red-50 border-red-200 text-red-800'
              : submitPartial
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          "
        >
          <p><b>Submitted automatically.</b> {{ submitMessage }}</p>
          <!-- Sent anonymously (the default), and the name box above now says who to credit: name the
               stored row rather than sending a second copy. -->
          <button
            v-if="nameToClaim"
            type="button"
            :disabled="claiming"
            class="px-3 py-1.5 rounded-lg border border-current text-[10px] font-black uppercase tracking-widest hover:bg-white/60 disabled:opacity-40"
            @click="claim"
          >
            {{ claiming ? 'Renaming...' : 'Put my name on it' }}
          </button>
          <button
            v-if="store.pendingTable"
            type="button"
            :disabled="retryingTable"
            class="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 disabled:opacity-40"
            @click="retryTable"
          >
            {{ retryingTable ? 'Retrying...' : 'Retry the table' }}
          </button>
        </div>
        <!-- Said HERE as well as further down: the card's Start is at the top of a long page, and a
             refusal that only appears below the fold reads as "the button does nothing". -->
        <p
          v-if="store.noFeasibleChain && !store.error"
          class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] text-rose-800"
        >
          <b>No chain finished</b>, so there is nothing to save or submit. The reason is further down.
        </p>
        <p
          v-if="store.error && !store.errorIsIntegrityNotice"
          class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-800"
        >
          <b>{{ store.errorBeforeStart ? "Didn't start" : 'Search failed' }}:</b> {{ store.error }}
        </p>
        <p
          v-else-if="store.runNotes.length"
          class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900"
        >
          <span v-for="n in store.runNotes" :key="n" class="block">{{ n }}</span>
        </p>
        <p v-else-if="store.isRunning" class="text-[11px] font-semibold text-indigo-700">
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
        <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">What are you after?</span>
        <button
          v-for="g in GOALS"
          :key="g.id"
          type="button"
          :disabled="store.busy"
          class="px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
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
      <details v-if="goal === 'deadline'" class="rounded-xl border border-slate-200 bg-white">
        <summary class="cursor-pointer px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
          How {{ NAMES.byDate }} works
        </summary>
        <div class="px-4 pb-4 text-xs text-slate-600 leading-relaxed">
          Finds the highest TE you can reach by a date. You set the early stops and it tries every route in them, or it
          picks them for you on a grid and looks more closely around the best. Either way the last stop is found to the
          exact TE. Like any run, it uses the plan start, hours, time off and computer settings in Your setup.
        </div>
      </details>

      <details v-if="goal === 'fastest'" class="rounded-xl border border-slate-200 bg-white">
        <summary class="cursor-pointer px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
          How the {{ NAMES.full }} works, and what it costs
        </summary>
        <div class="px-4 pb-4 text-xs text-slate-600 leading-relaxed space-y-2">
          <p>
            This prices <span class="font-bold">every</span> chain in the bands you describe, with no descent, stages or
            pruning, so the winner is the true optimum of that space, not a local one. It is also the mode that gets out
            of hand fastest: the bands multiply, so halving the step in each does far more than double the work.
          </p>
          <p>
            Nothing here is capped, and nothing asks you to confirm. The count and estimate below update as you type, so
            check them before you press Find.
          </p>
          <!-- How the work is split: explanation, so it sits here with the rest (it was between the
               estimate and Find). -->
          <p class="pt-2 font-bold text-slate-800">How the work is split</p>
          <p>
            <span class="font-bold text-slate-800">Chains are sorted so related ones sit together.</span> Every chain
            starting <code class="font-mono-premium">195 229</code> sits next to the others that start that way, because
            the expensive unit is the <span class="font-semibold">leg</span>, not the chain. Two chains that share their
            first three checkpoints share those three leg simulations exactly.
          </p>
          <p>
            <span class="font-bold text-slate-800"
              >The sorted list is cut into chunks of {{ store.workersInPool * 2 }}</span
            >
            (workers × 2) and handed to the pool one chunk at a time. The pool splits each chunk across workers by
            prefix, so each worker gets a family of related chains instead of a random handful, and its memo pays off.
          </p>
          <p>
            <span class="font-bold text-slate-800">Each worker simulates legs and remembers them.</span> A leg is a full
            farm simulation: research purchases, hab and vehicle upgrades, twelve egg switches, sale timing. That is
            where the ~15 s goes. A chain whose prefix the worker has already priced only pays for its new legs, which
            is why the real cost lands well under the estimate.
          </p>
          <p>
            <span class="font-bold text-slate-800">Progress comes from the workers themselves.</span> Each worker
            reports after every chain it finishes, so the bar moves steadily and you can tell a dead worker from one
            that is still thinking. The s/chain figure under the bar is measured on this machine, not carried over from
            another one.
          </p>
          <p>
            <span class="font-bold text-slate-800">Stop is checked between chunks.</span> A chunk in flight finishes
            first, so on a space with long chains "Stopping…" can sit for a minute or two. Nothing is lost: everything
            priced so far stays, and the best of it is your answer.
          </p>
        </div>
      </details>

      <!--
        An interrupted run, found on load. Above everything, because it is time-sensitive in a way
        nothing else on this page is: starting anything else overwrites the checkpoint it lives in.
      -->
      <div
        v-if="goal === 'fastest' && store.crashedRun && !store.isRunning"
        class="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2"
      >
        <h3 class="text-[10px] font-black text-amber-800 uppercase tracking-widest">Unfinished run found</h3>
        <p class="text-[11px] text-amber-900/90 leading-relaxed">
          A run on this machine stopped without finishing.
          <span class="font-bold">{{ (store.crashedRun.durations?.length ?? 0).toLocaleString() }}</span> chains are
          already priced and will be replayed instead of simulated again. It was last saved
          {{ agoLabel(store.crashedRun.updatedAt) }}.
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
        <button
          type="button"
          :disabled="store.busy || resuming !== ''"
          class="px-4 py-2 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800 disabled:opacity-40"
          @click="resumeCrashed"
        >
          Carry on from where it stopped
        </button>
      </div>

      <UnfinishedRuns v-if="goal === 'fastest'" :player-id="playerId" kind="exhaustive" @resume="resumeCrashed" />

      <!--
        An interrupted run that cannot carry on, with the reason. It used to just not appear, so a
        crashed overnight run looked as if it had never been saved.
      -->
      <div
        v-if="goal === 'fastest' && store.blockedCheckpoint && !store.crashedRun && !store.isRunning"
        class="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-2"
      >
        <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-widest">Unfinished run can't continue</h3>
        <p class="text-[11px] text-slate-700 leading-relaxed">
          A run on this machine stopped after pricing
          <span class="font-bold">{{ store.blockedCheckpoint.record.durations.length.toLocaleString() }}</span> chains
          ({{ agoLabel(store.blockedCheckpoint.record.updatedAt) }}), but
          <span class="font-bold">{{ store.blockedCheckpoint.changes.join('; ') }}</span
          >.
          <template v-if="store.runSaveFor(store.blockedCheckpoint.record.inputsKey)">
            Its save is kept, so put that setting back and it can carry on.
          </template>
          <template v-else>
            Its save wasn't kept, so its durations describe a different farm and can't be reused. If a number looks
            wrong, your backup may not have loaded fresh on one of the two visits: reload it and check before starting
            again.
          </template>
        </p>
        <button
          type="button"
          class="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
          @click="store.discardCheckpoint()"
        >
          Discard it
        </button>
      </div>

      <!-- Plan start, hours, time off, this computer and what it simulates: one setup shared by every
           Auto Planner screen (YourSetup.vue), here where this screen's settings used to be. -->
      <YourSetup :screen="goal === 'deadline' ? 'by-date' : 'fastest'" />

      <DeadlinePanel v-if="goal === 'deadline'" :player-id="playerId" @show-fastest="goal = 'fastest'" />
      <template v-else>
        <!-- The space. These numbers are the whole definition of the search. -->
        <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-5">
          <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">The space to search</h3>

          <!-- Workers are in Your setup (This computer), with the other machine settings. -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label class="space-y-1">
              <span class="flex items-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Final target TE</span>
                <HelpTip
                  >The TE every chain ends at. It's added to the end of each chain automatically, so it never goes in
                  the bands below.</HelpTip
                >
              </span>
              <input
                v-model.number="store.finalTE"
                type="number"
                min="1"
                :disabled="store.isRunning"
                class="w-full rounded-lg border-slate-300 text-sm font-bold text-slate-800 disabled:opacity-50"
              />
            </label>
            <label class="space-y-1">
              <span class="flex items-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Your TE now</span>
                <HelpTip
                  >Read from your backup, not editable here. It is the floor for every checkpoint in the bands.</HelpTip
                >
              </span>
              <input
                :value="store.currentTE"
                type="number"
                disabled
                class="w-full rounded-lg border-slate-200 bg-slate-50 text-sm font-bold text-slate-500"
              />
            </label>
          </div>

          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <label class="space-y-1 block">
              <!-- Labelled like the chains added below it (Chain 2, 3...), so it reads as one of them. -->
              <span v-if="!sweepRequest" class="block text-[10px] font-black text-slate-600 uppercase tracking-widest">
                Chain 1<template v-if="bands.length"> · {{ bands.length + 1 }} ascensions</template>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Bands, one per checkpoint
                </span>
                <HelpTip>
                  Semicolon separated, each `lo-hi` with an optional `:step`. `185-200:5; 210-240:10; 250-290:20` means
                  the first ascension lands between 185 and 200, the second between 210 and 240, the third between 250
                  and 290, then the target. Bands may overlap; chains still have to increase.
                </HelpTip>
              </span>
              <input
                v-model="bandsText"
                type="text"
                :disabled="store.isRunning"
                placeholder="185-200:5; 210-240:10; 250-290:20"
                class="w-full rounded-lg border-slate-300 text-sm font-mono-premium font-bold text-slate-800 disabled:opacity-50"
              />
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <label
                  class="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest"
                >
                  Ascensions
                  <input
                    v-model.number="suggestAsc"
                    type="number"
                    :min="suggestRange[0]"
                    :max="suggestRange[1]"
                    :disabled="store.isRunning"
                    class="w-16 rounded-md border-slate-300 text-xs font-bold text-slate-800 disabled:opacity-50"
                  />
                </label>
                <label class="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Size
                  <input
                    v-model.number="suggestSizeIx"
                    type="range"
                    min="0"
                    :max="SUGGEST_SIZES.length - 1"
                    step="1"
                    :disabled="store.isRunning"
                    class="w-28 accent-slate-800"
                    aria-label="How big a space to suggest"
                  />
                  <span class="normal-case tracking-normal font-bold text-slate-700"
                    >~{{ suggestBudget.toLocaleString() }} chains, about {{ suggestTimeLabel }}</span
                  >
                </label>
                <button
                  type="button"
                  :disabled="store.isRunning || !suggestion"
                  class="px-3 py-1.5 rounded-md bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40"
                  @click="applySuggestion"
                >
                  Suggest a space
                </button>
                <HelpTip>
                  Fills the boxes with a space of the size set beside it. When the whole reachable range fits (at two
                  ascensions, and three on most accounts), it suggests that at step 1, so the run proves the optimum and
                  no measurement is involved. Above that, it uses where near-best chains have actually landed across
                  this project's runs, refined as close to 5 TE as the budget allows before any of it goes to widening
                  the bands. Either way it's a starting point you can edit.
                </HelpTip>
                <span v-if="suggestion" class="text-[10px] text-slate-500">
                  Suggest would fill in {{ suggestAsc }} ascensions, {{ suggestion.chains.toLocaleString() }} chains
                  &middot;
                  <template v-if="suggestion.kind === 'complete'">
                    <span class="font-black text-emerald-700">complete sweep</span>
                    {{
                      suggestion.exact
                        ? 'of every reachable TE, so the run proves the optimum'
                        : 'of the whole reachable range on a 2 TE grid'
                    }}
                  </template>
                  <template v-else>
                    measured shape, from {{ suggestion.runs }} runs across {{ suggestion.accounts }} accounts
                  </template>
                </span>
                <span v-else class="text-[10px] text-amber-700">
                  No suggestion for this target or ascension count.
                </span>
              </div>

              <span class="block text-[10px] text-slate-400">
                <template v-if="bands.length">
                  {{ bands.length }} bands -> {{ bands.length + 1 }} ascensions ·
                  {{ bands.map(b => b.length).join(' x ') }} values
                </template>
                <template v-else>Nothing readable yet.</template>
              </span>
              <!-- Plain words for the step, right under the bands it describes: "181-250:5" means 181,
                   186, 191... and never 227, so a faster Balanced result between grid points is no surprise. -->
              <p v-if="!plannedGridComplete" class="text-[11px] text-slate-600 leading-relaxed">
                <span class="font-bold text-slate-800">This space tries {{ plannedGridLabel }}</span> (for example
                {{ gridExample }}), not every TE in between, which would take weeks. The winner is the best on this
                grid, and a chain between grid points can be faster.
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
                class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800 leading-relaxed"
              >
                Your bands make {{ bands.length + 1 }} ascensions, and that is what would run, but the Ascensions box
                says {{ suggestAsc }}. The box only chooses what Suggest a space fills in: press Suggest a space to
                switch to {{ suggestAsc }} ascensions, or set the box back to {{ bands.length + 1 }}.
              </p>
            </label>

            <!--
              More chains for the same click: each its own space and ascension count, run one after
              another. Short ones (1 or 2 ascensions) cost little alone; queued behind the main run
              they need no second visit.
            -->
            <div v-if="!sweepRequest" class="space-y-2">
              <div
                v-for="(row, k) in extraChains"
                :key="k"
                class="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Chain {{ k + 2 }}</span>
                  <label
                    class="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest"
                  >
                    Ascensions
                    <input
                      v-model.number="row.asc"
                      type="number"
                      min="1"
                      max="12"
                      :disabled="store.isRunning"
                      class="w-16 rounded-md border-slate-300 text-xs font-bold text-slate-800 disabled:opacity-50"
                    />
                  </label>
                  <button
                    type="button"
                    :disabled="store.isRunning || row.asc < 2"
                    class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white disabled:opacity-40"
                    @click="suggestExtra(k)"
                  >
                    Suggest a space
                  </button>
                  <button
                    type="button"
                    :disabled="store.isRunning"
                    class="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600 disabled:opacity-40"
                    @click="extraChains.splice(k, 1)"
                  >
                    Remove
                  </button>
                </div>
                <input
                  v-if="row.asc >= 2"
                  v-model="row.text"
                  type="text"
                  :disabled="store.isRunning"
                  placeholder="185-200:5; 210-240:10"
                  class="w-full rounded-lg border-slate-300 text-sm font-mono-premium font-bold text-slate-800 disabled:opacity-50"
                />
                <BandCheckNotice
                  v-if="row.asc >= 2"
                  :text="row.text"
                  :current-t-e="store.currentTE"
                  :final-t-e="store.finalTE"
                  :ascensions="row.asc"
                  :disabled="store.isRunning"
                  @use="t => (row.text = t)"
                />
                <span class="block text-[10px]" :class="extraProblem(k) ? 'text-rose-600' : 'text-slate-500'">
                  {{ extraProblem(k) || extraSummary(k) }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  :disabled="store.isRunning"
                  class="px-3 py-1.5 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  @click="addChain"
                >
                  + Add another chain
                </button>
                <span v-if="extraChains.length" class="text-[11px] text-slate-500">
                  One click runs all {{ extraChains.length + 1 }} chains, one after another. Each finished one is saved
                  under Saved runs.
                </span>
              </div>
            </div>

            <label class="space-y-1 block max-w-xs">
              <span class="flex items-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Keep checkpoints at least this many TE apart
                </span>
                <HelpTip>
                  Skips any chain where two checkpoints in a row are closer than this, to save time on chains you'd
                  never play. 0 means no limit. Be careful raising it: on one account the best 7-ascension chain found,
                  185 200 215 230 290 380 490, has checkpoints only 15 TE apart, so anything above 15 would have skipped
                  it. It never applies to the last jump, up to the target.
                </HelpTip>
              </span>
              <input
                v-model.number="minGap"
                type="number"
                min="0"
                :disabled="store.isRunning"
                class="w-full rounded-lg border-slate-300 text-sm font-bold text-slate-800 disabled:opacity-50"
              />
              <span class="block text-[10px] text-slate-500">
                {{
                  minGap > 0
                    ? `e.g. after ascending at 200, the next checkpoint is ${200 + minGap} or higher. 0 = no limit.`
                    : 'No limit: checkpoints can be any distance apart.'
                }}
              </span>
            </label>

            <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
              The winner will be the best <span class="font-semibold">of the bands you set</span>, not of everything
              reachable. That's still a stronger claim than {{ NAMES.smart }} makes, which homes in rather than trying
              everything.
            </p>
          </div>

          <p class="text-[11px] text-slate-500 leading-relaxed">
            The ascension count includes the final target, so 4 bands is 5 ascensions. Values at or below your current
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
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Values tried</span>
                <HelpTip
                  >Checkpoint values across all the bands, after anything outside (your TE, target) is dropped.</HelpTip
                >
              </div>
              <div class="text-lg font-black text-slate-900 tabular-nums">{{ poolSize }}</div>
            </div>
            <div>
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Chains it will run</span>
                <HelpTip
                  >Every chain through the bands that can actually be played: each checkpoint above the one before it
                  (and at least the minimum gap above it), with the target added at the end. Combinations that go down,
                  stand still, or fall outside your TE and the target can't be played, so they aren't counted or run.
                  It's counted, never built as a list: at small steps the list wouldn't fit in memory, and this number
                  warns you before that happens.</HelpTip
                >
              </div>
              <div class="text-lg font-black tabular-nums" :class="tooBig ? 'text-red-700' : 'text-slate-900'">
                {{ chainCountLabel }}
              </div>
              <!-- Only the playable ones (the user, 1 Oct: "we are running the feasible total chains... however
                   the lay user may not know that"). -->
              <div v-if="unplayable > 0 && totalChains === chainCount" class="text-[10px] text-slate-500 leading-snug">
                playable, of {{ combinations.toLocaleString() }} the bands could make
              </div>
            </div>
            <div>
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Est. wall clock</span>
                <HelpTip
                  >Chains x assumed cost / workers. It errs high on purpose: the assumed cost is the typical cost of a
                  chain this long in players' runs until this machine has its own measured or benchmarked rate, and
                  prefix sharing means most chains cost far less than a full simulation.</HelpTip
                >
              </div>
              <div class="text-lg font-black tabular-nums" :class="tooBig ? 'text-red-700' : 'text-slate-900'">
                {{ estimateLabel }}
              </div>
            </div>
            <div>
              <div class="flex items-center justify-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assumed cost</span>
                <HelpTip
                  >What the estimate charges per chain. It starts at the typical cost for chains this long in players'
                  runs and switches to this machine's own measured rate once the first chunk lands, or as soon as you
                  press "Benchmark my PC" below, which prices that first chunk right away instead of waiting for a real
                  run.</HelpTip
                >
              </div>
              <div
                class="text-lg font-black tabular-nums"
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
              class="px-3 py-1.5 rounded-md border border-indigo-300 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 disabled:opacity-40"
              @click="benchmark"
            >
              {{ store.benchmarking ? 'Benchmarking…' : store.benchmarkedAt ? 'Re-benchmark' : 'Benchmark my PC' }}
            </button>
            <span v-if="store.benchmarking" class="text-[11px] text-slate-500">
              Pricing the first {{ Math.max(store.workerBudget * 2, 32) }} chains as a throwaway run, at the same cost
              as a real run's opening chunk.
            </span>
            <span v-else-if="store.benchmarkedAt" class="text-[11px] text-slate-500">
              {{ store.rateSource === 'live' ? 'Measured' : 'Benchmarked' }} on this machine ·
              {{ store.benchmarkChainCount }} chains · {{ agoLabel(store.benchmarkedAt) }}
            </span>
          </div>
          <p v-if="store.benchmarkError" class="text-[11px] font-semibold text-red-700">{{ store.benchmarkError }}</p>

          <p class="text-[11px] leading-relaxed" :class="tooBig ? 'text-red-800' : 'text-slate-500'">
            <template v-if="!poolSize">
              The bands are empty once values outside ({{ store.currentTE }}, {{ store.finalTE }}) are dropped.
            </template>
            <template v-else-if="!chainCount">
              No chains: no way through these bands goes up at every checkpoint{{
                minGap > 0 ? ` by at least ${minGap} TE` : ''
              }}.
            </template>
            <template v-else-if="tooBig">
              This will not finish. The estimate assumes {{ assumedCostLabel }} per chain on
              {{ store.workerBudget }} workers{{ measuredCost ? ', measured on this machine' : '' }}. Raise the step or
              narrow the ascension range.
            </template>
            <template v-else>
              The estimate assumes {{ assumedCostLabel }} per chain on {{ store.workerBudget }} workers,
              {{ measuredCost ? 'measured on this machine' : speedSourceLabel }}.
              <template v-if="!measuredCost"
                >Benchmark this machine above for a number from your own computer.</template
              >
              Leave the tab open: a closed tab stops the workers.
            </template>
          </p>
        </div>

        <SafariNotice />

        <RunSaveNotice />
        <!-- With a sweep open, the card at the top already shows it. -->
        <IntegrityNotice v-if="!sweepRequest" />
        <!-- The same carry-on as the box at the top, next to Start where people look for it. -->
        <div
          v-if="store.crashedRun && !store.busy"
          class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
        >
          <button
            type="button"
            class="px-4 py-2 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800"
            @click="resumeCrashed"
          >
            Carry on the unfinished run
          </button>
          <span class="text-[11px] text-amber-900">
            {{ (store.crashedRun.durations?.length ?? 0).toLocaleString() }} chains already priced; its settings are put
            back for you.
          </span>
        </div>
        <!-- Find / Find and submit: the same bar as Smart search (FindBar.vue). A sweep link already
             sends itself, so it gets Find alone, labelled as the card at the top labels it. -->
        <FindBar
          v-model:opt-in="optIn"
          v-model:anonymous="anonymous"
          v-model:nickname="nickname"
          v-model:note="store.runNote"
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
          :running="store.isRunning || queueAt >= 0"
          :stopping="store.stopRequested || queueCancelled"
          :find-label="
            sweepRequest
              ? sweepConsent
                ? 'Start this sweep'
                : 'Start this sweep (tick &quot;I understand&quot; at the top first)'
              : 'Find'
          "
          :running-label="findAndSubmit ? 'Pricing every chain, then submitting...' : 'Pricing every chain...'"
          :show-submit="!sweepRequest"
          consent-note="each chain's, when you queued several"
          :nickname-max="NICKNAME_MAX"
          @find="andSubmit => void start(andSubmit)"
          @stop="stopRun"
          @nickname-typed="nicknameTouched = true"
        />
        <!-- Stepping away? Carry on by itself, a watcher tab, fewer workers (StepAwayOptions.vue). -->
        <StepAwayOptions
          kind="sweep"
          :player-id="playerId"
          :can-carry-on="!!store.crashedRun"
          @carry-on="resumeCrashed"
        />
        <!-- A Find and submit that finished (and sent) while this panel was closed for another tab. -->
        <AutoSendReport v-if="!autoSubmitted" kind="full" />

        <!-- Which chain of a multi-chain click is running, and what the finished ones found. -->
        <div
          v-if="queueAt >= 0 || queueResults.length"
          class="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
        >
          <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <template v-if="queueAt >= 0">Running chain {{ queueAt + 1 }} of {{ store.sweepQueue.total }}</template>
            <template v-else>All chains from the last click</template>
          </p>
          <div v-if="queueResults.length" class="overflow-x-auto">
            <table class="w-full text-[11px] tabular-nums">
              <thead>
                <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <th class="pr-4 py-1">Chain</th>
                  <th class="pr-4 py-1">Best found</th>
                  <th class="pr-4 py-1">Days</th>
                  <th class="pr-4 py-1">Finishes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="q in queueResults" :key="q.label" class="border-t border-slate-100">
                  <td class="pr-4 py-1 text-slate-500">
                    {{ q.label }}<template v-if="q.stopped"> (stopped)</template>
                  </td>
                  <td class="pr-4 py-1 font-bold">{{ q.chain.join(' ') }}</td>
                  <td class="pr-4 py-1">{{ q.days ? q.days.toFixed(3) : '—' }}</td>
                  <td class="pr-4 py-1">{{ q.finish ? saveWhen(q.finish) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-[10px] text-slate-500">
            Each is saved under Saved runs, so you can open any of them again. Compare them by finish date.
          </p>
        </div>

        <div v-if="store.stage" class="space-y-1">
          <div class="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
            <span class="text-slate-500">{{ store.stage }}</span>
            <span class="text-slate-400 tabular-nums">
              {{ pricedSoFar.toLocaleString() }} / {{ store.chainsEstimated.toLocaleString() }}
            </span>
          </div>
          <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full bg-rose-500 transition-all" :style="{ width: `${Math.round(livePercent)}%` }"></div>
          </div>
          <div v-if="store.secondsPerChain > 0 || store.runCost" class="text-[10px] text-slate-400 tabular-nums">
            <template v-if="store.secondsPerChain > 0"
              >{{ store.secondsPerChain.toFixed(2) }} s/chain measured here</template
            >
            <template v-if="!store.isRunning && store.runCost">
              · took {{ describeCompute(store.runCost.minutes, store.runCost.workers) }}</template
            >
          </div>
        </div>

        <p
          v-if="store.runNotes.length && !store.error"
          class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 leading-relaxed"
        >
          <span v-for="n in store.runNotes" :key="n" class="block">{{ n }}</span>
        </p>

        <div
          v-if="store.error && !store.errorIsIntegrityNotice"
          class="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 leading-relaxed"
        >
          <span class="font-bold uppercase tracking-wide"
            >{{ store.errorBeforeStart ? "Didn't start" : 'Search failed' }}:</span
          >
          {{ store.error }}
        </div>

        <!-- The outcome with no best chain. Without it a finished run simply lacked the result card,
           the Save button stayed grey and Submit never appeared, with nothing saying why -- which
           read as three separate bugs to the person looking at it. -->
        <div
          v-if="store.noFeasibleChain && !store.error"
          class="rounded-xl border border-rose-300 bg-rose-50 p-4 space-y-2"
        >
          <p class="text-[10px] font-black text-rose-800 uppercase tracking-widest">No chain in this space finishes</p>
          <p class="text-[11px] text-rose-900/90 leading-relaxed">
            Every chain was simulated, and none of them reaches {{ store.finalTE }} TE in any time the planner can put a
            date on. That is a result, not a crash, so there is nothing to save or submit.
          </p>
          <p class="text-[11px] text-rose-900/90 leading-relaxed">
            The usual cause is earnings. On a low-TE account the early ascensions cannot earn enough to buy the habs and
            vehicles the plan is waiting on, so the very first leg stalls and every leg after it inherits the stall. A
            different space won't fix that. More Truth Eggs or a stronger earnings set (totem, ankh, necklace and their
            stones) will. If you think the planner has this wrong, download the diagnostics below and send them in.
          </p>
        </div>

        <!-- The answer: the same card as Smart search (RouteResultCard.vue). -->
        <RouteResultCard
          v-if="store.bestDays > 0"
          :chain="store.bestChain"
          :days="store.bestDays"
          :final-t-e="store.finalTE"
          :end-label="endDate"
          :running="store.isRunning"
          :claim="store.stoppedEarly ? '' : resultClaim"
          :source="store.searchSpace ? '' : `From the ${NAMES.smart} you ran`"
          :busy="store.busy"
          can-save
          :saving="saving"
          @build="buildPlan"
          @csv="downloadCsv"
          @save="save"
        >
          <p v-if="!store.isRunning && resultExplain" class="text-[11px] text-emerald-900/80 leading-relaxed">
            {{ resultExplain }}
          </p>
          <p class="text-[10px] text-emerald-900/60">
            Compare runs by finish date. Two runs started hours apart have different plan starts, so their day counts
            don't measure the same thing, but the dates they land on do.
          </p>
          <p
            v-if="store.continueWarning"
            class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed"
          >
            {{ store.continueWarning }}
          </p>
          <div
            v-if="store.resultContradictions.length"
            class="mt-2 rounded-lg border border-rose-300 bg-rose-50 p-3 space-y-1"
          >
            <p class="text-[10px] font-black text-rose-800 uppercase tracking-widest">This result contradicts itself</p>
            <p
              v-for="(issue, k) in store.resultContradictions"
              :key="k"
              class="text-[11px] text-rose-900/90 leading-relaxed"
            >
              {{ issue.message }}
            </p>
            <p class="text-[11px] text-rose-900/80 leading-relaxed">
              Reload your backup and run it again before trusting these dates, and compare leg 1 against the official
              planner. If leg 1 agrees and a later leg doesn't, the fault is in the state carried between legs.
            </p>
          </div>
          <p v-if="store.stoppedEarly" class="text-[11px] text-emerald-900/70 pt-1">
            You stopped it early, so this is the best of what was priced, not the optimum of the space.
          </p>
          <p v-if="store.timeOff.length && !store.isRunning" class="text-[11px] text-emerald-900/80">
            Your time off goes into the plan too: the ascension it interrupts ends when the time off starts, and the
            next one starts after it.
          </p>
        </RouteResultCard>

        <!-- When to start this route: every hour of the next week, as fresh starts. -->
        <StartTimeFinder
          v-if="store.bestChain.length && store.bestDays > 0 && !store.isRunning"
          :chain="store.bestChain"
        />

        <!-- Saved runs: the same list on both depths (SavedRuns.vue); carrying a sweep on is this one's. -->
        <SavedRuns :player-id="playerId" can-resume />

        <RunCharts v-if="store.pricedCount" />

        <!-- Diagnostics are offered on a run with no answer too: that is exactly when someone wants to
           report what went in. -->
        <div v-if="store.pricedCount || store.noFeasibleChain" class="flex flex-wrap items-center gap-3">
          <template v-if="store.csvRows > 0">
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
              @click="downloadCsv"
            >
              Download CSV
            </button>
            <span class="text-[11px] text-slate-500">
              {{ store.csvRows.toLocaleString() }} chains, one row per leg. Safe to download mid-run.
            </span>
          </template>
          <!-- The input side. The CSV records what came OUT; when a result looks wrong the question
             is always what went IN, and until now nothing wrote that down. -->
          <button
            type="button"
            class="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
            @click="downloadDiagnostics"
          >
            Download diagnostics
          </button>
          <span class="text-[11px] text-slate-500">
            A small JSON file of what this run was <em>given</em>: backup age, TE, research and loadout. No save data
            and no player ID. Attach it when you report a result that looks wrong.
          </span>
          <p v-if="downloadError" class="w-full text-[11px] font-semibold text-red-700">{{ downloadError }}</p>
        </div>

        <!-- Submission. Same payload, same opt-in, same disclosure as the main panel. -->
        <!-- Not while a Find and submit run is going: it sends itself with the choice made at Find,
             and a box here saying "anonymously" would not be what goes. -->
        <div
          v-if="store.bestDays > 0 && !(store.isRunning && store.submitsWhenDone)"
          id="share-this-result"
          class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3 scroll-mt-4"
        >
          <h3 class="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Share this result</h3>
          <p class="text-[11px] text-indigo-900/80 leading-relaxed">
            An exhaustive result is the most useful thing the board can get: the best of a stated grid rather than a
            search result. It is sent with the space it covered and what it found there (the runners-up, the best chain
            at each ascension count, and the spread), so a reader can tell a real find from a flat neighbourhood without
            downloading the CSV. A run opened from the library above is sent without a run cost, because the time it
            took wasn't this machine's.
          </p>
          <label class="flex items-start gap-3 text-xs text-indigo-900">
            <input v-model="optIn" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
            <span
              >Yes, share this result. It includes your artifact inventory, timezone and local plan start, plus a random
              code this browser keeps for the account (not your player ID, and never shown). The board uses the code so
              that a run landing on the flagged board shows to you as yours and to everyone else anonymously, the same
              result sent twice is stored once, you can put your name on a run you sent anonymously, and your own later
              runs can replace your older plans in the race (nobody else's can). A named run shows a short tag made from
              the code. An anonymous run shows nothing that links it to you. If you already have plans on the board,
              your best three, re-priced from this save, are sent too: named ones with a named send and anonymous ones
              with an anonymous send, so a re-check never ties the two together.</span
            >
          </label>

          <!-- Credit, behind the opt-in like everything else that leaves the machine. Anonymous is
             the default: crediting yourself should be a choice, not the fallback. -->
          <div v-if="optIn" class="space-y-2">
            <div class="flex flex-wrap items-center gap-4">
              <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
                <input v-model="anonymous" type="radio" :value="true" class="text-indigo-600" />
                Submit anonymously
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
                <input v-model="anonymous" type="radio" :value="false" class="text-indigo-600" />
                Credit me as
              </label>
              <input
                v-model="nickname"
                type="text"
                :maxlength="NICKNAME_MAX"
                :disabled="anonymous"
                placeholder="nickname"
                aria-label="Nickname"
                class="rounded-lg border-indigo-200 text-sm font-bold text-slate-800 w-48 disabled:opacity-40"
                @input="nicknameTouched = true"
              />
            </div>
            <label class="flex items-start gap-3 cursor-pointer text-[11px] text-indigo-900/80">
              <input v-model="includeCsv" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
              <span>
                <span class="font-bold">Include the full CSV</span>: every chain this run priced, one row per leg ({{
                  store.csvRows.toLocaleString()
                }}
                chains). The submission above is the headline and this is the working behind it. It's compressed before
                it leaves your machine. Chains past the memory budget export with their per-leg cells blank.
              </span>
            </label>
            <label class="flex items-start gap-3 cursor-pointer text-[11px] text-indigo-900/80">
              <input
                v-model="stampName"
                type="checkbox"
                :disabled="anonymous"
                class="mt-0.5 rounded border-indigo-300 text-indigo-600 disabled:opacity-40"
              />
              <span>
                <span class="font-bold">Add the time to the name.</span> Optional. The board already keeps each space
                you prove as its own row, so nothing is lost without it. It just makes your own runs easier to tell
                apart at a glance when several are on the board.
              </span>
            </label>
            <p v-if="!anonymous" class="text-[11px] text-indigo-900/70">
              Submitting as
              <span class="font-mono-premium font-bold">{{ effectiveNickname || '(blank, so anonymous)' }}</span>
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <!-- Already on the board and the name box now differs from what went (typically: sent
               anonymously, now "Credit me as ..."): the button renames the stored row, which only
               works from the browser that sent it. -->
            <button
              v-if="store.submitUrl && nameToClaim"
              type="button"
              :disabled="!optIn || claiming"
              class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-40"
              :title="`Put ${nameToClaim} on the run already on the board, instead of sending it again`"
              @click="claim"
            >
              {{ claiming ? 'Renaming...' : 'Put my name on it' }}
            </button>
            <button
              v-else-if="store.submitUrl"
              type="button"
              :disabled="!optIn || submitting || store.alreadySubmitted"
              class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-40"
              @click="submit"
            >
              {{ submitting ? 'Sending...' : store.alreadySubmitted ? 'On the board' : 'Submit result' }}
            </button>
            <span v-else class="text-[11px] text-indigo-900/70">
              No collector configured in this build (<code class="font-mono-premium">VITE_SUBMIT_URL</code>).
            </span>
          </div>
          <p
            v-if="submitMessage"
            class="text-[11px] font-semibold"
            :class="!submitOk ? 'text-rose-700' : submitPartial ? 'text-amber-700' : 'text-emerald-700'"
          >
            {{ submitMessage }}
          </p>
          <!-- The summary landed but the table did not: send just the table, with the same one-time token,
             rather than a second submission. -->
          <button
            v-if="store.pendingTable"
            type="button"
            :disabled="retryingTable"
            class="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50 disabled:opacity-40"
            @click="retryTable"
          >
            {{ retryingTable ? 'Sending the table...' : 'Retry the table' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { ref as keptRef } from 'vue';
import { SUGGESTION_CHAIN_BUDGET as KEPT_BUDGET } from '@/search/exhaustive';

/** How big a space Suggest a space fills in, in chains (the user, 30 Sept: "how full do they want
 *  it?"). The middle step is the long-standing default. */
const SUGGEST_SIZES = [10_000, 25_000, 50_000, 75_000, 150_000, 300_000];

/**
 * The space the player set up, kept for the page load rather than per mount: leaving the screen
 * unmounts it (the planner's tabs), and the bands typed came back as the defaults. A sweep link still
 * fills them in when it opens the screen, until its sweep starts.
 */
const kept = {
  bandsText: keptRef('185-200:5; 215-245:10; 260-300:10; 320-360:20'),
  minGap: keptRef(0),
  suggestAsc: keptRef(6),
  suggestSizeIx: keptRef(SUGGEST_SIZES.indexOf(KEPT_BUDGET)),
  extraChains: keptRef<{ asc: number; text: string }[]>([]),
};
</script>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { sentence } from '@/utils/errors';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import { useEidsStore } from 'lib';
import RunNoteBox from './RunNoteBox.vue';
import FindBar from './FindBar.vue';
import StepAwayOptions from './StepAwayOptions.vue';
import SavedRuns from './SavedRuns.vue';
import YourSetup from './YourSetup.vue';
import AutoSendReport from './AutoSendReport.vue';
import RouteResultCard from './RouteResultCard.vue';
import { sendRunResult } from '@/search/sendRun';
import { parseSweepRequest, withoutSweepParams } from '@/search/sweepRequest';
import {
  countBanded,
  parseBands,
  suggestBands,
  SUGGESTION_CHAIN_BUDGET,
  SUGGESTABLE_ASCENSIONS,
  formatHours,
} from '@/search/exhaustive';
import RunCharts from './charts/RunCharts.vue';
import HelpTip from './HelpTip.vue';
import BandCheckNotice from './BandCheckNotice.vue';
import StartTimeFinder from './StartTimeFinder.vue';
import { showDateTime } from '@/lib/displayTime';
import { sweepSeconds, workerSecondsFromRate, workerSecondsPerChain } from '@/search/speed';
import { describeCompute } from '@/utils/computeTime';
import IntegrityNotice from './IntegrityNotice.vue';
import SafariNotice from './SafariNotice.vue';
import RunSaveNotice from './RunSaveNotice.vue';
import UnfinishedRuns from './UnfinishedRuns.vue';
import DeadlinePanel from './DeadlinePanel.vue';
import { useInitialStateStore } from '@/stores/initialState';
import { describeTimeOff, usableTimeOff } from '@/search/timeOff';
import { gridIsComplete, gridStepLabel } from '@/search/grid';
import { downloadCsv as saveCsvFile, downloadParts } from '@/utils/export';

/**
 * `exportCsvChunks()` yields the text and hands it back; it does not save anything. This panel used
 * to call the string version straight from the click handler, which built the whole CSV and
 * dropped it on the floor.
 *
 * Chunked, because this is the panel whose runs get big enough for it to matter -- a large export
 * was crashing the tab outright rather than failing. See `chainsCsvChunks`.
 */
/**
 * Said on the page, not just in the console. A throw inside a click handler is otherwise invisible:
 * the button "does nothing", which is how a date the CSV could not format was reported.
 */
const downloadError = ref('');

function tryDownload(what: string, fn: () => void): void {
  downloadError.value = '';
  try {
    fn();
  } catch (e) {
    console.error(`${what} download failed`, e);
    downloadError.value = `The ${what} download failed: ${e instanceof Error ? e.message : String(e)}. Please send a screenshot of this message with your report.`;
  }
}

function downloadDiagnostics(): void {
  tryDownload('diagnostics', () =>
    downloadParts(
      `chain-search-diagnostics-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`,
      [store.buildRunDiagnostics()],
      'application/json'
    )
  );
}

function downloadCsv(): void {
  tryDownload('CSV', () => saveCsvFile(store.csvFilename(), store.exportCsvChunks()));
}

const props = defineProps<{
  playerId: string;
  /** Set by the site's tabs, which then own the choice: a change here asks them (update:goal). */
  goal?: 'fastest' | 'deadline';
}>();
const emit = defineEmits<{ 'update:goal': [goal: 'fastest' | 'deadline'] }>();

const store = useChainSearchStore();
const initialStateStore = useInitialStateStore();
// The integrity check up front (search/rules.ts), once a save is loaded and again if the account or
// start changes, so a stalled account says so before Start rather than after.
watch(
  () => [props.playerId, store.currentTE, store.planStart, !!initialStateStore.rawBackup],
  () => void store.probeIntegrity(props.playerId),
  { immediate: true }
);
const autoPlannerStore = useAutoPlannerStore();
const ui = useUIStore();

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
const sweepConsent = ref(false);
if (sweepRequest) {
  bandsText.value = sweepRequest.bands;
  minGap.value = sweepRequest.minGap;
  store.sweepTag = { preset: sweepRequest.preset, bands: sweepRequest.bands, minGap: sweepRequest.minGap };
  if (sweepRequest.forceContinue !== null) store.forceContinue = sweepRequest.forceContinue;
}
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
const { suggestSizeIx } = kept;
const suggestBudget = computed(() => SUGGEST_SIZES[suggestSizeIx.value] ?? SUGGESTION_CHAIN_BUDGET);
/** About how long a space that size takes here, at this chain length and worker count. */
const suggestTimeLabel = computed(() =>
  formatHours(sweepSeconds(suggestBudget.value, store.workerBudget, workerSeconds.value) / 3600)
);
const suggestion = computed(() =>
  suggestBands(store.currentTE, store.finalTE, suggestAsc.value, { maxChains: suggestBudget.value })
);

function applySuggestion(): void {
  const s = suggestion.value;
  if (!s) return;
  bandsText.value = s.text;
}

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
  store.workerBudget = Number.isFinite(n) ? Math.max(1, Math.min(store.machineThreads, Math.floor(n))) : 1;
}

const saving = ref(false);
const optIn = ref(false);

/**
 * Credit. Same shape as the main panel's, deliberately -- this panel had no nickname field at all,
 * so every exhaustive result reached the board as `anonymous` no matter who ran it.
 *
 * The collector caps a nickname at 40 characters and TRUNCATES rather than rejecting, so the stamp
 * has to be budgeted for here: a name typed to the full length with the date appended would come
 * back from the board with the date sliced off, which is the one failure that would quietly undo
 * the reason for having it.
 */
const NICKNAME_MAX = 40;
/** ` YYYY-MM-DD HH:MM` -- the space plus sixteen characters. */
const STAMP_LEN = 17;

/** On, like the main panel's: the per-leg rows are what make a pooled dataset worth more than a
 *  ranking, and the whole block already sits behind an unticked opt-in. */
const includeCsv = ref(true);
const anonymous = ref(true);
/** Off by default, because it is now a convenience rather than a fix.
 *
 *  It was introduced as a workaround: the board collapsed re-runs on
 *  (nickname, target, chain, effort, window, shifts), so two exhaustive runs by the same person
 *  that landed on the same chain over DIFFERENT spaces became one row, and the survivor was
 *  whichever was posted first rather than the one that proved more. The collector now puts the
 *  space in that key, so both rows stand on their own and a dated name buys nothing but
 *  legibility. Defaulting it on would be decorating every name to solve a problem that is fixed. */
const stampName = ref(false);
const nicknameTouched = ref(false);

/** The name already in the header's ID box. Deliberately not `displayName()`, which falls back to
 *  the raw EID for an account with no username -- that would put a player ID into a payload whose
 *  consent text promises it is not there. Blank is the right default in that case. */
const eidsStore = useEidsStore();
const accountName = computed(() => {
  const entry = eidsStore.eids.get(props.playerId.trim());
  return entry?.nickname || entry?.username || '';
});
const nickname = ref(accountName.value);
// The username arrives when a backup finishes loading, which can be after this panel mounts.
// Follow it until the player edits the box themselves.
watch(accountName, name => {
  if (!nicknameTouched.value) nickname.value = name;
});

/** Local time, not UTC: it sits next to `startLocal` and `endLocal` on the row, which are local
 *  too, and a stamp in a timezone the submitter never saw would read as somebody else's clock. */
function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** What actually goes on the row. Anonymous wins over whatever is in the box, so a half-typed name
 *  cannot be sent by someone who then picked anonymous. */
const effectiveNickname = computed(() => {
  if (anonymous.value) return '';
  const base = nickname.value.trim();
  if (!base) return '';
  if (!stampName.value) return base.slice(0, NICKNAME_MAX);
  return `${base.slice(0, NICKNAME_MAX - STAMP_LEN)} ${localStamp()}`;
});

const submitting = ref(false);
const submitMessage = ref('');
/** "Sent, but ..." -- the summary is in and something about the table is not. Amber, not green. */
const submitPartial = computed(() => /\bbut\b/.test(submitMessage.value));
const retryingTable = ref(false);
async function retryTable(): Promise<void> {
  if (retryingTable.value) return;
  retryingTable.value = true;
  try {
    const res = await store.retryTable();
    submitOk.value = res.ok;
    submitMessage.value = res.ok ? `Thanks! ${sentence(res.message)}` : `Not sent: ${res.message}`;
  } finally {
    retryingTable.value = false;
  }
}
const submitOk = ref(false);

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
  if (complete) return 'the best of every chain in this space';
  return `best on this grid (${gridStepLabel(sp.bands, sp.range?.step)})`;
});
const resultExplain = computed(() => {
  const sp = store.searchSpace;
  if (!sp || gridIsComplete(sp.bands, sp.range?.step)) return '';
  const step = gridStepLabel(sp.bands, sp.range?.step);
  return `Every chain on the grid (${step}) was priced, and this is the fastest. Values between grid points were not tried, so a Balanced search can land on something faster in between.`;
});

const chainCount = computed(() =>
  bands.value.length ? countBanded(bands.value, store.finalTE, store.currentTE, minGap.value) : 0
);

/** Every pick of one value per band, playable or not, and how many of those can't be played (a
 *  checkpoint at or below the one before it, or closer than the minimum gap). Chain 1 only. */
const combinations = computed(() => (bands.value.length ? bands.value.reduce((n, b) => n * b.length, 1) : 0));
const unplayable = computed(() => Math.max(0, combinations.value - chainCount.value));

const chainCountLabel = computed(() =>
  Number.isFinite(totalChains.value) ? Math.round(totalChains.value).toLocaleString() : '∞'
);

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
  if (b.length !== row.asc - 1) return `These bands make ${b.length + 1} ascensions, not ${row.asc}.`;
  return extraCount(k) ? '' : 'No chain in these bands goes up to the target.';
}
function extraSummary(k: number): string {
  const row = extraChains.value[k];
  if (!row) return '';
  if (row.asc <= 1) return `Straight to ${store.finalTE}: one route.`;
  return `${extraCount(k).toLocaleString()} chains · ${extraBands(k)
    .map(b => b.length)
    .join(' x ')} values`;
}
function suggestExtra(k: number): void {
  const row = extraChains.value[k];
  if (!row) return;
  const sug = suggestBands(store.currentTE, store.finalTE, row.asc, { maxChains: suggestBudget.value });
  if (sug) row.text = sug.text;
}
/** A new chain one ascension shorter than the last, since the short ones are what get queued. */
function addChain(): void {
  const used = [bands.value.length + 1, ...extraChains.value.map(r => r.asc)];
  let asc = Math.max(1, Math.min(...used) - 1);
  while (used.includes(asc) && asc < 12) asc++;
  extraChains.value.push({ asc, text: '' });
  if (asc >= 2) suggestExtra(extraChains.value.length - 1);
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
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date((store.planStart + store.bestDays * 86400) * 1000));
});
const livePercent = computed(() =>
  store.chainsEstimated > 0 ? Math.min(100, (pricedSoFar.value / store.chainsEstimated) * 100) : 0
);

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
const speedSourceLabel = computed(() => `typical for ${sweepAscensions.value}-ascension chains in players' runs`);
/** What the paragraph under the estimate says it charges per chain, on the chosen workers. */
const assumedCostLabel = computed(() => `${wallPerChain.value.toFixed(2)} s`);

const hours = computed(() => sweepSeconds(totalChains.value, store.workerBudget, workerSeconds.value) / 3600);

/**
 * Once a run is going, project from what it has ACTUALLY done: elapsed x remaining / done. That
 * needs no view on how many workers are busy or what a chain "should" cost, and it self-corrects
 * as prefix sharing warms up. The s/chain figure cannot be used for this -- it is wall-clock per
 * chain across the whole pool already, so feeding it to estimateHours divides by the workers a
 * second time and the answer comes out wrong by roughly the worker count.
 */
const tick = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
watch(
  () => store.isRunning,
  running => {
    if (ticker) clearInterval(ticker);
    ticker = running ? setInterval(() => (tick.value = Date.now()), 1000) : null;
  },
  // Immediate: coming back to a run that's going (the planner's tabs) is the normal case now.
  { immediate: true }
);
onUnmounted(() => ticker && clearInterval(ticker));

const remainingHours = computed(() => {
  const done = pricedSoFar.value;
  const left = Math.max(0, store.chainsEstimated - done);
  if (!store.runStartedAt || done <= 0) return Infinity;
  const elapsedHours = (tick.value - store.runStartedAt) / 3600000;
  if (!(elapsedHours > 0)) return Infinity;
  return (elapsedHours / done) * left;
});
const estimateLabel = computed(() => {
  if (store.isRunning && Number.isFinite(remainingHours.value)) {
    return formatHours(remainingHours.value) + ' left';
  }
  return chainCount.value ? formatHours(hours.value) : '—';
});
const tooBig = computed(() => chainCount.value > 0 && hours.value > TOO_BIG_HOURS);

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

/** Set for the length of a Find and submit click (one run or a whole queue). */
const findAndSubmit = ref(false);

/** Find; with `andSubmit`, each finished result is sent as Share this result would send it. */
async function start(andSubmit = false): Promise<void> {
  findAndSubmit.value = andSubmit && optIn.value;
  store.lastAutoSend = null;
  // The sweep link has done its job: later visits to this screen (and reloads) start from the
  // player's own settings, not the link's again.
  if (sweepRequest && sweepConsent.value) history.replaceState(null, '', withoutSweepParams(location.href));
  // For the progress bar on other tabs: this run sends itself when it finishes.
  store.submitsWhenDone = findAndSubmit.value || (!!sweepRequest && sweepConsent.value);
  try {
    await startOne();
  } finally {
    findAndSubmit.value = false;
    store.submitsWhenDone = false;
  }
}

/** The result on screen, sent the way the sweep card sends one (CSV included, no time stamp on the name). */
async function sendFinished(): Promise<void> {
  // Stopped early it still sends: the board labels it partial rather than exhaustive (leaderboardRank).
  if (store.error || store.bestDays <= 0) return;
  stampName.value = false;
  includeCsv.value = true;
  optIn.value = true;
  autoSubmitted.value = true;
  await submit();
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
  if (!autoSubmitArmed.value) return;
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
  queueCancelled.value = false;
  queueResults.value = [];
  const player = props.playerId;
  const specs = [
    { label: `Chain 1 · ${bands.value.length + 1} ascensions`, spec: currentSpec() },
    ...extraChains.value.map((row, k) => ({
      label: `Chain ${k + 2} · ${row.asc} ascension${row.asc === 1 ? '' : 's'}`,
      spec: specOfExtra(k),
    })),
  ];
  store.sweepQueue.total = specs.length;
  const fail = (label: string, why: string) =>
    queueResults.value.push({ label: `${label}: ${why}`, chain: [], days: 0, stopped: true, finish: 0 });
  try {
    for (let k = 0; k < specs.length; k++) {
      // Stopped between chains, or another account loaded: the rest don't run.
      if (queueCancelled.value || props.playerId !== player) break;
      // Anything else going (a carry-on clicked between chains) and `startExhaustive` returns without
      // a word -- and the row would be filled with that run's result.
      if (store.busy) {
        fail(specs[k].label, 'another run was going, so the queue stopped here');
        break;
      }
      queueAt.value = k;
      autoSubmitted.value = false;
      await store.startExhaustive(player, specs[k].spec, { recheck: findAndSubmit.value });
      // Stop pressed while the chain was writing its last checkpoint arrives after the store copied
      // `stoppedEarly`; the queue's own flag catches it (see the watch below).
      const stopped = store.stoppedEarly || queueCancelled.value;
      // A chain that could not start leaves the previous chain's result on screen; recording that as
      // this chain's would be a lie, so the queue stops there and says which one.
      if (store.error) {
        fail(specs[k].label, store.error);
        break;
      }
      if (store.bestDays > 0) {
        // The finish is fixed now, against this run's own start: worked out later it used whatever
        // run was on screen by then.
        queueResults.value.push({
          label: specs[k].label,
          chain: [...store.bestChain],
          days: store.bestDays,
          stopped,
          finish: store.planStartUsed + store.bestDays * 86400,
        });
        // Find and submit: each chain's result goes as it finishes, before the next takes the panel.
        if (findAndSubmit.value && !stopped) await sendFinished();
        try {
          await store.saveCurrentRun(player, specs[k].label);
        } catch (e) {
          // Its checkpoint still has it; only the library copy is missing. Say so and stop, rather
          // than leave "Running chain 2 of 3" on screen with nothing running.
          fail(specs[k].label, `finished, but couldn't be saved to your runs (${(e as Error)?.message ?? e})`);
          break;
        }
      } else if (!stopped) fail(specs[k].label, 'no chain in this space finishes');
      if (stopped) break;
    }
  } finally {
    queueAt.value = -1;
    // Stop's "the rest don't start" ends with the queue: left set, a later single run's Stop read
    // "Stopping..." from the start.
    queueCancelled.value = false;
  }
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

function saveWhen(unixSeconds: number | undefined): string {
  if (!unixSeconds) return 'an unknown time';
  return showDateTime(unixSeconds, autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function agoLabel(ms: number): string {
  const diffS = Math.max(0, Math.round((nowForAge.value - ms) / 1000));
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.round(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.round(diffM / 60);
  if (diffH < 48) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
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
  resuming.value = 'checkpoint';
  try {
    await store.resumeCrashedRun(props.playerId);
  } finally {
    resuming.value = '';
  }
}

/** Which run is mid-resume, for the button's own label. Empty when none is. */
const resuming = ref('');

async function submit(): Promise<void> {
  // Clicks made while the page was frozen building the table arrive afterwards; each one used to
  // send another copy.
  // Already sent (automatically or by hand): a second send is only a duplicate row.
  if (store.alreadySubmitted) {
    submitOk.value = true;
    submitMessage.value = 'Already on the board: this result was sent from this browser.';
    return;
  }
  if (submitting.value) return;
  submitting.value = true;
  submitOk.value = true;
  try {
    // The steps themselves are shared with the Science tab's runner (search/sendRun.ts). The CSV
    // goes as the second argument there: this panel once sent without it, so every exhaustive row
    // on the board read "No CSV was attached".
    const res = await sendRunResult(store, effectiveNickname.value, includeCsv.value, text => {
      submitMessage.value = text;
    });
    submitOk.value = res.ok;
    submitMessage.value = res.text;
  } finally {
    submitting.value = false;
  }
}

/** The name "Put my name on it" would put on the stored row, or '' when there is nothing to rename.
 *  With "Add the time to the name" ticked the stamp is part of it, as it would be on a send. */
const nameToClaim = computed(() => store.nameToClaim(effectiveNickname.value));
const claiming = ref(false);
async function claim(): Promise<void> {
  const id = store.sentRecord?.id;
  if (!id || claiming.value) return;
  claiming.value = true;
  try {
    const res = await store.claimName(id, effectiveNickname.value);
    submitOk.value = res.ok;
    submitMessage.value = res.ok ? `Done: ${res.message}` : `Not renamed: ${res.message}`;
  } finally {
    claiming.value = false;
  }
}

// Once the player has said yes to sharing, work out the rechecks (their best earlier plans priced
// again from this save), so the payload shows them before Submit is pressed.
watch(
  () => optIn.value && store.bestDays > 0 && !store.isRunning,
  ready => {
    if (ready) void store.prepareRechecks();
  },
  { immediate: true }
);
</script>
