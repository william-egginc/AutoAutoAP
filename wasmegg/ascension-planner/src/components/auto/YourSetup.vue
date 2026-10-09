<!--
  "Your setup": every setting the Auto Planner's screens share, in one place at the top of each
  (the unified layout, phase 2). Classic, Fastest route and Highest TE by a date all read the same
  store fields, and each used to show its own copy of them -- the schedule in two wordings, keep
  awake in three places -- so a player changed their hours on one screen and wondered whether the
  next had them. Now there is one copy, and it says on each screen what that screen does with it.

  Folded to one line by default, like the setting cards it replaces: a folded setting still shows
  its value, since a hidden one is how people run with a schedule they forgot they set.

  The settings that change which route is fastest (plan start, hours, time off) lock while a search
  runs: every route already priced was priced under the old ones. The machine settings don't, since
  a running search resizes to them.
-->
<template>
  <!-- Strong colour and a real button: folded into a thin line it was easy to miss (the user, 30 Sept). -->
  <section class="text-left" :class="docked ? '' : 'rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 shadow-sm'">
    <!-- On a screen: one line, every value visible; Edit setup opens the floating panel
         (SetupDock.vue), the one place the setup is edited. -->
    <button
      v-if="!docked"
      type="button"
      class="w-full flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5 text-left"
      :aria-expanded="ui.setupOpen"
      @click="ui.setupOpen = !ui.setupOpen"
    >
      <span class="flex items-center gap-2 text-sm font-black text-indigo-900">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 002.6 1.1c1.5-1 3.4.9 2.4 2.4a1.7 1.7 0 001.1 2.6c1.8.4 1.8 3 0 3.4a1.7 1.7 0 00-1.1 2.6c1 1.5-.9 3.4-2.4 2.4a1.7 1.7 0 00-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 00-2.6-1.1c-1.5 1-3.4-.9-2.4-2.4a1.7 1.7 0 00-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 001.1-2.6c-1-1.5.9-3.4 2.4-2.4a1.7 1.7 0 002.6-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        Your setup
      </span>
      <span class="text-[12px] text-slate-600"
        >Plan starts <span class="font-bold text-slate-900">{{ startLabel }}</span></span
      >
      <span class="text-[12px] text-slate-600"
        >Awake <span class="font-bold text-slate-900">{{ awakeLabel }}</span></span
      >
      <span class="text-[12px] text-slate-600"
        >Time off <span class="font-bold text-slate-900">{{ timeOffCount || 'none' }}</span></span
      >
      <span class="text-[12px] text-slate-600"
        ><span class="font-bold text-slate-900">{{ store.workerBudget }} of {{ store.machineThreads }}</span>
        workers</span
      >
      <span
        class="ml-auto px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest"
        :class="ui.setupOpen ? 'border border-indigo-300 text-indigo-700 bg-white' : 'bg-indigo-600 text-white'"
        >{{ ui.setupOpen ? 'Close setup' : 'Edit setup' }}</span
      >
    </button>

    <!-- Problems with the save show folded too: nobody opens a card to look for them. -->
    <div v-if="!docked && store.setupIssues.length" class="border-t border-indigo-50 px-4 py-2 space-y-1">
      <p
        v-for="(issue, k) in store.setupIssues"
        :key="k"
        class="text-[11px] font-semibold leading-relaxed"
        :class="issue.level === 'error' ? 'text-rose-700' : 'text-amber-700'"
      >
        {{ issue.level === 'error' ? '✕' : '!' }} {{ issue.message }}
      </p>
    </div>

    <div v-if="docked" class="p-4 space-y-4">
      <p class="text-[11px] text-slate-500">
        One setup for all three Auto Planner screens: change it here and Your plan, {{ fastestName(store.finalTE) }} and
        {{ NAMES.byDate }} all use it.
      </p>

      <p
        v-if="locked"
        class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800 leading-relaxed"
      >
        A search is running, so the plan start, your hours and time off are locked: they change which route is fastest,
        and the routes already priced used the old ones. Stop the search (your best so far is kept), change them, and
        start again. The computer settings still work.
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Your save -->
        <div class="rounded-xl border border-slate-200 p-4 space-y-2">
          <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Your save</h3>
          <p class="text-sm font-bold text-slate-800">
            {{ initialState.nickname || 'Your account' }} · TE {{ store.currentTE }}
          </p>
          <p class="text-[11px] text-slate-500">{{ saveAgeLabel }}</p>
          <button
            type="button"
            :disabled="store.busy || ui.loading"
            class="px-3 py-1.5 rounded-lg border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            @click="ui.backupRetryRequested++"
          >
            Load latest save
          </button>
          <!-- What the plan starts from, besides the artifacts: leg 1 continues an already-built farm,
               and every later leg funds its own research out of earnings. -->
          <dl class="grid grid-cols-2 gap-3 text-[11px] border-t border-slate-100 pt-3">
            <div>
              <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Soul eggs</dt>
              <dd class="font-bold" :class="store.setupFacts.soulEggs > 0 ? 'text-slate-700' : 'text-rose-700'">
                {{ formatSoulEggs(store.setupFacts.soulEggs) }}
              </dd>
            </div>
            <!-- Both, side by side: a reported failure was exactly these two disagreeing. -->
            <div>
              <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Starting TE</dt>
              <dd
                class="font-bold"
                :class="
                  Math.abs(store.setupFacts.currentTE - store.setupFacts.backupTE) > 3
                    ? 'text-rose-700'
                    : 'text-slate-700'
                "
              >
                {{ store.setupFacts.currentTE }}
                <span class="font-normal text-slate-400">· save says {{ store.setupFacts.backupTE }}</span>
              </dd>
            </div>
            <div>
              <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Epic research</dt>
              <dd class="font-bold text-slate-700">
                {{ store.setupFacts.epicAtMax }} / {{ store.setupFacts.epicTotal }} maxed
              </dd>
            </div>
            <div>
              <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Colleggtibles</dt>
              <dd class="font-bold text-slate-700">{{ store.setupFacts.colleggtibles }}</dd>
            </div>
          </dl>
          <p
            v-for="(issue, k) in saveCardIssues"
            :key="k"
            class="text-[11px] font-semibold leading-relaxed"
            :class="issue.level === 'error' ? 'text-rose-700' : 'text-amber-700'"
          >
            {{ issue.level === 'error' ? '✕' : '!' }} {{ issue.message }}
          </p>
        </div>

        <!-- When the plan starts -->
        <fieldset :disabled="locked" class="rounded-xl border border-slate-200 p-4 space-y-3 min-w-0">
          <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">When the plan starts</h3>
          <SchedulingInputs />
          <!-- An unset start means "now", which moves on every reload, and plan start is part of the
               run fingerprint: a checkpoint saved before a refresh stops matching. -->
          <p v-if="store.planStartIsNow" class="text-[11px] font-semibold text-amber-700 leading-relaxed">
            No start set, so the plan is timed from right now, and that moves every time you reload. Set a date and time
            before a long run.
          </p>
        </fieldset>

        <!-- When you can play -->
        <fieldset
          :disabled="locked"
          class="rounded-xl border border-slate-200 p-4 space-y-3 min-w-0"
          :class="screen === 'classic' ? 'opacity-60' : ''"
        >
          <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">When you can play</h3>
          <p v-if="screen === 'classic'" class="text-[11px] font-semibold text-amber-700">
            Your plan doesn't plan around awake hours yet. The two searches do.
          </p>
          <!-- Two plain choices instead of one checkbox (the user, 4 Oct: "the hours don't seem that clear"). -->
          <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="When you can prestige">
            <label
              class="flex items-start gap-2 rounded-lg border p-3 cursor-pointer"
              :class="!store.scheduleEnabled ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200'"
            >
              <input v-model="store.scheduleEnabled" type="radio" :value="false" class="mt-0.5 text-indigo-600" />
              <span class="text-[11px] text-slate-600 leading-relaxed">
                <span class="block font-bold text-slate-800">Any hour</span>
                The plan prestiges the moment each checkpoint is reached, day or night. Fastest on paper.
              </span>
            </label>
            <label
              class="flex items-start gap-2 rounded-lg border p-3 cursor-pointer"
              :class="store.scheduleEnabled ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200'"
            >
              <input v-model="store.scheduleEnabled" type="radio" :value="true" class="mt-0.5 text-indigo-600" />
              <span class="text-[11px] text-slate-600 leading-relaxed">
                <span class="block font-bold text-slate-800">Let me pick my hours</span>
                Prestiges and egg shifts wait for your next hour. You are still on the virtue farm while you wait, so TE
                keeps collecting.
              </span>
            </label>
          </div>
          <div v-if="store.scheduleEnabled" class="pl-8 space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <label class="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                From
                <select
                  v-model.number="store.availableFrom"
                  class="rounded-lg border-slate-200 text-sm font-bold text-slate-800 disabled:bg-slate-50"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ showHour(h - 1) }}</option>
                </select>
              </label>
              <label class="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                to
                <select
                  v-model.number="store.availableTo"
                  class="rounded-lg border-slate-200 text-sm font-bold text-slate-800 disabled:bg-slate-50"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">
                    {{ showHour(h - 1) }}{{ h - 1 < store.availableFrom ? ' (next day)' : '' }}
                  </option>
                </select>
              </label>
            </div>
            <!-- The day at a glance: filled hours are when the plan may prestige. -->
            <div>
              <div class="flex gap-px" aria-hidden="true">
                <span
                  v-for="h in 24"
                  :key="h - 1"
                  class="h-3 flex-1 rounded-sm"
                  :class="hourAwake(h - 1) ? 'bg-indigo-500' : 'bg-slate-200'"
                  :title="showHour(h - 1) + (hourAwake(h - 1) ? ': can prestige' : ': away')"
                ></span>
              </div>
              <div class="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>{{ showHour(0) }}</span
                ><span>{{ showHour(6) }}</span
                ><span>{{ showHour(12) }}</span
                ><span>{{ showHour(18) }}</span
                ><span>{{ showHour(23) }}</span>
              </div>
              <p class="text-[10px] text-slate-500 mt-1">
                Hours are in the plan's timezone ({{ zone }}). Blue is when the plan may prestige. Days you can play:
              </p>
            </div>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="(label, day) in DAY_LABELS"
                :key="day"
                type="button"
                class="px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                :class="
                  store.availableDays.includes(day)
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-200 text-slate-400 hover:text-slate-600'
                "
                @click="toggleDay(day)"
              >
                {{ label }}
              </button>
            </div>
            <!-- Ticked but describing no restriction at all reads as a constraint and isn't one. -->
            <p v-if="store.scheduleIsEmpty" class="text-[11px] font-semibold text-amber-700">
              Every day, all hours: that's no restriction at all, and it's recorded as no schedule.
            </p>
            <p v-else-if="!store.availableDays.length" class="text-[11px] font-semibold text-amber-700">
              No days picked. Pick at least one, or nothing can be scheduled.
            </p>
            <p v-else class="text-[11px] text-slate-500">{{ scheduleText(store.availability) }}.</p>
            <!-- Picking hours means the shifts wait for them too (the user, 5 Oct: the hours should be obvious), so
                 the old "Hold egg shifts for my hours too" box is gone. Only a run or link saved with it off can
                 still be in that state; say so, with a way back. -->
            <p v-if="!store.deferShifts" class="text-[11px] font-semibold text-amber-700">
              This plan was saved with egg shifts not waiting for your hours.
              <button type="button" class="underline font-bold" @click="store.deferShifts = true">
                Make them wait too
              </button>
            </p>
          </div>
        </fieldset>

        <!-- Time off -->
        <fieldset :disabled="locked" class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0">
          <div id="your-setup-time-off" class="scroll-mt-4"></div>
          <TimeOffEditor />
          <p v-if="screen === 'classic'" class="text-[11px] font-semibold text-amber-700 leading-relaxed">
            Your plan only plans around time off in a plan built from a search (Build this plan on {{ fastestName(store.finalTE) }} or
            {{ NAMES.byDate }}). A chain typed in here goes straight through it for now.
          </p>
          <p v-else class="text-[11px] text-slate-500 leading-relaxed">
            The searches price every route with the time off in it, so the winner is the best plan around it. The Chain
            Explorer keeps runs with time off apart from the rest, since they answer a different question.
          </p>
        </fieldset>

        <!-- This computer -->
        <div
          class="rounded-xl border border-slate-200 p-4 space-y-3 min-w-0"
          :class="screen === 'classic' ? 'opacity-60' : ''"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">This computer</h3>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="p in PROFILES"
                :key="p.id"
                type="button"
                :disabled="store.isRunning"
                class="px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                :class="
                  activeProfile === p.id
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 text-slate-500 hover:text-slate-700'
                "
                :title="p.blurb"
                @click="applyProfile(p.id)"
              >
                {{ p.label }}
              </button>
            </div>
          </div>
          <p v-if="screen === 'classic'" class="text-[11px] font-semibold text-amber-700">
            Not used by Your plan: it builds one plan, no search.
          </p>
          <WorkerSlider />
          <BackgroundSpeed />
          <label class="flex items-start gap-3 cursor-pointer">
            <input v-model="store.keepAwake" type="checkbox" class="mt-0.5 rounded border-slate-300 text-indigo-600" />
            <span class="text-[11px] text-slate-600 leading-relaxed">
              <span class="font-bold text-slate-800">Keep my computer awake while a search runs.</span> If it sleeps,
              every worker freezes until you wake it. It can't stop a laptop sleeping when the lid is closed.
            </span>
          </label>

          <details class="rounded-lg border border-dashed border-slate-200 px-3 py-2" @toggle="onAdvanced">
            <summary class="cursor-pointer text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Advanced: memory · detail kept for
              {{ store.legDetailBudget ? store.legDetailBudget.toLocaleString() : 'every' }} chains
            </summary>
            <div class="mt-3 space-y-3">
              <dl class="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Logical cores</dt>
                  <dd class="font-bold text-slate-700">{{ store.machineThreads }}</dd>
                </div>
                <div>
                  <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reported RAM</dt>
                  <dd class="font-bold text-slate-700">{{ deviceMemoryLabel }}</dd>
                </div>
                <div>
                  <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tab heap limit</dt>
                  <dd class="font-bold text-slate-700">{{ heapLimitMb || 'not reported' }}</dd>
                </div>
                <div>
                  <dt class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Heap in use</dt>
                  <dd class="font-bold text-slate-700">{{ heapUsedMb || 'not reported' }}</dd>
                </div>
              </dl>
              <p class="text-[11px] text-slate-500 leading-relaxed">
                Cores is the only hardware figure a web page gets accurately. Reported RAM is rounded and capped by the
                browser on purpose, which is why the worker count is yours to choose rather than detected.
              </p>
              <label class="block space-y-1">
                <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest"
                  >Keep per-leg detail for</span
                >
                <span class="flex items-center gap-2">
                  <input
                    v-model.number="store.legDetailBudget"
                    type="number"
                    min="0"
                    step="500"
                    class="w-32 rounded-lg border-slate-200 text-sm font-bold text-slate-800"
                  />
                  <span class="text-[11px] font-bold text-slate-500">fastest chains</span>
                </span>
              </label>
              <p class="text-[11px] text-slate-500 leading-relaxed">
                Holding detail for
                <span class="font-bold text-slate-700">{{ store.legsHeld.toLocaleString() }}</span> chains ({{
                  heldMb
                }}). Every chain keeps its total time whatever this says; past this number, the ones that didn't win
                lose the per-leg timings the runners-up table opens.
                <span class="font-bold text-slate-700">0 keeps everything</span>, which on a run of hundreds of
                thousands of chains is how a tab gets killed overnight.
              </p>
            </div>
          </details>
        </div>

        <!-- What artifacts it will use: the same on every screen. -->
        <div class="rounded-xl border border-slate-200 p-4 min-w-0 md:col-span-2">
          <SimulationSetup />
        </div>

        <!-- How the site shows things -->
        <div class="rounded-xl border border-slate-200 p-4 space-y-3 min-w-0 md:col-span-2">
          <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">How the site shows things</h3>
          <DateStyleToggle />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';
