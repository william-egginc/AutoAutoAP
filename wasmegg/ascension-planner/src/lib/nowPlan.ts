/**
 * My runs' "Right now" card (spec myruns-now v3, section 2), from a SAVED instant answer only: the snapshot the
 * instant answer keeps once Check exactly has finished (search/instantSnapshot.ts, `aap-instant-snap:<key>`).
 * Nothing here simulates or prices anything: it reads the routes, the exact check's legs (each shift's time,
 * egg and TE) and the table's own legs, and lays them out against the clock.
 *
 *   planFromSnapshot  the lead route of a snapshot (Fastest: Check exactly's soonest; By a date: its highest TE),
 *                     its legs when they were kept, when it was worked out, its runner-up gap.
 *   planEvents        the shifts, prestiges and the goal, each with past / next flags.
 *   onTrack           a newer save against where the plan (made from an older one) expected it.
 *   shiftsAfter       how many shifts the plan has after a moment (the "all planned shifts" tile).
 *
 * Pure: no Vue, no stores; `now` is always a parameter.
 */
import type { LegSummary } from '@/search/types';
import type { SnapMeta, SnapWhatIf } from '@/search/instantSnapshot';

/** A table route as the snapshot keeps it (search/routeFinder.ts Route / RouteLeg). */
export interface SnapRoute {
  chain: number[];
  legs: { from?: number; to: number; endTE: number; start: number; end: number; label?: string }[];
  end: number;
  seconds?: number;
}

/** Check exactly's price of one route (InstantRoute.vue `Exact`). */
export interface SnapExact {
  end: number;
  endTE: number;
  legs?: LegSummary[] | null;
}

/** By a date's exact answer (InstantRoute.vue `DateExact`). */
export interface SnapDateExact {
  chain: number[];
  endTE: number;
  end: number;
}

/** The fields of the instant answer's snapshot this module reads. */
export interface SnapLike {
  at: number;
  result: {
    best: SnapRoute | null;
    byAscensions: (SnapRoute | null)[];
    byDate?: SnapRoute | null;
    byDateByAscensions?: (SnapRoute | null)[];
  };
  exact?: Record<string, SnapExact | null> | null;
  dateExact?: SnapDateExact | null;
  dateExactByK?: Record<number, SnapDateExact | null> | null;
  answerStart?: number;
  meta?: SnapMeta;
  whatIf?: SnapWhatIf | null;
}

export interface NowPlan {
  goal: 'fastest' | 'date';
  /** By a date's deadline, unix seconds. */
  deadline: number | null;
  chain: number[];
  /** When the last stop is reached, unix seconds. */
  end: number;
  endTE: number;
  /** The exact check's legs (shifts inside); null when they weren't kept (the snapshot was too big). */
  legs: LegSummary[] | null;
  /** The table's legs (prestige times only), for when `legs` is null. */
  tableLegs: SnapRoute['legs'] | null;
  /** The lead is Check exactly's (the simulator on the account), not only the instant answer's. */
  exact: boolean;
  /** By a date: the instant answer's own TE for the date (Check exactly confirms it when equal). */
  instantTE: number | null;
  /** When it was worked out, ms. */
  calculatedAt: number;
  /** The plan start the times are from, unix seconds. */
  planStart: number | null;
  /** By a date: hours between the last stop and the deadline. */
  spareHours: number | null;
  /** How far behind the next-best route is, hours; Infinity when every other route makes less TE (By a date);
   *  null when there is no other to compare. */
  runnerUpHours: number | null;
  /** That next-best route, when there is one with a time (for "another route ties it exactly (…)"). */
  runnerUp?: { chain: number[]; end: number; endTE: number } | null;
  meta: SnapMeta | null;
  whatIf: SnapWhatIf | null;
}

const key = (chain: readonly number[]) => chain.join(',');
const lastTE = (r: SnapRoute) => r.legs[r.legs.length - 1]?.endTE ?? r.chain[r.chain.length - 1] ?? 0;

