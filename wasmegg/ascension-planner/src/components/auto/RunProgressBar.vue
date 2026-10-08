<!--
  The search that's running, on every tab (the unified layout). A search takes minutes to hours and
  the site now has tabs to look at meanwhile -- the leaderboard, the Explorer's charts, Classic -- so
  its progress and its Stop go with the player instead of staying on the screen it started from.

  Reads the store's one progress reading (chainSearch `runProgress`), which every kind of search
  feeds: Smart search, the Full sweep, Highest TE by a date and the start-time sweep. It shows on the run's own
  screen too, where the button says "Jump to it" and scrolls to the panel's progress; elsewhere "Show it"
  goes back to the run's screen.
-->
<template>
  <div
    v-if="p"
    class="sticky z-40 rounded-2xl bg-slate-900 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] px-4 py-3 space-y-2"
    style="top: calc(env(safe-area-inset-top, 0px) + 0.5rem)"
    role="status"
    aria-live="polite"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p class="flex-1 min-w-[14rem] text-[12px] font-bold leading-snug">
        {{ kindLabel }} · {{ p.done.toLocaleString()
        }}<template v-if="p.total"> of {{ approx }}{{ p.total.toLocaleString() }}</template> {{ p.unit
        }}<template v-if="leftLabel"> · about {{ leftLabel }} left<template v-if="p.measuring"> (measuring…)</template></template
        ><template v-if="p.best">
          · best so far {{ p.kind === 'by-date' ? 'gets to' : 'reaches' }} {{ p.best.te }} on
          {{ show(p.best.at) }}</template
        >
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/20"
          data-testid="run-bar-show"
          @click="emit('show')"
        >
          {{ props.here ? 'Jump to it' : 'Show it' }}
        </button>
        <span
          v-if="store.submitsWhenDone"
          class="px-3 py-1.5 rounded-lg bg-indigo-500/30 text-[10px] font-black uppercase tracking-widest"
          title="It shares its result on the leaderboard when it finishes (Find and submit)"
        >
          Submits when done
        </span>
        <button
          type="button"
          :disabled="stopping"
          class="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 disabled:opacity-60"
          @click="stop"
        >
          {{ stopping ? 'Stopping...' : 'Stop & keep best' }}
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
    <p v-if="p.stage" class="text-[10px] text-white/60 truncate">{{ p.stage }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import { NAMES } from '@/lib/siteNav';
import { showDateTime } from '@/lib/displayTime';

const props = defineProps<{ /** The bar sits on the run's own screen. */ here?: boolean }>();
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
      return `${NAMES.fastest} · ${NAMES.smart}`;
    case 'full':
      return `${NAMES.fastest} · ${NAMES.full}`;
    case 'by-date':
      return NAMES.byDate;
    default:
      return 'When should I start?';
  }
});

/** Chain searches estimate their total; a start-time sweep knows its exactly. */
const approx = computed(() => (p.value?.kind === 'start-times' ? '' : '~'));

/** Held under 100 while running: an estimate reached is not a run finished. */
const pct = computed(() => {
  const r = p.value;
  if (!r?.total) return null;
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
  if (secs == null && r.total && r.done >= 5 && r.startedAt) {
    secs = Math.max(0, r.total - r.done) * ((now.value - r.startedAt) / 1000 / r.done);
  }
  if (!secs || secs <= 0) return '';
  if (secs < 90) return `${Math.round(secs)} s`;
  if (secs < 5400) return `${Math.round(secs / 60)} min`;
  return `${(secs / 3600).toFixed(1)} h`;
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
function stop(): void {
  stopClicked.value = true;
  store.stopRun();
}
</script>