import { NAMES, type AutoView, fastestName } from '@/lib/siteNav';
import { showDateTime, showHour, showSchedule as scheduleText } from '@/lib/displayTime';
import { usableTimeOff } from '@/search/timeOff';
import SchedulingInputs from './SchedulingInputs.vue';
import TimeOffEditor from './TimeOffEditor.vue';
import WorkerSlider from './WorkerSlider.vue';
import BackgroundSpeed from './BackgroundSpeed.vue';
import DateStyleToggle from './DateStyleToggle.vue';
import SimulationSetup from './SimulationSetup.vue';

defineProps<{
  screen: AutoView;
  /** The full setup, in the floating panel (SetupDock.vue); without it, the one-line bar. */
  docked?: boolean;
}>();

const store = useChainSearchStore();
// Choosing "Let me pick my hours" holds the egg shifts for those hours as well.
watch(
  () => store.scheduleEnabled,
  on => {
    if (on) store.deferShifts = true;
  }
);
const planner = useAutoPlannerStore();
const initialState = useInitialStateStore();
const ui = useUIStore();

const locked = computed(() => store.busy);
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
/** Whether the plan may prestige in this hour of the day: from-hour inclusive, to-hour exclusive,
 *  wrapping past midnight, and equal ends meaning all day (search/availability.ts). */
