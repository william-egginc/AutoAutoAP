<!--
  The Chain Explorer: every submitted run, grouped by how many ascensions it takes.

  WHY THIS IS A SEPARATE PAGE. The planner is a tool for one account: it needs a save, it holds a
  plan, and everything in it is about what YOU should do next. This is the opposite question --
  what has everybody's run looked like, and does a shape repeat -- and it needs no save, no player
  id and no simulation. Forcing it into the planner would mean loading a backup to look at other
  people's results. As its own page it is a static bundle that reads two public endpoints, which
  means it hosts anywhere: GitHub Pages, a file server, anywhere at all.

  WHAT IT WILL AND WILL NOT SAY. Durations are not comparable between accounts and this page never
  compares them that way (see analysis.ts). Across accounts it compares SHAPE, or one leg's own
  length. Within an account it compares FINISH DATES: a plan's total is counted from its own start,
  so the same plan run a day later shows a day fewer, and only the date it reaches the target stays
  put. Totals are compared only between runs from one save, where the two agree. Which of an
  account's runs still stand (not a what-if, an old save, a replaced or a fallen-behind plan) is the
  Leaderboard's judgement, reused (lib/leaderboardRank.ts). The caveats are on the page rather than
  in this comment because the reader needs them more than the maintainer does.
-->
<template>
  <div :class="embedded ? 'text-slate-800' : 'min-h-screen bg-slate-100 text-slate-800'">
    <div :class="embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-4 py-8 space-y-6'">
      <!-- The page's own header, banner and update notice; inside the planner (Compare > Insights,
           Science) the planner has its own. -->
      <template v-if="!embedded">
        <header class="space-y-1">
          <h1 class="text-2xl font-black tracking-tight text-slate-900">Chain Explorer</h1>
          <p class="text-sm text-slate-500 max-w-3xl leading-relaxed">
            Every run submitted to the collector, grouped by how many ascensions it takes. Pick a count to see where
            each ascension lands, how long each leg runs, and whether the shape repeats across accounts.
          </p>
        </header>

        <NewVersionBanner page-url="./explorer.html" entry="explorer" />

        <!-- "Help fill the gaps" moved to the planner's Science tab (the unified layout, phase 4). -->
        <a
          v-if="base"
          :href="scienceHref('check')"
          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 hover:bg-indigo-100"
        >
          <span class="text-[13px] font-bold">
            Want to help make AAAP better? Run one of the sweeps we still need and submit it.
          </span>
          <span class="text-[10px] font-black uppercase tracking-widest">See what's needed &rarr;</span>
        </a>
      </template>

      <!-- ------------------------------------------------------------------ source and loading -->
      <section v-if="part === 'insights'" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div v-if="!base" class="space-y-2">
          <p class="text-sm font-bold text-slate-700">No collector configured for this copy of the page.</p>
          <p class="text-[12px] text-slate-500 leading-relaxed">
            Paste the collector's base URL: the same Worker the planner's Submit button posts to, without the
            <code class="font-mono-premium">/submit</code>. It is remembered in this browser, and
            <code class="font-mono-premium">?collector=…</code> on this page's own URL does the same thing for a link
            you want to share.
          </p>
          <form class="flex flex-wrap gap-2" @submit.prevent="adoptTypedBase">
            <input
              v-model="typedBase"
              type="url"
              placeholder="https://ascension-chain-collector.example.workers.dev"
              class="flex-1 min-w-[18rem] rounded-lg border-slate-300 text-sm font-mono-premium"
            />
            <button
              type="submit"
              class="px-4 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest"
            >
              Load
            </button>
          </form>
        </div>

        <div v-else class="flex flex-wrap items-center justify-between gap-3">
          <div class="space-y-0.5">
            <p v-if="loading" class="text-sm font-bold text-slate-500">Reading the collector…</p>
            <p v-else-if="error" class="text-sm font-bold text-rose-700">{{ error }}</p>
            <!-- Inside the planner, a plain headline and what was left out, one line each (the user's
                 screenshot, 30 Sept: the checkboxes ran into the next sentence, and the collector URL and
                 worker-time note read like developer notes). The page on its own keeps the detail. -->
            <p v-else class="text-sm font-bold text-slate-700">
              {{ usable.length.toLocaleString() }} runs from {{ accounts.length }} accounts<template v-if="!embedded">
                · {{ totalChainsPriced.toLocaleString() }} chains priced between them<template v-if="computeTotal.runs">
                  · {{ formatMinutes(computeTotal.minutes) }} of computing</template
                ></template
              >
            </p>
            <p v-if="!embedded && !loading && computeTotal.runs" class="text-[11px] text-slate-500">
              Worker time from the {{ computeTotal.runs }} run{{ computeTotal.runs === 1 ? '' : 's' }} that recorded it
              (minutes x workers); runs from older versions and from uploads did not.
            </p>
            <div v-if="!loading" class="space-y-0.5 text-[11px] text-slate-500">
              <p v-if="folded.hidden.size">
                {{ folded.hidden.size }} repeat send{{ folded.hidden.size === 1 ? '' : 's' }} of a result already listed
                {{ folded.hidden.size === 1 ? 'is' : 'are' }} counted once (the same plan from the same save, sent twice
                or found by two searches).
              </p>
              <p v-if="flagged.size" class="flex flex-wrap items-center gap-x-2">
                <span
                  >{{ flagged.size }} run{{ flagged.size === 1 ? '' : 's' }} hit by an old delivery-set bug
                  {{ flagged.size === 1 ? 'is' : 'are' }} left out.</span
                >
                <label class="inline-flex items-center gap-1 font-bold text-slate-600">
                  <input v-model="showFlagged" type="checkbox" class="rounded border-slate-300 text-amber-600" />
                  Include {{ flagged.size === 1 ? 'it' : 'them' }}
                </label>
              </p>
              <p v-if="withTimeOff.size" class="flex flex-wrap items-center gap-x-2">
                <span
                  >{{ withTimeOff.size }} run{{ withTimeOff.size === 1 ? '' : 's' }} planned around time off
                  {{ withTimeOff.size === 1 ? 'is' : 'are' }} left out (a different question: the farm stops and is
                  rebuilt).</span
                >
                <label class="inline-flex items-center gap-1 font-bold text-slate-600">
                  <input v-model="showTimeOff" type="checkbox" class="rounded border-slate-300 text-amber-600" />
                  Include {{ withTimeOff.size === 1 ? 'it' : 'them' }}
                </label>
              </p>
            </div>
            <p v-if="!embedded" class="text-[10px] font-mono-premium text-slate-400 truncate max-w-xl">{{ base }}</p>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
              :disabled="loading"
              @click="load"
            >
              Refresh
            </button>
            <button
              v-if="!embedded"
              type="button"
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
              @click="forgetBase"
            >
              Change collector
            </button>
          </div>
        </div>
      </section>

      <!-- Science needs the runs too, but not the collector's details: just say when they can't load. -->
      <p
        v-if="part === 'science' && (!base || error)"
        class="rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold"
        :class="base ? 'text-rose-700' : 'text-slate-600'"
      >
        {{ base ? error : "No collector is set up for this copy of the site, so there's nothing to show here." }}
      </p>

      <!-- ------------------------------------------------------------------ what we know so far -->
      <!-- The findings are written, so the card shows at once; its header counts fill in when the runs arrive. -->
      <WhatWeKnow v-if="part === 'insights'" :stats="knowSummary" :science-href="scienceHref('check')" />

      <!-- Holds the place of everything below while the collector loads, at a fixed height. The
           sections that are worked out from the runs wait for them: drawn from no runs, "Help fill
           the gaps" listed every ask at 0 of 6, then jumped some 12,000 px down the page when the
           runs arrived and the page above it filled in. -->
      <section
        v-if="base && loading && !rows.length"
        class="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-white text-[12px] font-bold text-slate-400"
        role="status"
      >
        Reading the collector…
      </section>

      <template v-if="part === 'insights' && rows.length">
        <!-- The caveats, folded and first: "accounts are a guess" matters before reading any account row. -->
        <details class="rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-500">
          <summary class="cursor-pointer text-[10px] font-black text-slate-500 uppercase tracking-widest">
            How to read all of this
          </summary>
          <div class="mt-2 space-y-2">
            <p class="leading-relaxed">
              <b class="text-slate-700">Accounts are a guess.</b> Submissions carry no player id by design, so an
              "account" here is one timezone plus one set of virtue artifacts. People who retype their nickname every
              run still group correctly; two people in the same timezone with identical artifact sets would be merged
              into one.
            </p>
            <p class="leading-relaxed">
              <b class="text-slate-700">Shapes travel, durations do not.</b> Where the checkpoints sit is a fact about
              the game's sale calendar and research curve. How long the plan takes is a fact about somebody's artifacts.
            </p>
            <p class="leading-relaxed">
              <b class="text-slate-700">Compare finish dates, not totals.</b> A plan's length counts from its own start,
              so a run made a day later shows a day fewer even when it is the same plan. The date it reaches the target
              does not move, and a better plan finishes earlier, so an account's runs are compared by finish date.
              Totals only compare between runs from the same save. The first ascension is the rest of the one in
              progress, so it too is shorter when a plan is made later.
            </p>
            <p class="leading-relaxed">
              <b class="text-slate-700">These are searches, not surveys.</b> Most runs explored a band somebody typed,
              so this shows where good chains were found, which is not always where the good chains are. A band that
              stops dead at a round number is usually the edge of a search box.
            </p>
          </div>
        </details>

        <!-- ------------------------------------------------------------------------- filtering -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target TE</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="target in targets"
                :key="target.finalTE"
                type="button"
                class="px-2.5 py-1 rounded-md text-[10px] font-black border transition-colors"
                :class="
                  finalTE === target.finalTE
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                "
                @click="finalTE = target.finalTE"
              >
                {{ target.finalTE }} <span class="opacity-60">({{ target.runs }})</span>
              </button>
            </div>
            <label class="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <input
                v-model="exhaustiveOnly"
                type="checkbox"
                class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Proofs only
            </label>
          </div>
          <p class="text-[11px] text-slate-500 leading-relaxed">
            One target at a time, because a 300 chain and a 490 chain are different problems and their checkpoints do
            not sit in the same places.
            <template v-if="exhaustiveOnly">
              Proofs only: runs that enumerated a stated space and finished it, so the winner is the optimum of that
              space rather than the best thing a search happened to find.
            </template>
          </p>
        </section>

        <!-- Which count wins, near the top: it answers the question most people come with (review, 30 Sept). -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 class="text-lg font-black text-slate-900">Which ascension count finishes first, account by account</h2>
          <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
            <b>How to read it:</b> each row is one account. "best" is the number of ascensions that finished first for
            it; every other cell says how many days later that count finished. Darker is closer to the best.
          </p>
          <details>
            <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
              How this is worked out
            </summary>
            <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
              One row per account, one column per ascension count tried at this target. Each cell is that account's best
              plan at that count whose finish still stands, as days after the account's own earliest finish (the one the
              runs table names): "best" at 0, darker is closer. A row only compares with itself; nothing compares down a
              column, because gear decides totals. The rows are ordered by starting TE (or Clothed TE, or delivery
              score), so you can see whether the winning count moves with where an account is or with its gear. The
              border says how the run behind the cell searched: solid for a finished box at every TE, dashed for every
              2nd-3rd TE, dotted for every 4th or coarser, striped for a Simple (Smart search) run or a box it did not finish. A dark
              cell with a dotted or striped edge is a best count found by a search that could have missed a better plan,
              so it is weaker than it looks. Hover or tap a cell for the chain, its finish date, how it searched and
              whether the step from the next count down is bigger than the search could explain.
            </p>
          </details>
          <BestCountMatrix
            :rows="filtered"
            :tried="atTarget"
            :judged="judged"
            :account-colors="accountColors"
            :account-labels="accountLabels"
          />
        </section>

        <!-- ---------------------------------------------------------------- the count selector -->
        <section class="space-y-2">
          <h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">By ascension count</h2>
          <div v-if="countGroups.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <button
              type="button"
              class="rounded-xl border p-3 text-left transition-colors"
              :class="
                selectedCount === 'all'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              "
              @click="selectedCount = 'all'"
            >
              <div class="text-xl font-black leading-none">All</div>
              <div
                class="text-[9px] font-black uppercase tracking-widest mt-1"
                :class="selectedCount === 'all' ? 'text-slate-300' : 'text-slate-400'"
              >
                ascension counts
              </div>
              <div class="mt-2 text-[11px] font-bold">
                {{ allGroup.rows.length }} run{{ allGroup.rows.length === 1 ? '' : 's' }}
              </div>
              <div class="text-[10px]" :class="selectedCount === 'all' ? 'text-slate-300' : 'text-slate-400'">
                {{ allGroup.accounts }} account{{ allGroup.accounts === 1 ? '' : 's' }}
                <template v-if="allGroup.exhaustive">· {{ allGroup.exhaustive }} proven</template>
              </div>
            </button>
            <button
              v-for="group in countGroups"
              :key="group.ascensions"
              type="button"
              class="rounded-xl border p-3 text-left transition-colors"
              :class="
                selectedCount === group.ascensions
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              "
              @click="selectedCount = group.ascensions"
            >
              <div class="text-xl font-black leading-none">{{ group.ascensions }}</div>
              <div
                class="text-[9px] font-black uppercase tracking-widest mt-1"
                :class="selectedCount === group.ascensions ? 'text-slate-300' : 'text-slate-400'"
              >
                ascensions
              </div>
              <div class="mt-2 text-[11px] font-bold">
                {{ group.rows.length }} run{{ group.rows.length === 1 ? '' : 's' }}
              </div>
              <div
                class="text-[10px]"
                :class="selectedCount === group.ascensions ? 'text-slate-300' : 'text-slate-400'"
              >
                {{ group.accounts }} account{{ group.accounts === 1 ? '' : 's' }}
                <template v-if="group.exhaustive">· {{ group.exhaustive }} proven</template>
              </div>
            </button>
          </div>
          <p
            v-else
            class="px-4 py-8 text-center text-[11px] text-slate-400 bg-white rounded-xl border border-slate-200"
          >
            Nothing matches that filter yet.
          </p>
        </section>

        <!-- ------------------------------------------------------------------- selected detail -->
        <section v-if="selected" class="rounded-xl border border-slate-200 bg-white p-4 space-y-5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-black text-slate-900">
              {{ selectedCount === 'all' ? 'Every ascension count' : `${selectedCount} ascensions` }}
              <span class="text-[11px] font-bold text-slate-400">
                · {{ selected.rows.length }} run{{ selected.rows.length === 1 ? '' : 's' }} from
                {{ selected.accounts }} account{{ selected.accounts === 1 ? '' : 's' }}
              </span>
            </h2>
            <span class="text-[11px] text-slate-500 max-w-md">
              No "fastest" across accounts: gear decides that. Each account's earliest finish is named in the table.
            </span>
          </div>

          <template v-if="selectedCount !== 'all'">
            <div class="space-y-2">
              <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Where each checkpoint lands
              </h3>
              <CountShapeChart
                :rows="selected.rows"
                :bests="selectedBests"
                :standing="standingIds"
                :account-colors="accountColors"
                :account-labels="accountLabels"
              />
            </div>

            <!-- Interesting, but no decision depends on it: folded (review, 30 Sept). -->
            <details>
              <summary class="cursor-pointer text-[10px] font-black text-slate-500 uppercase tracking-widest">
                How each ascension goes
              </summary>
              <div class="mt-2">
                <LegProfileChart
                  :rows="selected.rows"
                  :account-colors="accountColors"
                  :account-labels="accountLabels"
                />
              </div>
            </details>
          </template>
          <p v-else class="text-[11px] text-slate-500 leading-relaxed">
            Pick one count to see where its checkpoints land and how each ascension goes: the third ascension of a
            4-ascension plan and of a 7-ascension plan are not the same thing, so those charts only work one count at a
            time.
          </p>

          <!-- Every run, folded: twelve columns and a long explainer, for the few who want them (review,
               30 Sept). -->
          <details id="the-runs" class="scroll-mt-4">
            <summary class="cursor-pointer text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Show every run
            </summary>
            <div class="mt-2 space-y-2">
              <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">The runs</h3>
              <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
                Grouped by account, earliest finish first unless you pick another order below; click an account's name
                to fold its runs away. <b>Finishes</b> is the date the plan reaches {{ finalTE }} TE, in your timezone
                (the player's own is on hover): it is the same whenever the same plan is run, so it is what compares
                between an account's runs. <b>Plan length</b> counts from each run's own start, so a run made a day
                later shows a day fewer; it only compares between runs from the same save. <b>vs best</b> is days after
                that account's earliest finish, the run named at the top of its block. That run is picked from all of
                the account's runs to this target, so Proofs only or picking one count can leave it out of the list; the
                block then says so. Runs whose finish no longer stands (a what-if, a plan re-measured by a newer run,
                one the player has fallen behind, one made from an old save) are greyed, with the reason on hover (on a
                phone, under the name), and listed last when sorted by finish. <b>What was checked</b> is how each run
                searched and, for a box it tried in full, the TEs at each ascension as they are typed into the planner
                (<span class="font-mono-premium">181-250:5</span> is every 5th TE from 181 to 250,
                <span class="font-mono-premium">:1</span> every TE); the full box is on hover. <b>What's left</b> is how
                much of that same box at every TE the run did not price (the TEs between its steps, or the rest of a box
                it stopped early) and how long pricing the rest would take on a 16-20 core machine. Runs that improved a
                seed chain instead of trying a fixed box have nothing to measure against. <b>can't check</b> marks a run
                the delivery-set check could not look at (no delivery set or per-leg detail recorded, a last checkpoint
                under 190 TE, or a target other than 490): not flagged, and not cleared either.
              </p>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1"
                  >Sort each account by</span
                >
                <button
                  v-for="opt in runSortOptions"
                  :key="opt.by"
                  type="button"
                  class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
                  :class="
                    activeSort.by === opt.by
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  "
                  :aria-pressed="activeSort.by === opt.by"
                  @click="sortRunsBy(opt.by)"
                >
                  {{ opt.label }}
                </button>
                <button
                  type="button"
                  class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  title="Flip the order"
                  @click="flipRunSort"
                >
                  {{ activeSort.dir === 'asc' ? '↑' : '↓' }} {{ sortDirText(activeSort) }}
                </button>
                <span class="grow" />
                <button
                  type="button"
                  class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border border-slate-200 bg-white text-slate-500 hover:border-slate-300 disabled:opacity-40"
                  :disabled="runBlocks.every(b => collapsed.has(b.key))"
                  @click="
                    setCollapsed(
                      runBlocks.map(b => b.key),
                      true
                    )
                  "
                >
                  Collapse all
                </button>
                <button
                  type="button"
                  class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border border-slate-200 bg-white text-slate-500 hover:border-slate-300 disabled:opacity-40"
                  :disabled="!runBlocks.some(b => collapsed.has(b.key))"
                  @click="
                    setCollapsed(
                      runBlocks.map(b => b.key),
                      false
                    )
                  "
                >
                  Expand all
                </button>
              </div>
              <p v-if="activeSort.by === 'length'" class="text-[10px] text-amber-800 leading-relaxed max-w-3xl">
                Plan length counts from each run's own start, so a plan made a day later shows a day fewer even when it
                is the same plan. In this order, only runs from the same save compare; to see which plan is better, sort
                by finish.
              </p>
              <!-- A size container, so each account's header line can be exactly as wide as what is on
                 screen (100cqw) however wide the table itself is: the Leaderboard's pattern. -->
              <div class="overflow-x-auto [container-type:inline-size]">
                <table class="w-full text-[11px]">
                  <thead>
                    <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th class="text-left py-1 pr-3">Who</th>
                      <th
                        v-if="selectedCount === 'all'"
                        class="text-right py-1 pr-3"
                        :aria-sort="ariaSort('ascensions')"
                      >
                        <button type="button" :class="sortHeadClass('ascensions')" @click="sortRunsBy('ascensions')">
                          Asc.<span aria-hidden="true">{{ sortArrow('ascensions') }}</span>
                        </button>
                      </th>
                      <th class="text-left py-1 pr-3" :aria-sort="ariaSort('te')">
                        <button
                          type="button"
                          :class="sortHeadClass('te')"
                          title="Sort by starting TE"
                          @click="sortRunsBy('te')"
                        >
                          Journey<span aria-hidden="true">{{ sortArrow('te') }}</span>
                        </button>
                      </th>
                      <th class="text-left py-1 pr-3">Chain</th>
                      <th class="text-left py-1 pr-3" :aria-sort="ariaSort('planned')">
                        <button type="button" :class="sortHeadClass('planned')" @click="sortRunsBy('planned')">
                          Planned<span aria-hidden="true">{{ sortArrow('planned') }}</span>
                        </button>
                      </th>
                      <th class="text-left py-1 pr-3" :aria-sort="ariaSort('finish')">
                        <button type="button" :class="sortHeadClass('finish')" @click="sortRunsBy('finish')">
                          Finishes<span aria-hidden="true">{{ sortArrow('finish') }}</span>
                        </button>
                      </th>
                      <th class="text-right py-1 pr-3">
                        <!-- Inside one account, days after its earliest finish IS the finish order. -->
                        <button type="button" :class="sortHeadClass('finish')" @click="sortRunsBy('finish')">
                          vs best<span aria-hidden="true">{{ sortArrow('finish') }}</span>
                        </button>
                      </th>
                      <th
                        class="text-right py-1 pr-3"
                        title="Days from this run's own plan start to the target"
                        :aria-sort="ariaSort('length')"
                      >
                        <button type="button" :class="sortHeadClass('length')" @click="sortRunsBy('length')">
                          Plan length<span aria-hidden="true">{{ sortArrow('length') }}</span
                          ><br /><span class="normal-case tracking-normal font-bold">(from its start)</span>
                        </button>
                      </th>
                      <th
                        class="text-left py-1 pr-3"
                        title="How each run searched and, for a box it tried in full, which TEs at each ascension (the notation typed into the planner)"
                      >
                        What was checked
                      </th>
                      <th class="text-right py-1 pr-3" :aria-sort="ariaSort('priced')">
                        <button type="button" :class="sortHeadClass('priced')" @click="sortRunsBy('priced')">
                          Priced<span aria-hidden="true">{{ sortArrow('priced') }}</span>
                        </button>
                      </th>
                      <th
                        class="text-right py-1 pr-3"
                        :aria-sort="ariaSort('left')"
                        title="Plans in the same box at every TE that the run did not price, and how long they would take"
                      >
                        <button type="button" :class="sortHeadClass('left')" @click="sortRunsBy('left')">
                          What's left<span aria-hidden="true">{{ sortArrow('left') }}</span>
                        </button>
                      </th>
                      <th class="text-right py-1 pr-3" :aria-sort="ariaSort('compute')">
                        <button type="button" :class="sortHeadClass('compute')" @click="sortRunsBy('compute')">
                          Compute<span aria-hidden="true">{{ sortArrow('compute') }}</span>
                        </button>
                      </th>
                      <th class="text-left py-1">Full table</th>
                    </tr>
                  </thead>
                  <tbody v-for="block in runBlocks" :key="block.key" class="divide-y divide-slate-100">
                    <tr class="bg-slate-50">
                      <td :colspan="selectedCount === 'all' ? 13 : 12" class="p-0 text-[10px] text-slate-500">
                        <!-- Pinned to the left edge and as wide as the visible part of the table: on a phone
                           the table is wider than the screen, and a line spanning all of it put the
                           route and the "not listed here" note off-screen. It wraps on screen instead. -->
                        <div class="sticky left-0 w-[100cqw] py-1.5 px-2">
                          <button
                            type="button"
                            class="mr-0.5 -ml-1 px-1 rounded align-middle hover:bg-slate-200/60"
                            :aria-expanded="!collapsed.has(block.key)"
                            :title="
                              collapsed.has(block.key) ? 'Show this account\'s runs' : 'Fold this account\'s runs away'
                            "
                            @click="setCollapsed([block.key], !collapsed.has(block.key))"
                          >
                            <span
                              aria-hidden="true"
                              class="inline-block w-3.5 text-[13px] leading-none align-middle text-slate-500"
                              >{{ collapsed.has(block.key) ? '▸' : '▾' }}</span
                            >
                            <AccountDot :index="accountColors.get(block.key) ?? 0" class="mr-1.5" />
                            <b class="text-slate-700">{{ block.label }}</b>
                          </button>
                          · {{ block.rows.length }} run{{ block.rows.length === 1 ? '' : 's'
                          }}<template v-if="collapsed.has(block.key)"> folded</template>
                          <template v-if="block.best">
                            · earliest finish
                            <b
                              class="text-slate-700"
                              :title="finishTitle(block.best.finish, block.best.row.timezone)"
                              >{{ finishDateText(block.best.finish, viewZone) }}</b
                            >
                            ({{ block.best.row.ascensions }} ascensions,
                            <span class="font-mono-premium">{{ block.best.row.chain.join(' ') }}</span
                            >)
                            <span v-if="!bestListed.has(block.key)" class="text-slate-400"
                              >(not listed here: {{ unlistedWhy(block.best.row) }})</span
                            >
                          </template>
                          <template v-else> · no run whose finish still stands</template>
                        </div>
                      </td>
                    </tr>
                    <tr
                      v-for="row in collapsed.has(block.key) ? [] : block.rows"
                      :key="row.id"
                      class="hover:bg-slate-50"
                      :class="judged.byId.get(row.id)?.standing ? '' : 'text-slate-400'"
                    >
                      <td class="py-1.5 pr-3">
                        {{ whoText(row) || 'anonymous' }}
                        <span
                          v-if="judged.byId.get(row.id)?.best"
                          class="ml-1 rounded bg-emerald-100 px-1 text-[9px] font-black text-emerald-800"
                          title="This account's earliest finish at this target"
                        >
                          best
                        </span>
                        <span
                          v-if="stateOf(row)"
                          class="ml-1 whitespace-nowrap rounded bg-slate-100 px-1 text-[9px] font-black text-slate-500"
                          :title="judged.byId.get(row.id)?.reason"
                        >
                          {{ stateOf(row) }}
                        </span>
                        <span
                          v-if="folded.sends.get(row.id)"
                          class="ml-1 whitespace-nowrap text-[9px] font-bold text-slate-400"
                          title="The same result was sent more than once; it is listed once"
                        >
                          sent ×{{ folded.sends.get(row.id) }}
                        </span>
                        <span
                          v-if="flagged.has(row.id)"
                          class="ml-1 rounded bg-amber-100 px-1 text-[9px] font-black text-amber-800"
                          :title="flagged.get(row.id)"
                        >
                          flagged
                        </span>
                        <span
                          v-else-if="unchecked.has(row.id)"
                          class="ml-1 whitespace-nowrap rounded border border-dashed border-slate-300 px-1 text-[9px] font-bold text-slate-400"
                          :title="unchecked.get(row.id)"
                        >
                          can't check
                        </span>
                        <!-- Why a run is greyed, on screen where there is no hover to show it: a phone. -->
                        <div
                          v-if="stateOf(row) && judged.byId.get(row.id)?.reason"
                          class="sm:hidden mt-0.5 max-w-[14rem] text-[10px] leading-snug text-slate-400"
                        >
                          {{ judged.byId.get(row.id)?.reason }}
                        </div>
                      </td>
                      <td v-if="selectedCount === 'all'" class="py-1.5 pr-3 text-right font-bold">
                        {{ row.ascensions }}
                      </td>
                      <td class="py-1.5 pr-3 font-mono-premium text-slate-500 whitespace-nowrap">
                        {{ row.currentTE }} → {{ row.finalTE }}
                      </td>
                      <td
                        class="py-1.5 pr-3 font-mono-premium whitespace-nowrap"
                        :class="judged.byId.get(row.id)?.standing ? 'text-slate-700' : ''"
                      >
                        {{ row.chain.join(' ') }}
                        <span
                          v-for="t in tags.get(row) ?? []"
                          :key="t"
                          class="ml-1 rounded bg-sky-100 px-1 font-sans text-[9px] font-black text-sky-800"
                          >{{ t }}</span
                        >
                      </td>
                      <td class="py-1.5 pr-3 whitespace-nowrap" :title="`${row.startLocal}, ${row.timezone} time`">
                        {{ plannedText(row) }}
                      </td>
                      <td
                        class="py-1.5 pr-3 whitespace-nowrap font-black"
                        :title="finishTitle(judged.byId.get(row.id)?.finish ?? null, row.timezone)"
                      >
                        {{ finishDateText(judged.byId.get(row.id)?.finish ?? null, viewZone) }}
                      </td>
                      <td class="py-1.5 pr-3 text-right whitespace-nowrap" :title="vsBestTitle(row)">
                        <span v-if="judged.byId.get(row.id)?.best" class="font-black text-emerald-700">best</span>
                        <template v-else-if="judged.byId.get(row.id)?.behind != null">
                          {{ vsBestText(judged.byId.get(row.id)!.behind!) }}
                          <span v-if="judged.byId.get(row.id)?.sameSaveAsBest" class="text-[9px] text-slate-400"
                            >same save</span
                          >
                        </template>
                        <span v-else class="text-slate-300">—</span>
                      </td>
                      <td class="py-1.5 pr-3 text-right text-slate-500 whitespace-nowrap">
                        {{ row.durationDays.toFixed(2) }} d
                      </td>
                      <td class="py-1.5 pr-3" :title="searched.get(row.id)?.title">
                        <span
                          :class="
                            row.space
                              ? searched.get(row.id)?.finished
                                ? 'font-black text-emerald-700'
                                : 'font-bold text-amber-700'
                              : 'text-slate-500'
                          "
                          >{{ searched.get(row.id)?.how }}</span
                        >
                        <!-- Wraps only between checkpoints (after each ";"), never inside a band at its hyphen, and
                           copies as the text a player would type into the planner. -->
                        <div
                          v-if="searched.get(row.id)?.pieces.length"
                          class="font-mono-premium text-[10px] text-slate-500 max-w-[17rem]"
                        >
                          <template v-for="(piece, k) in searched.get(row.id)?.pieces" :key="k"
                            >{{ k ? ' ' : '' }}<span class="whitespace-nowrap">{{ piece }}</span></template
                          >
                        </div>
                      </td>
                      <td class="py-1.5 pr-3 text-right text-slate-500">{{ row.chainsPriced.toLocaleString() }}</td>
                      <td
                        class="py-1.5 pr-3 text-right whitespace-nowrap"
                        :title="
                          leftById.get(row.id)
                            ? leftTitle(leftById.get(row.id)!)
                            : row.space
                              ? 'Its box could not be counted again from this row (the recount does not match what the run stored), so what is left is not shown.'
                              : 'A staged search improved a seed chain rather than trying a fixed box of TEs, so there is nothing to measure what is left against.'
                        "
                      >
                        <template v-if="leftById.get(row.id)">
                          <span v-if="leftById.get(row.id)!.left === 0" class="font-bold text-emerald-700"
                            >nothing</span
                          >
                          <template v-else>
                            <span class="font-bold text-slate-600">{{ plansText(leftById.get(row.id)!.left) }}</span>
                            <span class="text-[9px] text-slate-400"> {{ leftShareText(leftById.get(row.id)!) }}</span>
                            <div class="text-[10px] text-slate-400">
                              ~{{ longEstimate(leftById.get(row.id)!.seconds) }}
                            </div>
                          </template>
                        </template>
                        <span v-else class="text-slate-300">—</span>
                      </td>
                      <td
                        class="py-1.5 pr-3 text-right text-slate-500 whitespace-nowrap"
                        :title="row.run ? describeCompute(row.run.minutes, row.run.workers) : 'not recorded'"
                      >
                        {{ row.run ? `${formatMinutes(row.run.minutes)} × ${row.run.workers ?? 1}` : '—' }}
                      </td>
                      <td class="py-1.5">
                        <button
                          v-if="row.hasCsv"
                          type="button"
                          class="px-2 py-0.5 rounded-md border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 disabled:opacity-40"
                          :disabled="csvLoadingId === row.id"
                          @click="openTable(row, $event)"
                        >
                          {{ csvLoadingId === row.id ? 'Loading…' : loadedRun?.id === row.id ? 'Loaded' : 'Open' }}
                        </button>
                        <span v-else class="text-slate-300">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </section>

        <!-- ------------------------------------------------------------------ across the counts -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 class="text-lg font-black text-slate-900">Does one more ascension help?</h2>
          <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
            <b>How to read it:</b> Each line is one account. Lower means it finishes sooner, and 0 is that account's
            best count; where a line flattens out, more ascensions stopped helping.
          </p>
          <details>
            <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
              How this is worked out
            </summary>
            <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
              One line per account, never one line across accounts: a duration depends on artifacts, colleggtibles,
              research and starting TE at least as much as on the chain, so the fair way to ask this is to hold one
              account still and vary the count. Each point is how many days after that account's earliest finish the
              best plan at that count finishes, so a line only touches 0 at the count that holds it. That earliest
              finish is taken from all of the account's runs that still stand, the same one the runs table names. A
              solid line is one exhaustive run that timed several counts from one save; if that run no longer stands (a
              what-if, an old save), it is measured from its own best count instead, and its tooltip says so. A dashed
              line is the account's runs that still stand, the earliest finish at each count. Runs made on different
              days are compared by finish date, never by their totals: the same plan run a day later shows a day fewer.
              The chart opens on the first 20 days, where the counts that are close actually differ; a point further
              behind is an arrow at the top edge, its real value on hover or tap. Each marker also says how the run
              behind it searched, because a point is only the best plan that search found and the higher counts have
              mostly been searched more coarsely: the table under the chart says, for each step between two counts,
              whether the gap is bigger than that could explain.
            </p>
          </details>
          <CountCompareChart :comparisons="comparisons" :account-colors="accountColors" />
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 class="text-lg font-black text-slate-900">Each sweep, every account (to 490)</h2>
          <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
            <b>How to read it:</b> Each line is one run's full table: how much slower every TE at a checkpoint is than
            that run's best one. A narrow dip means the exact TE matters; the table under it says how many days a
            coarser search would have lost.
          </p>
          <details>
            <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
              How this is worked out
            </summary>
            <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
              Runs to 490 only, whatever target is picked above. For each TE at the picked checkpoint (the last by
              default), how far the best plan through it is behind that run's own best, as a percent of it, one line per
              run. Each line is one table priced from one save, so its shape is exact, and as a percent of its own best
              it compares between accounts whose plans differ in length; "TE above start" lines accounts up by where
              they started. It opens on 0 to 5% with a guide at 1%, which on a plan to 490 is about a week or more;
              "Whole range" shows the rest. The table under the chart is in days, each run against its own best: the
              best TE at that checkpoint, every TE within 1 and 3 days of it, and, for a run whose box tried every TE
              there, how many days a search at every 2nd, 5th or 10th TE would have lost.
            </p>
          </details>
          <SweepCurvesChart
            :base="base!"
            :rows="usable"
            :account-colors="accountColors"
            :account-labels="accountLabels"
          />
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-black text-slate-900">Gear</h2>
            <div class="flex gap-1.5">
              <button
                v-for="v in GEAR_VIEWS"
                :key="v.id"
                type="button"
                class="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
                :class="
                  gearView === v.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                "
                :aria-pressed="gearView === v.id"
                @click="gearView = v.id"
              >
                {{ v.label }}
              </button>
            </div>
          </div>
          <template v-if="gearView === 'map'">
            <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
              <b>How to read it:</b> each mark is one account: across is the TE it started from, up is its Clothed TE,
              darker is a stronger delivery set. Grey areas are where the board still wants accounts.
            </p>
            <details>
              <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
                How this is worked out
              </summary>
              <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
                Where the board's accounts sit, and where it has no data. One mark per account, from its newest run that
                recorded its gear: across is the TE that run started from, up is its Clothed TE, darker is a stronger
                delivery set. Clothed TE is TE plus what the earnings set adds, and every account so far adds between
                +115 and +129, so the marks sit on one narrow diagonal between the dashed guides. More TE has always
                come with more Clothed TE, so these runs cannot yet say whether a plan follows the gear or the TE. The
                pink band is where the planner estimates a first ascension stalls on Integrity, and no account is near
                it. The grey areas are open asks from What we need to check (the Science tab): places the board still
                wants more accounts from. One can already hold an account or two ("1 of 2"); it stays grey until enough
                have covered it.
              </p>
            </details>
            <GearMap :accounts="accounts" :what-ifs="whatIfs" />
          </template>
          <template v-else>
            <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
              <b>Delivery set</b>: each account's delivery set as a percent of the best possible, bars from 0; the grey
              ticks are the best peak delivery any of that account's runs to 490 reached. <b>Earnings set</b>: what its
              earnings set is worth, as Clothed TE minus TE, bars from 0 (TE and Clothed TE are in the tooltip: hover or
              tap a bar); Clothed TE alone mostly says how far along an account is, not how good its gear is.
            </p>
            <GearScoreChart :accounts="accounts" :account-colors="accountColors" :what-ifs="whatIfs" />
          </template>
        </section>

        <!-- ------------------------------------------------------------------------- deep dive -->
        <!-- Scrolled to when a table loads (`openTable`): it sits thousands of px below the button
             that opens it, so without the scroll "Open" looked like it did nothing. -->
        <section
          v-if="loadedRun"
          ref="deepDive"
          class="rounded-xl border border-slate-200 bg-white p-4 space-y-4 scroll-mt-4"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-lg font-black text-slate-900">
              Every chain {{ whoText(loadedRun) || 'that run' }} priced
              <span class="text-[11px] font-bold text-slate-400">
                · {{ loadedChains.length.toLocaleString() }} chains
                <!-- The file is in rank order, fastest first, and the cap keeps the first N — so
                     what a cap drops is the SLOW tail, not the old one. -->
                <template v-if="loadedTruncated">(slowest {{ loadedTruncated.toLocaleString() }} dropped)</template>
              </span>
            </h2>
            <div class="flex gap-2">
              <a
                href="#the-runs"
                class="px-3 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
                @click.prevent="backToRuns"
              >
                &uarr; Back to the runs
              </a>
              <button
                type="button"
                class="px-3 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
                @click="closeTable"
              >
                Close
              </button>
            </div>
          </div>

          <div v-if="plateau" class="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1"
                >Near the best means</span
              >
              <button
                v-for="t in TOLERANCES"
                :key="t.id"
                type="button"
                class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-colors"
                :class="
                  plateauTolerance === t.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                "
                :aria-pressed="plateauTolerance === t.id"
                @click="plateauTolerance = t.id"
              >
                within {{ t.label }}
              </button>
            </div>
            <p class="text-[11px] text-slate-600 leading-relaxed">
              <b>{{ plateau.near.toLocaleString() }}</b> of {{ plateau.total.toLocaleString() }} chains at
              {{ loadedRun.ascensions }} ascensions came within {{ toleranceText }} of this run's best ({{
                plateau.bestDays.toFixed(2)
              }}
              d, <span class="font-mono-premium">{{ plateau.bestChain.join(' ') }}</span
              >). That plateau put each checkpoint here:
            </p>
            <p class="text-[11px] font-mono-premium text-slate-700">
              <span v-for="band in plateau.bands" :key="band.index" class="mr-3">
                {{ band.index + 1 }}: {{ absoluteOf(band.lo) }}–{{ absoluteOf(band.hi) }}
              </span>
            </p>
            <p class="text-[10px] text-slate-400 leading-relaxed">
              A wide band means the exact value barely matters; a band one or two TE wide means it does. Both are
              measured against the space this run actually enumerated, so a band that runs to the edge of that space is
              telling you about the search as much as about the game. 1% of a 700-day plan is 7 days, more than most
              extra ascensions save, which is why this starts at 1 day. The chart marks the same line and the last
              checkpoint's band.
            </p>
          </div>

          <SearchShapeChart
            :points="loadedChains"
            :best-chain="loadedBestChain"
            :ref-lines="plateauRefLines"
            explorer-look
          />

          <div class="space-y-2 border-t border-slate-100 pt-4">
            <h3 class="text-sm font-black text-slate-900">What missing a checkpoint costs</h3>
            <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
              A plan rarely goes exactly to schedule: you are asleep when a checkpoint arrives, or you ascend a little
              early. This reads what that costs off this run's own table, where every plan was priced from the same
              save, so the days compare directly. For each checkpoint of the best plan and a miss of 1 or 2 TE either
              way, "keep" is the same plan with only that checkpoint moved, and "re-plan" is the fastest plan this run
              priced that shares the earlier checkpoints and the missed one, whatever it does after. On the tables sent
              so far, re-planning after an early miss usually wins back much of what keeping the old plan loses. A miss
              at the last checkpoint leaves nothing to re-plan: on some tables it is the costliest miss, on others an
              earlier miss costs more even after re-planning. The line under the table says which, for this run.
            </p>
            <MissTable :chains="loadedChains" :ascensions="loadedRun.ascensions" :truncated="loadedTruncated" />
          </div>

          <div class="space-y-2 border-t border-slate-100 pt-4">
            <h3 class="text-sm font-black text-slate-900">Every plan this run priced</h3>
            <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
              The run's whole table, fastest first: its top 10, 25 or 100, or every plan it checked, 100 to a page. All
              of them were priced from one save, so here, and only here, days compare directly: "vs best" is the gap
              between two plans and nothing else, and each finish date is this run's plan start plus that plan's days,
              in your timezone. Filter to plans with a checkpoint at a TE (280) or in a range (275-285), or download the
              full table with every leg.
            </p>
            <RunPlansTable
              :key="loadedRun.id"
              :chains="loadedChains"
              :run="loadedRun"
              :base="base ?? ''"
              :plan-start="loadedStart"
              :view-zone="viewZone"
              :truncated="loadedTruncated"
            />
          </div>
        </section>

        <p v-if="csvError" class="text-[11px] font-bold text-rose-700 px-1">{{ csvError }}</p>

        <!-- The specialist sections, one click away (review, 30 Sept): the sale plans the planner picks
             for you, one account's stored plans, day-to-day drift, and the checks on the runs themselves. -->
        <details class="rounded-xl border border-slate-200 bg-white p-4">
          <summary class="cursor-pointer text-[11px] font-black text-slate-600 uppercase tracking-widest">
            More charts and checks
          </summary>
          <div class="mt-3 space-y-4">
            <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <h2 class="text-lg font-black text-slate-900">Which sale plan wins each leg?</h2>
              <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
                <b>How to read it:</b> Each mark is one leg of a winning plan: where it starts (across), how far it
                climbs (up), and how many Research Sales the planner built through (colour).
              </p>
              <details>
                <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
                  How this is worked out
                </summary>
                <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
                  One mark per leg, from leg 2 on, of every plan whose finish still stands. Across is the TE the leg
                  starts at, up is how much TE it climbs, and the colour and shape are the sale plan the planner picked
                  for that leg (1, 2 or 3 sales); here the colours mean the sale plan, not an account. Leg 1 is left
                  out: it is the rest of the ascension in progress, so where it starts depends on when the plan was
                  made. A sale plan is a choice for one leg against a sale calendar everyone shares, so unlike a total
                  it lines up across accounts by TE. A leg one account sent in several runs is one mark. Larger, ringed
                  marks are legs that unlock research tier 13. The table under the chart names the commonest plan for
                  each 20-TE start band and leg length. It shows which plan won each leg of the winning chains, not by
                  how much it won.
                </p>
              </details>
              <SaleChoiceMap :rows="filtered" :judged="judged" :account-labels="accountLabels" />
            </section>
            <section v-if="base" class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <h2 class="text-lg font-black text-slate-900">An account's best plans, from all its stored tables</h2>
              <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
                <b>How to read it:</b> Pick an account and load its tables to see every plan its runs priced, best
                first, ranked by the date each reaches the target.
              </p>
              <details>
                <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
                  How this is worked out
                </summary>
                <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
                  A stored table is every plan one run priced, so besides each run's winner an account's tables hold its
                  runners-up, its other ascension counts and the plans one TE over. Pick an account and load its tables:
                  the list merges them and ranks every plan by finish date, the run's plan start plus the plan's days.
                  That is how plans from different saves of one account compare, since a table made a day later counts
                  every plan a day shorter. Only runs whose finish still stands are used; the line under the picker says
                  which were left out and why (tap one to see). A plan is a route under its run's settings, so a plan
                  priced with a schedule, or with "prestige now", is its own row, tagged. A plan two tables priced shows
                  its newest measurement. A plan with a checkpoint the account has since passed (most likely because it
                  followed that plan) is matched on what is left of it: a newer table's measurement of the rest stands,
                  and with none the older one stays, the passed checkpoint struck through. The tables are big, so they
                  load one at a time and only when you press the button; Cancel keeps what has arrived.
                </p>
              </details>
              <AccountTopPlans
                :base="base"
                :rows="usable"
                :judged="judged"
                :final-t-e="finalTE"
                :account-colors="accountColors"
                :account-labels="accountLabels"
              />
            </section>
            <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <h2 class="text-lg font-black text-slate-900">Does the best plan move from one day to the next?</h2>
              <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
                <b>How to read it:</b> Each line is one plan priced on different days. A line that rises is a plan whose
                finish slipped when priced again; a flat one held.
              </p>
              <details>
                <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
                  How this is worked out
                </summary>
                <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
                  One account at a time. Each mark is a plan at the date it was made, measured by its finish date as
                  days after the account's earliest finish that still stands; totals never compare across starts. A line
                  joins the same plan each time it was priced: by a newer run of it, by a newer run with the checkpoints
                  since passed dropped, by a re-check sent with a newer run, or because it turned up among a newer run's
                  runners-up. A line that rises is a plan whose finish slipped when priced again; a flat one is a plan
                  that holds. A plan that won its search was the fastest of many priced that day, so a small rise when
                  it is priced again is expected. The colour is the ascension count, not an account: one account is
                  shown at a time.
                </p>
              </details>
              <PlanDriftChart :rows="usable" :judged="judged" :final-t-e="finalTE" :account-labels="accountLabels" />
            </section>
            <!-- ------------------------------------------------------------------------------ checks -->
            <!-- Beside the runs the planner cannot help yet because it is the same kind of thing: a check on
                 the runs, not a finding about the game. -->
            <section
              v-if="part === 'insights' && rows.length"
              class="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
            >
              <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Checks</div>
              <h2 class="text-lg font-black text-slate-900">Did each final leg reach its gear's rate? (to 490)</h2>
              <p class="text-[12px] text-slate-700 leading-relaxed max-w-3xl">
                <b>How to read it:</b> Each point is one run. Near 100% means its last leg reached the delivery rate its
                gear should; below the 80% line the run is flagged and left out of the rest of the page.
              </p>
              <details>
                <summary class="cursor-pointer text-[10px] font-bold text-slate-400 hover:text-slate-600">
                  How this is worked out
                </summary>
                <p class="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-3xl">
                  One point per run to 490, whatever target is picked above. Across is the run's last checkpoint; up is
                  the peak delivery its final leg reached, as a percent of what its delivery set should reach from that
                  checkpoint. Below the 80% line the run is flagged for the old delivery-set bug (earnings researched
                  with the wrong set, so the farm never reached its real rate) and kept out of everything else on the
                  page. Runs the check cannot judge (a last checkpoint under 190 TE, no per-leg detail, or no delivery
                  set recorded) are counted in the note under the chart but not drawn. What each set "should reach" was
                  fitted on these same runs, so clean runs sit near 100% by construction: this checks the runs, it does
                  not measure the game.
                </p>
              </details>
              <FinalLegChart :rows="checkRows" :account-colors="accountColors" :account-labels="accountLabels" />
            </section>
            <!-- -------------------------------------------------- runs the planner cannot help yet -->
            <!-- Not "flagged": that word is the delivery-set check's, in the status line and the runs table,
                 and it is a different set of runs. The collector's own name for this list is the flagged
                 board (the id stays, for links already shared). Its own fetch, but it waits with the rest,
                 so nothing below the loading placeholder moves when the runs arrive. -->
            <section
              v-if="part === 'insights' && base && (rows.length || !loading)"
              id="flagged-board"
              class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 scroll-mt-4"
            >
              <div class="space-y-1">
                <h2 class="text-lg font-black text-slate-900">Runs the planner can't help yet</h2>
                <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
                  Runs from accounts where the planner stops working: a first ascension that sits on the Integrity shift
                  for over an hour, a plan past ten years, or a result that contradicts itself. They are kept apart from
                  everything above, because they are not routes to copy, and shown anonymously, except runs sent from
                  this browser, which show as yours. These are not the runs flagged for the delivery-set bug: those are
                  counted at the top of the page and drawn in the final-leg check.
                </p>
              </div>
              <FlaggedBoard :base="base" />
            </section>
          </div>
        </details>
      </template>

      <!-- ------------------------------------------------------------------------- data needs -->
      <!-- Only once the collector has answered: the asks are worked out from its runs, so from none
           they were all wrong, and when it fails they cannot be worked out at all. -->
      <section
        v-if="part === 'science' && scienceView === 'check' && base && (rows.length || !loading)"
        id="help-fill-the-gaps"
        class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 scroll-mt-4"
      >
        <!-- Inside the planner the Science tab's own heading says this. -->
        <div v-if="!embedded" class="space-y-1">
          <h2 class="text-lg font-black text-slate-900">Help fill the gaps</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            What the collected runs are still short of, worked out from them: each item drops off once enough accounts
            have covered it. Every run helps, even if nothing here matches your account, but these are the gaps where
            one more account teaches the most.
          </p>
        </div>
        <DataNeeds
          v-if="rows.length"
          :rows="usable"
          :te-from-save="teNow"
          :final-te="finalTe"
          :inventory="inventory"
          :run-in-place="embedded"
          @run="r => emit('run-sweep', r)"
          @run-by-date="r => emit('run-by-date', r)"
        />
        <p v-else class="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          The asks are worked out from the runs on the board, so they need the board, and it
          {{ error ? 'could not be read (see above)' : 'holds no runs yet' }}. Any run you submit below still helps.
        </p>
      </section>

      <!-- ---------------------------------------------------------------------------- upload -->
      <section
        v-if="part === 'science' && scienceView === 'submit' && base && (rows.length || !loading)"
        id="submit-a-sweep"
        class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 scroll-mt-4"
      >
        <div class="space-y-1">
          <h2 class="text-lg font-black text-slate-900">Submit a sweep</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            Ran a sweep and closed the tab, or ran it on another machine? Upload its two files here. They are checked
            against each other, for truncation and for the old delivery-set bug, before anything is sent.
          </p>
        </div>
        <SweepUpload :base="base" :rows="rows" @submitted="load" />
      </section>

      <!-- Where the two sections that used to end this page went. -->
      <section
        v-if="!embedded && part === 'insights' && base"
        class="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-2"
      >
        <h2 class="text-lg font-black text-slate-900">Help fill the gaps, and Submit a sweep</h2>
        <p class="text-[12px] text-indigo-900/80 leading-relaxed max-w-3xl">
          Both are on the planner's Science tab now, next to the searches that run the sweeps.
        </p>
        <div class="flex flex-wrap gap-2">
          <a
            :href="scienceHref('check')"
            class="px-3 py-2 rounded-lg bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800"
            >What we need to check &rarr;</a
          >
          <a
            :href="scienceHref('submit')"
            class="px-3 py-2 rounded-lg border border-indigo-300 bg-white text-[10px] font-black uppercase tracking-widest text-indigo-800 hover:border-indigo-500"
            >Submit a sweep &rarr;</a
          >
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import SearchShapeChart from '@/components/auto/charts/SearchShapeChart.vue';
import type { PricedChain } from '@/search/types';
import { describeCompute, formatMinutes } from '@/utils/computeTime';
import CountShapeChart from './CountShapeChart.vue';
import LegProfileChart from './LegProfileChart.vue';
import CountCompareChart from './CountCompareChart.vue';
import FinalLegChart from './FinalLegChart.vue';
import DataNeeds from './DataNeeds.vue';
import type { InventoryCount } from '@/search/csv';
import type { ByDateRequest } from '@/search/byDateRequest';
import type { SweepRequest } from '@/search/sweepRequest';
import FlaggedBoard from './FlaggedBoard.vue';
import NewVersionBanner from '@/components/NewVersionBanner.vue';
import WhatWeKnow from './WhatWeKnow.vue';
import { knowStats } from './knowStats';
import { describeFetchError, errorKind } from '@/utils/errors';
import SweepCurvesChart from './SweepCurvesChart.vue';
import GearScoreChart from './GearScoreChart.vue';
import BestCountMatrix from './BestCountMatrix.vue';
import SaleChoiceMap from './SaleChoiceMap.vue';
import AccountTopPlans from './AccountTopPlans.vue';
import MissTable from './MissTable.vue';
import RunPlansTable from './RunPlansTable.vue';
import GearMap from './GearMap.vue';
import PlanDriftChart from './PlanDriftChart.vue';
import SweepUpload from './SweepUpload.vue';
import {
  fetchAllRows,
  fetchRunCsv,
  normaliseCollectorBase,
  parseRunCsv,
  resolveCollectorBase,
  type CollectorRow,
} from './collector';
import {
  accountKey,
  accountOrder,
  assessFinishes,
  bestPerCount,
  compareCounts,
  DEFAULT_RUN_SORT,
  finishJudgement,
  flagOf,
  foldRuns,
  groupByAccount,
  groupByCount,
  isProof,
  nearBestBands,
  rateCheckOf,
  RUN_SORT_START,
  runsByAccount,
  runTags,
  SAME_FINISH_DAYS,
  searchedOf,
  summariseRuns,
  targetsPresent,
  timeOffKey,
  whatIfIds,
  type AssessedFinishes,
  type RunSort,
  type RunSortKey,
} from './analysis';
import {
  finishDateText,
  finishTitle,
  formatDate,
  localZone,
  signedDays,
  sameSave,
  startMs,
  stateTag,
  whoText,
} from '@/lib/leaderboardRank';
import AccountDot from './AccountDot.vue';
import { leftOf, leftShareText, leftTitle, longEstimate, plansText, type Left } from './left';
import { measuredWorkerSeconds } from '@/search/speed';

