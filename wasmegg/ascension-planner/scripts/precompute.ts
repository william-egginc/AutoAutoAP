/**
 * The precomputed-ascension table (Allan's idea, 1 Oct 2026; the evidence it holds is in the
 * precompute notes): every fresh ascension priced once, keyed by where it starts (TE), when it starts
 * (hour of the week) and where it ascends (checkpoint), so that finding the fastest route becomes a
 * lookup instead of a simulation.
 *
 * WHY ONE BUILD COVERS EVERY CHECKPOINT. An ascension in the simulator is an expensive build (the
 * C1..R1 shifts, then the 1/2/3-sale C3 variants), then a tail that is arithmetic: K3 waits for the
 * later of the sale ending and kindness's share of the goal, and C4/I2/R2/H2 wait for theirs, all at
 * the build's peak delivery rate (auto/ascension.ts `runAscension`, auto/shifts/te-wait.ts). So the
 * build is run once per start, and each checkpoint only re-runs the cheap tail.
 *
 * MODES
 *   --profile        Time the build, the variants and the tail on a few starts, and check that the
 *                    split gives exactly what the search's own `runLeg` gives.
 *   --verify         Check `tailTo` (search/precomputedLeg.ts) against the simulator on every
 *                    checkpoint from several starts and hours.
 *   --verify-continue
 *                    Check continue-current-ascension through the tail (search/leg.ts
 *                    `continueTailParams`) against the simulator's own continue, every checkpoint.
 *   --check          Print the account the table would be built on: its delivery set and score,
 *                    and its earnings set's Clothed TE bonus.
 *   --verify-table --table DIR [--corpus FILE.json]
 *                    Measure the table against the simulator: real starts at random times (any
 *                    minute, any week of a year) priced by `runLeg` and by the table; and, with
 *                    --corpus, the board's own legs (scratch tails.json rows) predicted from it.
 *   --verify-cells --table DIR [--tes TE,TE,..] [--hours H,H,..]
 *                    Rebuild a few of the table's cells with the code as it is now and compare them
 *                    with the generated files, to the bit: a cell made by an older build, or by a
 *                    simulator that has changed since, shows up as a difference.
 *   --route --table DIR --te TE [--final TE] [--start ISO] [--check] [--brute] [--scaled | --player]
 *                    The fastest route from the table (search/routeFinder.ts), overall and for each
 *                    number of ascensions. --check re-prices each with the simulator, ascension by
 *                    ascension from the real end state; --brute enumerates every route of up to 3
 *                    ascensions from the table and confirms none beats the finder. --player finds
 *                    them as the site's instant answer does for the save (its TE, eggs, farm and
 *                    delivery rate; no --te); --scaled starts at --te with the save's delivery rate.
 *                    Without --reference, --check then prices them for the account the save is.
 *                    --deadline ISO: also the highest TE by then (By a date); --check then prices
 *                    only that route.
 *   --grid-error --table DIR
 *                    How well an hour's builds are predicted from an earlier hour's with `lateBy`
 *                    (the case for a coarser grid of start hours), and which hours break it.
 *   --k3 --table DIR
 *                    Record, beside the table, the research levels and delivery set a build waits
 *                    with (DIR/k3.json): the site compares a player's peak delivery rate with the
 *                    table's at that research, with the simulator's own rate function.
 *   --table-name --backup FILE
 *                    The file name the save's own table is served under (public/precompute/NAME): a slow
 *                    hash of the player id (search/tableGear.ts), never the id.
 *   --pack --table DIR --out FILE [--fake-below TE]
 *                    Pack a generated table into the one file the site loads
 *                    (search/precomputedTable.ts), covering the start TEs finished so far.
 *                    --fake-below fills the rows down to TE from the nearest real one (marked fake),
 *                    only to try the page out before the table reaches a player's TE.
 *   --route-bin FILE --te TE [--start ISO] [--keep N] [--max-asc N]
 *                    The route finder on a packed table file, timed (what the site's worker runs).
 *   --generate --out DIR [--from TE] [--to TE] [--jobs N]
 *                    Build the table: every start TE in the range (default 100-489) at each of the
 *                    168 Pacific hours of the week, one file per start TE (DIR/te-NNN.jsonl), with
 *                    DIR/meta.json describing the account and the reference week. Re-running skips
 *                    the start TEs already finished, so an interrupted run carries on.
 *
 *   --reference      Make the save a perfect maxed account first, by adding what the alt's save is
 *                    missing (a T4L quantum metronome and T4 stones) to its owned artifacts. The
 *                    optimizer then picks the best sets as it would for anyone; --check shows them.
 */
import './node-shims';

import { markRaw } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
setActivePinia(createPinia());

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { getNextSaleEnd } from '@/lib/events';
import { resolveColleggtibleContracts } from 'lib';
import { initPlanFuture } from '@/lib/modes/planFuture';
import { useChainSearchStore } from '@/stores/chainSearch';
import { runAscensionFromC3Variant } from '@/auto/ascension';
import { pickVariant, type VariantKey, type VariantResult } from '@/stores/autoPlanner';
import {
  continueTailParams,
  continueVariantForCheck,
  CONTINUE_MAX_SECONDS,
  CONTINUE_PIN_MAX_SECONDS,
  instantDeliveryScale,
  runLeg,
} from '@/search/leg';
import { calculateArtifactModifiers } from '@/lib/artifacts';
import { computeRealisticELR } from '@/calculations/realisticELR';
import {
  bestTailTo,
  canonicalDelivered,
  sweepTails,
  rebase,
  EGG_ORDER,
  pacificHourOfWeek,
  tailTo,
  WEEK_HOURS,
  type BuildParams,
} from '@/search/precomputedLeg';
import { expandArrivals, findRoutes, firstLegOptions, nextHour, priceLeg, type Route } from '@/search/routeFinder';
import { splitByWork } from '@/search/routePool';
import { packTable, readTable, type TableHeader } from '@/search/precomputedTable';
import { gearChanges, gearStamp, gearTableName, tableName } from '@/search/tableGear';
import { buildAt, buildPeak, k3StateOf, paramsOf, PEAK_TE, REFERENCE_WEEK, startStateAt } from '@/search/tableBuild';
import { deliveryScore, slotsFromLabels } from '@/search/virtueScore';
import { describeLoadoutSlots } from '@/search/csv';
import { cteFromArtifacts } from 'lib/virtue';
import { allPossibleTiers } from 'lib/artifacts/data';
import { ei } from 'lib/proto';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import type { EngineState } from '@/engine/types';
import type { SearchInputs } from '@/search/types';

function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const has = (name: string) => process.argv.includes('--' + name);

/** Load a save the way the Auto Planner does (lib/modes/planFuture.ts), and return the inputs a
 *  search would get from it. */
/** What `--reference` adds to the owned (not equipped) virtue artifacts: [afx name, level, rarity,
 *  count]. Ids from lib/artifacts/data.json: T4L quantum metronome 24/3/3, T4 lunar 33/2, T4 tachyon
 *  1/2, T4 quantum 36/2. Generous on stones; the optimizer takes what it needs. */
const REFERENCE_ADDITIONS: [number, number, number, number][] = [
  [24, 3, 3, 1],
  [33, 2, 0, 12],
  [1, 2, 0, 12],
  [36, 2, 0, 12],
];

/** The part of a backup `--reference` touches: the owned virtue artifacts. */
interface VirtueAfxBackup {
  artifactsDb?: { virtueAfxDb?: { inventoryItems?: unknown[] } };
}

function addReferenceGear(backup: VirtueAfxBackup): void {
  const db = backup?.artifactsDb?.virtueAfxDb;
  if (!db) throw new Error('--reference: the save has no virtue artifacts to add to');
  const items = (db.inventoryItems ??= []);
  REFERENCE_ADDITIONS.forEach(([name, level, rarity, quantity], i) =>
    // An itemId far above any real one (real ids are Longs in the tens of thousands), as fastsearch's
    // --add-artifact does: owned, never equipped.
    items.push({
      itemId: 910000000 + i,
      artifact: { spec: { name, level, rarity, egg: 1000 } },
      quantity,
      serverId: '',
    })
  );
}