/** The lead route of a saved answer, or null when it has none. */
export function planFromSnapshot(snap: SnapLike | null, goal: 'fastest' | 'date', deadline: number | null = null): NowPlan | null {
  if (!snap?.result) return null;
  const exactOf = (chain: readonly number[]) => snap.exact?.[key(chain)] ?? null;
  const common = {
    calculatedAt: snap.at,
    planStart: typeof snap.answerStart === 'number' ? snap.answerStart : null,
    meta: snap.meta ?? null,
    whatIf: snap.whatIf ?? null,
  };
  if (goal === 'fastest') {
    const routes = (snap.result.byAscensions ?? []).filter((r): r is SnapRoute => !!r && Array.isArray(r.chain));
    const priced = routes
      .map(r => ({ r, e: exactOf(r.chain) }))
      .filter((x): x is { r: SnapRoute; e: SnapExact } => !!x.e && Number.isFinite(x.e.end))
      .sort((a, b) => a.e.end - b.e.end);
    if (priced.length) {
      const { r, e } = priced[0];
      return {
        goal,
        deadline: null,
        chain: [...r.chain],
        end: e.end,
        endTE: e.endTE,
        legs: Array.isArray(e.legs) && e.legs.length ? e.legs : null,
        tableLegs: r.legs ?? null,
        exact: true,
        instantTE: null,
        spareHours: null,
        runnerUpHours: priced[1] ? (priced[1].e.end - e.end) / 3600 : null,
        runnerUp: priced[1] ? { chain: [...priced[1].r.chain], end: priced[1].e.end, endTE: priced[1].e.endTE } : null,
        ...common,
      };
    }
    const best = snap.result.best;
    if (!best) return null;
    const others = routes.filter(r => key(r.chain) !== key(best.chain)).sort((a, b) => a.end - b.end);
    return {
      goal,
      deadline: null,
      chain: [...best.chain],
      end: best.end,
      endTE: lastTE(best),
      legs: null,
      tableLegs: best.legs ?? null,
      exact: false,
      instantTE: null,
      spareHours: null,
      runnerUpHours: others[0] ? (others[0].end - best.end) / 3600 : null,
      runnerUp: others[0] ? { chain: [...others[0].chain], end: others[0].end, endTE: lastTE(others[0]) } : null,
      ...common,
    };
  }
  // By a date.
  const table = snap.result.byDate ?? null;
  const lead = snap.dateExact ?? null;
  const spare = (end: number) => (deadline ? (deadline - end) / 3600 : null);
  if (lead && Array.isArray(lead.chain) && lead.chain.length) {
    const e = exactOf(lead.chain);
    const others = Object.values(snap.dateExactByK ?? {}).filter(
      (d): d is SnapDateExact => !!d && Array.isArray(d.chain) && key(d.chain) !== key(lead.chain)
    );
    const sameTE = others.filter(d => d.endTE >= lead.endTE).sort((a, b) => a.end - b.end);
    const runnerUpHours = sameTE.length ? Math.max(0, (sameTE[0].end - lead.end) / 3600) : others.length ? Infinity : null;
    const tableRoute = [table, ...(snap.result.byDateByAscensions ?? [])].find(r => r && key(r.chain) === key(lead.chain));
    return {
      goal,
      deadline,
      chain: [...lead.chain],
      end: lead.end,
      endTE: lead.endTE,
      legs: e && Array.isArray(e.legs) && e.legs.length ? e.legs : null,
      tableLegs: tableRoute?.legs ?? null,
      exact: true,
      instantTE: table ? lastTE(table) : null,
      spareHours: spare(lead.end),
      runnerUpHours,
      runnerUp: sameTE.length ? { chain: [...sameTE[0].chain], end: sameTE[0].end, endTE: sameTE[0].endTE } : null,
      ...common,
    };
  }
  if (!table) return null;
  const others = (snap.result.byDateByAscensions ?? []).filter(
    (r): r is SnapRoute => !!r && key(r.chain) !== key(table.chain)
  );
  const sameTE = others.filter(r => lastTE(r) >= lastTE(table)).sort((a, b) => a.end - b.end);
  return {
    goal,
    deadline,
    chain: [...table.chain],
    end: table.end,
    endTE: lastTE(table),
    legs: null,
    tableLegs: table.legs ?? null,
    exact: false,
    instantTE: lastTE(table),
    spareHours: spare(table.end),
    runnerUpHours: sameTE.length ? Math.max(0, (sameTE[0].end - table.end) / 3600) : others.length ? Infinity : null,
    runnerUp: sameTE.length ? { chain: [...sameTE[0].chain], end: sameTE[0].end, endTE: lastTE(sameTE[0]) } : null,
    ...common,
  };
}

