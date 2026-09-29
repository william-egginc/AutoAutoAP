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
        for {{ inPlannerZone(store.deadlineUnfinished.spec.deadline) }}, {{ store.deadlineUnfinished.spec.minStops }}–{{
          store.deadlineUnfinished.spec.maxStops
        }}
        stops, from {{ store.deadlineUnfinished.te }} TE ({{ ago(store.deadlineUnfinished.updatedAt) }}).
        <template v-if="store.deadlineUnfinished.saveKept">
          Carrying on replays them instantly and continues on the save it started with.</template
        >
        <template v-else> Its save wasn't kept on this device, so it can't carry on.</template>
        Starting a new search replaces it.
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          v-if="store.deadlineUnfinished.saveKept"
          type="button"
          class="px-4 py-2 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800"
          @click="store.resumeDeadline(playerId)"
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
      Game events, Egg Day's own bonuses included, aren't simulated: the plan is for reaching the TE by then.
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

    <!-- The player's own space, Insane-style: a box per stop. -->
    <template v-if="mode === 'space'">
      <div class="flex flex-wrap items-end gap-4">
        <label class="space-y-1">
          <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest"
            >Ascensions, including the last stop</span
          >
          <input
            v-model.number="ascensions"
            type="number"
            min="1"
            max="8"
            :disabled="store.busy"
            class="w-20 rounded-lg border-slate-200 text-sm font-bold"
          />
        </label>
        <button
          type="button"
          :disabled="store.busy"
          class="px-3 py-2 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          @click="suggest"
        >
          Suggest a space
        </button>
        <span class="text-[11px] text-slate-500">{{ suggestFrom }}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label v-for="(_, k) in boxes" :key="k" class="space-y-1">
          <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Stop {{ k + 1 }}</span>
          <input
            v-model="boxes[k]"
            type="text"
            :disabled="store.busy"
            placeholder="e.g. 160-200:10"
            class="w-full rounded-lg border-slate-300 text-sm font-mono-premium font-bold text-slate-800 disabled:opacity-50"
          />
          <span class="block text-[10px]" :class="boxValues[k].length ? 'text-slate-500' : 'text-rose-600'">
            {{ boxValues[k].length ? `${boxValues[k].length} values` : 'nothing to try yet' }}
          </span>
        </label>
        <label class="space-y-1">
          <span class="block text-[9px] font-black text-slate-400 uppercase tracking-widest"
            >Last stop — the answer</span
          >
          <input
            v-model="lastBox"
            type="text"
            :disabled="store.busy"
            placeholder="e.g. 220-320"
            class="w-full rounded-lg border-slate-300 text-sm font-mono-premium font-bold text-slate-800 disabled:opacity-50"
          />
          <span class="block text-[10px]" :class="lastRange ? 'text-slate-500' : 'text-rose-600'">
            {{ lastRange ? `found to the exact TE between ${lastRange[0]} and ${lastRange[1]}` : 'give it a range' }}
          </span>
        </label>
      </div>
      <p class="text-[11px] text-slate-500 leading-relaxed">
        One box per ascension before the last. Each takes <span class="font-mono-premium">lo-hi:step</span>, single
        values, or several of either with commas: <span class="font-mono-premium">138-142:1, 150, 160-180:5</span>.
        Every combination in your boxes is tried and nothing outside them, so the answer is proven for this space. The
        last stop is found exactly, not stepped. Stops have to go up.
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
        It picks the early stops itself, starting from your current route: the first stop at every TE for the first 5
        above your TE, the rest on a {{ usedStep }}-TE grid ({{ shapes.toLocaleString() }} sets), and for each one the
        highest last stop that still makes the deadline. Then it homes in on the best few, moving one stop at a time by
        {{ resolutionsText }} TE. Quicker than a space of your own, but not proven: it can miss a route off the grid.
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
        machine's measured speed on {{ store.workerBudget }} workers when there is one, and errs high: these routes are
        shorter than a run to 490.
      </p>
    </div>

    <label v-if="store.scheduleEnabled" class="flex items-start gap-3 cursor-pointer">
      <input v-model="ascendNeeded" type="checkbox" :disabled="store.busy" class="mt-0.5 rounded border-slate-300" />
      <span class="text-[11px] text-slate-600 leading-relaxed">
        <span class="font-bold text-slate-800">I need to ascend at the last stop before the deadline.</span> Counts the
        wait for your awake hours after reaching it, so the last stop is reached in time to act on it.
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

    <div class="flex flex-wrap gap-3">
      <button
        class="btn-premium btn-primary flex-1 py-4 text-sm shadow-xl shadow-rose-500/20 active:scale-[0.98]"
        :disabled="store.busy || store.integrityBlocked || store.staleBackupBlocked || !canStart"
        @click="start"
      >
        {{ store.deadlineRunning ? 'Searching...' : 'Find the highest TE by then' }}
      </button>
      <button
        v-if="store.deadlineRunning"
        class="px-6 py-4 rounded-xl border border-slate-300 text-sm font-black text-slate-700 hover:bg-slate-50"
        @click="store.stopDeadline()"
      >
        Stop
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
        <span class="font-bold">{{ liveDone.toLocaleString() }}</span> of ~{{ liveTotal.toLocaleString() }} routes
        priced · {{ elapsedLabel }} so far<template v-if="remainingLabel"> · about {{ remainingLabel }} left</template>
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
            reachable: raise "Highest last stop to consider" and run it again.</template
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { formatInZone } from '@/search/csv';
import { countBandShapes, countShapes, parseStopBox, stepForBudget } from '@/search/deadline';
import { estimateHours, formatHours } from '@/search/exhaustive';
import { downloadCsv } from '@/utils/export';
import IntegrityNotice from './IntegrityNotice.vue';
import SafariNotice from './SafariNotice.vue';

