<!--
  My runs › Your latest run (MyRunsView.vue; was Leaderboard › Your latest run, #/compare/latest, until 16 Oct
  2026, and that tab is one line pointing here now): the newest search of this visit, Fastest's or By a date's,
  with when each stop and egg happens under each route's arrow (RouteTimeline.vue). For Fastest (Nearby routes
  or Exhaustive) also its other options and charts, moved here off Fastest's results (15 Oct 2026), where they
  pushed the CSV, saved runs and share box a long way down; for By a date its best route for each stop count
  and its top 50 routes, and while one runs its top routes so far (By a date's result shows only its best and
  its best for each stop count since 16 Oct 2026). Fastest's panels and By a date's link here ("Dig deeper
  into your plan ›", DigDeeperLink.vue, opens My runs).

  ONE ACCOUNT'S (16 Oct 2026): a run shows only on the account it ran for (lib/latestRunOwner.ts `runIsMine`,
  on the store's `chainResultOwner` / `deadlineResultOwner`, hashes of the player ID). Another account's run
  in memory is ignored, not cleared, so switching back shows it again. When the By a date result in memory
  isn't this account's, this account's own is read back (store `loadDeadlineState`).

  Self-contained on purpose (only `playerId` in): the now page will move it.

  "Newest" compares when each was found (`chainResultAt`, `deadlineResult.at`), not which exists: By a date's
  result comes back from IndexedDB on every load. A run going now counts as newest. Light isn't a search (it
  prices the instant answer's own routes), so it has nothing here; the placeholder says where its results are.

  Everything reads the chain-search store, which lives as long as the page does, so the latest run of
  this visit is here whichever tab it ran on. Nothing re-simulates: the views re-sort what the run
  priced. The charts' code loads only when this view opens (safeAsyncComponent), and the store builds
  their data only while RunCharts is mounted (`chartMounted`), so nothing recomputes while it is closed.
-->
<template>
  <div class="space-y-4" data-testid="latest-run">
    <div v-if="shown === 'none'" class="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5" data-testid="latest-run-empty">
      <p v-if="store.isRunning && fastestMine && want !== 'date'" class="text-xs text-slate-700">
        Your run on {{ fastestName(store.finalTE) }} has started: its other options and charts show here as its
        routes are priced.
      </p>
      <p v-else-if="store.deadlineRunning && dateMine && want !== 'fastest'" class="text-xs text-slate-700">
        Your {{ NAMES.byDate }} run has started: its routes show here when it finishes.
      </p>
      <p v-else-if="want === 'date'" class="text-xs text-slate-700" data-testid="latest-run-none-date">
        No {{ NAMES.byDate }} run yet on this account: run one on
        <a :href="byDateHash" class="font-bold text-indigo-700 underline hover:text-indigo-900">{{ NAMES.byDate }}</a>
        and its routes show here.
      </p>
      <p v-else-if="want === 'fastest'" class="text-xs text-slate-700" data-testid="latest-run-none-fastest">
        No {{ fastestName(store.finalTE) }} run yet on this account: run Nearby routes or Exhaustive on it and its routes
        show here.
      </p>
      <p v-else class="text-xs text-slate-700">
        Run a search on {{ fastestName(store.finalTE) }} or {{ NAMES.byDate }} and its routes show here, each with
        when every stop and egg happens.
      </p>
      <p class="text-[11px] text-slate-500 leading-relaxed">
        Either way of searching counts ({{ NAMES.smart }} or {{ NAMES.full }}). Light, the Stronger check's first
        level, isn't a search: it prices the instant answer's own routes, so its results are on the instant answer's
        rows (open a row's arrow after Check exactly) and on the Stronger check's lines.
      </p>
    </div>

    <!-- By a date's run going now: its top routes so far (moved off By a date's progress, 16 Oct 2026). -->
    <template v-else-if="shown === 'date' && !dateResult">
      <p class="text-[11px] text-slate-600 leading-relaxed" data-testid="latest-run-date-running">
        Your
        <a :href="byDateHash" class="font-bold text-indigo-700 underline hover:text-indigo-900">{{ NAMES.byDate }}</a>
        run is going<template v-if="store.deadlineProgress"
          >: {{ store.deadlineProgress.priced.toLocaleString() }} route{{
            store.deadlineProgress.priced === 1 ? '' : 's'
          }}
          priced so far</template
        >. Its routes show here in full when it finishes.
      </p>
      <div
        v-if="(store.deadlineProgress?.top.length ?? 0) > 0"
        class="rounded-xl border border-slate-200 bg-white p-4"
        data-testid="latest-run-top-so-far"
      >
        <ResultTable
          title="Top routes so far"
          :columns="['Route', 'Last stop reached', 'Spare']"
          :rows="store.deadlineProgress!.top.slice(0, 15)"
          :row-key="r => r.chain.join(',')"
          :can-expand="hasLegs"
        >
          <template #expand="{ row: r }">
            <RouteTimeline :chain="r.chain" :legs="r.legs" :zone="zone" />
          </template>
          <template #default="{ row: r }">
            <td class="pr-4 py-1 font-bold">{{ r.chain.join(' ') }}</td>
            <td class="pr-4 py-1">{{ when(r.reachAt) }}</td>
            <td class="pr-4 py-1">{{ spareLabel(r.spare) }}</td>
          </template>
        </ResultTable>
      </div>
    </template>

    <!-- By a date's run: its best route for each stop count and its top 50, each with its arrow. -->
    <template v-else-if="shown === 'date' && dateResult">
      <p class="text-[11px] text-slate-600 leading-relaxed" data-testid="latest-run-from-date">
        From your
        <a :href="byDateHash" class="font-bold text-indigo-700 underline hover:text-indigo-900">{{ NAMES.byDate }}</a>
        run ({{ dateResult.simple ? NAMES.smart : NAMES.full }}, by {{ when(dateResult.deadline) }})<template
          v-if="store.deadlineRunning"
          >; a new run is going, and its routes replace these when it finishes</template
        ><template v-else-if="!store.dateRunLive && dateResult.at">, found {{ when(dateResult.at / 1000) }}</template>.
        {{ dateResult.priced.toLocaleString() }} route{{ dateResult.priced === 1 ? '' : 's' }} priced<template
          v-if="!dateResult.step && !dateResult.stoppedEarly"
          >: every route in your boxes, run complete</template
        ><template v-else-if="dateResult.step"
          >, early stops every {{ dateResult.step }} TE, then refined</template
        ><template v-else-if="dateResult.stoppedEarly">, stopped early</template>.
      </p>
      <div class="rounded-xl border border-slate-200 bg-white p-4 space-y-4" data-testid="latest-run-by-date">
        <p class="text-[11px] text-slate-500 leading-relaxed">
          Open a route's arrow for when each stop is reached, then an ascension's for when each egg is shifted and the TE
          it reaches.
        </p>
        <ResultTable
          v-if="dateResult.byStops.length"
          title="Best for each stop count"
          :rows="dateResult.byStops"
          :row-key="r => r.chain.join(',')"
          :can-expand="hasLegs"
        >
          <template #expand="{ row: r }">
            <RouteTimeline :chain="r.chain" :legs="r.legs" :zone="zone" />
          </template>
          <template #default="{ row: r }">
            <td class="pr-4 py-1 text-slate-500">{{ r.chain.length }} stop{{ r.chain.length === 1 ? '' : 's' }}</td>
            <td class="pr-4 py-1 font-bold">{{ r.chain.join(' ') }}</td>
            <td class="pr-4 py-1">{{ when(r.reachAt) }}</td>
            <td class="pr-4 py-1">{{ spareLabel(r.spare) }} spare</td>
          </template>
        </ResultTable>
        <ResultTable
          :title="`Top routes (${Math.min(50, dateResult.routes.length)} of ${dateResult.priced.toLocaleString()} priced)`"
          :columns="['Route', 'Last stop reached', 'Spare']"
          :rows="dateResult.routes.slice(0, 50)"
          :row-key="r => r.chain.join(',')"
          :can-expand="hasLegs"
          data-testid="latest-run-top-routes"
        >
          <template #expand="{ row: r }">
            <RouteTimeline :chain="r.chain" :legs="r.legs" :zone="zone" />
          </template>
          <template #default="{ row: r }">
            <td class="pr-4 py-1 font-bold">{{ r.chain.join(' ') }}</td>
            <td class="pr-4 py-1">{{ when(r.reachAt) }}</td>
            <td class="pr-4 py-1">{{ spareLabel(r.spare) }}</td>
          </template>
        </ResultTable>
      </div>
    </template>

    <template v-else>
      <p class="text-[11px] text-slate-600 leading-relaxed" data-testid="latest-run-from">
        From your {{ runName }} run on
        <a :href="backHash" class="font-bold text-indigo-700 underline hover:text-indigo-900"
          >{{ fastestName(store.finalTE) }}</a
        ><template v-if="store.isRunning">, still running: these fill in as it goes</template
        ><template v-else-if="lastRunLabel">, {{ lastRunLabel }}</template>.
        {{ store.pricedCount.toLocaleString() }} route{{ store.pricedCount === 1 ? '' : 's' }} priced.
      </p>

      <!-- Runners-up. Picked for SPREAD, not the raw top N: a descent sweep leaves the same plan
           nudged by one TE all over the cache, and ten of those is a useless menu. -->
      <div v-if="store.pricedCount > 1" data-testid="other-options" class="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Other options worth considering
          </h3>
          <button
            v-if="!store.isRunning"
            type="button"
            class="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
            @click="store.rebuildShortlist()"
          >
            Refresh
          </button>
        </div>

        <p class="text-[11px] text-slate-500 leading-relaxed">
          Fastest is not always best. Every prestige is a full rebuild (twelve shifts and a fresh research grind), so
          half a day slower for one fewer ascension may well be the trade you want. Pick on the
          <span class="font-semibold">finish date</span>, not the day count: durations from different plan starts are
          not comparable.
        </p>

        <!-- Preset views over the SAME priced chains. Nothing here re-simulates; every one of
             these reads the cache the run already built, so switching is instant. -->
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="v in VIEWS"
            :key="v.id"
            type="button"
            class="px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors"
            :class="
              store.shortlistView === v.id
                ? 'bg-slate-800 border-slate-800 text-white'
                : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
            "
            @click="store.setShortlistView(v.id)"
          >
            {{ v.label }}
          </button>
        </div>

        <p class="text-[11px] text-slate-500 leading-relaxed">{{ activeView?.hint }}</p>

        <!-- A single-axis sweep prices dozens of chains that are all the same plan nudged by a few
             TE, so "A good mix" can legitimately have nothing to add beyond the leader. The whole
             section used to vanish in that case, which reads as a bug rather than as an answer. -->
        <p
          v-if="store.shortlist.length <= 1"
          class="text-[11px] text-slate-500 leading-relaxed rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          Nothing else here is a genuinely different plan: every other route this run priced is the same shape moved
          by a few TE, or more than five days behind. That is normal for a run that only swept one stop, and for one
          stopped early. Switch to <span class="font-semibold">Fastest</span> to see all {{ store.pricedCount }} of
          them in raw order.
        </p>
        <div v-else class="overflow-x-auto" data-testid="shortlist">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">
                <th class="py-2 pr-3">Route</th>
                <th class="py-2 pr-3">Ascensions</th>
                <th class="py-2 pr-3">Finishes</th>
                <th class="py-2 pr-3">Behind</th>
                <th v-if="store.scheduleEnabled" class="py-2 pr-3 whitespace-nowrap">
                  {{ store.deferShifts ? 'Cost of your hours' : 'Night shifts' }}
                  <HelpTip v-if="store.deferShifts">
                    How much of this option's length is waiting for you: prestiges plus the twelve shifts per
                    ascension, all held until you are available. It is the part of the finish date your schedule is
                    responsible for, and the number that actually differs between these options. The night-shift count
                    cannot differ, because holding the shifts drives it to zero for every row.
                  </HelpTip>
                  <HelpTip v-else>
                    Shifts landing outside your hours. You are not holding them, so they are reported and free. This
                    is the count you would have to get up for.
                  </HelpTip>
                </th>
                <!-- A floor on its width: the long chains left it ~4 letters wide in Safari (the user, 12 Oct). -->
                <th class="py-2 pr-3 min-w-[9.5rem]">Why</th>
                <th class="py-2"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in store.shortlist" :key="row.chain.join(',')">
                <tr class="border-t border-slate-100">
                  <!-- The caret sits with the chain it opens, not off at the far right past six
                       other columns. Same move as the leg table's A1 caret, for the same reason. -->
                  <!-- A long route wraps at its spaces (not the Why column, not off the side). -->
                  <td class="py-2 pr-3 font-mono font-bold text-slate-700 min-w-[10rem]">
                    <!-- Every row: one without its legs can have them worked out (search/legsOnDemand.ts). -->
                    <button
                      type="button"
                      class="mr-1.5 text-slate-400 hover:text-emerald-700"
                      :aria-expanded="expandedRow === row.chain.join(',')"
                      :aria-label="`Show when ${row.chain.join(' ')} happens`"
                      @click="expandedRow = expandedRow === row.chain.join(',') ? '' : row.chain.join(',')"
                    >
                      {{ expandedRow === row.chain.join(',') ? '⌄' : '›' }}
                    </button>
                    {{ row.chain.join(' ') }}
                  </td>
                  <td class="py-2 pr-3 font-bold text-slate-600">{{ row.prestiges }}</td>
                  <td class="py-2 pr-3 text-slate-600 whitespace-nowrap">{{ finishInstant(row.seconds) }}</td>
                  <td class="py-2 pr-3 text-slate-500 whitespace-nowrap">
                    {{ row.gapSeconds < 1 ? '—' : '+' + (row.gapSeconds / 86400).toFixed(2) + ' d' }}
                  </td>
                  <!-- null, not 0: a replayed chain has no legs to count, and "0" would be a claim. -->
                  <td v-if="store.scheduleEnabled" class="py-2 pr-3 whitespace-nowrap">
                    <template v-if="store.deferShifts">
                      <span v-if="scheduleCost(row) === null" class="text-slate-400">not recorded</span>
                      <span v-else-if="scheduleCost(row)! < 3600" class="text-slate-400">&mdash;</span>
                      <span v-else class="font-bold text-amber-700">
                        +{{ (scheduleCost(row)! / 86400).toFixed(2) }} d
                      </span>
                    </template>
                    <template v-else>
                      <span v-if="row.nightShifts === null" class="text-slate-400">not recorded</span>
                      <span v-else-if="!row.nightShifts" class="text-slate-400">none</span>
                      <span v-else class="font-bold text-amber-700">{{ row.nightShifts }} outside</span>
                    </template>
                  </td>
                  <td class="py-2 pr-3 text-slate-400 min-w-[9.5rem]">{{ REASON_TEXT[row.reason] }}</td>
                  <td class="py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                      @click="use(row.chain, true)"
                    >
                      Use
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedRow === row.chain.join(',')" class="bg-slate-50">
                  <td :colspan="store.scheduleEnabled ? 7 : 6" class="px-3 py-3 space-y-2 whitespace-normal">
                    <!-- When each stop is reached, and each egg's first and last shift and TE (RouteTimeline.vue). -->
                    <RouteTimeline v-if="row.legs.length" :chain="row.chain" :legs="row.legs" :zone="zone" />
                    <!-- No legs kept (past the run's leg budget, or a saved run reopened): worked out on one
                         worker when asked (search/legsOnDemand.ts), from the run's plan start. -->
                    <div v-else class="space-y-1.5 text-[11px]" data-testid="legs-on-demand">
                      <template v-if="demandOf(row)?.state === 'done'">
                        <p v-if="driftOf(row)" class="text-amber-800" data-testid="legs-on-demand-drift">{{ driftOf(row) }}</p>
                        <RouteTimeline :chain="row.chain" :legs="demandOf(row)!.legs" :zone="zone" />
                      </template>
                      <p v-else-if="demandOf(row)?.state === 'running'" class="flex flex-wrap items-center gap-2 text-emerald-800">
                        <span
                          class="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"
                        />
                        Working out when each stop happens, on one worker… about half a minute.
                        <button
                          type="button"
                          class="font-bold text-slate-600 underline hover:text-slate-900"
                          data-testid="legs-on-demand-cancel"
                          @click="onDemand.cancel()"
                        >
                          Cancel
                        </button>
                      </p>
                      <template v-else>
                        <p class="text-slate-600">
                          This run didn't keep this route's stops (it keeps them for its fastest routes, and a saved
                          run reopened keeps only its best).
                          <template v-if="demandOf(row)?.state === 'failed'"> Working them out didn't work this time.</template>
                          <template v-else-if="demandOf(row)?.state === 'cancelled'"> Stopped.</template>
                        </p>
                        <button
                          type="button"
                          class="px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40"
                          :disabled="anythingRunning"
                          :title="anythingRunning ? 'After the search or check that is running' : 'Simulates this route on one worker'"
                          data-testid="legs-on-demand-start"
                          @click="workOut(row)"
                        >
                          Work them out
                        </button>
                      </template>
                    </div>
                    <p class="text-[10px] text-slate-400 leading-relaxed">
                      Open an ascension for its eggs: when the farm first moves onto each, and the TE it has when it
                      last moves off it.
                      <template v-if="store.scheduleEnabled && store.deferShifts">
                        Every shift has already been moved into your hours, which is what this option's
                        <span class="font-semibold">cost</span> above paid for.
                      </template>
                    </p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          Every view above reads the <span class="font-semibold">{{ store.csvRows.toLocaleString() }}</span>
          routes this run priced, so switching costs nothing and re-simulates nothing. A route missing from all of
          them was almost certainly never evaluated rather than evaluated and beaten: the search stays in its own
          neighbourhood. Download the CSV for the full list.
        </p>
      </div>

      <!-- The run's own shape, and why it ended. The CSV had all of this already, but reading it
           meant finishing a three-hour run and opening a spreadsheet. -->
      <div v-if="store.pricedCount" data-testid="search-shape" class="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">The shape of this search</h3>
          <button
            type="button"
            class="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
            @click="store.setChartShown(!store.chartShown)"
          >
            {{ store.chartShown ? 'Hide' : 'Show' }}
          </button>
        </div>

        <div class="space-y-4">
          <!-- Why it ended, stated before the chart, because it changes how the chart reads: a run
               that stopped early has a right-hand edge that means nothing. -->
          <!-- Nearby routes only: the words are about its stages (descent); Exhaustive never showed it. -->
          <div
            v-if="store.chainRunKind === 'smart'"
            class="rounded-lg border p-3 text-[11px] leading-relaxed"
            :class="
              runOutcome.tone === 'good'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            "
          >
            <span class="font-bold uppercase tracking-wide">{{ runOutcome.title }}:</span>
            {{ runOutcome.detail }}
          </div>

          <RunCharts />
        </div>
      </div>
    </template>

    <!-- The other search's run, when there is one too: the view shows the newest, this switches. -->
    <p v-if="other && want === undefined" class="text-[11px] text-slate-500" data-testid="latest-run-other">
      <button type="button" class="font-bold text-indigo-700 underline hover:text-indigo-900" @click="pick = other">
        Show your {{ other === 'date' ? NAMES.byDate : fastestName(store.finalTE) }} run instead
      </button>
      ({{ other === 'date' ? 'found' : 'priced' }} {{ otherWhen }})
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import { NAMES, fastestName, hashFor } from '@/lib/siteNav';
import { showDateTime } from '@/lib/displayTime';
import { safeAsyncComponent } from '@/lib/import';
import { VIEWS } from '@/search/views';
import type { ShortlistRow } from '@/search/shortlist';
import { spareLabel } from '@/search/deadlineSummary';
import HelpTip from './HelpTip.vue';
import ResultTable from './ResultTable.vue';
import RouteTimeline from './RouteTimeline.vue';
import { useStrongerStore } from '@/stores/stronger';
import { createChainSearchPool } from '@/search/pool';
import { createLegsOnDemand, driftNote, legsKey, type LegsOnDemand } from '@/search/legsOnDemand';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';
import { accountHash, accountHashNow } from '@/lib/accountHash';
import { runIsMine } from '@/lib/latestRunOwner';

const props = defineProps<{
  /** The account on screen: only its runs show here. Never shown; only its hash is compared. */
  playerId: string;
  /** Which run to show, from My runs' "Showing" switch (17 Oct 2026): its own "instead" line is then left out.
   *  Absent: the newest, with that line. */
  want?: 'fastest' | 'date' | null;
}>();

/** The charts (heat map, dots) and their drawing code load only when this view first shows them. */
const RunCharts = safeAsyncComponent(() => import('./charts/RunCharts.vue'));

const store = useChainSearchStore();
const autoPlannerStore = useAutoPlannerStore();
/** The planner's time zone, for every moment shown. */
const zone = computed(() => autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

/** This account's hash (lib/accountHash.ts): known at once when anything worked it out already. */
const here = ref(accountHashNow(props.playerId));
const initial = useInitialStateStore();
/** The loaded save's account (search/runSaves.ts `accountOf`, a hash), '' when unknown. */
const nowAccount = computed(() => accountOf(initial.rawBackup));
/** Fastest's result (or run) in memory is this account's. */
const fastestMine = computed(() =>
  runIsMine({
    owner: store.chainResultOwner,
    here: here.value,
    saveAccount: store.runSaves.find(r => r.key === store.openedRun?.inputsKey)?.account,
    nowAccount: nowAccount.value,
  })
);
/** By a date's result (or run) in memory is this account's. */
const dateMine = computed(() =>
  runIsMine({
    owner: store.deadlineResultOwner,
    here: here.value,
    saveAccount: store.deadlineResult?.inputsKey
      ? store.runSaves.find(r => r.key === store.deadlineResult?.inputsKey)?.account
      : undefined,
    nowAccount: nowAccount.value,
  })
);
/** On opening and on an account switch: the hash, and this account's own By a date result when the one in
 *  memory is another's (it is read back from this browser, as By a date does on opening). */
async function follow(id: string): Promise<void> {
  const h = await accountHash(id);
  if (id !== props.playerId) return;
  here.value = h;
  if (h && !store.deadlineRunning && store.deadlineResultOwner !== h) await store.loadDeadlineState(id);
}
onMounted(() => void follow(props.playerId));
watch(
  () => props.playerId,
  id => {
    here.value = accountHashNow(id);
    pick.value = null;
    void follow(id);
  }
);

/** By a date's result (restored from IndexedDB on load, or this visit's run), this account's only. */
const dateResult = computed(() => (dateMine.value ? store.deadlineResult : null));
/** When each search's result was found (ms); Infinity while it runs; null when there is none (or it is
 *  another account's). */
const fastestAt = computed<number | null>(() =>
  fastestMine.value && store.pricedCount ? (store.isRunning ? Infinity : store.chainResultAt || 1) : null
);
const dateAt = computed<number | null>(() =>
  dateMine.value && store.deadlineRunning ? Infinity : dateResult.value ? dateResult.value.at || 1 : null
);
/** The player's switch to the other run ("Show your … run instead"); null: the newest. */
const pick = ref<'fastest' | 'date' | null>(props.want ?? null);
watch(
  () => props.want,
  w => {
    if (w !== undefined) pick.value = w ?? null;
  }
);
/** The run shown: the one picked, else the newer (a run going now is newest), else none. */
const shown = computed<'fastest' | 'date' | 'none'>(() => {
  // My runs' "Showing" switch asks for one kind: only that kind's run, never the other one in its place (beta,
  // 16 Oct: "Latest Highest TE by a date run" showed an Exhaustive run on Fastest, the fallback to the newest).
  if (props.want === 'fastest') return fastestAt.value !== null ? 'fastest' : 'none';
  if (props.want === 'date') return dateAt.value !== null ? 'date' : 'none';
  if (pick.value === 'fastest' && fastestAt.value !== null) return 'fastest';
  if (pick.value === 'date' && dateAt.value !== null) return 'date';
  return newest.value;
});
const newest = computed<'fastest' | 'date' | 'none'>(() => {
  const f = fastestAt.value;
  const d = dateAt.value;
  if (f === null && d === null) return 'none';
  if (d === null) return 'fastest';
  if (f === null) return 'date';
  // A By a date run going now: its last result is the newest thing on that side, unless Fastest's is newer.
  return d > f ? 'date' : 'fastest';
});
/** Whether there is a run of this account to show (My runs opens its block then), and which kinds there are
 *  (My runs' "Showing" switch). */
const emit = defineEmits<{ has: [has: boolean]; kinds: [kinds: { fastest: boolean; date: boolean }] }>();
watch(
  () => shown.value !== 'none',
  has => emit('has', has),
  { immediate: true }
);
watch(
  () => `${fastestAt.value !== null}|${dateAt.value !== null}`,
  () => emit('kinds', { fastest: fastestAt.value !== null, date: dateAt.value !== null }),
  { immediate: true }
);
/** The other run, when there is one to switch to. */
const other = computed<'fastest' | 'date' | null>(() => {
  if (shown.value === 'fastest' && dateAt.value !== null) return 'date';
  if (shown.value === 'date' && fastestAt.value !== null) return 'fastest';
  return null;
});
const otherWhen = computed(() => {
  const at = other.value === 'date' ? dateAt.value : fastestAt.value;
  if (at === Infinity) return 'now, still running';
  return at && at > 1 ? when(at / 1000) : 'in an earlier visit';
});
/** Back to By a date. */
const byDateHash = hashFor({ section: 'auto', auto: 'by-date', depth: 'smart' });
/** A route row's arrow: only a route with its legs has stops to show. */
const hasLegs = (r: { legs?: unknown }): boolean => Array.isArray(r.legs) && r.legs.length > 0;
function when(unixSeconds: number): string {
  return showDateTime(unixSeconds, zone.value) || '—';
}

/** Which of Fastest's two searches the run was, in the words players read. */
const runName = computed(() => (store.chainRunKind === 'full' ? NAMES.full : NAMES.smart));
/** Back to the screen the run is on (#/auto/fastest or #/auto/fastest/full). */
const backHash = computed(() => hashFor({ section: 'auto', auto: 'fastest', depth: store.chainRunKind }));

/** "found <when>" when the result isn't from a run in this visit on these settings (store `chainRunLive`):
 *  a saved run opened, or one carried on from an earlier visit. '' for a live one. */
const lastRunLabel = computed(() => {
  if (store.chainRunLive) return '';
  const at = store.chainResultAt;
  return at
    ? `found ${showDateTime(at / 1000, autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)}`
    : 'from an earlier visit';
});

/**
 * Why the run ended, in one line. `stage` already carries this, but as an internal string
 * ("done - every route it needed was already priced") that assumes you know what the stages are.
 */
const runOutcome = computed<{ title: string; detail: string; tone: 'good' | 'warn' }>(() => {
  if (store.isRunning) {
    return {
      title: 'Still running',
      detail: `${store.stage}. The chart fills in as batches report, so the right-hand edge is wherever it has reached.`,
      tone: 'warn',
    };
  }
  if (store.error) {
    return {
      title: 'Stopped by an error',
      detail: `${store.error} Everything priced before it stopped is on the chart and saved.`,
      tone: 'warn',
    };
  }
  if (store.stoppedEarly) {
    return {
      title: 'Stopped early',
      detail: `You stopped it during "${store.lastCompletedStage}". The answer is the best of what was priced and is exactly what the completed stages guarantee, but the later stages never ran.`,
      tone: 'warn',
    };
  }
  if (store.chainsDone === 0) {
    return {
      title: 'Nothing left to price',
      detail:
        'Every route this level needed was already saved from an earlier run, so it replayed them and stopped. Pick a higher level to go further.',
      tone: 'good',
    };
  }
  return {
    title: 'Finished',
    detail: `Every stage at this level ran to completion, ending on "${store.lastCompletedStage}". Descent stops when no stop moves, so finishing short of the estimate is normal.`,
    tone: 'good',
  };
});

/** The finish INSTANT, not the duration: durations from different plan starts are not comparable,
 *  and the end date is the invariant a player actually plans around. */
function finishInstant(seconds: number): string {
  if (!seconds) return '—';
  const tz = autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date((store.planStart + seconds) * 1000));
}

/** Why a runner-up is on the list, in words. A bare ranking invites "so why is #4 here?". */
const REASON_TEXT: Record<string, string> = {
  best: 'fastest found',
  'prestige-count': 'best at this prestige count',
  'different-shape': 'a genuinely different shape',
};

/** Which runner-up's timing is open, by chain key. Empty for none. */
const expandedRow = ref('');

const activeView = computed(() => VIEWS.find(v => v.id === store.shortlistView));

/**
 * Everything a row's finish date owes to the schedule: prestiges waiting plus shifts held.
 *
 * Both halves are already inside the chain's duration; this pulls them back out so two options can
 * be compared on the one axis the schedule controls. Null when the chain was replayed from a
 * checkpoint and has no legs -- "0 d" there would be a claim, not a measurement.
 */
function scheduleCost(row: ShortlistRow): number | null {
  if (row.prestigeWaitSeconds === null && row.shiftHoldSeconds === null) return null;
  return (row.prestigeWaitSeconds ?? 0) + (row.shiftHoldSeconds ?? 0);
}

/**
 * LEGS ON DEMAND (search/legsOnDemand.ts): a row without its legs, worked out on one worker when asked,
 * from the run's own plan start (`planStartUsed`; `collectInputs` reads the live one) with Fastest's
 * handoff ('now'). Cancelled when any search or Check exactly starts, and when this view closes.
 */
const onDemand = createLegsOnDemand(createChainSearchPool);
const stronger = useStrongerStore();
/** The plan start the run's routes were priced from. */
const runStart = computed(() => store.planStartUsed || store.planStart);
const anythingRunning = computed(() => store.busy || stronger.exact.running);
watch(anythingRunning, on => on && onDemand.cancel());
onBeforeUnmount(() => onDemand.cancel());
function demandOf(row: ShortlistRow): LegsOnDemand | undefined {
  return onDemand.state.get(legsKey(row.chain, runStart.value, 'now'));
}
function workOut(row: ShortlistRow): void {
  if (anythingRunning.value) return;
  void onDemand.load([...row.chain], { ...store.collectInputs(), planStart: runStart.value }, 'now');
}
/** "Re-simulated on your current setup…" when it ends more than a minute from the row. */
function driftOf(row: ShortlistRow): string {
  const d = demandOf(row);
  return d?.seconds === undefined ? '' : driftNote(row.seconds, d.seconds, runStart.value, t => when(t));
}

/** Use: the route goes to Your plan, which opens and builds it (as Fastest's own Use did). */
function use(chain: number[], alsoGenerate = false): void {
  store.applyChain(chain, alsoGenerate);
  store.generateWhenPlannerOpens = alsoGenerate;
  useUIStore().openPlannerRequested++;
}
</script>
