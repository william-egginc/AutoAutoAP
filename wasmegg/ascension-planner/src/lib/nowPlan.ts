/**
 * My runs' "Right now" card (spec myruns-now v3, section 2), from a SAVED instant answer only: the snapshot the
 * instant answer keeps once Check exactly has finished (search/instantSnapshot.ts, `aap-instant-snap:<key>`).
 * Nothing here simulates or prices anything: it reads the routes, the exact check's legs (each shift's time,
 * egg and TE) and the table's own legs, and lays them out against the clock.
 *
 *   planFromSnapshot  the lead route of a snapshot (Fastest: Check exactly's soonest; By a date: its highest TE),
 *                     its legs when they were kept, when it was worked out, its runner-up gap.
 *   planEvents        the shifts, prestiges and the goal, each with past / not done yet / next flags.
 *   onTrack           a newer save against where the plan (made from an older one) expected it (lib/planPace.ts).
 *   shiftsAfter       how many shifts the plan has after a moment (the "all planned shifts" tile).
 *
 * Pure: no Vue, no stores; `now` is always a parameter.
 */
import type { LegSummary } from '@/search/types';
import type { SnapMeta, SnapWhatIf } from '@/search/instantSnapshot';
import type { FoundLevel } from './searchPointer';
import type { StepLeg, StepLine } from './instantSteps';
import { paceLine, paceWords, planPace, type PaceState, type PaceTone } from './planPace';