/**
 * --combos FILE --combo NAME: a gear combination from the board (the collector analyst's
 * analysis/gear_combos.json: the artifacts an account owns, by label, and its stone counts), put in
 * place of the save's own virtue artifacts. Only the inventory: the simulator's optimizer picks the
 * earnings set and the delivery set at every research level from it, as it does for a real account,
 * so a table built this way is that gear's table, whoever owns it.
 */
interface GearCombo {
  accounts: Record<string, { latest_gear?: boolean }>;
  earnings: string[];
  delivery: string[];
  inventory: { artifacts: string[]; stones: string };
  delivery_k_full_research?: number | null;
}

function comboFromArgs(): GearCombo | null {
  const file = arg('combos');
  const name = arg('combo');
  if (!file || !name) return null;
  const all = JSON.parse(readFileSync(file, 'utf8')) as GearCombo[];
  const found = all.filter(c => c.accounts[name]);
  const combo = found.find(c => c.accounts[name].latest_gear) ?? found[0];
  if (!combo) throw new Error(`--combo ${name}: not in ${file}`);
  return combo;
}

/** Labels ("T4L Gusset", "T4 Quantum stone") to the game's own item specs. */
const RARITY_LETTERS = ['C', 'R', 'E', 'L'];
function specOf(label: string): { name: number; level: number; rarity: number } {
  for (const tier of allPossibleTiers) {
    const t = tier as unknown as {
      afx_id: number;
      afx_level: number;
      afx_type: number;
      tier_number: number;
      family: { name: string };
      effects?: { afx_rarity: number }[];
    };
    if (t.afx_type === ei.ArtifactSpec.Type.STONE && `T${t.tier_number} ${t.family.name}` === label)
      return { name: t.afx_id, level: t.afx_level, rarity: 0 };
    for (const e of t.effects ?? [])
      if (`T${t.tier_number}${RARITY_LETTERS[e.afx_rarity]} ${t.family.name}` === label)
        return { name: t.afx_id, level: t.afx_level, rarity: e.afx_rarity };
  }
  throw new Error(`unknown artifact or stone: ${label}`);
}

function putCombo(backup: VirtueAfxBackup, combo: GearCombo): void {
  const db = backup?.artifactsDb?.virtueAfxDb;
  if (!db) throw new Error('--combo: the save has no virtue artifacts to replace');
  const items: unknown[] = [];
  let id = 920000000;
  // The CSV's inventory line leaves out some lower-tier artifacts the account was wearing (a T3L
  // Tungsten ankh on four accounts); anything worn in a recorded set is owned, so it is added.
  const owned = new Set(combo.inventory.artifacts);
  for (const worn of [...combo.earnings, ...combo.delivery]) owned.add(worn.replace(/ \[.*$/, ''));
  for (const label of owned)
    items.push({ itemId: id++, artifact: { spec: { ...specOf(label), egg: 1000 } }, quantity: 1, serverId: '' });
  for (const part of combo.inventory.stones
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)) {
    const m = /^(\d+)x (.+)$/.exec(part);
    if (!m) throw new Error(`stone count not understood: ${part}`);
    items.push({
      itemId: id++,
      artifact: { spec: { ...specOf(m[2]), egg: 1000 } },
      quantity: Number(m[1]),
      serverId: '',
    });
  }
  db.inventoryItems = items;
}

async function loadInputs(file: string): Promise<SearchInputs> {
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  if (has('reference')) addReferenceGear(backup);
  const combo = comboFromArgs();
  if (combo) putCombo(backup, combo);
  resolveColleggtibleContracts(backup);
  // --write-save FILE: the save as loaded (with --reference or --combo applied), for loading in the page.
  if (arg('write-save')) writeFileSync(arg('write-save')!, JSON.stringify(backup));
  await initPlanFuture('file', markRaw(backup));
  return useChainSearchStore().collectInputs();
}

/** Every variant's tail to `target`, and the one the app picks (seconds, key). */
export function legTo(
  state: EngineState,
  build: ReturnType<typeof buildAt>,
  start: number,
  target: number
): { seconds: number; key: VariantKey } | null {
  const fresh: Partial<Record<VariantKey, VariantResult>> = {};
  for (const v of build.variants) {
    const key = (v.attemptTier13Unlock ? `${v.saleCount}-sale-tier13` : `${v.saleCount}-sale`) as VariantKey;
    fresh[key] = runAscensionFromC3Variant(state, build.preC3, v, build.ctx, start, 'asc', target);
  }
  const keys = Object.keys(fresh) as VariantKey[];
  if (!keys.length) return null;
  const best = pickVariant(fresh);
  const key = keys.find(k => fresh[k] === best)!;
  return { seconds: best.summary.totalDurationSeconds, key };
}

async function verify(file: string): Promise<void> {
  const inputs = await loadInputs(file);
  const base = Math.floor(Date.now() / 1000);
  let checked = 0;
  let worst = 0;
  let worstAt = '';
  let endMismatch = 0;
  let pickMismatch = 0;
  for (const te of [140, 190, 250, 320, 400, 460]) {
    for (const hourOffset of [0, 29, 77, 131]) {
      const start = base + hourOffset * 3600;
      const state = startStateAt(inputs, te);
      const build = buildAt(inputs, state, start, te);
      const params = build.variants.map(v => paramsOf(build, v, start));
      for (let target = te + 1; target <= 490; target++) {
        const fresh: Partial<Record<VariantKey, VariantResult>> = {};
        build.variants.forEach((v, i) => {
          const key = (v.attemptTier13Unlock ? `${v.saleCount}-sale-tier13` : `${v.saleCount}-sale`) as VariantKey;
          const sim = runAscensionFromC3Variant(state, build.preC3, v, build.ctx, start, 'asc', target);
          fresh[key] = sim;
          const mine = tailTo(params[i], target);
          const simEnd = Object.values(sim.summary.finalTE).reduce((a, b) => a + b, 0);
          if (!mine) {
            if (simEnd >= target) worst = Infinity;
            return;
          }
          checked++;
          const d = Math.abs(mine.seconds - sim.summary.totalDurationSeconds);
          if (d > worst) {
            worst = d;
            worstAt = `TE ${te} -> ${target}, +${hourOffset} h, ${key}`;
          }
          if (mine.endTE !== simEnd) endMismatch++;
        });
        const keys = Object.keys(fresh) as VariantKey[];
        if (!keys.length) continue;
        const simBest = pickVariant(fresh).summary.totalDurationSeconds;
        const mine = bestTailTo(params, target);
        if (!mine || Math.abs(mine.seconds - simBest) > 1e-6) pickMismatch++;
      }
    }
    console.log(`  TE ${te} done (${checked} checks so far, worst ${worst.toExponential(2)} s)`);
  }
  console.log(
    `\nverified ${checked} (start, hour, checkpoint, variant) cases: worst difference ${worst.toExponential(3)} s` +
      (worstAt ? ` (${worstAt})` : '') +
      `; end-TE mismatches ${endMismatch}; best-variant mismatches ${pickMismatch}`
  );
}

async function verifyContinue(file: string): Promise<void> {
  const inputs = await loadInputs(file);
  let worst = 0;
  let n = 0;
  for (const offset of [0, 3600 * 7 + 123, 86400 * 3 + 999]) {
    const start = inputs.planStart + offset;
    const params = continueTailParams(inputs, start);
    if (!params) throw new Error('this save has no farm to continue');
    const te = Math.floor(inputs.currentTE);
    for (let target = te + 1; target <= 490; target++) {
      const sim = continueVariantForCheck(inputs, JSON.parse(JSON.stringify(inputs.baseState)), start, target, 0);
      const mine = tailTo(params, target);
      if (!sim || !mine) {
        if (!!sim !== !!mine) worst = Infinity;
        continue;
      }
      n++;
      worst = Math.max(
        worst,
        Math.abs(sim.summary.totalDurationSeconds - mine.seconds) / Math.max(1, sim.summary.totalDurationSeconds)
      );
    }
  }
  console.log(`continue: ${n} checkpoints checked, worst relative difference ${worst.toExponential(3)}`);
}