/**
 * Which part of the Explorer to draw. On its own page (explorer.html) it's the charts, "Insights".
 * Inside the planner it's Compare > Insights, or the Science tab: what the runs still need and the
 * sweep upload, which moved there from this page (the unified layout, phase 4). `embedded` drops
 * the page's own header and update notice, which the planner has.
 */
const props = withDefaults(
  defineProps<{
    part?: 'insights' | 'science';
    embedded?: boolean;
    scienceView?: 'check' | 'submit';
    /** The planner's loaded TE, for What we need to check's ranges. */
    teNow?: number;
    /** The planner's Final target TE, for the name of the Fastest screen (490 when left out). */
    finalTe?: number;
    /** The loaded save's artifacts, to mark the gear cards it matches. */
    inventory?: InventoryCount[];
  }>(),
  { part: 'insights', embedded: false, scienceView: 'check', teNow: 0 }
);
/** A sweep from What we need to check, to run in the planner (embedded only; the planner owns the
 *  stores a run needs, which this page never touches). */
const emit = defineEmits<{ 'run-sweep': [request: SweepRequest]; 'run-by-date': [request: ByDateRequest] }>();

/** Where a pasted collector URL is remembered. Per-browser, not per-build. */
const BASE_STORAGE_KEY = 'chainExplorerCollector';

