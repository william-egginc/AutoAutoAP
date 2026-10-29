/**
 * Instant answers and My runs facts for a save, as one JSON line. No searches: the page's instant answer
 * (as scripts/precompute.ts `instant2`) and pure reads of the save through the site's own functions.
 * Only CALLS the repo's code (bundled by build.mjs). The save is read in place; player ids are masked.
 *
 *   node dist/instant_json.mjs --mode instant --save F --tables D --goal fastest|eggday|date [--date YYYY-MM-DD] [--prefer same|off]
 *   node dist/instant_json.mjs --mode myruns  --save F --tables D [--goal fastest|eggday] [--prefer same|off] [--zone America/Denver]
 */
import '@scripts/node-shims';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
setActivePinia(createPinia());
import { resolveColleggtibleContracts } from 'lib';
import { requestSave } from '@/lib/saveLoad';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { firstAscensionFromFlags } from '@/search/firstAscension';
import { readTable, parseCompositeUrl, type Table } from '@/search/precomputedTable';
import { tableAtUrl, firstLegsOn } from '@/search/tableUrlLoad';
import { chooseInstantTable, instantFirstLegs, instantPricingOptions, instantScaleOf } from '@/search/instantCompute';
import { buildUpTailParamsV2 } from '@/search/leg';
import { liveFreshBuilds } from '@/search/liveCell';
import { findRoutes, polishFound, priceChain, type Route } from '@/search/routeFinder';
import { ownTableNames } from '@/search/tableGear';
import { MAXED_TABLE_FILE } from '@/search/tableBracket';
import { boxRouteOf, DATE_PRESETS, PREFER_DEFAULTS, PREFER_OFF, type PreferMargin } from '@/search/preferFewer';
import { eggDaySeconds, nextEggDayYear, EGG_DAY_TIME, EGG_DAY_ZONE } from '@/lib/eggDay';
import { getLocalTimestampInTimezone } from '@/lib/events';
// My runs
import { planFromEstimate } from '@/lib/followEstimate';
import {
  planEvents, tableEvents, mergeSimultaneousShifts, shiftTitle, stepLegsOf, plannedShiftsAfter,
} from '@/lib/nowPlan';
import { ascensionSteps, prestigeAfterSimulated } from '@/lib/instantSteps';
import { eggLines, farmFacts, saveEggCountsOf, saveFarmOf } from '@/lib/farmFacts';
import { afterShiftLines, afterShiftNote, eggClockLines, eggGoalLines, shiftRates } from '@/lib/nextTeEgg';
import { nextShiftCostAt, plannedShiftsCost } from '@/lib/shiftCost';
import { plannedShiftsWords, soulEggsAfterLine } from '@/lib/soulEggs';
import { siloNow, siloNowWords } from '@/lib/farmNow';
import { backupSecondsOf, saveTEByEggOf, saveTEOf } from '@/lib/saveFreshness';
import { saveOnVirtue } from '@/lib/onVirtue';
import { virtueEggOf, virtueEggName } from '@/lib/virtueEggs';
import { nextTeLine } from '@/lib/farmFacts';
import { dateAt, eventWhenText, relativeWords } from '@/lib/eventWhen';
import { compactDuration } from '@/lib/duration';
import { formatNumber } from '@/lib/format';
import { calculateClothedTEForSet } from '@/lib/artifacts/virtue';
import { getSimulationContext } from '@/engine/adapter';

const argv = process.argv;
const arg = (n: string, d?: string) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 ? argv[i + 1] : d;
};
// A player id given on stdin (--eid-stdin, never argv, so it is not in a process list). Never printed:
// every output and error goes through mask(), which also removes the exact text of the id.
let EID: string | null = null;
const mask = (s: string) => {
  let t = s.replace(/EI\d{16}/g, 'EI…');
  if (EID) t = t.split(EID).join('EI…');
  return t;
};

