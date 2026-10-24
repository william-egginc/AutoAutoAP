/**
 * The checker for an instant-answer table file someone sends us (scripts/precompute.ts --check-bin):
 * Joo's generator, a player building their own gear table. Everything here is pure; the CLI wires the
 * simulator in (it rebuilds the sampled cells) and prints what these return.
 *
 * WHAT IT CHECKS
 *  1. Structure: the header reads, the file is exactly as long as its cells, no NaN or Infinity, and
 *     no build our generator could not have made (`checkStructure`).
 *  2. Stamps: the simulator (search/simVersion.ts), the reference week, the gear stamp
 *     (search/tableGear.ts) and what the table assumes (`checkStamps`).
 *  3. Truth: cells the CHECKER picks at random (a printed seed, so a sender cannot tune the cells we
 *     will look at) plus fixed edges, rebuilt from the table's own inputs and compared field by field
 *     (`sampleCells`, `compareCell`).
 *  4. A verdict (`verdictOf`): PASS / CLOSE / FAIL / STALE.
 *  5. Still current (`currentChanges`): does the stamp still match a save, or today's maxed account?
 */
import { getBuildPhaseEndForSaleCount } from '@/lib/events';
import { epicResearchDefs } from '@/lib/epicResearch';
import { colleggtibleDefs, modifiersFromColleggtibleTiers, type Modifiers } from 'lib/collegtibles';
import { canonicalDelivered, EGG_ORDER, WEEK_HOURS, type BuildParams } from './precomputedLeg';
import type { TableHeader } from './precomputedTable';
import { colleggtibleEffects, simEpicResearch, type TableGear } from './tableGear';
import type { LoadoutSlot } from './csv';

const FIELDS = 9;

/**
 * Below this start TE the table build never tries a Tier 13 unlock: search/tableBuild.ts `buildAt`
 * passes `te < TIER_13_MIN_STARTING_TE` (search/leg.ts, 190) to runC3Variants as skipTier13Attempts,
 * so a tier-13 build there is one our generator cannot make. (Tier 13 is the 13th research tier;
 * auto/shifts/c3.ts `isTierUnlocked(…, maxTier)`.) Kept as a number here so this file stays free of
 * leg.ts and its stores; tableCheck.spec.ts pins it to the real constant.
 */
export const TIER13_MIN_TE = 190;

/**
 * How near a rebuilt cell must be to count as CLOSE: every label (sales, tier 13, the number of
 * builds) the same, waitStart and saleEnd within a second, peakELR and every delivered count within
 * one part in a million. Joo's generator with the video doubler on was off by 0.14 s and 1e-7
 * relative at worst (19 Oct, aaap-tools/notes/joo-table-check.md): close by this, never identical.
 * CLOSE is still a FAIL for shipping (a table's cells must be the page's simulator to the bit); it is
 * reported apart so a near miss reads as one.
 */
export const CLOSE_TOLERANCE = { seconds: 1, relative: 1e-6 };

/** What a table built by our generator assumes when its header does not say (scripts/precompute.ts
 *  has never had a flag for either: the planner store's defaults, stores/initialState.ts and
 *  stores/autoPlanner.ts). */
export const GENERATOR_SETTINGS = { assumeDoubleEarnings: true, deferForEarnings: false };

/**
 * The colleggtible effects the simulator reads (lib/collegtibles.ts Modifiers, as
 * modifiersFromColleggtibleTiers makes them), each with where (grep of src/engine, src/auto,
 * src/calculations for `colleggtibleModifiers.`). Every one of the nine is read today. A change in
 * one of these is a different farm; a colleggtible whose effect is not listed changes no cell.
 */
export const SIM_READ_EFFECTS: Record<keyof Modifiers, string> = {
  earnings: 'engine/compute.ts, auto/ascension.ts',
  awayEarnings: 'engine/compute.ts, auto/ascension.ts',
  ihr: 'engine/compute.ts',
  elr: 'engine/compute.ts, calculations/realisticELR.ts',
  shippingCap: 'engine/compute.ts, calculations/realisticELR.ts, auto/shifts/helpers/vehicles.ts',
  habCap: 'engine/compute.ts, calculations/realisticELR.ts, auto/shifts/helpers/habs.ts',
  vehicleCost: 'engine/apply/duration.ts, auto/shifts/helpers/vehicles.ts',
  habCost: 'engine/apply/duration.ts, auto/shifts/helpers/habs.ts',
  researchCost: 'engine/apply/duration.ts, auto/shifts/c3.ts, auto/shifts/helpers/milestones.ts',
};