const base = ref<string | null>(null);
const typedBase = ref('');
const rows = ref<CollectorRow[]>([]);
/** By a date answers, kept apart: no chart reads them, the What we know card does. */
const byDateRows = ref<CollectorRow[]>([]);
const loading = ref(false);
const error = ref('');

const finalTE = ref(0);
const exhaustiveOnly = ref(false);
/** One ascension count, or every count at once. */
const selectedCount = ref<number | 'all'>(0);
/** The clock the Leaderboard's rules are judged on. Set at each load, so every judgement agrees. */
const now = ref(Date.now());
/** Every date on the page is shown in the viewer's timezone, one calendar for all of them; the
 *  player's own is in the tooltip. Same convention as the Leaderboard. */
const viewZone = localZone();

const csvLoadingId = ref('');
const csvError = ref('');
const loadedRun = ref<CollectorRow | null>(null);
const loadedChains = ref<PricedChain[]>([]);
const loadedTruncated = ref(0);
const loadedCurrentTE = ref(0);
const loadedFinalTE = ref(0);

onMounted(() => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(BASE_STORAGE_KEY);
  } catch {
    // Blocked storage (a private window, a browser set to refuse site data): nothing remembered.
  }
  base.value = resolveCollectorBase() ?? stored;
  if (base.value) void load();
});

