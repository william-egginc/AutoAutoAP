/**
 * When each stop of a route is reached, and when each egg inside each ascension is first laid, last
 * left and what TE it has then ("Integrity reaches 45 TE on Nov 5 at 4:00 pm"): RouteTimeline.vue, under
 * a row's arrow on By a date, the instant answer's counts, Fastest's leg table and Your latest run.
 * Inside each ascension the stretches come IN ORDER (`shiftSteps`: "C1 · Curiosity · … · 29 min"), so
 * the build-up (C1, I1, K1, C2, K2, R1 in the first hour) shows; the per-egg first/last is a footer.
 *
 * Read from a route's simulated legs (LegSummary): each stop is reached at its leg's `endTime` with its
 * `endTE`; inside a leg, `shifts[k].at` is when the farm switches TO `shifts[k].egg`, the leg opens on
 * `shifts[0].fromEgg` at `startTime`, and an egg's stretch ends at the next shift (or at `endTime`).
 *
 * An egg's TE when the farm moves off it is the shift's `te` (search/leg.ts `shiftInstants`, from the
 * shift action's own end state: nothing is laid between that state and the switch). The egg a leg ends
 * on has no shift off it: its TE is the leg's `endEgg.te` (the leg's own end state). Legs priced before
 * 15 Oct 2026, and replayed legs, have neither: their eggs keep the times and the TE is null, never a
 * guess.
 *
 * Pure: no Vue, no stores. Also home of `eggBlocks`, which ChainSearchPanel's leg table and Your latest
 * run each kept a copy of.
 */
import { formatDuration } from '@/lib/format';
import type { LegSummary } from './types';

export interface EggBlock {
  egg: string;
  at: number;
  /** How long the farm stays on it: "1d 2h", or "—" when the next moment isn't known. */
  length: string;
  /** False for the block the leg opens on: there is nothing to do, you are already there. */
  isSwitch: boolean;
}

/** The eggs a leg lays, in order, INCLUDING the one it opens on. The opening block needs both a name
 *  and a start: `fromEgg` is only recorded from the build that added it, and `startTime` is optional on
 *  LegSummary, so a checkpoint written by older code simply does not get that block rather than a wrong
 *  one. */
export function eggBlocks(leg: LegSummary): EggBlock[] {
  const shifts = leg.shifts ?? [];
  if (!shifts.length) return [];
  const span = (from: number, to: number | undefined) =>
    to !== undefined && to > from ? formatDuration(to - from) : '—';
  const blocks: EggBlock[] = [];
  const opener = shifts[0].fromEgg;
  if (opener && leg.startTime) {
    blocks.push({ egg: opener, at: leg.startTime, length: span(leg.startTime, shifts[0].at), isSwitch: false });
  }
  shifts.forEach((sh, k) => {
    blocks.push({
      egg: sh.egg,
      at: sh.at,
      length: span(sh.at, k + 1 < shifts.length ? shifts[k + 1].at : leg.endTime),
      isSwitch: true,
    });
  });
  return blocks;
}

/** One egg inside one ascension. */
export interface EggStretch {
  egg: string;
  /** When the farm first moves onto it in this ascension (the leg's start when the leg opens on it). */
  firstAt: number;
  /** The leg opens on it: no shift needed to get there. */
  opens: boolean;
  /** When the farm last moves off it: its last shift off, or the leg's end when the leg ends on it. */
  lastAt: number;
  /** The leg ends on it (it is the egg being laid when the stop is reached). */
  ends: boolean;
  /** Its TE at `lastAt` (lifetime, as the game counts it); null when the leg didn't record it. */
  te: number | null;
}

/** One stretch on one egg, in the order the farm lays them: "C1 · Curiosity · Oct 29 at 7:00 pm · 29 min". */
export interface ShiftStep {
  /** "C1", "I1", "K3": the egg's initial and which time in this ascension the farm is on it, the opener
   *  counting as 1 (the Single run's scheme: ActionHistory.vue's visitCounts, ActionGroup.vue's header).
   *  Null when the leg doesn't name the egg it opens on: the counts could be one short, so no label. */
  label: string | null;
  egg: string;
  /** When the farm moves onto it (the leg's start for the opener), unix seconds. */
  start: number;
  /** How long it is laid; null when the stretch's end isn't known. */
  seconds: number | null;
  /** The egg's TE when the farm moves off it (the shift's `te`, or the leg's `endEgg` for the last
   *  stretch); null when the leg didn't record it. */
  te: number | null;
  /** Nothing is laid: the farm shifts on in the same instant (an artifact swap or a build step). */
  noLaying: boolean;
}

/** One ascension of a route. */
export interface AscensionLine {
  /** 1-based. */
  asc: number;
  /** TE when it ends (the stop reached, or above it when a sale wait overshoots). */
  stopTE: number;
  /** When the stop is reached, unix seconds; null when the leg has no usable end time. */
  reachedAt: number | null;
  /** Its eggs in the order the farm first lays them; empty when the leg kept no shifts. */
  eggs: EggStretch[];
  /** Every stretch in order (the build-up shows); empty when the leg kept no shifts. */
  steps: ShiftStep[];
}

const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const teOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A leg's stretches in order: the one it opens on (the first shift's `fromEgg`, from `startTime`), then
 *  one per shift until the next shift, the last until `endTime`. A leg that never shifts is one stretch on
 *  its end egg. Legs without shifts (replayed, read back) give none. */
