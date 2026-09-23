<!--
  The Chain Explorer: every submitted run, grouped by how many ascensions it takes.

  WHY THIS IS A SEPARATE PAGE. The planner is a tool for one account: it needs a save, it holds a
  plan, and everything in it is about what YOU should do next. This is the opposite question --
  what has everybody's run looked like, and does a shape repeat -- and it needs no save, no player
  id and no simulation. Forcing it into the planner would mean loading a backup to look at other
  people's results. As its own page it is a static bundle that reads two public endpoints, which
  means it hosts anywhere: GitHub Pages, a file server, anywhere at all.

  WHAT IT WILL AND WILL NOT SAY. Durations are not comparable between accounts and this page never
  compares them that way (see analysis.ts). Across accounts it compares SHAPE; within an account it
  compares durations, and says which of the two grades of evidence each comparison rests on. The
  caveats are on the page rather than in this comment because the reader needs them more than the
  maintainer does.
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
              {{ totalChainsPriced.toLocaleString() }} chains priced between them
            </p>
            <p v-if="!loading && (dupeIds.size || flagged.size)" class="text-[11px] text-slate-500">
              <template v-if="dupeIds.size">{{ dupeIds.size }} exact duplicate{{ dupeIds.size === 1 ? '' : 's' }} hidden. </template>
              <template v-if="flagged.size">
                {{ flagged.size }} run{{ flagged.size === 1 ? '' : 's' }} flagged for the delivery-set bug,
                <label class="inline-flex items-center gap-1 font-bold text-slate-600">
                  <input v-model="showFlagged" type="checkbox" class="rounded border-slate-300 text-amber-600" />
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
              {{ selected.ascensions }} ascensions
              <span class="text-[11px] font-bold text-slate-400">
                · {{ selected.rows.length }} runs from {{ selected.accounts }} accounts
              </span>
            </h2>
            <span class="text-[11px] text-slate-500">
              fastest here: <b>{{ selected.best.durationDays.toFixed(2) }} d</b> on {{ selected.best.currentTE }} →
              {{ selected.best.finalTE }}
              <span class="font-mono-premium">({{ selected.best.chain.join(' ') }})</span>
            </span>
          </div>

          <div class="space-y-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Where each checkpoint lands</h3>
            <CountShapeChart
              :rows="selected.rows"
              :bands="selected.bands"
              :account-colors="accountColors"
              :journey-from="selected.best.currentTE"
              :journey-to="selected.best.finalTE"
            />
          </div>

          <div class="space-y-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">How each ascension goes</h3>
            <LegProfileChart :rows="selected.rows" :account-colors="accountColors" />
          </div>

          <div class="space-y-2">
            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">The runs</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-[11px]">
                <thead>
                  <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <th class="text-left py-1 pr-3">Who</th>
                    <th class="text-left py-1 pr-3">Journey</th>
                    <th class="text-left py-1 pr-3">Chain</th>
                    <th class="text-right py-1 pr-3">Days</th>
                    <th class="text-left py-1 pr-3">Effort</th>
                    <th class="text-right py-1 pr-3">Priced</th>
                    <th class="text-left py-1">Full table</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="row in selected.rows" :key="row.id" class="hover:bg-slate-50">
                    <td class="py-1.5 pr-3">
                      <span
                        class="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                        :style="{ background: colorAt(accountColors.get(accountKey(row)) ?? 0) }"
                      />
                      {{ row.nickname || 'anonymous' }}
                      <span
                        v-if="flagged.has(row.id)"
                        class="ml-1 rounded bg-amber-100 px-1 text-[9px] font-black text-amber-800"
                        :title="flagged.get(row.id)"
                      >
                        flagged
                      </span>
                    </td>
                    <td class="py-1.5 pr-3 font-mono-premium text-slate-500">
                      {{ row.currentTE }} → {{ row.finalTE }}
                    </td>
                    <td class="py-1.5 pr-3 font-mono-premium text-slate-700">{{ row.chain.join(' ') }}</td>
                    <td class="py-1.5 pr-3 text-right font-black">{{ row.durationDays.toFixed(2) }}</td>
                    <td class="py-1.5 pr-3">
                      <span v-if="row.space && !row.space.stoppedEarly" class="font-black text-emerald-700">
                        exhaustive
                      </span>
                      <span v-else-if="row.space" class="font-bold text-amber-700">partial</span>
                      <span v-else class="text-slate-500">{{ row.effort }}</span>
                    </td>
                    <td class="py-1.5 pr-3 text-right text-slate-500">{{ row.chainsPriced.toLocaleString() }}</td>
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
            an account still and varies the count.
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
            Best total days at each last checkpoint, one line per run. A flat bottom means the exact checkpoint barely
            matters; a bottom at the same place for everyone means the shape carries between accounts.
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
              Every chain {{ loadedRun.nickname || 'that run' }} priced
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
              {{ selectedCount }} ascensions came within 1% of this run's best ({{ plateau.bestDays.toFixed(2) }} d,
              <span class="font-mono-premium">{{ plateau.bestChain.join(' ') }}</span
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
            <b class="text-slate-700">These are searches, not surveys.</b> Most runs explored a band somebody typed, so
            this shows where good chains were FOUND, which is not the same as where good chains ARE. A band that stops
            dead at a round number is usually the edge of a search box.
          </p>
        </section>
      </template>

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
import CountShapeChart from './CountShapeChart.vue';
import LegProfileChart from './LegProfileChart.vue';
import CountCompareChart from './CountCompareChart.vue';
import FinalLegChart from './FinalLegChart.vue';
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
  exactDuplicateIds,
  flagOf,
  groupByAccount,
  groupByCount,
  nearBestBands,
  targetsPresent,
} from './analysis';
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
const selectedCount = ref(0);

