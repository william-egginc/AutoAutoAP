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
  <section class="max-w-4xl mx-auto rounded-2xl border border-indigo-100 bg-white shadow-sm">
    <!-- Folded: one line, every value visible. -->
    <button
      type="button"
      class="w-full flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-left"
      :aria-expanded="open"
      @click="setOpen(!open)"
    >
      <span class="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Your setup</span>
      <span class="text-[11px] text-slate-500"
        >Plan starts <span class="font-bold text-slate-800">{{ startLabel }}</span></span
      >
      <span class="text-[11px] text-slate-500"
        >Awake <span class="font-bold text-slate-800">{{ awakeLabel }}</span></span
      >
      <span class="text-[11px] text-slate-500"
        >Time off <span class="font-bold text-slate-800">{{ timeOffCount || 'none' }}</span></span
      >
      <span class="text-[11px] text-slate-500"
        ><span class="font-bold text-slate-800">{{ store.workerBudget }} of {{ store.machineThreads }}</span>
        workers</span
      >
      <span class="ml-auto text-[10px] font-black text-indigo-700 uppercase tracking-widest">{{
        open ? 'Done' : 'Edit setup'
      }}</span>
    </button>

    <div v-if="open" class="border-t border-indigo-50 p-4 space-y-4">
      <p class="text-[11px] text-slate-500">
        One setup for all three Auto Planner screens: change it here and Classic, {{ NAMES.fastest }} and
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
            Classic doesn't plan around awake hours yet. The two searches do.
          </p>
          <label class="flex items-start gap-3 cursor-pointer">
            <input
              v-model="store.scheduleEnabled"
              type="checkbox"
              class="mt-0.5 rounded border-slate-300 text-indigo-600 disabled:opacity-40"
            />
            <span class="text-[11px] text-slate-600 leading-relaxed">
              <span class="font-bold text-slate-800">Only count on me during these hours.</span> A prestige that would
              land while you're away waits for your next hour, and the wait counts. Off, the plan assumes you can
              prestige at any hour: faster on paper, rarely real.
            </span>
          </label>
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
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                v-model="store.deferShifts"
                type="checkbox"
                class="mt-0.5 rounded border-slate-300 text-indigo-600 disabled:opacity-40"
              />
              <span class="text-[11px] text-slate-600 leading-relaxed">
                <span class="font-bold text-slate-800">Hold egg shifts for my hours too.</span> Each of the twelve
                shifts in an ascension waits for you as well. It costs time, but it's what most people actually do.
              </span>
            </label>
          </div>
        </fieldset>

        <!-- Time off -->
        <fieldset :disabled="locked" class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0">
          <div id="your-setup-time-off" class="scroll-mt-4"></div>
          <TimeOffEditor />
          <p v-if="screen === 'classic'" class="text-[11px] font-semibold text-amber-700 leading-relaxed">
            Classic only plans around time off in a plan built from a search (Build this plan on {{ NAMES.fastest }} or
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
            Not used by Classic: it builds one plan, no search.
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
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';
import { NAMES, type AutoView } from '@/lib/siteNav';
import { showDateTime, showHour, showSchedule as scheduleText } from '@/lib/displayTime';
import { usableTimeOff } from '@/search/timeOff';
import SchedulingInputs from './SchedulingInputs.vue';
import TimeOffEditor from './TimeOffEditor.vue';
import WorkerSlider from './WorkerSlider.vue';
import BackgroundSpeed from './BackgroundSpeed.vue';
import DateStyleToggle from './DateStyleToggle.vue';

defineProps<{ screen: AutoView }>();

const store = useChainSearchStore();
const planner = useAutoPlannerStore();
const initialState = useInitialStateStore();
const ui = useUIStore();

/** Open or folded, remembered in this browser. */
const OPEN_KEY = 'aap-your-setup-open';
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
const open = ref(readOpen());
function setOpen(v: boolean): void {
  open.value = v;
  try {
    localStorage.setItem(OPEN_KEY, v ? '1' : '0');
  } catch {
    /* private window: it just won't be remembered */
  }
}
/** Asked from a panel (a sweep's "add time off"): open, and scroll to the time off. */
watch(
  () => ui.openSetupRequested,
  () => {
    setOpen(true);
    void nextTick(() =>
      document.getElementById('your-setup-time-off')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  }
);

const locked = computed(() => store.busy);
const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

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
// Folding the setup removes an open Advanced without a toggle event: stop its timer then too.
watch(open, isOpen => {
  if (!isOpen && heapTimer) {
    clearInterval(heapTimer);
    heapTimer = null;
  }
});
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
