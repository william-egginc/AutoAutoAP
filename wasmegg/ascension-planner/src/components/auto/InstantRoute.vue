<!--
  The instant answer: the fastest route from a precomputed table (search/precomputedTable.ts,
  search/routeFinder.ts) instead of a search. Allan's idea (1 Oct 2026): every fresh ascension a maxed
  account can make, simulated once per start TE and Pacific hour of the week, so a route is arithmetic.
  It looks at every checkpoint at every TE and every number of ascensions, in about a second.

  What it is exactly and what it adjusts for:
    - each ascension's time comes from the simulator's own build, and the waits after it are the
      simulator's own arithmetic, so a route priced here matches the simulator to the second when the
      account matches the table's (scripts/precompute.ts --verify);
    - the first ascension is the player's own: continue current ascension from their save when the
      continue rule takes it, otherwise a fresh build moved onto their real egg counts;
    - other gear: the table's account is maxed (perfect delivery, Clothed TE bonus 128.71); a player's
      waits run at their delivery score, and their builds come from the row with their earning power.
  What it leaves out: playing hours, time off and dated milestones (said beside the result), and the
  history of how a player reached each TE (shown to barely matter on the board). "Check exactly" hands
  any route to the Full sweep, which prices it with the full simulator.
-->
<template>
  <section class="rounded-2xl border border-emerald-200 bg-white p-4 space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-base font-black text-slate-900">
        Instant answer
        <span
          class="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-widest"
          >precomputed</span
        >
      </h3>
      <span v-if="ms !== null" class="text-[10px] text-slate-400"
        >every route checked in {{ (ms / 1000).toFixed(1) }} s</span
      >
    </div>
    <p class="text-[12px] text-slate-600 leading-relaxed">
      Every ascension a maxed account can make was simulated ahead of time, from every TE at every hour of the week, so
      finding your fastest route is arithmetic: it tries every checkpoint at every TE, with any number of ascensions.
      It's adjusted for your gear. <b>Check exactly</b> prices a route with the full simulator in the {{ NAMES.full }}.
    </p>

    <p v-if="status === 'loading'" class="text-[12px] text-slate-500 flex items-center gap-2">
      <span class="inline-block w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      {{ loadingText }}
    </p>
    <p
      v-else-if="status === 'error'"
      class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900"
    >
      {{ errorText }}
    </p>

    <p
      v-if="header?.fake"
      class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] font-bold text-rose-800"
    >
      Test table: rows below what has been simulated are filled in from the nearest real ones, to try the page. These
      routes and dates are not real answers.
    </p>
    <template v-if="result">
      <div v-if="result.best" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1">
        <div class="text-[10px] font-black uppercase tracking-widest text-emerald-700">Fastest route</div>
        <div class="font-mono-premium text-base font-black text-slate-900">{{ result.best.chain.join(' → ') }}</div>
        <div class="text-[12px] text-slate-700">
          Reaches {{ store.finalTE }} on <b>{{ show(result.best.end) }}</b> · {{ days(result.best.seconds) }} ·
          {{ result.best.legs.length }} ascensions
        </div>
        <button
          type="button"
          class="mt-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800"
          :disabled="result.best.chain.length < 2"
          @click="emit('check', result.best.chain)"
        >
          Check exactly
        </button>
      </div>
      <p v-else class="text-[12px] text-amber-800">No route reaches {{ store.finalTE }} from here in the table.</p>

      <p
        v-if="leftOut.length"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      >
        Not in the instant answer: your {{ leftOut.join(', ') }}. It's the fastest route without them; Check exactly
        prices a route with them.
      </p>

      <div class="overflow-x-auto">
        <table class="w-full text-[12px]">
          <thead>
            <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
              <th class="py-1 pr-3">Ascensions</th>
              <th class="py-1 pr-3">Reaches {{ store.finalTE }}</th>
              <th class="py-1 pr-3">Behind</th>
              <th class="py-1 pr-3">Route</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.legs.length"
              class="border-t border-slate-100"
              :class="r === result.best ? 'bg-emerald-50/60' : ''"
            >
              <td class="py-1.5 pr-3 font-bold text-slate-800">{{ r.legs.length }}</td>
              <td class="py-1.5 pr-3 text-slate-700 whitespace-nowrap">{{ show(r.end) }}</td>
              <td class="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
                {{ r === result.best ? 'fastest' : '+' + days(r.seconds - result.best!.seconds) }}
              </td>
              <td class="py-1.5 pr-3 font-mono-premium text-slate-800">{{ r.chain.join(' ') }}</td>
              <td class="py-1.5 text-right">
                <button
                  type="button"
                  class="px-2 py-1 rounded-md border border-slate-300 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-800"
                  :disabled="r.chain.length < 2"
                  :title="r.chain.length < 2 ? 'One ascension has no checkpoints to sweep' : ''"
                  @click="emit('check', r.chain)"
                >
                  Check exactly
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details class="text-[11px] text-slate-500">
        <summary class="cursor-pointer font-bold text-slate-600">How this is worked out</summary>
        <p class="mt-1 leading-relaxed">
          The table was built on a maxed account: perfect delivery set, Clothed TE bonus {{ header?.cteBonus }}, all
          epic research and colleggtibles. Each of its ascensions is the simulator's own build, and the waiting after it
          is the simulator's own arithmetic, so on that account a route here matches the full simulator to the second.
          For you: your first ascension is your own (continuing the one in progress when the continue rule would, from
          your save), the waits run at your delivery score ({{ gear.score.toFixed(3) }}), and each build is read from
          the row with your earning power (your bonus {{ gear.bonus.toFixed(2) }}). Ascension starts are matched to the
          Pacific hour of the week, because the weekly sale is at a fixed Pacific time.
        </p>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { NAMES } from '@/lib/siteNav';