const props = defineProps<{ playerId: string }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const plannerZone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

/** The next Egg Day (14 July) at 9:00 AM Pacific that has not passed yet. */
function nextEggDayYear(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  return Date.now() / 1000 < getLocalTimestampInTimezone(`${y}-07-14`, '09:00', 'America/Los_Angeles') ? y : y + 1;
}
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

/** Ascensions including the last stop; one box per ascension before it. */
const ascensions = ref(4);
const boxes = ref<string[]>([]);
const lastBox = ref('');
const suggestFrom = ref('');
const boxValues = computed(() => boxes.value.map(b => parseStopBox(b)));
const lastRange = computed<[number, number] | null>(() => {
  const v = parseStopBox(lastBox.value, 1);
  if (!v.length) return null;
  const lo = Math.max(v[0], Math.floor(store.currentTE) + 1);
  const hi = Math.min(490, v[v.length - 1]);
  return hi >= lo ? [lo, hi] : null;
});

/**
 * Fill the boxes: around your last deadline answer at this many ascensions if there is one, else
 * around your own route (the chain in the planner), else evenly spaced. The first stop is tried at
 * every TE near your current one, where the first ascension usually belongs; the rest every 5 TE
 * either side, and the last stop over a range around the answer.
 */
function suggest(): void {
  const n = Math.max(1, Math.min(8, Math.floor(ascensions.value || 1)));
  const te = Math.floor(store.currentTE);
  const prior = store.deadlineResult?.byStops.find(r => r.chain.length === n) ?? store.deadlineResult?.routes[0];
  const lastGuess = prior ? prior.chain[prior.chain.length - 1] : Math.min(490, te + 110);
  let early: number[];
  if (prior && prior.chain.length === n) {
    early = prior.chain.slice(0, -1);
    suggestFrom.value = `Around your last answer, ${prior.chain.join(' ')}.`;
  } else {
    const route = store.seedChain.filter(v => v > te && v < lastGuess);
    if (route.length >= n - 1) {
      early = route.slice(0, n - 1);
      suggestFrom.value = `Around your route, ${route.slice(0, n - 1).join(' ')}.`;
    } else {
      early = Array.from({ length: n - 1 }, (_, i) => Math.round(te + ((i + 1) * (lastGuess - te)) / n));
      suggestFrom.value = 'Evenly spaced: no answer or route to start from yet.';
    }
  }
  boxes.value = early.map((c, i) => {
    if (i === 0 && c - te <= 12) return `${te + 1}-${Math.max(te + 6, c + 4)}:1`;
    if (i === 0) return `${c - 8}-${c + 8}:2`;
    return `${c - 15}-${c + 15}:5`;
  });
  lastBox.value = `${Math.max(te + 2, lastGuess - 20)}-${Math.min(490, lastGuess + 20)}`;
}

