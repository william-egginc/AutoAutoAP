<!--
  The chain leaderboard, read from the collector and rendered in the planner's own styling.

  The same data is served as a standalone page by the Worker itself, and that page is still the
  right answer for someone following a link from outside. This exists because the people most
  likely to want the board are the ones already looking at their own result, and sending them to
  another domain to compare against it is a worse experience than a tab.

  It re-implements the table rather than framing the Worker's page: an iframe would carry the
  other page's styling into the middle of this one, would not share the planner's TE target, and
  could not offer "use this chain". Nothing here re-simulates anything -- it is one GET.

  THREE RACE TABS, because a plan length answers none of the questions people bring here. A plan's
  length counts from its own start, so the same plan run a day later is a day shorter; a board
  sorted by it rewards whoever submitted most recently (a player's own words: "every day the new
  run shows up 1 day faster than the previous best, but it's the same plan"). So:

    - Race: one line per named player, sorted by the date their best plan that still counts
      reaches the target (lib/leaderboardRank.ts has the rules). Being further along counts, and
      the header says so.
    - My plans: only the loaded save's account, where "is this plan better" has a real answer.
    - All runs: every row, exact copies shown once, every column sortable.

  And two for the deadline search's answers (schema 8), "the highest TE by this date": Egg Day
  (first, and open by default) and By a date for every other deadline (lib/leaderboardRank.ts
  `buildDeadlineBoard`).

  PHASE 2 (collector redeploy, 2026-09-25). Rows carry `acct`, a tag made from the sender's owner
  code (search/owner.ts), so the race knows who is who exactly and nobody can knock a plan out with
  rows dressed as someone else's (lib/leaderboardRank.ts `mayJudge`). My plans and the "you" chip come
  from GET /mine -- the rows sent with this browser's code for the loaded account, anonymous ones
  included -- plus, for runs from before codes existed, the timezone+artifacts match. An anonymous
  viewer is told privately where they would place.
-->
<template>
  <div class="space-y-4">
    <div class="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Chain leaderboard</h3>
        </div>
        <div v-if="tab !== 'insights'" class="flex items-end gap-2">
          <label v-if="tab !== 'dates' && tab !== 'eggday'" class="block">
            <span class="block text-[9px] font-black uppercase tracking-widest text-indigo-700/70 mb-1">Target TE</span>
            <select v-model="final" class="rounded-lg border-indigo-200 text-xs font-bold text-slate-700 py-1.5">
              <option value="">all</option>
              <option v-for="te in targets" :key="te" :value="String(te)">{{ te }}</option>
            </select>
          </label>
          <button
            type="button"
            class="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-white disabled:opacity-40"
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
          class="px-3 py-1.5 -mb-px rounded-t-lg text-[10px] font-black uppercase tracking-widest border border-b-0"
          :class="
            tab === t
              ? 'bg-white border-indigo-200 text-indigo-800'
              : 'border-transparent text-indigo-700/60 hover:text-indigo-800'
          "
          @click="tab = t"
        >
          {{ tabLabel(t) }}
        </button>
      </div>

      <!-- Insights: the Chain Explorer's charts (its own load, filters and refresh), in place of a
           link out to its page (the unified layout, phase 4). -->
      <ChainExplorer v-if="tab === 'insights'" part="insights" embedded />

      <p v-else-if="error" class="text-[11px] text-red-700 font-semibold">Could not reach the collector: {{ error }}</p>

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
            No named player has a current plan to {{ target }} yet. To join, put a name in the box when you share a
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
                    <th
                      class="py-2 pr-3"
                      :title="`Dates are in your timezone (${viewZone}); hover one for the player's own`"
                    >
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
                      <td class="py-2 pr-3 font-bold text-slate-700">
                        <span class="whitespace-nowrap"
                          >{{ e.label }}
                          <span
                            v-if="isMe(e)"
                            class="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest"
                            >you</span
                          ></span
                        >
                        <!-- Under the name on a phone, wrapping rather than widening the column. -->
                        <div v-if="narrow" class="mt-0.5 max-w-[10rem] leading-snug">
                          <span class="font-mono text-slate-600">{{ e.best.row.chain.join(' ') }}</span>
                          <span
                            v-for="t in raceTags.get(e.key) ?? []"
                            :key="t"
                            class="ml-1 inline-block px-1 rounded bg-sky-100 text-[9px] font-black text-sky-800"
                            :title="settingTagTitle(t)"
                            >{{ t }}</span
                          >
                        </div>
                      </td>
                      <td v-if="!narrow" class="py-2 pr-3">
                        <span class="font-mono font-bold text-slate-700 whitespace-nowrap">{{
                          e.best.row.chain.join(' ')
                        }}</span>
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

      <!-- ================================================================== MINE -->
      <!-- ======================================================= EGG DAY, AND BY A DATE -->
      <template v-else-if="tab === 'eggday' || tab === 'dates'">
        <p v-if="tab === 'eggday'" class="text-[11px] text-indigo-900/80 leading-relaxed">
          The highest TE each player can reach by Egg Day {{ eggDayYear }} (14 July, 9:00 AM Pacific), from the Auto
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
            <span class="block text-[9px] font-black uppercase tracking-widest text-indigo-700/70 mb-1">Time off</span>
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
          and use <span class="font-semibold">Share this answer</span>.
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
                    <td class="pr-3 py-1 font-black text-indigo-900">{{ e.te }}</td>
                    <td class="pr-3 py-1">{{ e.best.chain.join(' ') }}</td>
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
                        title="Every route this search found, as a gzipped CSV"
                        @click.stop
                        >CSV ↓</a
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
                          <span class="font-bold text-indigo-900">{{ o.finalTE }} TE</span> via {{ o.chain.join(' ') }},
                          from {{ o.currentTE ?? '—' }} TE, sent {{ sentText(o.receivedAt ?? o.submittedAt) }}
                          <a
                            v-if="o.hasCsv && o.id"
                            :href="`${csvRoot}?id=${encodeURIComponent(o.id)}`"
                            class="ml-1 font-bold text-indigo-700 underline hover:text-indigo-900"
                            >CSV ↓</a
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

      <template v-else-if="tab === 'mine'">
        <p v-if="!myKey && !mineRows?.length" class="text-[11px] text-indigo-900/70 py-4">
          Load your save to see your own plans here. They are the runs this browser sent for your account, plus older
          runs with your timezone and artifacts.
        </p>
        <p v-else-if="target == null" class="text-[11px] text-indigo-900/70 py-4">
          Pick a target TE above to see your plans to it.
        </p>
        <p v-else-if="!mine" class="text-[11px] text-indigo-900/70 py-4">
          None of the runs to {{ target }} on the board are yours yet. This browser hasn't sent one for this account,
          and none match your timezone and artifacts. Share a result and it will show up here.
        </p>
        <template v-else>
          <p class="text-[11px] text-indigo-900/80 leading-relaxed">
            <template v-if="mine.best">
              Your best current plan finishes
              <span class="font-bold" :title="finishTitle(mine.best.finish, mine.best.row.timezone)">{{
                finishDateText(mine.best.finish, viewZone)
              }}</span>
              ({{ daysLeftPhrase(mine.best.finish, now, viewZone) }})<template v-if="myPlace">, {{ myPlace }}</template
              >.
            </template>
            <template v-else>None of your plans to {{ target }} count right now. The reasons are below.</template>
            {{ mine.sends }} {{ mine.sends === 1 ? 'run' : 'runs' }} sent, {{ mine.plansTried }} different
            {{ mine.plansTried === 1 ? 'plan' : 'plans' }}.
          </p>
          <p v-if="mine.best && mine.listed.length" class="text-[10px] text-slate-500 leading-relaxed">
            "vs your best" only compares plans made from the same save and priced by the same version of the planner, so
            the gap comes from the plans alone. For a plan from an older save, press Use to price it again from today's
            save.
          </p>
          <LeaderboardPlanList
            v-if="mine.best"
            :plans="[mine.best, ...mine.listed]"
            :all-plans="shownPlans(mine)"
            :best="mine.best"
            :resends="mine.resends"
            :now="now"
            :view-zone="viewZone"
            :csv-root="csvRoot"
            gap-label="vs your best"
            @use="c => emit('use', c)"
          />
          <div v-if="mine.dropped.length">
            <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Not counted</h4>
            <LeaderboardPlanList
              :plans="mine.dropped"
              :all-plans="shownPlans(mine)"
              :now="now"
              :view-zone="viewZone"
              :csv-root="csvRoot"
              show-reason
              @use="c => emit('use', c)"
            />
          </div>
        </template>
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
                        class="py-2 pr-3 font-bold text-slate-700"
                        :title="line.nickname || undefined"
                      >
                        <span class="block max-w-[8rem] truncate whitespace-nowrap">{{
                          line.nickname || 'anonymous'
                        }}</span>
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
                      <td v-else-if="c.key === 'chain'" class="py-2 pr-3">
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
                          {{ line.row.space.stoppedEarly ? 'partial' : 'exhaustive' }}
                        </span>
                        <span v-else>{{ line.row.effort || '—' }}</span>
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

      <p v-if="capped && tab !== 'insights'" class="text-[10px] text-amber-800">
        The collector sent its maximum of {{ ALL_CAP }} runs, so the oldest or slowest runs may be missing.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { COMPARE_VIEWS, NAMES, type CompareView } from '@/lib/siteNav';
import { useUIStore } from '@/stores/ui';
import { safeAsyncComponent } from '@/lib/import';
import { describeFetchError } from '@/utils/errors';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
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
  isDeadlineRow,
  isNoCodeLine,
  localZone,
  placeFor,
  plannedText,
  scheduleText,
  settingTagTitle,
  settingTags,
  whoText,
  type BoardRow,
  type Plan,
  type PlayerPlans,
  type RaceEntry,
} from '@/lib/leaderboardRank';
import { virtueInventory } from '@/search/csv';
import { bestPerFamily, keepVirtueArtifacts } from '@/search/submission';
import { existingOwnerToken } from '@/search/owner';
import { hashID } from '@/lib/storage/db';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import LeaderboardPlanList from './LeaderboardPlanList.vue';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';