/**
 * In-flight requests, so a second one can cancel the first.
 *
 * Both endpoints can be slow -- `/csv` is up to 15 MB -- and without this a click on run A followed
 * by a click on run B is a race whose winner is whichever server response happens to land last.
 * That is not a rare case: "Open" is right next to "Open". `fetchAll`/`fetchRunCsv` have always
 * taken an AbortSignal; nothing was passing one.
 */
let allController: AbortController | null = null;
let csvController: AbortController | null = null;
// Inside the planner this goes away on every tab switch: don't leave a 15 MB CSV downloading.
onUnmounted(() => {
  allController?.abort();
  csvController?.abort();
});

/** The planner's Science tab, a page in this same build (lib/siteNav.ts has its addresses). The
 *  query goes along, so a link aimed at another collector (?collector=) still reads that one. */
function scienceHref(view: 'check' | 'submit'): string {
  const search = typeof location === 'undefined' ? '' : location.search;
  return `./${search}${view === 'submit' ? '#/science/submit' : '#/science'}`;
}
// Links to the two sections this page used to end with go where they are now.
if (!props.embedded && typeof location !== 'undefined') {
  if (location.hash === '#help-fill-the-gaps') location.replace(scienceHref('check'));
  else if (location.hash === '#submit-a-sweep') location.replace(scienceHref('submit'));
}