async function check(file: string): Promise<void> {
  await loadInputs(file);
  const inv = useChainSearchStore().readInventory();
  const fmt = (slots: ReturnType<typeof describeLoadoutSlots>) =>
    (slots ?? [])
      .map(sl => `${sl.artifact} [${sl.stones.map(x => x.replace(' stone', '')).join(', ')}]`)
      .join('\n    ');
  console.log('delivery set:\n    ' + fmt(describeLoadoutSlots(inv.elr)));
  console.log('delivery score: ' + JSON.stringify(inv.elr ? deliveryScore(inv.elr) : null));
  console.log('earnings set:\n    ' + fmt(describeLoadoutSlots(inv.earnings)));
  console.log(
    'Clothed TE bonus from the earnings set: ' +
      (inv.earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(inv.earnings)).toFixed(2) : 'none')
  );
}

/** The table's start TEs by default: from below where the board's players are, to the last one. */
const TABLE_FROM = 100;
const TABLE_TO = 489;

/** One start TE's 168 hours, as JSON lines: {te, h, builds}. */
function generateStartTE(inputs: SearchInputs, te: number): string {
  const lines: string[] = [];
  for (let h = 0; h < WEEK_HOURS; h++) {
    const start = REFERENCE_WEEK + h * 3600;
    const state = startStateAt(inputs, te);
    const build = buildAt(inputs, state, start, te);
    lines.push(JSON.stringify({ te, h, builds: build.variants.map(v => paramsOf(build, v, start)) }));
  }
  return lines.join('\n') + '\n';
}

/** A generator child: loads the save once, then builds whatever start TE it is handed. */
async function generateWorker(file: string, out: string): Promise<void> {
  const inputs = await loadInputs(file);
  process.send!({ ready: true });
  process.on('message', (m: { te?: number; quit?: boolean }) => {
    if (m.quit) process.exit(0);
    if (m.te === undefined) return;
    const t0 = Date.now();
    const path = `${out}/te-${String(m.te).padStart(3, '0')}.jsonl`;
    writeFileSync(path + '.tmp', generateStartTE(inputs, m.te));
    renameSync(path + '.tmp', path);
    process.send!({ done: m.te, ms: Date.now() - t0 });
  });
}

async function generate(file: string): Promise<void> {
  const out = arg('out');
  if (!out) throw new Error('--generate needs --out DIR');
  mkdirSync(out, { recursive: true });
  if (pacificHourOfWeek(REFERENCE_WEEK) !== 0) throw new Error('reference week does not start at Monday 00:00 Pacific');
  const from = Number(arg('from', String(TABLE_FROM)));
  const to = Number(arg('to', String(TABLE_TO)));
  const jobs = Math.max(1, Number(arg('jobs', '4')));

  // What the table was built on, written first so a half-built table still says what it is: for an
  // account's own table (no --reference) also its gear stamp (search/tableGear.ts), which the page
  // checks a save against before it uses the table, and the waiting research (k3.json).
  const inputs = await loadInputs(file);
  const inv = useChainSearchStore().readInventory();
  const k3 = k3Of(inputs);
  writeFileSync(`${out}/k3.json`, JSON.stringify(k3, null, 1));
  writeFileSync(
    `${out}/meta.json`,
    JSON.stringify(
      {
        version: 1,
        referenceWeek: REFERENCE_WEEK,
        reference: has('reference'),
        cteBonus: inv.earnings
          ? Number(cteFromArtifacts(equippedArtifactsToLibArtifacts(inv.earnings)).toFixed(2))
          : null,
        deliveryScore: inv.elr ? deliveryScore(inv.elr) : null,
        delivery: describeLoadoutSlots(inv.elr),
        earnings: describeLoadoutSlots(inv.earnings),
        eggOrder: EGG_ORDER,
        gear: has('reference') ? null : gearStamp(inputs, inv.earnings, k3.research),
        from,
        to,
        builtAt: new Date().toISOString(),
      },
      null,
      1
    )
  );
  void inputs;

  const todo: number[] = [];
  // From the top down: a route climbs through every TE from the player's to the target, so the
  // table is usable from the top first, and grows downward toward where players are.
  for (let te = to; te >= from; te--) {
    if (!existsSync(`${out}/te-${String(te).padStart(3, '0')}.jsonl`)) todo.push(te);
  }
  console.log(`${todo.length} start TEs to build (${to - from + 1 - todo.length} already done), ${jobs} processes`);
  if (!todo.length) return;

  const t0 = Date.now();
  let finished = 0;
  const childArgs = process.argv.slice(2).filter(a => a !== '--generate');
  await Promise.all(
    Array.from(
      { length: Math.min(jobs, todo.length) },
      () =>
        new Promise<void>((resolve, reject) => {
          const child = fork(process.argv[1], [...childArgs, '--generate-worker']);
          const next = () => {
            const te = todo.shift();
            if (te === undefined) {
              child.send({ quit: true });
              resolve();
            } else child.send({ te });
          };
          child.on('message', (m: { ready?: boolean; done?: number; ms?: number }) => {
            if (m.ready) return next();
            if (m.done !== undefined) {
              finished++;
              // Processes run side by side, so the rate is start TEs finished per minute across all of them.
              const perMinute = finished / ((Date.now() - t0) / 60000);
              const left = todo.length / perMinute;
              console.log(
                `  TE ${m.done} done in ${((m.ms ?? 0) / 60000).toFixed(1)} min; ${finished} finished, ${todo.length} queued, about ${left.toFixed(0)} min left`
              );
              next();
            }
          });
          child.on('exit', code =>
            code ? reject(new Error(`a generator process exited with code ${code}`)) : resolve()
          );
        })
    )
  );
  console.log(`done in ${((Date.now() - t0) / 3600000).toFixed(2)} h`);
}

/** A generated table read back: (start TE, Pacific hour) -> builds. */
/** A generated table's meta.json (written by `generate`). */
interface TableMeta {
  referenceWeek: number;
  cteBonus: number;
  deliveryScore: { score: number } | null;
  from: number;
  to: number;
  builtAt: string;
}

function loadTable(dir: string): {
  lookup: (te: number, h: number) => BuildParams[] | null;
  meta: TableMeta;
  tes: number[];
} {
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8')) as TableMeta;
  const map = new Map<number, BuildParams[]>();
  const tes: number[] = [];
  for (let te = meta.from; te <= meta.to; te++) {
    const path = `${dir}/te-${String(te).padStart(3, '0')}.jsonl`;
    if (!existsSync(path)) continue;
    tes.push(te);
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line) as { te: number; h: number; builds: BuildParams[] };
      map.set(r.te * WEEK_HOURS + r.h, r.builds);
    }
  }
  return { lookup: (te, h) => map.get(te * WEEK_HOURS + h) ?? null, meta, tes };
}

/** A tiny seeded generator, so a verification run can be repeated exactly. */
function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function stats(errs: number[]): string {
  if (!errs.length) return 'none';
  const a = [...errs].sort((x, y) => x - y);
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const abs = errs.map(Math.abs).sort((x, y) => x - y);
  const qa = (p: number) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
  const pct = (x: number) => (100 * x).toFixed(2) + '%';
  return `n=${errs.length} median ${pct(q(0.5))}, |error| median ${pct(qa(0.5))}, 90th ${pct(qa(0.9))}, 99th ${pct(qa(0.99))}, max ${pct(abs[abs.length - 1])}`;
}