/** A table route as the snapshot keeps it (search/routeFinder.ts Route / RouteLeg). */
export interface SnapRoute {
  chain: number[];
  legs: {
    from?: number;
    to: number;
    endTE: number;
    start: number;
    end: number;
    label?: string;
    /** Each shift after the build-up from the table's replay (search/legShifts.ts, RouteLeg.shifts): My runs'
     *  estimate asks for them; a snapshot's own routes have none. */
    shifts?: { at: number; egg: string }[];
    /** routeFinder.ts RouteLeg's held opening: the prestige into it waited for a morning where its opening fits. */
    heldOpening?: 'morning' | 'uncertain';
    wanted?: number;
    /** The current ascension simulated on the live save (lib/followSim.ts `withCurrentSim`): its start, end and
     *  shifts are exact, and `buildEnd` is when its build phase ends. */
    simulated?: boolean;
    buildEnd?: number;
  }[];
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
  /** The last Fast, Exact or Custom result for this goal and save (lib/searchPlan.ts `SnapSearch`; since 23 Oct
   *  2026). Read with `readSearch`. */
  search?: unknown;
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
  /** The simulator's times on the account (a search's result, or before 23 Oct 2026 Check exactly's), not only the
   *  instant answer's. */
  exact: boolean;
  /** A Fast, Exact or Custom result's plan (lib/searchPlan.ts): which level and when it was found (ms). Absent: the
   *  instant answer's (or an older snapshot's Check exactly). */
  from?: { level: FoundLevel; at: number };
  /** A followed route priced on the instant answer's data on this page (lib/followEstimate.ts): the table's times,
   *  rounded like the instant answer's own. Absent otherwise. */
  estimated?: boolean;
  /** By a date: the instant answer's own TE for the date (Check exactly confirms it when equal). */
  instantTE: number | null;
  /** When it was worked out, ms. */
  calculatedAt: number;
  /** The plan start the times are from, unix seconds. */
  planStart: number | null;
  /** By a date: hours between the last stop and the deadline. */
  spareHours: number | null;
  /** By a date, the table's route kept when Check exactly found NO route in time on the account: when that route
   *  lands there (unix seconds; Infinity when it wasn't timed). lib/eggDayRule.ts then counts the plan as late.
   *  Absent otherwise. */
  accountEnd?: number;
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
  // Check exactly ran (a row per count) and every count missed the date (null): the table's route is late on the
  // account, at its own exact price when it has one.
  const byK = Object.values(snap.dateExactByK ?? {});
  const missed = byK.length > 0 && byK.every(d => d == null);
  const priced = exactOf(table.chain);
  const timed = priced && Number.isFinite(priced.end) && deadline != null && priced.end > deadline;
  const accountEnd = missed ? (timed ? priced.end : Infinity) : undefined;
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
    ...(accountEnd !== undefined ? { accountEnd } : {}),
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

/**
 * One route's plan from a snapshot's INSTANT answer, for a route the player follows (lib/followPrice.ts): the goal's
 * lead when it is that route, else the table's own row for it (Fastest one per count, By a date the lead and one per
 * count). The table's times (prestige times only, `exact` false: Right now rounds them, no calendar). Null when the
 * instant answer has no such route. No runner-up: it is the player's pick, not the planner's.
 */
export function planFromInstantChain(
  snap: SnapLike | null,
  chain: readonly number[],
  goal: 'fastest' | 'date',
  deadline: number | null = null
): NowPlan | null {
  if (!snap?.result || !chain.length) return null;
  const lead = planFromSnapshot(snap, goal, deadline);
  if (lead && !lead.exact && key(lead.chain) === key(chain)) return { ...lead, runnerUpHours: null, runnerUp: null };
  const rows = goal === 'fastest' ? [snap.result.best, ...(snap.result.byAscensions ?? [])] : [snap.result.byDate ?? null, ...(snap.result.byDateByAscensions ?? [])];
  const r = rows.find((x): x is SnapRoute => !!x && Array.isArray(x.chain) && key(x.chain) === key(chain) && Number.isFinite(x.end));
  if (!r) return null;
  return {
    goal,
    deadline: goal === 'date' ? deadline : null,
    chain: [...r.chain],
    end: r.end,
    endTE: lastTE(r),
    legs: null,
    tableLegs: r.legs ?? null,
    exact: false,
    instantTE: goal === 'date' ? lastTE(r) : null,
    spareHours: goal === 'date' && deadline ? (deadline - r.end) / 3600 : null,
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
  /** Prestige: it waits for the player's hours ('hours') or past a no-prestige day ('days'), and happens at
   *  `prestigeAt` rather than when the stop is reached (`at`): lib/instantSteps.ts, `markPrestigeWaits`. */
  wait?: 'hours' | 'days';
  prestigeAt?: number;
  /** Goal (By a date): hours to spare. */
  spareHours?: number | null;
  past: boolean;
  /** Its time has passed but the save doesn't show it done yet (still on the egg before the shift, short of the
   *  prestige's TE): not `past`, shown as "Not done yet", and Next step leads with it. */
  notDone?: boolean;
  /** The first event still to do (a not-done-yet one, else the first ahead). */
  next: boolean;
}

/** What the save shows done: the egg its farm is on (null: not known) and its whole TE. */
export interface SaveDone {
  egg: string | null;
  te: number;
}

/**
 * Every shift (from the exact legs), every prestige (each leg's end; the table's legs when the exact ones weren't
 * kept) and the goal: Fastest's last stop ("reach 490"), By a date's last prestige then the date itself. In time
 * order, `next` on the first one still to do.
 *
 * Done is the save's state, not the clock alone (My runs review, 22 Oct 2026, bug 2: the shift due 1.5 h after the
 * save showed "passed" while the save was still on the egg before it). Of the events whose time has passed, a shift
 * is shown done when the save is on its egg, a prestige when the save has its TE; every event before the last one
 * shown done is done too (the save is past it). One after that whose effect the save doesn't show is `notDone`. The
 * goal, and a shift when the save's egg isn't known, go by the clock. Without `save`: the clock only.
 */
export function planEvents(plan: NowPlan, nowSeconds: number, save: SaveDone | null = null): PlanEvent[] {
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
      // The table's shifts when the estimate carried them (each after the build-up, to the hour).
      for (const sh of leg.shifts ?? []) if (Number.isFinite(sh.at)) out.push({ kind: 'shift', at: sh.at, asc: i + 1, egg: sh.egg });
      if (!Number.isFinite(leg.end)) return;
      const te = leg.endTE ?? leg.to;
      if (i === n - 1 && plan.goal === 'fastest') out.push({ kind: 'goal', at: leg.end, asc: i + 1, te });
      else out.push({ kind: 'prestige', at: leg.end, asc: i + 1, te });
    });
  }
  if (plan.goal === 'date' && plan.deadline)
    out.push({ kind: 'goal', at: plan.deadline, asc: n, te: plan.endTE, spareHours: plan.spareHours });
  out.sort((a, b) => a.at - b.at || order(a.kind) - order(b.kind));
  // true: the save shows it done; false: it doesn't; null: the save can't say (the clock decides).
  const shows = (e: (typeof out)[number]): boolean | null => {
    if (!save) return null;
    if (e.kind === 'shift') return save.egg ? save.egg === e.egg : null;
    if (e.kind === 'prestige') return typeof e.te === 'number' ? save.te >= e.te : null;
    return null;
  };
  let lastShown = -1;
  out.forEach((e, i) => {
    if (e.at <= nowSeconds && shows(e) === true) lastShown = i;
  });
  let nextSet = false;
  return out.map((e, i) => {
    const notDone = e.at <= nowSeconds && i > lastShown && shows(e) === false;
    const past = e.at <= nowSeconds && !notDone;
    const next = !past && !nextSet;
    if (next) nextSet = true;
    return { ...e, past, ...(notDone ? { notDone } : {}), next };
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
      const notDone = !!(prev.notDone || e.notDone);
      out[out.length - 1] = {
        ...prev,
        eggs,
        egg: e.egg,
        next: prev.next || e.next,
        past: prev.past && e.past,
        ...(notDone ? { notDone } : {}),
      };
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

/**
 * The table's shifts of `route` (the same route priced again with its shifts, search/legShifts.ts) put on the plan's
 * table legs, each only where that leg is the same one (same stop, start and end within ten minutes). The plan as it
 * was when none fits, it has exact legs, or its legs already list shifts.
 */
export function withTableShifts(
  plan: NowPlan,
  route: { legs: readonly { to: number; start: number; end: number; shifts?: { at: number; egg: string }[] }[] } | null | undefined
): NowPlan {
  if (!plan.tableLegs || plan.legs || !route?.legs?.length) return plan;
  let any = false;
  const tableLegs = plan.tableLegs.map((l, i) => {
    const r = route.legs[i];
    if (l.shifts?.length || !r?.shifts?.length || r.to !== l.to || !(Math.abs(r.start - l.start) <= 600) || !(Math.abs(r.end - l.end) <= 600))
      return l;
    any = true;
    return { ...l, shifts: r.shifts.map(sh => ({ at: sh.at, egg: sh.egg })) };
  });
  return any ? { ...plan, tableLegs } : plan;
}

/** The plan's ascensions as lib/instantSteps.ts reads them: the exact legs, else the table's. */
export function stepLegsOf(plan: NowPlan): StepLeg[] {
  const n = plan.chain.length;
  if (plan.legs)
    return plan.legs.slice(0, n).flatMap((l, i) => {
      const start = l.startTime ?? l.endTime - l.durationSeconds;
      const prev = plan.legs![i - 1];
      return Number.isFinite(start) && Number.isFinite(l.endTime)
        ? [{ from: prev ? prev.endTE : 0, to: plan.chain[i], endTE: l.endTE, start, end: l.endTime }]
        : [];
    });
  return (plan.tableLegs ?? []).slice(0, n).map(l => ({
    from: l.from ?? 0,
    to: l.to,
    endTE: l.endTE ?? l.to,
    start: l.start,
    end: l.end,
    ...(l.heldOpening ? { heldOpening: l.heldOpening } : {}),
    ...(l.wanted !== undefined ? { wanted: l.wanted } : {}),
  }));
}

/** Each prestige that waits (lib/instantSteps.ts: the line of the ascension it starts) marked with why and when it
 *  happens. The prestige ending ascension `asc` starts ascension `asc + 1`. */
export function markPrestigeWaits(events: readonly PlanEvent[], lines: readonly StepLine[]): PlanEvent[] {
  return events.map(e => {
    if (e.kind !== 'prestige') return e;
    const l = lines.find(x => x.asc === e.asc + 1);
    return l?.wait ? { ...e, wait: l.wait, prestigeAt: l.prestigeAt } : e;
  });
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
 * next prestige (or the goal), at most `max` ahead, then EVERY later ascension's prestige (26 Oct 2026, Jordan: the
 * table showed only the next prestige and the goal, two rows; their shifts are in the Full timeline), then the goal
 * row when it is not among them.
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
  const last = shown[shown.length - 1];
  for (const e of ahead) if (e.kind === 'prestige' && !shown.includes(e) && (!last || e.at >= last.at)) shown.push(e);
  const goal = events.find(e => e.kind === 'goal');
  if (goal && !shown.includes(goal)) shown.push(goal);
  return shown;
}

/** The plan's prestiges (each ascension's end, as `planEvents` has them: Fastest's last stop is the goal, not a
 *  prestige), with the TE each prestiges at; from the exact legs, else the table's. Past ones included. */
export function planPrestiges(plan: NowPlan): { at: number; te: number }[] {
  return planEvents(plan, 0)
    .filter(e => e.kind === 'prestige' && Number.isFinite(e.at))
    .map(e => ({ at: e.at, te: e.te ?? 0 }));
}

/** How many shifts the plan makes after `afterSeconds`: from the exact legs, else the shifts the table's legs list
 *  (search/legShifts.ts: each after the build-up, so the openings' are not counted); null when neither lists any. */
export function shiftsAfter(plan: NowPlan, afterSeconds: number): number | null {
  const legs = plan.legs ?? (plan.tableLegs?.some(l => Array.isArray(l.shifts) && l.shifts.length) ? plan.tableLegs : null);
  if (!legs) return null;
  let n = 0;
  for (const leg of legs.slice(0, plan.chain.length)) for (const sh of leg.shifts ?? []) if (sh.at > afterSeconds) n++;
  return n;
}

// ----------------------------------------------------------------------------------- on track

// The plan's TE line and the pace live in lib/planPace.ts (R6, 21 Oct 2026), shared with My runs' saved runs and
// answers so Right now's chip and their badges can never disagree; re-exported here for this module's callers.
export { SAVE_EGG_ORDER, planTEAt } from './planPace';

/** Right now's chip state: planPace's (one wording everywhere). */
export type TrackState = PaceState;

/**
 * Is the loaded save ahead of or behind the plan? A thin wrapper over lib/planPace.ts: the plan's line from its
 * exact legs (shift by shift with `meta.teByEgg`, else leg by leg), or from the instant answer's table legs (leg by
 * leg, "(estimate)"); the plan's own save is `meta.backupTime`. `progress`: the save's whole TE (planPace
 * `progressOf`); without it the TE per egg summed. `egg`: the egg the save's farm is on (another egg than the plan's
 * then: "Can't compare right now").
 */
export function onTrack(
  plan: NowPlan,
  save: { seconds: number; teByEgg: readonly number[]; progress?: number; onVirtue?: boolean; egg?: string | null }
): TrackState {
  const legs = plan.legs ? plan.legs.slice(0, plan.chain.length) : null;
  const tableLegs =
    !legs && plan.tableLegs
      ? plan.tableLegs.slice(0, plan.chain.length).map(l => ({ start: l.start, end: l.end, endTE: l.endTE ?? l.to }))
      : null;
  const byEgg = plan.meta?.teByEgg && plan.meta.teByEgg.length === 5 ? plan.meta.teByEgg : null;
  const line = paceLine({
    legs,
    tableLegs,
    planStart: plan.planStart,
    startTEByEgg: byEgg,
    planSave: plan.meta?.backupTime ?? null,
    estimate: !plan.exact,
  });
  return planPace(line, {
    seconds: save.seconds,
    progress: save.progress ?? save.teByEgg.reduce((a, b) => a + b, 0),
    onVirtue: save.onVirtue ?? true,
    egg: save.egg ?? null,
  });
}

/** The chip's words (planPace `paceWords`): "3 hours behind, as of 3:42 pm". */
export function trackWords(s: TrackState, nowSeconds: number, zone: string): { tone: PaceTone; text: string } {
  const w = paceWords(s, nowSeconds, zone);
  return { tone: w.tone, text: w.text };
}