/** An aborted request is the expected outcome of clicking twice, not an error to report. */
function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

async function load(): Promise<void> {
  if (!base.value) return;
  allController?.abort();
  const controller = new AbortController();
  allController = controller;
  loading.value = true;
  error.value = '';
  try {
    const fetched = await fetchAllRows(base.value, controller.signal);
    if (allController !== controller) return;
    now.value = Date.now();
    rows.value = fetched.rows;
    byDateRows.value = fetched.byDate;
    if (!rows.value.length) error.value = 'The collector answered, but it is holding no runs yet.';
  } catch (e) {
    if (isAbort(e) || allController !== controller) return;
    // A failed fetch here is almost always CORS or a typo'd host, and the browser's own message
    // for both is "Failed to fetch". Say which two things to check rather than repeating it.
    rows.value = [];
    byDateRows.value = [];
    error.value =
      errorKind(e) === 'network'
        ? describeFetchError(e, 'the collector')
        : `Check the URL, and that the collector allows this origin. (${e instanceof Error ? e.message : String(e)})`;
  } finally {
    if (allController === controller) {
      loading.value = false;
      allController = null;
    }
  }
}

function adoptTypedBase(): void {
  // Same normaliser the query parameter goes through, rather than a second copy of the same two
  // regexes and the same scheme check drifting apart from it.
  const normalised = normaliseCollectorBase(typedBase.value);
  if (!normalised) {
    error.value = 'That does not look like an http(s) URL.';
    return;
  }
  base.value = normalised;
  try {
    localStorage.setItem(BASE_STORAGE_KEY, normalised);
  } catch {
    // Not remembered, but still used for this visit.
  }
  void load();
}

