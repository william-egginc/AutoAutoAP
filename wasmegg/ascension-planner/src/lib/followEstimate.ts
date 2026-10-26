/**
 * A FOLLOWED ROUTE ALWAYS HAS A TIMELINE (24 Oct 2026, Jordan: "No timeline for your route on this save yet … Single
 * run ignores the hours, which is inferior"). A route the player follows that no kept result prices on this save is
 * priced on the instant answer's own data, the way the instant answer prices its routes (search/routeFinder.ts
 * `priceChain`, in a route worker: composables/useFollowEstimate.ts), and Right now shows its steps "estimated from the
 * instant answer's data (times rounded to the hour)".
 *
 * What it is priced with is what the instant answer of THIS save priced its own routes with, kept in its snapshot
 * (InstantRoute.vue `pricing`): the table it read, the player's own first ascensions (each stop), the delivery scale,
 * the plan start and the held hours, time off and no-prestige days (`instantTail`). The snapshot's key holds the save
 * and Your setup, so these are the player's now. A kept Fast, Exact or Custom result for the route still wins (exact
 * times); this is only for a route with no timeline.
 *
 * Pure: no Vue, no workers.
 */
import type { PolishOptions, Route } from '@/search/routeFinder';
import type { SnapMeta } from '@/search/instantSnapshot';
import type { NowPlan } from './nowPlan';

/** The game's highest TE: a route's last stop can't be above it. */
const MAX_TE = 490;

/** Right now's words for an estimated route (the Next step and the source line). */
export const ESTIMATE_WORDS = "estimated from the instant answer's data (times rounded to the hour)";

/** The most the pricing inputs may add to a snapshot (search/instantSnapshot.ts MAX_BYTES is 600 kB for the whole). */
export const PRICING_MAX_BYTES = 200_000;

/** What the instant answer priced its routes with, kept in its snapshot. */
export interface SnapPricing {
  v: 1;
  /** The TE its first ascensions go up to (the route finder's `final`): a stop above it can't be priced. */
  final: number;
  /** routeFinder.ts PolishOptions as the instant answer passed them (its `polishOptions`): firstLegs, start, held
   *  hours and the tail options. */
  options: PolishOptions;
}

/** The pricing inputs for a snapshot, or null when there are none or they are too big to keep. A plain copy. */
export function snapPricing(options: PolishOptions | null | undefined, final: number): SnapPricing | null {
  if (!options || !Array.isArray(options.firstLegs) || !options.firstLegs.length || !(final > 0)) return null;
  try {
    const text = JSON.stringify({ v: 1, final, options });
    if (text.length > PRICING_MAX_BYTES) return null;
    return JSON.parse(text) as SnapPricing;
  } catch {
    return null;
  }
}

/** A snapshot's `pricing` field when it is usable, else null (absent before 24 Oct 2026). */
export function readPricing(x: unknown): SnapPricing | null {
  const p = x as SnapPricing | null | undefined;
  if (!p || p.v !== 1 || !(p.final > 0) || !p.options) return null;
  const o = p.options;
  if (!Number.isFinite(o.startTE) || !Number.isFinite(o.start) || !Array.isArray(o.firstLegs) || !o.firstLegs.length) return null;
  return p;
}

/** One of this save's snapshots that could price the route. */
export interface PricingSource {
  /** The table the instant answer read (its snapshot's `tableUrl`). */
  url: string;
  pricing: SnapPricing;
  /** The table's highest TE (its header's `to`), when known. */
  tableTo: number | null;
  /** The snapshot is the selected goal's own (else another goal's of the same save and setup). */
  ownGoal: boolean;
  /** When the snapshot was saved, ms. */
  at: number;
  meta: SnapMeta | null;
}

export type PickedPricing =
  | { source: PricingSource; chain: number[] }
  /** Every source stops short of the route (its last stop above the instant answer's data). */
  | { beyond: true; chain: number[] }
  | null;

/**
 * The source to price `chain` (the stops still ahead of the save) with: the selected goal's own snapshot first, then
 * the newest of the others. One whose start TE isn't the save's is never used (another save). Null when there is no
 * source at all; `beyond` when every source stops below the route's last stop.
 */
export function pickPricing(sources: readonly PricingSource[], chain: readonly number[], currentTE: number): PickedPricing {
  if (!chain.length) return null;
  const mine = sources.filter(s => s.pricing.options.startTE === Math.floor(currentTE) && !!s.url);
  if (!mine.length) return null;
  // WHAT THE DATA COVERS (26 Oct 2026, Jordan's Fastest to 490 TE route 226 → 277 → 317 → 490 said "goes past what
  // the instant answer covers"): the record's first ascensions reach its own target (`final`), so only the FIRST stop
  // must be within it; each later ascension is a table row looked up by the TE it STARTS at, so the stops it starts
  // from (all but the last) must be within the table's rows (`tableTo`, 489 for the tables) and the last stop only
  // within the game's 490. The old test held the LAST stop to both, so every route to 490 was "beyond" a 489 table and
  // a Fastest route was "beyond" a date answer's record whose own target was lower.
  const last = chain[chain.length - 1];
  const starts = chain.slice(0, -1);
  const covers = (s: PricingSource) =>
    chain[0] <= s.pricing.final && last <= MAX_TE && (s.tableTo == null || starts.every(t => t <= s.tableTo!));
  const ok = mine.filter(covers).sort((a, b) => Number(b.ownGoal) - Number(a.ownGoal) || b.at - a.at);
  return ok.length ? { source: ok[0], chain: [...chain] } : { beyond: true, chain: [...chain] };
}

/** The estimate's key: the save, the source snapshot (its table and when it was saved) and the route. A new save or a
 *  new instant answer makes another key, so an estimate for one never shows for another. */
