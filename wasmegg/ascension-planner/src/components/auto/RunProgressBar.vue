<!--
  The search that's running, on every tab (the unified layout). A search takes minutes to hours and
  the site now has tabs to look at meanwhile -- the leaderboard, the Explorer's charts, Classic -- so
  its progress and its Stop go with the player instead of staying on the screen it started from.

  Reads the store's one progress reading (chainSearch `runProgress`), which every kind of search
  feeds: Smart search, the Full sweep, Highest TE by a date and the start-time sweep. It shows on the run's own
  screen too, where the button says "Jump to it" and scrolls to the panel's progress; elsewhere "Show it"
  goes back to the run's screen.

  Send best so far (stores/chainSearch.ts `sendBestSoFar`) sits beside Stop for a run its screen lets
  send one. With the player's yes already given (Find and submit, or the screen's box) it sends from
  here; without it, it goes to the run's screen, where the box asks first and ticking it sends. Every
  outcome -- sent, too soon, refused, an error, or "tick the box" -- is said under the bar.

  Not a live region itself (its figures change every second): RunAnnouncer.vue says the progress to a screen
  reader at most every 10 s, and when the run ends.
-->
<template>
  <div
    v-if="p"
    data-run-bar
    class="sticky z-40 max-w-full overflow-hidden rounded-2xl bg-slate-900 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] px-4 py-3 space-y-2"
    style="top: calc(env(safe-area-inset-top, 0px) + 0.5rem)"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p class="flex-[1_1_18rem] min-w-0 text-body font-bold break-words">
        {{ kindLabel }} · <template v-if="p.chain">{{ queueCountLine({ chain: p.chain, done: p.done, total: p.total, queueTotal: p.queueTotal ?? null }) }}</template
        ><template v-else>{{ p.done.toLocaleString()
        }}<template v-if="p.total"> of {{ approx }}{{ p.total.toLocaleString() }}</template> {{ p.unit }}</template
        ><template v-if="leftLabel"> · about {{ leftLabel }} left<template v-if="p.measuring"> (measuring…)</template></template
        ><template v-else-if="p.measuring"> · measuring time left…</template
        ><template v-if="p.best">
          · best so far {{ p.kind === 'by-date' ? 'gets to' : 'reaches' }} {{ p.best.te }} TE on
          {{ show(p.best.at) }}</template
        >
      </p>
      <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
        <button
          type="button"
          class="flex-1 sm:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg bg-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/20"
          data-testid="run-bar-show"
          @click="emit('show')"
        >
          {{ props.here ? 'Jump to it' : 'Show it' }}
        </button>
        <span
          v-if="store.submitsWhenDone"
          class="flex-1 sm:flex-none whitespace-nowrap text-center px-3 py-1.5 rounded-lg bg-indigo-500/30 text-[10px] font-black uppercase tracking-widest"
          title="It shares its result on the Leaderboard when it finishes (started with the send ticked)"
        >
          Submits when done
        </span>
        <button
          v-if="bestSoFarHere"
          type="button"
          :disabled="!p.best || store.bestSoFarSending || store.bestSoFarWait > 0"
          class="flex-1 sm:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-400 disabled:opacity-50"
          :title="
            store.bestSoFarWait > 0
              ? `You can send again in ${store.bestSoFarWait} min`
              : 'Send best so far, with the CSV so far and diagnostics if ticked (replaced when the run finishes)'
          "
          data-testid="run-bar-best-so-far"
          @click="sendBestSoFar"
        >
          <SendingText v-if="store.bestSoFarSending" /><template v-else>Send best so far</template>
        </button>
        <button
          type="button"
          :disabled="stopping"
          class="flex-1 sm:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 disabled:opacity-60"
          @click="stop"
        >
          <SendingText v-if="stopping" text="Stopping" /><template v-else>Stop &amp; keep best</template>
        </button>
      </div>
    </div>
    <div class="h-1.5 rounded-full bg-white/15 overflow-hidden">
      <div
        v-if="pct !== null"
        class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400 transition-all duration-500"
        :style="{ width: `${pct}%` }"
      ></div>
      <div v-else class="h-full w-1/3 rounded-full bg-indigo-400/70 animate-pulse"></div>
    </div>
    <p v-if="stopping" class="text-small text-white/70" data-testid="stopping-note">{{ STOPPING_NOTE }}</p>
    <p v-if="p.stage" class="text-small text-white/60 truncate">{{ p.stage }}</p>
    <!-- What the screen's own progress block used to add (lib/runDetails.ts; the in-page header, bar and time
         line went on 16 Oct 2026, so this bar is the one progress display). Folded: the line above is enough
         most of the time. -->
    <details v-if="details" class="text-small text-white/60" data-testid="run-bar-details">
      <summary class="cursor-pointer select-none font-bold text-white/70 hover:text-white">Details</summary>
      <p class="mt-1 break-words leading-snug">{{ details }}</p>
    </details>
    <!-- On another Auto Planner screen: this one is greyed out and a second search can't start. Said here, under the
         progress line, so it floats with the bar instead of an amber box pushing the page down (the user, 15 Oct). -->
    <p
      v-if="props.elsewhere"
      class="rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-body text-amber-100"
      data-testid="run-bar-elsewhere"
    >
      <span class="font-black">{{ props.elsewhere.running }} is running.</span> Stop it (Stop &amp; keep best, here), or
      wait until it's done, to use {{ props.elsewhere.here }}.
    </p>
    <p
      v-if="bestSoFarHere && (store.bestSoFarStatus || store.bestSoFarWait > 0)"
      class="text-small font-semibold"
      :class="
        !store.bestSoFarStatus || store.bestSoFarStatus.pending
          ? 'text-amber-200'
          : store.bestSoFarStatus.ok
            ? 'text-emerald-300'
            : 'text-red-300'
      "
      data-testid="run-bar-best-so-far-status"
    >
      {{ store.bestSoFarStatus?.text ?? '' }}
      <template v-if="store.bestSoFarWait > 0 && !/send again in/.test(store.bestSoFarStatus?.text ?? '')"
        >You can send again in {{ store.bestSoFarWait }} min.</template
      >
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import { NAMES, fastestName } from '@/lib/siteNav';
import { showDateTime } from '@/lib/displayTime';
import { formatTimeLeft } from '@/search/sweepEstimate';
import SendingText from './SendingText.vue';
import { STOPPING_NOTE } from '@/search/stopNote';
import { queueCountLine } from '@/lib/queueCount';
import { runDetailLine } from '@/lib/runDetails';
import { durationLabel } from '@/composables/useRunClock';
import { formatHours } from '@/search/exhaustive';
import { estimateNote, roundedRoutes } from '@/search/deadlineEstimate';