function forgetBase(): void {
  try {
    localStorage.removeItem(BASE_STORAGE_KEY);
  } catch {
    // Nothing could have been stored.
  }
  typedBase.value = base.value ?? '';
  base.value = null;
  rows.value = [];
  byDateRows.value = [];
  closeTable();
}

/** Rows whose delivery rate is not their gear's, by id, with the reason. See `flagOf`. */
const flagged = computed(() => {
  const map = new Map<string, string>();
  for (const r of rows.value) {
    const why = flagOf(r);
    if (why) map.set(r.id, why);
  }
  return map;
});
const showFlagged = ref(false);

/** Runs the delivery-rate check could not look at, by id, with the reason (`rateCheckOf`). Not
 *  flagged -- nothing is against them -- but shown as unchecked rather than passing as clean. */
const unchecked = computed(() => {
  const map = new Map<string, string>();
  for (const r of rows.value) {
    const check = rateCheckOf(r);
    if (check.state === 'unchecked') map.set(r.id, check.why);
  }
  return map;
});

/**
 * Runs planned around time off from the virtue farm. Hidden by default: a week away ends the
 * ascension in progress and costs a full rebuild, so its chain and total answer a different
 * question from every other row, and mixed in they would bend the curves and count as filling a
 * sweep gap they do not fill.
 */
const withTimeOff = computed(() => new Set(rows.value.filter(r => r.timeOff?.length).map(r => r.id)));
const showTimeOff = ref(false);

/** The rows the filters above let through, every copy of a result still in. */
const visible = computed(() =>
  rows.value.filter(
    r => (showFlagged.value || !flagged.value.has(r.id)) && (showTimeOff.value || !withTimeOff.value.has(r.id))
  )
);

/** Copies of one result folded onto one row. Hidden everywhere: they would count one run twice. */
const folded = computed(() => foldRuns(visible.value));

/** What every view on the page reads: each result once. */
const usable = computed(() => folded.value.rows);

const targets = computed(() => targetsPresent(usable.value));

// Default to the target most runs used, then leave it alone: re-picking it on every refresh would
// yank the page out from under someone who had chosen another.
watch(targets, list => {
  if (list.length && !list.some(t => t.finalTE === finalTE.value)) finalTE.value = list[0].finalTE;
});

/**
 * What the final-leg check draws: every result once, flagged runs INCLUDED whatever the checkbox
 * says, since the runs below its 80% line are the ones it exists to show. Time off still filters: a
 * run planned around a week away has a final leg that answers another question.
 */
