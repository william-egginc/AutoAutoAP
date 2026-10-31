/**
 * THE BUILD-UP TRACKER'S LIST (build-up tracker Phase 1, 30 Oct 2026; outline
 * ~/code/aaap-tools/wireframes/buildup-tracker-v1.md, method ~/code/aaap-tools/notes/wait-chunks-2026-10-28.md
 * option (a), format oracle notes/jordan-a2-buildup-2026-10-29.md section D). Pure: no Vue, no stores, the clock
 * and the zone are parameters.
 *
 * From the simulator's build-up (search/buildUpActions.ts `BuildUpAction[]`, cut at the first `wait_for_te`) to
 * what a player does, check-in by check-in:
 *
 *  1. CHECK-INS AT LEAST 1 MINUTE APART. Every player action (research, vehicles, train cars, habs, silos, shifts,
 *     the prestige, a set swap) is due at its planned time `t`. A check-in takes everything due by its own time, in
 *     plan order; the next one is at the later of (this one + 60 s) and the next action's due time. Nothing is ever
 *     earlier than planned. This is a REGROUP of the plan, not a replay: the engine is not run again, so a buy pushed
 *     by up to a minute is assumed still affordable then (it was affordable earlier) and later buys keep their planned
 *     times unless the 1-minute rule pushes them. The wait-chunks measurements put the honest replay's extra delay at
 *     1.3 to 17.5 min per ascension; the regroup's times are optimistic by that much at most.
 *  2. SALE AND 2x WAITS FIXED TO THE CLOCK. Sales (Fri 9 am to Sat 9 am Pacific) and the 2x earnings event (Mon 9 am
 *     to Tue 9 am Pacific) come from lib/events.ts (read only), shown in the player's zone. An action after a
 *     `wait_for_research_sale` / `wait_for_earnings_boost` is due no earlier than that event's start, whatever the
 *     engine's wait length says. A research buy planned inside a sale is never pushed past the sale's end (the
 *     sale-end exception: it keeps its planned time even if that is under a minute after the last check-in).
 *  3. NIGHT HOURS. With the player's hours set (search/availability.ts `Availability`, the planner's hours), no
 *     check-in falls outside them: it moves to the start of the next available stretch, collecting what is due by
 *     then. A sale buy the night would push past the sale's end stays where it is, with a warning line.
 *  4. LINES. One line per kind of thing in a check-in, in the order to do it, the time on each, "offline N" (the gap
 *     to the next check-in, real elapsed time, rounded down to the minute like the times) on the check-in's last line.
 *     Research merges into one "buy …" line ("Name 5", "Name 3-7"); shifts, trains, habs, silos, the set swap and the
 *     prestige are BOLD lines of their own. Before a check-in that opens a sale: "wait for the sale: offline until …".
 *     Sale starts and ends are event lines (not check-ins).
 *  5. THE SILO TRICK (Jordan, 29 Oct): stay offline from the check-in before Monday's 2x event until a check-in inside
 *     it. Offline start = return − (S − 45 min cushion), S what the silos hold then. Claimed only when no planned
 *     check-in falls inside that stretch and it fits S; otherwise a warning line, and no trick.
 *  6. SET SWAPS ONLY ON HUMILITY. The set equipped before the first shift is the ascension's starting set (the free
 *     trip through Humility at the prestige), said on the prestige line, not a swap. A swap after that while not on
 *     Humility is dropped, with a note line. H1's update + equip of the ELR set is one bold line.
 *  7. DAYS. Lines grouped by the day in the player's zone; a clock change on that day is noted. Ordinary research
 *     lines are `granular` (a collapsed day hides them). Today and the next day with check-ins start open.
 *  8. SMART BUY (spec-buylabel, 30 Oct 2026; notes/smartbuy-vs-c3-2026-10-30.md). The buys are Joo's Smart Buy as C3
 *     runs it, looking ahead to the end of the build's last sale: `buyRule` says so with the plan's sale count. A
 *     research buy that cost 10 s of income or less (`BuildUpAction.cheap`, C3's opening sweep rule) gets
 *     "(cheap sweep)" after its part, so it is not read as an ROI pick; `items` are untouched.
 *
 * Times are 12-hour with am/pm ("8:42 am"), always, as the oracle and Jordan's rule write them.
 * Player-facing words here are DRAFT (Words reviews them; ~/code/aaap-tools/notes/spec-buildup-b.md).
 */
import type { BuildUpAction } from '@/search/buildUpActions';
import type { PlanItem } from './buildUpBought';
import type { Availability } from '@/search/availability';
import { isAvailable, nextAvailable } from '@/search/availability';
import { isConstrained } from '@/search/availabilitySchedule';
import {
  getNextEarningsBoostEnd,
  getNextEarningsBoostStart,
  getNextSaleEnd,
  getNextSaleStart,
  getSaleStartForEnd,
  getTimezoneOffsetAt,
  isEarningsBoostActive,
  isResearchSaleActive,
} from './events';
import { calendarOf } from './clock';

/** The minimum gap between check-ins, seconds. */
export const CHECK_IN_GAP = 60;
/** Silo cushion before the 2x return (the oracle's 45 min). */
export const SILO_CUSHION = 45 * 60;

export type LineKind =
  | 'research'
  | 'trains'
  | 'trainCars'
  | 'vehicle'
  | 'hab'
  | 'silo'
  | 'shift'
  | 'prestige'
  | 'setSwap'
  | 'siloTrick'
  | 'back'
  | 'saleStart'
  | 'saleEnd'
  | 'saleWait'
  | 'warning'
  | 'note';

