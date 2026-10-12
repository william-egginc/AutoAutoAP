/**
 * A By a date run's timeline, for "Also send diagnostics": how good the time estimate was, and why.
 *
 * The black box (search/blackBox.ts) says what the page was doing when it died. This says how a run
 * that lived went: the estimate it started with and what it said at 10, 50 and 90 %, the minutes it
 * really took, its speed every 10 minutes (with the workers it had, whether the tab was hidden and
 * whether the computer was online), the gaps where the page did not tick for over 2 minutes (the
 * computer asleep, or the browser freezing the tab), every send with its outcome, and what happened
 * to the workers. Numbers and short labels only: no player id, no save, no note, no timestamps (every
 * time is minutes into the run).
 *
 * Why (11 Oct): the estimates were off in ways nobody could check afterwards. A Safari run guessed
 * 6 minutes and took about 20 (it ran on 2 workers, not the 7 the estimate assumed); a 42-hour run's
 * estimate most likely came from this machine's previous run, a 7-minute one. The board row has the routes and
 * nothing about time; the diagnostics had a run's total minutes and nothing about the estimate.
 *
 * One timeline at a time, in localStorage (it outlives a reload or crash, so a carried-on run keeps
 * adding to its own: same `runId`). The pure functions below take the time as an argument; the
 * store-facing ones at the bottom read and write the storage. The payload is bounded
 * (`PAYLOAD_MAX_CHARS`), well inside the collector's 16 KB for a submission's private extras.
 */

const KEY = 'aap.runTimeline';

/** One speed sample this often. */
export const SAMPLE_EVERY_MS = 10 * 60_000;
/** A gap between ticks longer than this is the page not running: the computer asleep, or the tab frozen. */
export const GAP_MS = 2 * 60_000;
/** Samples kept; past it the older half is merged in pairs (each then covers twice the time). */
export const MAX_SAMPLES = 300;
export const MAX_SENDS = 40;
export const MAX_GAPS = 40;
export const MAX_WORKER_EVENTS = 40;
export const MAX_FAULTS = 20;
/** The progress points the estimate is recorded at. */
export const MILESTONES = [10, 50, 90] as const;
/**
 * The payload's ceiling as JSON. The collector keeps a submission's private extras whole or not at
 * all, at most 16 KB (collector/worker.js EXTRA_MAX_BYTES), and `diagnostics` takes up to 4 KB of
 * that: 8 KB here leaves room.
 */
export const PAYLOAD_MAX_CHARS = 8000;

/** What the run was estimated at, as it started. */
export interface TimelineEstimate {
  /** Wall-clock seconds the panel said (`DeadlineLegPlan.seconds`). */
  seconds: number;
  /** The workers that estimate assumed (the panel's budget), when known. */
  workers?: number;
  legs?: number;
  routes?: number;
  /** Worker-seconds a leg the estimate used. */
  secondsPerLeg?: number;
  /** Where that speed came from: this machine's last By a date run, or the board's typical speed. */
  source?: 'machine' | 'board';
}

/** [minutes into the run, minutes covered, routes a minute, legs a minute, workers (time-weighted),
 *  share of the time hidden (0-1, one decimal), 1 if online throughout else 0, memo entries summed]. */
export type Sample = [number, number, number, number, number, number, 0 | 1, number | null];
/** [minutes into the run, the gap in minutes, 1 if the tab was hidden at the time]. */
export type Gap = [number, number, 0 | 1];
/** [minutes into the run, what, 1 ok / 0 not, HTTP status or null, kB, parts, tries]. */
export type SendEntry = [number, SendKind, 0 | 1, number | null, number, number, number];
/** [minutes into the run, what, from, to]. */
export type WorkerEvent = [number, WorkerEventKind, number | null, number | null];

/**
 * Something went wrong under the run (12 Oct, for finding out what and why memory errors happen):
 * [minutes into the run, what, worker index or null, workers then, 1 if the tab was hidden,
 *  main-thread heap MB or null, memo entries summed or null, % done or null, the browser's words].
 * `crash`: a worker died or reported an error; `stall`: one went silent and was let go; `page`: the
 * whole page died (found at the next load, from the black box's last beat); `failed`: the run ended
 * on an error with the page alive. `load` is how the page after it was opened: 'reload' (Safari
 * reloads a page it lost itself), 'navigate' (a new tab, the watcher's), 'back_forward'.
 */
export type FaultEntry = [number, FaultKind, number | null, number | null, 0 | 1, number | null, number | null, number | null, string];
export type FaultKind = 'crash' | 'stall' | 'page' | 'failed';