const checkRows = computed(
  () => foldRuns(rows.value.filter(r => showTimeOff.value || !withTimeOff.value.has(r.id))).rows
);

/** Every result at the picked target, before Proofs only: which counts an account tried at all. */
const atTarget = computed(() => usable.value.filter(r => r.finalTE === finalTE.value));

const filtered = computed(() => atTarget.value.filter(r => !exhaustiveOnly.value || isProof(r)));

/**
 * Every account there is, from every row, filters or not: the colour order and the names. Built on
 * the unfiltered rows so ticking a box never repaints or renames an account (palette.ts).
 */
const everyAccount = computed(() => groupByAccount(foldRuns(rows.value).rows));

/** Account keys in the order each first sent a run: the colour order, and the runs table's. */
const colourOrder = computed(() => accountOrder(rows.value));

/** Colour index per account, fixed across every chart and the runs table (`colorAt`, `symbolAt`). */
const accountColors = computed(() => new Map(colourOrder.value.map((key, i) => [key, i])));

/** One name per account for every chart, legend and table. No two accounts share one. */
const accountLabels = computed(() => new Map(everyAccount.value.map(a => [a.key, a.label])));

/** The accounts the filters let through, under the page's names. */
const accounts = computed(() =>
  groupByAccount(usable.value).map(a => ({ ...a, label: accountLabels.value.get(a.key) ?? a.label }))
);

const totalChainsPriced = computed(() => usable.value.reduce((n, r) => n + (r.chainsPriced || 0), 0));
/** Worker time across the runs that recorded their cost: wall-clock minutes x workers, summed. */
const computeTotal = computed(() => {
  let minutes = 0;
  let runs = 0;
  for (const r of usable.value) {
    if (!r.run || !Number.isFinite(r.run.minutes)) continue;
    minutes += r.run.minutes * (r.run.workers || 1);
    runs++;
  }
  return { minutes, runs };
});

const countGroups = computed(() => groupByCount(filtered.value));
const allGroup = computed(() => summariseRuns(filtered.value));

watch(countGroups, list => {
  // "All" always has something to show while any count does; only a count can vanish.
  if (selectedCount.value === 'all') return;
  if (list.length && !list.some(g => g.ascensions === selectedCount.value)) {
    // The count with the most runs behind it, which is the one with something to say.
    selectedCount.value = list.reduce((a, b) => (b.rows.length > a.rows.length ? b : a)).ascensions;
  }
});

const selectedGroup = computed(() =>
  selectedCount.value === 'all' ? null : (countGroups.value.find(g => g.ascensions === selectedCount.value) ?? null)
);
const selected = computed(() =>
  selectedCount.value === 'all' ? (filtered.value.length ? allGroup.value : null) : selectedGroup.value
);

/**
 * The runs the finishes are judged on. Whether a run is SHOWN must not change which OTHER runs
 * stand, so runs planned around time off are judged whether or not they are listed: `samePlan`
 * compares time off, so one never replaces a normal plan, but it is still evidence of the TE the
 * account had that day, and hiding it used to let an older plan from a higher TE stand again. Runs
 * flagged for the delivery-set bug stay out unless they are shown: their legs and totals are wrong,
 * so as a newer run of a plan they would replace a good finish with a bad one, and their legs would
 * put the player behind a plan they are on. Every copy and every target is in (a run to 300 is
 * evidence of the account's TE too).
 */
const judgedRows = computed(() => rows.value.filter(r => showFlagged.value || !flagged.value.has(r.id)));

/**
 * The Leaderboard's judgement of `rows` at any target (`assessFinishes`), made at most once per
 * target until the next load: the page's `judged` reads its target's, the what-ifs read every
 * target's, so the players are grouped once per target rather than again for the what-ifs. The
 * reasons read their dates on the viewer's calendar, like every other date on the page.
 */
function assessorOf(source: () => CollectorRow[]) {
  return computed(() => {
    const list = source();
    const at = now.value;
    const memo = new Map<number, AssessedFinishes>();
    return (target: number): AssessedFinishes => {
      let assessed = memo.get(target);
      if (!assessed) {
        assessed = assessFinishes(list, target, at, viewZone);
        memo.set(target, assessed);
      }
      return assessed;
    };
  });
}
/** One for each set `judgedRows` can be, so ticking "include them" back and forth judges each set
 *  once, not on every tick. */
const assessWithoutFlagged = assessorOf(() => rows.value.filter(r => !flagged.value.has(r.id)));
const assessWithFlagged = assessorOf(() => rows.value);
const assessAt = computed(() => (showFlagged.value ? assessWithFlagged.value : assessWithoutFlagged.value));

/** Each run's finish date and whether it still stands, by the Leaderboard's rules. Only a run the
 *  checkboxes above let through can be an account's best. */
const judged = computed(() => finishJudgement(assessAt.value(finalTE.value), new Set(visible.value.map(r => r.id))));

/** The What we know card's counted numbers: always the runs to 490, whatever target is picked below. */
const knowSummary = computed(() =>
  rows.value.length
    ? knowStats(
        usable.value,
        finishJudgement(assessAt.value(490), new Set(visible.value.map(r => r.id))),
        whatIfs.value,
        byDateRows.value,
        now.value
      )
    : null
);

/** Runs the Leaderboard's rules call what-ifs, at every target: the gear views never place an account
 *  by one, since its TE was typed in rather than the account's. The same set gearMap.ts `whatIfRuns`
 *  gives, read off the judgements above. */
const whatIfs = computed(() => whatIfIds(targetsPresent(judgedRows.value).map(t => assessAt.value(t.finalTE))));

/**
 * The checkpoint chart's one run per account at the picked count: its earliest finish that still
 * stands, or its newest run there when none does (`bestPerCount`).
 */
const selectedBests = computed(() => {
  const count = selectedCount.value;
  if (count === 'all') return [];
  return [...bestPerCount(selected.value?.rows ?? [], judged.value, { standIn: true }).values()].flatMap(counts => {
    const best = counts.get(count);
    return best ? [best] : [];
  });
});

/** Ids of the listed runs whose finish still stands. */
const standingIds = computed(
  () => new Set((selected.value?.rows ?? []).filter(r => judged.value.byId.get(r.id)?.standing).map(r => r.id))
);

/* ------------------------------------------------------------ the runs table: order and folding */

/** Where the runs table's order and folded accounts are remembered. Per-browser, like the URL. */
const RUN_VIEW_STORAGE_KEY = 'chainExplorerRunView';

