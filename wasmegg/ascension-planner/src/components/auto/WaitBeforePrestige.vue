<template>
  <!-- "Try waiting before each prestige" (search/delays.ts; aaap-tools/partial-te-2026-10.md): on request
       only, since it prices the route a few hundred times with the full simulator. -->
  <div class="mt-2 text-[11px] text-slate-700" data-testid="wait-before-prestige">
    <button
      v-if="status !== 'running'"
      type="button"
      class="px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 disabled:opacity-60 disabled:cursor-not-allowed"
      :disabled="disabled"
      :title="`Prices this route with a wait of 1 to 24 hours before each prestige: about ${legs} ascensions on the full simulator`"
      data-testid="wait-try"
      @click="start"
    >
      {{ status === 'done' ? 'Try waiting again' : 'Try waiting before each prestige' }}
    </button>
    <p v-if="status === 'idle'" class="mt-1 text-[10px] text-slate-500">
      Keeping the old farm laying for a few hours before you prestige can sometimes finish sooner. This prices
      {{ chain.join(' ') }} with each wait from 1 to 24 hours (about {{ legs }} ascensions on the full simulator, several
      minutes or more).
    </p>
    <p v-if="status === 'running'" class="flex items-center gap-2 text-emerald-800">
      <span class="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      {{ stopAsked ? 'Stopping after the routes being priced now…' : `Trying waits before each prestige… ${done} of at most ${most} routes priced.` }}
      <button v-if="!stopAsked" type="button" class="underline text-slate-500" data-testid="wait-stop" @click="stopAsked = true">
        Stop
      </button>
    </p>
    <p v-if="status === 'error'" class="mt-1 text-slate-500">Couldn’t price the waits this time.</p>
    <div v-if="lines" class="mt-1 space-y-0.5" data-testid="wait-result">
      <p v-if="report && report.baseSeconds !== null" class="text-slate-500">
        Prestiging at once{{ deadline ? ', with ' + spareText(report.baseSeconds) + ' to spare' : '' }}, as Check exactly prices it.
      </p>
      <template v-for="s in lines.singles" :key="s.stop">
        <p :class="s.wait ? 'font-bold text-emerald-800' : 'text-slate-600'">{{ s.text }}</p>
        <p v-if="s.warn" class="pl-3 text-amber-700">{{ s.warn }}</p>
      </template>
      <p v-if="lines.together" class="pt-1 font-bold text-emerald-900" data-testid="wait-together">{{ lines.together }}</p>
      <p v-for="w in lines.togetherWarns" :key="w" class="pl-3 text-amber-700">{{ w }}</p>
      <p v-if="report?.stopped" class="text-slate-500">Stopped early: this is what was priced so far.</p>
      <p class="pt-1 text-[10px] text-slate-400">
        While you wait, the farm keeps laying the egg it ended on, and those eggs carry into your next ascension. Stops
        stay whole TE: prestiging before one always costs more than it saves. A wait an hour or two off can lose far more
        than it gains, so prestige at the time shown.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { showDateTime } from '@/lib/displayTime';
import { createChainSearchPool, type ChainSearchPool } from '@/search/pool';
import { searchWaits, waitLines, waitSearchLegs, hoursText, type WaitReport, type Waits } from '@/search/delays';
import { useChainSearchStore } from '@/stores/chainSearch';

const props = defineProps<{
  /** The route, final target included. */
  chain: number[];
  /** The player's zone, for the times shown. */
  zone: string;
  /** By a date: the date, for the spare. */
  deadline?: number | null;
  /** True while Check exactly or a search has the cores. */
  disabled?: boolean;
}>();

const store = useChainSearchStore();
const status = ref<'idle' | 'running' | 'done' | 'error'>('idle');
const done = ref(0);
const most = ref(0);
const report = ref<WaitReport | null>(null);
let pool: ChainSearchPool | null = null;
/** Stop pressed: the search ends after the batch being priced, keeping what it has. */
const stopAsked = ref(false);
/** Bumped by every start and kill: a run that finds it moved on is stale and ends quietly. */
let runs = 0;
let planStart = 0;

const legs = computed(() => waitSearchLegs(props.chain.length));
const lines = computed(() =>
  report.value ? waitLines(report.value, t => showDateTime(t, props.zone)) : null
);
function spareText(seconds: number): string {
  const spare = (props.deadline ?? 0) - (planStart + seconds);
  return spare >= 0 ? hoursText(spare) : `${hoursText(-spare)} short`;
}

async function start(): Promise<void> {
  kill();
  const id = ++runs;
  stopAsked.value = false;
  report.value = null;
  done.value = 0;
  status.value = 'running';
  const chain = [...props.chain];
  let p: ChainSearchPool | null = null;
  try {
    const inputs = store.collectInputs();
    planStart = inputs.planStart;
    p = await createChainSearchPool(inputs, { size: Math.max(1, store.workerBudget) });
    if (id !== runs) return;
    pool = p;
    const pp = p;
    if (!pp.evaluateDelays) throw new Error('this pool cannot price waits');
    const got = await searchWaits(
      chain,
      // On the hour, as Check exactly prices the route and the times it shows.
      (sets: Waits[]) => pp.evaluateDelays!(chain, sets.map(w => w.map(h => h * 3600)), { handoff: 'hour' }),
      {
        onProgress: (d, m) => {
          done.value = d;
          most.value = m;
        },
        shouldStop: () => stopAsked.value,
      }
    );
    if (id !== runs) return;
    report.value = got;
    status.value = 'done';
  } catch {
    // A pool killed under it (another route, or leaving the page) is not an error to show.
    if (id === runs) status.value = 'error';
  } finally {
    // This run's own pool only: a newer run may have started its own meanwhile.
    p?.terminate();
    if (pool === p) pool = null;
  }
}

/** Ends any run at once, results dropped (another route, or the page going away). */
function kill(): void {
  runs++;
  const p = pool;
  pool = null;
  if (status.value === 'running') status.value = 'idle';
  p?.terminate();
}

// Another route, another answer.
watch(
  () => props.chain.join(','),
  () => {
    kill();
    report.value = null;
    status.value = 'idle';
  }
);
onUnmounted(kill);
</script>