export function shiftSteps(leg: LegSummary): ShiftStep[] {
  const shifts = Array.isArray(leg.shifts) ? leg.shifts : [];
  const end = ok(leg.endTime) ? leg.endTime : null;
  const raw: { egg: string; start: number; end: number | null; te: number | null }[] = [];
  const opener = shifts.length ? shifts[0].fromEgg : leg.endEgg?.egg;
  const opens = !!opener && ok(leg.startTime);
  if (opens) {
    const stop = shifts.length ? shifts[0].at : end;
    const te = shifts.length
      ? teOf(shifts[0].te)
      : leg.endEgg && leg.endEgg.egg === opener
        ? teOf(leg.endEgg.te)
        : null;
    raw.push({ egg: opener!, start: leg.startTime!, end: stop, te });
  }
  shifts.forEach((sh, k) => {
    const next = shifts[k + 1];
    let te: number | null = null;
    if (next) {
      if (!next.fromEgg || next.fromEgg === sh.egg) te = teOf(next.te);
    } else if (leg.endEgg && leg.endEgg.egg === sh.egg) {
      te = teOf(leg.endEgg.te);
    }
    raw.push({ egg: sh.egg, start: sh.at, end: next ? next.at : end, te });
  });
  const count = new Map<string, number>();
  return raw.map(r => {
    const n = (count.get(r.egg) ?? 0) + 1;
    count.set(r.egg, n);
    const seconds = r.end !== null && Number.isFinite(r.start) ? Math.max(0, r.end - r.start) : null;
    return {
      label: opens && r.egg ? `${r.egg.charAt(0).toUpperCase()}${n}` : null,
      egg: r.egg,
      start: r.start,
      seconds,
      te: r.te,
      noLaying: seconds !== null && Math.round(seconds) === 0,
    };
  });
}

/** How long a stretch is laid: "0 s", "55 s", "29 min", "3 h 5 min", "14 d 23 h". */
export function stepLength(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 10 && s % 60) return `${m} min ${s % 60} s`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

function eggsOf(leg: LegSummary): EggStretch[] {
  const shifts = Array.isArray(leg.shifts) ? leg.shifts : [];
  const end = ok(leg.endTime) ? leg.endTime : null;
  const byEgg = new Map<string, EggStretch>();
  const order: string[] = [];
  const onto = (egg: string, at: number, opens: boolean) => {
    if (!egg) return;
    if (!byEgg.has(egg)) {
      byEgg.set(egg, { egg, firstAt: at, opens, lastAt: at, ends: false, te: null });
      order.push(egg);
    }
  };
  const offOf = (egg: string, at: number, te: number | null) => {
    const e = byEgg.get(egg);
    if (!e) return;
    e.lastAt = at;
    e.ends = false;
    e.te = te;
  };
  // The egg the farm is on at each moment: the opener first (when named), then each shift's egg.
  // A leg without a shift stays on one egg the whole way: the one it ends on.
  let current = (shifts.length ? shifts[0].fromEgg : leg.endEgg?.egg) ?? '';
  if (current && ok(leg.startTime)) onto(current, leg.startTime, true);
  for (const sh of shifts) {
    const from = sh.fromEgg || current;
    if (from && !byEgg.has(from) && ok(leg.startTime)) onto(from, leg.startTime, true);
    if (from) offOf(from, sh.at, typeof sh.te === 'number' && Number.isFinite(sh.te) ? sh.te : null);
    onto(sh.egg, sh.at, false);
    current = sh.egg;
  }
  // The egg the leg ends on: its last stretch runs to the leg's end, at the TE the leg's end state has.
  if (current && end !== null) {
    const e = byEgg.get(current);
    if (e) {
      e.lastAt = end;
      e.ends = true;
      const last = leg.endEgg;
      e.te = last && last.egg === current && Number.isFinite(last.te) ? last.te : null;
    }
  }
  return order.map(k => byEgg.get(k)!);
}

/** A route's ascensions, one line each (RouteTimeline.vue). Legs beyond the chain are ignored; a
 *  chain longer than its legs gives lines only for the legs there are. */
export function routeTimeline(chain: number[], legs: LegSummary[] | null | undefined): AscensionLine[] {
  const list = Array.isArray(legs) ? legs : [];
  return list.slice(0, Math.max(chain.length, list.length)).map((leg, i) => ({
    asc: i + 1,
    stopTE: typeof leg.endTE === 'number' ? leg.endTE : chain[i],
    reachedAt: ok(leg.endTime) ? leg.endTime : null,
    eggs: eggsOf(leg),
    steps: shiftSteps(leg),
  }));
}

/** Every moment a timeline shows (each stop, each egg's first and last, each step's start), for
 *  `spansYears`. */
export function timelineMoments(lines: readonly AscensionLine[]): number[] {
  const out: number[] = [];
  for (const l of lines) {
    if (l.reachedAt !== null) out.push(l.reachedAt);
    for (const e of l.eggs) out.push(e.firstAt, e.lastAt);
    for (const s of l.steps) out.push(s.start);
  }
  return out;
}

/** True when the legs say when each egg happens (any leg kept its shifts). */
export function hasEggTimes(legs: LegSummary[] | null | undefined): boolean {
  return Array.isArray(legs) && legs.some(l => Array.isArray(l.shifts) && l.shifts.length > 0);
}
