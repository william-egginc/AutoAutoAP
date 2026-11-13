/**
 * My runs' Your eggs (Jordan, 26 Oct 2026): a time to the NEXT TE for every egg, not only the one being laid. For an
 * egg the player isn't on it is the time from the moment they shift to it. From the LOADED SAVE only. Pure.
 *
 * THE FARM AFTER A SHIFT. A shift keeps research, habs, vehicles and silos and sets the chickens to zero
 * (game-mechanics.md §7). So the farm after a shift is the save's own farm (its habs, research, vehicles, the
 * equipped artifacts, epic research, colleggtibles) with the habs refilling from empty at the internal hatchery
 * rate (IHR). The rates are the planner's own pure formulas (src/calculations), the same ones lib/farmFacts.ts uses
 * for the save's rate, only at full habs:
 *
 *   maxHabs      calculateHabCapacity_Full: the save's habs and research, colleggtibles, equipped artifacts
 *   perChicken   calculateLayRate(...).ratePerChickenPerSecond (eggs per chicken per second)
 *   ship         calculateShippingCapacity: the save's vehicles (eggs per second)
 *   maxElr       min(perChicken x maxHabs, ship): calculateEffectiveLayRate at full habs
 *   ihr          calculateIHR(...).onlineRate / 60: chickens per second, the game open (1.1^TE with the account's
 *                total TE, the save's hatchery research, Epic Int. Hatcheries, IHR colleggtibles and artifacts;
 *                at least 500 a minute, the planner's manual-hatching floor)
 *
 * THE TIME. `remaining` = the egg's next TE threshold less the save's eggs delivered for it.
 *   Over 100 TE in all (the habs refill in minutes then): full habs straight away, T = remaining / maxElr.
 *   At or below 100 TE: the habs fill at the IHR and the eggs laid while they fill count:
 *     pop(t) = min(maxHabs, pop0 + ihr t), rate(t) = min(perChicken pop(t), maxElr), eggs(T) = ∫0..T rate = remaining.
 *   rate(t) grows in a straight line (a + b t, a = perChicken pop0, b = perChicken ihr) until it reaches maxElr at
 *   t1 = (maxElr - a) / b, then stays there:
 *     remaining <= E1 = a t1 + b t1² / 2:  T = (-a + sqrt(a² + 2 b remaining)) / b
 *     otherwise:                          T = t1 + (remaining - E1) / maxElr
 *   With no shipping limit (perChicken maxHabs <= ship) this is the "ELR scales with population" ramp with
 *   rate_per_chicken = maxElr / maxHabs. pop0 is 0 after a shift, the save's population for the egg being laid.
 */
import { PROFILE } from '@/lib/profile';
import { calculateHabCapacity_Full } from 'lib/planners/calculations/habCapacity';
import { calculateLayRate } from 'lib/planners/calculations/layRate';
import { calculateShippingCapacity } from 'lib/planners/calculations/shippingCapacity';
import { calculateIHR } from 'lib/planners/calculations/internalHatcheryRate';
import { calculateArtifactModifiers } from '@/lib/artifacts/calculator';
import { nextTEThreshold } from '@/lib/truthEggs';
import { dateAt } from './eventWhen';
import { compactDuration } from './duration';
import { roundToHourIn } from './nowWords';
import { nextTeLine, NEXT_TE_CAP_DAYS, type EggLine, type FarmInput } from './farmFacts';
import {
  AFTER_SHIFT_NOT_AT_THIS_RATE,
  afterShiftWords,
  EGG_LINE,
  GOAL_NO_SHIFT_WORDS,
  GOAL_ON_EGG_WORDS,
  goalPlanWords,
  goalShiftWords,
  nextClockIfNowWords,
  nextClockWords,
  type EggLineKind,
} from './yourEggsWords';

/** Above this many TE in all the habs are taken as full straight after a shift (Jordan, 26 Oct 2026). */
export const RAMP_TE_LIMIT = 100;

export interface ShiftRates {
  /** Chickens the save's habs hold. */
  maxHabs: number;
  /** Eggs per chicken per second (laying, before the shipping limit). */
  perChicken: number;
  /** Eggs per second delivered at full habs: min(laying, shipping). */
  maxElr: number;
  /** Chickens per second the internal hatcheries add, the game open. */
  ihr: number;
}