/** Only the effects the simulator reads, rounded as tableGear.ts `colleggtibleEffects` rounds. */
export function readEffects(effects: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.keys(SIM_READ_EFFECTS)
      .sort()
      .map(k => [k, Number((effects[k] ?? 1).toPrecision(12))])
  );
}

/** The effects of a Modifiers object (the simulation context's `colleggtibleModifiers`). */
export function effectsOfModifiers(mods: Modifiers): Record<string, number> {
  return readEffects(mods as unknown as Record<string, number>);
}

/** Today's maxed account: every colleggtible at its top tier, every modelled epic research at max. */
export function currentMax(): { colleggtibleEffects: Record<string, number>; epicResearch: Record<string, number> } {
  const tiers = Object.fromEntries(colleggtibleDefs.map(d => [d.id, 3]));
  return {
    colleggtibleEffects: effectsOfModifiers(modifiersFromColleggtibleTiers(tiers)),
    epicResearch: simEpicResearch(Object.fromEntries(epicResearchDefs.map(d => [d.id, d.maxLevel]))),
  };
}

export interface StructureReport {
  header: TableHeader | null;
  /** The cells can be read (the header parsed and the length is right). */
  readable: boolean;
  errors: string[];
  notes: string[];
}

/** Each kind of problem once, with how often and the first few places. */
class Tally {
  private kinds = new Map<string, { n: number; at: string[] }>();
  add(kind: string, at: string): void {
    const k = this.kinds.get(kind) ?? { n: 0, at: [] };
    k.n++;
    if (k.at.length < 3) k.at.push(at);
    this.kinds.set(kind, k);
  }
  lines(): string[] {
    return [...this.kinds].map(([kind, { n, at }]) => `${kind}: ${n} (first at ${at.join('; ')}${n > 3 ? '; …' : ''})`);
  }
}

/** The header as written, and where the cells begin; null with why when it does not read. */
export function readHeader(buffer: ArrayBuffer): { header: TableHeader; bodyStart: number } | { error: string } {
  if (buffer.byteLength < 4) return { error: 'the file is shorter than its header length' };
  const len = new DataView(buffer).getUint32(0, true);
  if (!len || 4 + len > buffer.byteLength) return { error: `the header length (${len} bytes) runs past the file` };
  try {
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, len))) as TableHeader;
    if (!header || typeof header !== 'object') return { error: 'the header is not a JSON object' };
    return { header, bodyStart: Math.ceil((4 + len) / 8) * 8 };
  } catch (e) {
    return { error: `the header is not JSON (${(e as Error).message})` };
  }
}

/**
 * Structure: the header, the length, and every build against what our generator can make. The rules
 * (each from the code that makes the cells, search/tableBuild.ts and auto/shifts/c3.ts):
 *  - a slot is empty (all nine numbers 0) or a build; empty slots only after the builds; a cell has
 *    at least one build (an empty cell is routed around silently);
 *  - flags are 1-3 (sales) plus 8 for tier 13; sales go up across a cell's builds, each at most once
 *    (runC3Variants keeps one build per sale count);
 *  - tier 13 never below TIER13_MIN_TE, and only on the top sale counts: runC3Variants tries 3 sales
 *    first and, once a tier-13 attempt fails, tries it at no lower count, so a tier-13 build at N
 *    sales means one at every count above N;
 *  - waitStart is not negative; saleEnd is exactly the end of the N-th sale after the start
 *    (lib/events.ts getBuildPhaseEndForSaleCount). saleEnd before waitStart is NOT impossible: K3
 *    waits for the later of the sale and kindness's share (260 of 133,560 builds in our joo717 table);
 *  - peakELR above 0; no delivered count below the start's own (canonicalDelivered: eggs are never
 *    taken back).
 */
