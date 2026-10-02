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
      waits run at their own peak delivery rate, and their builds are the table's for their own TE (a
      weaker earnings set is not taken off; the page says so when it is).
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
        <span
          v-if="own"
          class="ml-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase tracking-widest"
          >your gear</span
        >
      </h3>
      <span v-if="ms !== null" class="text-[10px] text-slate-400"
        >every route checked in {{ (ms / 1000).toFixed(1) }} s</span
      >
    </div>
    <p class="text-[12px] text-slate-600 leading-relaxed">
      Every ascension {{ own ? 'your account can make, with the gear your save has now,' : 'a maxed account can make' }}
      was simulated ahead of time, from every TE at every hour of the week, so
      {{
        deadline
          ? 'finding the highest TE you can reach by the date is arithmetic'
          : 'finding your fastest route is arithmetic'
      }}: it tries every checkpoint at every TE, with any number of ascensions.{{
        own ? ' The table was built on your own gear.' : " It's adjusted for your gear."
      }}
      <b>Check exactly</b> prices a route with the full simulator.
    </p>
    <p v-if="ownChanged" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
      Your gear changed since your table was made ({{ ownChanged }}), so this answer uses the maxed table instead.
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
          <!-- The simulator's answer leads once it is in; the table's stays beside it. -->
          <template v-if="dateExact">
            <div class="text-2xl font-black text-slate-900">
              {{ dateExact.endTE }} TE <span class="text-[11px] font-bold text-emerald-700">exact, your account</span>
            </div>
            <div class="font-mono-premium text-sm font-bold text-slate-800">{{ dateExact.chain.join(' → ') }}</div>
            <div class="text-[12px] text-slate-700">
              Reached {{ show(dateExact.end) }} · {{ dateExact.chain.length }} ascensions ·
              {{ days(deadline - dateExact.end) }} to spare
            </div>
          </template>
          <div :class="dateExact ? 'text-[11px] text-slate-500' : ''">
            <div v-if="!dateExact" class="text-2xl font-black text-slate-900">
              {{ result.byDate.legs[result.byDate.legs.length - 1].endTE }} TE
            </div>
            <div v-if="!dateExact" class="font-mono-premium text-sm font-bold text-slate-800">
              {{ result.byDate.chain.join(' → ') }}
            </div>
            <div :class="dateExact ? '' : 'text-[12px] text-slate-700'">
              {{
                dateExact ? 'The table said ' + result.byDate.legs[result.byDate.legs.length - 1].endTE + ' TE: ' : ''
              }}Reached {{ show(result.byDate.end) }} · {{ result.byDate.legs.length }} ascensions ·
              {{ days(deadline - result.byDate.end) }} to spare<template v-if="dateExact && missedBy !== null"
                >; on your account that route arrives {{ days(missedBy) }} after the date</template
              >
            </div>
          </div>
          <p v-if="exactStatus === 'running'" class="text-[11px] text-emerald-800 flex items-center gap-2">
            <span
              class="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"
            />
            {{ exactText }}
          </p>
          <p v-else-if="exactStatus === 'done' && !dateExact" class="text-[11px] text-amber-800">
            On your account this route's earlier stops already run past the date. Check exactly searches for yours.
          </p>
          <button
            type="button"
            class="mt-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800"
            @click="emit('check', (dateExact ?? result.byDate).chain)"
          >
            Check exactly
          </button>
        </template>
        <p v-else class="text-[12px] text-amber-800">No route gets above your TE by then.</p>
      </div>
    </template>

    <template v-if="result && !deadline">
      <div v-if="lead" class="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1">
        <div class="text-[10px] font-black uppercase tracking-widest text-emerald-700">Fastest route</div>
        <div class="font-mono-premium text-base font-black text-slate-900">{{ lead.chain.join(' → ') }}</div>
        <div v-if="exactOf(lead)" class="text-[12px] text-slate-800">
          Reaches {{ store.finalTE }} on <b>{{ show(exactOf(lead)!.end) }}</b> · {{ days(exactOf(lead)!.seconds) }} ·
          {{ lead.legs.length }} ascensions
          <span class="text-[11px] font-bold text-emerald-700">exact, your account</span>
        </div>
        <div :class="exactOf(lead) ? 'text-[11px] text-slate-500' : 'text-[12px] text-slate-700'">
          {{ exactOf(lead) ? 'The table said ' : 'Reaches ' + store.finalTE + ' on '
          }}<b v-if="!exactOf(lead)">{{ show(lead.end) }}</b
          ><template v-else>{{ show(lead.end) }}</template> · {{ days(lead.seconds)
          }}<template v-if="!exactOf(lead)"> · {{ lead.legs.length }} ascensions</template>
        </div>
        <p v-if="reranked && result.best" class="text-[11px] text-amber-800">
          The table ranked the {{ result.best.legs.length }}-ascension route first ({{ result.best.chain.join(' ') }});
          on your account the full simulator has this one
          {{ days(exactOf(result.best)!.end - exactOf(lead)!.end) }} sooner.
        </p>
        <p v-if="exactStatus === 'running'" class="text-[11px] text-emerald-800 flex items-center gap-2">
          <span
            class="inline-block w-2.5 h-2.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"
          />
          {{ exactText }}
        </p>
        <button
          type="button"
          class="mt-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800"
          :disabled="lead.chain.length < 2"
          @click="emit('check', lead.chain)"
        >
          Check exactly
        </button>
      </div>
      <p v-else class="text-[12px] text-amber-800">No route reaches {{ store.finalTE }} from here in the table.</p>
    </template>

    <p v-if="result && exactStatus === 'error'" class="text-[11px] text-amber-800">{{ exactText }}</p>
    <p v-if="result && exactStatus === 'waiting'" class="text-[11px] text-slate-500">
      The exact check on your account waits while a search is running.
    </p>
    <p v-if="result && exactStatus === 'done' && exactMs !== null" class="text-[10px] text-slate-400">
      Checked on your account with the full simulator in {{ (exactMs / 1000).toFixed(0) }} s.
    </p>

    <!-- What the answer above does not account for, on both screens. -->
    <template v-if="result">
      <p v-if="gearDiffers" class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Your gear isn't the table's account's (<template v-if="bonusShort > 0.05"
          >earnings set {{ bonusShort.toFixed(2) }} Clothed TE short, </template
        >delivery {{ ((deliveryScale ?? 1) * 100).toFixed(1) }}% of its at full research). Ascensions that start below
        about TE {{ FULL_RESEARCH_TE }} can take a few percent more or less than these, and may need a longer build (one
        more research sale) than shown: your earnings set, and how your delivery gear does before research is complete,
        aren't fully taken off. From there up they match. Check exactly gives your own times.
      </p>
      <p
        v-if="progressionShort"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      >
        The table's account has every epic research and colleggtible maxed; yours has {{ progressionShort }}. Your real
        ascensions run slower than these, more so the further short you are. Check exactly gives your own times.
      </p>
      <p
        v-if="leftOut.length"
        class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
      >
        Not in the table's routes: your {{ leftOut.join(', ') }}.
        {{ deadline ? '' : 'They are the fastest without them; ' }}the exact times on your account include them.
      </p>
    </template>

    <template v-if="result && !deadline">
      <div class="overflow-x-auto">
        <table class="w-full text-[12px]">
          <thead>
            <tr class="text-left text-[9px] font-black uppercase tracking-widest text-slate-400">
              <th class="py-1 pr-3">Ascensions</th>
              <th class="py-1 pr-3">Reaches {{ store.finalTE }}</th>
              <th class="py-1 pr-3">Behind</th>
              <th class="py-1 pr-3">Exact, your account</th>
              <th class="py-1 pr-3">Route</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.legs.length"
              class="border-t border-slate-100"
              :class="r === lead ? 'bg-emerald-50/60' : ''"
            >
              <td class="py-1.5 pr-3 font-bold text-slate-800">{{ r.legs.length }}</td>
              <td class="py-1.5 pr-3 text-slate-700 whitespace-nowrap">{{ show(r.end) }}</td>
              <td class="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
                {{ behind(r) }}
              </td>
              <td
                class="py-1.5 pr-3 whitespace-nowrap"
                :class="r === exactBest ? 'font-bold text-emerald-800' : 'text-slate-700'"
              >
                <template v-if="exactOf(r)">{{ show(exactOf(r)!.end) }} · {{ days(exactOf(r)!.seconds) }}</template>
                <template v-else-if="exactOf(r) === null">couldn’t price</template>
                <span v-else-if="exactStatus === 'running'" class="text-slate-400">…</span>
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
        <p v-if="gearTable" class="mt-1 leading-relaxed">
          This table was built on gear exactly like yours (the same artifacts and stones, so the same earnings and
          delivery sets, with epic research and colleggtibles maxed), so its ascensions match the full simulator for
          you<template v-if="(header?.gearTo ?? 489) < 489">
            up to TE {{ header?.gearTo }}; above that it uses the maxed table at your own delivery rate</template
          >. Each fresh ascension starts on the hour, where the table was simulated.
        </p>
        <p v-else-if="own" class="mt-1 leading-relaxed">
          This table was built on your own account: your earnings and delivery sets, epic research and colleggtibles as
          your save has them now (Clothed TE bonus {{ header?.cteBonus }}). Each of its ascensions is the simulator's
          own build, and the waiting after it is the simulator's own arithmetic, so a route here matches the full
          simulator on your account. Your first ascension is your own (continuing the one in progress when the continue
          rule would, from your save). Each fresh ascension starts on the hour, where the table was simulated. If your
          gear changes, the page goes back to the maxed table until yours is made again.
        </p>
        <p v-else class="mt-1 leading-relaxed">
          The table was built on a maxed account: perfect delivery set, Clothed TE bonus {{ header?.cteBonus }}, all
          epic research and colleggtibles. Each of its ascensions is the simulator's own build, and the waiting after it
          is the simulator's own arithmetic, so on that account a route here matches the full simulator to the second.
          For you: your first ascension is your own (continuing the one in progress when the continue rule would, from
          your save), the waits run at your own peak delivery rate ({{ ((deliveryScale ?? 1) * 100).toFixed(1) }}% of
          the table's,
          {{
            measuredK !== null
              ? 'measured from one simulated build of your account'
              : 'estimated from the best set your inventory can wear at full research'
          }}), and each ascension is read from the row for its own TE. Each fresh ascension starts on the hour, where
          the table was simulated; the weekly sale is at a fixed Pacific time, so the hour of the week is what matters.
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
import { continueTailParams, instantDeliveryScale } from '@/search/leg';
import { CONTINUE_MAX_SECONDS, CONTINUE_PIN_MAX_SECONDS } from '@/search/rules';
import { EGG_ORDER } from '@/search/precomputedLeg';
import { cteFromArtifacts } from 'lib/virtue';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import { findRoutes, type Route } from '@/search/routeFinder';
import { describeColleggtibles } from '@/search/progression';
import { poolSize, RoutePool } from '@/search/routePool';
import { createChainSearchPool, type ChainSearchPool, type EvaluateOptions } from '@/search/pool';
import { gearChanges, gearStamp, gearTableName, tableName } from '@/search/tableGear';
import { compositeUrl, parseCompositeUrl } from '@/search/precomputedTable';
import type { TableHeader } from '@/search/precomputedTable';

