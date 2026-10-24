/**
 * One step where every collector row enters the page (prelive, 21 Oct 2026): `/all`, `/flagged` and `/mine`
 * (explorer/collector.ts, search/myBoardRows.ts, the chain-search store's recheck read).
 *
 * Anyone can post a bare row, and older or Light rows lack fields. One row without `chainsPriced` made
 * Insights throw (`row.chainsPriced.toLocaleString()` on undefined) for every viewer. So each row is made to
 * match its type here, once, and the views need no guards of their own:
 *  - A row too bare to mean anything is DROPPED (returns null): not an object, no route (`chain` not an array
 *    of whole numbers), or no length (`durationDays` not a finite number of 0 or more; a By a date answer,
 *    with a numeric `deadline`, may lack it and gets 0).
 *  - Fields every row must have get a safe default: numbers 0 (or, for TE, the route's own ends), strings '',
 *    arrays [], `window`/`waitingHours` null, `holdShifts` false. A route count of 0 shows as '–'.
 *  - An optional field of the wrong type (a string for a number, NaN, null, an object for an array) is
 *    REMOVED, so it reads as absent, which every view already handles.
 *  - Array items of the wrong shape (legs, stones, artifacts, rechecks, time off, loadout slots) are dropped.
 * Numbers sent as numeric strings ("12") are read as numbers. Unknown fields pass through untouched.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
/** A finite number, from a number or a numeric string; else undefined. */
function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const nums = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.every(x => num(x) !== undefined) ? v.map(x => num(x) as number) : undefined;

/** Optional numbers: kept when finite, removed otherwise. */
const OPTIONAL_NUMBERS = [
  'firstLegOtherHours',
  'clothedTE',
  'backupAgeHours',
  'backupTE',
  'deadline',
  'deadlineAscendAt',
  'integrityMinutes',
] as const;
/** Optional strings. */
const OPTIONAL_STRINGS = [
  'nickname',
  'note',
  'startUtc',
  'endUtc',
  'firstAscension',
  'firstLeg',
  'mode',
  'level',
  'lightFrom',
  'searched',
  'startWeekday',
  'build',
  'simVersion',
  'source',
  'replaces',
  'csvRun',
  'acct',
  'receivedAt',
  'dupOf',
  'lastActiveAt',
] as const;
/** Optional booleans. */
const OPTIONAL_BOOLEANS = [
  'forceContinue',
  'atOnce',
  'provisional',
  'hasCsv',
  'partialCsv',
  'yours',
  'hidden',
] as const;
/** Optional objects (their insides are read with `?.` where they are used). */
const OPTIONAL_OBJECTS = [
  'run',
  'epicResearch',
  'colleggtibles',
  'space',
  'proof',
  'deliveryScore',
  'sweep',
  'machine',
  'diagnostics',
  'timing',
  'progress',
] as const;

export function normalizeBoardRow<T>(raw: unknown): T | null {
  if (!isObj(raw)) return null;
  const chain = nums(raw.chain);
  if (!chain || !chain.length) return null;
  const deadline = num(raw.deadline);
  const duration = num(raw.durationDays);
  if ((duration === undefined || duration < 0) && deadline === undefined) return null;

  const r: Obj = { ...raw, chain };
  r.durationDays = duration !== undefined && duration >= 0 ? duration : 0;
  r.currentTE = num(raw.currentTE) ?? chain[0];
  r.finalTE = num(raw.finalTE) ?? chain[chain.length - 1];
  r.ascensions = num(raw.ascensions) ?? Math.max(0, chain.length - 1);
  r.chainsPriced = Math.max(0, num(raw.chainsPriced) ?? 0);
  r.schema = num(raw.schema) ?? 0;
  for (const k of ['startLocal', 'endLocal', 'timezone', 'effort', 'submittedAt'] as const) r[k] = str(raw[k]) ?? '';
  r.id = str(raw.id) ?? (typeof raw.id === 'number' ? String(raw.id) : '');
  r.window = str(raw.window) ?? null;
  r.waitingHours = num(raw.waitingHours) ?? null;
  r.holdShifts = raw.holdShifts === true;
  r.artifacts = strs(raw.artifacts);
  r.stones = Array.isArray(raw.stones)
    ? raw.stones
        .filter(isObj)
        .filter(s => typeof s.label === 'string')
        .map(s => ({ ...s, count: num(s.count) ?? 0 }))
    : [];
  r.legs = Array.isArray(raw.legs)
    ? raw.legs.filter(isObj).map(l => ({
        ...l,
        te: num(l.te) ?? 0,
        strategy: str(l.strategy) ?? '',
        days: num(l.days) ?? 0,
        peakDeliveryQph: num(l.peakDeliveryQph) ?? 0,
      }))
    : [];

  for (const k of OPTIONAL_NUMBERS) {
    const n = num(raw[k]);
    if (n === undefined) delete r[k];
    else r[k] = n;
  }
  for (const k of OPTIONAL_STRINGS) if (k in r && typeof r[k] !== 'string') delete r[k];
  for (const k of OPTIONAL_BOOLEANS) if (k in r && typeof r[k] !== 'boolean') delete r[k];
  for (const k of OPTIONAL_OBJECTS) if (k in r && !isObj(r[k])) delete r[k];

  // Optional arrays: removed when not arrays; items of the wrong shape dropped.
  if ('seed' in r) {
    const s = nums(r.seed);
    if (s) r.seed = s;
    else delete r.seed;
  }
  if ('teByEgg' in r) {
    const s = nums(r.teByEgg);
    if (s) r.teByEgg = s;
    else delete r.teByEgg;
  }
  if ('flags' in r) {
    if (Array.isArray(r.flags)) r.flags = strs(r.flags);
    else delete r.flags;
  }
  if ('rechecks' in r) {
    if (Array.isArray(r.rechecks))
      r.rechecks = r.rechecks
        .filter(isObj)
        .map(x => ({ ...x, chain: nums(x.chain), days: num(x.days) }))
        .filter(x => x.chain && x.days !== undefined);
    else delete r.rechecks;
  }
  if ('timeOff' in r) {
    if (Array.isArray(r.timeOff))
      r.timeOff = r.timeOff.filter(isObj).filter(x => typeof x.from === 'string' && typeof x.to === 'string');
    else delete r.timeOff;
  }
  for (const k of ['delivery', 'earnings'] as const) {
    if (!(k in r)) continue;
    if (Array.isArray(r[k]))
      r[k] = (r[k] as unknown[])
        .filter(isObj)
        .filter(s => typeof s.artifact === 'string')
        .map(s => ({ ...s, stones: strs(s.stones) }));
    else delete r[k];
  }
  normalizeNested(r);
  return r as T;
}

