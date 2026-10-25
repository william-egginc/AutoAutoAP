<!--
  The chain leaderboard, read from the collector and rendered in the planner's own styling.

  The same data is served as a standalone page by the Worker itself, and that page is still the
  right answer for someone following a link from outside. This exists because the people most
  likely to want the board are the ones already looking at their own result, and sending them to
  another domain to compare against it is a worse experience than a tab.

  It re-implements the table rather than framing the Worker's page: an iframe would carry the
  other page's styling into the middle of this one, would not share the planner's TE target, and
  could not offer "use this chain". Nothing here re-simulates anything -- it is one GET.

  TWO RACE TABS, because a plan length answers none of the questions people bring here. A plan's
  length counts from its own start, so the same plan run a day later is a day shorter; a board
  sorted by it rewards whoever submitted most recently (a player's own words: "every day the new
  run shows up 1 day faster than the previous best, but it's the same plan"). So:

    - Race: one line per named player, sorted by the date their best plan that still counts
      reaches the target (lib/leaderboardRank.ts has the rules). Being further along counts, and
      the header says so.
    - All runs: every row, exact copies shown once, every column sortable.

  And two for the deadline search's answers (schema 8), "the highest TE by this date": Egg Day
  (first, and open by default) and By a date for every other deadline (lib/leaderboardRank.ts
  `buildDeadlineBoard`).

  PHASE 2 (collector redeploy, 2026-09-25). Rows carry `acct`, a tag made from the sender's owner
  code (search/owner.ts), so the race knows who is who exactly and nobody can knock a plan out with
  rows dressed as someone else's (lib/leaderboardRank.ts `mayJudge`). My runs and the "you" chip come
  from GET /mine -- the rows sent with this browser's code for the loaded account, anonymous ones
  included -- plus, for runs from before codes existed, the timezone+artifacts match. An anonymous
  viewer is told privately where they would place.

  MY RUNS (15 Oct 2026). Compare's My plans tab, which listed one target's runs, became the top-level My
  runs tab (MyRunsView.vue): this panel with mode="myruns" shows the viewer's runs of every kind there
  (MyRunsList.vue), and "Who sees your runs" with them. One load and one "which runs are mine" for both.
-->
<template>
  <!-- ================================================================== MY RUNS (#/myruns) -->
  <!-- My runs' "Your runs on the board" (MyRunsView.vue): the same load, /mine, "which runs are mine"
       and Hide from the public as Compare, without its tabs. Every kind and target, hidden runs too. -->
  <div v-if="myRunsMode" class="space-y-3" data-testid="my-runs-board">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <p class="flex-1 min-w-[14rem] text-[11px] text-indigo-900/80 leading-relaxed">
        Every run this browser sent for your account, plus older runs with your timezone and artifacts: Egg Day, races
        to any target and other dates, and the ones hidden from the public. Open one for its details, or press
        <span class="font-semibold">Use</span> to price it on your account.
      </p>
      <button
        type="button"
        class="min-h-[44px] px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-white disabled:opacity-40"
        :disabled="loading"
        @click="load"
      >
        {{ loading ? 'Loading' : 'Refresh' }}
      </button>
    </div>
    <div aria-live="polite">
      <p
        v-if="hideMsg"
        class="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]"
        :class="hideMsgClass(hideMsg)"
      >
        <span>{{ hideMsg.text }}</span>
        <button
          type="button"
          class="shrink-0 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100"
          @click="hideMsg = null"
        >
          OK
        </button>
      </p>
    </div>
    <!-- Not exclusive: with /all down, the runs /mine returned (hidden ones too) still list. -->
    <p v-if="error" class="flex flex-wrap items-center gap-2 text-[11px] text-red-700 font-semibold" data-testid="board-error">
      <span>{{ error }}</span>
      <button
        type="button"
        class="min-h-[44px] px-3 rounded-lg border border-red-300 bg-white text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-50 disabled:opacity-40"
        :disabled="loading"
        data-testid="board-retry"
        @click="load"
      >
        Retry
      </button>
    </p>
    <p v-if="loading && !allRows.length && !mineRows" class="text-[11px] text-indigo-900/60 py-6 text-center">
      Loading…
    </p>
    <p v-else-if="!myKey && !mineRows?.length" class="text-[11px] text-indigo-900/70 py-4">
      Load your save to see your own runs here.
    </p>
    <MyRunsList
      v-else-if="!error || mineRows?.length"
      :rows="myRunRows"
      :csv-root="csvRoot"
      :view-zone="viewZone"
      :egg-day-at="eggDayAt"
      :egg-day-year="eggDayYear"
      :player-id="playerId"
      :main-target="store.finalTE || undefined"
      @use="c => emit('use', c)"
    />
    <MyRunsMissing
      v-if="loadedOnce && (myKey || mineRows?.length)"
      :rows="mergedRows"
      :look-alike="lookAlike"
      :save-key="myKey"
      :has-code="hasCode"
    />
    <!-- Who sees your runs (moved here from Compare's My plans, 15 Oct 2026): hide every run this
         browser sent for the account, or show them all again, and the hidden ones, listed apart and
         muted, each with "Show again". Only when /mine answered: without this browser's code nothing
         here could be proved yours. -->
    <section
      v-if="mineRows?.length"
      class="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white/60 p-3 text-[11px]"
      aria-label="Who sees your runs"
    >
      <div class="flex flex-wrap items-center gap-2">
        <h4 class="mr-auto text-[9px] font-black uppercase tracking-widest text-slate-500">Who sees your runs</h4>
        <button
          v-if="myPublicCount"
          type="button"
          class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-800 disabled:opacity-50"
          :disabled="hideAllBusy || hideBusy.size > 0"
          @click="changeHidden({ all: true }, true)"
        >
          {{ hideAllBusy ? 'Working…' : 'Hide all my runs from the public' }}
        </button>
        <button
          v-if="myHidden.length"
          type="button"
          class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-800 disabled:opacity-50"
          :disabled="hideAllBusy || hideBusy.size > 0"
          @click="changeHidden({ all: true }, false)"
        >
          {{ hideAllBusy ? 'Working…' : 'Show all again' }}
        </button>
      </div>
      <!-- ABOUT LINK: when the About page has a section on hidden runs, link "the planner's
           maintainer" here to it. -->
      <p class="text-slate-500">
        A hidden run leaves the public board but stays here for you. Only you and the planner's maintainer will see it.
        Nothing is deleted, and you can show it again any time.
      </p>
      <div v-if="myHidden.length">
        <p class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
          Hidden from the public ({{ myHidden.length }})
        </p>
        <ul class="divide-y divide-slate-100 text-slate-500">
          <li v-for="h in myHidden" :key="h.id ?? contentFingerprint(h)" class="py-1.5">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <button
                type="button"
                class="text-slate-400 hover:text-indigo-700"
                :aria-expanded="openHidden === (h.id ?? '')"
                :aria-label="`Show what ${h.chain.join(' ')} was simulated with`"
                @click="openHidden = openHidden === (h.id ?? '') ? '' : (h.id ?? '')"
              >
                {{ openHidden === (h.id ?? '') ? '⌄' : '›' }}
              </button>
              <span class="font-mono">{{ h.chain.join(' ') }}</span>
              <span v-if="isDeadlineRow(h)">{{ h.finalTE }} TE by {{ deadlineText(h.deadline as number) }}</span>
              <span v-else :title="finishTitle(finishMs(h), h.timezone)"
                >to {{ h.finalTE }}, finishes {{ finishDateText(finishMs(h), viewZone) }}</span
              >
              <span :title="sentTitle(h.receivedAt ?? h.submittedAt)"
                >sent {{ sentText(h.receivedAt ?? h.submittedAt) }}</span
              >
              <span class="ml-auto whitespace-nowrap">
                Hidden from the public ·
                <button
                  type="button"
                  class="font-semibold text-indigo-700 underline hover:text-indigo-900 disabled:opacity-50 disabled:no-underline"
                  :disabled="hideAllBusy || (!!h.id && hideBusy.has(h.id))"
                  @click="h.id && changeHidden({ ids: [h.id] }, false)"
                >
                  {{ h.id && hideBusy.has(h.id) ? 'Showing…' : 'Show again' }}
                </button>
              </span>
            </div>
            <div v-if="h.id && openHidden === h.id" class="mt-2 rounded-lg bg-slate-50 px-3 py-3">
              <LeaderboardRunDetail :row="h" :csv-root="csvRoot" :view-zone="viewZone" />
            </div>
          </li>
        </ul>
      </div>
    </section>
    <p v-if="capped" class="text-[10px] text-amber-800">
      The collector sent its maximum of {{ plural(ALL_CAP, 'run') }}, so the oldest or slowest runs may be missing.
    </p>
  </div>

  <div v-else class="space-y-4">
    <div class="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-[10px] font-black text-indigo-700 uppercase tracking-widest">{{ NAMES.compare }}</h1>
        </div>
        <div v-if="boardView" class="flex items-end gap-2">
          <label v-if="tab !== 'dates' && tab !== 'eggday'" class="block">
            <span class="block text-[9px] font-black uppercase tracking-widest text-indigo-700/70 mb-1">Target TE</span>
            <select v-model="final" class="rounded-lg border-indigo-200 text-xs font-bold text-slate-700 py-1.5">
              <option value="">all</option>
              <option v-for="te in targets" :key="te" :value="String(te)">{{ te }}</option>
            </select>
          </label>
          <button
            type="button"
            class="min-h-[44px] px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-white disabled:opacity-40"
            :disabled="loading"
            @click="load"
          >
            {{ loading ? 'Loading' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Leaderboard views" class="flex flex-wrap gap-1 border-b border-indigo-100">
        <button
          v-for="t in TABS"
          :key="t"
          type="button"
          role="tab"
          :aria-selected="tab === t"
          class="min-h-[44px] sm:min-h-0 px-3 py-1.5 -mb-px rounded-t-lg text-[10px] font-black uppercase tracking-widest border border-b-0"
          data-testid="board-view-tab"
          :class="
            tab === t
              ? 'bg-white border-indigo-200 text-indigo-800'
              : 'border-transparent text-indigo-700/90 hover:text-indigo-800'
          "
          @click="tab = t"
        >
          {{ tabLabel(t) }}
        </button>
      </div>

      <!-- Which simulator priced each run (lib/simLabel.ts): every finish carries a "sim" chip (SimChip.vue), and
           this hides the runs this site's own simulator did not price, on every view here, Insights too. -->
      <div v-if="tab !== 'latest'" class="flex flex-wrap items-center gap-x-3 text-[11px] text-indigo-900/80">
        <label class="inline-flex min-h-[44px] items-center gap-2">
          <input v-model="showOlder" type="checkbox" class="rounded border-indigo-300 text-indigo-600" />
          Show runs from older simulators
        </label>
        <span v-if="simHidden && tab !== 'insights'" class="text-slate-500" data-testid="sim-hidden">{{
          simHidden
        }}</span>
      </div>

      <!-- What the last "Hide from the public" or "Show again" came to, on every tab: the run it was
           about may have just left the list it was clicked in. -->
      <div aria-live="polite">
        <p
          v-if="hideMsg && boardView"
          class="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[11px]"
          :class="hideMsgClass(hideMsg)"
        >
          <span>{{ hideMsg.text }}</span>
          <button
            type="button"
            class="shrink-0 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100"
            @click="hideMsg = null"
          >
            OK
          </button>
        </p>
      </div>

      <!-- Insights: the Chain Explorer's charts (its own load, filters and refresh), in place of a
           link out to its page (the unified layout, phase 4). -->
      <ChainExplorer v-if="tab === 'insights'" part="insights" embedded />

      <!-- Your latest run: its block moved to My runs (16 Oct 2026; LatestRunView.vue in MyRunsView.vue). The
           tab and its address stay, as one line pointing there. -->
      <p v-else-if="tab === 'latest'" class="text-xs text-slate-700 py-2" data-testid="latest-moved">
        <a :href="MY_RUNS_HASH" class="font-bold text-indigo-700 underline hover:text-indigo-900"
          >{{ NAMES.latest }} is now in {{ NAMES.myRuns }} ›</a
        >
      </p>

      <p v-else-if="error" class="flex flex-wrap items-center gap-2 text-[11px] text-red-700 font-semibold" data-testid="board-error">
        <span>{{ error }}</span>
        <button
          type="button"
          class="min-h-[44px] px-3 rounded-lg border border-red-300 bg-white text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-50 disabled:opacity-40"
          :disabled="loading"
          data-testid="board-retry"
          @click="load"
        >
          Retry
        </button>
      </p>

      <p v-else-if="loading && !allRows.length" class="text-[11px] text-indigo-900/60 py-6 text-center">Loading…</p>

      <p v-else-if="!allRows.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
        Nothing submitted yet. Run a search and use <span class="font-semibold">Share this result</span>.
      </p>

      <!-- ================================================================== RACE -->
      <template v-else-if="tab === 'race'">
        <p v-if="target == null" class="text-[11px] text-indigo-900/70 py-4">
          Pick a target TE above: a race needs one finish line.
        </p>
        <template v-else>
          <p class="text-[11px] text-indigo-900/80 leading-relaxed">
            Players ranked by when their current best plan reaches {{ target }}. How far along they already are counts,
            so this shows who gets there first, not whose plan is best. To compare a route with yours, press
            <span class="font-semibold">Use</span>.
          </p>
          <!-- Only this browser sees it: the race is named-only, and saying where an anonymous run
               would sit on the public board would tie it to the account. -->
          <p
            v-if="anonPlace"
            class="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-900"
          >
            {{ anonPlace }}
          </p>
          <label v-if="myTE > 0" class="inline-flex items-center gap-2 text-[11px] text-indigo-900/80">
            <input v-model="nearMe" type="checkbox" class="rounded border-indigo-300 text-indigo-600" />
            Only players within {{ NEAR_TE }} TE of you (you are at TE {{ myTE }})
          </label>

          <p v-if="!race || !race.entries.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
            No named player has a current plan to {{ target }} yet. To join, pick “Credit me as” when you share a
            result.
          </p>
          <p v-else-if="!raceShown.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
            Nobody within {{ NEAR_TE }} TE of you has a current plan to {{ target }}.
          </p>
          <!-- A size container, so an opened player's plans can be exactly as wide as what is on
               screen (100cqw) however wide the table itself is. On a phone the route sits under
               the name and the days left under the finish, so the finish is on screen without
               scrolling (review, 2026-09-27); a shadow on an edge says there is more that way. -->
          <p
            v-else-if="narrow && raceEdges.right && !raceEdges.left"
            class="-mb-2 text-right text-[10px] text-slate-400"
          >
            Swipe the table for more columns →
          </p>
          <div v-if="raceShown.length" class="relative">
            <div
              :ref="raceEdges.bind"
              class="overflow-x-auto [container-type:inline-size]"
              @scroll.passive="raceEdges.update"
            >
              <table class="w-full text-xs">
                <thead>
                  <tr
                    class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-left whitespace-nowrap"
                  >
                    <th class="py-2 pr-2"></th>
                    <th class="py-2 pr-3 text-right">#</th>
                    <th class="py-2 pr-3">{{ narrow ? 'Player · route' : 'Player' }}</th>
                    <th v-if="!narrow" class="py-2 pr-3">Route</th>
                    <th class="py-2 pr-3">
                      Finishes
                    </th>
                    <th v-if="!narrow" class="py-2 pr-3 text-right">Days left</th>
                    <th class="py-2 pr-3 text-right">From TE</th>
                    <th class="py-2 pr-3">Planned</th>
                    <th class="py-2 pr-3">Schedule</th>
                    <th class="py-2 pr-3 text-right">Tried</th>
                    <th class="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="e in raceShown" :key="e.key">
                    <tr
                      class="border-t border-slate-100"
                      :class="[isMe(e) ? 'bg-emerald-50/60' : '', narrow ? 'align-top' : '']"
                    >
                      <td class="py-2 pr-2">
                        <button
                          type="button"
                          class="text-slate-400 hover:text-indigo-700"
                          :aria-expanded="!!openPlayers[e.key]"
                          :aria-label="`Show all of ${e.label}'s plans`"
                          @click="openPlayers[e.key] = !openPlayers[e.key]"
                        >
                          {{ openPlayers[e.key] ? '⌄' : '›' }}
                        </button>
                      </td>
                      <td class="py-2 pr-3 text-right font-black text-slate-500">{{ e.rank }}</td>
                      <td
                        class="py-2 pr-3 font-bold text-slate-700 cursor-pointer"
                        data-testid="row-open-name"
                        @click="onRowClick($event, () => (openPlayers[e.key] = !openPlayers[e.key]))"
                      >
                        <span class="whitespace-nowrap"
                          >{{ e.label }}
                          <span
                            v-if="isMe(e)"
                            class="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest"
                            >you</span
                          ><span
                            v-else-if="whoIs(e) === 'maybe'"
                            class="ml-1 text-[9px] font-semibold text-slate-400"
                            title="Same timezone and gear as the save you loaded, but this browser holds no code that proves it."
                            >maybe you</span
                          ></span
                        >
                        <!-- Under the name on a phone, wrapping rather than widening the column. -->
                        <div v-if="narrow" class="mt-0.5 max-w-[10rem] leading-snug">
                          <span class="font-mono text-slate-600">{{ e.best.row.chain.join(' ') }}</span>
                          <span
                            v-if="provisionalTag(e.best.row)"
                            class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-amber-50 border border-amber-300 text-[9px] font-black text-amber-800"
                            :title="PROVISIONAL_TITLE"
                            >{{ provisionalTag(e.best.row) }}</span
                          >
                          <span
                            v-for="t in raceTags.get(e.key) ?? []"
                            :key="t"
                            class="ml-1 inline-block px-1 rounded bg-sky-100 text-[9px] font-black text-sky-800"
                            :title="settingTagTitle(t)"
                            >{{ t }}</span
                          >
                        </div>
                      </td>
                      <td
                        v-if="!narrow"
                        class="py-2 pr-3 cursor-pointer"
                        @click="onRowClick($event, () => (openPlayers[e.key] = !openPlayers[e.key]))"
                      >
                        <span class="font-mono font-bold text-slate-700 whitespace-nowrap">{{
                          e.best.row.chain.join(' ')
                        }}</span>
                        <span
                          v-if="provisionalTag(e.best.row)"
                          class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-amber-50 border border-amber-300 text-[9px] font-black text-amber-800"
                          :title="PROVISIONAL_TITLE"
                          >{{ provisionalTag(e.best.row) }}</span
                        >
                        <span
                          v-for="t in raceTags.get(e.key) ?? []"
                          :key="t"
                          class="ml-1.5 inline-block whitespace-nowrap px-1 rounded bg-sky-100 text-[9px] font-black text-sky-800"
                          :title="settingTagTitle(t)"
                          >{{ t }}</span
                        >
                      </td>
                      <td
                        class="py-2 pr-3 text-slate-700 font-bold whitespace-nowrap"
                        :title="finishTitle(e.best.finish, e.best.row.timezone)"
                      >
                        {{ finishDateText(e.best.finish, viewZone) }}
                        <SimChip :stamp="e.best.row.simVersion" />
                        <div v-if="narrow" class="font-normal text-slate-500">
                          {{ daysLeftPhrase(e.best.finish, now, viewZone) }}
                        </div>
                      </td>
                      <td v-if="!narrow" class="py-2 pr-3 text-right text-slate-700 font-bold">
                        {{ daysLeftText(e.best.finish, now, viewZone) }}
                      </td>
                      <td class="py-2 pr-3 text-right text-slate-600">{{ e.best.row.currentTE ?? '—' }}</td>
                      <!-- Short, on one line, with the numbers in the tooltip: wrapped, the on-track
                           figures made the row three lines tall. On your calendar, like Finishes. -->
                      <td
                        class="py-2 pr-3 text-slate-500 whitespace-nowrap"
                        :title="plannedText(e.best, { zone: viewZone })"
                      >
                        {{ plannedText(e.best, { zone: viewZone, brief: true }) }}
                      </td>
                      <td class="py-2 pr-3 text-slate-400 whitespace-nowrap" :title="e.best.row.window || undefined">
                        {{ scheduleText(e.best.row.window) }}
                      </td>
                      <td class="py-2 pr-3 text-right text-slate-500 whitespace-nowrap" :title="triedTitle(e)">
                        {{ e.plansTried }} {{ e.plansTried === 1 ? 'plan' : 'plans' }}
                      </td>
                      <td class="py-2 text-right">
                        <button
                          type="button"
                          class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                          :title="`Put ${e.best.row.chain.join(' ')} into the Auto Planner and price it on your account`"
                          @click="emit('use', e.best.row.chain)"
                        >
                          Use
                        </button>
                        <FollowButton v-if="followableRow(e.best.row)" class="ml-1" :chain="e.best.row.chain" :goal-key="boardGoalKey(e.best.row)" from="board" />
                      </td>
                    </tr>
                    <tr v-if="openPlayers[e.key]" class="bg-white/70">
                      <td :colspan="narrow ? 9 : 11" class="p-0">
                        <!-- Exactly as wide as the visible part of the table and pinned to its left
                             edge: on a phone the Race table is wider than the screen, and a plan list
                             left to size itself would stretch it further and wrap every line. The
                             list scrolls sideways inside this block instead. -->
                        <div class="sticky left-0 w-[100cqw] px-3 py-3 space-y-3">
                          <div>
                            <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                              Current plans · {{ e.label
                              }}<template v-if="browserCount(e) > 1">
                                · sent from {{ browserCount(e) }} browsers</template
                              >
                            </h4>
                            <LeaderboardPlanList
                              :plans="[e.best, ...e.listed]"
                              :all-plans="shownPlans(e)"
                              :best="e.best"
                              :resends="e.resends"
                              :lines="e.lines"
                              :no-code="e.noCode"
                              :now="now"
                              :view-zone="viewZone"
                              :csv-root="csvRoot"
                              gap-label="vs best"
                              @use="c => emit('use', c)"
                            />
                            <p v-if="e.listed.length" class="mt-1 text-[10px] text-slate-400">
                              "vs best" only compares plans made from the same save as the best one and priced by the
                              same version of the planner.
                            </p>
                          </div>
                          <div v-if="e.dropped.length">
                            <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                              Not counted
                            </h4>
                            <LeaderboardPlanList
                              :plans="e.dropped"
                              :all-plans="shownPlans(e)"
                              :lines="e.lines"
                              :no-code="e.noCode"
                              :now="now"
                              :view-zone="viewZone"
                              :csv-root="csvRoot"
                              show-reason
                              @use="c => emit('use', c)"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div
              v-if="raceEdges.left"
              class="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-slate-400/25 to-transparent"
            ></div>
            <div
              v-if="raceEdges.right"
              class="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-slate-400/25 to-transparent"
            ></div>
          </div>

          <details v-if="race && race.waiting.length" class="text-[11px] text-indigo-900/80">
            <summary class="cursor-pointer font-semibold">
              No current plan to {{ target }} ({{ race.waiting.length }}
              {{ race.waiting.length === 1 ? 'player' : 'players' }})
            </summary>
            <ul class="mt-1 space-y-0.5">
              <li v-for="w in race.waiting" :key="w.key">
                <span class="font-bold">{{ w.label }}</span>
                <span class="text-slate-500">: {{ w.dropped[0]?.reason || 'no plan that counts' }}</span>
              </li>
            </ul>
          </details>

          <p class="text-[10px] text-slate-500 leading-relaxed">
            Dates and days left are in your timezone ({{ viewZone }}); hover a finish for the player's own. Anonymous
            runs are not in the race, so add a name to join. All runs lists every run.
          </p>
          <details class="text-[10px] text-slate-500 leading-relaxed">
            <summary class="cursor-pointer font-semibold text-slate-600">How the race is judged</summary>
            <ul class="mt-1 ml-4 list-disc space-y-1">
              <li>A player's line is their earliest-finishing plan that still counts.</li>
              <li>
                A plan stops counting when a newer run of the same plan replaces it. The newest run wins whether it
                finishes earlier or later, and a newer run's automatic re-check of the plan replaces it too. A plan also
                stops counting when a newer run shows the player 2 or more TE behind where the plan said they would be,
                when it is a what-if (it starts more than 12 hours after it was sent or before its save, or was planned
                from a higher TE than the save or a later run shows), or when it is older than 30 days.
              </li>
              <li>
                Only the player's own runs can do that: runs sent from the same browser (the board matches a private
                code that is never shown) or, for runs sent before codes existed, runs with the same name or the same
                timezone and artifacts. Nobody can knock a plan out by sending runs under someone else's name.
              </li>
              <li>
                Each player gets one line. Runs from a second browser (a second code) join it when the name, timezone,
                artifacts and TE agree, and each browser's plans are judged by that browser's runs. Runs sent under the
                name without a code since codes began join it the same way, tagged
                <span class="font-semibold">no code</span>. Anyone could have sent those, so they never set the line's
                finish or place. A name marked <span class="font-semibold">(no code)</span> or
                <span class="font-semibold">(other code)</span> is one of these lines that did not fit, and it may be
                somebody else.
              </li>
              <li>"Tried" counts each plan once, however often it was run or sent.</li>
            </ul>
          </details>
        </template>
      </template>

      <!-- ======================================================= EGG DAY, AND BY A DATE -->
      <template v-else-if="tab === 'eggday' || tab === 'dates'">
        <p v-if="tab === 'eggday'" class="text-[11px] text-indigo-900/80 leading-relaxed">
          The highest TE each player can reach by Egg Day {{ eggDayYear }} (14 July, 9 am Pacific), from the Auto
          Planner's <span class="font-bold">{{ NAMES.byDate }}</span> search with the Egg Day preset. Players are ranked
          by the TE they reach, then by time to spare, using each player's best answer. Game events aren't simulated,
          including Egg Day's own.
        </p>
        <p v-else class="text-[11px] text-indigo-900/80 leading-relaxed">
          The highest TE each player can reach by any other date, from the Auto Planner's
          <span class="font-bold">{{ NAMES.byDate }}</span> search, one table per deadline. Dates are in your timezone
          ({{ viewZone }}). Players are ranked by the TE they reach, then by time to spare, using each player's best
          answer. Egg Day {{ eggDayYear }} has its own tab.
        </p>
        <div class="flex flex-wrap items-end gap-3">
          <label class="block">
            <span class="block text-[9px] font-black uppercase tracking-widest text-indigo-700/70 mb-1"
              >Ascensions</span
            >
            <select v-model="dateAsc" class="rounded-lg border-indigo-200 text-xs font-bold text-slate-700 py-1.5">
              <option :value="null">any</option>
              <option v-for="n in dateAscOptions" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-[9px] font-black uppercase tracking-widest text-indigo-700/70 mb-1"
              >Awake hours</span
            >
            <select v-model="dateHours" class="rounded-lg border-indigo-200 text-xs font-bold text-slate-700 py-1.5">
              <option :value="null">either</option>
              <option value="awake">planned around awake hours</option>
              <option value="any">any time of day</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-[9px] font-black uppercase tracking-widest text-indigo-700/70 mb-1">Away from virtue</span>
            <select v-model="dateOff" class="rounded-lg border-indigo-200 text-xs font-bold text-slate-700 py-1.5">
              <option :value="null">either</option>
              <option value="with">with time off</option>
              <option value="without">without time off</option>
            </select>
          </label>
          <button
            v-if="dateFiltered"
            type="button"
            class="text-[10px] font-black uppercase tracking-widest text-indigo-700/70 hover:text-indigo-900 pb-2"
            @click="((dateAsc = null), (dateHours = null), (dateOff = null))"
          >
            Clear
          </button>
        </div>
        <p v-if="!shownDates.length && dateFiltered" class="text-[11px] text-indigo-900/60 py-6 text-center">
          No answers in these categories.
        </p>
        <p v-else-if="!shownDates.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
          No answers yet. Run {{ NAMES.byDate }} in the Auto Planner<template v-if="tab === 'eggday'">
            with the Egg Day preset</template
          >
          and use <span class="font-semibold">Share this result</span>.
        </p>
        <div
          v-for="g in shownDates"
          :key="g.deadline"
          class="rounded-xl border border-indigo-100 bg-white p-3 space-y-2"
        >
          <p class="text-[10px] font-black uppercase tracking-widest text-indigo-800">
            By {{ deadlineText(g.deadline) }}
            <span v-if="g.deadline * 1000 < now" class="font-semibold normal-case tracking-normal text-slate-500"
              >· this date has passed</span
            >
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-[11px] tabular-nums">
              <thead>
                <tr class="text-left text-[9px] font-black uppercase tracking-widest text-indigo-700/60">
                  <th class="pr-3 py-1">#</th>
                  <th class="pr-3 py-1">Who</th>
                  <th class="pr-3 py-1">TE by then</th>
                  <th class="pr-3 py-1">Route</th>
                  <th class="pr-3 py-1">Spare</th>
                  <th class="pr-3 py-1">From</th>
                  <th class="pr-3 py-1">Sent</th>
                  <th class="pr-3 py-1">CSV</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="e in [...g.entries, ...g.anonymous]" :key="dateKey(g.deadline, e)">
                  <tr
                    class="border-t border-indigo-50 cursor-pointer hover:bg-indigo-50/40"
                    :class="e.rank ? '' : 'text-slate-500'"
                    :title="
                      openDate === dateKey(g.deadline, e)
                        ? 'Hide the details'
                        : 'Show the details and any other answers'
                    "
                    @click="openDate = openDate === dateKey(g.deadline, e) ? '' : dateKey(g.deadline, e)"
                  >
                    <td class="pr-3 py-1 font-black">{{ e.rank ?? '—' }}</td>
                    <td class="pr-3 py-1 font-bold">
                      {{ e.label
                      }}<span v-if="e.others.length" class="font-normal text-slate-400">
                        · {{ e.others.length }} more</span
                      >
                    </td>
                    <td class="pr-3 py-1 font-black text-indigo-900 whitespace-nowrap">
                      {{ e.te }}
                      <SimChip :stamp="e.best.simVersion" />
                    </td>
                    <td class="pr-3 py-1">
                      {{ e.best.chain.join(' ')
                      }}<span
                        v-if="provisionalTag(e.best)"
                        class="ml-1 inline-block whitespace-nowrap px-1 rounded bg-amber-50 border border-amber-300 text-[9px] font-black text-amber-800"
                        :title="PROVISIONAL_TITLE"
                        >{{ provisionalTag(e.best) }}</span
                      >
                    </td>
                    <td class="pr-3 py-1">{{ spareText(e.spare) }}</td>
                    <td class="pr-3 py-1" :title="e.best.startLocal ? `plan start ${e.best.startLocal}` : undefined">
                      {{ e.best.currentTE ?? '—' }} TE
                    </td>
                    <td class="pr-3 py-1" :title="sentTitle(e.best.receivedAt ?? e.best.submittedAt)">
                      {{ sentText(e.best.receivedAt ?? e.best.submittedAt) }}
                    </td>
                    <td class="pr-3 py-1">
                      <a
                        v-if="e.best.hasCsv && e.best.id"
                        :href="`${csvRoot}?id=${encodeURIComponent(e.best.id)}`"
                        class="font-bold text-indigo-700 underline hover:text-indigo-900"
                        :title="
                          e.best.provisional
                            ? 'Every route this search had found when it sent this, as a gzipped CSV: the run is still going'
                            : 'Every route this search found, as a gzipped CSV'
                        "
                        @click.stop
                        >{{ e.best.provisional ? 'CSV so far ↓' : 'CSV ↓' }}</a
                      >
                      <span v-else class="text-slate-300" title="Sent without a CSV">—</span>
                    </td>
                  </tr>
                  <tr v-if="openDate === dateKey(g.deadline, e)" class="bg-slate-50">
                    <td colspan="8" class="px-3 py-3 space-y-3">
                      <LeaderboardRunDetail
                        :row="e.best"
                        :copies="[e.best]"
                        :csv-root="csvRoot"
                        :view-zone="viewZone"
                      />
                      <div v-if="e.others.length" class="space-y-1">
                        <p class="text-[9px] font-black uppercase tracking-widest text-indigo-700/60">
                          Their other answers for this date
                        </p>
                        <p v-for="o in e.others" :key="o.id ?? o.chain.join(',')" class="text-[11px] text-slate-600">
                          <span class="font-bold text-indigo-900">{{ o.finalTE }} TE</span>
                          <SimChip :stamp="o.simVersion" /> via {{ o.chain.join(' ') }}, from
                          {{ o.currentTE ?? '—' }} TE, sent {{ sentText(o.receivedAt ?? o.submittedAt) }}
                          <a
                            v-if="o.hasCsv && o.id"
                            :href="`${csvRoot}?id=${encodeURIComponent(o.id)}`"
                            class="ml-1 font-bold text-indigo-700 underline hover:text-indigo-900"
                            >{{ o.provisional ? 'CSV so far ↓' : 'CSV ↓' }}</a
                          >
                        </p>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <p v-if="g.anonymous.length" class="text-[10px] text-slate-500">
            Anonymous answers are listed but not ranked, as in the race.
          </p>
        </div>
      </template>

      <!-- ================================================================== ALL RUNS -->
      <template v-else>
        <p class="text-[11px] text-indigo-900/80 leading-relaxed">
          Every run on the board. A result sent more than once shows once, with how many times it was sent; open it to
          see each copy and its CSV. Look-alike runs (same route and save) are tagged with how they differ. A run sent
          under a player's name without their code since codes began is tagged
          <span class="font-semibold">no code</span>. Plan length counts from each run's own start, so it shrinks every
          day a plan is run again. Compare finish dates instead. A route's length on someone else's account says little
          about yours until you press <span class="font-semibold">Use</span>.
        </p>
        <p v-if="!runLines.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
          No runs to {{ target }} yet.
        </p>
        <p v-else-if="narrow && runEdges.right && !runEdges.left" class="-mb-2 text-right text-[10px] text-slate-400">
          Swipe the table for more columns →
        </p>
        <!-- A size container for the opened run's detail, as in Race. On a phone the route sits under
             the name and Finishes comes next, so the finish is on screen without scrolling. -->
        <div v-if="runLines.length" class="relative">
          <div
            :ref="runEdges.bind"
            class="overflow-x-auto [container-type:inline-size]"
            @scroll.passive="runEdges.update"
          >
            <table class="w-full text-xs">
              <thead>
                <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-left whitespace-nowrap">
                  <th class="py-2 pr-3"></th>
                  <th v-for="c in shownColumns" :key="c.key" class="py-2 pr-3" :class="c.right ? 'text-right' : ''">
                    <button
                      type="button"
                      class="uppercase tracking-widest hover:text-slate-700 whitespace-nowrap"
                      :title="c.title"
                      :class="sortKey === c.key ? 'text-slate-700' : ''"
                      :aria-sort="sortKey === c.key ? (sortAsc ? 'ascending' : 'descending') : 'none'"
                      @click="sortBy(c.key)"
                    >
                      {{ narrow && c.key === 'nickname' ? 'Who · route' : c.label
                      }}<span v-if="sortKey === c.key">{{ sortAsc ? ' ▲' : ' ▼' }}</span>
                    </button>
                  </th>
                  <th class="py-2"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="line in sortedLines" :key="line.key">
                  <tr class="border-t border-slate-100" :class="narrow ? 'align-top' : ''">
                    <td class="py-2 pr-3">
                      <button
                        type="button"
                        class="text-slate-400 hover:text-indigo-700"
                        :aria-expanded="open === line.key"
                        :aria-label="`Show what ${line.row.chain.join(' ')} was simulated with`"
                        @click="open = open === line.key ? '' : line.key"
                      >
                        {{ open === line.key ? '⌄' : '›' }}
                      </button>
                    </td>
                    <template v-for="c in shownColumns" :key="c.key">
                      <!-- Capped: the name box doubles as a note field, and a long note pushed every
                           other column off screen. The whole name is in the tooltip. -->
                      <td
                        v-if="c.key === 'nickname'"
                        class="py-2 pr-3 font-bold text-slate-700 cursor-pointer"
                        :title="line.nickname || undefined"
                        data-testid="row-open-name"
                        @click="onRowClick($event, () => (open = open === line.key ? '' : line.key))"
                      >
                        <span class="block max-w-[8rem] truncate whitespace-nowrap">{{
                          line.nickname || 'anonymous'
                        }}</span>
                        <!-- The run's note, if it has one: one capped line, the whole note in its tooltip and in
                             the run's detail. Text interpolation, so it is always escaped. -->
                        <span
                          v-if="line.row.note"
                          class="block max-w-[12rem] truncate whitespace-nowrap text-[10px] font-normal text-slate-500"
                          :title="line.row.note"
                          >{{ line.row.note }}</span
                        >
                        <div v-if="narrow" class="mt-0.5 max-w-[10rem] font-normal leading-snug">
                          <span class="font-mono text-slate-600">{{ line.row.chain.join(' ') }}</span>
                          <span
                            v-for="chip in line.chips"
                            :key="chip.text"
                            class="ml-1 inline-block px-1 rounded text-[9px] font-black"
                            :class="chip.cls"
                            :title="chip.title"
                            >{{ chip.text }}</span
                          >
                        </div>
                      </td>
                      <!-- A route of up to nine checkpoints stays on one line; a longer one (a
                           15-checkpoint sweep result) wraps rather than widening the table. The chips
                           after it wrap under it when the table would not fit otherwise. -->
                      <td
                        v-else-if="c.key === 'chain'"
                        class="py-2 pr-3 cursor-pointer"
                        @click="onRowClick($event, () => (open = open === line.key ? '' : line.key))"
                      >
                        <span
                          class="font-mono font-bold text-slate-700"
                          :class="
                            line.row.chain.length > 9
                              ? 'inline-block max-w-[16rem] whitespace-normal'
                              : 'whitespace-nowrap'
                          "
                          >{{ line.row.chain.join(' ') }}</span
                        >
                        <span
                          v-for="chip in line.chips"
                          :key="chip.text"
                          class="ml-1.5 inline-block whitespace-nowrap px-1 rounded text-[9px] font-black"
                          :class="chip.cls"
                          :title="chip.title"
                          >{{ chip.text }}</span
                        >
                      </td>
                      <td v-else-if="c.key === 'ascensions'" class="py-2 pr-3 text-right text-slate-600 font-bold">
                        {{ line.row.ascensions ?? '—' }}
                      </td>
                      <td
                        v-else-if="c.key === 'durationDays'"
                        class="py-2 pr-3 text-right text-slate-700 font-bold whitespace-nowrap"
                      >
                        {{ Number.isFinite(line.row.durationDays) ? line.row.durationDays.toFixed(3) : '—' }}
                      </td>
                      <td
                        v-else-if="c.key === 'finish'"
                        class="py-2 pr-3 whitespace-nowrap"
                        :class="narrow ? 'text-slate-700 font-bold' : 'text-slate-500'"
                        :title="finishTitle(line.finish, line.row.timezone)"
                      >
                        {{ finishDateText(line.finish, viewZone) }}
                        <SimChip :stamp="line.row.simVersion" />
                      </td>
                      <td v-else-if="c.key === 'waitingHours'" class="py-2 pr-3 text-right whitespace-nowrap">
                        <!-- null is "not recorded", not "free": a chain replayed from a saved search
                             kept no per-leg detail, and printing 0 would be a claim nobody measured. -->
                        <span v-if="line.row.waitingHours == null" class="text-slate-400">—</span>
                        <span v-else-if="line.row.waitingHours < 0.05" class="text-slate-400">none</span>
                        <span v-else class="font-bold text-amber-700">{{ line.row.waitingHours.toFixed(1) }} h</span>
                      </td>
                      <td
                        v-else-if="c.key === 'window'"
                        class="py-2 pr-3 text-slate-400 whitespace-nowrap"
                        :title="line.row.window || undefined"
                      >
                        {{ scheduleText(line.row.window) }}
                      </td>
                      <!-- A proof is not an effort tier. Insane mode does not use the effort knob, so
                           the tier it sends is whatever the main panel was left on; showing "balanced"
                           next to an exhaustive result reads as a weaker claim than the row is making.
                           `space` is present only on schema-4 Insane rows, so older rows are untouched. -->
                      <td v-else-if="c.key === 'effort'" class="py-2 pr-3 text-slate-400">
                        <span
                          v-if="line.row.space"
                          class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white"
                          :class="line.row.space.stoppedEarly ? 'bg-amber-600' : 'bg-indigo-600'"
                        >
                          {{ foundByText(line.row) }}
                        </span>
                        <span v-else>{{ effortCell(line.row) }}</span>
                      </td>
                      <td
                        v-else-if="c.key === 'submittedAt'"
                        class="py-2 pr-3 text-slate-400 whitespace-nowrap"
                        :title="sentTitle(line.submittedAt)"
                      >
                        {{ sentText(line.submittedAt) }}
                      </td>
                    </template>
                    <td class="py-2 text-right">
                      <button
                        type="button"
                        class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                        @click="emit('use', line.row.chain)"
                      >
                        Use
                      </button>
                      <FollowButton v-if="followableRow(line.row)" class="ml-1" :chain="line.row.chain" :goal-key="boardGoalKey(line.row)" from="board" />
                    </td>
                  </tr>
                  <tr v-if="open === line.key" class="bg-slate-50">
                    <td :colspan="shownColumns.length + 2" class="p-0">
                      <div class="sticky left-0 w-[100cqw] px-3 py-3">
                        <LeaderboardRunDetail
                          :row="line.row"
                          :copies="line.copyRows"
                          :csv-root="csvRoot"
                          :view-zone="viewZone"
                        />
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div
            v-if="runEdges.left"
            class="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-slate-400/25 to-transparent"
          ></div>
          <div
            v-if="runEdges.right"
            class="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-slate-400/25 to-transparent"
          ></div>
        </div>
      </template>

      <p v-if="capped && boardView" class="text-[10px] text-amber-800">
        The collector sent its maximum of {{ plural(ALL_CAP, 'run') }}, so the oldest or slowest runs may be missing.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import FollowButton from '../FollowButton.vue';
import { boardGoalKey, followableRow } from '@/lib/follow';
import { plural } from '@/lib/format';
import { onRowClick } from '@/lib/rowClick';
import { COMPARE_VIEWS, DEFAULT_ROUTE, NAMES, hashFor, type CompareView } from '@/lib/siteNav';
import { useUIStore } from '@/stores/ui';
import { safeAsyncComponent } from '@/lib/import';
import { plainError } from '@/lib/plainError';
import { computed, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { sortRows, type SortKey, type SortableRow } from '@/lib/leaderboardSort';
import {
  accountKeyOf,
  browserCount,
  buildDeadlineBoard,
  buildMyPlans,
  buildRace,
  contentFingerprint,
  daysLeftPhrase,
  daysLeftText,
  finishDateText,
  finishMs,
  fileRows,
  finishTitle,
  foldCopies,
  formatDate,
  foundByText,
  hiddenRuns,
  publicRows,
  isDeadlineRow,
  isNoCodeLine,
  localZone,
  placeFor,
  plannedText,
  provisionalTag,
  PROVISIONAL_TITLE,
  scheduleText,
  settingTagTitle,
  settingTags,
  viewerTag,
  whoText,
  type BoardRow,
  type Plan,
  type PlayerPlans,
  type RaceEntry,
  type ViewerTag,
} from '@/lib/leaderboardRank';
import { isMyRun, myRunsCount } from '@/lib/myRuns';
import { rememberKey, rememberedKeys } from '@/lib/myKeys';
import { useAccountNames, useSharedName } from '@/composables/useShareResult';
import { saveTEOf } from '@/lib/saveFreshness';
import { virtueInventory } from '@/search/csv';
import { bestPerFamily, keepVirtueArtifacts } from '@/search/submission';
import { existingOwnerToken } from '@/search/owner';
import {
  BoardReadError,
  boardErrorText,
  fetchAllRows,
  fetchMineRows,
  lookAlikeFor,
  mergeMine,
  rememberAll,
  type BoardReadKind,
} from '@/search/myBoardRows';
import { csvFileName, fetchOwnCsv, setRunsHidden, type HideResult, type HideTarget } from '@/search/hideRuns';
import {
  HIDE_CONTROL,
  hiddenIdSet,
  hideStatus,
  markHidden,
  settleHidden,
  withHidden,
  type HideStatus,
} from '@/lib/hiddenRuns';
import { hashID } from '@/lib/storage/db';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import LeaderboardPlanList from './LeaderboardPlanList.vue';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';
import { BOARD_ROWS } from '@/lib/instantBaseline';
import MyRunsList from './MyRunsList.vue';
import MyRunsMissing from './MyRunsMissing.vue';
import SimChip from './SimChip.vue';
import { bySimToggle, hiddenSimText, useShowOlderSims } from '@/composables/useShowOlderSims';

/** Insights: the Explorer's charts and their chart library load only when that tab opens. */
const ChainExplorer = safeAsyncComponent(() => import('@/explorer/ChainExplorer.vue'));

const props = defineProps<{
  /** The account whose owner code asks GET /mine for "my" rows. Only its hash is used, as the
   *  storage key the code is kept under; the id itself never leaves the browser. */
  playerId?: string;
  /** 'myruns': My runs' "Your runs on the board" (MyRunsView.vue), the viewer's own runs of every kind
   *  without Compare's tabs. Compare's views otherwise. */
  mode?: 'compare' | 'myruns';
}>();
const emit = defineEmits<{
  use: [chain: number[]];
  /** My runs only: how many of the viewer's runs are on the board, null until the first load is in. */
  count: [n: number | null];
  /** My runs only: those runs themselves (for its summary, MyRunsDashboard), null until the first load is in. */
  rows: [rows: BoardRow[] | null];
  /** My runs mode: every public row already loaded (your hidden ones left out), for "where you stand" on the
   *  Right now page (lib/standing.ts). Null until the first load is in. */
  board: [rows: BoardRow[] | null];
  /** My runs mode: why the last /all read failed, or null when it answered (so "none yet" is never said for a
   *  board that could not be read). */
  failed: [kind: BoardReadKind | null];
}>();
const myRunsMode = computed(() => props.mode === 'myruns');

/** The collector's row shape (lib/leaderboardRank.ts). Loose on purpose: this reads a public
 *  endpoint that may be a version ahead or behind, and a missing field should render a dash. */
type Row = BoardRow;

type Tab = CompareView;
/** Egg Day first (the user, 29 Sep): the one date everyone is aiming at. Insights last. */
const TABS: Tab[] = COMPARE_VIEWS;
/** How many rows an OLD collector's `GET /all` listed at most. The current one serves its whole
 *  snapshot, uncapped, and says so by carrying `builtAt`; only an answer without it is checked. */
const ALL_CAP = 1000;
/** How long one /all read waits (search/myBoardRows.ts `withBoardTimeout`): the whole board, a few MB on a slow
 *  phone, so twice Light's 10 s. A collector that never answers used to leave the board on "loading" for good. */
const ALL_TIMEOUT_MS = 20_000;
/** "Near me" means a best plan that starts within this many TE of the loaded save. */
const NEAR_TE = 20;

const store = useChainSearchStore();
const initialState = useInitialStateStore();
const planner = useAutoPlannerStore();

const root = computed(() => store.leaderboardUrl.replace(/\/$/, ''));

const csvRoot = computed(() => `${root.value}/csv`);

/** The open view, which the page address follows (#/compare/<view>, lib/siteNav.ts). */
const ui = useUIStore();
const tab = computed<Tab>({
  get: () => ui.compareView,
  set: v => (ui.compareView = v),
});
/** The views that read the collector's board (not Insights, which loads its own, nor Your latest run's line). */
function isBoardView(t: Tab): boolean {
  return t !== 'insights' && t !== 'latest';
}
/** Your latest run's tab: one line to My runs, where its block is. */
const MY_RUNS_HASH = hashFor({ ...DEFAULT_ROUTE, section: 'myruns' });
/** My runs always reads the board. */
const boardView = computed(() => myRunsMode.value || isBoardView(tab.value));
const allRows = ref<Row[]>([]);
const loading = ref(false);
/** The first load has answered (or failed): My runs folds an empty part only then. */
const loadedOnce = ref(false);
const error = ref('');
/** Why the last load failed (null when it answered). */
const failedKind = ref<BoardReadKind | null>(null);
watch(failedKind, k => myRunsMode.value && emit('failed', k));
/** True when the collector's list hit its cap, so some runs may be missing. */
const capped = ref(false);
/** The clock every "days left" is counted on. Set at each load, so the numbers agree with each other. */
const now = ref(Date.now());
/** Every finish date and "days left" is shown in the viewer's own timezone: one calendar for the
 *  whole board, so a list sorted by finish reads in date order. The player's own zone is in the
 *  date's tooltip. */
const viewZone = localZone();
/** Defaults to the target this player is actually searching for -- the board is only useful
 *  against comparable runs, and "all" mixes 490s with 300s. */
const final = ref(String(store.finalTE ?? ''));
const target = computed(() => (final.value ? Number(final.value) : null));
const nearMe = ref(false);
const openPlayers = ref<Record<string, boolean>>({});
const open = ref('');

// ------------------------------------------------------------------------------- phone layout

/** Below Tailwind's `sm`: the tables put the route under the name so the finish is on screen. */
const NARROW_QUERY = '(max-width: 639px)';
const narrowQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(NARROW_QUERY) : null;
const narrow = ref(!!narrowQuery?.matches);
function onNarrow(e: MediaQueryListEvent): void {
  narrow.value = e.matches;
}
onMounted(() => narrowQuery?.addEventListener('change', onNarrow));
onUnmounted(() => narrowQuery?.removeEventListener('change', onNarrow));

/**
 * Whether a sideways-scrolling table has more beyond its left or right edge, for the shadow on that
 * edge and the "swipe" hint: on a phone the scroll bar is hidden until touched, and columns past the
 * edge read as missing (review, 2026-09-27). `bind` is the scroller's function ref.
 */
function scrollEdges() {
  let el: HTMLElement | null = null;
  let watcher: ResizeObserver | null = null;
  const edges = reactive({
    left: false,
    right: false,
    update(): void {
      edges.left = !!el && el.scrollLeft > 2;
      edges.right = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    },
    bind(target: unknown): void {
      const next = target instanceof HTMLElement ? target : null;
      if (next === el) return;
      watcher?.disconnect();
      el = next;
      if (el && typeof ResizeObserver !== 'undefined') {
        watcher = new ResizeObserver(() => edges.update());
        watcher.observe(el);
        if (el.firstElementChild) watcher.observe(el.firstElementChild);
      }
      edges.update();
    },
  });
  return edges;
}
const raceEdges = scrollEdges();
const runEdges = scrollEdges();

function tabLabel(t: Tab): string {
  if (t === 'race') return target.value == null ? 'Race' : `Race to ${target.value}`;
  if (t === 'dates') return 'By a date';
  if (t === 'eggday') return `Egg Day ${eggDayYear}`;
  if (t === 'insights') return NAMES.insights;
  if (t === 'latest') return NAMES.latest;
  return 'All runs';
}

/** Target-TE options, from what has actually been submitted plus the player's own target. */
const targets = computed(() => {
  // Not a deadline answer's last stop: those are ranked by date on their own tab, and a target of
  // 307 because someone reached 307 by Egg Day is not a finish line anybody is racing to.
  const seen = new Set(
    shownRows.value
      .filter(r => !isDeadlineRow(r))
      .map(r => r.finalTE)
      .filter(v => Number.isFinite(v))
  );
  if (store.finalTE) seen.add(store.finalTE);
  return [...seen].sort((a, b) => a - b);
});

// ----------------------------------------------------------------------------- the viewer

/**
 * The loaded save's account, the same "timezone + best artifact per family" string a submission
 * from it carries (search/submission.ts builds `artifacts` exactly this way). Null with no save.
 */
const myKey = computed(() => {
  const raw = initialState.rawBackup;
  if (!raw) return null;
  const labels = bestPerFamily(keepVirtueArtifacts(virtueInventory(raw).artifacts)).map(a => a.label);
  const timezone = planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return accountKeyOf({ timezone, artifacts: labels });
});

/** The loaded account's partition hash (lib/storage/db.ts `hashID`), '' with none: what lib/myKeys.ts keys by. */
const partition = ref('');
watch(
  () => props.playerId?.trim() ?? '',
  async id => {
    const p = id ? await hashID(id).catch(() => '') : '';
    if ((props.playerId?.trim() ?? '') === id) partition.value = p;
  },
  { immediate: true }
);
/**
 * The account keys this browser remembered for the account (lib/myKeys.ts), the save's own added
 * whenever one is loaded -- only a save of this very account, never the one left over from the last.
 */
const keptKeys = ref<string[]>([]);
watch(
  [partition, myKey],
  ([p, key]) => {
    const raw = initialState.rawBackup as { eiUserId?: string | null } | null;
    const own = !!key && !!raw?.eiUserId && raw.eiUserId.toLowerCase() === (props.playerId ?? '').trim().toLowerCase();
    keptKeys.value = !p ? [] : own ? rememberKey(p, key as string) : rememberedKeys(p);
  },
  { immediate: true }
);
/** The names this account sends under (its own, the one it credits runs to here; /mine's rows' are added
 *  by `lookAlikeFor`). */
const accountNames = useAccountNames(() => props.playerId ?? '');
/** The loaded save's own in-game name, only when the save is this account's (never the last account's). */
const saveName = computed(() => {
  const raw = initialState.rawBackup as { eiUserId?: string | null; userName?: string | null } | null;
  const own = !!raw?.eiUserId && raw.eiUserId.toLowerCase() === (props.playerId ?? '').trim().toLowerCase();
  return own ? (raw?.userName ?? '') : '';
});
const sharedName = useSharedName(() => props.playerId ?? '');
/** What My runs' look-alike match and its "isn't here?" answer read (search/myBoardRows.ts `lookAlikeFor`,
 *  which Light reads too): every key that is the viewer's -- the save's, the remembered ones, /mine's
 *  rows' -- and the account's names; no look-alikes without a save. */
const lookAlike = computed(() =>
  lookAlikeFor({
    saveKey: myKey.value,
    remembered: keptKeys.value,
    mine: mineRows.value,
    names: [...accountNames.value, saveName.value, sharedName.get()],
    viewerTE: myTE.value,
  })
);

/** The save's own TE, for "near me". */
/** The save's own TE, for "near me" and the look-alike TE rule: read from the save itself, never from a restored
 *  Manual draft's stores (which held the TE of whenever that plan was made: 159 for a save at 191, fix 20). */
const myTE = computed(() => saveTEOf(initialState.rawBackup));

/**
 * The viewer's own rows, from GET /mine: sent with this browser's code for the loaded account,
 * anonymous ones included, each marked `yours`. Null when that cannot be asked -- no account, no code
 * yet (nothing sent from this browser), or a collector from before /mine.
 */
const mineRows = ref<Row[] | null>(null);
/** This site in this browser holds a code for the loaded account (so /mine could be asked at all). */
const hasCode = ref(false);
const mineIds = computed(() => new Set((mineRows.value ?? []).map(r => r.id).filter((x): x is string => !!x)));
const myAccts = computed(() => new Set((mineRows.value ?? []).map(r => r.acct).filter((x): x is string => !!x)));

// ------------------------------------------------------------------ hidden from the public
//
// A player can take their own runs off the public board and put them back (collector POST /hide,
// search/hideRuns.ts; the rules and the optimistic update are lib/hiddenRuns.ts). /all drops a hidden
// run by itself, but another edge can serve its cached /all for up to a minute, so every public view
// here reads `shownRows`: /all without the runs this board knows are hidden. Hidden runs reach only
// My plans' own "Hidden from the public" list; `rankable` in lib/leaderboardRank.ts keeps them out of
// every race, rank, My plans best and re-check, and `buildDeadlineBoard` out of By a date.

/** Runs the board hid or showed itself this visit, which win over /mine (see lib/hiddenRuns.ts). */
const hideOverrides = ref<Map<string, boolean>>(new Map());
/** Runs with a hide or show call out. */
const hideBusy = ref<Set<string>>(new Set());
/** "Hide all" / "Show all again" is out. */
const hideAllBusy = ref(false);
/** What the last hide or show (or a hidden run's CSV) came to, said once above the board. */
const hideMsg = ref<HideStatus | null>(null);

/** The viewer's runs hidden from the public right now. */
const hiddenIds = computed(() => hiddenIdSet(mineRows.value, hideOverrides.value));
/** /mine's rows with `hidden` as the board knows it now. */
const mineNow = computed<Row[]>(() => withHidden(mineRows.value ?? [], hiddenIds.value));
/** Every public view's rows: /all without the viewer's hidden runs, and on the Leaderboard tab without other
 *  simulators' runs when "Show runs from older simulators" is off (My runs always shows them). */
const publicShown = computed<Row[]>(() => publicRows(allRows.value, hiddenIds.value));
const showOlder = useShowOlderSims();
const shownRows = computed<Row[]>(() =>
  myRunsMode.value ? publicShown.value : bySimToggle(publicShown.value, showOlder.value)
);
/** "12 runs from older simulators are hidden", or ''. */
const simHidden = computed(() => hiddenSimText(publicShown.value.length - shownRows.value.length));

/** Every row, with the viewer's marked `yours`, plus any of theirs /all does not show yet (it is
 *  cached for a minute at the edge; /mine is not), hidden ones included and marked `hidden`: only My
 *  plans reads this, and `rankable` keeps the hidden ones out of its ranking. */
const mergedRows = computed<Row[]>(() => {
  const mine = mineNow.value;
  return mine.length ? mergeMine(shownRows.value, mine) : shownRows.value;
});

/** The viewer's runs hidden from the public, any target, newest sent first (My plans lists them). */
const myHidden = computed(() => hiddenRuns(mergedRows.value));
/** How many of the viewer's runs are still public, for "Hide all my runs from the public". */
const myPublicCount = computed(() => mineNow.value.filter(r => !r.hidden).length);
/** The hidden run whose details are open in My plans. */
const openHidden = ref('');

/** The code this browser holds for the loaded account (never minted here), or null. */
async function ownerCode(): Promise<string | null> {
  const id = props.playerId?.trim();
  if (!id) return null;
  try {
    return existingOwnerToken(await hashID(id));
  } catch {
    return null;
  }
}

/** Every round of `all` at most: 50 runs a round, and the collector's rate gate is 10 a minute. */
const HIDE_ALL_ROUNDS = 4;

/**
 * Hide (`hidden: true`) or show again the viewer's runs: marked at once, put back if the call fails,
 * then /mine read again. /all is not: it may lag a minute at other edges, and `shownRows` already
 * leaves the run out.
 */
async function changeHidden(target: HideTarget, hidden: boolean): Promise<void> {
  const all = 'all' in target;
  const ids = all
    ? mineNow.value.filter(r => !!r.hidden !== hidden && r.id).map(r => r.id as string)
    : [...new Set(target.ids)].filter(id => mineIds.value.has(id));
  if (!all && !ids.length) return;
  if (hideAllBusy.value || ids.some(id => hideBusy.value.has(id))) return;
  const { next, previous } = markHidden(hideOverrides.value, ids, hidden);
  hideOverrides.value = next;
  hideBusy.value = new Set([...hideBusy.value, ...ids]);
  if (all) hideAllBusy.value = true;
  hideMsg.value = null;
  const token = await ownerCode();
  let last: HideResult;
  const done: string[] = [];
  const missing: string[] = [];
  let rounds = 0;
  do {
    last = await setRunsHidden({ base: root.value, token, target: all ? { all: true } : { ids }, hidden });
    if (last.kind === 'ok') {
      done.push(...last.reply.ids);
      missing.push(...(last.reply.missing ?? []));
    }
    rounds++;
  } while (all && last.kind === 'ok' && last.reply.more && rounds < HIDE_ALL_ROUNDS);
  // Every round that worked counts, even when a later one did not.
  const settled: HideResult =
    last.kind === 'ok' || done.length
      ? {
          kind: 'ok',
          reply: {
            ok: true,
            hidden,
            ids: done,
            changed: [],
            ...(missing.length ? { missing } : {}),
            ...(last.kind === 'ok' && last.reply.more ? { more: true } : {}),
          },
        }
      : last;
  hideOverrides.value = settleHidden(hideOverrides.value, previous, hidden, settled);
  hideMsg.value = hideStatus(last.kind === 'ok' ? settled : last, hidden, { all });
  const still = new Set(hideBusy.value);
  for (const id of ids) still.delete(id);
  hideBusy.value = still;
  if (all) hideAllBusy.value = false;
  if (done.length) {
    const fresh = await fetchMine();
    if (fresh) mineRows.value = fresh;
  }
}

/** Save the viewer's own hidden run's CSV, fetched with the code (its plain link answers 403). */
async function downloadOwnCsv(id: string): Promise<void> {
  try {
    const blob = await fetchOwnCsv({ base: root.value, id, token: await ownerCode() });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName(id);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    hideMsg.value = { text: plainError(e, "Couldn't download that run's CSV. Try again."), tone: 'error' };
  }
}

// Every row this page holds, for an opened run's comparison with its player's instant baseline (lib/instantBaseline.ts).
provide(
  BOARD_ROWS,
  computed(() => [...allRows.value, ...(mineRows.value ?? [])])
);
provide(HIDE_CONTROL, {
  isMine: id => !!id && mineIds.value.has(id),
  isHidden: id => !!id && hiddenIds.value.has(id),
  isBusy: id => hideAllBusy.value || (!!id && hideBusy.value.has(id)),
  setHidden: (ids, hidden) => changeHidden({ ids }, hidden),
  downloadCsv: downloadOwnCsv,
});

/** The status line's colours. */
function hideMsgClass(m: HideStatus): string {
  if (m.tone === 'error') return 'border-red-200 bg-red-50 text-red-800';
  if (m.tone === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-slate-200 bg-white text-slate-700';
}

/**
 * Race lines that are provably the viewer's: an owner line whose tag /mine returned, or a line holding
 * one of the rows /mine returned. Null when /mine could not be asked.
 */
const exactMe = computed<Set<string> | null>(() => {
  if (!mineRows.value) return null;
  const ids = mineIds.value;
  const accts = myAccts.value;
  const keys = new Set<string>();
  for (const e of race.value?.entries ?? []) {
    // A line joined from several browsers is the viewer's when any of them is this one.
    const owned = e.lines.some(k => k.startsWith('acct:') && accts.has(k.slice('acct:'.length)));
    if (owned || e.plans.some(p => p.folded.copies.some(c => !!c.id && ids.has(c.id)))) keys.add(e.key);
  }
  return keys;
});

/**
 * Is this race line the viewer's? 'you' only when /mine says so. Otherwise a look-alike guess (the loaded
 * save's timezone and artifacts), and only 'maybe': never for a line that carries an owner code, and
 * never for one that started from a higher TE than this save (see `viewerTag`).
 */
function whoIs(e: RaceEntry): ViewerTag {
  return viewerTag(e, exactMe.value, myKey.value, myTE.value);
}
function isMe(e: RaceEntry): boolean {
  return whoIs(e) === 'you';
}

// ------------------------------------------------------------------------------------ race

// Reasons are dated on the viewer's calendar, like the Planned and Finishes cells beside them.
const race = computed(() =>
  target.value == null ? null : buildRace(shownRows.value, { target: target.value, now: now.value, zone: viewZone })
);

/** Settings words for a race line whose best plan has a look-alike among the player's plans. */
const raceTags = computed(() => {
  const out = new Map<string, string[]>();
  for (const e of race.value?.entries ?? []) {
    const tags = settingTags(
      shownPlans(e).map(p => p.row),
      viewZone
    ).get(e.best.row);
    if (tags) out.set(e.key, tags);
  }
  return out;
});

const raceShown = computed(() => {
  const entries = race.value?.entries ?? [];
  if (!nearMe.value || myTE.value <= 0) return entries;
  return entries.filter(
    e => typeof e.best.row.currentTE === 'number' && Math.abs(e.best.row.currentTE - myTE.value) <= NEAR_TE
  );
});

/**
 * The plans a line shows as rows of their own -- its best, the others listed, and those not counted --
 * which are what the look-alike tags tell apart. A re-send listed under another plan (`resends`) or a
 * run a newer one re-measured (in its `earlier`) is not a row, so not a look-alike either.
 */
function shownPlans(line: Pick<PlayerPlans, 'best' | 'listed' | 'dropped'>): Plan[] {
  return [...(line.best ? [line.best] : []), ...line.listed, ...line.dropped];
}

/** What "Tried" counted: from how many browsers, and how many plans were sent without the code. */
function triedTitle(e: RaceEntry): string {
  const sent = `${e.sends} ${e.sends === 1 ? 'run' : 'runs'} sent`;
  const browsers = browserCount(e);
  const from =
    browsers > 1
      ? `, from ${browsers} browsers (each keeps its own code; they agree on name, timezone, artifacts and TE)`
      : '';
  const codeless = e.noCode?.size ?? 0;
  const noCode = codeless
    ? ` That includes ${codeless} ${codeless === 1 ? 'plan' : 'plans'} sent under this name without the owner code, tagged "no code". Those are listed and counted, but never set this line's finish or place.`
    : '';
  return `${sent}${from}. Each plan counts once, however often it was run or sent.${noCode}`;
}

// ----------------------------------------------------------------------- the viewer's own runs

/** The viewer's best plan to the race's target (lib/leaderboardRank.ts `buildMyPlans`), for the line
 *  above the race that says where it would place. */
const mine = computed(() =>
  (myKey.value || mineRows.value?.length) && target.value != null
    ? buildMyPlans(mergedRows.value, myKey.value, { target: target.value, now: now.value, zone: viewZone })
    : null
);

/**
 * My runs' rows (mode "myruns"): every run of the viewer's on the board, any kind and target, the ones
 * hidden from the public included (marked `hidden`), by /mine or by the save's timezone and artifacts
 * (lib/myRuns.ts `isMyRun`). Replaced Compare's My plans, which showed one target's runs only.
 */
const myRunRows = computed<Row[]>(() => {
  if (!myKey.value && !mineRows.value?.length) return [];
  const l = lookAlike.value;
  return mergedRows.value.filter(r => isMyRun(r, l.keys, l.viewerTE, l.names));
});
// How many, for My runs' header and to fold its part when there are none; null until the first load is
// in. One per result, as the list counts them (`myRunsCount`): a result sent twice is one run.
watch(
  () => (myRunsMode.value && loadedOnce.value ? myRunsCount(myRunRows.value) : null),
  n => emit('count', n),
  { immediate: true }
);
// And the rows, for My runs' summary at the top (cards and Next steps); null until the first load is in.
watch(
  () => (myRunsMode.value && loadedOnce.value ? myRunRows.value : null),
  rows => emit('rows', rows),
  { immediate: true }
);
watch(
  () => (myRunsMode.value && loadedOnce.value ? shownRows.value : null),
  rows => emit('board', rows),
  { immediate: true }
);

/**
 * For a viewer with no line in the race: where their best plan would sit if it carried a name. Shown
 * to them alone, above the race.
 */
const anonPlace = computed(() => {
  const r = race.value;
  const best = mine.value?.best;
  if (!r || !best || r.entries.some(isMe)) return '';
  const place = placeFor(r, best.finish);
  if (place == null) return '';
  return `You'd be #${place} of ${r.entries.length + 1} if you added a name: your best plan finishes ${finishDateText(best.finish, viewZone)}. Only you see this line.`;
});

// -------------------------------------------------------------------------------- all runs

interface RunLine extends SortableRow {
  key: string;
  row: Row;
  copies: number;
  /** Every stored copy, so the detail panel can offer each one's CSV. */
  copyRows: Row[];
  foundBy: string[];
  /** The chips after the route: sent more than once, look-alike settings, sent without the code. */
  chips: { text: string; title: string; cls: string }[];
  finish: number | null;
}

/** The Effort column's text for a row that did not sweep a box (`foundByText` in leaderboardRank.ts). */
function effortCell(row: Row): string {
  const t = foundByText(row);
  return t === 'unknown' ? '—' : t;
}

const COLUMNS: { key: SortKey; label: string; right?: boolean; title?: string }[] = [
  { key: 'nickname', label: 'Who' },
  { key: 'chain', label: 'Route' },
  // Short: its values are one digit, and the full word made the table scroll sideways on a desktop.
  { key: 'ascensions', label: 'Asc', right: true, title: 'Ascensions in the route' },
  // Counted from the run's own start, it rewards whoever ran last; the header says so on hover. Spelled
  // out in the header it wrapped onto four lines.
  {
    key: 'durationDays',
    label: 'Plan length',
    right: true,
    title: "Days from the plan's own start, so the same plan run a day later is a day shorter. Compare finishes.",
  },
  // Worked out from the start and the length, never read from the local `endLocal` text, which
  // sorts wrong across timezones.
  { key: 'finish', label: 'Finishes' },
  { key: 'waitingHours', label: 'Waiting', right: true },
  // The same word and the same "any time" as Race and My plans.
  { key: 'window', label: 'Schedule' },
  // Without this, two rows from the same person that differ only by effort tier are
  // indistinguishable -- which is exactly the comparison the board keeps rows for.
  { key: 'effort', label: 'Effort' },
  // Dates matter here in a way they would not on a normal scoreboard: the simulator and the game
  // both change, so a result from two months ago was produced by different code than one from
  // yesterday, and a reader comparing them should be able to see that.
  { key: 'submittedAt', label: 'Sent', title: `When it was first sent, in your timezone (${viewZone})` },
];

// ----------------------------------------------------------------------------- By a date

/** The Egg Day / By a date filters: ascensions, awake hours, time off. */
const dateAsc = ref<number | null>(null);
const dateHours = ref<'awake' | 'any' | null>(null);
const dateOff = ref<'with' | 'without' | null>(null);
/** Ascension counts that answers actually have, for the filter's options. */
const dateAscOptions = computed(() =>
  [...new Set(shownRows.value.filter(r => isDeadlineRow(r)).map(r => r.chain.length))].sort((a, b) => a - b)
);
const dateBoard = computed(() =>
  buildDeadlineBoard(shownRows.value, {
    now: now.value,
    filter: { ascensions: dateAsc.value, hours: dateHours.value, timeOff: dateOff.value },
  })
);
/** The date-board line that is open, if any. */
const openDate = ref('');
function dateKey(deadline: number, e: { key: string; best: Row }): string {
  return `${deadline}|${e.key || 'anon'}|${e.best.id ?? e.best.chain.join(',')}`;
}
const dateFiltered = computed(() => dateAsc.value !== null || dateHours.value !== null || dateOff.value !== null);
/** The next Egg Day (lib/eggDay.ts, the same moment the deadline search's preset sends). */
const eggDayYear = nextEggDayYear();
const eggDayAt = eggDaySeconds(eggDayYear);
/** The tables the open tab shows: the Egg Day one, or every other date. */
const shownDates = computed(() =>
  tab.value === 'eggday'
    ? dateBoard.value.filter(g => g.deadline === eggDayAt)
    : dateBoard.value.filter(g => g.deadline !== eggDayAt)
);
/** A deadline on the viewer's calendar, to the minute (Egg Day is 09:00 Pacific, not a whole day). */
function deadlineText(seconds: number): string {
  return formatDate(seconds * 1000, viewZone, { dateStyle: 'medium', timeStyle: 'short' });
}
function spareText(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 3 * 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} d`;
}

/** A send date on the viewer's calendar, like every other date on the board. */
function sentText(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? formatDate(t, viewZone, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function sentTitle(iso: string | undefined): string | undefined {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? formatDate(t, viewZone, { dateStyle: 'medium', timeStyle: 'short' }) : undefined;
}

/** On a phone Finishes comes right after the name (the route sits under the name), so it is on screen. */
const NARROW_ORDER: SortKey[] = [
  'nickname',
  'finish',
  'durationDays',
  'ascensions',
  'waitingHours',
  'window',
  'effort',
  'submittedAt',
];
const shownColumns = computed(() => (narrow.value ? NARROW_ORDER.map(k => COLUMNS.find(c => c.key === k)!) : COLUMNS));

const NO_CODE_TITLE =
  "Sent under this name since the board began stamping runs, but without the owner code the player's other runs carry. " +
  "Anyone can send a run like this, so in the race it never sets the player's finish or place. It is listed on their " +
  'line tagged "no code", or, if its timezone, artifacts or TE do not fit theirs, on a separate line marked (no code).';

const runLines = computed<RunLine[]>(() => {
  const rows = target.value == null ? shownRows.value : shownRows.value.filter(r => r.finalTE === target.value);
  // Names filed over every row, as the Race does, so both tabs fold the same copies together.
  const filing = fileRows(shownRows.value);
  const folded = foldCopies(rows, filing);
  const tags = settingTags(
    folded.map(f => f.row),
    viewZone
  );
  return folded.map(f => ({
    key: f.row.id ?? contentFingerprint(f.row),
    row: f.row,
    copies: f.copies.length,
    copyRows: f.copies,
    foundBy: f.foundBy,
    chips: [
      ...(f.copies.length > 1
        ? [
            {
              text: `sent ×${f.copies.length}`,
              title: `The same result was sent ${f.copies.length} times. Found by: ${f.foundBy.join(', ')}. Open the line for each copy and its CSV.`,
              cls: 'bg-slate-200 text-slate-600',
            },
          ]
        : []),
      ...(tags.get(f.row) ?? []).map(t => ({ text: t, title: settingTagTitle(t), cls: 'bg-sky-100 text-sky-800' })),
      ...(provisionalTag(f.row)
        ? [{ text: provisionalTag(f.row), title: PROVISIONAL_TITLE, cls: 'bg-amber-50 text-amber-800' }]
        : []),
      ...(isNoCodeLine(filing, f.player)
        ? [{ text: 'no code', title: NO_CODE_TITLE, cls: 'bg-indigo-100 text-indigo-800' }]
        : []),
      ...(isDeadlineRow(f.row)
        ? [
            {
              text: `by ${deadlineText(f.row.deadline as number)}`,
              title:
                'A "highest TE by a date" answer: Egg Day answers are on the Egg Day tab, other dates on By a date.',
              cls: 'bg-rose-100 text-rose-800',
            },
          ]
        : []),
    ],
    nickname: whoText(f.row) || undefined,
    chain: f.row.chain,
    ascensions: f.row.ascensions,
    durationDays: f.row.durationDays,
    waitingHours: f.row.waitingHours,
    window: f.row.window,
    effort: f.row.space ? foundByText(f.row) : f.row.effort,
    // When the result first appeared: the earliest copy.
    submittedAt: f.copies[0]?.submittedAt ?? f.row.submittedAt,
    finish: finishMs(f.row),
  }));
});

/** Newest first: the question All runs answers is "what has been sent". Clicking a header re-sorts
 *  in the browser; nothing is refetched. */
const sortKey = ref<SortKey>('submittedAt');
const sortAsc = ref(false);

function sortBy(key: SortKey): void {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value;
  else {
    sortKey.value = key;
    // Numbers read best smallest-first here (fewest days, soonest finish, least waiting); text
    // reads best A-Z; a send date reads best newest-first.
    sortAsc.value = key !== 'submittedAt';
  }
}

const sortedLines = computed(() => sortRows(runLines.value, sortKey.value, sortAsc.value));

// ------------------------------------------------------------------------------------ load

/**
 * The viewer's rows from GET /mine, or null (see `mineRows`). Uses the code this browser already
 * keeps for the account and never mints one: an account never sent for has nothing to find. Never
 * throws, so a collector without /mine leaves the board exactly as it was.
 */
async function fetchMine(): Promise<Row[] | null> {
  try {
    const token = await ownerCode();
    hasCode.value = !!token;
    if (!token) return null;
    return await fetchMineRows(root.value, token);
  } catch {
    return null;
  }
}

/**
 * One `/all` read. `cut`: the answer may be missing rows -- an old collector's list stopped at
 * ALL_CAP. The current collector sends every row with its snapshot's `builtAt`, so a board of a
 * thousand runs or more is not taken for a truncated one (which used to cost an extra request and a
 * false "runs may be missing" on every load, and a reload on every target change).
 *
 * Never from the browser's cache: Refresh, and the reload after a send or a rename, must show the
 * board as it is now (the collector says `no-cache` too; this covers one that does not).
 */
async function fetchAll(query: string): Promise<{ rows: Row[]; cut: boolean }> {
  return fetchAllRows(root.value, query, { cap: ALL_CAP, timeoutMs: ALL_TIMEOUT_MS });
}

/**
 * Every run, from `/all`. Not `/leaderboard`: that reads only the fastest `limit x 4` plan lengths
 * and folds a name's re-runs together, which hides exactly the rows the race needs -- a newer run
 * of the same plan that finishes later, the run that shows a player behind their plan, runs to
 * other targets that show where an account really is.
 */
async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  // In parallel with /all, and never able to fail the board.
  const mine = fetchMine();
  try {
    let { rows, cut } = await fetchAll('');
    // An old collector's list is in key order -- target, then plan length -- so past its cap the
    // chosen target can be cut short. Ask for it on its own as well.
    if (cut && target.value != null) {
      const more = await fetchAll(`?final=${encodeURIComponent(String(target.value))}`);
      const seen = new Set(rows.map(r => r.id));
      rows = [...rows, ...more.rows.filter(r => !r.id || !seen.has(r.id))];
      cut = more.cut;
    }
    allRows.value = rows;
    capped.value = cut;
    // Light (StrongerCheck.vue) reads the viewer's runs from this for a minute (search/myBoardRows.ts).
    if (!cut) rememberAll(root.value, rows);
    now.value = Date.now();
    failedKind.value = null;
  } catch (e) {
    // Plain words and a Retry, never the error itself (QA break-it #3, #4; the Words audit's R1).
    console.error('The leaderboard did not load:', e);
    failedKind.value = e instanceof BoardReadError ? e.kind : 'read';
    error.value = boardErrorText(failedKind.value, myRunsMode.value ? 'myruns' : 'compare');
    allRows.value = [];
  } finally {
    mineRows.value = await mine;
    loading.value = false;
    loadedOnce.value = true;
  }
}

// Another account loaded: its own rows, not the last one's.
watch(
  () => props.playerId,
  async () => {
    hideMsg.value = null;
    openHidden.value = '';
    mineRows.value = await fetchMine();
  }
);

// Everything is already in hand, so a new target is a re-sort -- unless the list was cut short.
watch(final, () => {
  open.value = '';
  if (capped.value) void load();
});

// Not while Insights is open (the Explorer there fetches the runs itself), nor Your latest run. The board loads the first
// time one of its own views is shown.
onMounted(() => {
  if (boardView.value) void load();
});
watch(tab, t => {
  if (!myRunsMode.value && isBoardView(t) && !allRows.value.length && !loading.value && !error.value) void load();
});
</script>