export function checkStructure(buffer: ArrayBuffer): StructureReport {
  const errors: string[] = [];
  const notes: string[] = [];
  const read = readHeader(buffer);
  if ('error' in read) return { header: null, readable: false, errors: [read.error], notes };
  const { header, bodyStart } = read;
  if (header.version !== 1) errors.push(`header version ${header.version} (expected 1)`);
  const int = (x: unknown) => typeof x === 'number' && Number.isInteger(x);
  if (!int(header.from) || !int(header.to) || header.from > header.to || header.from < 0)
    errors.push(`start TEs from ${header.from} to ${header.to} are not a range`);
  if (!int(header.slots) || header.slots < 1) errors.push(`slots ${header.slots} is not a positive whole number`);
  if (typeof header.referenceWeek !== 'number') errors.push('no reference week');
  if (header.fake)
    errors.push('fake rows: rows filled from the nearest real ones (--pack --fake-below), never real answers');
  if (errors.length) return { header, readable: false, errors, notes };
  const cells = (header.to - header.from + 1) * WEEK_HOURS;
  const expected = bodyStart + cells * header.slots * FIELDS * 8;
  if (buffer.byteLength !== expected) {
    errors.push(`the file is ${buffer.byteLength} bytes; ${cells} cells of ${header.slots} slots need ${expected}`);
    return { header, readable: false, errors, notes };
  }
  const body = new Float64Array(buffer, bodyStart);
  const bad = new Tally();
  const week = header.referenceWeek;
  for (let te = header.from; te <= header.to; te++) {
    const canon = canonicalDelivered(te);
    for (let h = 0; h < WEEK_HOURS; h++) {
      const start = week + h * 3600;
      const where = `TE ${te} hour ${h}`;
      let builds = 0;
      let emptySeen = false;
      let lastSales = 0;
      let tier13Seen = false;
      for (let s = 0; s < header.slots; s++) {
        const at = (((te - header.from) * WEEK_HOURS + h) * header.slots + s) * FIELDS;
        const v = body.subarray(at, at + FIELDS);
        if (v.some(x => !Number.isFinite(x))) {
          bad.add('NaN or Infinity', `${where} slot ${s}`);
          continue;
        }
        const flags = v[0];
        if (flags === 0) {
          emptySeen = true;
          if (v.some(x => x !== 0)) bad.add('an empty slot (flags 0) with numbers in it', `${where} slot ${s}`);
          continue;
        }
        const at_ = `${where} slot ${s}`;
        if (emptySeen) bad.add('a build after an empty slot', at_);
        builds++;
        const sales = flags % 8;
        const tier13 = flags >= 8;
        if (!Number.isInteger(flags) || flags < 0 || flags > 11 || sales < 1 || sales > 3) {
          bad.add('flags not 1-3 sales (+8 for tier 13)', `${at_}: ${flags}`);
          continue;
        }
        if (sales <= lastSales) bad.add('sale counts not rising across a cell', at_);
        lastSales = sales;
        if (tier13 && te < TIER13_MIN_TE) bad.add(`tier 13 on a start TE below ${TIER13_MIN_TE}`, at_);
        if (tier13Seen && !tier13) bad.add('tier 13 at a lower sale count but not at a higher one', at_);
        tier13Seen ||= tier13;
        const [, waitStart, saleEnd, peakELR] = v;
        if (waitStart < 0) bad.add('negative waitStart', `${at_}: ${waitStart}`);
        const sale = getBuildPhaseEndForSaleCount(start, sales) - start;
        if (saleEnd !== sale) bad.add('saleEnd not the end of the N-th sale', `${at_}: ${saleEnd}, expected ${sale}`);
        if (!(peakELR > 0)) bad.add('peakELR not above 0', `${at_}: ${peakELR}`);
        for (let e = 0; e < EGG_ORDER.length; e++) {
          const d = v[4 + e];
          if (d < 0) bad.add('negative delivered', `${at_} ${EGG_ORDER[e]}: ${d}`);
          else if (d < canon[e])
            bad.add("delivered below the start's own count", `${at_} ${EGG_ORDER[e]}: ${d} < ${canon[e]}`);
        }
      }
      if (!builds) bad.add('a cell with no builds', where);
    }
  }
  if (header.from >= TIER13_MIN_TE)
    notes.push(`no start TE below ${TIER13_MIN_TE}: the tier 13 rule had nothing to check`);
  errors.push(...bad.lines());
  return { header, readable: true, errors, notes };
}

export interface StampReport {
  /** Why the cells are from another simulator (verdict STALE). */
  stale: string[];
  errors: string[];
  /** What the table assumes, in words. */
  assumes: string[];
}