/** farmFacts' input, with the IHR colleggtibles (1 when not given) and the account's total TE. */
export type ShiftInput = Omit<FarmInput, 'colleggtibles'> & {
  colleggtibles: FarmInput['colleggtibles'] & { ihr?: number };
  totalTe: number;
};

/** The save's farm at full habs and its hatchery rate; null without a virtue farm or with nothing laid. */
export function shiftRates(i: ShiftInput): ShiftRates | null {
  const farm = i.farm;
  if (!farm) return null;
  const mods = calculateArtifactModifiers(i.equipped);
  const maxHabs = calculateHabCapacity_Full({
    habIds: farm.habs,
    researchLevels: farm.commonResearches,
    habCapMultiplier: i.colleggtibles.habCap,
    artifactMultiplier: mods.habCapacity.totalMultiplier,
    artifactEffects: mods.habCapacity.effects,
  }).totalFinalCapacity;
  const lay = calculateLayRate({
    researchLevels: farm.commonResearches,
    epicComfyNestsLevel: i.epic['epic_egg_laying'] || 0,
    elrMultiplier: i.colleggtibles.elr,
    population: maxHabs,
    artifactMultiplier: mods.eggLayingRate.totalMultiplier,
    artifactEffects: mods.eggLayingRate.effects,
  });
  const ship = calculateShippingCapacity({
    vehicles: farm.vehicles,
    researchLevels: farm.commonResearches,
    transportationLobbyistLevel: i.epic['transportation_lobbyist'] || 0,
    shippingCapMultiplier: i.colleggtibles.shippingCap,
    artifactMultiplier: mods.shippingRate.totalMultiplier,
    artifactEffects: mods.shippingRate.effects,
  }).totalFinalCapacity;
  const ihr = calculateIHR({
    te: i.totalTe,
    teBase: PROFILE.ihrTruthEggBase,
    researchLevels: farm.commonResearches,
    epicResearchLevels: {
      epicInternalIncubators: i.epic['epic_internal_incubators'] || 0,
      internalHatcheryCalm: i.epic['int_hatch_calm'] || 0,
    },
    ihrMultiplier: i.colleggtibles.ihr ?? 1,
    artifactMultiplier: mods.internalHatcheryRate.totalMultiplier,
    artifactEffects: mods.internalHatcheryRate.effects,
  }).onlineRate / 60;
  const perChicken = lay.ratePerChickenPerSecond;
  const maxElr = Math.min(perChicken * maxHabs, ship);
  if (!(maxHabs > 0) || !(perChicken > 0) || !(maxElr > 0)) return null;
  return { maxHabs, perChicken, maxElr, ihr };
}

/**
 * Seconds until `remaining` eggs are delivered, the habs filling from `pop0` at `ihr` (the ramp in the header).
 * Infinity when it never gets there (nothing laid and no hatchery).
 */
export function rampSeconds(
  remaining: number,
  r: { pop0: number; ihr: number; maxHabs: number; perChicken: number; maxElr: number }
): number {
  if (!(remaining > 0)) return 0;
  const M = r.maxElr;
  if (!(M > 0)) return Infinity;
  const a = Math.min(M, r.perChicken * Math.max(0, Math.min(r.maxHabs, r.pop0)));
  const b = r.perChicken * Math.max(0, r.ihr);
  if (a >= M) return remaining / M;
  if (!(b > 0)) return a > 0 ? remaining / a : Infinity;
  const t1 = (M - a) / b;
  const e1 = a * t1 + (b * t1 * t1) / 2;
  if (remaining <= e1) return (-a + Math.sqrt(a * a + 2 * b * remaining)) / b;
  return t1 + (remaining - e1) / M;
}

/**
 * Seconds to the egg's next TE: from the shift for an egg the player isn't on (pop0 0), from the save for the egg
 * being laid (pop0 the save's population). Null at the TE cap or without rates.
 */
export function eggNextTeSeconds(o: {
  delivered: number;
  current: boolean;
  /** The save's chickens (used for the egg being laid only). */
  population: number;
  totalTe: number;
  rates: ShiftRates | null;
}): number | null {
  const r = o.rates;
  if (!r) return null;
  const hi = nextTEThreshold(o.delivered);
  if (!Number.isFinite(hi)) return null;
  const remaining = Math.max(0, hi - o.delivered);
  if (o.totalTe > RAMP_TE_LIMIT) return remaining / r.maxElr;
  const t = rampSeconds(remaining, { ...r, pop0: o.current ? o.population : 0 });
  return Number.isFinite(t) ? t : null;
}