import { showDateTime } from '@/lib/displayTime';
import { continueTailParams } from '@/search/leg';
import { CONTINUE_MAX_SECONDS, CONTINUE_PIN_MAX_SECONDS } from '@/search/rules';
import { deliveryScore } from '@/search/virtueScore';
import { EGG_ORDER } from '@/search/precomputedLeg';
import { cteFromArtifacts } from 'lib/virtue';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import type { Route } from '@/search/routeFinder';
import type { TableHeader } from '@/search/precomputedTable';
import type { RouteWorkerResponse } from '@/workers/routeFinder.protocol';

const emit = defineEmits<{ check: [chain: number[]] }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const TABLE_URL = `${import.meta.env.BASE_URL}precompute/table.bin`;

const status = ref<'idle' | 'loading' | 'error' | 'done'>('idle');
const loadingText = ref('');
const errorText = ref('');
const result = ref<{ best: Route | null; byAscensions: (Route | null)[] } | null>(null);
const header = ref<TableHeader | null>(null);
const ms = ref<number | null>(null);

/** The player's gear against the table's (read from the save the planner loaded). */
const gear = computed(() => {
  const inv = store.readInventory();
  return {
    score: inv.elr ? (deliveryScore(inv.elr)?.score ?? 1) : 1,
    bonus: inv.earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(inv.earnings)) : 0,
  };
});

const rows = computed(() => (result.value?.byAscensions ?? []).filter((r): r is Route => !!r));

/** Setup the instant answer does not model, named so nobody reads it as accounted for. */
const leftOut = computed(() => {
  const out: string[] = [];
  if (store.scheduleEnabled) out.push('playing hours');
  if (store.timeOff.length) out.push('time off');
  if (store.milestones.length) out.push('dates to hit');
  return out;
});

let worker: Worker | null = null;
let nextId = 0;
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/routeFinder.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<RouteWorkerResponse>) => {
      const m = e.data;
      if (m.id !== nextId) return; // an older request, superseded
      if (m.kind === 'progress') {
        loadingText.value = `Working out every route: ${m.done} of ${m.of} ascension counts done…`;
        return;
      }
      if (m.kind === 'not-yet') {
        header.value = m.header;
        result.value = null;
        status.value = 'error';
        errorText.value = `The table is still being built, from the top down: it starts at TE ${m.header.from} so far, and your route starts at ${Math.floor(store.currentTE)}. It fills in over the next day; the searches below work as always.`;
        return;
      }
      if (m.kind === 'error') {
        status.value = 'error';
        errorText.value = /404/.test(m.message)
          ? 'The precomputed table isn’t on this site yet.'
          : `The instant answer couldn’t run: ${m.message}`;
        return;
      }
      result.value = { best: m.best, byAscensions: m.byAscensions };
      header.value = m.header;
      ms.value = m.ms;
      status.value = 'done';
    };
  }
  return worker;
}
onUnmounted(() => worker?.terminate());

function run(): void {
  const te = Math.floor(store.currentTE);
  if (!(te > 0) || !(store.finalTE > te)) return;
  const inputs = store.collectInputs();
  status.value = 'loading';
  loadingText.value = header.value
    ? 'Working out every route…'
    : 'Loading the table (about 12 MB, once) and working out every route…';
  nextId++;
  getWorker().postMessage({
    kind: 'find',
    id: nextId,
    url: TABLE_URL,
    startTE: te,
    start: inputs.planStart,
    final: store.finalTE,
    maxAscensions: 10,
    deliveryScore: gear.value.score,
    cteBonus: gear.value.bonus,
    delivered: EGG_ORDER.map(e => inputs.baseState.eggsDelivered?.[e] || 0),
    // A plain copy: the worker gets structured-cloned data, never a reactive proxy.
    cont: JSON.parse(JSON.stringify(continueTailParams(inputs, inputs.planStart))),
    forceContinue: store.forceContinue,
    pinSeconds: CONTINUE_PIN_MAX_SECONDS,
    maxContinueSeconds: CONTINUE_MAX_SECONDS,
  });
}

// Again whenever what it depends on changes (a new save, a new plan start, another target).
let timer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [
    Math.floor(store.currentTE),
    store.planStart,
    store.finalTE,
    store.forceContinue,
    gear.value.score,
    gear.value.bonus,
  ],
  () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 300);
  },
  { immediate: true }
);
onUnmounted(() => timer && clearTimeout(timer));

const zone = computed(() => planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
function show(unix: number): string {
  return showDateTime(unix, zone.value);
}
function days(seconds: number): string {
  return (seconds / 86400).toFixed(2) + ' days';
}
</script>