/**
 * The stamps: the simulator against ours (a mismatch is STALE: the cells may be right for the code
 * that made them, but not for the page's), the reference week, the gear stamp, and what it assumes.
 */
export function checkStamps(
  header: TableHeader,
  ours: { simVersion: string; referenceWeek: number },
  base?: { colleggtibleEffects: Record<string, number>; epicResearch: Record<string, number>; name: string }
): StampReport {
  const stale: string[] = [];
  const errors: string[] = [];
  const assumes: string[] = [];
  if (!header.simVersion) stale.push(`stale simulator: unstamped (this checker is ${ours.simVersion})`);
  else if (header.simVersion !== ours.simVersion)
    stale.push(`stale simulator: built with ${header.simVersion}, this checker is ${ours.simVersion}`);
  if (header.referenceWeek !== ours.referenceWeek)
    errors.push(
      `reference week ${header.referenceWeek}, expected ${ours.referenceWeek} (search/tableBuild.ts REFERENCE_WEEK)`
    );
  const g = header.gear;
  if (g) {
    errors.push(...gearStampProblems(g, header));
    assumes.push(`gear (stamp): ${gearWords(g)}`);
    assumes.push(`epic research (stamp): ${researchWords(simEpicResearch(g.epicResearch))}`);
    assumes.push(`colleggtible effects (stamp): ${effectWords(colleggtibleEffects(g.colleggtibles))}`);
  } else {
    assumes.push('gear: none stamped (a maxed reference table)');
    const er = header.epicResearch;
    const ce = header.colleggtibleEffects;
    assumes.push(
      er
        ? `epic research (stamped): ${researchWords(er)}`
        : `epic research: not stamped${base ? ` (assumed: ${base.name}'s, ${researchWords(base.epicResearch)})` : ''}`
    );
    assumes.push(
      ce
        ? `colleggtible effects (stamped): ${effectWords(ce)}`
        : `colleggtible effects: not stamped${base ? ` (assumed: ${base.name}'s, ${effectWords(base.colleggtibleEffects)})` : ''}`
    );
  }
  const st = header.settings;
  assumes.push(
    st
      ? `settings (stamped): doubler ${st.assumeDoubleEarnings ? 'on' : 'off'}, defer ${st.deferForEarnings ? 'on' : 'off'}`
      : 'settings: not stamped (assumed: doubler on, defer off)'
  );
  return { stale, errors, assumes };
}

/** A gear stamp that cannot be: missing parts, or research that disagrees with the table's own k3. */
export function gearStampProblems(g: TableGear, header: Pick<TableHeader, 'k3'>): string[] {
  const out: string[] = [];
  for (const k of ['earnings', 'deliveryBare', 'deliveryFull'] as const)
    if (!Array.isArray(g[k]) || !g[k].length) out.push(`gear stamp: no ${k} set`);
    else if (g[k].some(s => typeof s?.artifact !== 'string' || !Array.isArray(s.stones)))
      out.push(`gear stamp: ${k} has a slot that is not an artifact with stones`);
  for (const k of ['research', 'epicResearch', 'colleggtibles'] as const)
    if (!g[k] || typeof g[k] !== 'object') out.push(`gear stamp: no ${k}`);
    else if (Object.values(g[k]).some(x => !Number.isInteger(x) || x < (k === 'colleggtibles' ? -1 : 0)))
      out.push(`gear stamp: ${k} has a level that is not a whole number`);
  if (g.colleggtibles && Object.values(g.colleggtibles).some(x => x > 3))
    out.push('gear stamp: a colleggtible tier above 3 (tiers are 0-3, -1 for none)');
  // The stamp's research is the table's own waiting research (search/tableGear.ts: `research` is
  // "the table's k3 research"); every deployed gear and own table has them equal.
  if (g.research && header.k3?.research && !sameMap(g.research, header.k3.research))
    out.push("gear stamp: research is not the table's own k3 research");
  if (g.research && !header.k3) out.push('gear stamp: no k3 to check its research against');
  return out;
}

const sameMap = (a: Record<string, number>, b: Record<string, number>) => {
  const s = (r: Record<string, number>) => JSON.stringify(Object.entries(r).sort(([x], [y]) => (x < y ? -1 : 1)));
  return s(a) === s(b);
};

const gearWords = (g: TableGear) =>
  `earnings ${slotsWords(g.earnings)}; delivery (full research) ${slotsWords(g.deliveryFull)}`;
const slotsWords = (slots: LoadoutSlot[]) =>
  (slots ?? [])
    .map(s => `${s.artifact}${s.stones.length ? ` [${s.stones.map(x => x.replace(/ stone$/, '')).join(', ')}]` : ''}`)
    .join(' | ');
const researchWords = (r: Record<string, number>) => {
  const max = Object.fromEntries(epicResearchDefs.map(d => [d.id, d.maxLevel]));
  const below = Object.entries(r).filter(([id, lv]) => max[id] !== undefined && lv < max[id]);
  return below.length ? `below max: ${below.map(([id, lv]) => `${id} ${lv}/${max[id]}`).join(', ')}` : 'all at max';
};
const effectWords = (e: Record<string, number>) =>
  Object.entries(e)
    .map(([k, v]) => `${k} x${v}`)
    .join(', ');

/** A small seeded generator (mulberry32), so the cells checked can be named by a seed and repeated. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

export interface CellRef {
  te: number;
  h: number;
  /** An edge (the first and last start TE at hours 0, 83, 167), checked every time. */
  edge?: boolean;
}

/** The edges, then `n` distinct random cells from `seed` (none of them an edge). */
export function sampleCells(header: Pick<TableHeader, 'from' | 'to'>, n: number, seed: number): CellRef[] {
  const out: CellRef[] = [];
  const seen = new Set<number>();
  const key = (te: number, h: number) => te * WEEK_HOURS + h;
  for (const te of [...new Set([header.from, header.to])])
    for (const h of [0, 83, 167]) {
      seen.add(key(te, h));
      out.push({ te, h, edge: true });
    }
  const total = (header.to - header.from + 1) * WEEK_HOURS;
  const want = Math.min(n, total - seen.size);
  const next = rng(seed);
  for (let got = 0; got < want; ) {
    const te = header.from + Math.floor(next() * (header.to - header.from + 1));
    const h = Math.floor(next() * WEEK_HOURS);
    if (seen.has(key(te, h))) continue;
    seen.add(key(te, h));
    out.push({ te, h });
    got++;
  }
  return out;
}

export interface CellComparison {
  result: 'same' | 'close' | 'differ';
  /** The worst difference in words; empty when the same. */
  detail: string;
}

/** How far apart two numbers are relative to the larger (0 when equal). */
const relDiff = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));