const props = defineProps<{
  /** Highest TE by a date: the unix second. Without it, the fastest route to the target. */
  deadline?: number;
}>();
const emit = defineEmits<{ check: [chain: number[]] }>();
const store = useChainSearchStore();
const planner = useAutoPlannerStore();

const TABLE_URL = `${import.meta.env.BASE_URL}precompute/table.bin`;

/** The table the answer came from: the player's own (search/tableGear.ts) or the maxed one. */
const tableUrl = ref(TABLE_URL);
/** Built on this player's gear (their own table, or a board gear combination's exactly like theirs):
 *  no adjustment, and none of the maxed table's caveats. */
const own = computed(() => tableUrl.value !== TABLE_URL);
/** A gear combination's table below GEAR_TABLE_TO, the maxed one from it. */
const gearTable = computed(() => !!parseCompositeUrl(tableUrl.value));
/** Where gear tables end and the maxed table takes over: from there it is exact for any gear on the
 *  board (the collector analyst, 1 Oct, B2). */
const GEAR_TABLE_TO = 340;
/** What changed since the player's own table was made, when it no longer fits their save. */
const ownChanged = ref('');

/** Where the player's own table would be: a slow hash of their id (search/tableGear.ts), worked
 *  out once per id; the id never leaves the page. Null without a save. */