/** "~25m", "~18h 30m", "~2d 4h" (lib/duration). */
export function aboutWords(seconds: number): string {
  return `~${compactDuration(Math.max(60, seconds))}`;
}

/** The line under an egg the player isn't on; null: say nothing (no time). */
export function afterShiftLine(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds > NEXT_TE_CAP_DAYS * 86400) return AFTER_SHIFT_NOT_AT_THIS_RATE;
  return afterShiftWords(aboutWords(seconds));
}

/** The one note under the eggs: what the after-shift times are and where from. */
export function afterShiftNote(totalTe: number, saveSeconds: number, nowSeconds: number, zone: string): string {
  const how =
    totalTe > RAMP_TE_LIMIT
      ? 'habs full straight away (over 100 TE)'
      : 'habs refilling at your internal hatchery rate, the eggs laid meanwhile counted';
  const at = dateAt(saveSeconds, nowSeconds, zone);
  return `After a shift: your farm, research and artifacts as in the save, ${how} · estimated from your save${at ? ` of ${at}` : ''}`;
}

/** The after-shift lines of the eggs the player isn't on, by egg; eggs with nothing to say are left out. */
export function afterShiftLines(o: {
  eggs: readonly { egg: string; current: boolean }[];
  delivered: Partial<Record<string, number>>;
  totalTe: number;
  rates: ShiftRates | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of o.eggs) {
    if (e.current) continue;
    const line = afterShiftLine(
      eggNextTeSeconds({ delivered: o.delivered[e.egg] ?? 0, current: false, population: 0, totalTe: o.totalTe, rates: o.rates })
    );
    if (line) out[e.egg] = line;
  }
  return out;
}

/**
 * YOUR EGGS, TO GOAL (spec-myruns-fix2, 13 Nov 2026; Jordan: "what your plan says", no "if you shift here"
 * hypotheticals). The followed plan's goal: its TE and when it gets there, the same line for every egg, so the card
 * says it once above the eggs (the By a date line, now for any plan: "to goal: 412 TE <when>, in ~5d 3h"); to the hour
 * when the plan isn't exact, as Right now shows it (`rounded`, lib/nowWords.ts `roundedAt`; spec-myruns-fix).
 * Empty without a plan (the card then has no "to goal" view). Before 13 Nov a Fastest goal gave every egg "if every TE
 * still to earn came from this egg" times (28 Oct, pieha): gone, they were hypotheticals, and with a goal bigger than
 * one egg's room every egg was timed to its own last TE, so all five said about the same time. Pure.
 */
