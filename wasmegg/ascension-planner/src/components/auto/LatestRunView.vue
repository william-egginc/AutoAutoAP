<!--
  Compare › Your latest run (#/compare/latest): the other options and the charts of this visit's Fastest
  run, Nearby routes or Exhaustive. Moved here off Fastest's results (15 Oct 2026), where they
  pushed the CSV, saved runs and share box a long way down; Fastest keeps one line linking here.

  Everything reads the chain-search store, which lives as long as the page does, so the latest run of
  this visit is here whichever tab it ran on. Nothing re-simulates: the views re-sort what the run
  priced. The charts' code loads only when this view opens (safeAsyncComponent), and the store builds
  their data only while RunCharts is mounted (`chartMounted`), so nothing recomputes while it is closed.

  By a date has neither: its "Best for each stop count" and "Top routes" are its answer and stay with it.
-->
<template>
  <div class="space-y-4" data-testid="latest-run">
    <div v-if="!store.pricedCount" class="rounded-xl border border-slate-200 bg-white p-4 space-y-1.5" data-testid="latest-run-empty">
      <p v-if="store.isRunning" class="text-xs text-slate-700">
        Your run on {{ fastestName(store.finalTE) }} has started: its other options and charts show here as its
        routes are priced.
      </p>
      <p v-else class="text-xs text-slate-700">Run a search on Fastest and its other options and charts show here.</p>
      <p class="text-[11px] text-slate-500 leading-relaxed">
        Either way of searching counts ({{ NAMES.smart }} or {{ NAMES.full }}).
        {{ NAMES.byDate }} keeps its top routes with its answer.
      </p>
    </div>

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
                    <button
                      v-if="row.legs.length"
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
                <tr v-if="expandedRow === row.chain.join(',') && row.legs.length" class="bg-slate-50">
                  <td :colspan="store.scheduleEnabled ? 7 : 6" class="px-3 py-3 space-y-2">
                    <div v-for="(leg, li) in row.legs" :key="li" class="text-[11px]">
                      <div class="flex flex-wrap items-baseline gap-x-2 text-slate-600">
                        <span class="font-black text-slate-700">A{{ li + 1 }}</span>
                        <span class="font-bold">&rarr; {{ leg.endTE }}</span>
                        <span class="text-slate-400">{{ leg.key }}</span>
                        <span v-if="leg.startTime" class="font-mono text-slate-500">
                          {{ stamp(leg.startTime) }} &rarr; {{ stamp(leg.endTime) }}
                        </span>
                      </div>
                      <div v-if="leg.shifts?.length" class="flex flex-wrap gap-1 mt-1 ml-4">
                        <span
                          v-for="(b, k) in eggBlocks(leg)"
                          :key="k"
                          class="px-1.5 py-0.5 rounded border text-[10px]"
                          :class="
                            b.isSwitch && outsideSchedule(b.at)
                              ? 'border-amber-300 bg-amber-50 text-amber-800 font-bold'
                              : b.isSwitch
                                ? 'border-slate-200 bg-white text-slate-500'
                                : 'border-emerald-200 bg-emerald-50/60 text-emerald-700'
                          "
                        >
                          <span class="capitalize">{{ b.egg || 'shift' }}</span>
                          <span class="font-mono"> {{ stamp(b.at) }}</span>
                          <span v-if="!b.isSwitch"> start</span>
                        </span>
                      </div>
                    </div>
                    <p class="text-[10px] text-slate-400 leading-relaxed pt-1">
                      One entry per egg. The first is where the ascension starts (you are already on it), and each one
                      after it is a manual switch.
                      <template v-if="store.scheduleEnabled && store.deferShifts">
                        These have already been moved into your hours, which is what this option's
                        <span class="font-semibold">cost</span> above paid for, so none are amber. Untick "hold the
                        shifts" and re-run to see where they would fall unassisted.
                      </template>
                      <template v-else-if="store.scheduleEnabled">
                        <span class="font-semibold text-amber-700">Amber ones fall outside your hours</span>, so you
                        would have to be up for them. Compare the amber between options.
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import { NAMES, fastestName, hashFor } from '@/lib/siteNav';
import { showDateTime } from '@/lib/displayTime';
import { safeAsyncComponent } from '@/lib/import';
import { isAvailable } from '@/search/availability';
import { formatDuration } from '@/lib/format';
import { VIEWS } from '@/search/views';
import type { ShortlistRow } from '@/search/shortlist';
import type { LegSummary } from '@/search/types';
import HelpTip from './HelpTip.vue';

/** The charts (heat map, dots) and their drawing code load only when this view first shows them. */
const RunCharts = safeAsyncComponent(() => import('./charts/RunCharts.vue'));

const store = useChainSearchStore();
const autoPlannerStore = useAutoPlannerStore();

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
    detail: `Every stage in this tier ran to completion, ending on "${store.lastCompletedStage}". Descent stops when no stop moves, so finishing short of the estimate is normal.`,
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

interface EggBlock {
  egg: string;
  at: number;
  length: string;
  /** False for the block the leg opens on -- there is nothing to do, you are already there. */
  isSwitch: boolean;
}

/** The eggs a leg lays, in order, INCLUDING the one it opens on (the same as ChainSearchPanel's leg table). */
function eggBlocks(leg: LegSummary): EggBlock[] {
  const shifts = leg.shifts ?? [];
  if (!shifts.length) return [];
  const span = (from: number, to: number | undefined) =>
    to !== undefined && to > from ? formatDuration(to - from) : '—';
  const blocks: EggBlock[] = [];
  const opener = shifts[0].fromEgg;
  if (opener && leg.startTime) {
    blocks.push({ egg: opener, at: leg.startTime, length: span(leg.startTime, shifts[0].at), isSwitch: false });
  }
  shifts.forEach((sh, k) => {
    blocks.push({
      egg: sh.egg,
      at: sh.at,
      length: span(sh.at, k + 1 < shifts.length ? shifts[k + 1].at : leg.endTime),
      isSwitch: true,
    });
  });
  return blocks;
}

/** Which runner-up's timing is open, by chain key. Empty for none. */
const expandedRow = ref('');

const activeView = computed(() => VIEWS.find(v => v.id === store.shortlistView));

/** `Sep 30, 5:25 PM` — deliberately no year (the finish column carries it). */
function stamp(unixSeconds: number | undefined): string {
  if (!unixSeconds) return '—';
  const tz = autoPlannerStore.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(unixSeconds * 1000));
}

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

/** True when this instant falls outside the schedule. Uses the same predicate the search does, so
 *  the highlighting can never disagree with the count in the row above it. */
function outsideSchedule(unixSeconds: number): boolean {
  const a = store.availability;
  return a ? !isAvailable(unixSeconds, a) : false;
}

/** Use: the route goes to Your plan, which opens and builds it (as Fastest's own Use did). */
function use(chain: number[], alsoGenerate = false): void {
  store.applyChain(chain, alsoGenerate);
  store.generateWhenPlannerOpens = alsoGenerate;
  useUIStore().openPlannerRequested++;
}
</script>
