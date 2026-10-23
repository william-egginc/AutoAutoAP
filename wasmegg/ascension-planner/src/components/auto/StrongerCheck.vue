<!--
  "Try: stronger check" (PROTOTYPE, the user, 11 Oct; search/strongerCheck.ts has the what and why).
  Off by default, remembered in this browser. On, once Check exactly has finished:
    a. the player's own earlier routes for this goal, priced on the save loaded now ("your earlier route");
    b. by a date, when the top route misses the date, the instant answer's fastest route one TE lower
       (two if needed), so the panel ends on a route that makes the date;
    c. Refine (a button, with an estimate first): every route within 2 TE of each stop of the best,
       priced on the current workers, nearest first, capped at 10 minutes.
  Whatever beats the answer above shows as "Best now" at the top of this box.
  Since 14 Oct (Jordan) Light first prices the instant answer's routes at once, on the player's hours
  (search/lightAtOnce.ts; it took over the instant answer's "Also try ascending the moment each ascension
  ends" box): the lead first, then the counts table's other rows, each line shown as it lands. Then a.
  and b. as before. The same pool does both; a search starting, Check exactly starting, a new answer or
  leaving the screen stops it (the generation counter `autoGen` and the pool's terminate).
-->
<template>
  <StrongerCheckView
    v-model:on="on"
    :bare="embedded"
    :deadline="deadline"
    :target="store.finalTE"
    :zone="zone"
    :waiting-for="waitingFor"
    :best="best"
    :best-now="bestNow"
    :auto-status="autoStatus"
    :auto-text="autoText"
    :earlier="earlier"
    :steps="steps"
    :step-skipped="stepSkipped"
    :refine="refineView"
    @simulate="simulate"
    @refine="runRefine"
    @stop="stopRefineNow"
  />
</template>

<script setup lang="ts">
import { plainError } from '@/lib/plainError';
import { computed, onUnmounted, ref, watch } from 'vue';
import StrongerCheckView from './StrongerCheckView.vue';
import { idleLight, useStrongerStore } from '@/stores/stronger';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { showDateTime } from '@/lib/displayTime';
import { checkWorkers } from '@/search/device';
import { createChainSearchPool, type ChainSearchPool, type EvaluateOptions } from '@/search/pool';
import type { HandoffChoice } from '@/search/chain';
import type { LegSummary } from '@/search/types';
import { findRoutes, type FoundRoutes } from '@/search/routeFinder';
import { atMostAscensions } from '@/search/instantFilters';
import { loadHistory } from '@/search/checkHistory';
import { existingOwnerToken } from '@/search/owner';
import { lookAlikeFor, readMyBoardRows } from '@/search/myBoardRows';
import { rememberedKeys } from '@/lib/myKeys';
import { useShareNameStore } from '@/stores/shareName';
import { useEidsStore } from 'lib';
import { simulateRoute } from '@/search/simulateRoute';
import { workerSecondsFromRate } from '@/search/speed';
import type { ChainResult } from '@/search/types';
import {
  atOnceQueue,
  earlierText,
  lookingText,
  runAtOnce,
  summaryLine,
  type AtOnceItem,
} from '@/search/lightAtOnce';
import { lightBest, type LightResult } from '@/search/lightResult';
import type { BoardRow } from '@/lib/leaderboardRank';
import {
  beats,
  earlierFromText,
  earlierRoutes,
  fastestFirst,
  key,
  nearbyChains,
  nearbyCount,
  priceEarlier,
  refine,
  REFINE_BUDGET_SECONDS,
  refineEstimateText,
  refineFit,
  refineSeconds,
  sourceLabel,
  stepDown,
  type EarlierPriced,
  type EarlierRoute,
  type FindContext,
  type Goal,
  type PriceFn,
  type Priced,
  type RefineOutcome,
  type RefineProgress,
  type RefineView,
  type StepDownStep,
} from '@/search/strongerCheck';

const props = defineProps<{
  /** Highest TE by a date: the unix second. Without it, the fastest route to the target. */
  deadline?: number;
  /** The instant answer's routes. */
  found: FoundRoutes | null;
  exactStatus: 'idle' | 'running' | 'done' | 'error' | 'waiting';
  /** Bumped each time Check exactly finishes in this visit. */
  exactDone: number;
  /** The answer above as the full simulator priced it (what the box leads with), null until then. */
  best: Priced | null;
  /** How the answer above starts its fresh ascensions (chain.ts `HandoffChoice`): priced the same way here. */
  handoff: HandoffChoice;
  /** By a date: the top instant route misses the date on the player's account. */
  topMissed: boolean;
  /** Routes the answer above has priced already, by `chain.join(',')`. */
  priced: string[];
  /** The finder's inputs for this answer (null for an answer put back from a saved one). */
  ctx: FindContext | null;
  /** A search is running: it has the cores. */
  runBusy: boolean;
  zone: string;
  /** Inside the Stronger check box (StrongerBox.vue): always on, no toggle of its own. */
  embedded?: boolean;
  /** The counts table's rows (InstantRoute.vue), which Light prices at once before the earlier routes. */
  atOnceRows?: AtOnceItem[];
}>();

const store = useChainSearchStore();
const initialState = useInitialStateStore();
const stronger = useStrongerStore();

/** Remembered in this browser; a convenience only, so a blocked storage just means off. */
const TOGGLE_KEY = 'aap-stronger-check';
function readOn(): boolean {
  try {
    return localStorage.getItem(TOGGLE_KEY) === '1';
  } catch {
    return false;
  }
}
const on = ref(props.embedded || readOn());
watch(on, v => {
  try {
    localStorage.setItem(TOGGLE_KEY, v ? '1' : '0');
  } catch {
    // Not remembered: it is off again next visit.
  }
  if (!v) stopAll();
});

const goal = computed<Goal>(() =>
  props.deadline ? { kind: 'date', deadline: props.deadline } : { kind: 'fastest', target: store.finalTE }
);
const currentTE = computed(() => Math.floor(store.currentTE));

function show(unix: number): string {
  return showDateTime(unix, props.zone);
}
const showMs = (t: number) => show(t / 1000);

// ------------------------------------------------------------------------------- pricing

/** Each priced route's ascensions, for "Simulate this plan". */
const legsOf = new Map<string, LegSummary[]>();
let pricedFrom = 0;
function pricer(
  pool: ChainSearchPool,
  planStart: number,
  refining: boolean,
  /** The first call's per-route progress (Light's "Your earlier routes: 3 of 6"). */
  onFirst?: (done: number, total: number) => void
): PriceFn {
  let first = true;
  return async (chains, sameShape) => {
    const onDone = first ? onFirst : undefined;
    first = false;
    // Same shape: one worker shares the prefix. Refine's routes: the ones sharing all but their last
    // moved stop go to one worker. Otherwise each its own worker.
    const opts: EvaluateOptions = sameShape
      ? { stickyDepth: -1 }
      : refining && chains[0] && chains[0].length >= 3
        ? { stickyDepth: -2 }
        : { spreadOut: true };
    const { results } = await pool.evaluate(
      chains.map(c => [...c]),
      onDone,
      { ...opts, handoff: props.handoff }
    );
    const out = new Map<string, Priced | null>(chains.map(c => [key(c), null]));
    for (const r of results) {
      if (!(r.seconds > 0)) continue;
      out.set(key(r.chain), {
        chain: [...r.chain],
        seconds: r.seconds,
        end: planStart + r.seconds,
        endTE: r.legs[r.legs.length - 1]?.endTE ?? 0,
      });
      legsOf.set(key(r.chain), r.legs);
    }
    return out;
  };
}
function simulate(p: Priced): void {
  simulateRoute(p.chain, props.deadline ? 'by-date' : 'fastest', {
    ...(pricedFrom ? { start: pricedFrom } : {}),
    ...(legsOf.get(key(p.chain)) ? { legs: legsOf.get(key(p.chain))! } : {}),
  });
}

// ------------------------------------------------------------------------------- state

const refineStatus = ref<'idle' | 'running' | 'done' | 'error'>('idle');
const refineProgress = ref<RefineProgress | null>(null);
const refineOutcome = ref<RefineOutcome | null>(null);
const refineError = ref('');
let refinePool: ChainSearchPool | null = null;
let refineGen = 0;
let refineStop = false;
const startedAt = ref(0);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
/** Worker-seconds a route as this page last measured Refine (speed.ts), for the next estimate. */
const measured = ref<number | null>(null);

// ------------------------------------------------------------------------------- a + b (automatic)

const autoStatus = ref<'idle' | 'running' | 'done' | 'error'>('idle');
const autoText = ref('');
const earlier = ref<EarlierPriced[]>([]);
const steps = ref<StepDownStep[]>([]);
const stepSkipped = ref('');
let autoPool: ChainSearchPool | null = null;
let autoGen = 0;
let autoFor: { found: FoundRoutes | null; done: number } | null = null;

/**
 * The account's board runs, as My runs counts them (search/myBoardRows.ts): the rows /mine returns for
 * this browser's code and those that look like the account's from another browser or site (its keys
 * and, for a run with another code, its names). /mine alone missed every run sent from live or the PC
 * (18 Oct 2026). None without a collector; whatever /mine gave when /all can't be read.
 */
async function fetchMyRuns(partition: string): Promise<BoardRow[]> {
  if (!store.submitUrl) return [];
  const playerId = initialState.playerId ?? '';
  const names = useShareNameStore();
  if (playerId) await names.load(playerId).catch(() => undefined);
  const entry = playerId ? useEidsStore().eids.get(playerId.trim()) : undefined;
  const hasSave = !!initialState.rawBackup;
  return readMyBoardRows({
    root: store.leaderboardUrl.replace(/\/$/, ''),
    token: existingOwnerToken(partition),
    look: mine =>
      lookAlikeFor({
        saveKey: hasSave ? store.saveAccountKey() : null,
        remembered: rememberedKeys(partition),
        mine,
        // Every name the account may be credited as from another browser (fix 20): nickname AND username, the
        // save's own name, the credit name here.
        names: [
          entry?.nickname,
          entry?.username,
          (initialState.rawBackup as { userName?: string | null } | null)?.userName,
          playerId ? names.nameFor(playerId) : '',
        ],
        viewerTE: hasSave ? store.backupTE : 0,
      }),
  }).catch(() => []);
}

/** Where the earlier routes came from ("from your board runs sent from another browser"), once gathered. */
const earlierFrom = ref('');
/** "Your earlier routes: 1 of 3, from your board runs sent from another browser". */
const withFrom = (text: string): string => (earlierFrom.value ? `${text}, ${earlierFrom.value}` : text);

async function gatherEarlier(): Promise<EarlierRoute[]> {
  const partition = await store.accountPartition().catch(() => '');
  const playerId = initialState.playerId;
  const [history, board] = await Promise.all([
    partition ? loadHistory(partition).catch(() => []) : Promise.resolve([]),
    partition ? fetchMyRuns(partition) : Promise.resolve([]),
    playerId
      ? Promise.allSettled([store.refreshSavedRuns(playerId), store.refreshSavedAnswers(playerId)])
      : Promise.resolve(),
  ]);
  const last = store.bestChain.length ? [...store.bestChain] : null;
  const dateRoute = store.deadlineResult?.routes[0];
  return earlierRoutes({
    goal: goal.value,
    currentTE: currentTE.value,
    lastSearch: last ? { chain: last, finalTE: last[last.length - 1] } : null,
    lastDate:
      dateRoute && store.deadlineResult
        ? { chain: [...dateRoute.chain], deadline: store.deadlineResult.deadline }
        : null,
    board,
    savedRuns: store.savedRuns,
    savedAnswers: store.savedAnswers,
    history,
    exclude: props.priced.map(k => k.split(',').map(Number)),
  });
}

/** The instant answer's TE by the date (its top route's), for the step-down. */
const topTE = computed(() => {
  const r = props.found?.byDate;
  return r ? Math.floor(r.legs[r.legs.length - 1].endTE) : null;
});

/** The finder's fastest routes to `target` (one per count, soonest first, three at most). */
async function findAt(target: number): Promise<number[][]> {
  const c = props.ctx;
  if (!c) return [];
  const firstLegs = c.firstLegs.filter(l => l.to <= target);
  const base = {
    startTE: c.startTE,
    start: c.start,
    firstLegs,
    deliveryScale: c.deliveryScale,
    ...(c.hours ? { hours: c.hours } : {}),
  };
  const found = await findRoutes({ ...base, table: () => null, final: target, maxAscensions: 12, expand: c.expand });
  let all: FoundRoutes = found;
  try {
    all = { ...found, ...(await c.polish(base, JSON.parse(JSON.stringify(found)) as FoundRoutes)) };
  } catch {
    // The finder's own routes stand.
  }
  return fastestFirst(atMostAscensions(all, c.maxAscensions), 3).map(r => [...r.chain]);
}

function stopAuto(): void {
  autoPool?.terminate();
  autoPool = null;
}

// ------------------------------------------------------------------------------- Light: at once first

/** Which of the store's at-once maps is this screen's. */
const goalKey = computed<'fastest' | 'date'>(() => (props.deadline ? 'date' : 'fastest'));
/** The instant answer's routes Light prices at once: the lead (Check exactly's answer) first, then the
 *  counts table's other rows, then with the player's hours on each row's other route (`alt`, HOURS FIX B:
 *  search/hoursRunnerUp.ts; about one extra route per count, and the status's total counts them). */
const atOnceItems = computed(() => atOnceQueue(props.atOnceRows ?? [], props.best?.chain ?? null));
/** What Light is doing now, while it runs ("Looking at 7 ascensions (1 of 5)"). */
const lightStep = ref('');
/** The player's earlier routes: how many, and how many priced so far (the pool's per-route count). */
const earlierTotal = ref(0);
const earlierDone = ref(0);
const lightAt = ref(0);
/** The plan start Light's routes were priced from (its pool's). */
const lightPlanStart = ref(0);
function clearAtOnce(): void {
  stronger.atOnce[goalKey.value] = {};
}
// A fresh screen: nothing priced at once yet for its answer.
clearAtOnce();

// The legs are kept (they were dropped before 15 Oct 2026): the instant answer's rows show them under their arrow.
const toPriced = (r: ChainResult, planStart: number): Priced => ({
  chain: [...r.chain],
  seconds: r.seconds,
  end: planStart + r.seconds,
  endTE: r.legs[r.legs.length - 1]?.endTE ?? 0,
  ...(r.legs.length ? { legs: r.legs } : {}),
});

/** The pool, made once per Light run and shared by the at-once routes and the earlier ones: the same
 *  workers and inputs Check exactly uses (store.collectInputs: the save, your hours, your time off). */
async function lightPool(): Promise<{ pool: ChainSearchPool; planStart: number }> {
  if (!autoPool) {
    const inputs = store.collectInputs();
    pricedFrom = inputs.planStart;
    lightPlanStart.value = inputs.planStart;
    // What Light prices under, for its board row (store `buildLightSubmission`).
    store.beginLight(inputs.planStart, inputs.currentTE);
    // At most three on Safari (search/device.ts `checkWorkers`): it reloads the tab at a much lower memory level.
    autoPool = await createChainSearchPool(inputs, { size: checkWorkers(Math.max(1, Math.min(store.workerBudget, 4))) });
  }
  return { pool: autoPool, planStart: pricedFrom };
}

/** The instant answer's routes, each fresh ascension at once (handoff 'now'), one route per worker,
 *  each line shown as it lands. Routes already priced for this answer (a run stopped by a search) are
 *  skipped. False when stopped. */
async function priceAtOnce(g: number): Promise<boolean> {
  const have = stronger.atOnce[goalKey.value];
  const all = atOnceItems.value;
  const todo = all.filter(it => !(key(it.chain) in have));
  if (!todo.length) return true;
  const { pool, planStart } = await lightPool();
  if (g !== autoGen) return false;
  const offset = all.length - todo.length;
  const which = goalKey.value;
  return runAtOnce({
    items: todo,
    price: async (chains, onEach) => {
      await pool.evaluate(chains, undefined, {
        handoff: 'now',
        workerOf: (cs, workers) => cs.map((_, i) => i % Math.max(1, workers)),
        piece: 1,
        shouldStop: () => g !== autoGen,
        onResult: (c, r) => onEach(c, r && r.seconds > 0 ? toPriced(r, planStart) : null),
      });
    },
    onResult: (c, p) => {
      if (g === autoGen) stronger.atOnce[which] = { ...stronger.atOnce[which], [key(c)]: p };
    },
    onProgress: (next, i) => {
      if (g === autoGen && next) lightStep.value = lookingText(next.count, offset + i, all.length, !!next.extra);
    },
    shouldStop: () => g !== autoGen,
    // Yield to the page between the lead and the rest, so its line paints before the next batch.
    pause: () => new Promise<void>(r => setTimeout(r, 0)),
  });
}

async function runAuto(): Promise<void> {
  const g = ++autoGen;
  stopAuto();
  earlier.value = [];
  steps.value = [];
  stepSkipped.value = '';
  earlierTotal.value = 0;
  earlierDone.value = 0;
  earlierFrom.value = '';
  autoStatus.value = 'running';
  autoText.value = "Pricing the instant answer's routes ascending at once, on your account with the full simulator…";
  try {
    // First the instant answer's routes, at once on your hours (Jordan, 14 Oct).
    if (!(await priceAtOnce(g)) || g !== autoGen) return;
    lightStep.value = 'Looking up your earlier routes';
    autoText.value = 'Looking up your earlier routes for this goal…';
    const routes = await gatherEarlier();
    if (g !== autoGen) return;
    earlierTotal.value = routes.length;
    earlierFrom.value = earlierFromText(routes);
    const wantStep = !!props.deadline && props.topMissed && topTE.value !== null;
    if (wantStep && !props.ctx)
      stepSkipped.value =
        'This answer was put back from a saved one, so a TE lower is checked after Work it out again. Check exactly already lowered the last stop until it made the date.';
    const doStep = wantStep && !!props.ctx;
    if (!routes.length && !doStep) {
      lightAt.value = Date.now();
      autoStatus.value = 'done';
      return;
    }
    const { pool, planStart } = await lightPool();
    if (g !== autoGen) return;
    const price = pricer(pool, planStart, false, (d, t) => {
      if (g !== autoGen || t !== routes.length) return;
      earlierDone.value = d;
      lightStep.value = withFrom(earlierText(d, routes.length));
    });
    if (routes.length) {
      lightStep.value = withFrom(earlierText(0, routes.length));
      autoText.value = `Pricing ${routes.length} earlier route${routes.length === 1 ? '' : 's'} of yours (${earlierFrom.value}) on your account with the full simulator…`;
      const got = await priceEarlier({ goal: goal.value, routes, currentTE: currentTE.value, price });
      if (g !== autoGen) return;
      earlierDone.value = routes.length;
      earlier.value = got;
    }
    if (doStep && props.deadline && topTE.value !== null) {
      lightStep.value = `Trying the top route one TE lower (${topTE.value - 1} TE)`;
      autoText.value = `The top route misses the date on your account: checking the instant answer's fastest route to ${topTE.value - 1} TE…`;
      const got = await stepDown({
        deadline: props.deadline,
        topTE: topTE.value,
        currentTE: currentTE.value,
        find: findAt,
        price,
        shouldStop: () => g !== autoGen,
      });
      if (g !== autoGen) return;
      steps.value = got;
    }
    lightAt.value = Date.now();
    autoStatus.value = 'done';
  } catch (err) {
    if (g !== autoGen) return;
    autoStatus.value = 'error';
    autoText.value = `The stronger check couldn't run: ${plainError(err)}`;
  } finally {
    if (g === autoGen) {
      stopAuto();
      lightStep.value = '';
    }
  }
}

// Automatically once each Check exactly finishes (or at once, with the box ticked on a checked answer), and
// never while a search is running (`runBusy`): it waits, and starts when the search ends.
watch(
  () => [on.value, props.exactStatus, props.exactDone, props.runBusy, props.found] as const,
  () => {
    if (!on.value || props.exactStatus !== 'done' || props.runBusy || !props.found) return;
    if (autoFor && autoFor.found === props.found && autoFor.done === props.exactDone) return;
    autoFor = { found: props.found, done: props.exactDone };
    void runAuto();
  },
  { immediate: true }
);
// A new answer: whatever was found for the old one goes.
watch(
  () => props.found,
  () => {
    stopAll();
    clearAtOnce();
    earlier.value = [];
    steps.value = [];
    stepSkipped.value = '';
    autoStatus.value = 'idle';
    refineOutcome.value = null;
    refineStatus.value = 'idle';
  }
);
watch(
  () => props.exactStatus,
  s => {
    if (s === 'running') {
      stopAll();
      // A new Check exactly: new on-the-hour prices, so the at-once lines are priced again after it.
      clearAtOnce();
      autoFor = null;
      autoStatus.value = 'idle';
    }
  }
);

const waitingFor = computed(() => {
  if (!props.found) return '';
  if (props.exactStatus === 'running') return 'Starts when Check exactly has finished.';
  if (props.runBusy && autoStatus.value !== 'done') return 'Waits while a search is running.';
  if (props.exactStatus !== 'done') return 'Starts once Check exactly has finished: press Check exactly above.';
  return '';
});

// ------------------------------------------------------------------------------- c. refine

/** What the box leads with now: Best now, else the answer above. */
interface Found {
  p: Priced;
  how: string;
}
const bestNow = computed<Found | null>(() => {
  const list: Found[] = [];
  for (const e of earlier.value)
    if (e.made) list.push({ p: e.made, how: `Your earlier route, from ${sourceLabel(e.route, showMs)}.` });
  for (const s of steps.value)
    if (s.made) list.push({ p: s.made, how: `The instant answer's fastest route to ${s.target} TE.` });
  if (refineOutcome.value?.improved) list.push({ p: refineOutcome.value.best, how: 'Refine, around the best route.' });
  let top: Found | null = null;
  for (const f of list) if (beats(goal.value, f.p, top?.p ?? props.best)) top = f;
  return top;
});

// For the comparison block and "Start from a different route" (stores/stronger.ts).
watch(
  bestNow,
  f => {
    const g = props.deadline ? 'date' : 'fastest';
    stronger.strongerBest[g] = f
      ? {
          chain: [...f.p.chain],
          end: f.p.end,
          endTE: f.p.endTE,
          ...(props.deadline ? { spare: props.deadline - f.p.end } : {}),
          exact: true,
        }
      : null;
  },
  { immediate: true }
);
watch(earlier, list => (stronger.earlierChains = list.filter(e => e.priced).map(e => [...e.route.chain])));
// Light's status sign in the box (StrongerBox.vue): its state, what it is looking at, how many of the
// instant answer's routes it priced at once and of your earlier routes, and its own summary line.
const lightSummary = computed(() => {
  const have = stronger.atOnce[goalKey.value];
  const prices = atOnceItems.value.map(it => have[key(it.chain)]).filter(p => p !== undefined);
  return prices.length ? summaryLine({ goal: goal.value, prices, best: props.best, show }) : '';
});
watch(
  () => {
    const have = stronger.atOnce[goalKey.value];
    const items = atOnceItems.value;
    const st = autoStatus.value;
    const earlierPriced = st === 'done' ? earlier.value.filter(e => e.priced).length : earlierDone.value;
    const total = st === 'done' ? earlier.value.length : earlierTotal.value;
    return {
      state: st,
      priced: earlierPriced,
      total,
      at: lightAt.value,
      instant: { priced: items.filter(it => have[key(it.chain)]).length, total: items.length },
      ...(st === 'running' && lightStep.value ? { step: `${lightStep.value}…` } : {}),
      ...(lightSummary.value ? { summary: lightSummary.value } : {}),
      ...(earlierFrom.value ? { from: earlierFrom.value } : {}),
    };
  },
  l => (stronger.light = l),
  { immediate: true }
);
// Light's result, to send (LightShare.vue): once Light is done, the best of the instant answer's routes at
// once, your earlier routes and, by a date, one TE lower (search/lightResult.ts). Null while it runs.
const lightResult = computed<LightResult | null>(() => {
  if (autoStatus.value !== 'done' || !lightPlanStart.value) return null;
  const have = stronger.atOnce[goalKey.value];
  const withLegs = (p: Priced | null) => {
    const legs = p ? (p.legs ?? legsOf.get(key(p.chain))) : undefined;
    return p && legs ? { ...p, legs } : p;
  };
  return lightBest({
    goal: goal.value,
    atOnce: atOnceItems.value.map(it => have[key(it.chain)] ?? null),
    earlier: earlier.value.map(e => withLegs(e.made)),
    lower: steps.value.map(s => withLegs(s.made)),
    planStart: lightPlanStart.value,
    handoffNow: props.handoff === 'now',
  });
});
watch(lightResult, r => (stronger.lightResult[goalKey.value] = r), { immediate: true });
onUnmounted(() => {
  stronger.lightResult[goalKey.value] = null;
  stronger.strongerBest[props.deadline ? 'date' : 'fastest'] = null;
  clearAtOnce();
  stronger.light = idleLight();
});

const refinePlan = computed(() => {
  const base = bestNow.value?.p ?? props.best;
  if (!base || props.exactStatus !== 'done') return null;
  const total = nearbyCount(base.chain, currentTE.value, goal.value);
  const workers = Math.max(1, store.workerBudget);
  const asc = base.chain.length;
  const fit = refineFit(total, goal.value, asc, workers, measured.value);
  const seconds = refineSeconds(fit, goal.value, asc, workers, measured.value);
  return {
    base,
    total,
    fit,
    seconds,
    workers,
    text: refineEstimateText({ goal: goal.value, total, fit, seconds, workers }),
  };
});
/** The plan the running (or last) Refine started from. */
const refinePlanAtStart = ref<NonNullable<typeof refinePlan.value> | null>(null);

const refineBlocked = computed(() => {
  if (props.runBusy) return 'Waits while a search is running.';
  if (autoStatus.value === 'running') return 'After your earlier routes are priced.';
  if (refinePlan.value && refinePlan.value.total === 0) return 'Nothing near this route to try.';
  return '';
});
const canRefine = computed(() => !!refinePlan.value && !refineBlocked.value && refineStatus.value !== 'running');

const refineView = computed<RefineView>(() => ({
  plan: refinePlan.value,
  status: refineStatus.value,
  progress: refineProgress.value,
  outcome: refineOutcome.value,
  startBase: refinePlanAtStart.value?.base ?? null,
  blocked: refineBlocked.value,
  can: canRefine.value,
  percent: progressPercent.value,
  timeLeft: timeLeftText.value,
  error: refineError.value,
}));
const progressPercent = computed(() => {
  const p = refineProgress.value;
  if (!p || !p.total) return 0;
  return Math.min(100, Math.round((p.done / p.total) * 100));
});
const timeLeftText = computed(() => {
  const p = refineProgress.value;
  const elapsed = (now.value - startedAt.value) / 1000;
  const cap = Math.max(0, REFINE_BUDGET_SECONDS - elapsed);
  let left = (refinePlanAtStart.value?.seconds ?? 0) - elapsed;
  if (p && p.done > 0) left = (elapsed / p.done) * (p.total - p.done);
  left = Math.min(left, cap);
  if (left < 60) return 'under a minute left';
  return `about ${Math.round(left / 60)} min left`;
});

async function runRefine(): Promise<void> {
  const plan = refinePlan.value;
  if (!plan || !canRefine.value) return;
  const g = ++refineGen;
  refineStop = false;
  refinePlanAtStart.value = plan;
  refineStatus.value = 'running';
  refineOutcome.value = null;
  refineError.value = '';
  refineProgress.value = { done: 0, total: 0, priced: 0, best: plan.base };
  startedAt.value = Date.now();
  now.value = Date.now();
  ticker = setInterval(() => (now.value = Date.now()), 1000);
  try {
    const items = nearbyChains(plan.base.chain, currentTE.value, goal.value, plan.fit);
    const inputs = store.collectInputs();
    pricedFrom = inputs.planStart;
    refinePool = await createChainSearchPool(inputs, { size: plan.workers });
    if (g !== refineGen) return;
    const out = await refine({
      goal: goal.value,
      base: plan.base,
      currentTE: currentTE.value,
      items,
      batch: plan.workers * (props.deadline ? 2 : 3),
      price: pricer(refinePool, inputs.planStart, true),
      shouldStop: () => refineStop || g !== refineGen || Date.now() - startedAt.value > REFINE_BUDGET_SECONDS * 1000,
      onProgress: p => {
        if (g === refineGen) refineProgress.value = p;
      },
    });
    if (g !== refineGen) return;
    refineOutcome.value = out;
    refineStatus.value = 'done';
    const elapsed = (Date.now() - startedAt.value) / 1000;
    if (out.priced >= plan.workers) measured.value = workerSecondsFromRate(elapsed / out.priced, plan.workers);
  } catch (err) {
    if (g !== refineGen) return;
    const p = refineProgress.value;
    if (refineStop && p) {
      // Stopped by the player: what was priced stands.
      refineOutcome.value = { ...p, improved: p.best !== plan.base, stopped: true };
      refineStatus.value = 'done';
    } else {
      refineStatus.value = 'error';
      refineError.value = `Refine couldn't run: ${plainError(err)}`;
    }
  } finally {
    if (g === refineGen) {
      refinePool?.terminate();
      refinePool = null;
      if (ticker) clearInterval(ticker);
      ticker = null;
      // Only the best's ascensions are worth keeping for "Simulate this plan".
      const keep = new Set([
        ...earlier.value.flatMap(e => (e.made ? [key(e.made.chain)] : [])),
        ...steps.value.flatMap(s => (s.made ? [key(s.made.chain)] : [])),
      ]);
      if (refineOutcome.value) keep.add(key(refineOutcome.value.best.chain));
      for (const k of [...legsOf.keys()]) if (!keep.has(k)) legsOf.delete(k);
    }
  }
}
function stopRefineNow(): void {
  refineStop = true;
  refinePool?.terminate();
}

// A search starting has the cores: Refine stops (what it priced stands).
watch(
  () => props.runBusy,
  busy => {
    if (busy && refineStatus.value === 'running') stopRefineNow();
    if (busy && autoStatus.value === 'running') {
      ++autoGen;
      stopAuto();
      autoFor = null;
      autoStatus.value = 'idle';
    }
  }
);

function stopAll(): void {
  ++autoGen;
  stopAuto();
  if (refineStatus.value === 'running') {
    ++refineGen;
    refinePool?.terminate();
    refinePool = null;
    refineStatus.value = 'idle';
  }
  if (ticker) clearInterval(ticker);
  ticker = null;
}
onUnmounted(stopAll);

defineExpose({ bestNow });
</script>
