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
      {{
        deadline
          ? 'finding the highest TE you can reach by the date is arithmetic'
          : 'finding your fastest route is arithmetic'
      }}: it tries every checkpoint at every TE, with any number of ascensions. It's adjusted for your gear.
      <b>Check exactly</b> prices a route with the full simulator.
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
    <template v-if="result && deadline">
      <div class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1">
        <div class="text-[10px] font-black uppercase tracking-widest text-emerald-700">
          Highest TE by {{ show(deadline) }}
        </div>
        <template v-if="result.byDate">
          <div class="text-2xl font-black text-slate-900">
            {{ result.byDate.legs[result.byDate.legs.length - 1].endTE }} TE
          </div>
          <div class="font-mono-premium text-sm font-bold text-slate-800">{{ result.byDate.chain.join(' → ') }}</div>
          <div class="text-[12px] text-slate-700">
            Reached {{ show(result.byDate.end) }} · {{ result.byDate.legs.length }} ascensions ·
            {{ days(deadline - result.byDate.end) }} to spare
          </div>
          <button
            type="button"
            class="mt-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800"
            @click="emit('check', result.byDate.chain)"
          >
            Check exactly
          </button>
        </template>
        <p v-else class="text-[12px] text-amber-800">No route gets above your TE by then.</p>
      </div>
      <p
        v-if="leftOut.length"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      >
        Not in the instant answer: your {{ leftOut.join(', ') }}. Check exactly prices a route with them.
      </p>
    </template>

    <template v-if="result && !deadline">
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
        v-if="bonusShort > 0.05"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      >
        Your earnings set is {{ bonusShort.toFixed(2) }} Clothed TE short of the table's account, so your real
        ascensions run a little slower than these (about 1-2% each per point). The routes are still a good guide; Check
        exactly gives your own times.
      </p>
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
          your save), the waits run at your own peak delivery rate (the best set your inventory can wear at full
          research: {{ ((deliveryScale ?? 1) * 100).toFixed(1) }}% of the table's), and each ascension is read from the
          row for its own TE. Each fresh ascension starts on the hour, where the table was simulated; the weekly sale is
          at a fixed Pacific time, so the hour of the week is what matters.
        </p>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { showDateTime } from '@/lib/displayTime';
import { continueTailParams } from '@/search/leg';
import { CONTINUE_MAX_SECONDS, CONTINUE_PIN_MAX_SECONDS } from '@/search/rules';
import { EGG_ORDER } from '@/search/precomputedLeg';
import { cteFromArtifacts } from 'lib/virtue';
import { calculateArtifactModifiers, getOptimalELRSet } from '@/lib/artifacts';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { computeRealisticELR } from '@/calculations/realisticELR';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import { findRoutes, type Route } from '@/search/routeFinder';
import { poolSize, RoutePool } from '@/search/routePool';
import type { TableHeader } from '@/search/precomputedTable';

const props = defineProps<{
  /** Highest TE by a date: the unix second. Without it, the fastest route to the target. */
  deadline?: number;
}>();
const emit = defineEmits<{ check: [chain: number[]] }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const TABLE_URL = `${import.meta.env.BASE_URL}precompute/table.bin`;

const status = ref<'idle' | 'loading' | 'error' | 'done'>('idle');
const loadingText = ref('');
const errorText = ref('');
const result = ref<{ best: Route | null; byAscensions: (Route | null)[]; byDate: Route | null } | null>(null);
const header = ref<TableHeader | null>(null);
const ms = ref<number | null>(null);

/** The player's earnings set's Clothed TE bonus (read from the save the planner loaded). */
const bonus = computed(() => {
  const inv = store.readInventory();
  return inv.earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(inv.earnings)) : 0;
});

/**
 * The player's peak delivery rate against the table's, at the research a build waits with (the
 * table's `k3`): the best set the player's own inventory can wear there, through the simulator's own
 * rate function. Their whole inventory rather than a score, because at that research nearly every
 * stone goes to lay rate, and the set a save shows (chosen at today's research) would understate
 * everyone (scripts/precompute.ts --verify-table --as). Null until the table's header is in.
 */