let ownName: { id: string; name: Promise<string> } | null = null;
async function ownTableUrl(): Promise<string | null> {
  const id = (store.collectInputs().context.rawBackup as { eiUserId?: string } | undefined)?.eiUserId;
  if (!id) return null;
  if (ownName?.id !== id) ownName = { id, name: tableName(id) };
  return `${import.meta.env.BASE_URL}precompute/${await ownName.name}`;
}

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

/** The player's peak delivery rate against the table's (search/leg.ts `instantDeliveryScale`). Null
 *  until the table's header is in. */
const deliveryScale = computed<number | null>(() => {
  // The player's own table is their own rate already.
  if (own.value) return 1;
  if (measuredK.value !== null) return measuredK.value;
  const k3 = header.value?.k3;
  if (!k3) return header.value ? 1 : null;
  return instantDeliveryScale(store.collectInputs(), k3);
});

/**
 * The player's delivery scale for the maxed table, measured: one build of their own account at the
 * table's peak cell (search/tableBuild.ts buildPeak, on a worker, about five seconds), against the
 * table's own peak there (header.k3.peak). The best set the inventory can wear at the maxed account's
 * research (instantDeliveryScale, the estimate it replaces) misses up to 2.2% for weaker earnings sets,
 * whose builds reach the wait with other research (scripts/precompute.ts --compare-high). Once per
 * save; null until measured or when it cannot be, and then the estimate stands.
 */