export type SendKind = 'progress' | 'csv-so-far' | 'final' | 'csv' | 'retry' | 'kept';
export type WorkerEventKind = 'resize' | 'crash' | 'stall' | 'spawn';

export interface Milestone {
  pct: number;
  atMin: number;
  /** The time left the run said then, minutes (null while it had no figure). */
  leftMin: number | null;
  workers: number;
}

export interface Timeline {
  v: 1;
  kind: 'by-date';
  /** When the run first began (`DeadlineRunSpec.startedAt`): the same across its carry-ons. */
  runId: number;
  /** The run's deadline (unix seconds), to match a send to its run. */
  deadline?: number;
  /** Page sessions of this run (1, plus one per carry-on). */
  sessions: number;
  estimate: TimelineEstimate | null;
  /** Each carry-on's own first guess for the rest (seconds), in order. */
  carryOnEstimates: number[];
  milestones: Milestone[];
  /** The last tick: when, and the session's fresh routes and legs then. */
  last: { at: number; routes: number; legs: number; hidden: boolean; workers: number } | null;
  /** The sample being gathered. */
  open: {
    from: number;
    routes: number;
    legs: number;
    hiddenMs: number;
    workerMs: number;
    offline: boolean;
    memo: number | null;
  } | null;
  samples: Sample[];
  gaps: Gap[];
  /** Minutes in gaps, all of them (the list keeps the last `MAX_GAPS`). */
  gapMinutes: number;
  sends: SendEntry[];
  workerEvents: WorkerEvent[];
  /** What went wrong, and in what state (`FaultEntry`). Absent on timelines from before 12 Oct. */
  faults?: FaultEntry[];
  /** The pool's lifetime counts as last seen this session (search/pool.ts `stats`), and the sums of
   *  earlier sessions'. */
  pool: { made: number; crashed: number; stalled: number };
  poolBefore: { made: number; crashed: number; stalled: number };
  memoPeak: number | null;
  /** Wall-clock minutes from the run's first start to its end, the time active (less gaps and
   *  suspension), and how it ended. Null while running. */
  end: { atMin: number; activeMin: number; routes: number; legs: number; how: 'done' | 'stopped' } | null;
}

const min1 = (ms: number) => Math.round(ms / 6000) / 10;

export function newTimeline(o: { runId: number; deadline?: number; estimate: TimelineEstimate | null }): Timeline {
  return {
    v: 1,
    kind: 'by-date',
    runId: o.runId,
    ...(o.deadline !== undefined ? { deadline: o.deadline } : {}),
    sessions: 1,
    estimate: o.estimate,
    carryOnEstimates: [],
    milestones: [],
    last: null,
    open: null,
    samples: [],
    gaps: [],
    gapMinutes: 0,
    sends: [],
    workerEvents: [],
    pool: { made: 0, crashed: 0, stalled: 0 },
    poolBefore: { made: 0, crashed: 0, stalled: 0 },
    memoPeak: null,
    end: null,
  };
}

/**
 * A run starting: a new timeline, or for a carry-on of the same run (`runId`) the one it had, with a
 * session more. The carry-on's own estimate (for what is left) is kept beside the first.
 */
export function startTimeline(
  prev: Timeline | null,
  o: { runId: number; deadline?: number; estimate: TimelineEstimate | null; carryOn: boolean }
): Timeline {
  if (prev && prev.runId === o.runId && o.carryOn) {
    return {
      ...prev,
      sessions: prev.sessions + 1,
      carryOnEstimates: o.estimate
        ? [...prev.carryOnEstimates, Math.round(o.estimate.seconds)].slice(-10)
        : prev.carryOnEstimates,
      last: null,
      open: null,
      poolBefore: {
        made: prev.poolBefore.made + prev.pool.made,
        crashed: prev.poolBefore.crashed + prev.pool.crashed,
        stalled: prev.poolBefore.stalled + prev.pool.stalled,
      },
      pool: { made: 0, crashed: 0, stalled: 0 },
      end: null,
    };
  }
  return newTimeline(o);
}

export interface TickInput {
  now: number;
  /** Fresh routes priced this session (replayed ones are not work). */
  routes: number;
  /** Legs simulated this session. */
  legs: number;
  workers: number;
  hidden: boolean;
  online: boolean;
  memo?: number | null;
  /** Progress, 0-100, as the bar shows it. */
  pct?: number | null;
  /** The time left the run says now, seconds. */
  secondsLeft?: number | null;
  /** The pool's lifetime counts this session. */
  pool?: { made: number; crashed: number; stalled: number } | null;
}