function hourAwake(h: number): boolean {
  const from = store.availableFrom;
  const to = store.availableTo;
  if (from === to) return true;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

const startLabel = computed(() => (store.planStartIsNow ? 'now (not set)' : showDateTime(store.planStart, zone.value)));
const awakeLabel = computed(() =>
  store.scheduleEnabled && !store.scheduleIsEmpty ? scheduleText(store.availability) : 'any hour'
);
const timeOffCount = computed(() => usableTimeOff(store.timeOff).length);

const saveAgeLabel = computed(() => {
  const at = initialState.rawBackup?.approxTime;
  if (!at) return 'No save loaded yet.';
  const mins = Math.max(0, Math.round((Date.now() / 1000 - at) / 60));
  const age =
    mins < 1
      ? 'just now'
      : mins < 60
        ? `${mins} min ago`
        : mins < 48 * 60
          ? `${Math.round(mins / 60)} h ago`
          : `${Math.round(mins / 1440)} days ago`;
  return `Save from ${age} (${showDateTime(at, zone.value)}).`;
});

/** Problems with the save, for its card. Not the save-age note: Start time, beside it, already says
 *  exactly that (folded, the setup shows them all, since Start time is hidden then). */
const saveCardIssues = computed(() => store.setupIssues.filter(i => i.kind !== 'save-past-silos'));

/** Soul eggs run to 1e21 and beyond: the same short-scale suffixes the rest of the app uses. */
function formatSoulEggs(n: number): string {
  if (!(n > 0)) return 'none, so the farm cannot buy anything';
  const units = ['', 'K', 'M', 'B', 'T', 'q', 'Q', 's', 'S', 'o', 'N', 'd', 'U'];
  const tier = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
  return `${(n / 10 ** (tier * 3)).toFixed(2)}${units[tier]}`;
}

/** Sunday-first, matching `availableDays`, which stores JS `getDay()` numbers. */
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
function toggleDay(day: number): void {
  // In place (other panels read `availableDays`) and kept sorted, as Chain Search always kept it,
  // so the same days always make the same schedule, and the same run fingerprint.
  const days = store.availableDays;
  const i = days.indexOf(day);
  if (i === -1) days.push(day);
  else days.splice(i, 1);
  days.sort((a, b) => a - b);
}

/**
 * Presets, because the real question is what the computer is FOR right now: the same 20-core box
 * wants a quarter of itself while someone's using it and all of itself overnight. Three named
 * answers beat two numbers nobody knows how to set; the numbers stay editable underneath.
 */
const PROFILES = [
  {
    id: 'background',
    label: 'Background',
    blurb: 'A quarter of your cores and a small cache. For running while you use the computer.',
    workers: () => Math.max(1, Math.floor(store.machineThreads / 4)),
    legDetail: 1000,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Every core but one, so the tab stays responsive. The default.',
    workers: () => Math.max(1, store.machineThreads - 1),
    legDetail: 2000,
  },
  {
    id: 'overnight',
    label: 'Overnight',
    blurb: "Every core, and detail kept for far more chains. For a computer you're done using.",
    workers: () => store.machineThreads,
    legDetail: 20000,
  },
] as const;
type ProfileId = (typeof PROFILES)[number]['id'];
const activeProfile = computed<ProfileId | ''>(
  () => PROFILES.find(p => p.workers() === store.workerBudget && p.legDetail === store.legDetailBudget)?.id ?? ''
);
function applyProfile(id: ProfileId): void {
  const p = PROFILES.find(x => x.id === id);
  if (!p) return;
  store.workerBudget = p.workers();
  store.legDetailBudget = p.legDetail;
}

/**
 * Heap readout, where the browser offers one (Chromium's non-standard `performance.memory`, and
 * quantised: a gauge, not an accounting record). Read only while Advanced is open.
 */
const heap = ref<{ used: number; limit: number } | null>(null);
let heapTimer: ReturnType<typeof setInterval> | null = null;
function readHeap(): void {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  heap.value = m ? { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit } : null;
}
function onAdvanced(e: Event): void {
  const isOpen = (e.target as HTMLDetailsElement).open;
  if (heapTimer) clearInterval(heapTimer);
  heapTimer = null;
  if (isOpen) {
    readHeap();
    heapTimer = setInterval(readHeap, 5000);
  }
}
onUnmounted(() => heapTimer && clearInterval(heapTimer));
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(0)} MB`;
const heldMb = computed(() => mb(store.legDetailBytes));
const heapUsedMb = computed(() => (heap.value ? mb(heap.value.used) : ''));
const heapLimitMb = computed(() => (heap.value ? mb(heap.value.limit) : ''));
/** `navigator.deviceMemory`: rounded to a power of two and capped at a ceiling the browser picks. */
const deviceMemoryLabel = computed(() => {
  const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return gb ? `${gb} GB or more` : 'not reported';
});
</script>
