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
      It guesses the early stops itself, starting from your current route: the first stop at every TE for the first 5
      above your TE, the rest on a {{ usedStep }}-TE grid
      <template v-if="usedStep !== step">(raised from {{ step }} to keep it to {{ shapes.toLocaleString() }})</template
      ><template v-else>({{ shapes.toLocaleString() }} of them)</template>, and for each one the highest last stop that
      still makes the deadline. Then it homes in on the best few, moving one stop at a time by {{ resolutionsText }} TE.
      A stop count of 1 means no ascension: keep going on this farm to the last stop.
    </p>
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

    <div v-if="store.deadlineProgress && (store.deadlineRunning || !store.deadlineResult)" class="space-y-1">
      <p class="text-[11px] text-slate-600">
        <span class="font-bold">{{ store.deadlineProgress.stage }}</span> ·
        {{ store.deadlineProgress.priced.toLocaleString() }} routes priced
        <template v-if="store.deadlineProgress.open">
          · {{ store.deadlineProgress.open.toLocaleString() }} of
          {{ store.deadlineProgress.shapes.toLocaleString() }} still narrowing</template
        >
      </p>
      <p v-if="store.deadlineProgress.best" class="text-[11px] text-slate-600">
        Best so far: <span class="font-bold">{{ store.deadlineProgress.best.chain.join(' ') }}</span> ({{
          spareLabel(store.deadlineProgress.best.spare)
        }}
        to spare)
      </p>
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
          Top routes ({{ result.priced.toLocaleString() }} priced, early stops every {{ result.step }} TE, then refined)
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
      <p class="text-[11px] text-slate-500 leading-relaxed">
        Priced from {{ inPlannerZone(result.planStart) }} at {{ result.te }} TE, with the schedule and time off above. A
        route that reaches one more TE usually has much less time to spare: the table shows both so you can choose.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { getLocalTimestampInTimezone } from '@/lib/events';
import { formatInZone } from '@/search/csv';
import { countShapes, stepForBudget } from '@/search/deadline';
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

const startIssue = computed(() => {
  if (!deadline.value) return '';
  if (deadline.value <= store.planStart) return 'The deadline is before the plan starts.';
  if (minStops.value > maxStops.value) return 'The fewest stops is more than the most.';
  if (maxStops.value > 8) return 'Up to 8 stops.';
  if (!(lastHi.value > store.currentTE + 1)) return 'The highest last stop has to be above your TE now.';
  return '';
});
const canStart = computed(() => !!deadline.value && !startIssue.value && store.currentTE > 0);

async function start(): Promise<void> {
  await store.startDeadline(props.playerId, {
    deadline: deadline.value,
    minStops: specForCount.value.minStops,
    maxStops: specForCount.value.maxStops,
    lastHi: Math.min(490, Math.floor(lastHi.value)),
    step: step.value,
    ascendNeeded: ascendNeeded.value,
  });
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