function readTableFile(file: string): ArrayBuffer {
  const path = /\.gz$/.test(file) || !existsSync(`${file}.gz`) ? file : `${file}.gz`;
  const raw = readFileSync(path);
  const buf = /\.gz$/.test(path) ? gunzipSync(raw) : raw;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const marginOf = (goal: 'fastest' | 'date'): PreferMargin =>
  arg('prefer', 'same') === 'off' ? PREFER_OFF : PREFER_DEFAULTS[goal];

async function setup() {
  const file = arg('save');
  const dir = arg('tables');
  if (argv.includes('--eid-stdin')) EID = readFileSync(0, 'utf8').trim();
  if ((!file && !EID) || !dir) throw new Error('needs --save FILE (or --eid-stdin) and --tables DIR');
  let backup;
  if (EID) {
    // The site's own save load (lib/saveLoad.ts requestSave, as lib/modes/fetchBackup.ts): nothing is stored.
    backup = (await requestSave(EID)).backup;
  } else {
    backup = JSON.parse(readFileSync(file!, 'utf8'));
  }
  resolveColleggtibleContracts(backup);
  await initPlanFuture('file', markRaw(backup));
  if (arg('zone')) useAutoPlannerStore().timezone = arg('zone')!;
  const store = useChainSearchStore();
  store.setFirstAscension(firstAscensionFromFlags(undefined, () => false));
  store.continueStartRule = false;
  const inputs = store.collectInputs();
  const inv = store.readInventory();
  const te = Math.floor(inputs.currentTE);
  const start = inputs.planStart;
  const final = Number(arg('final', '490'));
  const maxAscensions = Number(arg('max-asc', '12'));
  const id = (inputs.context.rawBackup as { eiUserId?: string } | undefined)?.eiUserId;
  const files = new Map<string, Promise<Table>>();
  const fromDir = (url: string) => Promise.resolve(readTable(readTableFile(`${dir}/${url.replace(/^.*\//, '')}`), 1 << 16));
  const pageLoad = (url: string) => {
    if (!files.has(url)) files.set(url, tableAtUrl(url, fromDir));
    return files.get(url)!;
  };
  const pool = {
    header: async (url: string) => (await pageLoad(url)).header,
    firstLegs: async (req: Parameters<typeof firstLegsOn>[1] & { url: string }) => firstLegsOn(await pageLoad(req.url), req),
  };
  const base = './';
  const maxedUrl = `${base}${MAXED_TABLE_FILE}`;
  const choice = await chooseInstantTable({
    pool, maxedUrl, base,
    ownTableUrls: async () => (id ? (await ownTableNames(id)).map(n => `${base}${n}`) : []),
    inputs: () => inputs,
    earnings: () => inv.earnings,
  });
  const scale = instantScaleOf(choice, maxedUrl, () => inputs.context);
  const lookup = (await pageLoad(choice.url)).lookup;
  const mode = inputs.firstAscension ?? 'auto';
  const legs = await instantFirstLegs({
    pool, url: choice.url, header: choice.header, inputs, te, final, scale, hours: null, deferShifts: true,
    buildUpTails: async () =>
      (mode === 'auto' || mode === 'buildup') && inputs.currentFarmState && inputs.context.rawBackup
        ? buildUpTailParamsV2(inputs, inputs.planStart)
        : [],
    liveFresh: async (t, s) => liveFreshBuilds(inputs, t, s),
  });
  const optionsFor = (deadline?: number) =>
    instantPricingOptions({ te, start, firstLegs: legs!.firstLegs, scale, ...(deadline ? { deadline } : {}), hours: null, tail: legs!.tail });
  const solve = async (deadline?: number) => {
    const opts = optionsFor(deadline);
    const found = await findRoutes({ table: lookup, final, maxAscensions, ...opts });
    return { ...found, ...polishFound(lookup, opts, found) };
  };
  // Which table the site's own check picked (as precompute.ts instant2): the player's own, a gear table, the
  // maxed one moved to their gear (form G), or the maxed one as it is.
  const tableKind = choice.gearShifted ? 'shifted' : choice.url === maxedUrl ? 'maxed' : parseCompositeUrl(choice.url) ? 'gear' : 'own';
  return { store, inputs, inv, te, start, final, lookup, choice, maxedUrl, optionsFor, solve, tableKind, scale };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** The goal's answer: best, rows per count, and the route the green box leads with (Prefer fewer, as the site). */
async function answer(c: Ctx, goal: 'fastest' | 'date', deadline: number | null) {
  const f = await c.solve(goal === 'date' ? deadline! : undefined);
  const best = goal === 'date' ? f.byDate : f.best;
  const rows = goal === 'date' ? f.byDateByAscensions : f.byAscensions;
  const margin = marginOf(goal);
  const lead = boxRouteOf(goal, best, rows, margin, deadline);
  return { best, rows, lead, margin, preferred: !!lead && !!best && lead !== best };
}

const key = (r: Route | null) => (r ? r.chain.join(',') : '');
const lastTE = (r: Route) => r.legs[r.legs.length - 1].endTE;

function packRoute(r: Route, deadline: number | null) {
  return {
    route: r.chain, te: lastTE(r), reached: r.end, spare: deadline === null ? null : deadline - r.end,
    ascensions: r.legs.length,
    next: { label: r.legs[0].label, to: r.legs[0].to, start: r.legs[0].start, end: r.legs[0].end, endTE: r.legs[0].endTE },
  };
}

async function instantMode() {
  const c = await setup();
  const g = arg('goal', 'eggday');
  const year = nextEggDayYear();
  let goal: 'fastest' | 'date' = g === 'fastest' ? 'fastest' : 'date';
  let deadline: number | null = null;
  let name = 'Fastest to ' + c.final + ' TE';
  if (g === 'eggday') {
    deadline = eggDaySeconds(year);
    name = `Egg Day ${year}`;
  } else if (g === 'date') {
    const d = arg('date');
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('give the date as YYYY-MM-DD');
    deadline = getLocalTimestampInTimezone(d, EGG_DAY_TIME, EGG_DAY_ZONE);
    if (!Number.isFinite(deadline) || deadline <= Date.now() / 1000) throw new Error('that date is not in the future');
    name = `By ${d}`;
  }
  const a = await answer(c, goal, deadline);
  const shown = a.lead ?? a.best;
  const rowOf = (k: number, r: Route | null) =>
    r ? { ascensions: k, te: lastTE(r), reached: r.end, spare: deadline === null ? null : deadline - r.end, route: r.chain, chosen: key(r) === key(shown) } : null;
  const out = {
    saveTE: c.te, planStart: c.start, goalName: name, goal, deadline, final: c.final,
    prefer: arg('prefer', 'same'),
    tableKind: c.tableKind, scale: +c.scale.toFixed(4),
    best: a.best ? packRoute(a.best, deadline) : null,
    chosen: shown ? packRoute(shown, deadline) : null,
    preferred: a.preferred,
    rows: a.rows.map((r, k) => (k ? rowOf(k, r) : null)).filter(Boolean),
  };
  console.log(mask(JSON.stringify(out)));
}

async function myrunsMode() {
  const c = await setup();
  const planner = useAutoPlannerStore();
  const zone = planner.timezone;
  const initial = useInitialStateStore();
  const raw = initial.rawBackup as unknown;
  const now = Math.floor(Date.now() / 1000);
  const saveSeconds = backupSecondsOf(raw);
  const onVirtue = saveOnVirtue(raw);
  const g = arg('goal', 'eggday');
  const goal: 'fastest' | 'date' = g === 'fastest' ? 'fastest' : 'date';
  const deadline = goal === 'date' ? eggDaySeconds(nextEggDayYear()) : null;
  const a = await answer(c, goal, deadline);
  const lead = a.lead ?? a.best;
  if (!lead) throw new Error('no route for this goal');
  // The route priced again with its shifts, as My runs' estimate does (useFollowEstimate), then Right now's plan.
  const opts = c.optionsFor(deadline ?? undefined);
  const priced = priceChain(c.lookup, { ...opts, shifts: true }, lead.chain) ?? lead;
  const plan = planFromEstimate(priced, { goal, deadline }, { meta: null, pricing: { v: 1, final: c.final, options: opts } } as never, Date.now());

  const farm = saveFarmOf(raw);
  const currentEgg = onVirtue ? virtueEggOf(farm?.eggType) : null;
  const teByEgg = saveTEByEggOf(raw);
  const totalTe = teByEgg.reduce((x, y) => x + y, 0);
  const teSoFar = saveTEOf(raw);
  const equipped = c.inv.equippedNow ?? initial.artifactLoadout;
  const facts = farmFacts({
    farm: onVirtue ? farm : null, epic: initial.epicResearchLevels, colleggtibles: initial.colleggtibleModifiers, equipped,
  });
  const rates = onVirtue
    ? shiftRates({ farm, epic: initial.epicResearchLevels, colleggtibles: initial.colleggtibleModifiers, equipped, totalTe })
    : null;

  // Events: next step and next shifts (about 6), as the Right now card lists them.
  const list = planEvents(plan, now, { egg: currentEgg, te: teSoFar });
  const legsForSteps = stepLegsOf(plan).map((l, i) => ({
    ...l,
    ...(plan.tableLegs?.[i]?.shifts ? { shifts: plan.tableLegs[i].shifts } : {}),
    ...(plan.tableLegs?.[i]?.label ? { label: plan.tableLegs[i].label } : {}),
    ...(plan.tableLegs?.[i]?.peakELR !== undefined ? { peakELR: plan.tableLegs[i].peakELR } : {}),
  }));
  const steps = ascensionSteps(prestigeAfterSimulated(legsForSteps as never, t => t), null, [], []);
  const events = mergeSimultaneousShifts(list, zone);
  const shown = tableEvents(events);
  const evText = (e: (typeof events)[number]) => {
    const what =
      e.kind === 'shift' ? shiftTitle(e, virtueEggName)
      : e.kind === 'prestige' ? `Prestige at ${e.te} TE`
      : `Reach ${e.te} TE`;
    const at = e.kind === 'prestige' && e.prestigeAt ? e.prestigeAt : e.at;
    return { what, when: eventWhenText(at, now, zone), at, kind: e.kind, past: e.past, notDone: !!e.notDone, next: e.next, asc: e.asc };
  };
  const nextEv = events.find(e => e.next) ?? null;

  // Your eggs.
  const { delivered, earned } = saveEggCountsOf(raw);
  const teLeft = goal === 'fastest' && c.final > totalTe ? c.final - totalTe : null;
  const eggs = eggLines(delivered, earned, currentEgg, facts?.elr ?? null, teLeft);
  const after = onVirtue ? afterShiftLines({ eggs, delivered, totalTe, rates }) : {};
  const goalLines = onVirtue
    ? eggGoalLines({
        eggs, delivered, totalTe, rates,
        goal: goal === 'fastest'
          ? (c.final > totalTe ? { kind: 'te', teLeft: c.final - totalTe } : null)
          : { kind: 'date', endTE: plan.endTE, finish: plan.end, zone },
        now, saveSeconds,
      })
    : {};
  const clocks = onVirtue
    ? eggClockLines({ eggs, delivered, totalTe, rates, teLeft, now, saveSeconds, zone, shifts: shown.map(e => ({ kind: e.kind, egg: e.egg, at: e.at })) })
    : null;
  const shiftsDone = (raw as { virtue?: { shiftCount?: number | null } })?.virtue?.shiftCount ?? 0;
  const soulEggs = (raw as { game?: { soulEggsD?: number | null } })?.game?.soulEggsD ?? 0;
  const c1 = plannedShiftsAfter(plan, saveSeconds);
  const planned = c1
    ? { count: c1.count, cost: plannedShiftsCost(soulEggs, shiftsDone, c1.count), opening: c1.opening, ...(!plan.legs && !c1.opening ? { partial: true } : {}) }
    : null;
  const silo = facts ? siloNow({ siloSeconds: facts.siloMinutes * 60, saveSeconds, stepSeconds: facts.stepSeconds, nowSeconds: now }) : null;
  const siloW = silo ? siloNowWords(silo, saveSeconds, now, zone) : null;
  const clothed = (set: unknown) => {
    if (!set) return null;
    try {
      const ctx = getSimulationContext();
      return calculateClothedTEForSet(set as never, {
        truthEggs: totalTe,
        colleggtibleModifiers: ctx.colleggtibleModifiers,
        labUpgradeLevel: ctx.epicResearchLevels['cheaper_research'] ?? 0,
        permitLevel: (raw as { game?: { permitLevel?: number | null } }).game?.permitLevel ?? null,
      });
    } catch {
      return null;
    }
  };
  const goalLine =
    goal === 'date'
      ? `Egg Day ${nextEggDayYear()}: ${plan.endTE} TE, last TE ${dateAt(plan.end, now, zone)} (${compactDuration(deadline! - plan.end)} to spare)`
      : `Fastest to ${c.final} TE: reached ${dateAt(plan.end, now, zone)}, in ${compactDuration(plan.end - now)}`;

  const out = {
    goal, goalLine, saveTE: teSoFar, onVirtue, tableKind: c.tableKind, scale: +c.scale.toFixed(4),
    saveWhen: dateAt(saveSeconds, now, zone),
    chain: plan.chain, ascensionNow: steps.length ? 1 : 0, preferred: a.preferred,
    nextStep: nextEv ? evText(nextEv) : null,
    nextShifts: shown.filter(e => e.kind !== 'goal' || true).map(evText),
    ascensions: steps.map(s => ({
      asc: s.asc, fromTE: s.fromTE, stopTE: s.stopTE, now: s.now, prestigeAt: s.prestigeAt, reachedAt: s.reachedAt,
      prestige: s.now ? 'now' : dateAt(s.prestigeAt, now, zone, true),
      prestigeIn: s.now ? '' : relativeWords(s.prestigeAt - now),
      reached: dateAt(s.reachedAt, now, zone, true),
      reachedIn: relativeWords(s.reachedAt - now),
      shifts: s.shifts.length, wait: s.wait,
    })),
    eggs: eggs.map(e => ({
      egg: virtueEggName(e.egg), te: e.te, current: e.current, pct: Math.round(e.progress * 100),
      nextLine: after[e.egg] || nextTeLine(e, now, saveSeconds),
      clock: clocks?.next[e.egg] ?? '',
      toGoal: goalLines[e.egg] ?? '',
      toGoalClock: clocks?.goal[e.egg] ?? '',
    })),
    afterShiftNote: onVirtue && Object.keys(after).length ? afterShiftNote(totalTe, saveSeconds, now, zone) : '',
    facts: {
      shiftsDone,
      nextShiftCost: `${formatNumber(nextShiftCostAt(soulEggs, shiftsDone), 1)} soul eggs`,
      planned: planned ? plannedShiftsWords(planned) : null,
      soulEggsAfter: planned ? soulEggsAfterLine({ soulEggs, done: shiftsDone, planned }) : null,
      silos: siloW ? { value: siloW.value, note: siloW.note } : null,
      habs: facts ? `${Math.round(facts.habFull * 100)}% full` : null,
      clothed: (() => {
        const e = clothed(c.inv.earnings);
        const q = clothed(c.inv.equippedNow);
        return e != null ? `${Math.round(e)}${q != null ? ` (equipped ${Math.round(q)})` : ''} with your earnings set` : null;
      })(),
    },
  };
  console.log(mask(JSON.stringify(out)));
}

(arg('mode', 'instant') === 'myruns' ? myrunsMode() : instantMode()).then(
  () => process.exit(0),
  e => {
    // A save-load failure's message is already plain words and has no id; anything else is masked.
    console.error(mask(EID ? String(e?.message ?? 'failed') : String(e?.stack ?? e)));
    process.exit(1);
  }
);
