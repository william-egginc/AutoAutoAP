<!--
  "Stepping away?": four opt-in helpers for long runs, beside the Find bar of all three searches
  (Smart search, Full sweep, By a date). All off until ticked, remembered per browser. The rules are in
  search/stepAway.ts; the run side is composables/useStepAway.ts; the watcher is watch.html.

  This box also does option 1's job on a fresh load: when the last run here was started with it on and
  the page died mid-run (the black box's unfinished beat), it counts down and carries the run on by
  itself through the panel's own Carry on (`carry-on`).
-->
<template>
  <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2 text-[11px] text-slate-700">
    <div
      v-if="countdown > 0 && !countdownElsewhere"
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
        next time it opens it carries on after a {{ COUNTDOWN_SECONDS }}-second countdown, with fewer workers.
        <span class="block text-slate-500">Doesn't slow the run.</span></span
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
        Keep both tabs open.
        <span class="block text-slate-500"
          >Doesn't slow the run: the watcher is a tiny page that checks in about once a minute.</span
        ></span
      >
    </label>
    <div v-if="options.watch" class="pl-6 space-y-1.5">
      <p v-if="watcherOk" class="font-bold text-emerald-700" role="status">
        ✓ Watcher tab open and watching <span class="font-normal">(checked in {{ agoShort(watcherAge!) }} ago)</span>
      </p>
      <div
        v-else-if="popupBlocked"
        class="rounded-lg border border-amber-300 bg-amber-50 p-2 space-y-1 text-amber-900"
        role="status"
      >
        <p class="font-bold">
          The watcher tab didn't open: {{ help.name || 'your browser' }} may have blocked it as a pop-up.
        </p>
        <p>
          <template v-for="(part, i) in help.popups" :key="i"
            ><template v-if="typeof part === 'string'">{{ part }}</template
            ><template v-else
              ><code class="rounded bg-white px-1 select-all">{{ part.code }}</code
              ><button
                type="button"
                class="mx-1 rounded border border-amber-300 bg-white px-1 text-[10px] font-bold hover:bg-amber-100"
                @click="copy(part.code)"
              >
                {{ copied === part.code ? 'Copied' : 'Copy' }}
              </button></template
            ></template
          >
        </p>
        <p>Then open it with the button below.</p>
      </div>
      <p v-else-if="confirmTimer">Opening the watcher tab...</p>
      <p v-else>The watcher tab isn't open.</p>
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          :href="watcherHref"
          target="_blank"
          rel="noopener"
          class="inline-block rounded-md border border-indigo-300 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900"
          @click="onWatcherLink"
          @auxclick="onWatcherAux"
          >Open the watcher tab</a
        >
        <span v-if="tip" class="text-[10px] text-slate-500">{{ tip }}</span>
      </p>
      <p class="text-slate-500">
        <template v-for="(part, i) in [...help.keepAwake, ...(help.note ? [' ', ...help.note] : [])]" :key="i"
          ><template v-if="typeof part === 'string'">{{ part }}</template
          ><template v-else
            ><code class="rounded bg-white px-1 select-all">{{ part.code }}</code
            ><button
              type="button"
              class="mx-1 rounded border border-slate-300 bg-white px-1 text-[10px] font-bold hover:bg-slate-100"
              @click="copy(part.code)"
            >
              {{ copied === part.code ? 'Copied' : 'Copy' }}
            </button></template
          ></template
        >
      </p>
    </div>
    <label class="flex items-start gap-2">
      <input v-model="options.fewerWorkers" type="checkbox" class="mt-0.5 rounded border-slate-300 text-indigo-600" />
      <span
        ><span class="font-bold">Use fewer workers so the computer has room.</span> Uses about half the cores ({{
          cap
        }}
        of {{ store.machineThreads }}), and drops a few more during the run if it slows right down, or if the memory the
        browser reports for this page gets high. That figure is the page's main memory only: browsers don't report the
        workers' memory, or other programs'.
        <span class="block text-slate-500"
          >Slower: about half the workers, so expect roughly 1.5–2× the time (less than 2× on machines with
          hyperthreading), in exchange for room for other programs.</span
        ></span
      >
    </label>
    <p v-if="options.fewerWorkers && stepAwayNote" class="pl-6 font-semibold text-slate-800">{{ stepAwayNote }}</p>
    <div class="flex items-start gap-2">
      <input
        id="auto-send-best"
        v-model="options.autoSendBest"
        type="checkbox"
        class="mt-0.5 rounded border-slate-300 text-indigo-600"
        data-testid="auto-send-best"
      />
      <span
        ><label for="auto-send-best" class="font-bold">Send my best so far every</label>
        <select
          v-model.number="options.autoSendEveryMin"
          aria-label="How often to send my best so far"
          class="mx-1 rounded border-slate-300 py-0 pl-1 pr-6 text-[11px] font-bold"
          data-testid="auto-send-every"
        >
          <option :value="30">30 min</option>
          <option :value="60">1 hour</option>
        </select>
        <label for="auto-send-best" class="font-bold">while this runs</label>
        <span class="block text-slate-500"
          >Shares it on the leaderboard as an in-progress row, only when it has changed. The finished run replaces
          it.</span
        >
        <span v-if="options.autoSendBest && !autoHere" class="block text-slate-500"
          >It asks for your OK when a run starts, unless you start it with Find and submit.</span
        >
        <span v-if="autoLine" class="block font-semibold text-slate-800" role="status" data-testid="auto-send-line">{{
          autoLine
        }}</span></span
      >
    </div>
  </div>
</template>

<script lang="ts">
import type { RunKind } from '@/search/stepAway';
/** One automatic carry-on decision per page load and kind, however often the panel remounts. */
const decided = new Set<RunKind>();
/** A run whose last heartbeat came this soon after it started crashed before its first save point. */
const EARLY_CRASH_MS = 90_000;
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
  WATCHER_CONFIRM_MS,
  WATCHER_SEEN_KEY,
} from '@/search/stepAway';
import { backgroundOpenTip, browserHelp, detectBrowser } from '@/lib/browserHelp';
import {
  openWatcher,
  pingWatcher,
  stepAwayBeginCarryOn,
  stepAwayGiveUp,
  stepAwayNote,
  stepAwayOptions,
  watcherSeenAt,
  watcherUrl,
} from '@/composables/useStepAway';