/** The saved order and folded accounts, or nothing when there are none or storage is blocked. */
function readRunView(): { sort: RunSort; collapsed: string[] } | null {
  try {
    const raw = localStorage.getItem(RUN_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { sort?: Partial<RunSort>; collapsed?: unknown };
    const by = saved.sort?.by;
    const dir = saved.sort?.dir;
    return {
      sort:
        typeof by === 'string' && Object.hasOwn(RUN_SORT_START, by) && (dir === 'asc' || dir === 'desc')
          ? { by, dir }
          : { ...DEFAULT_RUN_SORT },
      collapsed: Array.isArray(saved.collapsed)
        ? saved.collapsed.filter((k): k is string => typeof k === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

const savedRunView = readRunView();
/** The order the player picked for each account's runs. Accounts themselves never reorder. */
const runSort = ref<RunSort>(savedRunView?.sort ?? { ...DEFAULT_RUN_SORT });
/** Accounts whose runs are folded away (by `accountKey`). Replaced, never mutated, so it saves. */
const collapsed = ref<ReadonlySet<string>>(new Set(savedRunView?.collapsed ?? []));

watch([runSort, collapsed], () => {
  try {
    localStorage.setItem(
      RUN_VIEW_STORAGE_KEY,
      JSON.stringify({ sort: runSort.value, collapsed: [...collapsed.value] })
    );
  } catch {
    // Private windows and blocked storage: the choice just lasts until the tab closes.
  }
});

/** The picks on offer. The ascension count only means something with every count listed. */
const runSortOptions = computed(() =>
  (
    [
      { by: 'finish', label: 'Finish' },
      { by: 'planned', label: 'Planned' },
      { by: 'length', label: 'Plan length' },
      { by: 'ascensions', label: 'Ascensions' },
      { by: 'te', label: 'Starting TE' },
      { by: 'priced', label: 'Chains priced' },
      { by: 'left', label: "What's left" },
      { by: 'compute', label: 'Compute' },
    ] as { by: RunSortKey; label: string }[]
  ).filter(o => o.by !== 'ascensions' || selectedCount.value === 'all')
);

/** The order in force: a count sort picked under "All" falls back to finish on one count. */
const activeSort = computed<RunSort>(() =>
  runSort.value.by === 'ascensions' && selectedCount.value !== 'all' ? DEFAULT_RUN_SORT : runSort.value
);

/** Pick an order; picking the one in force flips it, the way a column header usually does. */
function sortRunsBy(by: RunSortKey): void {
  runSort.value =
    activeSort.value.by === by
      ? { by, dir: activeSort.value.dir === 'asc' ? 'desc' : 'asc' }
      : { by, dir: RUN_SORT_START[by] };
}

function flipRunSort(): void {
  sortRunsBy(activeSort.value.by);
}

/** The direction in words that fit the order: "earliest first" reads better than "ascending". */
function sortDirText(sort: RunSort): string {
  const asc = sort.dir === 'asc';
  switch (sort.by) {
    case 'finish':
      return asc ? 'earliest first' : 'latest first';
    case 'planned':
      return asc ? 'oldest first' : 'newest first';
    case 'length':
      return asc ? 'shortest first' : 'longest first';
    default:
      return asc ? 'lowest first' : 'highest first';
  }
}

/** What a screen reader hears for a sortable column: the arrows are hidden from it. */
function ariaSort(by: RunSortKey): 'ascending' | 'descending' | 'none' {
  if (activeSort.value.by !== by) return 'none';
  return activeSort.value.dir === 'asc' ? 'ascending' : 'descending';
}

function sortArrow(by: RunSortKey): string {
  return activeSort.value.by === by ? (activeSort.value.dir === 'asc' ? ' ↑' : ' ↓') : '';
}

/** Header buttons keep the header's look (a button resets text-transform and centres its text) and
 *  mark the order in force. */
function sortHeadClass(by: RunSortKey): string {
  return `uppercase tracking-widest [text-align:inherit] hover:text-slate-600 ${activeSort.value.by === by ? 'text-slate-700' : ''}`;
}

function setCollapsed(keys: string[], fold: boolean): void {
  const next = new Set(collapsed.value);
  for (const k of keys) {
    if (fold) next.add(k);
    else next.delete(k);
  }
  collapsed.value = next;
}

/** The runs table: one block per account in colour order, each ordered as picked inside. */
const runBlocks = computed(() =>
  runsByAccount(selected.value?.rows ?? [], judged.value, accountLabels.value, colourOrder.value, activeSort.value, {
    left: row => leftById.value.get(row.id)?.left ?? null,
  })
);

/** Accounts whose earliest finish is one of the runs listed. The rest say why it is not. */
const bestListed = computed(
  () => new Set(runBlocks.value.filter(b => b.rows.some(r => judged.value.byId.get(r.id)?.best)).map(b => b.key))
);

/** Why an account's earliest finish is not in the list, in a few words. */
function unlistedWhy(best: CollectorRow): string {
  const why: string[] = [];
  if (selectedCount.value !== 'all' && best.ascensions !== selectedCount.value) why.push('a different count');
  if (exhaustiveOnly.value && !isProof(best)) why.push('not a proof');
  return why.join(', ') || 'filtered out';
}

/** The settings that tell look-alike runs apart (the Leaderboard's `settingTags`): two runs with one
 *  route and start that differ only in whether the first ascension finishes the current run first.
 *  Plus `time off` on any run planned around some, which the Leaderboard's tags leave out (`runTags`). */
const tags = computed(() => runTags(usable.value, viewZone));

/** "What was checked" for each run listed, by id (`searchedOf`). */
const searched = computed(() => new Map((selected.value?.rows ?? []).map(r => [r.id, searchedOf(r)])));

/** The board's own speed per plan by ascension count, for "how long the rest would take". */
const speeds = computed(() => measuredWorkerSeconds(usable.value));

/** "What's left" for each run listed that tried a fixed box, by id (`leftOf`). */
const leftById = computed(() => {
  const map = new Map<string, Left>();
  for (const r of selected.value?.rows ?? []) {
    const l = leftOf(r, speeds.value);
    if (l) map.set(r.id, l);
  }
  return map;
});

const comparisons = computed(() => compareCounts(filtered.value, judged.value, accountLabels.value));

/** The Planned column: the plan start in the viewer's zone, to the minute. */
function plannedText(row: CollectorRow): string {
  return formatDate(judged.value.byId.get(row.id)?.start ?? null, viewZone, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The tag a run whose finish no longer stands carries: `what-if`, `replaced`, ... ('' otherwise). */
function stateOf(row: CollectorRow): string {
  const j = judged.value.byId.get(row.id);
  return j && !j.standing ? stateTag(j.state) : '';
}

/** Closer than the two decimals days are shown in is the same finish: `+0.00 d` would read as a
 *  measured gap. */
function vsBestText(behind: number): string {
  return behind < SAME_FINISH_DAYS ? 'same finish' : signedDays(behind);
}

function vsBestTitle(row: CollectorRow): string {
  const j = judged.value.byId.get(row.id);
  if (!j) return '';
  if (j.best) return "This account's earliest finish at this target.";
  if (j.behind == null) return j.reason ? `Not compared: ${j.reason}.` : 'Not compared.';
  // Name the run it is measured against: under Proofs only or one count it may not be listed.
  const key = accountKey(row);
  const best = judged.value.bestByAccount.get(key);
  let against = "this account's earliest finish";
  if (best) {
    against += `, ${best.row.chain.join(' ')} (${best.row.ascensions} ascensions) on ${finishDateText(best.finish, viewZone)}`;
    if (!bestListed.value.has(key)) against += ', not listed here';
  }
  const days =
    j.behind < SAME_FINISH_DAYS
      ? `Finishes at the same time as ${against}`
      : `Finishes ${signedDays(j.behind).replace(/^[+−]/, '')} after ${against}`;
  // Time off before saves: a time-off copy of a normal run shares its save, and the gap is the time away.
  if (best && timeOffKey(row) !== timeOffKey(best.row)) {
    return `${days}. The two are planned around different time off, so part of the gap is the time away, not the plans.`;
  }
  if (j.sameSaveAsBest) return `${days}. Planned from the same save as that run, so the gap is the plans alone.`;
  // Same save, different planner build: the Leaderboard's "other version".
  if (best && sameSave(row, best.row)) {
    return `${days}. Planned from the same save as that run but by a different version of the planner, so part of the gap can be the planner itself.`;
  }
  return `${days}. Planned from a different save, so part of the gap can be what changed in between.`;
}

/* ----------------------------------------------------------------- one run's full chain table */

/** The deep dive, to scroll to when a table loads. */
const deepDive = ref<HTMLElement | null>(null);
/** The "Open" button a table was opened from, so "Back to the runs" can return to it. */
let openedFrom: HTMLElement | null = null;

/** Smooth unless the reader has asked for less motion. */
function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Back from the deep dive to the row it was opened from, or to the top of the runs table. */
function backToRuns(): void {
  const target = openedFrom?.isConnected ? openedFrom : document.getElementById('the-runs');
  target?.scrollIntoView({ behavior: scrollBehaviour(), block: openedFrom?.isConnected ? 'center' : 'start' });
}

async function openTable(row: CollectorRow, event?: Event): Promise<void> {
  if (!base.value) return;
  if (event?.currentTarget instanceof HTMLElement) openedFrom = event.currentTarget;
  csvController?.abort();
  const controller = new AbortController();
  csvController = controller;
  csvLoadingId.value = row.id;
  csvError.value = '';
  try {
    const text = await fetchRunCsv(base.value, row.id, controller.signal);
    // Two `await`s back, so re-check: a later click may have superseded this one while the 15 MB
    // was still arriving, and writing these refs now would show that run's chart under this run's
    // heading.
    if (csvController !== controller) return;
    const parsed = parseRunCsv(text);
    loadedRun.value = row;
    loadedChains.value = parsed.chains;
    loadedTruncated.value = parsed.truncated;
    // The file's own header is authoritative: it is what the run was actually simulated against,
    // and the summary row can differ if the account moved between the run and the submission.
    loadedCurrentTE.value = parsed.currentTE || row.currentTE;
    loadedFinalTE.value = parsed.finalTE || row.finalTE;
    if (!parsed.chains.length) csvError.value = 'That table parsed to no chains, which means the format has moved.';
    // It opens thousands of px below the button: take the reader there, or "Open" looks dead.
    await nextTick();
    if (csvController === controller) deepDive.value?.scrollIntoView({ behavior: scrollBehaviour(), block: 'start' });
  } catch (e) {
    if (isAbort(e) || csvController !== controller) return;
    csvError.value = describeFetchError(e, "that run's table");
  } finally {
    if (csvController === controller) {
      csvLoadingId.value = '';
      csvController = null;
    }
  }
}

function closeTable(): void {
  csvController?.abort();
  csvController = null;
  csvLoadingId.value = '';
  loadedRun.value = null;
  loadedChains.value = [];
  loadedTruncated.value = 0;
  csvError.value = '';
}

// The deep dive belongs to ONE run. Change the target, the count or a filter so that run is no longer
// in view and it would be a 60,000-point scatter under a heading about a run nobody can see, so it
// closes. Switching between "All" and the run's own count keeps it: the run is still listed.
watch(selected, group => {
  const run = loadedRun.value;
  if (run && !group?.rows.some(r => r.id === run.id)) closeTable();
});

/** The Gear section's two views: where accounts sit (TE against Clothed TE) or the per-account bars. */
const GEAR_VIEWS = [
  { id: 'map', label: 'Map' },
  { id: 'bars', label: 'Bars' },
] as const;
const gearView = ref<'map' | 'bars'>('map');

/** The loaded run's plan start (ms), so its plans list can give each plan a finish date. */
const loadedStart = computed(() =>
  loadedRun.value ? (judged.value.byId.get(loadedRun.value.id)?.start ?? startMs(loadedRun.value)) : null
);

const loadedBestChain = computed(() => {
  if (!loadedChains.value.length) return [];
  return loadedChains.value.reduce((a, b) => (b.days < a.days ? b : a)).chain;
});

/**
 * What "near the best" means for the plateau: a number of days by default, because 1% of a 700-day
 * plan is 7 days -- more than most gains from one more ascension -- and on Allan's every-TE
 * 4-ascension box it took in 5,705 of its 9,261 plans, a plateau that was the whole box.
 */
type Tolerance = '1d' | '3d' | '1pct';
const TOLERANCES: { id: Tolerance; label: string; days?: number }[] = [
  { id: '1d', label: '1 day', days: 1 },
  { id: '3d', label: '3 days', days: 3 },
  { id: '1pct', label: '1%' },
];
const plateauTolerance = ref<Tolerance>('1d');
const tolerance = computed(() => TOLERANCES.find(t => t.id === plateauTolerance.value) ?? TOLERANCES[0]);

// At the loaded run's own count, not the selected one: under "All" there is no selected count, and
// the plateau is a question about that run's table.
const plateau = computed(() =>
  loadedChains.value.length && loadedRun.value
    ? nearBestBands(
        loadedChains.value,
        loadedCurrentTE.value,
        loadedFinalTE.value,
        loadedRun.value.ascensions,
        tolerance.value.days != null ? { days: tolerance.value.days } : 0.01
      )
    : null
);

/** The tolerance in days, whichever way it was picked. */
const toleranceDays = computed(() => tolerance.value.days ?? (plateau.value?.bestDays ?? 0) * 0.01);

/** The tolerance in words; 1% says what it comes to on this plan. */
const toleranceText = computed(() =>
  tolerance.value.days != null ? tolerance.value.label : `1% (${toleranceDays.value.toFixed(1)} days)`
);

/** The plateau on the deep-dive chart: a line at the best plus the tolerance, and the band the last
 *  checkpoint's near-best plans used, labelled once. The labels are short: on a phone the long one
 *  ran over the near-best plans, and the panel above already says it in full. */
const plateauRefLines = computed(() => {
  const p = plateau.value;
  if (!p) return undefined;
  const last = p.bands[p.bands.length - 1];
  const plus = tolerance.value.days != null ? `${tolerance.value.days} d` : `1% (${toleranceDays.value.toFixed(1)} d)`;
  return {
    y: p.bestDays + toleranceDays.value,
    yLabel: `best + ${plus}`,
    band: last ? ([absoluteOf(last.lo), absoluteOf(last.hi)] as [number, number]) : undefined,
  };
});

function absoluteOf(fraction: number): number {
  return Math.round(loadedCurrentTE.value + fraction * (loadedFinalTE.value - loadedCurrentTE.value));
}
</script>