const measuredK = ref<number | null>(null);
let measured: { key: string; k: Promise<number | null> } | null = null;
function measureScale(h: TableHeader): Promise<number | null> {
  const peak = h.k3?.peak;
  if (!peak) return Promise.resolve(null);
  const inputs = store.collectInputs();
  const raw = inputs.context.rawBackup as { eiUserId?: string; approxTime?: number } | undefined;
  const key = `${raw?.eiUserId}|${raw?.approxTime}|${peak}`;
  if (measured?.key !== key)
    measured = {
      key,
      k: (async () => {
        const one = await createChainSearchPool(inputs, { size: 1 });
        try {
          const mine = await one.peak();
          return mine && mine > 0 ? mine / peak : null;
        } finally {
          one.terminate();
        }
      })().catch(() => null),
    };
  return measured.k;
}

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

/** How far the player's earnings set is from the table's Clothed TE bonus. */
const bonusShort = computed(() => (header.value ? header.value.cteBonus - bonus.value : 0));

/**
 * The start TE from which the table's builds hold for any gear: the build reaches full research, so
 * the delivery adjustment is exact and the earnings set stops mattering. Measured on the board's legs
 * priced the site's way (the collector analyst, 1 Oct): from 340 every account is exact (median
 * 0.00%, 90th percentile at most 0.02%, 168k legs). At 300-339 accounts that earn less than the
 * table's (a smaller bonus or weaker delivery: a build earns eggs shipped times egg value) need one
 * more sale week on many legs (7-57% of identical legs, by account). At 245-251 the earnings set
 * costs ~0.3% of leg time per Clothed TE point and delivery gear on incomplete research is off by
 * 1-2.6% either way.
 */
const FULL_RESEARCH_TE = 340;

/** The player's gear is not the table's account's, and the route starts where that shows. */
const gearDiffers = computed(
  () =>
    !own.value &&
    Math.floor(store.currentTE) < FULL_RESEARCH_TE &&
    (bonusShort.value > 0.05 || Math.abs((deliveryScale.value ?? 1) - 1) > 0.005)
);

/** What the player's epic research and colleggtibles are short of the table's (all maxed), said
 *  plainly; empty when nothing is, or nothing could be read. Both speed every build and every wait,
 *  and the instant answer takes neither off. */