const csvLoadingId = ref('');
const csvError = ref('');
const loadedRun = ref<CollectorRow | null>(null);
const loadedChains = ref<PricedChain[]>([]);
const loadedTruncated = ref(0);
const loadedCurrentTE = ref(0);
const loadedFinalTE = ref(0);

onMounted(() => {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(BASE_STORAGE_KEY);
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
    rows.value = fetched;
    if (!rows.value.length) error.value = 'The collector answered, but it is holding no runs yet.';
  } catch (e) {
    if (isAbort(e) || allController !== controller) return;
    // A failed fetch here is almost always CORS or a typo'd host, and the browser's own message
    // for both is "Failed to fetch". Say which two things to check rather than repeating it.
    rows.value = [];
    error.value = `${e instanceof Error ? e.message : String(e)} — check the URL, and that the collector allows this origin.`;
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
  if (typeof localStorage !== 'undefined') localStorage.setItem(BASE_STORAGE_KEY, normalised);
  void load();
}

function forgetBase(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(BASE_STORAGE_KEY);
  typedBase.value = base.value ?? '';
  base.value = null;
  rows.value = [];
  closeTable();
}

/** Exact copies of an earlier row. Hidden everywhere: they would count one run twice. */
const dupeIds = computed(() => exactDuplicateIds(rows.value));

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

/** What every view on the page reads. */
const usable = computed(() =>
  rows.value.filter(r => !dupeIds.value.has(r.id) && (showFlagged.value || !flagged.value.has(r.id)))
);

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

const countGroups = computed(() => groupByCount(filtered.value));

watch(countGroups, list => {
  if (list.length && !list.some(g => g.ascensions === selectedCount.value)) {
    // The count with the most runs behind it, which is the one with something to say.
    selectedCount.value = list.reduce((a, b) => (b.rows.length > a.rows.length ? b : a)).ascensions;
  }
});

const selected = computed(() => countGroups.value.find(g => g.ascensions === selectedCount.value) ?? null);

const comparisons = computed(() => compareCounts(filtered.value));

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
    csvError.value = e instanceof Error ? e.message : String(e);
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

// The deep dive belongs to ONE run at ONE ascension count. Change the target or the count and it
// no longer describes what the rest of the page is showing: `plateau` filters the loaded table by
// `selectedCount`, finds nothing at the new count and silently disappears, leaving a 60,000-point
// scatter sitting under a heading about a run that has been filtered out of view. Close it instead.
watch([selectedCount, finalTE, exhaustiveOnly], () => {
  if (loadedRun.value) closeTable();
});

const loadedBestChain = computed(() => {
  if (!loadedChains.value.length) return [];
  return loadedChains.value.reduce((a, b) => (b.days < a.days ? b : a)).chain;
});

const plateau = computed(() =>
  loadedChains.value.length
    ? nearBestBands(loadedChains.value, loadedCurrentTE.value, loadedFinalTE.value, selectedCount.value)
    : null
);

function absoluteOf(fraction: number): number {
  return Math.round(loadedCurrentTE.value + fraction * (loadedFinalTE.value - loadedCurrentTE.value));
}
</script>