export function eggGoalLines(o: {
  eggs: readonly EggLine[];
  goal: { endTE: number; finish: number; zone: string; rounded?: boolean } | null;
  now: number;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const g = o.goal;
  if (!g || !Number.isFinite(g.finish) || !(g.finish > o.now)) return out;
  const finish = g.rounded ? roundToHourIn(g.finish, g.zone) : g.finish;
  const line = goalPlanWords(g.endTE, dateAt(finish, o.now, g.zone), compactDuration(finish - o.now));
  for (const e of o.eggs) out[e.egg] = line;
  return out;
}

/**
 * THE CLOCK TIME PER EGG (ux34-a, 28 Oct 2026; spec-myruns-fix2, 13 Nov 2026). `next`, the "next TE" view: the day
 * and time of each egg's next TE in the browser's own format, with the weekday (lib/eventWhen.ts `dateAt`): the egg
 * being laid at the save's rate, from the save; every other egg from a shift to it NOW (never from the plan's shift:
 * that view is "if you switched now"). `goal`, the "to goal" view (with a followed plan, `plan`): when the plan's Next
 * shifts (lib/nextAction.ts `nextShifts`) shifts to the egg, the first one; the egg you are on with no shift back to it
 * listed; or no shift to it in those next shifts. Eggs with no time (at the TE cap, no rates, over about 10 years,
 * reached since the save) have no next line. Pure.
 */
export function eggClockLines(o: {
  eggs: readonly EggLine[];
  delivered: Partial<Record<string, number>>;
  totalTe: number;
  rates: ShiftRates | null;
  now: number;
  saveSeconds: number;
  zone: string;
  shifts: readonly { kind: string; egg?: string; at: number }[];
  /** A followed plan is shown: the "to goal" lines. */
  plan?: boolean;
}): { next: Record<string, string>; goal: Record<string, string> } {
  const next: Record<string, string> = {};
  const goal: Record<string, string> = {};
  const cap = NEXT_TE_CAP_DAYS * 86400;
  const when = (at: number) => dateAt(at, o.now, o.zone, true);
  const planned = (egg: string) => o.shifts.find(s => s.kind === 'shift' && s.egg === egg && s.at > o.now)?.at ?? null;
  for (const e of o.eggs) {
    if (o.plan) {
      const s = planned(e.egg);
      if (s != null && when(s)) goal[e.egg] = goalShiftWords(when(s));
      else goal[e.egg] = e.current ? GOAL_ON_EGG_WORDS : GOAL_NO_SHIFT_WORDS;
    }
    if (e.current) {
      const n = e.nextInSeconds != null && Number.isFinite(e.nextInSeconds) ? o.saveSeconds + e.nextInSeconds : null;
      if (n != null && n > o.now && n - o.now <= cap && when(n)) next[e.egg] = nextClockWords(when(n));
      continue;
    }
    const d = o.delivered[e.egg] ?? 0;
    const t = eggNextTeSeconds({ delivered: d, current: false, population: 0, totalTe: o.totalTe, rates: o.rates });
    if (t != null && Number.isFinite(t) && t <= cap && when(o.now + t)) next[e.egg] = nextClockIfNowWords(when(o.now + t));
  }
  return { next, goal };
}

export interface EggViewLine {
  kind: EggLineKind;
  text: string;
}

/**
 * The lines under one egg for a view (YourEggs.vue renders exactly these; spec-myruns-fix2). Each view only its own
 * kinds (lib/yourEggsWords.ts `EGG_VIEW_LINES`):
 *   next: the egg being laid, its next TE at the save's rate WITHOUT the goal (farmFacts `nextTeLine` with no goal
 *     time); every other egg its after-shift time, or how far it is to its next TE when it has none; then its clock.
 *   goal: the egg's plan line (`clockLines.goal`): when the plan shifts here, on it now, or no shift in the next shifts.
 */
export function eggViewLines(
  view: EggsView,
  e: EggLine,
  o: {
    now: number;
    saveSeconds: number;
    afterShift?: Record<string, string> | null;
    clockLines?: { next: Record<string, string>; goal: Record<string, string> } | null;
  }
): EggViewLine[] {
  const out: EggViewLine[] = [];
  if (view === 'goal') {
    const g = o.clockLines?.goal[e.egg];
    if (g) out.push({ kind: g === GOAL_ON_EGG_WORDS ? EGG_LINE.goalOnEgg : g === GOAL_NO_SHIFT_WORDS ? EGG_LINE.goalNoShift : EGG_LINE.goalShift, text: g });
    return out;
  }
  const shift = e.current ? '' : (o.afterShift?.[e.egg] ?? '');
  if (e.current) out.push({ kind: EGG_LINE.nextAtSaveRate, text: nextTeLine({ ...e, goalInSeconds: null }, o.now, o.saveSeconds) });
  else if (shift) out.push({ kind: EGG_LINE.nextAfterShift, text: shift });
  else out.push({ kind: EGG_LINE.nextProgress, text: nextTeLine(e, o.now, o.saveSeconds) });
  const c = o.clockLines?.next[e.egg];
  if (c) out.push({ kind: EGG_LINE.nextClock, text: c });
  return out;
}

/** Your eggs' view, remembered in this browser: 'next' (next TE, the default) or 'goal'. */
export type EggsView = 'next' | 'goal';
export const EGGS_VIEW_KEY = 'aap-eggs-view';

export function readEggsView(): EggsView {
  try {
    return localStorage.getItem(EGGS_VIEW_KEY) === 'goal' ? 'goal' : 'next';
  } catch {
    return 'next';
  }
}

export function writeEggsView(v: EggsView): void {
  try {
    localStorage.setItem(EGGS_VIEW_KEY, v);
  } catch {
    // Not kept: the page still shows it.
  }
}