async function verifyTable(file: string): Promise<void> {
  const dir = arg('table');
  if (!dir) throw new Error('--verify-table needs --table DIR');
  const table = loadTable(dir);
  if (!table.tes.length) throw new Error('the table has no start TEs yet');
  const inputs = await loadInputs(file);
  const random = rng(Number(arg('seed', '7')));
  const samples = Number(arg('samples', '60'));

  // 1. Real starts: any week of a year from the reference week, any second of the hour. --sale-hours H:
  // only starts in the last H hours of a weekly sale, where a start priced late from its own hour's
  // cell (routeFinder.ts `startInSale`) should match the simulator exactly.
  const saleHours = arg('sale-hours') ? Number(arg('sale-hours')) : null;
  const errs: number[] = [];
  const hourErrs: number[] = [];
  const lateErrs: number[] = [];
  const lateGains: number[] = [];
  for (let i = 0; i < samples; i++) {
    const te = table.tes[Math.floor(random() * table.tes.length)];
    const anyTime = REFERENCE_WEEK + Math.floor(random() * 52 * 7 * 86400);
    const start = saleHours ? getNextSaleEnd(anyTime) - Math.floor(random() * saleHours * 3600) - 1 : anyTime;
    const target = Math.min(490, te + 1 + Math.floor(random() * Math.min(200, 490 - te)));
    // The site's way (`priceLeg`): the next whole hour's cell, or inside the sale this hour's cell
    // started late, whichever ends sooner. Against the simulator starting at once (what a search
    // does), measured from the same moment.
    const leg = runLeg(inputs, startStateAt(inputs, te), start, target, false, te, 2);
    const mine = priceLeg(table.lookup, te, start, canonicalDelivered(te), target);
    if (!leg || !mine) continue;
    const tableSeconds = mine.end - start;
    const real = leg.summary.totalDurationSeconds;
    errs.push((tableSeconds - real) / real);
    hourErrs.push((tableSeconds - real) / 3600);
    if (mine.start === start) {
      lateErrs.push((tableSeconds - real) / real);
      const onHour = bestTailTo(table.lookup(te, pacificHourOfWeek(nextHour(start))) ?? [], target);
      if (onHour) lateGains.push((nextHour(start) - start + onHour.seconds - tableSeconds) / 3600);
    }
  }
  console.log(
    `table (the site's way) vs simulator starting at once, random times${saleHours ? ` in the sale's last ${saleHours} h` : ''}: ` +
      stats(errs)
  );
  const h = hourErrs.map(Math.abs).sort((a, b) => a - b);
  if (h.length)
    console.log(`  in hours: median ${h[Math.floor(h.length / 2)].toFixed(2)} h, max ${h[h.length - 1].toFixed(2)} h`);
  if (lateErrs.length) {
    const g = [...lateGains].sort((a, b) => a - b);
    console.log(
      `  started late inside the sale: ${lateErrs.length} of ${errs.length}, ${stats(lateErrs)}; ` +
        `sooner than the next hour's cell by median ${(g[Math.floor(g.length / 2)] ?? 0).toFixed(2)} h, max ${(g[g.length - 1] ?? 0).toFixed(1)} h`
    );
  }

  // 2. The board's own legs, for the accounts whose gear is known.
  const corpusFile = arg('corpus');
  if (!corpusFile) return;
  const rows = JSON.parse(readFileSync(corpusFile, 'utf8')) as {
    who: string;
    start: number;
    te: number;
    target: number;
    days: number;
  }[];
  // Gear from the board (deliveryScore.score, Clothed TE bonus); the table's is 1.00 and its meta's bonus.
  const ACCOUNTS: Record<string, { score: number; bonus: number }> = {
    allan: { score: 1.0, bonus: 128.71 },
    Williamthe5thc: { score: 0.9661, bonus: 128.71 },
    Halceyx: { score: 0.9952, bonus: 127.93 },
    Willsalt: { score: 0.9577, bonus: 126.38 },
  };
  const tableBonus = table.meta.cteBonus as number;
  // --as NAME: the loaded save is that account's real one (run without --reference). Its exact rate
  // correction comes from its own inventory: the best set it can wear at the research a build waits
  // with (k3.json), as the site works it out for a player. Without --as there is no exact line: the
  // board only has the sets accounts wore at today's research, which lose ~22% to the best set at
  // the waiting research (allan, the table's own account, came out x0.78), so they would mislead.
  const k3 = existsSync(`${dir}/k3.json`)
    ? (JSON.parse(readFileSync(`${dir}/k3.json`, 'utf8')) as NonNullable<TableHeader['k3']>)
    : null;
  const asWho = arg('as');
  const ownScale = (): number | null => (k3 && inputs.context.rawBackup ? instantDeliveryScale(inputs, k3) : null);
  for (const [who, acct] of Object.entries(ACCOUNTS)) {
    if (asWho && who !== asWho) continue;
    const plain: number[] = [];
    const corrected: number[] = [];
    const exact: number[] = [];
    const exactSameRow: number[] = [];
    // The site's way, by the start TE's band: below full research the gear shows, from ~300 it should not.
    const bands = [120, 200, 300, 490];
    const byBand: number[][] = bands.slice(1).map(() => []);
    const scale = asWho ? ownScale() : null;
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.who !== who || !table.lookup(r.te, 0)) continue;
      const key = `${r.start}|${r.te}|${r.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const at = nextHour(r.start);
      const hour = pacificHourOfWeek(at);
      const wait = at - r.start;
      const real = r.days * 86400;
      const p = bestTailTo(table.lookup(r.te, hour) ?? [], r.target);
      if (p) plain.push((p.seconds + wait - real) / real);
      // Corrected: the build from the row with the player's earning power, the waits at their rate.
      const row = Math.round(r.te + acct.bonus - tableBonus);
      const builds = (table.lookup(row, hour) ?? []).map(b => ({ ...b, peakELR: b.peakELR * acct.score }));
      const c = builds.length ? bestTailTo(builds, r.target) : null;
      if (c) corrected.push((c.seconds + wait - real) / real);
      if (scale !== null) {
        const xb = (table.lookup(row, hour) ?? []).map(b => ({ ...b, peakELR: b.peakELR * scale }));
        const x = xb.length ? bestTailTo(xb, r.target) : null;
        if (x) exact.push((x.seconds + wait - real) / real);
        const sb = (table.lookup(r.te, hour) ?? []).map(b => ({ ...b, peakELR: b.peakELR * scale }));
        const y = sb.length ? bestTailTo(sb, r.target) : null;
        if (y) {
          exactSameRow.push((y.seconds + wait - real) / real);
          const b = bands.findIndex((lo, i) => i < bands.length - 1 && r.te >= lo && r.te < bands[i + 1]);
          if (b >= 0) byBand[b].push((y.seconds + wait - real) / real);
        }
      }
    }
    console.log(`${who}: as the table's account ${stats(plain)}`);
    console.log(`${' '.repeat(who.length)}  corrected for gear  ${stats(corrected)}`);
    if (scale !== null) console.log(`${' '.repeat(who.length)}  exact rate (x${scale.toFixed(4)}) ${stats(exact)}`);
    if (scale !== null) console.log(`${' '.repeat(who.length)}  exact rate, own TE row ${stats(exactSameRow)}`);
    if (scale !== null)
      byBand.forEach(
        (errs, b) =>
          errs.length &&
          console.log(`${' '.repeat(who.length)}    start TE ${bands[b]}-${bands[b + 1] - 1}: ${stats(errs)}`)
      );
  }
}

async function verifyCells(file: string): Promise<void> {
  const dir = arg('table');
  if (!dir) throw new Error('--verify-cells needs --table DIR');
  const table = loadTable(dir);
  const meta = table.meta as TableMeta & { reference?: boolean };
  if (!table.tes.length) throw new Error('the table has no start TEs yet');
  if (meta.referenceWeek !== REFERENCE_WEEK) throw new Error('the table was built on another reference week');
  if (!!meta.reference !== has('reference'))
    throw new Error('pass --reference exactly when the table was built with it');
  const list = (s: string) => s.split(',').map(Number);
  // By default the lowest and highest start TEs and three between them, at three hours of the week.
  const spread = [0, 0.25, 0.5, 0.75, 1].map(f => table.tes[Math.round(f * (table.tes.length - 1))]);
  const tes = arg('tes') ? list(arg('tes')!) : [...new Set(spread)];
  const hours = list(arg('hours', '0,83,167')!);
  const inputs = await loadInputs(file);
  let same = 0;
  const differ: string[] = [];
  for (const te of tes) {
    for (const h of hours) {
      const stored = table.lookup(te, h);
      if (!stored) {
        differ.push(`TE ${te} hour ${h}: not in the table`);
        continue;
      }
      const start = REFERENCE_WEEK + h * 3600;
      const build = buildAt(inputs, startStateAt(inputs, te), start, te);
      // The files hold JSON.stringify of these, so equal strings mean equal to the bit.
      if (JSON.stringify(build.variants.map(v => paramsOf(build, v, start))) === JSON.stringify(stored)) same++;
      else differ.push(`TE ${te} hour ${h}`);
    }
  }
  console.log(
    `${same} of ${same + differ.length} cells rebuilt identically` +
      (differ.length ? `; different: ${differ.join(', ')}` : '')
  );
}