const proofChain = (x: unknown): { chain: number[]; days: number } | null => {
  if (!isObj(x)) return null;
  const chain = nums(x.chain);
  const days = num(x.days);
  return chain && days !== undefined ? { ...x, chain, days } : null;
};

/**
 * The objects the run detail and Insights read inside (`run`, `space`, `proof`, `sweep`): kept only with the
 * numbers those reads need, else removed (a `space` without its route count could otherwise grade as a proof).
 */
function normalizeNested(r: Obj): void {
  if (isObj(r.run)) {
    const minutes = num(r.run.minutes);
    if (minutes === undefined) delete r.run;
    else {
      const run: Obj = { ...r.run, minutes };
      const workers = num(run.workers);
      if (workers === undefined) delete run.workers;
      else run.workers = workers;
      run.cores = num(run.cores) ?? null;
      r.run = run;
    }
  }
  if (isObj(r.space)) {
    const sp = r.space;
    const chains = num(sp.chains);
    if (chains === undefined) delete r.space;
    else {
      const out: Obj = {
        ...sp,
        chains,
        chainsPriced: num(sp.chainsPriced) ?? 0,
        minGap: num(sp.minGap) ?? 0,
        minAscensions: num(sp.minAscensions) ?? 0,
        maxAscensions: num(sp.maxAscensions) ?? num(sp.minAscensions) ?? 0,
        stoppedEarly: sp.stoppedEarly === true,
      };
      if ('bands' in out) {
        const ok = Array.isArray(out.bands) && out.bands.every(b => !!nums(b));
        if (ok) out.bands = (out.bands as unknown[]).map(b => nums(b));
        else delete out.bands;
      }
      if ('range' in out) {
        const rg = out.range;
        const lo = isObj(rg) ? num(rg.lo) : undefined;
        const hi = isObj(rg) ? num(rg.hi) : undefined;
        const step = isObj(rg) ? num(rg.step) : undefined;
        if (lo === undefined || hi === undefined || !step || step <= 0) delete out.range;
        else out.range = { lo, hi, step };
      }
      r.space = out;
    }
  }
  if (isObj(r.proof)) {
    const pf = r.proof;
    const spread = isObj(pf.spread) ? pf.spread : null;
    const median = spread ? num(spread.median) : undefined;
    const worst = spread ? num(spread.worst) : undefined;
    if (median === undefined || worst === undefined) delete r.proof;
    else
      r.proof = {
        ...pf,
        spread: { best: num(spread!.best) ?? 0, median, worst },
        runnersUp: Array.isArray(pf.runnersUp) ? pf.runnersUp.map(proofChain).filter(Boolean) : [],
        byAscensions: Array.isArray(pf.byAscensions)
          ? pf.byAscensions
              .map(g => {
                const c = proofChain(g);
                return c && isObj(g) ? { ...c, ascensions: num(g.ascensions) ?? 0, priced: num(g.priced) ?? 0 } : null;
              })
              .filter(Boolean)
          : [],
      };
  }
  if (isObj(r.sweep)) {
    const sw: Obj = { ...r.sweep, preset: str(r.sweep.preset) ?? '' };
    if ('bands' in sw && typeof sw.bands !== 'string') delete sw.bands;
    if ('minGap' in sw && num(sw.minGap) === undefined) delete sw.minGap;
    r.sweep = sw;
  }
}

/** Every row of a collector answer, normalized; the ones too bare to mean anything dropped. */
export function normalizeBoardRows<T>(rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const raw of rows) {
    const r = normalizeBoardRow<T>(raw);
    if (r) out.push(r);
  }
  return out;
}

/** A route count for a table cell: '–' when the row did not say (0: every real run prices at least one). */
export const routesText = (n: number | undefined | null): string =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n.toLocaleString() : '–';
