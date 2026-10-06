<!--
  "Stepping away?": three opt-in helpers for long runs, beside the Find bar of all three searches
  (Smart search, Full sweep, By a date). All off until ticked, remembered per browser. The rules are in
  search/stepAway.ts; the run side is composables/useStepAway.ts; the watcher is watch.html.

  This box also does option 1's job on a fresh load: when the last run here was started with it on and
  the page died mid-run (the black box's unfinished beat), it counts down and carries the run on by
  itself through the panel's own Carry on (`carry-on`).
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2 text-[11px] text-slate-700">
    <div
      v-if="countdown > 0"
      class="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900"
      role="status"
    >
      <span class="font-bold"
        >The last run stopped without finishing. Carrying on by itself in {{ countdown }} s, with fewer workers.</span
      >
      <button
        type="button"
        class="px-3 py-1 rounded-md border border-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-white"
        @click="cancel"
      >
        Cancel
      </button>
    </div>
    <p v-if="autoNote" class="font-semibold text-amber-800">{{ autoNote }}</p>

    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Stepping away?</h3>
    <label class="flex items-start gap-2">
      <input v-model="options.autoCarryOn" type="checkbox" class="mt-0.5 rounded border-slate-300 text-indigo-600" />
      <span
        ><span class="font-bold">Carry on by itself after a crash.</span> If the browser closes this page mid-run, the
        next time it opens it carries on after a {{ COUNTDOWN_SECONDS }}-second countdown, with fewer workers.</span
      >
    </label>
    <label class="flex items-start gap-2">
      <input
        :checked="options.watch"
        type="checkbox"
        class="mt-0.5 rounded border-slate-300 text-indigo-600"
        @change="onWatch(($event.target as HTMLInputElement).checked)"
      />
      <span
        ><span class="font-bold">Watch this run from a second tab and reopen it if it crashes.</span> Opens a small tab
        that reopens this page if the run goes quiet for 2 minutes (at most {{ MAX_REOPENS_PER_HOUR }} times an hour).
        Keep both tabs open.</span
      >
    </label>
    <p v-if="options.watch" class="pl-6 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span v-if="popupBlocked" class="font-semibold text-rose-700"
        >Your browser blocked the new tab. Allow pop-ups for this site, then open it here.</span
      >
      <span v-else-if="watcherAge !== null && watcherAge < 3 * 60_000"
        >The watcher tab checked in {{ agoShort(watcherAge) }} ago.</span
      >
      <span v-else>The watcher tab isn't open.</span>
      <button
        type="button"
        class="text-[10px] font-black uppercase tracking-widest text-indigo-700 hover:text-indigo-900"
        @click="openWatcherTab"
      >
        Open the watcher tab
      </button>
    </p>
    <label class="flex items-start gap-2">
      <input v-model="options.fewerWorkers" type="checkbox" class="mt-0.5 rounded border-slate-300 text-indigo-600" />
      <span
        ><span class="font-bold">Use fewer workers so the computer has room.</span> Uses about half the cores ({{
          cap
        }}
        of {{ store.machineThreads }}), and drops a few more during the run if this page's own memory gets high or it
        slows right down. It can't see how much memory other programs are using.</span
      >
    </label>
    <p v-if="options.fewerWorkers && stepAwayNote" class="pl-6 font-semibold text-slate-800">{{ stepAwayNote }}</p>
  </div>
</template>

<script lang="ts">
import type { RunKind } from '@/search/stepAway';
/** One automatic carry-on decision per page load and kind, however often the panel remounts. */
const decided = new Set<RunKind>();
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { hashID } from '@/lib/storage/db';
import {
  agoShort,
  autoCarryOnVerdict,
  COUNTDOWN_SECONDS,
  fewerWorkersCap,
  MAX_REOPENS_PER_HOUR,
  readRunMark,
} from '@/search/stepAway';
import {
  openWatcher,
  stepAwayBeginCarryOn,
  stepAwayGiveUp,
  stepAwayNote,
  stepAwayOptions,
  watcherSeenAt,
} from '@/composables/useStepAway';

const props = defineProps<{
  kind: RunKind;
  playerId: string;
  /** The panel has an unfinished run it can carry on right now (its save kept, nothing blocking). */
  canCarryOn: boolean;
}>();
const emit = defineEmits<{ 'carry-on': [] }>();

const store = useChainSearchStore();
const options = stepAwayOptions;
const cap = computed(() => fewerWorkersCap(store.machineThreads));

// ------------------------------------------------------------------ the watcher tab

const popupBlocked = ref(false);
const watcherAge = ref<number | null>(null);
function readWatcher(): void {
  const at = watcherSeenAt();
  watcherAge.value = at ? Math.max(0, Date.now() - at) : null;
}
function openWatcherTab(): void {
  popupBlocked.value = !openWatcher();
  setTimeout(readWatcher, 1500);
}
function onWatch(on: boolean): void {
  options.value.watch = on;
  // Ticking is a click, so the browser lets the page open a tab now (and only now).
  if (on) openWatcherTab();
  else popupBlocked.value = false;
}
const watcherTimer = setInterval(readWatcher, 15_000);
readWatcher();

// ------------------------------------------------------------------ carry on by itself

const countdown = ref(0);
const autoNote = ref('');
let account = '';
let lockHeld = false;
let goAt = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let giveUpTimer: ReturnType<typeof setTimeout> | null = null;
let stuckTimer: ReturnType<typeof setTimeout> | null = null;
let stopWatch: (() => void) | null = null;

async function runLockHeld(): Promise<boolean> {
  try {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    const state = await locks?.query();
    return !!state?.held?.some(l => l.name === 'ascension-planner:chain-search');
  } catch {
    return false;
  }
}

function settle(): void {
  decided.add(props.kind);
  stopWatch?.();
  stopWatch = null;
  if (giveUpTimer) clearTimeout(giveUpTimer);
  giveUpTimer = null;
}

function evaluate(final = false): void {
  if (decided.has(props.kind) || countdown.value > 0) return;
  // Something is loading or running: wait for it.
  if (store.busy && !final) return;
  const mark = readRunMark();
  if (lockHeld && mark?.status === 'running' && mark.kind === props.kind) {
    settle();
    autoNote.value = "The run is still going in another tab, so this tab won't start it again. You can close this tab.";
    return;
  }
  const v = autoCarryOnVerdict({
    mark,
    kind: props.kind,
    account,
    now: Date.now(),
    crash: store.lastCrash?.last ?? null,
    lockHeld,
    canCarryOn: props.canCarryOn && !store.busy,
  });
  if (v.go) {
    settle();
    goAt = Date.now() + COUNTDOWN_SECONDS * 1000;
    countdown.value = COUNTDOWN_SECONDS;
    tickTimer = setInterval(tick, 500);
    return;
  }
  // Its unfinished run may still be loading; only the last look gives up on it.
  if ((v.why === 'cannot' || v.why === 'no-crash') && !final) return;
  settle();
  if (v.why === 'cannot') {
    stepAwayGiveUp('stuck');
    autoNote.value = "The last run can't carry on by itself, so it's waiting for you. See the notice above.";
  } else if (v.why === 'guard') {
    stepAwayGiveUp('stuck');
    autoNote.value = `It stopped ${MAX_REOPENS_PER_HOUR} times in the last hour, so it won't carry on by itself again for now. Carry on by hand when you're ready.`;
  }
}

function tick(): void {
  const left = Math.ceil((goAt - Date.now()) / 1000);
  if (left > 0) {
    countdown.value = left;
    return;
  }
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  countdown.value = 0;
  void go();
}

async function go(): Promise<void> {
  if (await runLockHeld()) {
    autoNote.value = "The run is still going in another tab, so this tab won't start it again. You can close this tab.";
    return;
  }
  if (store.busy) {
    autoNote.value = 'Something else started here, so the last run is waiting for you to carry it on.';
    return;
  }
  const startedBefore = Date.now();
  const n = stepAwayBeginCarryOn();
  autoNote.value = n ? `Carried on by itself with ${n} worker${n === 1 ? '' : 's'}.` : 'Carried on by itself.';
  emit('carry-on');
  // A carry-on that never got going (its save would not load, a setting refused): say so, and stand
  // the watcher down rather than have it reopen a page that cannot help.
  stuckTimer = setTimeout(() => {
    const m = readRunMark();
    if (!store.busy && (!m || m.startedAt < startedBefore)) {
      stepAwayGiveUp('stuck');
      autoNote.value = "It couldn't carry on by itself. Use the Carry on button when you're ready.";
    }
  }, 120_000);
}

function cancel(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  countdown.value = 0;
  stepAwayGiveUp('stopped');
  autoNote.value = "Cancelled. It won't carry on by itself; carry on by hand whenever you like.";
}

onMounted(async () => {
  if (decided.has(props.kind)) return;
  const mark = readRunMark();
  // The common case, decided without hashing anything: the last run here wasn't set to carry on.
  if (!mark || !mark.autoCarryOn || mark.status !== 'running' || mark.kind !== props.kind) {
    decided.add(props.kind);
    return;
  }
  try {
    account = props.playerId ? await hashID(props.playerId) : '';
  } catch {
    account = '';
  }
  lockHeld = await runLockHeld();
  stopWatch = watch(
    () => [store.lastCrash, props.canCarryOn, store.busy],
    () => evaluate(),
    { immediate: true }
  );
  // The panel loads its unfinished run a moment after it appears; give it that long.
  giveUpTimer = setTimeout(() => evaluate(true), 20_000);
});

onUnmounted(() => {
  clearInterval(watcherTimer);
  stopWatch?.();
  if (giveUpTimer) clearTimeout(giveUpTimer);
  if (stuckTimer) clearTimeout(stuckTimer);
  if (tickTimer) {
    // Left mid-countdown (another screen): decide again if the panel comes back.
    clearInterval(tickTimer);
    countdown.value = 0;
    decided.delete(props.kind);
  }
});
</script>