/** Merge two neighbouring samples into one covering both. */
function mergeSamples(a: Sample, b: Sample): Sample {
  const span = a[1] + b[1];
  const w = (x: number, y: number) => (span > 0 ? (x * a[1] + y * b[1]) / span : (x + y) / 2);
  const memo = a[7] === null ? b[7] : b[7] === null ? a[7] : Math.max(a[7], b[7]);
  return [
    a[0],
    Math.round(span * 10) / 10,
    Math.round(w(a[2], b[2]) * 10) / 10,
    Math.round(w(a[3], b[3]) * 10) / 10,
    Math.round(w(a[4], b[4]) * 10) / 10,
    Math.round(w(a[5], b[5]) * 10) / 10,
    (a[6] && b[6] ? 1 : 0) as 0 | 1,
    memo,
  ];
}

/** Halve the resolution of `list[from..to)`, merging neighbours in pairs. */
function halve(list: Sample[], upTo = list.length): Sample[] {
  const out: Sample[] = [];
  let i = 0;
  for (; i + 1 < upTo; i += 2) out.push(mergeSamples(list[i], list[i + 1]));
  if (i < upTo) out.push(list[i]);
  return [...out, ...list.slice(upTo)];
}

/** At most `MAX_SAMPLES`: the older half merged in pairs, the newer kept as measured. */
export function boundSamples(list: Sample[]): Sample[] {
  let out = list;
  while (out.length > MAX_SAMPLES) out = halve(out, Math.ceil(out.length / 2));
  return out;
}

const push = <T>(list: T[], x: T, max: number): T[] => [...list, x].slice(-max);

/**
 * One tick of a running run (the store's 15-second beat). Notes a gap when the last tick was over
 * `GAP_MS` ago, closes a speed sample every `SAMPLE_EVERY_MS`, records the estimate the first time
 * progress reaches each of `MILESTONES`, and a worker crash or stall when the pool's counts grow.
 */
export function tickTimeline(t: Timeline, x: TickInput): Timeline {
  const startMs = t.runId;
  const atMin = min1(x.now - startMs);
  let next: Timeline = { ...t };
  const last = t.last;
  // A new session's counts start from 0 again: a count below the last is a fresh baseline.
  const fresh = !last || x.routes < last.routes || x.legs < last.legs;
  if (last && x.now - last.at > GAP_MS) {
    const gap = min1(x.now - last.at);
    next.gaps = push(next.gaps, [min1(last.at - startMs), gap, (last.hidden || x.hidden ? 1 : 0) as 0 | 1], MAX_GAPS);
    next.gapMinutes = Math.round((next.gapMinutes + gap) * 10) / 10;
  }
  let open = next.open;
  if (!open || fresh) {
    open = { from: x.now, routes: x.routes, legs: x.legs, hiddenMs: 0, workerMs: 0, offline: !x.online, memo: null };
  } else if (last) {
    const dt = Math.max(0, x.now - last.at);
    open = {
      ...open,
      hiddenMs: open.hiddenMs + (last.hidden ? dt : 0),
      workerMs: open.workerMs + dt * last.workers,
      offline: open.offline || !x.online,
    };
  }
  if (typeof x.memo === 'number' && Number.isFinite(x.memo)) {
    open = { ...open, memo: Math.max(open.memo ?? 0, x.memo) };
    next.memoPeak = Math.max(next.memoPeak ?? 0, x.memo);
  }
  const span = x.now - open.from;
  if (span >= SAMPLE_EVERY_MS) {
    const minutes = span / 60000;
    const sample: Sample = [
      min1(open.from - startMs),
      Math.round(minutes * 10) / 10,
      Math.round(((x.routes - open.routes) / minutes) * 10) / 10,
      Math.round(((x.legs - open.legs) / minutes) * 10) / 10,
      Math.round((open.workerMs / span) * 10) / 10 || x.workers,
      Math.round((open.hiddenMs / span) * 10) / 10,
      (open.offline ? 0 : 1) as 0 | 1,
      open.memo,
    ];
    next.samples = boundSamples([...next.samples, sample]);
    open = { from: x.now, routes: x.routes, legs: x.legs, hiddenMs: 0, workerMs: 0, offline: !x.online, memo: null };
  }
  next.open = open;
  if (typeof x.pct === 'number') {
    for (const m of MILESTONES) {
      if (x.pct >= m && !next.milestones.some(s => s.pct === m)) {
        next.milestones = [
          ...next.milestones,
          {
            pct: m,
            atMin,
            leftMin: typeof x.secondsLeft === 'number' ? Math.round(x.secondsLeft / 6) / 10 : null,
            workers: x.workers,
          },
        ];
      }
    }
  }
  if (x.pool) {
    const was = t.pool;
    if (x.pool.crashed > was.crashed)
      next.workerEvents = push(next.workerEvents, [atMin, 'crash', was.crashed, x.pool.crashed], MAX_WORKER_EVENTS);
    if (x.pool.stalled > was.stalled)
      next.workerEvents = push(next.workerEvents, [atMin, 'stall', was.stalled, x.pool.stalled], MAX_WORKER_EVENTS);
    next.pool = { ...x.pool };
  }
  next.last = { at: x.now, routes: x.routes, legs: x.legs, hidden: x.hidden, workers: x.workers };
  return next;
}