/**
 * One route's plan from a snapshot's Check exactly prices (`exact`, keyed by the route as priced from that save), for
 * a route the player follows (lib/followPrice.ts); null when that route wasn't priced there. No runner-up: it is the
 * player's pick, not the planner's.
 */
export function planFromExactChain(
  snap: SnapLike | null,
  chain: readonly number[],
  goal: 'fastest' | 'date',
  deadline: number | null = null
): NowPlan | null {
  const e = snap?.exact?.[key(chain)] ?? null;
  if (!snap || !e || !Number.isFinite(e.end)) return null;
  const tableRoute = [
    ...(snap.result?.byAscensions ?? []),
    snap.result?.byDate ?? null,
    ...(snap.result?.byDateByAscensions ?? []),
  ].find(r => r && Array.isArray(r.chain) && key(r.chain) === key(chain));
  return {
    goal,
    deadline: goal === 'date' ? deadline : null,
    chain: [...chain],
    end: e.end,
    endTE: e.endTE,
    legs: Array.isArray(e.legs) && e.legs.length ? e.legs : null,
    tableLegs: tableRoute?.legs ?? null,
    exact: true,
    instantTE: null,
    spareHours: goal === 'date' && deadline ? (deadline - e.end) / 3600 : null,
    runnerUpHours: null,
    runnerUp: null,
    calculatedAt: snap.at,
    planStart: typeof snap.answerStart === 'number' ? snap.answerStart : null,
    meta: snap.meta ?? null,
    whatIf: snap.whatIf ?? null,
  };
}

// ------------------------------------------------------------------------------------- events

export interface PlanEvent {
  kind: 'shift' | 'prestige' | 'goal';
  /** Unix seconds. */
  at: number;
  /** 1-based ascension of the plan it belongs to. */
  asc: number;
  /** Shift: the egg shifted to (the last one, for shifts merged by `mergeSimultaneousShifts`). */
  egg?: string;
  /** Shifts at the same minute shown as one row (`mergeSimultaneousShifts`): every egg shifted to, in order. */
  eggs?: string[];
  /** Prestige: the TE it prestiges at. Goal: the goal's TE. */
  te?: number;
  /** Goal (By a date): hours to spare. */
  spareHours?: number | null;
  past: boolean;
  /** The first event still ahead. */
  next: boolean;
}

/**
 * Every shift (from the exact legs), every prestige (each leg's end; the table's legs when the exact ones weren't
 * kept) and the goal: Fastest's last stop ("reach 490"), By a date's last prestige then the date itself. In time
 * order, `past` before `nowSeconds`, `next` on the first one ahead.
 */