/** One cell, the table's builds against the rebuilt ones: the same to the bit (as the generated files
 *  are compared, JSON.stringify), close by CLOSE_TOLERANCE, or different. */
export function compareCell(stored: BuildParams[], mine: BuildParams[], tol = CLOSE_TOLERANCE): CellComparison {
  if (JSON.stringify(stored) === JSON.stringify(mine)) return { result: 'same', detail: '' };
  const label = (b: BuildParams) => `${b.sales}-sale${b.tier13 ? ' tier13' : ''}`;
  if (stored.length !== mine.length)
    return { result: 'differ', detail: `${stored.length} builds in the table, ${mine.length} rebuilt` };
  let worstOut = '';
  let close = true;
  let worstScore = -1;
  const note = (score: number, text: string, ok: boolean) => {
    if (!ok) close = false;
    // The worst is the one furthest past its tolerance (a failed label beats any number).
    if (score > worstScore) {
      worstScore = score;
      worstOut = text;
    }
  };
  stored.forEach((a, i) => {
    const b = mine[i];
    if (a.sales !== b.sales || a.tier13 !== b.tier13)
      return note(Infinity, `build ${i}: ${label(a)} in the table, ${label(b)} rebuilt`, false);
    for (const f of ['waitStart', 'saleEnd'] as const) {
      const d = Math.abs(a[f] - b[f]);
      if (d) note(d / tol.seconds, `build ${i} (${label(a)}) ${f}: ${a[f]} vs ${b[f]} (${fmt(d)} s)`, d <= tol.seconds);
    }
    const r = relDiff(a.peakELR, b.peakELR);
    if (r)
      note(
        r / tol.relative,
        `build ${i} (${label(a)}) peakELR: ${a.peakELR} vs ${b.peakELR} (${fmt(r)} relative)`,
        r <= tol.relative
      );
    a.delivered.forEach((x, e) => {
      const rd = relDiff(x, b.delivered[e]);
      if (rd)
        note(
          rd / tol.relative,
          `build ${i} (${label(a)}) delivered ${EGG_ORDER[e]}: ${x} vs ${b.delivered[e]} (${fmt(rd)} relative)`,
          rd <= tol.relative
        );
    });
  });
  return { result: close ? 'close' : 'differ', detail: worstOut };
}