export interface TrackerLine {
  /** Stable within one plan: `${check-in time}:${n}` for a check-in's lines, `e:${…}` for the others. The tick key. */
  key: string;
  kind: LineKind;
  /** Unix seconds the line is at (a wait line: the check-in it follows). */
  at: number;
  /** '8:42 am'; '' for a line without its own time (wait for the sale, a warning). */
  time: string;
  /** What to do: 'buy Grav Plating 18, Autonomous Vehicles 2'. */
  text: string;
  /** 'offline 1 min' on a check-in's last line; '' otherwise. */
  tail: string;
  /** Muted words after the line ('27 h of silos, 45 min spare'). */
  sub?: string;
  /** Shifts, trains, habs, silos, the set swap, the prestige, the silo trick. */
  bold: boolean;
  /** An ordinary research line: hidden in a collapsed day. */
  granular: boolean;
  /** Something the player does (a checkbox): every check-in line. */
  tickable: boolean;
  /** The check-in it belongs to (index into `checkIns`), -1 for an event, wait or warning line. */
  checkIn: number;
  /** What the line buys or does, for the ticks from the save (lib/buildUpBought.ts, Phase 2). Absent on a line the save
   *  can't tick (the silo trick, back online, events, waits, warnings, notes). */
  items?: PlanItem[];
  /** A research line's names one by one ('Grav Plating 18'), in `text`'s order after 'buy ': part i is item i, so a
   *  bought one can be struck through. */
  parts?: string[];
}

export interface CheckIn {
  at: number;
  /** Its lines' keys. */
  keys: string[];
}

export interface TrackerDay {
  /** 'YYYY-MM-DD' in the zone. */
  ymd: string;
  /** 'Fri Oct 30'. */
  title: string;
  /** 'clocks go back 1 h at 2:00 am'; '' when none. */
  clockNote: string;
  lines: TrackerLine[];
  /** Check-ins that start on this day. */
  checkIns: number;
  /** Today, or the next day with check-ins after today (outline recommendation 6). */
  openByDefault: boolean;
}

export interface TrackerInput {
  actions: readonly BuildUpAction[];
  /** IANA zone the player reads times in (the planner's). */
  zone: string;
  /** The player's hours; null / unconstrained: every hour. */
  hours?: Availability | null;
  /** What the silos hold at the plan's start, seconds; null / 0: not known. */
  siloSeconds?: number | null;
  /** Silos at the plan's start (BuildUpPlan.start.siloCount), so later silo buys lengthen S. */
  startSilos?: number | null;
  /** The egg the plan starts on (BuildUpPlan.start.egg), for the set-swap rule. */
  startEgg?: string | null;
  /** Now, unix seconds: which days start open, and the year in the day titles. */
  now: number;
  /** Specs: another gap. */
  gapSeconds?: number;
  /** How many sales the plan's Smart Buy looks ahead to (BuildUpPlan.saleCount); null: not carried. */
  saleCount?: number | null;
  /** The plan's variant (BuildUpPlan.variantKey): the sale count when `saleCount` is not carried. */
  variantKey?: string | null;
}

export interface TrackerResult {
  days: TrackerDay[];
  checkIns: CheckIn[];
  /** Every line, in order. */
  lines: TrackerLine[];
  /** Set swaps left out (not on Humility). */
  droppedSwaps: number;
  /** The header's Smart Buy line (`buyRuleWords`); '' for none. */
  buyRule: string;
}

// ------------------------------------------------------------------------------------------------ words

/** '8:42 am' in `zone`, rounded down to the minute. */
export function clock12(at: number, zone: string): string {
  const d = new Date(Math.floor(at / 60) * 60 * 1000);
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    return s.replace(/[\s  ]*([AaPp])\.?[Mm]\.?$/, (_m, x: string) => ` ${x.toLowerCase()}m`);
  } catch {
    return '';
  }
}

/** 'Fri Oct 30' in `zone` (the year after it when not `now`'s: 'Fri Jan 1 2027'). */
export function dayTitle(at: number, zone: string, now: number): string {
  try {
    const d = new Date(at * 1000);
    const y = calendarOf(at * 1000, zone)?.year;
    const ny = calendarOf(now * 1000, zone)?.year;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' })
      .formatToParts(d)
      .filter(p => p.type === 'weekday' || p.type === 'month' || p.type === 'day')
      .map(p => p.value);
    return y && ny && y !== ny ? `${parts.join(' ')} ${y}` : parts.join(' ');
  } catch {
    return '';
  }
}

/** 'Sunday' in `zone`. */
function weekdayLong(at: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long' }).format(new Date(at * 1000));
  } catch {
    return '';
  }
}

/** 'Fri Oct 30 10:00 am'. */
export function dayClock(at: number, zone: string, now: number): string {
  return `${dayTitle(at, zone, now)} ${clock12(at, zone)}`;
}

/** An exact span, whole minutes: '1 min', '1 h', '1 h 33 min', '26 h 15 min', '3 d 23 h 59 min'. Days start at 48 h,
 *  as in lib/duration.ts (hours up to 47 are easy to place on a clock); unlike `compactDuration` nothing is rounded
 *  away, so each "offline" adds up to the next line's time. */
export function gapWords(seconds: number): string {
  const min = Math.max(0, Math.round(seconds / 60));
  const d = min >= 48 * 60 ? Math.floor(min / 1440) : 0;
  const h = Math.floor((min - d * 1440) / 60);
  const m = min - d * 1440 - h * 60;
  const out: string[] = [];
  if (d) out.push(`${d} d`);
  if (h) out.push(`${h} h`);
  if (m || !out.length) out.push(`${m} min`);
  return out.join(' ');
}

/** The gap the lines show: between the two times as written (each rounded down to the minute). */
function shownGap(from: number, to: number): number {
  return Math.floor(to / 60) * 60 - Math.floor(from / 60) * 60;
}