export function planEvents(plan: NowPlan, nowSeconds: number): PlanEvent[] {
  const out: Omit<PlanEvent, 'past' | 'next'>[] = [];
  const n = plan.chain.length;
  if (plan.legs) {
    plan.legs.slice(0, n).forEach((leg, i) => {
      for (const sh of leg.shifts ?? []) if (Number.isFinite(sh.at)) out.push({ kind: 'shift', at: sh.at, asc: i + 1, egg: sh.egg });
      const te = typeof leg.endTE === 'number' ? leg.endTE : plan.chain[i];
      if (!Number.isFinite(leg.endTime)) return;
      if (i === n - 1 && plan.goal === 'fastest') out.push({ kind: 'goal', at: leg.endTime, asc: i + 1, te });
      else out.push({ kind: 'prestige', at: leg.endTime, asc: i + 1, te });
    });
  } else if (plan.tableLegs) {
    plan.tableLegs.slice(0, n).forEach((leg, i) => {
      if (!Number.isFinite(leg.end)) return;
      const te = leg.endTE ?? leg.to;
      if (i === n - 1 && plan.goal === 'fastest') out.push({ kind: 'goal', at: leg.end, asc: i + 1, te });
      else out.push({ kind: 'prestige', at: leg.end, asc: i + 1, te });
    });
  }
  if (plan.goal === 'date' && plan.deadline)
    out.push({ kind: 'goal', at: plan.deadline, asc: n, te: plan.endTE, spareHours: plan.spareHours });
  out.sort((a, b) => a.at - b.at || order(a.kind) - order(b.kind));
  let nextSet = false;
  return out.map(e => {
    const past = e.at <= nowSeconds;
    const next = !past && !nextSet;
    if (next) nextSet = true;
    return { ...e, past, next };
  });
}
const order = (k: PlanEvent['kind']) => (k === 'shift' ? 0 : k === 'prestige' ? 1 : 2);

/** The minute an instant falls in, in `zone` ("2026-10-17 04:16"): two shifts with the same are "at once". */
function minuteKey(at: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(at * 1000));
  } catch {
    return String(Math.floor(at / 60));
  }
}

/**
 * Shifts at the same minute (in the planner's zone) as ONE row: the plan really does that (Joo's H1 step shifts to
 * Humility to swap to the production set, then K3 shifts straight on to Kindness; both are charged), and two rows
 * with the same time read as a mistake (Jordan, 16 Oct: "Shift to Humility Sat Oct 17 at 4:16 am" twice over).
 * Only shifts next to each other merge; a prestige or the goal never does. The merged row keeps the first
 * shift's time, `eggs` lists every egg in order and `egg` is the last; it is `next` when any of them was. Counting
 * shifts (the planned-shift total and its cost) reads the legs, never these rows, so both still count.
 */
export function mergeSimultaneousShifts(events: readonly PlanEvent[], zone: string): PlanEvent[] {
  const out: PlanEvent[] = [];
  let lastKey = '';
  for (const e of events) {
    const prev = out[out.length - 1];
    const key = e.kind === 'shift' ? minuteKey(e.at, zone) : '';
    if (prev && prev.kind === 'shift' && e.kind === 'shift' && key === lastKey) {
      const eggs = [...(prev.eggs ?? [prev.egg ?? '']), e.egg ?? ''];
      out[out.length - 1] = { ...prev, eggs, egg: e.egg, next: prev.next || e.next, past: prev.past && e.past };
      continue;
    }
    out.push(e);
    lastKey = key;
  }
  return out;
}

/** Joo's H1 step: a shift to Humility for the production set, then straight on to Kindness (K3). */
const isH1Pair = (eggs: readonly string[]) => eggs.length === 2 && eggs[0] === 'humility' && eggs[1] === 'kindness';

/**
 * A shift row's words: "Shift to Humility"; merged, "Shift to Humility (Joo's H1 step: artifact swap), then straight
 * to Kindness" (the known H1/K3 pair), else "Shift to Integrity, then straight to Resilience" (and on, for three).
 * The events table, Next step and the calendar all use it.
 */