const deliveryScale = computed<number | null>(() => {
  const k3 = header.value?.k3;
  if (!k3) return header.value ? 1 : null;
  const ctx = store.collectInputs().context;
  const raw = ctx.rawBackup;
  if (!raw) return 1;
  const rate = (set: EquippedArtifact[]) =>
    computeRealisticELR(k3.research, calculateArtifactModifiers(set), ctx.epicResearchLevels, ctx.colleggtibleModifiers)
      .effectiveRate;
  const mine = getOptimalELRSet(raw, {
    commonResearch: k3.research,
    epicResearchLevels: ctx.epicResearchLevels,
    colleggtibleModifiers: ctx.colleggtibleModifiers,
    assumeMaxHabsVehicles: true,
  });
  const theirs = rate(k3.delivery as EquippedArtifact[]);
  return mine && theirs > 0 ? rate(mine as EquippedArtifact[]) / theirs : 1;
});

/** The TE routes are found to: the planner's target, or for a date every TE up to the last. */
const target = computed(() => (props.deadline ? 490 : store.finalTE));

const rows = computed(() => (result.value?.byAscensions ?? []).filter((r): r is Route => !!r));

/** Setup the instant answer does not model, named so nobody reads it as accounted for. */
const leftOut = computed(() => {
  const out: string[] = [];
  if (store.scheduleEnabled) out.push('playing hours');
  if (store.timeOff.length) out.push('time off');
  if (store.milestones.length) out.push('dates to hit');
  return out;
});

/** How far the player's earnings set is from the table's: each point of Clothed TE short is about
 *  1-2% on every ascension (the board's own legs), which the instant answer does not take off. */
const bonusShort = computed(() => (header.value ? header.value.cteBonus - bonus.value : 0));

let pool: RoutePool | null = null;
function getPool(): RoutePool {
  pool ??= new RoutePool(
    poolSize(),
    () => new Worker(new URL('../../workers/routeFinder.worker.ts', import.meta.url), { type: 'module' })
  );
  return pool;
}
onUnmounted(() => pool?.terminate());

/** Each run's number: a run that has been superseded (the save or the date changed) is dropped. */
let runs = 0;

/**
 * The table's header, the player's first ascension and then the search itself, here on the page,
 * with each step's arithmetic split across the workers (search/routePool.ts).
 */
async function run(): Promise<void> {
  const te = Math.floor(store.currentTE);
  if (!(te > 0) || !(target.value > te)) return;
  const id = ++runs;
  status.value = 'loading';
  loadingText.value = header.value
    ? 'Working out every route…'
    : 'Loading the table (about 12 MB, once) and working out every route…';
  try {
    const p = getPool();
    const h = await p.header(TABLE_URL);
    if (id !== runs) return;
    header.value = h;
    // Every TE from the player's up is needed; a table still being built covers only the top.
    if (te < h.from) {
      result.value = null;
      status.value = 'error';
      errorText.value = `The table is still being built, from the top down: it starts at TE ${h.from} so far, and your route starts at ${te}. It fills in over the next day; the searches below work as always.`;
      return;
    }
    const inputs = store.collectInputs();
    const scale = deliveryScale.value ?? 1;
    const t0 = performance.now();
    const firstLegs = await p.firstLegs({
      url: TABLE_URL,
      startTE: te,
      start: inputs.planStart,
      final: target.value,
      deliveryScale: scale,
      delivered: EGG_ORDER.map(e => inputs.baseState.eggsDelivered?.[e] || 0),
      // A plain copy: workers get structured-cloned data, never a reactive proxy.
      cont: JSON.parse(JSON.stringify(continueTailParams(inputs, inputs.planStart))),
      forceContinue: store.forceContinue,
      pinSeconds: CONTINUE_PIN_MAX_SECONDS,
      maxContinueSeconds: CONTINUE_MAX_SECONDS,
    });
    if (id !== runs) return;
    const found = await findRoutes({
      table: () => null,
      startTE: te,
      start: inputs.planStart,
      final: target.value,
      maxAscensions: 10,
      firstLegs,
      deliveryScale: scale,
      ...(props.deadline ? { deadline: props.deadline } : {}),
      onProgress: (done, of) => {
        if (id === runs) loadingText.value = `Working out every route: ${done} of ${of} ascension counts done…`;
      },
      expand: (items, settings) => p.expand(TABLE_URL, items, settings),
    });
    if (id !== runs) return;
    result.value = found;
    ms.value = performance.now() - t0;
    status.value = 'done';
  } catch (err) {
    if (id !== runs) return;
    const message = err instanceof Error ? err.message : String(err);
    status.value = 'error';
    errorText.value = /404/.test(message)
      ? 'The precomputed table isn’t on this site yet.'
      : `The instant answer couldn’t run: ${message}`;
  }
}

// Again whenever what it depends on changes (a new save, a new plan start, another target).
let timer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [Math.floor(store.currentTE), store.planStart, target.value, props.deadline, store.forceContinue, bonus.value],
  () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), 300);
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
