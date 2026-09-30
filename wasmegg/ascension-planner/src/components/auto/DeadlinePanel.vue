<!--
  "How high can I get by a date?" -- Insane mode's second goal (search/deadline.ts).

  The finish line is a moment (Egg Day by default) and the answer is the highest last stop a route
  reaches by then. Uses the same schedule, time off and machine settings as the rest of the panel.
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
    <!-- A run that stopped before finishing: a reload, a crash, or Stop. -->
    <div
      v-if="store.deadlineUnfinished && !store.busy"
      class="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2 text-[11px] text-amber-900 leading-relaxed"
    >
      <h3 class="text-[10px] font-black text-amber-800 uppercase tracking-widest">Unfinished deadline search</h3>
      <p>
        <span class="font-bold">{{ store.deadlineUnfinished.priced.toLocaleString() }}</span> routes are already priced
        for {{ inPlannerZone(store.deadlineUnfinished.spec.deadline) }}, {{ store.deadlineUnfinished.spec.minStops }} to
        {{ store.deadlineUnfinished.spec.maxStops }} stops, from {{ store.deadlineUnfinished.te }} TE ({{
          ago(store.deadlineUnfinished.updatedAt)
        }}).
        <template v-if="store.deadlineUnfinished.saveKept">
          Carrying on replays them instantly, continues on the save it started with, and puts its deadline and stops
          back in the boxes below.</template
        >
        <template v-else> Its save wasn't kept on this device, so it can't carry on.</template>
        Starting a new search replaces it.
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          v-if="store.deadlineUnfinished.saveKept"
          type="button"
          class="px-4 py-2 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800"
          @click="resume"
        >
          Carry on from where it stopped
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
    <div class="flex flex-wrap items-end gap-3">
      <button
        type="button"
        :disabled="store.busy"
        class="px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
        :class="
          isEggDay ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600 hover:text-slate-800'
        "
        @click="useEggDay"
      >
        Egg Day {{ eggDayYear }}
      </button>
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
      Game events (including Egg Day's own bonuses) aren't simulated. The plan is for reaching the TE by then.
    </p>

    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-1">The routes to try</h3>
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="m in MODES"
        :key="m.id"
        type="button"
        :disabled="store.busy"
        class="px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
        :class="
          mode === m.id
            ? 'border-slate-800 bg-slate-800 text-white'
            : 'border-slate-200 text-slate-500 hover:text-slate-700'
        "
        @click="mode = m.id"
      >
        {{ m.label }}
      </button>
    </div>

    <!-- The player's own space, Insane-style: one box per chain, and as many chains as you like. -->
    <template v-if="mode === 'space'">
      <div v-for="(row, k) in chains" :key="k" class="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Chain {{ k + 1 }}</span>
          <label class="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Ascensions
            <input
              v-model.number="row.asc"
              type="number"
              min="1"
              max="8"
              :disabled="store.busy"
              class="w-16 rounded-md border-slate-300 text-xs font-bold text-slate-800 disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            :disabled="store.busy || row.asc < 2"
            class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-white disabled:opacity-40"
            @click="suggestRow(k)"
          >
            Suggest a space
          </button>
          <button
            v-if="chains.length > 1"
            type="button"
            :disabled="store.busy"
            class="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600 disabled:opacity-40"
            @click="chains.splice(k, 1)"
          >
            Remove
          </button>
        </div>
        <input
          v-if="row.asc >= 2"
          v-model="row.text"
          type="text"
          :disabled="store.busy"
          placeholder="138-142:1; 160-200:10; 200-240:10"
          class="w-full rounded-lg border-slate-300 text-sm font-mono-premium font-bold text-slate-800 disabled:opacity-50"
        />
        <span class="block text-[10px]" :class="rowProblem(k) ? 'text-rose-600' : 'text-slate-500'">
          {{ rowProblem(k) || rowSummary(k) }}
        </span>
      </div>
      <div class="flex flex-wrap items-end gap-4">
        <button
          type="button"
          :disabled="store.busy"
          class="px-3 py-1.5 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          @click="addChain"
        >
          + Add another chain
        </button>
        <label class="space-y-1">
          <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest"
            >Last stop (the answer)</span
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
          {{ lastRange ? `found to the exact TE between ${lastRange[0]} and ${lastRange[1]}` : 'give it a range' }}
        </span>
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed">
        Each chain is one box of bands, like Insane's: one band per ascension before the last, separated by
        <span class="font-mono-premium">;</span>. A band is <span class="font-mono-premium">lo-hi:step</span>, a single
        value, or several values with commas. Chains with other ascension counts all run from the same click, and a 1-
        or 2-ascension chain costs next to nothing. Every route in your chains is tried, and nothing outside them, so
        the answer is proven for that space. The last stop is found to the exact TE.
        <template v-if="suggestFrom">{{ suggestFrom }}</template>
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
            >Highest last stop to consider</span
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
        <label class="space-y-1">
          <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Early stops every</span>
          <select v-model.number="step" :disabled="store.busy" class="rounded-lg border-slate-200 text-sm font-bold">
            <option :value="10">10 TE</option>
            <option :value="20">20 TE</option>
            <option :value="30">30 TE</option>
          </select>
        </label>
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed">
        It picks the early stops itself, starting from your current route. The first stop is tried at every TE for the
        first 5 above yours and the rest on a {{ usedStep }}-TE grid ({{ shapes.toLocaleString() }} sets). For each set
        it finds the highest last stop that still makes the deadline, then homes in on the best few, moving one stop at
        a time by {{ resolutionsText }} TE. It's quicker than setting the stops yourself but not proven: it can miss a
        route off the grid.
      </p>
    </template>

    <!-- The numbers that should decide whether you press the button. -->
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sets of early stops</div>
          <div class="text-lg font-black text-slate-900 tabular-nums">{{ plannedShapes.toLocaleString() }}</div>
        </div>
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Routes to price</div>
          <div class="text-lg font-black text-slate-900 tabular-nums">~{{ plannedRoutes.toLocaleString() }}</div>
        </div>
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Est. wall clock</div>
          <div class="text-lg font-black text-slate-900 tabular-nums">{{ estimateLabel }}</div>
        </div>
        <div>
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assumed cost</div>
          <div class="text-lg font-black text-slate-900 tabular-nums">{{ costLabel }}</div>
        </div>
      </div>
      <p class="pt-2 text-[10px] text-slate-500 leading-relaxed">
        About {{ PROBES }} routes per set: the last stop is narrowed down, not tried at every TE. The estimate uses this
        machine's measured speed on {{ store.workerBudget }} workers if there is one. It errs high, since these routes
        are shorter than a run to 490.
      </p>
    </div>

    <label v-if="store.scheduleEnabled" class="flex items-start gap-3 cursor-pointer">
      <input v-model="ascendNeeded" type="checkbox" :disabled="store.busy" class="mt-0.5 rounded border-slate-300" />
      <span class="text-[11px] text-slate-600 leading-relaxed">
        <span class="font-bold text-slate-800">I need to ascend at the last stop before the deadline.</span> Counts the
        wait until your awake hours after reaching it, so you reach the last stop in time to act on it.
      </span>
    </label>

    <label class="flex items-start gap-3 cursor-pointer">
      <input v-model="store.keepAwake" type="checkbox" class="mt-0.5 rounded border-slate-300" />
      <span class="text-[11px] text-slate-600 leading-relaxed">
        <span class="font-bold text-slate-800">Keep my PC awake.</span> It can't stop a laptop sleeping when the lid is
        closed.
      </span>
    </label>
    <SafariNotice />
    <IntegrityNotice />
    <!-- The unfinished run's carry-on again, next to Start where people look for it. -->
    <div
      v-if="store.deadlineUnfinished?.saveKept && !store.busy"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3"
    >
      <button
        type="button"
        class="px-4 py-2 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800"
        @click="resume"
      >
        Carry on the unfinished search
      </button>
      <span class="text-[11px] text-amber-900"
        >{{ store.deadlineUnfinished.priced.toLocaleString() }} routes already priced.</span
      >
    </div>

    <!-- Find and submit: the share opt-in and name, before the run, so it can send itself at the end.
         The same settings as the Share this answer box under the result. -->
    <div
      v-if="collectorConfigured && !store.deadlineRunning"
      class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2 text-[11px] text-indigo-900"
    >
      <label class="flex items-start gap-3">
        <input v-model="shareOptIn" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
        <span
          >For <span class="font-bold">Find and submit</span>: share the best answer on the leaderboard when the search
          finishes. It sends the route, its dates and the deadline, with your artifact inventory, timezone, local plan
          start and the random code this browser keeps for the account (not your player ID, and never shown), plus the
          CSV if ticked under Share this answer.</span
        >
      </label>
      <div v-if="shareOptIn" class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer font-bold">
          <input v-model="shareAnonymous" type="radio" :value="true" class="text-indigo-600" />
          Anonymously
        </label>
        <label class="flex items-center gap-2 cursor-pointer font-bold">
          <input v-model="shareAnonymous" type="radio" :value="false" class="text-indigo-600" />
          Credit me as
        </label>
        <input
          v-model="shareName"
          type="text"
          maxlength="40"
          :disabled="shareAnonymous"
          placeholder="nickname"
          aria-label="Nickname"
          class="rounded-lg border-indigo-200 text-sm font-bold text-slate-800 w-48 disabled:opacity-40"
          @input="shareNameTouched = true"
        />
      </div>
    </div>

    <div class="flex flex-wrap gap-3">
      <button
        class="btn-premium btn-primary flex-1 py-4 text-sm shadow-xl shadow-rose-500/20 active:scale-[0.98]"
        :disabled="store.busy || store.integrityBlocked || store.staleBackupBlocked || !canStart"
        @click="start(false)"
      >
        {{ store.deadlineRunning ? (autoShare ? 'Searching, then submitting...' : 'Searching...') : 'Find' }}
      </button>
      <button
        v-if="collectorConfigured && !store.deadlineRunning"
        class="px-6 py-4 rounded-xl bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
        :disabled="store.busy || store.integrityBlocked || store.staleBackupBlocked || !canStart || !shareOptIn"
        :title="shareOptIn ? '' : 'Tick the share box above first'"
        @click="start(true)"
      >
        Find and submit
      </button>
      <button
        v-if="store.deadlineRunning"
        class="px-6 py-4 rounded-xl border border-slate-300 text-sm font-black text-slate-700 hover:bg-slate-50"
        @click="store.stopDeadline()"
      >
        Stop
      </button>
    </div>
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
    <p v-if="store.error" class="text-[11px] font-semibold text-rose-700">{{ store.error }}</p>

    <!-- Live progress, Insane-style. -->
    <div v-if="store.deadlineRunning && store.deadlineProgress" class="space-y-2">
      <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div class="h-full bg-rose-500 transition-all" :style="{ width: `${progressPct}%` }"></div>
      </div>
      <p class="text-[11px] text-slate-600">
        <span class="font-bold">{{ liveDone.toLocaleString() }}</span
        ><template v-if="runEstimate"> of ~{{ liveTotal.toLocaleString() }}</template> routes priced ·
        {{ elapsedLabel }} so far<template v-if="remainingLabel"> · about {{ remainingLabel }} left</template>
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
            {{ result.step ? '"Highest last stop to consider"' : "the top of the last stop's range" }} and run it
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
          Top routes ({{ result.priced.toLocaleString() }} priced,
          {{ result.step ? `early stops every ${result.step} TE, then refined` : 'every combination in your space' }})
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
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"
        @click="downloadResultCsv"
      >
        Download CSV
      </button>
      <p class="text-[11px] text-slate-500 leading-relaxed">
        Priced from {{ inPlannerZone(result.planStart) }} at {{ result.te }} TE, with the schedule and time off above. A
        route that reaches one more TE usually has much less time to spare: the table shows both so you can choose.
      </p>

      <!-- Share: the leaderboard's Egg Day tab for an Egg Day answer, else "By a date". Same opt-in as Insane. -->
      <div v-if="best && collectorConfigured" class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
        <h3 class="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Share this answer</h3>
        <p class="text-[11px] text-indigo-900/80 leading-relaxed">
          Sends the best route above to the leaderboard's <span class="font-bold">{{ shareTab }}</span> tab, where
          answers for the same deadline are ranked by the highest TE reached, then the time to spare. It stays out of
          the race to 490.
        </p>
        <label class="flex items-start gap-3 text-xs text-indigo-900">
          <input v-model="shareOptIn" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
          <span
            >Yes, contribute this answer. This sends the route, its dates and the deadline, along with your artifact
            inventory, timezone, local plan start and the random code this browser keeps for the account (not your
            player ID, and never shown), exactly as for any run you share.</span
          >
        </label>
        <div v-if="shareOptIn" class="space-y-2">
          <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
              <input v-model="shareAnonymous" type="radio" :value="true" class="text-indigo-600" />
              Submit anonymously
            </label>
            <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
              <input v-model="shareAnonymous" type="radio" :value="false" class="text-indigo-600" />
              Credit me as
            </label>
            <input
              v-model="shareName"
              type="text"
              maxlength="40"
              :disabled="shareAnonymous"
              placeholder="nickname"
              aria-label="Nickname"
              class="rounded-lg border-indigo-200 text-sm font-bold text-slate-800 w-48 disabled:opacity-40"
              @input="shareNameTouched = true"
            />
          </div>
          <label class="flex items-start gap-3 cursor-pointer text-[11px] text-indigo-900/80">
            <input v-model="shareCsv" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
            <span>
              <span class="font-bold">Include the CSV</span>: every route this search found, best first (the same file
              as Download CSV). It is compressed before it leaves your machine.
            </span>
          </label>
          <p class="text-[11px] text-indigo-900/80">
            Only named answers are ranked. Anonymous ones are listed below the ranking.
          </p>
          <button
            type="button"
            :disabled="sharing || store.deadlineRunning || sentKey === resultKey"
            class="px-4 py-2 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
            @click="share"
          >
            {{
              sharing
                ? 'Sending...'
                : sentKey === resultKey
                  ? 'Sent'
                  : `Send ${best.chain[best.chain.length - 1]} TE by this date`
            }}
          </button>
          <p
            v-if="shareMessage"
            class="text-[11px] font-semibold"
            :class="shareOk ? 'text-emerald-800' : 'text-rose-700'"
          >
            {{ shareMessage }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { sentence } from '@/utils/errors';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { formatInZone } from '@/search/csv';
import {
  bandShapes,
  countBandShapes,
  countShapes,
  parseChainText,
  parseStopBox,
  stepForBudget,
} from '@/search/deadline';
import { estimateHours, formatBand, formatHours } from '@/search/exhaustive';
import type { DeadlineRunSpec } from '@/search/deadlineStore';
import { downloadCsv } from '@/utils/export';
import { useEidsStore } from 'lib';
import { eggDayYearOf, nextEggDayYear } from '@/lib/eggDay';
import { showDateTime } from '@/lib/displayTime';
import IntegrityNotice from './IntegrityNotice.vue';
import SafariNotice from './SafariNotice.vue';

const props = defineProps<{ playerId: string }>();
const emit = defineEmits<{ (e: 'show-fastest'): void }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const plannerZone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

/** The next Egg Day (14 July) at 9:00 AM Pacific that has not passed yet (lib/eggDay.ts). */
const eggDayYear = nextEggDayYear();
const date = ref(`${eggDayYear}-07-14`);
const time = ref('09:00');
const zone = ref('America/Los_Angeles');
const isEggDay = computed(
  () => date.value === `${eggDayYear}-07-14` && time.value === '09:00' && zone.value === 'America/Los_Angeles'
);
function useEggDay(): void {
  date.value = `${eggDayYear}-07-14`;
  time.value = '09:00';
  zone.value = 'America/Los_Angeles';
}

const deadline = computed(() => {
  if (!date.value || !time.value) return 0;
  const t = getLocalTimestampInTimezone(date.value, time.value, zone.value);
  return Number.isFinite(t) ? t : 0;
});
const daysAway = computed(() => (deadline.value - store.planStart) / 86400);

const minStops = ref(3);
const maxStops = ref(5);
/** 200 TE above where you are, unless you set it: the save usually loads after this panel does. */
const lastHi = ref(490);
const lastHiTouched = ref(false);
watch(
  () => store.currentTE,
  te => {
    if (te > 0 && (!lastHiTouched.value || lastHi.value <= te + 1)) lastHi.value = Math.min(490, Math.floor(te) + 200);
  },
  { immediate: true }
);
const step = ref(20);
const ascendNeeded = ref(false);

const specForCount = computed(() => ({
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

const MODES = [
  { id: 'space', label: "I'll set the stops" },
  { id: 'auto', label: 'Pick them for me' },
] as const;
const mode = ref<'space' | 'auto'>('space');

/** The chains to run from one click: each an ascension count and one box of bands. */
const chains = ref<{ asc: number; text: string }[]>([{ asc: 4, text: '' }]);
const lastBox = ref('');
const suggestFrom = ref('');
const rowBands = (k: number) => parseChainText(chains.value[k]?.text ?? '');
const lastRange = computed<[number, number] | null>(() => {
  const v = parseStopBox(lastBox.value, 1);
  if (!v.length) return null;
  const lo = Math.max(v[0], Math.floor(store.currentTE) + 1);
  const hi = Math.min(490, v[v.length - 1]);
  return hi >= lo ? [lo, hi] : null;
});
function rowShapes(k: number): number {
  const row = chains.value[k];
  if (!row || !lastRange.value) return 0;
  if (row.asc <= 1) return 1;
  const b = rowBands(k);
  return b.length === row.asc - 1 ? countBandShapes(b, store.currentTE, lastRange.value[1]) : 0;
}
function rowProblem(k: number): string {
  const row = chains.value[k];
  if (!row || row.asc <= 1) return '';
  const b = rowBands(k);
  if (!b.length) return 'Nothing readable yet: press Suggest a space or type bands.';
  if (b.length !== row.asc - 1) return `These bands make ${b.length + 1} ascensions, not ${row.asc}.`;
  return lastRange.value && !rowShapes(k) ? 'No route in these bands goes up to the last stop.' : '';
}
function rowSummary(k: number): string {
  const row = chains.value[k];
  if (!row) return '';
  if (row.asc <= 1) return 'No ascension: keep going on this farm to the last stop. One route.';
  return `${rowShapes(k).toLocaleString()} sets of early stops · ${rowBands(k)
    .map(b => b.length)
    .join(' x ')} values`;
}

/**
 * Fill one chain's box: around your last deadline answer at that many ascensions if there is one,
 * else around your own route (the chain in the planner), else evenly spaced. The first stop is
 * tried at every TE near your current one, where the first ascension usually belongs; the rest
 * every 5 TE either side. Also sets the last-stop range around the answer when it is empty.
 */
function suggestRow(k: number): void {
  const row = chains.value[k];
  if (!row) return;
  const n = Math.max(1, Math.min(8, Math.floor(row.asc || 1)));
  const te = Math.floor(store.currentTE);
  const prior = store.deadlineResult?.byStops.find(r => r.chain.length === n) ?? store.deadlineResult?.routes[0];
  const lastGuess = prior ? prior.chain[prior.chain.length - 1] : Math.min(490, te + 110);
  let early: number[];
  if (prior && prior.chain.length === n) {
    early = prior.chain.slice(0, -1);
    suggestFrom.value = `Chain ${k + 1} was suggested around your last answer, ${prior.chain.join(' ')}.`;
  } else {
    const route = store.seedChain.filter(v => v > te && v < lastGuess);
    if (route.length >= n - 1) {
      early = route.slice(0, n - 1);
      suggestFrom.value = `Chain ${k + 1} was suggested around your route, ${route.slice(0, n - 1).join(' ')}.`;
    } else {
      early = Array.from({ length: n - 1 }, (_, i) => Math.round(te + ((i + 1) * (lastGuess - te)) / n));
      suggestFrom.value = `Chain ${k + 1} was spaced evenly: no answer or route to start from yet.`;
    }
  }
  row.text = early
    .map((c, i) => {
      if (i === 0 && c - te <= 12) return `${te + 1}-${Math.max(te + 6, c + 4)}:1`;
      if (i === 0) return `${c - 8}-${c + 8}:2`;
      return `${c - 15}-${c + 15}:5`;
    })
    .join('; ');
  if (!lastRange.value) lastBox.value = `${Math.max(te + 2, lastGuess - 20)}-${Math.min(490, lastGuess + 20)}`;
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
 * `last=220-300` set a box exactly instead.
 */
const linkParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const linkAsc = [
  ...new Set(
    (linkParams?.get('asc') ?? '')
      .split(',')
      .map(x => Math.floor(Number(x)))
      .filter(n => n >= 1 && n <= 8)
  ),
];
if (linkParams?.get('eggday') === '1') useEggDay();
if (linkAsc.length) {
  mode.value = 'space';
  chains.value = linkAsc.map(asc => ({ asc, text: (linkParams?.get(`chain${asc}`) ?? '').slice(0, 300) }));
  const last = (linkParams?.get('last') ?? '').slice(0, 100);
  if (last) lastBox.value = last;
}

// First fill once the save has loaded, so the box starts from something real. A link's chains are
// each filled the same way, where the link didn't give them.
watch(
  () => store.currentTE,
  te => {
    if (!(te > 0)) return;
    if (linkAsc.length) {
      chains.value.forEach((row, k) => {
        if (row.asc >= 2 && !row.text) suggestRow(k);
      });
      if (!lastBox.value) lastBox.value = `${Math.floor(te) + 2}-${Math.min(490, Math.floor(te) + 130)}`;
      return;
    }
    if (!chains.value[0]?.text && !lastBox.value) suggestRow(0);
  },
  { immediate: true }
);

/**
 * Sets of early stops the run will try. Two chains with the same number of ascensions can share
 * some, and the run tries each once -- so they are counted once, by listing them, when that is
 * cheap; past that the plain sum is close enough for an estimate.
 */
const spaceShapes = computed(() => {
  const counts = chains.value.map((_, k) => rowShapes(k));
  const total = counts.reduce((a, b) => a + b, 0);
  const asc = chains.value.filter((r, k) => counts[k] > 0).map(r => Math.max(1, Math.floor(r.asc)));
  if (new Set(asc).size === asc.length || total > 50_000 || !lastRange.value) return total;
  const seen = new Set<string>();
  chains.value.forEach((row, k) => {
    if (!counts[k]) return;
    const list = row.asc <= 1 ? [[]] : bandShapes(rowBands(k), store.currentTE, lastRange.value![1]);
    for (const s of list) seen.add(s.join(','));
  });
  return seen.size;
});

// ------------------------------------------------------------------ estimate and live progress

/**
 * Routes per set of early stops: the last stop is found by halving its range down to one TE, plus
 * a couple to step out and confirm -- log2(range) + 2. Measured: 8 a set over a 30-TE range.
 */
const lastWidth = computed(() =>
  Math.max(
    2,
    mode.value === 'space' && lastRange.value
      ? lastRange.value[1] - lastRange.value[0] + 1
      : Math.min(490, Math.floor(lastHi.value)) - Math.floor(store.currentTE) // as the run caps it
  )
);
const PROBES = computed(() => Math.ceil(Math.log2(lastWidth.value)) + 2);
const plannedShapes = computed(() => (mode.value === 'space' ? spaceShapes.value : shapes.value));
/**
 * Picking the stops adds its seed pass and the homing in on top of the grid: about a fifth more.
 * Fewer sets than workers: each gets several guesses a round (deadline.ts `parallel`) -- more routes
 * in fewer rounds, so the time comes out as rounds rather than routes.
 */
const plannedRoutes = computed(() => {
  const n = plannedShapes.value;
  if (!n) return 0;
  const k = Math.max(1, Math.min(16, Math.floor(store.workerBudget / n)));
  const perShape = k === 1 ? PROBES.value : k * (Math.ceil(Math.log(lastWidth.value) / Math.log(k + 1)) + 1);
  return Math.round(n * perShape * (mode.value === 'auto' ? 1.2 : 1));
});
const secondsPerRoute = computed(() => store.secondsPerChain || 15);
const estimateLabel = computed(() =>
  plannedRoutes.value ? formatHours(estimateHours(plannedRoutes.value, store.workerBudget, secondsPerRoute.value)) : '—'
);
const costLabel = computed(() => `${secondsPerRoute.value.toFixed(secondsPerRoute.value < 10 ? 2 : 1)} s`);

const runEstimate = ref(0);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
watch(
  () => store.deadlineRunning,
  running => {
    if (ticker) clearInterval(ticker);
    ticker = running ? setInterval(() => (now.value = Date.now()), 1000) : null;
  },
  { immediate: true }
);
onUnmounted(() => ticker && clearInterval(ticker));

const liveDone = computed(() => (store.deadlineProgress?.priced ?? 0) + store.deadlineInBatch);
/** The estimate, never below what is already done: an estimate is a guess, a count is a fact. */
const liveTotal = computed(() => Math.max(runEstimate.value, liveDone.value));
const progressPct = computed(() =>
  runEstimate.value && liveTotal.value ? Math.min(99, Math.round((100 * liveDone.value) / liveTotal.value)) : 0
);
const elapsedSeconds = computed(() => (store.deadlineStartedAt ? (now.value - store.deadlineStartedAt) / 1000 : 0));
function durationLabel(sec: number): string {
  if (sec < 90) return `${Math.round(sec)} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}
const elapsedLabel = computed(() => durationLabel(elapsedSeconds.value));
const remainingLabel = computed(() => {
  if (liveDone.value < 5 || !runEstimate.value || liveDone.value >= runEstimate.value) return '';
  const left = Math.max(0, runEstimate.value - liveDone.value) * (elapsedSeconds.value / liveDone.value);
  return durationLabel(left);
});

const startIssue = computed(() => {
  if (!deadline.value) return '';
  if (deadline.value <= store.planStart) return 'The deadline is before the plan starts.';
  if (mode.value === 'space') {
    if (!lastRange.value) return 'Give the last stop a range above your TE now.';
    const bad = chains.value.findIndex((_, k) => !!rowProblem(k));
    if (bad >= 0) return `Chain ${bad + 1}: ${rowProblem(bad)}`;
    if (!spaceShapes.value) return 'No route in these chains goes up from your TE to the last stop.';
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
function fillFromSpec(spec: DeadlineRunSpec): void {
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
  const sets = spec.bandSets?.length ? spec.bandSets : spec.bands?.length ? [spec.bands] : null;
  if (sets) {
    mode.value = 'space';
    chains.value = sets.map(set => ({ asc: set.length + 1, text: set.map(b => formatBand(b)).join('; ') }));
    lastBox.value = `${spec.lastLo ?? Math.floor(store.currentTE) + 1}-${spec.lastHi}`;
  } else {
    mode.value = 'auto';
    minStops.value = spec.minStops;
    maxStops.value = spec.maxStops;
    lastHi.value = spec.lastHi;
    lastHiTouched.value = true;
    step.value = spec.step;
  }
}

async function resume(): Promise<void> {
  const spec = store.deadlineUnfinished?.spec;
  if (spec) fillFromSpec(spec);
  runEstimate.value = spec?.estimate ?? 0;
  await store.resumeDeadline(props.playerId);
}

/** Set while a Find and submit run is going: it shares its best answer when it finishes. */
const autoShare = ref(false);

/** Find, and with `andSubmit` share the best answer at the end (not when stopped early or failed). */
async function start(andSubmit: boolean): Promise<void> {
  autoShare.value = andSubmit && shareOptIn.value;
  try {
    await find();
  } finally {
    const go = autoShare.value;
    autoShare.value = false;
    if (go && result.value && best.value && !result.value.stoppedEarly && !store.error) await share();
  }
}

async function find(): Promise<void> {
  runEstimate.value = plannedRoutes.value;
  if (mode.value === 'space' && lastRange.value) {
    const counts = chains.value.map(r => Math.max(1, Math.floor(r.asc)));
    await store.startDeadline(props.playerId, {
      deadline: deadline.value,
      minStops: Math.min(...counts),
      maxStops: Math.max(...counts),
      lastLo: lastRange.value[0],
      lastHi: lastRange.value[1],
      step: 1,
      ascendNeeded: ascendNeeded.value,
      estimate: plannedRoutes.value,
      bandSets: chains.value.map((r, k) => (r.asc <= 1 ? [] : rowBands(k).map(b => [...b]))),
    });
    return;
  }
  await store.startDeadline(props.playerId, {
    deadline: deadline.value,
    minStops: specForCount.value.minStops,
    maxStops: specForCount.value.maxStops,
    lastHi: Math.min(490, Math.floor(lastHi.value)),
    step: step.value,
    ascendNeeded: ascendNeeded.value,
    estimate: plannedRoutes.value,
  });
}

// ------------------------------------------------------------------ share to the board

const collectorConfigured = computed(() => store.leaderboardUrl.replace(/\/$/, '') !== '');
const shareOptIn = ref(false);
/** On, like Insane's: the table is what lets someone check an answer, not just read it. */
const shareCsv = ref(true);
const shareAnonymous = ref(true);
const shareNameTouched = ref(false);
/** The name in the header's ID box, never the raw EID (see InsanePanel's `accountName`). */
const eidsStore = useEidsStore();
const accountName = computed(() => {
  const entry = eidsStore.eids.get(props.playerId.trim());
  return entry?.nickname || entry?.username || '';
});
const shareName = ref(accountName.value);
watch(accountName, name => {
  if (!shareNameTouched.value) shareName.value = name;
});
const sharing = ref(false);
const shareMessage = ref('');
const shareOk = ref(true);
/** Which answer was sent, so the button says so and a second click can't send it twice. */
const resultKey = computed(() =>
  result.value && best.value ? `${result.value.deadline}|${result.value.at}|${best.value.chain.join(',')}` : ''
);
const sentKey = ref('');
/** The leaderboard tab this answer goes on: Egg Day has its own. */
const shareTab = computed(() => {
  const y = result.value ? eggDayYearOf(result.value.deadline) : null;
  return y ? `Egg Day ${y}` : 'By a date';
});

async function share(): Promise<void> {
  if (!best.value || sharing.value) return;
  sharing.value = true;
  shareOk.value = true;
  shareMessage.value = '';
  try {
    const name = shareAnonymous.value ? '' : shareName.value.trim().slice(0, 40);
    const payload = store.buildDeadlineSubmission(best.value, name);
    if (!payload) {
      shareOk.value = false;
      shareMessage.value = 'Nothing to send yet.';
      return;
    }
    const res = await store.sendSubmission(payload, shareCsv.value ? store.deadlineCsv() : undefined);
    shareOk.value = res.ok;
    if (res.ok) sentKey.value = resultKey.value;
    shareMessage.value = res.ok
      ? res.duplicate === 'exact'
        ? res.message
        : `Thanks! ${sentence(res.message)} It's on the leaderboard's ${shareTab.value} tab.`
      : `Not sent: ${res.message}`;
  } finally {
    sharing.value = false;
  }
}

function downloadResultCsv(): void {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadCsv(`deadline-search-${stamp}.csv`, [store.deadlineCsv()]);
}

const result = computed(() => store.deadlineResult);
/** A result loaded from this browser rather than produced since the panel opened. */
const openedAt = Date.now();
const fromEarlier = computed(() => !!result.value && result.value.at < openedAt);
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
const atCeiling = computed(() => !!best.value && best.value.chain[best.value.chain.length - 1] >= result.value!.lastHi);

function inPlannerZone(unixSeconds: number): string {
  return showDateTime(unixSeconds, plannerZone.value);
}
function spareLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.max(0, Math.round(seconds / 60))} min`;
  if (seconds < 2 * 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}
</script>