const fmt = (x: number) => (x >= 0.01 && x < 1e6 ? x.toPrecision(3) : x.toExponential(2));

export type Verdict = 'PASS' | 'CLOSE' | 'FAIL' | 'STALE';

/** Exit codes: 0 PASS, 1 FAIL (CLOSE too: it is not shippable), 2 STALE. */
export const EXIT_CODE: Record<Verdict, number> = { PASS: 0, CLOSE: 1, FAIL: 1, STALE: 2 };

/**
 * The verdict. FAIL for any structure or stamp error or a sampled cell that differs; STALE when the
 * only trouble is another simulator's stamp (or a save the stamp no longer matches) and the truth
 * check was skipped or ignored it; CLOSE when every cell is within CLOSE_TOLERANCE but not all the
 * same; PASS only when every sampled cell is identical to the bit. With `ignoreSim` the simulator
 * stamp is reported but does not decide: the cells do.
 */
export function verdictOf(r: {
  errors: string[];
  stale: string[];
  ignoreSim?: boolean;
  /** Counts of the rebuilt cells; absent when none were rebuilt. */
  cells?: { same: number; close: number; differ: number };
}): Verdict {
  if (r.errors.length) return 'FAIL';
  if (r.cells?.differ) return 'FAIL';
  if (r.stale.length && !(r.ignoreSim && r.cells)) return 'STALE';
  if (!r.cells) return 'FAIL';
  if (r.cells.close) return 'CLOSE';
  return 'PASS';
}

/**
 * Still current? What the simulator reads of a table's inputs against another account's (a save's,
 * or today's maxed one): the epic research it models and the colleggtible effects it reads, and for a
 * gear table the sets (search/tableGear.ts gearChanges, the page's own rule, when both stamps exist).
 * Empty when it is still current.
 */
export function currentChanges(
  table: { epicResearch: Record<string, number>; colleggtibleEffects: Record<string, number> },
  now: { epicResearch: Record<string, number>; colleggtibleEffects: Record<string, number> }
): string[] {
  const out: string[] = [];
  const a = simEpicResearch(table.epicResearch);
  const b = simEpicResearch(now.epicResearch);
  const research = Object.keys(a).filter(k => a[k] !== b[k]);
  if (research.length) out.push(`epic research: ${research.map(k => `${k} ${a[k]} -> ${b[k]}`).join(', ')}`);
  const ea = readEffects(table.colleggtibleEffects);
  const eb = readEffects(now.colleggtibleEffects);
  const effects = Object.keys(ea).filter(k => ea[k] !== eb[k]);
  if (effects.length) out.push(`colleggtible effects: ${effects.map(k => `${k} x${ea[k]} -> x${eb[k]}`).join(', ')}`);
  return out;
}

/**
 * The inventory a gear stamp implies: every artifact and stone its three sets wear, each as many times
 * as one set wears it at once (the most any one build can need). Only what the stamp shows: the
 * account may own more, which the optimizer could pick at a research level between the stamp's two.
 */
export function inventoryOfStamp(g: TableGear): { artifacts: Record<string, number>; stones: Record<string, number> } {
  const artifacts: Record<string, number> = {};
  const stones: Record<string, number> = {};
  for (const set of [g.earnings, g.deliveryBare, g.deliveryFull]) {
    const a: Record<string, number> = {};
    const s: Record<string, number> = {};
    for (const slot of set) {
      a[slot.artifact] = (a[slot.artifact] ?? 0) + 1;
      for (const st of slot.stones) s[st] = (s[st] ?? 0) + 1;
    }
    for (const [k, n] of Object.entries(a)) artifacts[k] = Math.max(artifacts[k] ?? 0, n);
    for (const [k, n] of Object.entries(s)) stones[k] = Math.max(stones[k] ?? 0, n);
  }
  return { artifacts, stones };
}