const progressionShort = computed(() => {
  if (own.value) return '';
  const { epicResearch, colleggtibles } = store.progression();
  const out: string[] = [];
  if (epicResearch && !epicResearch.maxed)
    out.push(`${epicResearch.atMax} of ${epicResearch.total} epic research at max`);
  if (colleggtibles && !colleggtibles.maxed) out.push(`colleggtibles ${describeColleggtibles(colleggtibles)}`);
  return out.join(' and ');
});

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
  stopExact();
  exactStatus.value = 'idle';
  status.value = 'loading';
  loadingText.value = header.value
    ? 'Working out every route…'
    : 'Loading the table (about 12 MB, once) and working out every route…';
  try {
    const p = getPool();
    // The player's own table when there is one built on the gear their save has now; else the maxed one.
    let url = TABLE_URL;
    let h: TableHeader | null = null;
    let mismatch = '';
    const mine = await ownTableUrl().catch(() => null);
    if (mine) {
      try {
        const oh = await p.header(mine);
        if (oh.gear) {
          const stamp = gearStamp(store.collectInputs(), store.readInventory().earnings, oh.gear.research);
          const changes = stamp ? gearChanges(oh.gear, stamp) : ['gear'];
          if (!changes.length) {
            url = mine;
            h = oh;
          } else mismatch = changes.join(', ');
        }
      } catch {
        // No table of their own (the usual case): the maxed one.
      }
    }
    h ??= await p.header(TABLE_URL);
    // No table of their own: one built on a board gear combination exactly like theirs, if there is
    // one (search/tableGear.ts gearTableName), below GEAR_TABLE_TO; the maxed one from there.
    if (url === TABLE_URL && h.k3) {
      const stamp = gearStamp(store.collectInputs(), store.readInventory().earnings, h.k3.research);
      if (stamp) {
        const gearUrl = `${import.meta.env.BASE_URL}precompute/${await gearTableName(stamp)}`;
        const scale = instantDeliveryScale(store.collectInputs(), h.k3);
        const both = compositeUrl(gearUrl, TABLE_URL, GEAR_TABLE_TO, scale);
        try {
          h = await p.header(both);
          url = both;
        } catch {
          // No table for this gear (the usual case): the maxed one.
          h = await p.header(TABLE_URL);
        }
      }
    }
    if (id !== runs) return;
    header.value = h;
    tableUrl.value = url;
    ownChanged.value = mismatch;
    // On the maxed table, the player's own delivery rate from one simulated build (once per save).
    if (url === TABLE_URL) {
      loadingText.value = 'Measuring your delivery rate with one simulated build of your account…';
      const k = await measureScale(h);
      if (id !== runs) return;
      measuredK.value = k;
    } else measuredK.value = null;
    // Every TE from the player's up is needed, and the table starts where virtue players are.
    if (te < h.from) {
      result.value = null;
      status.value = 'error';
      errorText.value = `The table starts at TE ${h.from} and your route starts at ${te}, so there is no instant answer yet. The searches below work as always.`;
      return;
    }
    const inputs = store.collectInputs();
    const scale = deliveryScale.value ?? 1;
    const t0 = performance.now();
    const firstLegs = await p.firstLegs({
      url,
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
      expand: (items, settings) => p.expand(url, items, settings),
    });
    if (id !== runs) return;
    result.value = found;
    ms.value = performance.now() - t0;
    status.value = 'done';
    void runExact(id, found);
  } catch (err) {
    if (id !== runs) return;
    const message = err instanceof Error ? err.message : String(err);
    status.value = 'error';
    errorText.value = /404/.test(message)
      ? 'The precomputed table isn’t on this site yet.'
      : `The instant answer couldn’t run: ${message}`;
  }
}

/**
 * THE EXACT CHECK. The table is exact for its own maxed account; for anyone else it is a few percent
 * off below TE 340, and over a whole route that can move the ranking or a date answer by a TE or two
 * (the alt from TE 138: the table's 9-ascension pick is 1.4% fast and the simulator prefers an
 * 8-ascension route; its Egg Day 248 arrives 5 d late). So once the instant answer is shown, the
 * routes it shows are priced again by the full simulator on the player's own account and setup
 * (search/pool.ts, the same evaluation the searches use), and the page says what that gives.
 *
 * Fastest route: the table's fastest first, alone, so its exact date comes soonest; then the other
 * rows a round at a time, one route per worker, filling the Exact column as each round returns (a
 * worker only answers when its whole share is done, and the pool deals each call by position, so
 * rounds are the way to see rows arrive). By a date: the date's route; if it misses the date, the
 * same checkpoints with the last one lower, on one worker so the shared legs are simulated once.
 */
interface Exact {
  /** Seconds from the plan start, and the unix second it ends. */
  seconds: number;
  end: number;
  /** TE when the route ends (above its last checkpoint when a sale wait overshoots). */
  endTE: number;
}
/** Exact prices by `chain.join(',')`; null where the simulator could not price the route. */
const exact = ref<Record<string, Exact | null>>({});
const exactStatus = ref<'idle' | 'running' | 'done' | 'error' | 'waiting'>('idle');
const exactText = ref('');
const exactMs = ref<number | null>(null);
/** By a date: the highest TE the date's route really reaches in time, from the simulator. */
const dateExact = ref<{ chain: number[]; endTE: number; end: number } | null>(null);

let exactPool: ChainSearchPool | null = null;
function stopExact(): void {
  exactPool?.terminate();
  exactPool = null;
}
onUnmounted(stopExact);

const key = (chain: number[]) => chain.join(',');
const exactOf = (r: Route) => exact.value[key(r.chain)];