/** The workers changed during the run (the slider, the background setting, the step-away rules). */
export function noteWorkerChange(t: Timeline, now: number, from: number, to: number): Timeline {
  if (from === to) return t;
  return { ...t, workerEvents: push(t.workerEvents, [min1(now - t.runId), 'resize', from, to], MAX_WORKER_EVENTS) };
}

export interface FaultNote {
  /** When it happened, ms (a page crash: its last beat's time). */
  at: number;
  kind: FaultKind;
  worker?: number | null;
  workers?: number | null;
  hidden?: boolean;
  heapMB?: number | null;
  memo?: number | null;
  pct?: number | null;
  /** The browser's words, or what the page knows; cut to 100 characters, player ids swept out. */
  message?: string;
}

export function noteFaultIn(t: Timeline, f: FaultNote): Timeline {
  const num = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);
  const entry: FaultEntry = [
    min1(f.at - t.runId),
    f.kind,
    num(f.worker),
    num(f.workers),
    f.hidden ? 1 : 0,
    num(f.heapMB),
    num(f.memo),
    num(f.pct),
    (f.message ?? '').replace(/EI\d{16}/g, 'EI[redacted]').slice(0, 100),
  ];
  return { ...t, faults: push(t.faults ?? [], entry, MAX_FAULTS) };
}

export interface SendNote {
  now: number;
  what: SendKind;
  ok: boolean;
  status?: number | null;
  bytes?: number;
  parts?: number;
  tries?: number;
}

export function noteSendIn(t: Timeline, s: SendNote): Timeline {
  const entry: SendEntry = [
    min1(s.now - t.runId),
    s.what,
    s.ok ? 1 : 0,
    typeof s.status === 'number' ? s.status : null,
    Math.round((s.bytes ?? 0) / 102.4) / 10,
    s.parts ?? 1,
    s.tries ?? 1,
  ];
  return { ...t, sends: push(t.sends, entry, MAX_SENDS) };
}

/** The run ended with an answer: when, how long it was active, what it did. */
export function finishTimeline(
  t: Timeline,
  o: { now: number; activeSeconds: number; routes: number; legs: number; how: 'done' | 'stopped' }
): Timeline {
  return {
    ...t,
    end: {
      atMin: min1(o.now - t.runId),
      activeMin: Math.round(o.activeSeconds / 6) / 10,
      routes: o.routes,
      legs: o.legs,
      how: o.how,
    },
  };
}

/** Seconds of gaps (`GAP_MS` and over) since `since`, for the speed this run records. */
export function gapSecondsSince(t: Timeline | null, since: number): number {
  if (!t) return 0;
  let s = 0;
  for (const [at, minutes] of t.gaps) if (t.runId + at * 60000 >= since) s += minutes * 60;
  return s;
}

/** Share of the sampled time the tab was hidden, 0-1, or null with nothing sampled. */
export function hiddenShare(t: Timeline | null): number | null {
  if (!t || !t.samples.length) return null;
  let span = 0;
  let hidden = 0;
  for (const s of t.samples) {
    span += s[1];
    hidden += s[1] * s[5];
  }
  return span > 0 ? hidden / span : null;
}

/**
 * The timeline as sent: compact, and at most `maxChars` of JSON. The samples are merged in pairs
 * until it fits, then the oldest sends and gaps go, then the samples altogether.
 */