// A new box when the count goes up (spaced on from the last one), one fewer when it goes down.
watch(ascensions, n => {
  const want = Math.max(0, Math.min(7, Math.floor(n || 1) - 1));
  const b = [...boxes.value];
  while (b.length > want) b.pop();
  while (b.length < want) {
    const prev = boxValues.value[b.length - 1];
    const from = prev?.length ? prev[prev.length - 1] + 10 : Math.floor(store.currentTE) + 10;
    b.push(`${from}-${from + 30}:5`);
  }
  boxes.value = b;
});
// First fill once the save has loaded, so the boxes start from something real.
watch(
  () => store.currentTE,
  te => {
    if (te > 0 && !boxes.value.length && !lastBox.value) suggest();
  },
  { immediate: true }
);

const spaceShapes = computed(() =>
  lastRange.value && boxValues.value.every(v => v.length)
    ? countBandShapes(boxValues.value, store.currentTE, lastRange.value[1])
    : 0
);

// ------------------------------------------------------------------ estimate and live progress

/**
 * Routes per set of early stops: the last stop is found by halving its range down to one TE, plus
 * a couple to step out and confirm -- log2(range) + 2. Measured: 8 a set over a 30-TE range.
 */
const PROBES = computed(() => {
  const width =
    mode.value === 'space' && lastRange.value
      ? lastRange.value[1] - lastRange.value[0] + 1
      : Math.max(2, lastHi.value - Math.floor(store.currentTE));
  return Math.ceil(Math.log2(Math.max(2, width))) + 2;
});
const plannedShapes = computed(() => (mode.value === 'space' ? spaceShapes.value : shapes.value));
/** Picking the stops adds its seed pass and the homing in on top of the grid: about a fifth more. */
const plannedRoutes = computed(() =>
  Math.round(plannedShapes.value * PROBES.value * (mode.value === 'auto' ? 1.2 : 1))
);
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
  liveTotal.value ? Math.min(99, Math.round((100 * liveDone.value) / liveTotal.value)) : 0
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
    if (!boxValues.value.every(v => v.length)) return 'Every stop box needs at least one value.';
    if (!lastRange.value) return 'Give the last stop a range above your TE now.';
    if (!spaceShapes.value) return 'No route in these boxes goes up from your TE to the last stop.';
    return '';
  }
  if (minStops.value > maxStops.value) return 'The fewest stops is more than the most.';
  if (maxStops.value > 8) return 'Up to 8 stops.';
  if (!(lastHi.value > store.currentTE + 1)) return 'The highest last stop has to be above your TE now.';
  return '';
});
const canStart = computed(() => !!deadline.value && !startIssue.value && store.currentTE > 0);

async function start(): Promise<void> {
  runEstimate.value = plannedRoutes.value;
  if (mode.value === 'space' && lastRange.value) {
    const n = boxValues.value.length + 1;
    await store.startDeadline(props.playerId, {
      deadline: deadline.value,
      minStops: n,
      maxStops: n,
      lastLo: lastRange.value[0],
      lastHi: lastRange.value[1],
      step: 1,
      ascendNeeded: ascendNeeded.value,
      bands: boxValues.value.map(v => [...v]),
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
  });
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
  return formatInZone(unixSeconds, plannerZone.value);
}
function spareLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.max(0, Math.round(seconds / 60))} min`;
  if (seconds < 2 * 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}
</script>