const props = defineProps<{
  kind: RunKind;
  playerId: string;
  /** The panel has an unfinished run it can carry on right now (its save kept, nothing blocking). */
  canCarryOn: boolean;
  /** The panel shows the countdown (and its Cancel) in its own single offer to carry on, so this box
   *  doesn't draw a second one. It gets the seconds left through `countdown`. */
  countdownElsewhere?: boolean;
}>();
const emit = defineEmits<{ 'carry-on': []; countdown: [seconds: number] }>();

const store = useChainSearchStore();
const options = stepAwayOptions;
const cap = computed(() => fewerWorkersCap(store.machineThreads));

// ------------------------------------------------------------------ send my best so far

/** A run of this screen's kind is going and may send its best so far. */
const autoHere = computed(() => store.bestSoFar?.kind === (props.kind === 'deadline' ? 'deadline' : 'fastest'));
const autoLine = computed(() => (autoHere.value ? store.bestSoFarAutoLine : ''));

// ------------------------------------------------------------------ the watcher tab

const popupBlocked = ref(false);
const watcherAge = ref<number | null>(null);
/** Waiting for a watcher just opened to check in (WATCHER_CONFIRM_MS). */
const confirmTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const watcherOk = computed(() => watcherAge.value !== null && watcherAge.value < 3 * 60_000);
const browser = detectBrowser();
const help = browserHelp(browser.browser, typeof location === 'undefined' ? '' : location.host);
const tip = backgroundOpenTip(browser.os);
const watcherHref = watcherUrl();
const copied = ref('');
function copy(text: string): void {
  void navigator.clipboard?.writeText(text).then(
    () => {
      copied.value = text;
      setTimeout(() => copied.value === text && (copied.value = ''), 1500);
    },
    () => undefined
  );
}
function readWatcher(): void {
  const at = watcherSeenAt();
  watcherAge.value = at ? Math.max(0, Date.now() - at) : null;
}
/** A watcher tab was just asked for: it checks in as it loads (one already open answers the ping),
 *  or the browser blocked it. Opened with `noopener` (its own process), so there's no window handle
 *  to tell a block by. */
function awaitCheckIn(): void {
  const clickedAt = Date.now();
  popupBlocked.value = false;
  setTimeout(readWatcher, 1500);
  if (confirmTimer.value) clearTimeout(confirmTimer.value);
  confirmTimer.value = setTimeout(() => {
    confirmTimer.value = null;
    readWatcher();
    popupBlocked.value = watcherSeenAt() < clickedAt;
  }, WATCHER_CONFIRM_MS);
}
function openWatcherTab(): void {
  openWatcher();
  awaitCheckIn();
}
/** The link opens the tab itself (so ⌘/Ctrl-click or middle-click can put it in the background). */
function onWatcherLink(): void {
  pingWatcher();
  awaitCheckIn();
}
function onWatcherAux(e: MouseEvent): void {
  if (e.button === 1) onWatcherLink();
}
function onStorage(e: StorageEvent): void {
  if (e.key === WATCHER_SEEN_KEY) {
    readWatcher();
    if (watcherOk.value) popupBlocked.value = false;
  }
}
if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
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
watch(countdown, n => emit('countdown', n));
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
    // Nothing to carry on from: a run first saves after its first batch, about a minute in.
    const early = !!mark && mark.beatAt - mark.startedAt < EARLY_CRASH_MS;
    autoNote.value = early
      ? "The last run can't carry on by itself: it crashed before its first save point, about a minute in. Start it again."
      : "The last run can't carry on by itself, so it's waiting for you. See the unfinished run above.";
  } else if (v.why === 'guard') {
    stepAwayGiveUp('stuck');
    autoNote.value = `It stopped ${MAX_REOPENS_PER_HOUR} times in the last hour, so it won't carry on by itself again for now. Carry on by hand when you're ready.`;
  }
}

/** Stop the countdown without a word: the player started something here by hand. */
function quietCancel(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  countdown.value = 0;
}

function tick(): void {
  // Find pressed (or anything else started) during the countdown: that run is the player's choice,
  // and go() would otherwise find its run lock and call it "another tab".
  if (store.busy) {
    quietCancel();
    return;
  }
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
  // Started here by hand at the last moment: the player's own run, nothing to say.
  if (store.busy) return;
  if (await runLockHeld()) {
    if (store.busy) return;
    autoNote.value = "The run is still going in another tab, so this tab won't start it again. You can close this tab.";
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
      autoNote.value = "It couldn't carry on by itself. Use Carry on from where it stopped when you're ready.";
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

defineExpose({ cancel });

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
  if (confirmTimer.value) clearTimeout(confirmTimer.value);
  window.removeEventListener('storage', onStorage);
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
