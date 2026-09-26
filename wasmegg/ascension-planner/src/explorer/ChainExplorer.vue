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
  <div class="min-h-screen bg-slate-100 text-slate-800">
    <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Chain Explorer</h1>
        <p class="text-sm text-slate-500 max-w-3xl leading-relaxed">
          Every run submitted to the collector, grouped by how many ascensions it takes. Pick a count to see where each
          ascension lands, how long each leg runs, and whether the shape repeats across accounts.
        </p>
      </header>

      <NewVersionBanner page-url="./explorer.html" entry="explorer" />

      <!-- Points at "Help fill the gaps", which lives at the bottom beside the upload on purpose. -->
      <a
        v-if="base"
        href="#help-fill-the-gaps"
        class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 hover:bg-indigo-100"
        @click.prevent="scrollToGaps"
      >
        <span class="text-[13px] font-bold">
          Want to help make AAAP better? Run one of the sweeps we still need and submit it.
        </span>
        <span class="text-[10px] font-black uppercase tracking-widest">See what's needed &darr;</span>
      </a>

      <!-- ------------------------------------------------------------------ source and loading -->
      <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div v-if="!base" class="space-y-2">
          <p class="text-sm font-bold text-slate-700">No collector configured for this copy of the page.</p>
          <p class="text-[12px] text-slate-500 leading-relaxed">
            Paste the collector's base URL — the same Worker the planner's Submit button posts to, without the
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
            <p v-else class="text-sm font-bold text-slate-700">
              {{ usable.length.toLocaleString() }} runs · {{ accounts.length }} accounts ·
              {{ totalChainsPriced.toLocaleString() }} chains priced between them<template v-if="computeTotal.runs">
                · {{ formatMinutes(computeTotal.minutes) }} of computing</template
              >
            </p>
            <p v-if="!loading && computeTotal.runs" class="text-[11px] text-slate-500">
              Worker time from the {{ computeTotal.runs }} run{{ computeTotal.runs === 1 ? '' : 's' }} that recorded it
              (minutes x workers); runs from older versions and from uploads did not.
            </p>
            <p
              v-if="!loading && (folded.hidden.size || flagged.size || withTimeOff.size)"
              class="text-[11px] text-slate-500"
            >
              <template v-if="folded.hidden.size">
                {{ folded.hidden.size }} repeat send{{ folded.hidden.size === 1 ? '' : 's' }} of a result already listed
                folded in (the same plan from the same save: sent twice, sent with and without a name, or found by two
                searches).
              </template>
              <template v-if="flagged.size">
                {{ flagged.size }} run{{ flagged.size === 1 ? '' : 's' }} flagged for the delivery-set bug,
                <label class="inline-flex items-center gap-1 font-bold text-slate-600">
                  <input v-model="showFlagged" type="checkbox" class="rounded border-slate-300 text-amber-600" />
                  include them
                </label>
              </template>
              <template v-if="withTimeOff.size">
                {{ withTimeOff.size }} run{{ withTimeOff.size === 1 ? '' : 's' }} planned around time off (a different
                question: the farm stops and is rebuilt),
                <label class="inline-flex items-center gap-1 font-bold text-slate-600">
                  <input v-model="showTimeOff" type="checkbox" class="rounded border-slate-300 text-amber-600" />
                  include them
                </label>
              </template>
            </p>
            <p class="text-[10px] font-mono-premium text-slate-400 truncate max-w-xl">{{ base }}</p>
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
              type="button"
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
              @click="forgetBase"
            >
              Change collector
            </button>
          </div>
        </div>
      </section>

      <template v-if="rows.length">
        <!-- ---------------------------------------------------------------- what we know so far -->
        <WhatWeKnow />

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
                · {{ selected.rows.length }} runs from {{ selected.accounts }} accounts
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
                :bands="selectedBands"
                :account-colors="accountColors"
                :journey-from="sampleJourneyFrom"
                :journey-to="finalTE"
              />
            </div>

            <div class="space-y-2">
              <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">How each ascension goes</h3>
              <LegProfileChart :rows="selected.rows" :account-colors="accountColors" />
            </div>
          </template>
          <p v-else class="text-[11px] text-slate-500 leading-relaxed">
            Pick one count to see where its checkpoints land and how each ascension goes: the third ascension of a
            4-ascension plan and of a 7-ascension plan are not the same thing, so those charts only work one count at a
            time.
          </p>

          <div class="space-y-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">The runs</h3>
            <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
              Grouped by account, earliest finish first unless you pick another order below; click an account's name to
              fold its runs away. <b>Finishes</b> is the date the plan reaches {{ finalTE }} TE, in your timezone (the
              player's own is on hover): it is the same whenever the same plan is run, so it is what compares between an
              account's runs. <b>Plan length</b> counts from each run's own start, so a run made a day later shows a day
              fewer; it only compares between runs from the same save. <b>vs best</b> is days after that account's
              earliest finish, the run named at the top of its block. That run is picked from all of the account's runs
              to this target, so Proofs only or picking one count can leave it out of the list; the block then says so.
              Runs whose finish no longer stands (a what-if, a plan re-measured by a newer run, one the player has
              fallen behind, one made from an old save) are greyed, with the reason on hover, and listed last when
              sorted by finish. <b>What was checked</b> is how each run searched and, for a box it tried in full, the
              TEs at each ascension as they are typed into the planner (<span class="font-mono-premium">181-250:5</span>
              is every 5th TE from 181 to 250, <span class="font-mono-premium">:1</span> every TE); the full box is on
              hover.
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
              Plan length counts from each run's own start, so a plan made a day later shows a day fewer even when it is
              the same plan. In this order, only runs from the same save compare; to see which plan is better, sort by
              finish.
            </p>
            <!-- A size container, so each account's header line can be exactly as wide as what is on
                 screen (100cqw) however wide the table itself is: the Leaderboard's pattern. -->
            <div class="overflow-x-auto [container-type:inline-size]">
              <table class="w-full text-[11px]">
                <thead>
                  <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <th class="text-left py-1 pr-3">Who</th>
                    <th v-if="selectedCount === 'all'" class="text-right py-1 pr-3" :aria-sort="ariaSort('ascensions')">
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
                    <td :colspan="selectedCount === 'all' ? 12 : 11" class="p-0 text-[10px] text-slate-500">
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
                          <span
                            class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                            :style="{ background: colorAt(accountColors.get(block.key) ?? 0) }"
                          />
                          <b class="text-slate-700">{{ block.label }}</b>
                        </button>
                        · {{ block.rows.length }} run{{ block.rows.length === 1 ? '' : 's'
                        }}<template v-if="collapsed.has(block.key)"> folded</template>
                        <template v-if="block.best">
                          · earliest finish
                          <b class="text-slate-700" :title="finishTitle(block.best.finish, block.best.row.timezone)">{{
                            finishDateText(block.best.finish, viewZone)
                          }}</b>
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
                        class="ml-1 rounded bg-slate-100 px-1 text-[9px] font-black text-slate-500"
                        :title="judged.byId.get(row.id)?.reason"
                      >
                        {{ stateOf(row) }}
                      </span>
                      <span
                        v-if="folded.sends.get(row.id)"
                        class="ml-1 text-[9px] font-bold text-slate-400"
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
                            ? row.space.stoppedEarly
                              ? 'font-bold text-amber-700'
                              : 'font-black text-emerald-700'
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
                        @click="openTable(row)"
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
        </section>

        <!-- ------------------------------------------------------------------ across the counts -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 class="text-lg font-black text-slate-900">Does one more ascension help?</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            One line per account, never one line across accounts: a duration depends on artifacts, colleggtibles,
            research and starting TE at least as much as on the chain, so the only honest version of this question holds
            an account still and varies the count. Each point is how many days after that account's earliest finish the
            best plan at that count finishes, so a line only touches 0 at the count that holds it. That earliest finish
            is taken from all of the account's runs that still stand, the same one the runs table names. A solid line is
            one exhaustive run that timed several counts from one save; if that run no longer stands (a what-if, an old
            save), it is measured from its own best count instead, and its tooltip says so. A dashed line is the
            account's runs that still stand, the earliest finish at each count. Runs made on different days are compared
            by finish date, never by their totals: the same plan run a day later shows a day fewer.
          </p>
          <CountCompareChart :comparisons="comparisons" :account-colors="accountColors" />
        </section>

        <!-- ------------------------------------------------------------------ virtue variables -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 class="text-lg font-black text-slate-900">The final leg, for everyone</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            Final-leg days times the peak delivery rate it reached, against the last checkpoint. Dividing out the
            delivery rate is what makes accounts comparable here: every account so far lands on one line to within a
            percent, whatever their gear. A point off the line is a run something else happened to.
          </p>
          <FinalLegChart :rows="usable" :account-colors="accountColors" :account-labels="accountLabels" />
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 class="text-lg font-black text-slate-900">Each sweep, every account</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            For each last checkpoint, how many days the best plan ending there is behind that run's own best, one line
            per run. Each line is one table priced from one save, so its shape is exact; the heights are measured from
            each run's own best, because runs from different accounts, or made on different days, do not compare by
            total. A flat bottom means the exact checkpoint barely matters; a bottom at the same place for everyone
            means the shape carries between accounts.
          </p>
          <SweepCurvesChart
            :base="base!"
            :rows="usable"
            :account-colors="accountColors"
            :account-labels="accountLabels"
          />
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h2 class="text-lg font-black text-slate-900">Gear, as percent of perfect</h2>
          <GearScoreChart :accounts="accounts" :account-colors="accountColors" />
        </section>

        <!-- ------------------------------------------------------------------------- deep dive -->
        <section v-if="loadedRun" class="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
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
            <button
              type="button"
              class="px-3 py-1 rounded-lg border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500"
              @click="closeTable"
            >
              Close
            </button>
          </div>

          <div v-if="plateau" class="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1">
            <p class="text-[11px] text-slate-600 leading-relaxed">
              <b>{{ plateau.near.toLocaleString() }}</b> of {{ plateau.total.toLocaleString() }} chains at
              {{ loadedRun.ascensions }} ascensions came within 1% of this run's best ({{
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
              telling you about the search as much as about the game.
            </p>
          </div>

          <SearchShapeChart :points="loadedChains" :best-chain="loadedBestChain" />
        </section>

        <p v-if="csvError" class="text-[11px] font-bold text-rose-700 px-1">{{ csvError }}</p>

        <!-- ---------------------------------------------------------------------- the caveats -->
        <section class="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-[11px] text-slate-500">
          <h2 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">How to read all of this</h2>
          <p class="leading-relaxed">
            <b class="text-slate-700">Accounts are a guess.</b> Submissions carry no player id by design, so an
            "account" here is one timezone plus one set of virtue artifacts. People who retype their nickname every run
            still group correctly; two people in the same timezone with identical artifact sets would be merged into
            one.
          </p>
          <p class="leading-relaxed">
            <b class="text-slate-700">Shapes travel, durations do not.</b> Where the checkpoints sit is a fact about the
            game's sale calendar and research curve. How long the plan takes is a fact about somebody's artifacts.
          </p>
          <p class="leading-relaxed">
            <b class="text-slate-700">Compare finish dates, not totals.</b> A plan's length counts from its own start,
            so a run made a day later shows a day fewer even when it is the same plan. The date it reaches the target
            does not move, and a better plan finishes earlier, so an account's runs are compared by finish date. Totals
            only compare between runs from the same save. The first ascension is the rest of the one in progress, so it
            too is shorter when a plan is made later.
          </p>
          <p class="leading-relaxed">
            <b class="text-slate-700">These are searches, not surveys.</b> Most runs explored a band somebody typed, so
            this shows where good chains were FOUND, which is not the same as where good chains ARE. A band that stops
            dead at a round number is usually the edge of a search box.
          </p>
        </section>
      </template>

      <!-- ------------------------------------------------------------------------- data needs -->
      <section
        v-if="base"
        id="help-fill-the-gaps"
        class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 scroll-mt-4"
      >
        <div class="space-y-1">
          <h2 class="text-lg font-black text-slate-900">Help fill the gaps</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            What the collected runs are still short of, worked out from them: each item drops off once enough accounts
            have covered it. Every run helps even if you are not on this list -- but these are where one more account
            teaches the most.
          </p>
        </div>
        <DataNeeds :rows="usable" />
      </section>

      <!-- ---------------------------------------------------------------------------- flagged -->
      <section
        v-if="base"
        id="flagged-board"
        class="rounded-xl border border-slate-200 bg-white p-4 space-y-3 scroll-mt-4"
      >
        <div class="space-y-1">
          <h2 class="text-lg font-black text-slate-900">Flagged runs</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            Runs from accounts the planner cannot help yet: a first ascension that sits on the Integrity shift for over
            an hour, a plan past ten years, or a result that contradicts itself. They are kept apart from everything
            above, because they are not routes to copy, and shown anonymously — except runs sent from this browser,
            which show as yours.
          </p>
        </div>
        <FlaggedBoard :base="base" />
      </section>

      <!-- ---------------------------------------------------------------------------- upload -->
      <section v-if="base" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div class="space-y-1">
          <h2 class="text-lg font-black text-slate-900">Submit a sweep</h2>
          <p class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">
            Ran a sweep and closed the tab, or ran it on another machine? Upload its two files here. They are checked
            against each other, for truncation and for the old delivery-set bug, before anything is sent.
          </p>
        </div>
        <SweepUpload :base="base" :rows="rows" @submitted="load" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import SearchShapeChart from '@/components/auto/charts/SearchShapeChart.vue';
import type { PricedChain } from '@/search/types';
import { describeCompute, formatMinutes } from '@/utils/computeTime';
import CountShapeChart from './CountShapeChart.vue';
import LegProfileChart from './LegProfileChart.vue';
import CountCompareChart from './CountCompareChart.vue';
import FinalLegChart from './FinalLegChart.vue';
import DataNeeds from './DataNeeds.vue';
import FlaggedBoard from './FlaggedBoard.vue';
import NewVersionBanner from '@/components/NewVersionBanner.vue';
import WhatWeKnow from './WhatWeKnow.vue';
import { describeFetchError, errorKind } from '@/utils/errors';
import SweepCurvesChart from './SweepCurvesChart.vue';
import GearScoreChart from './GearScoreChart.vue';
import SweepUpload from './SweepUpload.vue';
import {
  fetchAll,
  fetchRunCsv,
  normaliseCollectorBase,
  parseRunCsv,
  resolveCollectorBase,
  type CollectorRow,
} from './collector';
import {
  accountKey,
  compareCounts,
  DEFAULT_RUN_SORT,
  flagOf,
  foldRuns,
  groupByAccount,
  groupByCount,
  judgeFinishes,
  median,
  nearBestBands,
  RUN_SORT_START,
  runsByAccount,
  runTags,
  searchedOf,
  summariseRuns,
  targetsPresent,
  timeOffKey,
  type RunSort,
  type RunSortKey,
} from './analysis';
import {
  finishDateText,
  finishTitle,
  formatDate,
  localZone,
  signedDays,
  stateTag,
  whoText,
} from '@/lib/leaderboardRank';
import { colorAt } from './palette';

/** Where a pasted collector URL is remembered. Per-browser, not per-build. */
const BASE_STORAGE_KEY = 'chainExplorerCollector';

const base = ref<string | null>(null);
const typedBase = ref('');
const rows = ref<CollectorRow[]>([]);
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

/** An aborted request is the expected outcome of clicking twice, not an error to report. */
/** The banner's jump. Smooth, and it keeps the #anchor in the URL so the link can be shared. */
function scrollToGaps(): void {
  document.getElementById('help-fill-the-gaps')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', '#help-fill-the-gaps');
}

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
    const fetched = await fetchAll(base.value, controller.signal);
    if (allController !== controller) return;
    now.value = Date.now();
    rows.value = fetched;
    if (!rows.value.length) error.value = 'The collector answered, but it is holding no runs yet.';
  } catch (e) {
    if (isAbort(e) || allController !== controller) return;
    // A failed fetch here is almost always CORS or a typo'd host, and the browser's own message
    // for both is "Failed to fetch". Say which two things to check rather than repeating it.
    rows.value = [];
    error.value =
      errorKind(e) === 'network'
        ? describeFetchError(e, 'the collector')
        : `${e instanceof Error ? e.message : String(e)} — check the URL, and that the collector allows this origin.`;
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

const filtered = computed(() =>
  usable.value.filter(r => r.finalTE === finalTE.value && (!exhaustiveOnly.value || (r.space && !r.space.stoppedEarly)))
);

const accounts = computed(() => groupByAccount(usable.value));

/** Colour index per account, fixed across every chart and the runs table. */
const accountColors = computed(() => {
  const map = new Map<string, number>();
  accounts.value.forEach((account, i) => map.set(account.key, i));
  return map;
});

const accountLabels = computed(() => new Map(accounts.value.map(a => [a.key, a.label])));

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
const selectedBands = computed(() => selectedGroup.value?.bands ?? []);

/**
 * The sample journey the checkpoint table's absolute-TE column is drawn against: the median start
 * of the runs shown. It used to be the run with the lowest total, which was a pick by gear and by
 * how late the run was made; the median is just a typical journey.
 */
const sampleJourneyFrom = computed(() => {
  const m = median((selected.value?.rows ?? []).map(r => r.currentTE));
  return Number.isFinite(m) ? Math.round(m) : 0;
});

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

/** Each run's finish date and whether it still stands, by the Leaderboard's rules. Only a run the
 *  checkboxes above let through can be an account's best. */
const judged = computed(() =>
  judgeFinishes(judgedRows.value, finalTE.value, now.value, new Set(visible.value.map(r => r.id)))
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
  runsByAccount(
    selected.value?.rows ?? [],
    judged.value,
    accountLabels.value,
    accounts.value.map(a => a.key),
    activeSort.value
  )
);

/** Accounts whose earliest finish is one of the runs listed. The rest say why it is not. */
const bestListed = computed(
  () => new Set(runBlocks.value.filter(b => b.rows.some(r => judged.value.byId.get(r.id)?.best)).map(b => b.key))
);

/** Why an account's earliest finish is not in the list, in a few words. */
function unlistedWhy(best: CollectorRow): string {
  const why: string[] = [];
  if (selectedCount.value !== 'all' && best.ascensions !== selectedCount.value) why.push('a different count');
  if (exhaustiveOnly.value && !(best.space && !best.space.stoppedEarly)) why.push('not a proof');
  return why.join(', ') || 'filtered out';
}

/** The settings that tell look-alike runs apart (the Leaderboard's `settingTags`): two runs with one
 *  route and start that differ only in whether the first ascension finishes the current run first.
 *  Plus `time off` on any run planned around some, which the Leaderboard's tags leave out (`runTags`). */
const tags = computed(() => runTags(usable.value));

/** "What was checked" for each run listed, by id (`searchedOf`). */
const searched = computed(() => new Map((selected.value?.rows ?? []).map(r => [r.id, searchedOf(r)])));

const comparisons = computed(() => compareCounts(filtered.value, judged.value));

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

/** Under a minute apart is the same finish: `+0.00 d` would read as a measured gap. */
function vsBestText(behind: number): string {
  return behind < 1 / 1440 ? 'same finish' : signedDays(behind);
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
    j.behind < 1 / 1440
      ? `Finishes at the same time as ${against}`
      : `Finishes ${signedDays(j.behind).replace(/^[+−]/, '')} after ${against}`;
  // Time off before saves: a time-off copy of a normal run shares its save, and the gap is the time away.
  if (best && timeOffKey(row) !== timeOffKey(best.row)) {
    return `${days}. The two are planned around different time off, so part of the gap is the time away, not the plans.`;
  }
  return j.sameSaveAsBest
    ? `${days}. Planned from the same save as that run, so the gap is the plans alone.`
    : `${days}. Planned from a different save, so part of the gap can be what changed in between.`;
}

/* ----------------------------------------------------------------- one run's full chain table */

async function openTable(row: CollectorRow): Promise<void> {
  if (!base.value) return;
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

const loadedBestChain = computed(() => {
  if (!loadedChains.value.length) return [];
  return loadedChains.value.reduce((a, b) => (b.days < a.days ? b : a)).chain;
});

// At the loaded run's own count, not the selected one: under "All" there is no selected count, and
// the plateau is a question about that run's table.
const plateau = computed(() =>
  loadedChains.value.length && loadedRun.value
    ? nearBestBands(loadedChains.value, loadedCurrentTE.value, loadedFinalTE.value, loadedRun.value.ascensions)
    : null
);

function absoluteOf(fraction: number): number {
  return Math.round(loadedCurrentTE.value + fraction * (loadedFinalTE.value - loadedCurrentTE.value));
}
</script>