function gridError(): void {
  const dir = arg('table');
  if (!dir) throw new Error('--grid-error needs --table DIR');
  const table = loadTable(dir);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const k of [1, 2, 3, 4, 6, 8, 12]) {
    const errs: number[] = [];
    const hours: number[] = [];
    const badAt = new Map<number, number>();
    for (const te of table.tes) {
      for (let h = 0; h < WEEK_HOURS; h++) {
        const real = table.lookup(te, h);
        const from = table.lookup(te, (h - k + WEEK_HOURS) % WEEK_HOURS);
        if (!real || !from) continue;
        for (const target of [te + 5, te + 25, te + 60, te + 120]) {
          if (target > 490) continue;
          const a = bestTailTo(real, target, 0);
          const p = bestTailTo(from, target, k * 3600);
          if (!a || !p) continue;
          const e = (p.seconds - a.seconds) / a.seconds;
          errs.push(e);
          hours.push((p.seconds - a.seconds) / 3600);
          if (Math.abs(p.seconds - a.seconds) > 3600) badAt.set(h, (badAt.get(h) ?? 0) + 1);
        }
      }
    }
    const abs = hours.map(Math.abs).sort((x, y) => x - y);
    const q = (x: number) => abs[Math.min(abs.length - 1, Math.floor(x * abs.length))];
    const worstHours = [...badAt.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([h, n]) => `${days[Math.floor(h / 24)]} ${String(h % 24).padStart(2, '0')}:00 (${n})`);
    console.log(
      `every ${k} h: ${stats(errs)} | in hours: median ${q(0.5).toFixed(2)}, 99th ${q(0.99).toFixed(2)}, max ${abs[abs.length - 1].toFixed(1)}` +
        ` | off by over an hour in ${((100 * abs.filter(x => x > 1).length) / abs.length).toFixed(1)}%` +
        (worstHours.length ? `, mostly from ${worstHours.join(', ')}` : '')
    );
  }
}

/** The research a build waits with, and the delivery set it waits in, for this account: from a start
 *  in the upper middle at the reference week's first hour, where research is the build's full
 *  complement, which is what every later ascension waits with. */
function k3Of(inputs: SearchInputs): { research: Record<string, number>; delivery: EngineState['artifactLoadout'] } {
  const te = 400;
  const start = REFERENCE_WEEK;
  const build = buildAt(inputs, startStateAt(inputs, te), start, te);
  const { k3 } = k3StateOf(build, build.variants[0]);
  return { research: k3.researchLevels as Record<string, number>, delivery: k3.artifactLoadout };
}

async function recordK3(file: string): Promise<void> {
  const dir = arg('table');
  if (!dir) throw new Error('--k3 needs --table DIR');
  const inputs = await loadInputs(file);
  const out = k3Of(inputs);
  writeFileSync(`${dir}/k3.json`, JSON.stringify(out, null, 1));
  const peak = computeRealisticELR(
    out.research,
    calculateArtifactModifiers(out.delivery),
    inputs.context.epicResearchLevels,
    inputs.context.colleggtibleModifiers
  ).effectiveRate;
  console.log(
    `k3.json written: ${Object.keys(out.research).length} research levels, peak ${((peak * 3600) / 1e15).toFixed(2)} q/hr with ${out.delivery.length} artifacts`
  );
}