const EGG_NAMES: Record<string, string> = {
  curiosity: 'Curiosity',
  kindness: 'Kindness',
  integrity: 'Integrity',
  resilience: 'Resilience',
  humility: 'Humility',
};
const eggName = (id: string | undefined): string => (id ? (EGG_NAMES[id] ?? id) : '');
/** 'ELR', 'earnings', or the set's own name. */
const setName = (a: BuildUpAction): string => (a.id === 'elr' ? 'ELR' : a.id === 'earnings' ? 'earnings' : (a.id ?? a.label.replace(/ set$/, '')));

/** Two research items share the name "Internal Hatchery Expansion": they are told apart by their tier. */
const RESEARCH_TIER: Record<string, number> = { internal_hatchery3: 5, internal_hatchery4: 7 };

/** '1-14', '1-3, 5', '17'. Sorted, de-duplicated. */
export function rangeWords(ns: readonly number[]): string {
  const s = [...new Set(ns)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** "Name 5" / "Name 3-7" per research item, in order of first appearance. */
export function researchWords(items: readonly BuildUpAction[], sameName: ReadonlySet<string>): string {
  return researchParts(items, sameName)
    .map(p => p.text)
    .join(', ');
}

/** One part per research item ('Name 3-7'), in order of first appearance, with its id and the level it ends on. */
export function researchParts(
  items: readonly BuildUpAction[],
  sameName: ReadonlySet<string>
): { id: string; level: number; text: string }[] {
  const order: string[] = [];
  const by = new Map<string, { name: string; lo: number; hi: number; cheap: boolean }>();
  for (const a of items) {
    const key = a.id ?? a.label;
    const to = a.level ?? 0;
    const from = (a.fromLevel ?? to - 1) + 1;
    const cur = by.get(key);
    if (!cur) {
      const tier = a.id && sameName.has(a.label) ? RESEARCH_TIER[a.id] : undefined;
      const name = sameName.has(a.label) ? `${a.label} (${tier ? `tier ${tier}` : (a.id ?? '')})` : a.label;
      by.set(key, { name, lo: Math.min(from, to), hi: to, cheap: a.cheap === true });
      order.push(key);
    } else {
      cur.lo = Math.min(cur.lo, from);
      cur.hi = Math.max(cur.hi, to);
      // Marked only when every buy of it in the line was cheap.
      cur.cheap = cur.cheap && a.cheap === true;
    }
  }
  return order.map(k => {
    const r = by.get(k)!;
    const mark = r.cheap ? CHEAP_SWEEP_MARK : '';
    return { id: k, level: r.hi, text: `${r.lo >= r.hi ? `${r.name} ${r.hi}` : `${r.name} ${r.lo}-${r.hi}`}${mark}` };
  });
}

/** After a research part whose buys were all `cheap` (DRAFT words). */
export const CHEAP_SWEEP_MARK = ' (cheap sweep)';

/** The fallback sale count when the plan carries none (an older kept 'buildup' plan): the usual 3-sale build. */
export const FALLBACK_SALE_COUNT = 3;

/**
 * How many sales the plan's Smart Buy looks ahead to: the plan's own count (the simulator's `buildPhaseSaleCount`),
 * else its variant key's ('2-sale', '1-sale-tier13'), else `FALLBACK_SALE_COUNT`. Null for 'continue' (no buys).
 */
export function salesAhead(o: { saleCount?: number | null; variantKey?: string | null }): number | null {
  if (o.variantKey === 'continue') return null;
  if (typeof o.saleCount === 'number' && Number.isInteger(o.saleCount) && o.saleCount > 0) return o.saleCount;
  const k = /^(\d+)-sale/.exec(o.variantKey ?? '');
  return k ? Number(k[1]) : FALLBACK_SALE_COUNT;
}

/** The header's Smart Buy line (DRAFT words); '' when the plan buys nothing. */
export function buyRuleWords(o: { saleCount?: number | null; variantKey?: string | null }): string {
  const n = salesAhead(o);
  if (n === null) return '';
  return `Buys follow Smart Buy, set to ${n} sale${n === 1 ? '' : 's'} (the Manual Planner's 70% Return card with its stepper on ${n})`;
}

// ------------------------------------------------------------------------------------------------ regroup

const PLAYER_KINDS = new Set(['research', 'vehicle', 'trainCar', 'hab', 'silo', 'shift', 'prestige', 'artifactSet']);

/** The build-up part: everything before the first `wait_for_te`. */
export function buildPart(actions: readonly BuildUpAction[]): BuildUpAction[] {
  const i = actions.findIndex(a => a.kind === 'wait' && (a.id === 'wait_for_te' || a.label === 'wait_for_te'));
  return i < 0 ? [...actions] : actions.slice(0, i);
}

interface Due {
  a: BuildUpAction;
  due: number;
}

/** The player's actions with their due times, sale and 2x waits fixed to the clock. */
function dueActions(actions: readonly BuildUpAction[]): Due[] {
  const out: Due[] = [];
  let anchor = -Infinity;
  for (const a of actions) {
    if (a.kind === 'wait') {
      const id = a.id ?? a.label;
      const began = a.t - (a.seconds ?? 0);
      if (id === 'wait_for_research_sale')
        anchor = Math.max(anchor, isResearchSaleActive(began) ? began : getNextSaleStart(began - 1));
      else if (id === 'wait_for_earnings_boost')
        anchor = Math.max(anchor, isEarningsBoostActive(began) ? began : getNextEarningsBoostStart(began - 1));
      continue;
    }
    if (!PLAYER_KINDS.has(a.kind)) continue;
    out.push({ a, due: Math.max(a.t, anchor) });
  }
  return out;
}

interface Group {
  at: number;
  items: BuildUpAction[];
  /** A sale buy the player's hours would have pushed past the sale's end. */
  nightSale?: boolean;
}

function regroup(dues: Due[], gap: number, hours: Availability | null): Group[] {
  const awake = (t: number) => (hours ? nextAvailable(t, hours) : t);
  const groups: Group[] = [];
  for (const { a, due } of dues) {
    const cur = groups[groups.length - 1];
    if (cur && due <= cur.at) {
      cur.items.push(a);
      continue;
    }
    let at = awake(cur ? Math.max(cur.at + gap, due) : due);
    let nightSale = false;
    // Sale-end exception: a research buy planned inside a sale is never pushed past its end.
    if (a.kind === 'research' && isResearchSaleActive(due)) {
      const end = getNextSaleEnd(due);
      if (at >= end) {
        const plain = cur ? Math.max(cur.at + gap, due) : due;
        nightSale = plain >= end ? false : at !== plain;
        at = plain < end ? plain : due;
      }
    }
    groups.push({ at, items: [a], ...(nightSale ? { nightSale } : {}) });
  }
  return groups;
}

// ------------------------------------------------------------------------------------------------ lines

interface Draft {
  kind: LineKind;
  text: string;
  sub?: string;
  items?: PlanItem[];
  parts?: string[];
}

/** A check-in's lines, in the order to do them. `egg` is the egg the farm is on at its start (updated). */
function checkInLines(
  items: BuildUpAction[],
  st: { egg: string; shifted: boolean; shifts: number; trains: Map<number, string>; sameName: Set<string>; dropped: number }
): Draft[] {
  const out: Draft[] = [];
  let i = 0;
  while (i < items.length) {
    const a = items[i];
    if (a.kind === 'research') {
      let j = i;
      while (j < items.length && items[j].kind === 'research') j++;
      const ps = researchParts(items.slice(i, j), st.sameName);
      out.push({
        kind: 'research',
        text: `buy ${ps.map(p => p.text).join(', ')}`,
        items: ps.map(p => ({ kind: 'research', id: p.id, level: p.level })),
        parts: ps.map(p => p.text),
      });
      i = j;
      continue;
    }
    if (a.kind === 'vehicle' || a.kind === 'trainCar') {
      let j = i;
      while (j < items.length && (items[j].kind === 'vehicle' || items[j].kind === 'trainCar')) j++;
      out.push(...vehicleLines(items.slice(i, j), st.trains));
      i = j;
      continue;
    }
    if (a.kind === 'silo') {
      let j = i;
      while (j < items.length && items[j].kind === 'silo') j++;
      const run = items.slice(i, j);
      const lo = (run[0].fromLevel ?? (run[0].count ?? 1) - 1) + 1;
      const hi = Math.max(...run.map(s => s.count ?? lo));
      const siloItems: PlanItem[] = [];
      for (let n = Math.min(lo, hi); n <= hi; n++) siloItems.push({ kind: 'silo', count: n });
      out.push({ kind: 'silo', text: lo >= hi ? `buy silo #${hi}` : `buy silos #${lo}-${hi}`, items: siloItems });
      i = j;
      continue;
    }
    if (a.kind === 'hab') {
      out.push({
        kind: 'hab',
        text: `buy ${a.label} in hab slot ${(a.slot ?? 0) + 1}`,
        ...(a.itemId != null ? { items: [{ kind: 'hab', slot: a.slot ?? 0, habId: a.itemId }] as PlanItem[] } : {}),
      });
    } else if (a.kind === 'shift') {
      st.egg = a.id ?? st.egg;
      st.shifted = true;
      st.shifts++;
      out.push({
        kind: 'shift',
        text: `shift to ${eggName(a.id) || a.label}`,
        ...(a.id ? { items: [{ kind: 'shift', egg: a.id, index: st.shifts }] as PlanItem[] } : {}),
      });
    } else if (a.kind === 'prestige') {
      st.egg = a.id ?? 'curiosity';
      out.push({
        kind: 'prestige',
        text: `prestige: start the ascension on ${eggName(a.id) || 'Curiosity'}`,
        items: [{ kind: 'prestige', egg: a.id ?? 'curiosity' }],
      });
    } else if (a.kind === 'artifactSet') {
      // One line for a run of set actions (H1 does update_artifact_set then equip_artifact_set: one swap).
      let j = i;
      while (j < items.length && items[j].kind === 'artifactSet') j++;
      const last = items[j - 1];
      if (!st.shifted) {
        // The set the ascension starts with (equipped at the prestige, before any shift; the free trip through
        // Humility): not a swap. Said on the prestige line when there is one.
        const p = out.find(d => d.kind === 'prestige');
        if (p && last.id) p.text += ` (${setName(last)} set on)`;
      } else if (st.egg !== 'humility') {
        st.dropped++;
        out.push({
          kind: 'note',
          text: `set swap left out: sets are swapped only on Humility (the plan had it on ${eggName(st.egg) || st.egg})`,
        });
      } else {
        out.push({
          kind: 'setSwap',
          text: last.id ? `set swap: equip the ${setName(last)} set` : 'set swap: change your artifacts',
          ...(last.id ? { items: [{ kind: 'setSwap', set: last.id, after: st.shifts }] as PlanItem[] } : {}),
        });
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

/** Trains merged per check-in: 'buy 14 Hyperloop Trains (slots 1-14), cars to 5'; cars alone: 'train cars: all 17
 *  trains to 8'. Other vehicles: 'buy Quantum Transporter in slot 3'. */
function vehicleLines(run: BuildUpAction[], trains: Map<number, string>): Draft[] {
  const out: Draft[] = [];
  // The engine climbs vehicle tiers one buy at a time (Trike, then Quantum Transporter, then Hyperloop Train in the
  // same moment); the player buys the last one straight away: only each slot's last vehicle of the check-in is said.
  const finalBy = new Map<number, string>();
  const finalId = new Map<number, number>();
  const cars = new Map<number, number>();
  for (const a of run) {
    const slot = (a.slot ?? 0) + 1;
    if (a.kind === 'vehicle') {
      trains.set(slot, a.label);
      finalBy.set(slot, a.label);
      if (a.itemId != null) finalId.set(slot, a.itemId);
      else finalId.delete(slot);
      if (a.level) cars.set(slot, a.level);
      else cars.delete(slot);
    } else if (a.level) cars.set(slot, Math.max(cars.get(slot) ?? 0, a.level));
  }
  const bought = new Map<string, number[]>();
  const order: string[] = [];
  for (const [slot, name] of finalBy) {
    if (!bought.has(name)) {
      bought.set(name, []);
      order.push(name);
    }
    bought.get(name)!.push(slot);
  }
  const boughtSlots = new Set<number>();
  for (const name of order) {
    const slots = bought.get(name)!;
    slots.forEach(s => boughtSlots.add(s));
    const n = slots.length;
    const isTrain = /train/i.test(name);
    const c = isTrain ? Math.max(0, ...slots.map(s => cars.get(s) ?? 0)) : 0;
    const what = n === 1 ? `1 ${name} (slot ${slots[0]})` : `${n} ${name}s (slots ${rangeWords(slots)})`;
    // One item per slot: the slot's last vehicle of the check-in, and (a train) its own length.
    const items: PlanItem[] = [...slots]
      .sort((x, y) => x - y)
      .filter(s => finalId.has(s))
      .map(s => ({ kind: 'vehicle', slot: s - 1, vehicleId: finalId.get(s)!, cars: isTrain ? (cars.get(s) ?? 0) : 0 }));
    out.push({ kind: 'trains', text: `buy ${what}${c > 1 ? `, cars to ${c}` : ''}`, ...(items.length === n ? { items } : {}) });
  }
  const carOnly = [...cars.keys()].filter(s => !boughtSlots.has(s));
  if (carOnly.length) {
    const to = Math.max(...carOnly.map(s => cars.get(s)!));
    const trainSlots = [...trains.entries()].filter(([, n]) => /train/i.test(n)).map(([s]) => s);
    const all = trainSlots.length > 1 && trainSlots.every(s => carOnly.includes(s)) && carOnly.length === trainSlots.length;
    out.push({
      kind: 'trainCars',
      items: [...carOnly].sort((x, y) => x - y).map(s => ({ kind: 'trainCar', slot: s - 1, cars: cars.get(s)! })),
      text: all
        ? `train cars: all ${trainSlots.length} trains to ${to}`
        : `train cars: ${carOnly.length === 1 ? `slot ${carOnly[0]}` : `slots ${rangeWords(carOnly)}`} to ${to}`,
    });
  }
  return out;
}

const BOLD: ReadonlySet<LineKind> = new Set([
  'trains',
  'trainCars',
  'vehicle',
  'hab',
  'silo',
  'shift',
  'prestige',
  'setSwap',
  'siloTrick',
  'back',
]);

/** A clock change inside the day starting at `dayStart` (zone midnight): 'clocks go back 1 h at 2:00 am'. */
function clockNoteFor(dayStart: number, zone: string): string {
  const end = dayStartOf(dayStart + 30 * 3600, zone);
  const a = getTimezoneOffsetAt(zone, dayStart);
  if (getTimezoneOffsetAt(zone, end - 1) === a) return '';
  for (let t = dayStart; t < end; t += 900) {
    const b = getTimezoneOffsetAt(zone, t + 900);
    if (b !== a) {
      // The wall clock just before the change, rounded to the change's moment ('2:00 am' for a fall back).
      const wall = clock12(t + 900 + (a - b), zone);
      const diff = b - a;
      return `clocks go ${diff < 0 ? 'back' : 'forward'} ${gapWords(Math.abs(diff))} at ${wall}`;
    }
  }
  return '';
}

/** The zone's midnight before `at`. */
function dayStartOf(at: number, zone: string): number {
  const off = getTimezoneOffsetAt(zone, at);
  const wall = at + off;
  const mid = wall - (((wall % 86400) + 86400) % 86400);
  return mid - getTimezoneOffsetAt(zone, mid - off);
}

/** The tracker's list. Pure and deterministic. */
export function buildUpTracker(input: TrackerInput): TrackerResult {
  const { zone, now } = input;
  const gap = input.gapSeconds ?? CHECK_IN_GAP;
  const hours = isConstrained(input.hours) ? input.hours : null;
  const actions = buildPart(input.actions);
  const groups = regroup(dueActions(actions), gap, hours);

  // Names two research items share (the tier tells them apart).
  const ids = new Map<string, Set<string>>();
  for (const a of actions)
    if (a.kind === 'research') {
      if (!ids.has(a.label)) ids.set(a.label, new Set());
      ids.get(a.label)!.add(a.id ?? a.label);
    }
  const sameName = new Set([...ids.entries()].filter(([, s]) => s.size > 1).map(([n]) => n));

  const st = { egg: input.startEgg ?? 'curiosity', shifted: false, shifts: 0, trains: new Map<number, string>(), sameName, dropped: 0 };
  const startSilos = Math.max(1, input.startSilos ?? 1);
  const perSilo = input.siloSeconds && input.siloSeconds > 0 ? input.siloSeconds / startSilos : 0;
  let silos = startSilos;

  // Check-ins with their drafts and the silo time at each.
  interface CI {
    at: number;
    drafts: Draft[];
    S: number;
    nightSale?: boolean;
    synthetic?: 'trick' | 'back';
  }
  const cis: CI[] = groups.map(g => {
    for (const a of g.items) if (a.kind === 'silo' && a.count) silos = Math.max(silos, a.count);
    const drafts = checkInLines(g.items, st);
    return { at: g.at, drafts, S: perSilo * silos, ...(g.nightSale ? { nightSale: true } : {}) };
  }).filter(c => c.drafts.length);

  // The silo trick, for each 2x event start between two check-ins.
  const extra: { at: number; line: Omit<TrackerLine, 'key' | 'checkIn' | 'tail' | 'granular' | 'tickable' | 'bold'> }[] = [];
  const warnings: { at: number; text: string }[] = [];
  if (cis.length > 1) {
    let B = getNextEarningsBoostStart(cis[0].at);
    const last = cis[cis.length - 1].at;
    const inserts: { after: number; ci: CI[] }[] = [];
    while (B < last) {
      const bi = cis.findIndex(c => c.at >= B);
      const prev = cis[bi - 1];
      const next = cis[bi];
      const bEnd = getNextEarningsBoostEnd(B);
      if (prev && next) {
        const awake = (t: number) => (hours ? nextAvailable(t, hours) : t);
        let ret = awake(B + gap);
        if (next.at < ret) ret = next.at;
        const S = prev.S;
        const backLine = next.at > ret + gap;
        if (ret >= bEnd) {
          // No moment inside the event while awake: nothing to claim.
        } else if (!(S > 0)) {
          warnings.push({ at: prev.at, text: 'Silo trick for the 2x event: your silo time is not known, so it is not planned. Load your save to plan it.' });
        } else {
          let s = Math.floor((ret - (S - SILO_CUSHION)) / 60) * 60;
          if (hours) for (let k = 0; k < 1440 && !isAvailable(s, hours); k++) s -= 60;
          const span = ret - s;
          if (prev.at > s) {
            warnings.push({
              at: prev.at,
              text: `No silo trick this week: the plan has a check-in at ${dayClock(prev.at, zone, now)}, inside the ${gapWords(S - SILO_CUSHION)} before ${dayClock(ret, zone, now)}. Stay with the plan.`,
            });
          } else if (span > S || S <= SILO_CUSHION + gap) {
            warnings.push({
              at: prev.at,
              text: `Your silos hold ${gapWords(S)}: going offline ${dayClock(s, zone, now)} does not reach ${dayClock(ret, zone, now)}. No silo trick this week: check in as planned.`,
            });
          } else {
            const ins: CI[] = [
              {
                at: s,
                S,
                synthetic: 'trick',
                drafts: [
                  {
                    kind: 'siloTrick',
                    text: `last ${weekdayLong(s, zone)} check-in: collect, then go offline until ${dayTitle(ret, zone, now).split(' ')[0]} ${clock12(ret, zone)} (${gapWords(shownGap(s, ret))})`,
                    sub: `${gapWords(S)} of silos, ${gapWords(S - span)} spare`,
                  },
                ],
              },
            ];
            if (backLine) ins.push({ at: ret, S, synthetic: 'back', drafts: [{ kind: 'back', text: 'back online inside the 2x event (nothing to buy)' }] });
            else next.drafts.unshift({ kind: 'back', text: 'back online inside the 2x event' });
            inserts.push({ after: bi - 1, ci: ins });
          }
        }
      }
      B = getNextEarningsBoostStart(B + 1);
    }
    for (const ins of inserts.reverse()) cis.splice(ins.after + 1, 0, ...ins.ci);
  }

  // Lines.
  const lines: TrackerLine[] = [];
  const checkIns: CheckIn[] = [];
  const first = cis[0]?.at ?? 0;
  const lastAt = cis[cis.length - 1]?.at ?? 0;
  // Sale starts and ends between the first and the last check-in (event lines, not check-ins).
  const events: { at: number; kind: 'saleStart' | 'saleEnd' }[] = [];
  if (cis.length) {
    for (let s = getNextSaleStart(first - 1); s <= lastAt; s = getNextSaleStart(s + 1)) events.push({ at: s, kind: 'saleStart' });
    for (let e = getNextSaleEnd(first); e <= lastAt; e = getNextSaleEnd(e + 1)) events.push({ at: e, kind: 'saleEnd' });
    events.sort((a, b) => a.at - b.at);
  }
  let ev = 0;
  const pushEvent = (e: (typeof events)[number]) =>
    lines.push({
      key: `e:${e.kind}:${e.at}`,
      kind: e.kind,
      at: e.at,
      time: clock12(e.at, zone),
      text: e.kind === 'saleStart' ? 'research sale starts (Manual Planner: sale on)' : 'research sale ends (Manual Planner: sale off)',
      tail: '',
      bold: false,
      granular: false,
      tickable: false,
      checkIn: -1,
    });
  for (let c = 0; c < cis.length; c++) {
    const ci = cis[c];
    while (ev < events.length && events[ev].at <= ci.at) pushEvent(events[ev++]);
    const next = cis[c + 1];
    const keys: string[] = [];
    // A note (a set swap left out) goes after the check-in's own lines; the offline tail stays on its last own line.
    const drafts = [...ci.drafts.filter(d => d.kind !== 'note'), ...ci.drafts.filter(d => d.kind === 'note')];
    const lastOwn = drafts.filter(d => d.kind !== 'note').length - 1;
    drafts.forEach((d, n) => {
      const key = `${Math.floor(ci.at)}:${n}`;
      const lastLine = n === lastOwn;
      const saleNext = !!next && saleOpensBetween(ci.at, next.at);
      const tail =
        lastLine && next && !saleNext && ci.synthetic !== 'trick' ? `offline ${gapWords(shownGap(ci.at, next.at))}` : '';
      const tickable = d.kind !== 'note';
      lines.push({
        key,
        kind: d.kind,
        at: ci.at,
        time: clock12(ci.at, zone),
        text: d.text,
        tail,
        ...(d.sub ? { sub: d.sub } : {}),
        ...(d.items?.length ? { items: d.items } : {}),
        ...(d.parts ? { parts: d.parts } : {}),
        bold: BOLD.has(d.kind),
        granular: d.kind === 'research',
        tickable,
        checkIn: tickable ? checkIns.length : -1,
      });
      if (tickable) keys.push(key);
    });
    if (ci.nightSale)
      lines.push({
        key: `w:night:${ci.at}`,
        kind: 'warning',
        at: ci.at,
        time: '',
        text: `This sale buy is outside your hours: do it before the sale ends at ${clock12(getNextSaleEnd(ci.at), zone)}.`,
        tail: '',
        bold: false,
        granular: false,
        tickable: false,
        checkIn: -1,
      });
    for (const w of warnings.filter(x => x.at === ci.at && !ci.synthetic))
      lines.push({ key: `w:${w.at}:${w.text.length}`, kind: 'warning', at: ci.at, time: '', text: w.text, tail: '', bold: false, granular: false, tickable: false, checkIn: -1 });
    if (next && saleOpensBetween(ci.at, next.at)) {
      const start = getSaleStartForEnd(getNextSaleEnd(next.at - 1));
      // Longer than the silos hold: say to open the farm meanwhile (the oracle's words when once a day is enough).
      const over =
        ci.S > 0 && shownGap(ci.at, start) > ci.S
          ? ci.S >= 86400
            ? ' (open the farm once a day; nothing to buy)'
            : ` (your silos hold ${gapWords(ci.S)}: open the farm before they run out; nothing to buy)`
          : '';
      // Events before the sale start (a sale end) come before the wait line.
      while (ev < events.length && events[ev].at < start && events[ev].at <= next.at) pushEvent(events[ev++]);
      lines.push({
        key: `e:wait:${start}`,
        kind: 'saleWait',
        at: ci.at,
        time: '',
        text: `wait for the sale: offline until ${dayClock(start, zone, now)} (${gapWords(shownGap(ci.at, start))})${over}`,
        tail: '',
        bold: false,
        granular: false,
        tickable: false,
        checkIn: -1,
      });
    }
    if (keys.length) checkIns.push({ at: ci.at, keys });
  }
  while (ev < events.length) pushEvent(events[ev++]);

  return {
    days: daysOf(lines, zone, now),
    checkIns,
    lines,
    droppedSwaps: st.dropped,
    buyRule: buyRuleWords({ saleCount: input.saleCount, variantKey: input.variantKey }),
  };
}

/** A sale starts after `a` and by `b` (so `b` is a sale-start check-in). */
function saleOpensBetween(a: number, b: number): boolean {
  if (!isResearchSaleActive(b)) return false;
  const start = getSaleStartForEnd(getNextSaleEnd(b));
  return start > a && start <= b;
}

function daysOf(lines: TrackerLine[], zone: string, now: number): TrackerDay[] {
  const days: TrackerDay[] = [];
  const counted = new Set<number>();
  for (const l of lines) {
    const ymd = calendarOf(l.at * 1000, zone)?.ymd ?? '';
    let d = days[days.length - 1];
    if (!d || d.ymd !== ymd) {
      d = { ymd, title: dayTitle(l.at, zone, now), clockNote: clockNoteFor(dayStartOf(l.at, zone), zone), lines: [], checkIns: 0, openByDefault: false };
      days.push(d);
    }
    d.lines.push(l);
    if (l.checkIn >= 0 && !counted.has(l.checkIn)) {
      counted.add(l.checkIn);
      d.checkIns++;
    }
  }
  const today = calendarOf(now * 1000, zone)?.ymd ?? '';
  const t = days.find(d => d.ymd === today);
  if (t) t.openByDefault = true;
  const nextDay = days.find(d => d.ymd > today && d.checkIns > 0);
  if (nextDay) nextDay.openByDefault = true;
  if (!days.some(d => d.openByDefault) && days.length) days[days.length - 1].openByDefault = true;
  return days;
}

/** A line as the oracle writes it: '8:47 am · buy Grav Plating 18 · offline 1 min'. */
export function lineText(l: Pick<TrackerLine, 'time' | 'text' | 'tail'>): string {
  return [l.time, l.text, l.tail].filter(Boolean).join(' · ');
}

// ------------------------------------------------------------------------------------------------ ticks

export interface TrackerSummary {
  /** Check-ins with every line ticked. */
  done: number;
  total: number;
  /** The first check-in not fully ticked; null when all are. */
  next: CheckIn | null;
}

export function trackerSummary(r: Pick<TrackerResult, 'checkIns'>, ticks: ReadonlySet<string>): TrackerSummary {
  let done = 0;
  let next: CheckIn | null = null;
  for (const c of r.checkIns) {
    if (c.keys.every(k => ticks.has(k))) done++;
    else if (!next) next = c;
  }
  return { done, total: r.checkIns.length, next };
}

/** Where a plan's ticks are kept: per account and ascension (its start). */
export const ticksKey = (account: string, ascensionStart: number): string => `aap.buildup.ticks.${account}.${Math.floor(ascensionStart)}`;

/** The ticked line keys, never throws. */
export function readTicks(account: string, ascensionStart: number): Set<string> {
  try {
    const v = localStorage.getItem(ticksKey(account, ascensionStart));
    const a = v ? (JSON.parse(v) as unknown) : [];
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeTicks(account: string, ascensionStart: number, ticks: ReadonlySet<string>): void {
  try {
    localStorage.setItem(ticksKey(account, ascensionStart), JSON.stringify([...ticks]));
  } catch {
    /* this visit only */
  }
}

/** Phase 2: lines the player UNticked where the save says bought (their override the other way). The ticked ones stay
 *  under `ticksKey`, as in Phase 1. */
export const unticksKey = (account: string, ascensionStart: number): string => `aap.buildup.unticks.${account}.${Math.floor(ascensionStart)}`;

export function readUnticks(account: string, ascensionStart: number): Set<string> {
  try {
    const v = localStorage.getItem(unticksKey(account, ascensionStart));
    const a = v ? (JSON.parse(v) as unknown) : [];
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeUnticks(account: string, ascensionStart: number, keys: ReadonlySet<string>): void {
  try {
    if (keys.size) localStorage.setItem(unticksKey(account, ascensionStart), JSON.stringify([...keys]));
    else localStorage.removeItem(unticksKey(account, ascensionStart));
  } catch {
    /* this visit only */
  }
}

// ------------------------------------------------------------------------------------------------ the fold

/** Where the player's own open / close of the tracker is kept: per account and ascension. */
export const foldChoiceKey = (account: string, ascensionStart: number): string =>
  `aap.buildup.fold.${account}.${Math.floor(ascensionStart)}`;

export function readFoldChoice(account: string, ascensionStart: number): boolean | null {
  try {
    const v = localStorage.getItem(foldChoiceKey(account, ascensionStart));
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

export function writeFoldChoice(account: string, ascensionStart: number, open: boolean): void {
  try {
    localStorage.setItem(foldChoiceKey(account, ascensionStart), open ? '1' : '0');
  } catch {
    /* this visit only */
  }
}

/**
 * Whether the tracker's fold is open (outline recommendation 1): the player's own choice for this ascension when they
 * made one; else open while building (it opens by itself once per ascension: a close then holds, as the choice), else
 * closed.
 */
export function trackerFoldOpen(o: { choice: boolean | null; building: boolean }): boolean {
  return o.choice ?? o.building;
}

// ------------------------------------------------------------------------------------------------ the kept plan

/** The plan the tracker shows, per account: the first one worked out in this ascension's build-up (from the first
 *  save seen in it), so newer saves only tick things off (outline recommendation 2), until the player re-plans. */
export const ANCHOR_KEY_PREFIX = 'aap.buildup.plan.';
/** The kept plan's most, as JSON text. */
export const ANCHOR_MAX_BYTES = 400_000;

export interface AnchoredPlan {
  /** The ascension it belongs to (its start, unix seconds). */
  ascensionStart: number;
  /** The save it was worked out from (backup time, unix seconds). */
  saveSeconds: number;
  plan: import('@/search/buildUpActions').BuildUpPlan;
  /** Phase 2: that save's farm (lib/buildUpBought.ts), so a plan that starts afresh can tell a save from before its
   *  prestige. Absent on plans kept before Phase 2. */
  anchorFarm?: import('./buildUpBought').SaveFarm;
}

/** Only what the tracker reads: the build-up part, no engine 'other' actions. */
export function compactPlan(p: AnchoredPlan['plan']): AnchoredPlan['plan'] {
  return {
    ...p,
    actions: buildPart(p.actions)
      .filter(a => a.kind !== 'other' && a.kind !== 'event')
      .map(({ cost: _c, detail: _d, ...a }) => a),
  };
}

/** Drops the kept plan (a re-plan whose new plan could not be kept). Never throws. */
export function dropAnchoredPlan(account: string): void {
  try {
    localStorage.removeItem(ANCHOR_KEY_PREFIX + account);
  } catch {
    /* nothing kept */
  }
}

export function readAnchoredPlan(account: string): AnchoredPlan | null {
  try {
    const v = localStorage.getItem(ANCHOR_KEY_PREFIX + account);
    const a = v ? (JSON.parse(v) as AnchoredPlan) : null;
    return a && typeof a.ascensionStart === 'number' && a.plan && Array.isArray(a.plan.actions) ? a : null;
  } catch {
    return null;
  }
}

/** Keeps it (compacted) when it fits; false when it could not be kept (it is still shown this visit). */
export function writeAnchoredPlan(account: string, a: AnchoredPlan): boolean {
  try {
    const text = JSON.stringify({ ...a, plan: compactPlan(a.plan) });
    if (text.length > ANCHOR_MAX_BYTES) return false;
    localStorage.setItem(ANCHOR_KEY_PREFIX + account, text);
    return true;
  } catch {
    return false;
  }
}

/** The start of the plan's current ascension (its prestige), unix seconds; null when not known. */
export function ascensionStartOf(
  plan: { planStart?: number | null; chain: number[]; legs: { endTime: number }[] | null; tableLegs?: { end: number }[] | null } | null,
  nowSeconds: number
): number | null {
  if (!plan) return null;
  const ends = plan.legs ? plan.legs.map(l => l.endTime) : (plan.tableLegs ?? []).map(l => l.end);
  const i = ends.slice(0, plan.chain.length).findIndex(e => nowSeconds < e);
  if (i < 0) return null;
  if (i === 0) return plan.planStart && Number.isFinite(plan.planStart) ? plan.planStart : null;
  return ends[i - 1];
}

// ------------------------------------------------------------------------------------------------ a day on screen

/**
 * What a day shows (outline recommendation 6): open, every line; collapsed, its bold, event, wait and warning lines
 * and the first research line not ticked yet, with how many are hidden ("+ N more · show all").
 */
export function dayView(d: Pick<TrackerDay, 'lines'>, open: boolean, ticks: ReadonlySet<string>): { lines: TrackerLine[]; hidden: number } {
  if (open) return { lines: d.lines, hidden: 0 };
  const firstOpen = d.lines.find(l => l.granular && !ticks.has(l.key));
  const lines = d.lines.filter(l => !l.granular || l === firstOpen);
  return { lines, hidden: d.lines.length - lines.length };
}
