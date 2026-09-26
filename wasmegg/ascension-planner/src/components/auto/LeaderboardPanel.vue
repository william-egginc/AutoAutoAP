<!--
  The chain leaderboard, read from the collector and rendered in the planner's own styling.

  The same data is served as a standalone page by the Worker itself, and that page is still the
  right answer for someone following a link from outside. This exists because the people most
  likely to want the board are the ones already looking at their own result, and sending them to
  another domain to compare against it is a worse experience than a tab.

  It re-implements the table rather than framing the Worker's page: an iframe would carry the
  other page's styling into the middle of this one, would not share the planner's TE target, and
  could not offer "use this chain". Nothing here re-simulates anything -- it is one GET.

  THREE TABS, because a plan length answers none of the questions people bring here. A plan's
  length counts from its own start, so the same plan run a day later is a day shorter; a board
  sorted by it rewards whoever submitted most recently (a player's own words: "every day the new
  run shows up 1 day faster than the previous best, but it's the same plan"). So:

    - Race: one line per named player, sorted by the date their best plan that still counts
      reaches the target (lib/leaderboardRank.ts has the rules). Being further along counts, and
      the header says so.
    - My plans: only the loaded save's account, where "is this plan better" has a real answer.
    - All runs: every row, exact copies shown once, every column sortable.
-->
<template>
  <div class="space-y-4">
    <div class="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Chain leaderboard</h3>
          <!-- The board answers "who gets there first", which says little about which SHAPE of
               chain works. The explorer answers that one, per ascension count, so it is linked
               from here, where somebody is already looking at other people's runs. -->
          <a
            :href="explorerHref"
            class="inline-block mt-1 text-[11px] font-black text-indigo-700 hover:text-indigo-900 underline decoration-indigo-300"
          >
            Explore every run by ascension count →
          </a>
        </div>
        <div class="flex items-end gap-2">
          <label class="block">
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

      <p v-if="error" class="text-[11px] text-red-700 font-semibold">Could not reach the collector: {{ error }}</p>

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
            Who reaches {{ target }} first on their current best plan. Being further along counts, so this is a race,
            not a plan-quality score. To compare a route with yours, press <span class="font-semibold">Use</span>.
          </p>
          <label v-if="myTE > 0" class="inline-flex items-center gap-2 text-[11px] text-indigo-900/80">
            <input v-model="nearMe" type="checkbox" class="rounded border-indigo-300 text-indigo-600" />
            Only players within {{ NEAR_TE }} TE of you (you are at TE {{ myTE }})
          </label>

          <p v-if="!race || !race.entries.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
            No named player has a current plan to {{ target }} yet. Put a name in the box when you share a result to
            join.
          </p>
          <p v-else-if="!raceShown.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
            Nobody within {{ NEAR_TE }} TE of you has a current plan to {{ target }}.
          </p>
          <!-- A size container, so an opened player's plans can be exactly as wide as what is on
               screen (100cqw) however wide the table itself is. -->
          <div v-else class="overflow-x-auto [container-type:inline-size]">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-left">
                  <th class="py-2 pr-2"></th>
                  <th class="py-2 pr-3 text-right">#</th>
                  <th class="py-2 pr-3">Player</th>
                  <th class="py-2 pr-3">Route</th>
                  <th
                    class="py-2 pr-3"
                    :title="`Dates are in your timezone (${viewZone}); hover one for the player's own`"
                  >
                    Finishes
                  </th>
                  <th class="py-2 pr-3 text-right">Days left</th>
                  <th class="py-2 pr-3 text-right">From TE</th>
                  <th class="py-2 pr-3">Planned</th>
                  <th class="py-2 pr-3">Schedule</th>
                  <th class="py-2 pr-3 text-right">Tried</th>
                  <th class="py-2"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="e in raceShown" :key="e.key">
                  <tr class="border-t border-slate-100" :class="isMe(e) ? 'bg-emerald-50/60' : ''">
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
                    <td class="py-2 pr-3 font-bold text-slate-700 whitespace-nowrap">
                      {{ e.label }}
                      <span
                        v-if="isMe(e)"
                        class="ml-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest"
                        >you</span
                      >
                    </td>
                    <td class="py-2 pr-3 whitespace-nowrap">
                      <span class="font-mono font-bold text-slate-700">{{ e.best.row.chain.join(' ') }}</span>
                      <span
                        v-for="t in raceTags.get(e.key) ?? []"
                        :key="t"
                        class="ml-1.5 px-1 py-0.5 rounded bg-sky-100 text-[9px] font-black text-sky-800"
                        >{{ t }}</span
                      >
                    </td>
                    <td
                      class="py-2 pr-3 text-slate-700 font-bold whitespace-nowrap"
                      :title="finishTitle(e.best.finish, e.best.row.timezone)"
                    >
                      {{ finishDateText(e.best.finish, viewZone) }}
                    </td>
                    <td class="py-2 pr-3 text-right text-slate-700 font-bold">
                      {{ daysLeftText(e.best.finish, now, viewZone) }}
                    </td>
                    <td class="py-2 pr-3 text-right text-slate-600">{{ e.best.row.currentTE ?? '—' }}</td>
                    <td class="py-2 pr-3 text-slate-500">{{ plannedText(e.best) }}</td>
                    <td class="py-2 pr-3 text-slate-400">{{ e.best.row.window || 'any time' }}</td>
                    <td class="py-2 pr-3 text-right text-slate-500 whitespace-nowrap" :title="`${e.sends} sent`">
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
                    <td colspan="11" class="p-0">
                      <!-- Exactly as wide as the visible part of the table and pinned to its left
                           edge: on a phone the Race table is wider than the screen, and a plan list
                           left to size itself would stretch it further and wrap every line. The
                           list scrolls sideways inside this block instead. -->
                      <div class="sticky left-0 w-[100cqw] px-3 py-3 space-y-3">
                        <div>
                          <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            {{ e.label }}'s current plans
                          </h4>
                          <LeaderboardPlanList
                            :plans="[e.best, ...e.others]"
                            :all-plans="e.plans"
                            :best="e.best"
                            :now="now"
                            :view-zone="viewZone"
                            :csv-root="csvRoot"
                            gap-label="vs best"
                            @use="c => emit('use', c)"
                          />
                          <p class="mt-1 text-[10px] text-slate-400">
                            "vs best" is shown only for plans made from the same save as the best one.
                          </p>
                        </div>
                        <div v-if="e.dropped.length">
                          <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                            Not counted
                          </h4>
                          <LeaderboardPlanList
                            :plans="e.dropped"
                            :all-plans="e.plans"
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

          <details v-if="race && race.waiting.length" class="text-[11px] text-indigo-900/80">
            <summary class="cursor-pointer font-semibold">
              No current plan to {{ target }} ({{ race.waiting.length }}
              {{ race.waiting.length === 1 ? 'player' : 'players' }})
            </summary>
            <ul class="mt-1 space-y-0.5">
              <li v-for="w in race.waiting" :key="w.key">
                <span class="font-bold">{{ w.label }}</span>
                <span class="text-slate-500"> — {{ w.dropped[0]?.reason || 'no plan that counts' }}</span>
              </li>
            </ul>
          </details>

          <p class="text-[10px] text-slate-500 leading-relaxed">
            A player's line is their earliest-finishing plan that still counts. A plan stops counting when a newer run
            of the same plan replaces it (the newest run always wins, earlier or later), when a newer run shows them 2
            or more TE behind where it said they would be, when it is a what-if (it starts more than 12 hours after it
            was sent, or was planned from a higher TE than a later run shows), or when it is older than 30 days.
            Anonymous runs are not in the race: add a name to join. A re-run of a named plan sent without a name from
            the same account still counts as a re-check of that plan. Every run is still in All runs. Finish dates and
            days left are in your timezone ({{ viewZone }}); hover a date to see it in the player's own.
          </p>
        </template>
      </template>

      <!-- ================================================================== MINE -->
      <template v-else-if="tab === 'mine'">
        <p v-if="!myKey" class="text-[11px] text-indigo-900/70 py-4">
          Load your save to see your own plans here. They are matched to your account by timezone and artifacts.
        </p>
        <p v-else-if="target == null" class="text-[11px] text-indigo-900/70 py-4">
          Pick a target TE above to see your plans to it.
        </p>
        <p v-else-if="!mine" class="text-[11px] text-indigo-900/70 py-4">
          Nothing on the board to {{ target }} matches your save (same timezone and artifacts). Share a result and it
          shows up here. A run sent before you last upgraded an artifact will not match.
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
            <template v-else>None of your plans to {{ target }} counts right now; see why below.</template>
            {{ mine.sends }} {{ mine.sends === 1 ? 'run' : 'runs' }} sent, {{ mine.plansTried }} different
            {{ mine.plansTried === 1 ? 'plan' : 'plans' }}.
          </p>
          <p class="text-[10px] text-slate-500 leading-relaxed">
            "vs your best" compares plans made from the same save, where the gap is the plans and nothing else. For a
            plan from an older save, press Use to price it again from today's save.
          </p>
          <LeaderboardPlanList
            v-if="mine.best"
            :plans="[mine.best, ...mine.others]"
            :all-plans="mine.plans"
            :best="mine.best"
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
              :all-plans="mine.plans"
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
          Every run on the board. The same result sent more than once shows once, with how many times it was sent; open
          it for every copy and its CSV. Two lines with the same route and start that differ in a setting say which.
          Plan length counts from each run's own start, so it shrinks every day a plan is run again; compare finish
          dates instead. A route's length on someone else's account says little about yours until you press
          <span class="font-semibold">Use</span>.
        </p>
        <p v-if="!runLines.length" class="text-[11px] text-indigo-900/60 py-6 text-center">
          No runs to {{ target }} yet.
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-left">
                <th class="py-2 pr-3"></th>
                <th v-for="c in COLUMNS" :key="c.key" class="py-2 pr-3" :class="c.right ? 'text-right' : ''">
                  <button
                    type="button"
                    class="uppercase tracking-widest hover:text-slate-700"
                    :class="sortKey === c.key ? 'text-slate-700' : ''"
                    :aria-sort="sortKey === c.key ? (sortAsc ? 'ascending' : 'descending') : 'none'"
                    @click="sortBy(c.key)"
                  >
                    {{ c.label }}<span v-if="sortKey === c.key">{{ sortAsc ? ' ▲' : ' ▼' }}</span>
                  </button>
                </th>
                <th class="py-2"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="line in sortedLines" :key="line.key">
                <tr class="border-t border-slate-100">
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
                  <td class="py-2 pr-3 font-bold text-slate-700 whitespace-nowrap">
                    {{ line.nickname || 'anonymous' }}
                  </td>
                  <td class="py-2 pr-3 whitespace-nowrap">
                    <span class="font-mono font-bold text-slate-700">{{ line.row.chain.join(' ') }}</span>
                    <span
                      v-if="line.copies > 1"
                      class="ml-1.5 px-1 py-0.5 rounded bg-slate-200 text-[9px] font-black text-slate-600"
                      :title="`The same result was sent ${line.copies} times. Found by: ${line.foundBy.join(', ')}. Open the line for each copy and its CSV.`"
                      >sent ×{{ line.copies }}</span
                    >
                    <span
                      v-for="t in line.tags"
                      :key="t"
                      class="ml-1.5 px-1 py-0.5 rounded bg-sky-100 text-[9px] font-black text-sky-800"
                      >{{ t }}</span
                    >
                  </td>
                  <td class="py-2 pr-3 text-right text-slate-600 font-bold">{{ line.row.ascensions ?? '—' }}</td>
                  <td class="py-2 pr-3 text-right text-slate-700 font-bold whitespace-nowrap">
                    {{ Number.isFinite(line.row.durationDays) ? line.row.durationDays.toFixed(3) : '—' }}
                  </td>
                  <td
                    class="py-2 pr-3 text-slate-500 whitespace-nowrap"
                    :title="finishTitle(line.finish, line.row.timezone)"
                  >
                    {{ finishDateText(line.finish, viewZone) }}
                  </td>
                  <td class="py-2 pr-3 text-right whitespace-nowrap">
                    <!-- null is "not recorded", not "free": a chain replayed from a saved search
                         kept no per-leg detail, and printing 0 would be a claim nobody measured. -->
                    <span v-if="line.row.waitingHours == null" class="text-slate-400">—</span>
                    <span v-else-if="line.row.waitingHours < 0.05" class="text-slate-400">none</span>
                    <span v-else class="font-bold text-amber-700">{{ line.row.waitingHours.toFixed(1) }} h</span>
                  </td>
                  <td class="py-2 pr-3 text-slate-400">{{ line.row.window || 'no schedule' }}</td>
                  <!-- A proof is not an effort tier. Insane mode does not use the effort knob, so
                       the tier it sends is whatever the main panel was left on; showing "balanced"
                       next to an exhaustive result reads as a weaker claim than the row is making.
                       `space` is present only on schema-4 Insane rows, so older rows are untouched. -->
                  <td class="py-2 pr-3 text-slate-400">
                    <span
                      v-if="line.row.space"
                      class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white"
                      :class="line.row.space.stoppedEarly ? 'bg-amber-600' : 'bg-indigo-600'"
                    >
                      {{ line.row.space.stoppedEarly ? 'partial' : 'exhaustive' }}
                    </span>
                    <span v-else>{{ line.row.effort || '—' }}</span>
                  </td>
                  <td class="py-2 pr-3 text-slate-400 whitespace-nowrap">
                    {{ (line.submittedAt || '').slice(0, 10) || '—' }}
                  </td>
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
                  <td :colspan="COLUMNS.length + 2" class="px-3 py-3">
                    <LeaderboardRunDetail :row="line.row" :copies="line.copyRows" :csv-root="csvRoot" />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>

      <p v-if="capped" class="text-[10px] text-amber-800">
        The collector sent its maximum of {{ ALL_CAP }} runs, so the oldest or slowest runs may be missing.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { describeFetchError } from '@/utils/errors';
import { computed, onMounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { sortRows, type SortKey, type SortableRow } from '@/lib/leaderboardSort';
import {
  accountKeyOf,
  buildMyPlans,
  buildRace,
  contentFingerprint,
  daysLeftPhrase,
  daysLeftText,
  finishDateText,
  finishMs,
  finishTitle,
  foldCopies,
  foundByText,
  localZone,
  nameRoots,
  placeFor,
  plannedText,
  settingTags,
  whoText,
  type BoardRow,
  type RaceEntry,
} from '@/lib/leaderboardRank';
import { virtueInventory } from '@/search/csv';
import { bestPerFamily, keepVirtueArtifacts } from '@/search/submission';
import LeaderboardPlanList from './LeaderboardPlanList.vue';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';

const emit = defineEmits<{ use: [chain: number[]] }>();

/** The collector's row shape (lib/leaderboardRank.ts). Loose on purpose: this reads a public
 *  endpoint that may be a version ahead or behind, and a missing field should render a dash. */
type Row = BoardRow;

type Tab = 'race' | 'mine' | 'all';
const TABS: Tab[] = ['race', 'mine', 'all'];
/** `GET /all` lists at most this many keys. */
const ALL_CAP = 1000;
/** "Near me" means a best plan that starts within this many TE of the loaded save. */
const NEAR_TE = 20;

const store = useChainSearchStore();
const initialState = useInitialStateStore();
const planner = useAutoPlannerStore();

const root = computed(() => store.leaderboardUrl.replace(/\/$/, ''));

/** The explorer is a second page in this same build, so it lives under whatever base was built. */
const explorerHref = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/explorer.html`;
const csvRoot = computed(() => `${root.value}/csv`);

const tab = ref<Tab>('race');
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

function tabLabel(t: Tab): string {
  if (t === 'race') return target.value == null ? 'Race' : `Race to ${target.value}`;
  return t === 'mine' ? 'My plans' : 'All runs';
}

/** Target-TE options, from what has actually been submitted plus the player's own target. */
const targets = computed(() => {
  const seen = new Set(allRows.value.map(r => r.finalTE).filter(v => Number.isFinite(v)));
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

function isMe(e: RaceEntry): boolean {
  return !!myKey.value && e.accounts.has(myKey.value);
}

// ------------------------------------------------------------------------------------ race

const race = computed(() =>
  target.value == null ? null : buildRace(allRows.value, { target: target.value, now: now.value })
);

/** Settings words for a race line whose best plan has a look-alike among the player's plans. */
const raceTags = computed(() => {
  const out = new Map<string, string[]>();
  for (const e of race.value?.entries ?? []) {
    const tags = settingTags(e.plans.map(p => p.row)).get(e.best.row);
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

// -------------------------------------------------------------------------------- my plans

const mine = computed(() =>
  myKey.value && target.value != null
    ? buildMyPlans(allRows.value, myKey.value, { target: target.value, now: now.value })
    : null
);

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
  /** Settings words when another line has the same route and start. */
  tags: string[];
  finish: number | null;
}

const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'nickname', label: 'Who' },
  { key: 'chain', label: 'Route' },
  { key: 'ascensions', label: 'Ascensions', right: true },
  // Named for what it is. Counted from the run's own start, it rewards whoever ran last.
  { key: 'durationDays', label: 'Plan length (from its start)', right: true },
  // Worked out from the start and the length, never read from the local `endLocal` text, which
  // sorts wrong across timezones.
  { key: 'finish', label: 'Finishes' },
  { key: 'waitingHours', label: 'Waiting', right: true },
  { key: 'window', label: 'Window' },
  // Without this, two rows from the same person that differ only by effort tier are
  // indistinguishable -- which is exactly the comparison the board keeps rows for.
  { key: 'effort', label: 'Effort' },
  // Dates matter here in a way they would not on a normal scoreboard: the simulator and the game
  // both change, so a result from two months ago was produced by different code than one from
  // yesterday, and a reader comparing them should be able to see that.
  { key: 'submittedAt', label: 'Submitted' },
];

const runLines = computed<RunLine[]>(() => {
  const rows = target.value == null ? allRows.value : allRows.value.filter(r => r.finalTE === target.value);
  // Names filed over every row, as the Race does, so both tabs fold the same copies together.
  const folded = foldCopies(rows, nameRoots(allRows.value));
  const tags = settingTags(folded.map(f => f.row));
  return folded.map(f => ({
    key: f.row.id ?? contentFingerprint(f.row),
    row: f.row,
    copies: f.copies.length,
    copyRows: f.copies,
    foundBy: f.foundBy,
    tags: tags.get(f.row) ?? [],
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

async function fetchAll(query: string): Promise<Row[]> {
  const res = await fetch(`${root.value}/all${query}`);
  if (!res.ok) throw new Error(`the collector answered ${res.status}`);
  const data = (await res.json()) as { rows?: Row[] };
  return Array.isArray(data.rows) ? data.rows.filter(r => r && Array.isArray(r.chain)) : [];
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
  try {
    let rows = await fetchAll('');
    let full = rows.length >= ALL_CAP;
    // The list is in key order -- target, then plan length -- so past the cap the chosen target
    // can be cut short. Ask for it on its own as well.
    if (full && target.value != null) {
      const more = await fetchAll(`?final=${encodeURIComponent(String(target.value))}`);
      const seen = new Set(rows.map(r => r.id));
      rows = [...rows, ...more.filter(r => !r.id || !seen.has(r.id))];
      full = more.length >= ALL_CAP;
    }
    allRows.value = rows;
    capped.value = full;
    now.value = Date.now();
  } catch (e) {
    error.value = describeFetchError(e, 'the leaderboard');
    allRows.value = [];
  } finally {
    loading.value = false;
  }
}

// Everything is already in hand, so a new target is a re-sort -- unless the list was cut short.
watch(final, () => {
  open.value = '';
  if (capped.value) void load();
});

onMounted(load);
</script>