const props = defineProps<{
  /** The bar sits on the run's own screen. */
  here?: boolean;
  /** Another Auto Planner screen than the run's is open (greyed out): which search is running and which screen this is. */
  elsewhere?: { running: string; here: string } | null;
}>();
const emit = defineEmits<{ show: [] }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const p = computed(() => store.runProgress);

const ui = useUIStore();

const kindLabel = computed(() => {
  // A sweep started from Science is named as it was there (SweepRunner.vue), not as a Full sweep.
  const science = ui.scienceRun;
  if (science && science.phase !== 'done' && p.value?.kind === 'full')
    return `${NAMES.science} · ${science.request.label}`;
  switch (p.value?.kind) {
    case 'smart':
      return `${fastestName(store.finalTE)} · ${NAMES.smart}`;
    case 'full':
      return `${fastestName(store.finalTE)} · ${NAMES.full}`;
    case 'by-date':
      return NAMES.byDate;
    default:
      return NAMES.start;
  }
});

/** Chain searches estimate their total; a start-time sweep knows its exactly. */
const approx = computed(() => (p.value?.kind === 'start-times' ? '' : '~'));

/** Held under 100 while running: an estimate reached is not a run finished. A kind that works out its
 *  own fill (By a date, never full while real time is left) says so in `percent`. */