async function runExact(id: number, found: NonNullable<typeof result.value>): Promise<void> {
  stopExact();
  exact.value = {};
  dateExact.value = null;
  exactMs.value = null;
  // A search the player started has the cores; this waits rather than slowing it down.
  if (store.isRunning) {
    exactStatus.value = 'waiting';
    return;
  }
  const routes = props.deadline
    ? found.byDate
      ? [found.byDate]
      : []
    : [found.best, ...found.byAscensions.filter(r => r && r !== found.best)].filter((r): r is Route => !!r);
  if (!routes.length) return;
  exactStatus.value = 'running';
  const t0 = performance.now();
  try {
    const inputs = store.collectInputs();
    const size = Math.max(1, Math.min(store.workerBudget, routes.length, 4));
    exactPool = await createChainSearchPool(inputs, { size });
    if (id !== runs) return;
    const price = async (chains: number[][], opts?: EvaluateOptions) => {
      const { results } = await exactPool!.evaluate(chains, undefined, opts);
      if (id !== runs) return false;
      const next = { ...exact.value };
      for (const c of chains) {
        const r = results.find(x => key(x.chain) === key(c));
        next[key(c)] =
          r && r.seconds > 0
            ? { seconds: r.seconds, end: inputs.planStart + r.seconds, endTE: r.legs[r.legs.length - 1]?.endTE ?? 0 }
            : null;
      }
      exact.value = next;
      return true;
    };

    if (props.deadline) {
      const route = routes[0];
      const deadline = props.deadline;
      // The shared legs stay on one worker (sticky on all but the last stop), so each lower last stop
      // costs one ascension.
      const sticky = { stickyDepth: -1 };
      exactText.value = 'Checking this route on your account with the full simulator…';
      if (!(await price([route.chain], sticky))) return;
      const first = exact.value[key(route.chain)];
      if (first && first.end <= deadline) {
        dateExact.value = { chain: route.chain, endTE: first.endTE, end: first.end };
      } else {
        const prefix = route.chain.slice(0, -1);
        const floor = prefix.length ? prefix[prefix.length - 1] : Math.floor(store.currentTE);
        for (let hi = route.chain[route.chain.length - 1] - 1; hi > floor && !dateExact.value; hi -= 3) {
          const tries = [hi, hi - 1, hi - 2].filter(t => t > floor).map(t => [...prefix, t]);
          exactText.value = `It misses the date on your account; trying lower last stops (${tries.map(c => c[c.length - 1]).join(', ')})…`;
          if (!(await price(tries, sticky))) return;
          for (const c of tries) {
            const e = exact.value[key(c)];
            if (e && e.end <= deadline) {
              dateExact.value = { chain: c, endTE: e.endTE, end: e.end };
              break;
            }
          }
        }
      }
    } else {
      exactText.value = 'Checking the fastest route on your account with the full simulator…';
      if (!(await price([routes[0].chain]))) return;
      const rest = routes.slice(1);
      for (let i = 0; i < rest.length; i += size) {
        exactText.value = `Checking the other routes: ${i} of ${rest.length} done…`;
        if (
          !(await price(
            rest.slice(i, i + size).map(r => r.chain),
            { spreadOut: true }
          ))
        )
          return;
      }
    }
    exactMs.value = performance.now() - t0;
    exactStatus.value = 'done';
  } catch (err) {
    if (id !== runs) return;
    exactStatus.value = 'error';
    exactText.value = `The exact check couldn’t run: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (id === runs) stopExact();
  }
}

/** The fastest route by the simulator among the rows priced so far, once every row is priced. */
const exactBest = computed<Route | null>(() => {
  if (props.deadline || exactStatus.value !== 'done') return null;
  let best: Route | null = null;
  for (const r of rows.value) {
    const e = exactOf(r);
    if (e && (!best || e.end < exactOf(best)!.end)) best = r;
  }
  return best;
});
/** By a date: how many seconds after the date the table's own date route really arrives, when it
 *  misses on the player's account. */
const missedBy = computed<number | null>(() => {
  const r = result.value?.byDate;
  const e = r ? exact.value[key(r.chain)] : undefined;
  return props.deadline && e && e.end > props.deadline ? e.end - props.deadline : null;
});
/** How far a row is behind the fastest: by the simulator once every row is priced, by the table until then. */
function behind(r: Route): string {
  const best = exactBest.value;
  if (best) {
    const e = exactOf(r);
    if (!e) return '';
    return r === best ? 'fastest' : '+' + days(e.end - exactOf(best)!.end);
  }
  const t = result.value?.best;
  if (!t) return '';
  return r === t ? 'fastest' : '+' + days(r.seconds - t.seconds);
}
/** The route the box leads with: the simulator's fastest once known, else the table's. */
const lead = computed(() => exactBest.value ?? result.value?.best ?? null);
const reranked = computed(() => !!exactBest.value && exactBest.value !== result.value?.best);

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