async function routeBin(): Promise<void> {
  const buf = readFileSync(arg('route-bin')!);
  const table = readTable(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const te = Number(arg('te'));
  const start = arg('start') ? Math.floor(Date.parse(arg('start')!) / 1000) : Math.floor(Date.now() / 1000);
  const t0 = performance.now();
  const stats = { expanded: 0, sweeps: 0, cached: 0 };
  // --split N: each step in N runs, as the page's worker pool splits it, merged in order.
  const split = Number(arg('split', '1'));
  const caches: Map<string, ReturnType<typeof sweepTails>>[] = [];
  const { best, byAscensions } = await findRoutes({
    table: table.lookup,
    startTE: te,
    start,
    final: 490,
    maxAscensions: Number(arg('max-asc', '10')),
    ...(arg('keep') ? { keep: Number(arg('keep')) } : {}),
    stats,
    ...(split > 1
      ? {
          // One cache per run, as each worker keeps one.
          expand: (items, st) =>
            splitByWork(items, st.top, split).flatMap((chunk, w) =>
              expandArrivals(table.lookup, st, chunk, stats, (caches[w] ??= new Map()))
            ),
        }
      : {}),
  });
  console.log(`arrivals expanded ${stats.expanded}, sweeps ${stats.sweeps}, reused ${stats.cached}`);
  console.log(
    `${(performance.now() - t0).toFixed(0)} ms; fastest ${best ? (best.seconds / 86400).toFixed(3) + ' d ' + best.chain.join(' ') : 'none'}`
  );
  byAscensions.forEach((r, k) => r && console.log(`  ${k}: ${(r.seconds / 86400).toFixed(3)} d ${r.chain.join(' ')}`));
}

function pack(): void {
  const dir = arg('table');
  const out = arg('out');
  if (!dir || !out) throw new Error('--pack needs --table DIR and --out FILE');
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8'));
  const cells: { te: number; h: number; builds: BuildParams[] }[] = [];
  const tes: number[] = [];
  for (let te = meta.from; te <= meta.to; te++) {
    const path = `${dir}/te-${String(te).padStart(3, '0')}.jsonl`;
    if (!existsSync(path)) continue;
    tes.push(te);
    for (const line of readFileSync(path, 'utf8').split('\n')) if (line) cells.push(JSON.parse(line));
  }
  if (!tes.length) throw new Error('nothing generated yet in ' + dir);
  // Only a contiguous run of start TEs is useful to a route (it climbs through every TE), so pack the
  // longest one ending at the top of what exists.
  let from = tes[tes.length - 1];
  while (tes.includes(from - 1)) from--;
  const fakeBelow = arg('fake-below') ? Number(arg('fake-below')) : null;
  if (fakeBelow !== null && fakeBelow < from) {
    // Copies of the lowest real row, moved onto each lower TE's canonical counts. Not real numbers.
    const src = cells.filter(c => c.te === from);
    for (let te = fakeBelow; te < from; te++) {
      for (const c of src) {
        cells.push({ te, h: c.h, builds: c.builds.map(b => rebase(b, from, canonicalDelivered(te))) });
      }
    }
    from = fakeBelow;
  }
  const peakCell = cells.find(c => c.te === PEAK_TE && c.h === 0);
  const bytes = packTable(
    {
      version: 1,
      referenceWeek: meta.referenceWeek,
      cteBonus: meta.cteBonus,
      deliveryScore: meta.deliveryScore?.score ?? 1,
      from,
      to: tes[tes.length - 1],
      builtAt: meta.builtAt,
      ...(fakeBelow !== null ? { fake: true } : {}),
      ...(meta.gear ? { gear: meta.gear } : {}),
      ...(existsSync(`${dir}/k3.json`)
        ? {
            k3: {
              ...JSON.parse(readFileSync(`${dir}/k3.json`, 'utf8')),
              // The table's own peak where the page measures a player's (search/tableBuild.ts).
              ...(peakCell?.builds.length ? { peak: Math.max(...peakCell.builds.map(b => b.peakELR)) } : {}),
            },
          }
        : {}),
    },
    cells
  );
  mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
  writeFileSync(out, bytes);
  console.log(
    `packed start TEs ${from}-${tes[tes.length - 1]} (${cells.length} cells) into ${out}: ${(bytes.length / 1e6).toFixed(1)} MB`
  );
}

async function route(file: string): Promise<void> {
  const dir = arg('table');
  if (!dir) throw new Error('--route needs --table DIR');
  const table = loadTable(dir);
  const final = Number(arg('final', '490'));
  const startArg = arg('start');
  // --player: the instant answer as the page works it out for the loaded save (InstantRoute.vue): from
  // the save's own TE, eggs and farm (continue current ascension by the rule), at its own delivery
  // rate. --scaled: a canonical start at --te, at the save's delivery rate (a real account's gear,
  // tried above its own TE). Without --reference, --check then prices the routes for the account the
  // save really is, so the difference is what the instant answer gets wrong for that player.
  const player = has('player');
  const inputs = player || has('scaled') || has('check') || arg('debug-chain') ? await loadInputs(file) : null;
  const te = player ? Math.floor(inputs!.currentTE) : Number(arg('te'));
  const start = startArg
    ? Math.floor(Date.parse(startArg) / 1000)
    : player
      ? inputs!.planStart
      : Math.floor(Date.now() / 1000);
  let deliveryScale = 1;
  if (player || has('scaled')) {
    if (!existsSync(`${dir}/k3.json`)) throw new Error('--player and --scaled need DIR/k3.json (--k3)');
    deliveryScale = instantDeliveryScale(inputs!, JSON.parse(readFileSync(`${dir}/k3.json`, 'utf8')));
    // --measured-k: the player's own build's peak against the table's cell at the same start (search/
    // tableBuild.ts buildPeak), as the page measures it, instead of the best set at the table's research.
    if (has('measured-k')) {
      const cell = table.lookup(PEAK_TE, 0);
      if (!cell?.length) throw new Error(`--measured-k needs the table's TE ${PEAK_TE} row`);
      const before = deliveryScale;
      deliveryScale = buildPeak(inputs!) / Math.max(...cell.map(b => b.peakELR));
      console.log(
        `delivery scale: measured ${deliveryScale.toFixed(4)} (the best set at the table's research gives ${before.toFixed(4)})`
      );
    }
  }
  const firstLegs = player
    ? firstLegOptions({
        table: table.lookup,
        startTE: te,
        start,
        final,
        deliveryScale,
        delivered: EGG_ORDER.map(e => inputs!.baseState.eggsDelivered?.[e] || 0),
        cont: continueTailParams(inputs!, start),
        forceContinue: inputs!.forceContinue,
        pinSeconds: inputs!.continuePinSeconds ?? CONTINUE_PIN_MAX_SECONDS,
        maxContinueSeconds: inputs!.continueMaxSeconds ?? CONTINUE_MAX_SECONDS,
      })
    : undefined;
  // --deadline ISO: also the highest TE reachable by then (the By a date screen's instant answer).
  const deadline = arg('deadline') ? Math.floor(Date.parse(arg('deadline')!) / 1000) : undefined;
  const t0 = performance.now();
  const { best, byAscensions, byDate } = await findRoutes({
    table: table.lookup,
    startTE: te,
    start,
    final,
    maxAscensions: Number(arg('max-asc', '10')),
    deliveryScale,
    ...(firstLegs ? { firstLegs } : {}),
    ...(deadline !== undefined ? { deadline } : {}),
  });
  const ms = performance.now() - t0;
  const days = (r: Route) => (r.seconds / 86400).toFixed(3) + ' d';
  console.log(
    `routes from TE ${te} to ${final}, starting ${new Date(start * 1000).toISOString()}` +
      (deliveryScale !== 1 ? `, delivery x${deliveryScale.toFixed(4)}` : '') +
      `: ${ms.toFixed(0)} ms`
  );
  byAscensions.forEach(
    (r, k) => r && console.log(`  ${k} ascensions: ${days(r)}  ${r.chain.join(' ')}  (first: ${r.legs[0].label})`)
  );
  if (best) console.log(`  fastest: ${days(best)}  ${best.chain.join(' ')}`);
  const spare = (end: number) => ((deadline! - end) / 86400).toFixed(3) + ' d';
  if (deadline !== undefined)
    console.log(
      `  highest TE by ${new Date(deadline * 1000).toISOString()}: ` +
        (byDate
          ? `${byDate.legs[byDate.legs.length - 1].endTE} via ${byDate.chain.join(' ')} (${byDate.legs.length} ascensions, first: ${byDate.legs[0].label}), ${spare(byDate.end)} to spare`
          : 'none')
    );

  if (has('check')) {
    // Each route again through the simulator itself, ascension by ascension from the state the last
    // one really ended in (not the table's canonical one): starting on the hour, as the route does
    // (the table's own times, so only the canonical start differs), and starting the moment the last
    // one ends, as a search would (which can only match or beat it). With --player the first
    // ascension is the save's own: continuing the farm starts at once, as the route has it; the
    // search's way lets the continue rule choose (runLeg with continue allowed).
    const simulate = (r: Route, onTheHour: boolean): { seconds: number; endTE: number } | null => {
      let state = player ? (JSON.parse(JSON.stringify(inputs!.baseState)) as EngineState) : startStateAt(inputs!, te);
      let t = start;
      let startTE = te;
      for (const [i, target] of r.chain.entries()) {
        const first = player && i === 0;
        const continues = first && r.legs[0].label === 'continue';
        // A leg the route starts off the hour was priced late inside the sale (startInSale): at once.
        const offHour = r.legs[i].start % 3600 !== 0;
        if (onTheHour && !continues && !offHour) t = nextHour(t);
        const leg = runLeg(inputs!, state, t, target, first && (continues || !onTheHour), startTE, i + 2);
        if (!leg) return null;
        t += leg.summary.totalDurationSeconds;
        startTE = Object.values(leg.summary.finalTE).reduce((a, b) => a + b, 0);
        state = leg.nextState;
      }
      return { seconds: t - start, endTE: startTE };
    };
    if (deadline !== undefined) {
      // The date's route only: does the simulator get as high by the date?
      for (const [how, onTheHour] of [
        ['on the hour', true],
        ['starting at once', false],
      ] as const) {
        const x = byDate ? simulate(byDate, onTheHour) : null;
        if (byDate)
          console.log(
            `  check the date's route, simulator ${how}: ` +
              (x ? `ends at TE ${x.endTE}, ${spare(start + x.seconds)} to spare` : 'failed')
          );
      }
      return;
    }
    const simulated: { k: number; table: number; hourly: number | null; immediate: number | null }[] = [];
    for (const r of byAscensions) {
      if (!r) continue;
      const hourly = simulate(r, true)?.seconds ?? null;
      const immediate = simulate(r, false)?.seconds ?? null;
      simulated.push({ k: r.legs.length, table: r.seconds, hourly, immediate });
      const pct = (x: number | null) =>
        x === null ? 'failed' : `${(x / 86400).toFixed(3)} d (${(((r.seconds - x) / x) * 100).toFixed(3)}%)`;
      console.log(
        `  check ${r.legs.length} ascensions: table ${days(r)} | simulator on the hour ${pct(hourly)} | starting at once ${pct(immediate)}`
      );
    }
    // Whether the table's ranking survives: the number of ascensions it calls fastest, against the
    // one the simulator finds fastest among the same routes.
    const fastestBy = (f: (s: (typeof simulated)[number]) => number | null) =>
      simulated.reduce<(typeof simulated)[number] | null>((a, s) => {
        const v = f(s);
        return v !== null && (!a || v < f(a)!) ? s : a;
      }, null);
    const byTable = fastestBy(s => s.table);
    const bySim = fastestBy(s => s.immediate);
    if (byTable && bySim)
      console.log(
        `  fastest by the table: ${byTable.k} ascensions; by the simulator: ${bySim.k}` +
          (byTable.k === bySim.k
            ? ' (same)'
            : `; the table's pick is ${(((byTable.immediate! - bySim.immediate!) / bySim.immediate!) * 100).toFixed(3)}% slower in the simulator`)
      );
  }

  if (arg('debug-chain') && inputs) {
    // One route, ascension by ascension, three ways: the table's own pricing of the whole route (its
    // times and egg counts carried forward, as the finder sees it); the simulator from the real state
    // (with --player the save itself, its first ascension free to continue, later ones on the hour);
    // and the table's price of each leg from the simulator's own start and eggs, so the drift of each
    // leg shows apart from what the legs before it did.
    const chain = arg('debug-chain')!.trim().split(/\s+/).map(Number);
    const realEggs = (st: EngineState) => EGG_ORDER.map(e => st.eggsDelivered[e] || 0);
    let state = player ? (JSON.parse(JSON.stringify(inputs.baseState)) as EngineState) : startStateAt(inputs, te);
    let t = start;
    let cur = te;
    // The table's own route.
    let tt = start;
    let tcur = te;
    let teggs = player ? realEggs(state) : canonicalDelivered(te);
    const d = (sec: number) => (sec / 86400).toFixed(3) + ' d';
    const when = (u: number) => new Date(u * 1000).toISOString().slice(0, 16).replace('T', ' ');
    for (const [i, target] of chain.entries()) {
      const first = player && i === 0;
      // The table, its own way.
      let tLeg: { start: number; end: number; endTE: number; delivered: number[]; label: string } | null = null;
      if (first) {
        const f = firstLegs?.find(x => x.to === target);
        if (f) tLeg = { start: tt, end: f.end, endTE: f.endTE, delivered: f.delivered, label: f.label ?? 'first' };
      } else {
        const p = priceLeg(table.lookup, tcur, tt, teggs, target, deliveryScale);
        if (p) tLeg = { ...p, label: `${p.build.sales}-sale${p.build.tier13 ? '-t13' : ''}` };
      }
      // The simulator.
      const simStart = first ? t : nextHour(t);
      const leg = runLeg(inputs, state, simStart, target, first, cur, i + 2);
      const simEnd = leg ? Object.values(leg.summary.finalTE).reduce((a, b) => a + b, 0) : NaN;
      // The table's price of this leg from where the simulator really is.
      const here = first ? null : priceLeg(table.lookup, cur, t, realEggs(state), target, deliveryScale);
      const legDrift = leg && here ? (simStart + leg.summary.totalDurationSeconds - here.end) / 3600 : null;
      console.log(
        `  leg ${i + 1} ->${target}: table ${tLeg ? `${tcur}->${tLeg.endTE} ${when(tLeg.start)} +${d(tLeg.end - tLeg.start)} (${tLeg.label})` : 'none'}` +
          ` | simulator ${leg ? `${cur}->${simEnd} ${when(simStart)} +${d(leg.summary.totalDurationSeconds)} (${leg.key})` : 'none'}` +
          (legDrift !== null
            ? ` | this leg alone: simulator ${legDrift >= 0 ? '+' : ''}${legDrift.toFixed(2)} h vs the table from the same start`
            : '') +
          (leg && tLeg
            ? ` | so far: simulator ${((simStart + leg.summary.totalDurationSeconds - tLeg.end) / 3600).toFixed(1)} h behind the table`
            : '')
      );
      if (tLeg) {
        tt = tLeg.end;
        tcur = tLeg.endTE;
        teggs = tLeg.delivered;
      }
      if (!leg) break;
      t = simStart + leg.summary.totalDurationSeconds;
      cur = simEnd;
      state = leg.nextState;
    }
    console.log(`  total: table ${d(tt - start)}, simulator (on the hour) ${d(t - start)}`);
  }

  if (has('brute')) {
    // Every route of 1-3 ascensions, priced from the table directly (the finder's own model): none
    // may beat what the finder returned for its length.
    const price = (chain: number[]): number | null => {
      let t = start;
      let cur = te;
      let eggs = canonicalDelivered(te);
      for (const target of chain) {
        if (target <= cur) return null;
        // The finder's own pricing of one ascension (on the hour, or late inside the sale).
        const leg = priceLeg(table.lookup, cur, t, eggs, target, deliveryScale);
        if (!leg) return null;
        t = leg.end;
        cur = leg.endTE;
        eggs = leg.delivered;
      }
      return cur >= final ? t - start : null;
    };
    for (let k = 1; k <= Number(arg('brute-max', '3')); k++) {
      let bestBrute = Infinity;
      let bestChain: number[] = [];
      const walk = (prefix: number[], from: number) => {
        if (prefix.length === k - 1) {
          const sec = price([...prefix, final]);
          if (sec !== null && sec < bestBrute) {
            bestBrute = sec;
            bestChain = [...prefix, final];
          }
          return;
        }
        for (let c = from + 1; c < final; c++) walk([...prefix, c], c);
      };
      walk([], te);
      const found = byAscensions[k];
      console.log(
        `  brute ${k}: ${Number.isFinite(bestBrute) ? (bestBrute / 86400).toFixed(3) + ' d ' + bestChain.join(' ') : 'none'}` +
          ` | finder ${found ? days(found) + ' ' + found.chain.join(' ') : 'none'}`
      );
    }
  }
}

async function profile(file: string): Promise<void> {
  const inputs = await loadInputs(file);
  const now = Math.floor(Date.now() / 1000);
  const ms = (t: number) => (performance.now() - t).toFixed(0) + ' ms';
  for (const te of [160, 230, 300]) {
    const state = startStateAt(inputs, te);
    let t = performance.now();
    const build = buildAt(inputs, state, now, te);
    const buildMs = performance.now() - t;
    const targets: number[] = [];
    for (let b = te + 5; b <= Math.min(490, te + 160); b += 5) targets.push(b);
    t = performance.now();
    const tails = targets.map(b => legTo(state, build, now, b));
    const tailMs = (performance.now() - t) / targets.length;
    // The split must give what the search's own runLeg gives, to the second.
    let worst = 0;
    for (const [k, b] of targets.entries()) {
      if (k % 6) continue;
      const leg = runLeg(inputs, state, now, b, false, te, 2);
      const mine = tails[k];
      if (!leg || !mine) continue;
      worst = Math.max(worst, Math.abs(leg.summary.totalDurationSeconds - mine.seconds));
    }
    console.log(
      `TE ${te}: build ${buildMs.toFixed(0)} ms (${build.variants.length} variants) | tail ${tailMs.toFixed(1)} ms per checkpoint` +
        ` | runLeg agrees within ${worst.toFixed(3)} s | e.g. to ${targets[0]}: ${((tails[0]?.seconds ?? 0) / 86400).toFixed(2)} d (${tails[0]?.key})` +
        `, to ${targets[targets.length - 1]}: ${((tails[tails.length - 1]?.seconds ?? 0) / 86400).toFixed(2)} d`
    );
    void ms;
  }
}

async function main(): Promise<void> {
  if (has('pack')) return pack();
  if (has('restamp')) {
    // Work an existing own-gear table's gear stamp out again from its save (search/tableGear.ts), at
    // the table's own waiting research (DIR/k3.json), and write it into DIR/meta.json. The cells are
    // untouched; --pack again afterwards. Also prints whether a second save (--compare FILE) matches.
    const dir = arg('table');
    if (!dir) throw new Error('--restamp needs --table DIR');
    const k3 = JSON.parse(readFileSync(`${dir}/k3.json`, 'utf8')) as { research: Record<string, number> };
    const stampOf = async (file: string) => {
      const inputs = await loadInputs(file);
      return gearStamp(inputs, useChainSearchStore().readInventory().earnings, k3.research);
    };
    const stamp = await stampOf(arg('backup')!);
    const meta = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8'));
    const before = meta.gear ? gearChanges(meta.gear, stamp!) : ['(none)'];
    meta.gear = stamp;
    writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 1));
    console.log(`restamped ${dir}: changed from the old stamp: ${before.join(', ') || 'nothing'}`);
    if (arg('compare')) {
      const other = await stampOf(arg('compare')!);
      const diff = gearChanges(stamp!, other!);
      console.log(`--compare save: ${diff.length ? 'differs in ' + diff.join(', ') : 'matches'}`);
    }
    return;
  }
  if (has('gear-check') || has('gear-name')) {
    // A board gear combination (--combos FILE --combo NAME) put on the maxed base: what the optimizer
    // picks from it, against what the board recorded; and the file name its table goes under. Needs
    // the maxed table's directory (--table) for the waiting research the name is worked out at.
    const combo = comboFromArgs();
    const dir = arg('table');
    if (!combo || !dir) throw new Error('--gear-check/--gear-name need --combos FILE --combo NAME --table MAXED_DIR');
    const refK3 = JSON.parse(readFileSync(`${dir}/k3.json`, 'utf8')) as NonNullable<TableHeader['k3']>;
    const inputs = await loadInputs(arg('backup')!);
    // Before anything else touches the save (getOptimalELRSet's per-save structure cache).
    const k = instantDeliveryScale(inputs, refK3);
    const inv = useChainSearchStore().readInventory();
    const stamp = gearStamp(inputs, inv.earnings, refK3.research)!;
    if (has('gear-name')) return console.log(await gearTableName(stamp));
    if (has('debug'))
      console.log('inventory as read:', JSON.stringify({ artifacts: inv.artifacts, stones: inv.stones }));
    const label = (sl: { artifact: string; stones: string[] }) =>
      `${sl.artifact} [${sl.stones.map(x => x.replace(/ stone$/, '')).join(', ')}]`;
    const mineE = stamp.earnings.map(label).sort();
    const boardE = [...combo.earnings].sort();
    const same = JSON.stringify(mineE) === JSON.stringify(boardE);
    console.log(
      `earnings set: ${same ? 'MATCHES the board' : 'DIFFERS'}\n  picked ${mineE.join(' | ')}\n  board  ${boardE.join(' | ')}`
    );
    const art = (xs: string[]) => xs.map(x => x.replace(/ \[.*$/, '')).sort();
    const mineD = art(stamp.deliveryFull.map(label));
    const boardD = art(combo.delivery);
    console.log(
      `delivery artifacts at full research: ${JSON.stringify(mineD) === JSON.stringify(boardD) ? 'MATCH the board' : 'DIFFER'}\n  picked ${stamp.deliveryFull.map(label).join(' | ')}\n  board  ${combo.delivery.join(' | ')} (at that run's research)`
    );
    // The rate the simulator's own build waits at (its K3 set), against the maxed table's: what the
    // table's peaks will be, and what the analyst's k was measured from.
    const own = k3Of(inputs);
    const rateAt = (set: EngineState['artifactLoadout']) =>
      computeRealisticELR(
        refK3.research,
        calculateArtifactModifiers(set),
        inputs.context.epicResearchLevels,
        inputs.context.colleggtibleModifiers
      ).effectiveRate;
    const kSim = rateAt(own.delivery) / rateAt(refK3.delivery as EngineState['artifactLoadout']);
    console.log(`build's own waiting set: ${describeLoadoutSlots(own.delivery).map(label).join(' | ')}`);
    console.log(`  simulator k ${kSim.toFixed(4)}`);
    const cte = inv.earnings ? cteFromArtifacts(equippedArtifactsToLibArtifacts(inv.earnings)) : 0;
    console.log(`earnings set's Clothed TE bonus: ${cte.toFixed(2)}`);
    const boardSet = slotsFromLabels(
      combo.delivery.map(l => {
        const [artifact, rest] = l.split(' [');
        return {
          artifact,
          stones: rest
            .replace(/\]$/, '')
            .split(', ')
            .filter(Boolean)
            .map(x => x + ' stone'),
        };
      })
    ) as EngineState['artifactLoadout'];
    console.log(
      `  the board's recorded set at full research: k ${(rateAt(boardSet) / rateAt(refK3.delivery as EngineState['artifactLoadout'])).toFixed(4)}`
    );
    const kb = combo.delivery_k_full_research;
    console.log(
      `full-research delivery k: picked ${k.toFixed(4)}, board ${kb ?? 'unknown'}${kb ? ` (diff ${(k - kb).toFixed(4)})` : ''}`
    );
    return;
  }
  if (has('compare-high')) {
    // Is "the maxed table at the player's delivery rate" exact for a gear above the gear tables' top?
    // Real cells built with this gear (--combos/--combo on --backup) against the maxed table's same
    // cells scaled by the page's own k (search/leg.ts instantDeliveryScale): the peak's ratio, and per
    // cell the worst difference in the time to any checkpoint and whether the fastest build changes.
    const dir = arg('table');
    if (!dir) throw new Error('--compare-high needs --table MAXED_DIR');
    const maxed = loadTable(dir);
    const refK3 = JSON.parse(readFileSync(`${dir}/k3.json`, 'utf8')) as NonNullable<TableHeader['k3']>;
    const inputs = await loadInputs(arg('backup')!);
    const k = instantDeliveryScale(inputs, refK3);
    const tes = (arg('tes') ?? '340,380,440,489').split(',').map(Number);
    const hours = (arg('hours') ?? '0,83,128').split(',').map(Number);
    let worst = 0;
    let variantChanges = 0;
    let compared = 0;
    const ratios: number[] = [];
    for (const te of tes) {
      for (const h of hours) {
        const start = REFERENCE_WEEK + h * 3600;
        const build = buildAt(inputs, startStateAt(inputs, te), start, te);
        const mine = build.variants.map(v => paramsOf(build, v, start));
        const ref = (maxed.lookup(te, h) ?? []).map(b => ({ ...b, peakELR: b.peakELR * k }));
        if (!ref.length) continue;
        ratios.push(Math.max(...mine.map(b => b.peakELR)) / Math.max(...ref.map(b => b.peakELR / k)));
        let cellWorst = 0;
        for (let target = te + 1; target <= 490; target++) {
          const a = bestTailTo(mine, target);
          const b = bestTailTo(ref, target);
          if (!a || !b) continue;
          compared++;
          cellWorst = Math.max(cellWorst, Math.abs(a.seconds - b.seconds) / a.seconds);
          if (a.build.sales !== b.build.sales || a.build.tier13 !== b.build.tier13) variantChanges++;
        }
        worst = Math.max(worst, cellWorst);
        console.log(`  TE ${te} hour ${h}: worst ${(cellWorst * 100).toFixed(3)}%`);
      }
    }
    console.log(
      `k ${k.toFixed(4)}; own peak / maxed peak ${Math.min(...ratios).toFixed(4)}-${Math.max(...ratios).toFixed(4)}; ` +
        `${compared} checkpoints: worst ${(worst * 100).toFixed(3)}%, fastest build changed on ${variantChanges}`
    );
    return;
  }
  if (has('table-name')) {
    // The file name an account's own table is served under (search/tableGear.ts); the id stays here.
    const id = (JSON.parse(readFileSync(arg('backup')!, 'utf8')) as { eiUserId?: string }).eiUserId;
    if (!id) throw new Error('--table-name: the save has no player id');
    return console.log(await tableName(id));
  }
  if (has('grid-error')) return gridError();
  if (arg('route-bin')) return routeBin();
  const backup = arg('backup');
  if (!backup) throw new Error('--backup FILE.json is required');
  if (has('generate-worker')) return generateWorker(backup, arg('out')!);
  if (has('generate')) return generate(backup);
  if (has('verify-table')) return verifyTable(backup);
  if (has('verify-cells')) return verifyCells(backup);
  if (has('route')) return route(backup);
  if (has('profile')) return profile(backup);
  if (has('verify')) return verify(backup);
  if (has('check')) return check(backup);
  if (has('verify-continue')) return verifyContinue(backup);
  if (has('k3')) return recordK3(backup);
  throw new Error('nothing to do: pass --profile, --verify or --check');
}

main().then(
  // A generator child keeps running, serving the parent, until it is told to quit.
  () => (has('generate-worker') ? undefined : process.exit(0)),
  err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