const pct = computed(() => {
  const r = p.value;
  if (!r?.total) return null;
  if (typeof r.percent === 'number') return r.percent;
  return Math.min(99, Math.round((100 * r.done) / r.total));
});

/** A clock for the kinds whose time left comes from their pace so far. */
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
watch(
  () => !!p.value,
  running => {
    if (ticker) clearInterval(ticker);
    ticker = running ? setInterval(() => (now.value = Date.now()), 1000) : null;
  },
  { immediate: true }
);
onUnmounted(() => ticker && clearInterval(ticker));

const leftLabel = computed(() => {
  const r = p.value;
  if (!r) return '';
  let secs = r.secondsLeft;
  // A run that is still measuring has no pace worth extrapolating yet: a Smart search's first chains
  // carry every worker's shared early legs, and a carried-on run's count starts at the chains it
  // replayed for free ("about 2 min left" on hours of Full sweep). "measuring time left" instead.
  if (secs == null && r.total && r.done >= 5 && r.startedAt && !r.measuring) {
    secs = Math.max(0, r.total - r.done) * ((now.value - r.startedAt) / 1000 / r.done);
  }
  return secs ? formatTimeLeft(secs) : '';
});

/** The Details line: the rest of what the screen's progress block said (lib/runDetails.ts). */
const details = computed(() => {
  const r = p.value;
  if (!r) return '';
  if (r.kind !== 'by-date')
    return runDetailLine({
      kind: r.kind,
      detail: store.detail,
      replayed: store.chainsReplayed,
      secondsPerRoute: store.secondsPerChain,
    });
  const t = store.deadlineTimeLeft;
  const guess = t?.firstGuess ? formatHours(t.firstGuess / 3600) : '';
  const est = store.deadlineEstimateNow;
  return runDetailLine({
    kind: 'by-date',
    elapsed: r.startedAt ? durationLabel((now.value - r.startedAt) / 1000) : '',
    firstGuess:
      guess && !t?.measuring && t?.firstGuessWorkers && t.firstGuessWorkers !== t.workersNow
        ? `${guess} for ${t.firstGuessWorkers} workers, ${t.workersNow} now`
        : t?.measuring
          ? ''
          : guess,
    done: r.done,
    estimated: store.deadlineRoutesTotal ? roundedRoutes(store.deadlineRoutesTotal) : null,
    estimateNote: est?.learned ? estimateNote(est) : '',
    legs: store.deadlineLegSims,
  });
});

const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
function show(unixSeconds: number): string {
  return showDateTime(unixSeconds, zone.value);
}

/** Stop pressed here, for the kinds whose store has no "stopping" flag; forgotten with the run. */
const stopClicked = ref(false);
watch(
  () => (p.value ? `${p.value.kind}:${p.value.startedAt}` : ''),
  () => (stopClicked.value = false)
);
const stopping = computed(() => !!p.value?.stopping || stopClicked.value);

/** The run going is one its screen lets Send best so far (a chain search or a date search). */
const bestSoFarHere = computed(() => {
  const run = store.bestSoFar;
  const kind = p.value?.kind;
  if (!run || !kind || kind === 'start-times') return false;
  return (kind === 'by-date') === (run.kind === 'deadline');
});
/** With consent, send now; without, ask on the run's own screen, where the consent box is: ticking
 *  it there sends, and this bar says so meanwhile (the store's pending status). */
function sendBestSoFar(): void {
  if (store.bestSoFar?.consent) {
    void store.sendBestSoFar();
    return;
  }
  store.askBestSoFar(true);
  emit('show');
}
function stop(): void {
  stopClicked.value = true;
  store.stopRun();
}
</script>