export function estimateKey(saveSeconds: number, source: PricingSource, chain: readonly number[]): string {
  return `${saveSeconds}|${source.at}|${source.url}|${chain.join(',')}`;
}

/** The priced route as Right now's plan: the table's times (prestige times only), `exact` false (rounded, no
 *  calendar), marked `estimated`. No runner-up: it is the player's pick. */
export function planFromEstimate(
  route: Route,
  goal: { goal: 'fastest' | 'date'; deadline: number | null },
  source: Pick<PricingSource, 'meta' | 'pricing'>,
  /** When it was priced, ms. */
  at: number
): NowPlan {
  const lastLeg = route.legs[route.legs.length - 1];
  const endTE = lastLeg?.endTE ?? route.chain[route.chain.length - 1] ?? 0;
  const deadline = goal.goal === 'date' ? goal.deadline : null;
  return {
    goal: goal.goal,
    deadline,
    chain: [...route.chain],
    end: route.end,
    endTE,
    legs: null,
    // Each leg's shifts when the estimate asked for them (RouteLeg.shifts; an estimate without them still works), and
    // its held opening, for the waits Right now marks (lib/instantSteps.ts).
    tableLegs: route.legs.map(l => ({
      from: l.from,
      to: l.to,
      endTE: l.endTE,
      start: l.start,
      end: l.end,
      label: l.label,
      ...(Array.isArray(l.shifts) && l.shifts.length ? { shifts: l.shifts.map(s => ({ at: s.at, egg: s.egg })) } : {}),
      ...(l.heldOpening ? { heldOpening: l.heldOpening } : {}),
      ...(l.wanted !== undefined ? { wanted: l.wanted } : {}),
    })),
    exact: false,
    estimated: true,
    instantTE: goal.goal === 'date' ? endTE : null,
    spareHours: deadline ? (deadline - route.end) / 3600 : null,
    runnerUpHours: null,
    runnerUp: null,
    calculatedAt: at,
    planStart: source.pricing.options.start,
    meta: source.meta,
    whatIf: null,
  };
}

// ------------------------------------------------------------------------- the pricing record

/**
 * THE PRICING RECORD (24 Oct 2026, the bug on Jordan's main account: a followed Egg Day route showed no estimate after
 * "Work it out again"). The snapshot's `pricing` is only written once the background polish and "Prestige by" are done,
 * an answer restored from before this build has none, and My runs only looked under the goal's own snapshot key. So the
 * instant answer also keeps its pricing settings here, the moment its first answer is in, per account, save and setup
 * (any goal: the settings price every route from this save), and My runs reads them by that, not by the goal's key.
 * The newest `PRICING_RECORDS` are kept (each about 100 kB at most, `PRICING_MAX_BYTES` 200 kB).
 */
export const PRICING_RECORD_KEY = 'aap-follow-pricing';
export const PRICING_RECORDS = 3;

export interface PricingRecord {
  /** search/runSaves.ts `accountOf`: a hash, never the player id. */
  account: string;
  /** The save's `lastBackupTime`, unix seconds. */
  backupTime: number;
  /** `pricingSetupKey` of the setup it was priced with. */
  setup: string;
  url: string;
  tableTo: number | null;
  /** When it was kept, ms. */
  at: number;
  pricing: SnapPricing;
}

/** What the pricing settings depend on beyond the save: the hours (and whether the answer works inside them), time
 *  off, no-prestige days and the first ascension's rule. The same words from InstantRoute.vue and My runs. */
export function pricingSetupKey(o: {
  availability: unknown;
  timeOff: unknown;
  noPrestige: unknown;
  useHours: boolean;
  firstAscension: string | null | undefined;
}): string {
  const list = (x: unknown) => (Array.isArray(x) ? x : []);
  return JSON.stringify([o.useHours ? (o.availability ?? null) : null, list(o.timeOff), list(o.noPrestige), o.firstAscension ?? null]);
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The records kept, newest first (none when unreadable). */
export function readPricingRecords(st: Store | null = storage()): PricingRecord[] {
  if (!st) return [];
  try {
    const v = JSON.parse(st.getItem(PRICING_RECORD_KEY) ?? '[]') as PricingRecord[];
    return Array.isArray(v)
      ? v.filter(r => r && typeof r.account === 'string' && typeof r.url === 'string' && typeof r.backupTime === 'number' && !!readPricing(r.pricing))
      : [];
  } catch {
    return [];
  }
}

/** Keep a record (replacing one of the same account, save and setup). False when it could not be kept. */
export function recordPricing(r: PricingRecord, st: Store | null = storage()): boolean {
  if (!st || !r.account || !r.backupTime || !readPricing(r.pricing)) return false;
  const same = (x: PricingRecord) => x.account === r.account && x.backupTime === r.backupTime && x.setup === r.setup;
  let list = [r, ...readPricingRecords(st).filter(x => !same(x))].slice(0, PRICING_RECORDS);
  // Full: fewer records rather than none.
  while (list.length) {
    try {
      st.setItem(PRICING_RECORD_KEY, JSON.stringify(list));
      return true;
    } catch {
      list = list.slice(0, list.length - 1);
    }
  }
  return false;
}

/** This save's records with this setup, as pricing sources (never another save's or setup's). */
export function recordSources(
  records: readonly PricingRecord[],
  o: { account: string | null; backupTime: number; setup: string; meta: SnapMeta | null }
): PricingSource[] {
  if (!o.account) return [];
  return records
    .filter(r => r.account === o.account && r.backupTime === o.backupTime && r.setup === o.setup)
    .map(r => ({ url: r.url, pricing: r.pricing, tableTo: r.tableTo, ownGoal: false, at: r.at, meta: o.meta }));
}