export function shiftTitle(e: Pick<PlanEvent, 'egg' | 'eggs'>, eggName: (egg: string) => string): string {
  const eggs = e.eggs && e.eggs.length > 1 ? e.eggs : [e.egg ?? ''];
  const [first, ...rest] = eggs;
  const head = `Shift to ${eggName(first)}${isH1Pair(eggs) ? " (Joo's H1 step: artifact swap)" : ''}`;
  return [head, ...rest.map(x => `straight to ${eggName(x)}`)].join(', then ');
}

/** The plan's ascension the clock is in (1-based), 0 before the plan starts, the last one after it ends. */
export function ascensionAt(plan: NowPlan, nowSeconds: number): number {
  const ends = plan.legs
    ? plan.legs.slice(0, plan.chain.length).map(l => l.endTime)
    : (plan.tableLegs ?? []).slice(0, plan.chain.length).map(l => l.end);
  if (!ends.length) return 0;
  if (plan.planStart && nowSeconds < plan.planStart) return 0;
  const i = ends.findIndex(e => nowSeconds < e);
  return i < 0 ? ends.length : i + 1;
}

/**
 * The events the card's table shows: the last one passed (greyed), then what is ahead up to and including the
 * next prestige (or the goal), at most `max` ahead, then the goal row when it is not among them.
 */
export function tableEvents(events: readonly PlanEvent[], max = 6): PlanEvent[] {
  const past = events.filter(e => e.past && e.kind !== 'goal');
  const ahead = events.filter(e => !e.past);
  const shown: PlanEvent[] = past.length ? [past[past.length - 1]] : [];
  for (const e of ahead) {
    if (e.kind === 'goal') break;
    shown.push(e);
    if (e.kind === 'prestige' || shown.length - (past.length ? 1 : 0) >= max) break;
  }
  const goal = events.find(e => e.kind === 'goal');
  if (goal && !shown.includes(goal)) shown.push(goal);
  return shown;
}

/** How many shifts the plan makes after `afterSeconds` (from the exact legs); null without them. */
export function shiftsAfter(plan: NowPlan, afterSeconds: number): number | null {
  if (!plan.legs) return null;
  let n = 0;
  for (const leg of plan.legs.slice(0, plan.chain.length)) for (const sh of leg.shifts ?? []) if (sh.at > afterSeconds) n++;
  return n;
}

// ----------------------------------------------------------------------------------- on track

/** The save's egg order, as SnapMeta `teByEgg` lists it. */
export const SAVE_EGG_ORDER = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const;

/** Within this many hours either way the save is "on plan". */
export const ON_PLAN_HOURS = 0.5;

export type TrackState =
  | { kind: 'ahead' | 'behind'; hours: number }
  | { kind: 'on-plan' }
  | { kind: 'same-save' }
  | { kind: 'cant'; why: 'no-timeline' | 'no-te' | 'not-started' | 'outside' };

/**
 * The plan's total TE at `t`: each egg's TE where the plan last left it, and the egg being laid moving in a
 * straight line from where it started to the TE it has when the farm next leaves it (a shift's `te`, or the leg's
 * `endEgg`). Null when the legs don't carry those TEs (priced before 15 Oct 2026).
 */
