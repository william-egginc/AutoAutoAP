/**
 * A smaller Auto-Plan export file (red team 21 Oct 2026, data-inputs #11: a 2-ascension export was 65 MB).
 *
 * WHAT MADE IT BIG. Every variant of every ascension carries its whole action list (about 3,300 actions,
 * half of them wait_for_time), and every action carries a full `endState`: the farm snapshot after it,
 * with its research levels, artifact sets, per-egg maps and the rest. Consecutive snapshots differ in a
 * handful of numbers, so nearly all of the file was the same snapshot written out again and again.
 *
 * WHAT THIS DOES. Each variant's first `endState` is kept whole; every later one is written as the
 * difference from the one before (`endStateDelta`: changed values, nested objects diffed key by key,
 * removed keys listed). An action's numbers that are 0 (most of its deltas) and its empty `dependsOn` /
 * `dependents` are left out and put back on import. Nothing is lost, so an import rebuilds exactly the snapshots the plan had and
 * still shows every ascension without re-simulating. The file is marked `packed: 1`; files without the
 * mark (every export before this) are read as they are, so import stays backward-compatible.
 */

/** A snapshot written as the difference from the one before. */
export interface Delta {
  /** Keys set to a new value (whole). */
  s?: Record<string, unknown>;
  /** Plain-object keys changed inside: their own delta. */
  d?: Record<string, Delta>;
  /** Keys removed. */
  r?: string[];
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** What JSON would make of it, for comparing (an export goes through JSON anyway). */
const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

export function diff(a: Record<string, unknown>, b: Record<string, unknown>): Delta | null {
  const out: Delta = {};
  for (const k of Object.keys(b)) {
    const av = a[k];
    const bv = b[k];
    if (!(k in a)) (out.s ??= {})[k] = bv;
    else if (isPlain(av) && isPlain(bv)) {
      const sub = diff(av, bv);
      if (sub) (out.d ??= {})[k] = sub;
    } else if (!same(av, bv)) (out.s ??= {})[k] = bv;
  }
  for (const k of Object.keys(a)) if (!(k in b)) (out.r ??= []).push(k);
  return out.s || out.d || out.r ? out : null;
}

/** `a` with `delta` applied, as a new object (`a` is left as it is). */
export function patch(a: Record<string, unknown>, delta: Delta | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(a));
  if (!delta) return out;
  for (const k of delta.r ?? []) delete out[k];
  for (const [k, sub] of Object.entries(delta.d ?? {})) out[k] = patch(isPlain(out[k]) ? (out[k] as Record<string, unknown>) : {}, sub);
  for (const [k, v] of Object.entries(delta.s ?? {})) out[k] = JSON.parse(JSON.stringify(v ?? null));
  return out;
}

/** An action's fields that are left out when 0 and put back as 0. */
const ZERO_FIELDS = [
  'cost',
  'elrDelta',
  'offlineEarningsDelta',
  'eggValueDelta',
  'habCapacityDelta',
  'layRateDelta',
  'shippingCapacityDelta',
  'ihrDelta',
  'bankDelta',
  'populationDelta',
  'totalTimeSeconds',
] as const;
const LIST_FIELDS = ['dependsOn', 'dependents'] as const;

function slim(a: Act): Act {
  const out: Act = { ...a };
  for (const f of ZERO_FIELDS) if (out[f] === 0) delete out[f];
  for (const f of LIST_FIELDS) if (Array.isArray(out[f]) && !(out[f] as unknown[]).length) delete out[f];
  return out;
}
function fill(a: Act): Act {
  const out: Act = { ...a };
  for (const f of ZERO_FIELDS) if (!(f in out)) out[f] = 0;
  for (const f of LIST_FIELDS) if (!(f in out)) out[f] = [];
  return out;
}

type Act = Record<string, unknown> & { endState?: Record<string, unknown>; endStateDelta?: Delta | null };
type Plan = { packed?: number; ascensions?: { variants?: Record<string, { actions?: Act[] } | undefined> }[] };

function eachActionList(plan: Plan, fn: (actions: Act[]) => Act[]): void {
  for (const asc of plan.ascensions ?? []) {
    for (const key of Object.keys(asc?.variants ?? {})) {
      const v = asc.variants![key];
      if (v && Array.isArray(v.actions)) v.actions = fn(v.actions);
    }
  }
}

/** One variant's actions packed: endStates after the first as differences, zeros and empty lists left out. */
function packActions(actions: Act[]): Act[] {
  let prev: Record<string, unknown> | null = null;
  return actions.map(a => {
    const full = a.endState;
    if (!isPlain(full) || !prev) {
      prev = isPlain(full) ? full : null;
      return slim(a);
    }
    const { endState: _drop, ...rest } = a;
    const out: Act = { ...slim(rest), endStateDelta: diff(prev, full) };
    prev = full;
    return out;
  });
}

/**
 * The export with each variant's actions packed (`packActions`). A new object: the plan passed in (the
 * live chain) is only read, and nothing in it is copied but the action objects themselves.
 */
export function packExportedPlan<T extends object>(plan: T): T & { packed: 1 } {
  const p = plan as Plan;
  return {
    ...(plan as object),
    packed: 1,
    ...(Array.isArray(p.ascensions)
      ? {
          ascensions: p.ascensions.map(asc => ({
            ...asc,
            variants: Object.fromEntries(
              Object.entries(asc?.variants ?? {}).map(([k, v]) => [
                k,
                v && Array.isArray(v.actions) ? { ...v, actions: packActions(v.actions) } : v,
              ])
            ),
          })),
        }
      : {}),
  } as T & { packed: 1 };
}

/** Rebuilds a packed export's endStates; a file without `packed` is returned as it is. Changes `plan`. */
export function unpackExportedPlan<T extends object>(plan: T): T {
  const p = plan as Plan;
  if (p.packed !== 1) return plan;
  eachActionList(p, actions => {
    let prev: Record<string, unknown> | null = null;
    return actions.map(a => {
      if ('endStateDelta' in a) {
        if (!prev) throw new Error('This plan file is damaged (a step has no state to build on).');
        const { endStateDelta, ...rest } = a;
        const full = patch(prev, endStateDelta);
        prev = full;
        return { ...fill(rest), endState: full };
      }
      prev = isPlain(a.endState) ? a.endState : null;
      return fill(a);
    });
  });
  delete p.packed;
  return plan;
}