export function timelinePayload(t: Timeline, maxChars = PAYLOAD_MAX_CHARS): Record<string, unknown> {
  const est = t.estimate;
  const actualMin = t.end?.atMin ?? null;
  const base: Record<string, unknown> = {
    v: 1,
    kind: t.kind,
    sessions: t.sessions,
    ...(est
      ? {
          est: {
            min: Math.round(est.seconds / 6) / 10,
            ...(est.workers !== undefined ? { workers: est.workers } : {}),
            ...(est.legs !== undefined ? { legs: Math.round(est.legs) } : {}),
            ...(est.routes !== undefined ? { routes: Math.round(est.routes) } : {}),
            ...(est.secondsPerLeg !== undefined ? { sPerLeg: Math.round(est.secondsPerLeg * 1000) / 1000 } : {}),
            ...(est.source ? { src: est.source } : {}),
          },
        }
      : {}),
    ...(t.carryOnEstimates.length ? { carryOnEstMin: t.carryOnEstimates.map(s => Math.round(s / 6) / 10) } : {}),
    at: t.milestones.map(m => [m.pct, m.atMin, m.leftMin, m.workers]),
    ...(t.end
      ? {
          end: {
            min: t.end.atMin,
            activeMin: t.end.activeMin,
            routes: t.end.routes,
            legs: t.end.legs,
            how: t.end.how,
            ...(est && est.seconds > 0 && actualMin !== null
              ? { ratio: Math.round((actualMin / (est.seconds / 60)) * 100) / 100 }
              : {}),
          },
        }
      : {}),
    gapMin: t.gapMinutes,
    pool: {
      made: t.poolBefore.made + t.pool.made,
      crashed: t.poolBefore.crashed + t.pool.crashed,
      stalled: t.poolBefore.stalled + t.pool.stalled,
    },
    ...(t.memoPeak !== null ? { memoPeak: t.memoPeak } : {}),
    cols: 'min,span,rpm,lpm,workers,hidden,online,memo',
  };
  let samples = t.samples;
  let sends = t.sends;
  let gaps = t.gaps;
  let events = t.workerEvents;
  // The faults are the point of the 12 Oct addition: kept whole while anything else can shrink.
  let faults = t.faults ?? [];
  const build = () => ({
    ...base,
    s: samples,
    gaps,
    sends,
    wk: events,
    ...(faults.length ? { faults, faultCols: 'min,what,worker,workers,hidden,heapMB,memo,pct,msg' } : {}),
  });
  let text = JSON.stringify(build());
  while (text.length > maxChars && samples.length > 8) {
    samples = halve(samples);
    text = JSON.stringify(build());
  }
  while (text.length > maxChars && (sends.length > 5 || gaps.length > 5 || events.length > 5)) {
    sends = sends.slice(-Math.max(5, Math.floor(sends.length / 2)));
    gaps = gaps.slice(-Math.max(5, Math.floor(gaps.length / 2)));
    events = events.slice(-Math.max(5, Math.floor(events.length / 2)));
    text = JSON.stringify(build());
  }
  if (text.length > maxChars) {
    samples = [];
    text = JSON.stringify(build());
  }
  if (text.length > maxChars) {
    faults = faults.slice(-5);
    text = JSON.stringify(build());
  }
  return text.length > maxChars ? base : build();
}

// ------------------------------------------------------------------ storage (the store calls these)

export function readTimeline(): Timeline | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Timeline | null;
    return raw && raw.v === 1 && Array.isArray(raw.samples) ? raw : null;
  } catch {
    return null;
  }
}

function writeTimeline(t: Timeline | null): void {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked: a nicety, never a reason to fail a run.
  }
}

/** Apply `f` to the stored timeline (if any) and keep the result. Never throws. */
export function updateTimeline(f: (t: Timeline) => Timeline): void {
  try {
    const t = readTimeline();
    if (t) writeTimeline(f(t));
  } catch {
    // a nicety
  }
}

export function beginTimeline(o: Parameters<typeof startTimeline>[1]): void {
  try {
    writeTimeline(startTimeline(readTimeline(), o));
  } catch {
    // a nicety
  }
}

/** The stored timeline's payload for a send of the run with this deadline, or undefined. */
export function timelineFor(deadline: number | undefined): Record<string, unknown> | undefined {
  const t = readTimeline();
  if (!t || (t.deadline !== undefined && deadline !== undefined && t.deadline !== deadline)) return undefined;
  try {
    return timelinePayload(t);
  } catch {
    return undefined;
  }
}

/** A fault into the stored timeline (`noteFaultIn`). Never throws. */
export function noteFault(f: FaultNote): void {
  updateTimeline(t => noteFaultIn(t, f));
}