/** Insights: the Explorer's charts and their chart library load only when that tab opens. */
const ChainExplorer = safeAsyncComponent(() => import('@/explorer/ChainExplorer.vue'));

const props = defineProps<{
  /** The account whose owner code asks GET /mine for "my" rows. Only its hash is used, as the
   *  storage key the code is kept under; the id itself never leaves the browser. */
  playerId?: string;
}>();
const emit = defineEmits<{ use: [chain: number[]] }>();

/** The collector's row shape (lib/leaderboardRank.ts). Loose on purpose: this reads a public
 *  endpoint that may be a version ahead or behind, and a missing field should render a dash. */
type Row = BoardRow;

type Tab = CompareView;
/** Egg Day first (the user, 29 Sep): the one date everyone is aiming at. Insights last. */
const TABS: Tab[] = COMPARE_VIEWS;
/** How many rows an OLD collector's `GET /all` listed at most. The current one serves its whole
 *  snapshot, uncapped, and says so by carrying `builtAt`; only an answer without it is checked. */
const ALL_CAP = 1000;
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
const allRows = ref<Row[]>([]);
const loading = ref(false);
const error = ref('');
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
  return t === 'mine' ? 'My plans' : 'All runs';
}

/** Target-TE options, from what has actually been submitted plus the player's own target. */
const targets = computed(() => {
  // Not a deadline answer's last stop: those are ranked by date on their own tab, and a target of
  // 307 because someone reached 307 by Egg Day is not a finish line anybody is racing to.
  const seen = new Set(
    allRows.value
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

/** The save's own TE, for "near me". */
const myTE = computed(() => (initialState.rawBackup ? store.backupTE : 0));

/**
 * The viewer's own rows, from GET /mine: sent with this browser's code for the loaded account,
 * anonymous ones included, each marked `yours`. Null when that cannot be asked -- no account, no code
 * yet (nothing sent from this browser), or a collector from before /mine.
 */
const mineRows = ref<Row[] | null>(null);
const mineIds = computed(() => new Set((mineRows.value ?? []).map(r => r.id).filter((x): x is string => !!x)));
const myAccts = computed(() => new Set((mineRows.value ?? []).map(r => r.acct).filter((x): x is string => !!x)));

/** Every row, with the viewer's marked `yours`, plus any of theirs /all does not show yet (it is
 *  cached for a minute at the edge; /mine is not). */
const mergedRows = computed<Row[]>(() => {
  const mine = mineRows.value;
  if (!mine?.length) return allRows.value;
  const ids = mineIds.value;
  const seen = new Set(allRows.value.map(r => r.id));
  return [
    ...allRows.value.map(r => (r.id && ids.has(r.id) ? { ...r, yours: true } : r)),
    ...mine.filter(r => !r.id || !seen.has(r.id)),
  ];
});

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
 * Is this race line the viewer's? Exactly, from /mine, when it says so. Otherwise the phase-1 guess --
 * a line with the loaded save's timezone and artifacts -- and, once /mine has answered, only for a
 * line from before owner codes: an owner line /mine did not return belongs to another browser's code.
 */
function isMe(e: RaceEntry): boolean {
  const exact = exactMe.value;
  if (exact?.size) return exact.has(e.key);
  if (!myKey.value || !e.accounts.has(myKey.value)) return false;
  return !exact || !e.key.startsWith('acct:');
}

// ------------------------------------------------------------------------------------ race

// Reasons are dated on the viewer's calendar, like the Planned and Finishes cells beside them.
const race = computed(() =>
  target.value == null ? null : buildRace(allRows.value, { target: target.value, now: now.value, zone: viewZone })
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

// -------------------------------------------------------------------------------- my plans

const mine = computed(() =>
  (myKey.value || mineRows.value?.length) && target.value != null
    ? buildMyPlans(mergedRows.value, myKey.value, { target: target.value, now: now.value, zone: viewZone })
    : null
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

/**
 * "#3 of 11 in the race", or where the viewer would sit if their best plan carried a name.
 *
 * The race line and the best plan here are not always the same plan: the best one may have been
 * sent without a name, and the race only ranks named plans. Then both are said, so the rank shown
 * is never the rank of a different, slower plan passed off as this one's.
 */
const myPlace = computed(() => {
  const r = race.value;
  const best = mine.value?.best;
  if (!r || !best) return '';
  const n = r.entries.length;
  const entry = r.entries.find(isMe);
  if (!entry) {
    const place = placeFor(r, best.finish);
    return place == null ? '' : `you'd be #${place} of ${n + 1} in the race if this plan carried your name`;
  }
  const sameLine =
    entry.best.finish != null && best.finish != null && Math.abs(entry.best.finish - best.finish) < 60_000;
  if (sameLine) return `#${entry.rank} of ${n} in the race`;
  const onNamed = `#${entry.rank} of ${n} in the race on your named plan (finishes ${finishDateText(entry.best.finish, viewZone)})`;
  const place = placeFor(r, best.finish, entry.key);
  if (place == null) return onNamed;
  return best.row.nickname?.trim()
    ? `${onNamed}; this one would place #${place}`
    : `${onNamed}; this one would be #${place} if you sent it with your name`;
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
  { key: 'submittedAt', label: 'Submitted', title: `When it was first sent, in your timezone (${viewZone})` },
];

// ----------------------------------------------------------------------------- By a date

/** The Egg Day / By a date filters: ascensions, awake hours, time off. */
const dateAsc = ref<number | null>(null);
const dateHours = ref<'awake' | 'any' | null>(null);
const dateOff = ref<'with' | 'without' | null>(null);
/** Ascension counts that answers actually have, for the filter's options. */
const dateAscOptions = computed(() =>
  [...new Set(allRows.value.filter(r => isDeadlineRow(r)).map(r => r.chain.length))].sort((a, b) => a - b)
);
const dateBoard = computed(() =>
  buildDeadlineBoard(allRows.value, {
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
  const rows = target.value == null ? allRows.value : allRows.value.filter(r => r.finalTE === target.value);
  // Names filed over every row, as the Race does, so both tabs fold the same copies together.
  const filing = fileRows(allRows.value);
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
  const id = props.playerId?.trim();
  if (!id) return null;
  try {
    const token = existingOwnerToken(await hashID(id));
    if (!token) return null;
    const res = await fetch(`${root.value}/mine`, { headers: { 'x-owner-token': token } });
    if (!res.ok) return null;
    const data = (await res.json()) as { rows?: Row[] };
    return Array.isArray(data.rows)
      ? data.rows.filter(r => r && Array.isArray(r.chain)).map(r => ({ ...r, yours: true }))
      : null;
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
  const res = await fetch(`${root.value}/all${query}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`the collector answered ${res.status}`);
  const data = (await res.json()) as { rows?: Row[]; builtAt?: number };
  const rows = Array.isArray(data.rows) ? data.rows.filter(r => r && Array.isArray(r.chain)) : [];
  return { rows, cut: typeof data.builtAt !== 'number' && rows.length >= ALL_CAP };
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
    now.value = Date.now();
  } catch (e) {
    error.value = describeFetchError(e, 'the leaderboard');
    allRows.value = [];
  } finally {
    mineRows.value = await mine;
    loading.value = false;
  }
}

// Another account loaded: its own rows, not the last one's.
watch(
  () => props.playerId,
  async () => {
    mineRows.value = await fetchMine();
  }
);

// Everything is already in hand, so a new target is a re-sort -- unless the list was cut short.
watch(final, () => {
  open.value = '';
  if (capped.value) void load();
});

// Not while Insights is open: the Explorer there fetches the runs itself. The board loads the first
// time one of its own views is shown.
onMounted(() => {
  if (tab.value !== 'insights') void load();
});
watch(tab, t => {
  if (t !== 'insights' && !allRows.value.length && !loading.value && !error.value) void load();
});
</script>