export function planTEAt(legs: readonly LegSummary[], startTE: readonly number[], t: number): number | null {
  const te = new Map<string, number>(SAVE_EGG_ORDER.map((e, i) => [e, startTE[i] ?? 0]));
  for (const leg of legs) {
    const shifts = leg.shifts ?? [];
    let onEgg = shifts[0]?.fromEgg ?? leg.endEgg?.egg ?? '';
    let since = leg.startTime ?? leg.endTime - leg.durationSeconds;
    if (!onEgg) return null;
    const stops = [
      ...shifts.map(s => ({ at: s.at, left: s.fromEgg || '', te: s.te, to: s.egg })),
      { at: leg.endTime, left: leg.endEgg?.egg ?? '', te: leg.endEgg?.te, to: '' },
    ];
    for (const s of stops) {
      const left = s.left || onEgg;
      if (typeof s.te !== 'number' || !Number.isFinite(s.te)) return null;
      const from = te.get(left) ?? 0;
      if (t < s.at) {
        if (t <= since) return sum(te);
        const f = (t - since) / Math.max(1, s.at - since);
        te.set(left, from + (s.te - from) * f);
        return sum(te);
      }
      te.set(left, Math.max(from, s.te));
      onEgg = s.to;
      since = s.at;
    }
  }
  return sum(te);
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/**
 * Is the loaded save ahead of or behind the plan? The plan was made from an older save (`meta.backupTime`,
 * `meta.teByEgg`); the loaded save has `teByEgg` (lifetime, as the game counts it) at `saveSeconds`. Ahead means
 * the plan only expected this much TE later than the save's time. Hours, rounded to the half hour by the caller.
 */
export function onTrack(plan: NowPlan, save: { seconds: number; teByEgg: readonly number[] }): TrackState {
  const meta = plan.meta;
  if (meta && Math.abs(meta.backupTime - save.seconds) < 60) return { kind: 'same-save' };
  if (!plan.legs) return { kind: 'cant', why: 'no-timeline' };
  if (!meta?.teByEgg || meta.teByEgg.length !== 5) return { kind: 'cant', why: 'no-te' };
  const legs = plan.legs.slice(0, plan.chain.length);
  const start = plan.planStart ?? legs[0]?.startTime ?? null;
  if (start === null || save.seconds < start) return { kind: 'cant', why: 'not-started' };
  const last = legs[legs.length - 1]?.endTime ?? start;
  if (save.seconds > last) return { kind: 'cant', why: 'outside' };
  const actual = save.teByEgg.reduce((a, b) => a + b, 0);
  const expected = planTEAt(legs, meta.teByEgg, save.seconds);
  if (expected === null) return { kind: 'cant', why: 'no-te' };
  // When did (or will) the plan reach the save's TE? Bisection on the plan's (non-decreasing) TE line.
  let lo = start;
  let hi = last;
  const atStart = planTEAt(legs, meta.teByEgg, start) ?? 0;
  const atEnd = planTEAt(legs, meta.teByEgg, last) ?? 0;
  if (actual <= atStart) return { kind: 'cant', why: 'outside' };
  if (actual > atEnd) return { kind: 'cant', why: 'outside' };
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if ((planTEAt(legs, meta.teByEgg, mid) ?? 0) >= actual) hi = mid;
    else lo = mid;
  }
  const hours = (hi - save.seconds) / 3600;
  if (Math.abs(hours) < ON_PLAN_HOURS) return { kind: 'on-plan' };
  return hours > 0 ? { kind: 'ahead', hours } : { kind: 'behind', hours: -hours };
}

/** The chip's words. */
export function trackWords(s: TrackState): { tone: 'ok' | 'bad' | 'warn' | 'plain'; text: string } {
  const h = (x: number) => {
    const r = Math.round(x * 2) / 2;
    return r >= 48 ? `${Math.round(r / 24)} days` : `${r} h`;
  };
  switch (s.kind) {
    case 'ahead':
      return { tone: 'ok', text: `${h(s.hours)} ahead of plan` };
    case 'behind':
      return { tone: 'bad', text: `Behind by ${h(s.hours)}` };
    case 'on-plan':
      return { tone: 'ok', text: 'On plan' };
    case 'same-save':
      return { tone: 'plain', text: 'Made from this save' };
    case 'cant':
      return {
        tone: 'warn',
        text:
          s.why === 'no-timeline'
            ? "Can't tell: this plan was saved without its timeline"
            : s.why === 'no-te'
              ? "Can't tell: this plan was saved without each egg's TE"
              : s.why === 'not-started'
                ? "Can't tell yet: the plan hasn't started"
                : "Can't tell: your save is past this plan",
      };
  }
}
