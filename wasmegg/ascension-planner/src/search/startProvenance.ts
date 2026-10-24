/**
 * Where a run started from, and whether the instant answer may run yet (22 Oct 2026, Allan's "36 h faster").
 *
 * WHY. On a fresh load the instant answer used to run before the save was set up: on the Manual planner's
 * restored draft (IndexedDB, the TE and eggs of whenever that plan was made, no save time) or, after an
 * account switch, on the claimed-only TE beside the last stored save. Same account, same minute, a different
 * starting TE (235 against 234) and a different route. Joo's fcc9e764 fixed the starting state itself; these
 * are the two belts on top:
 *
 *   1. `startWaitOf`: the instant answer runs only once the save for the account on screen is set up the way
 *      the Auto Planner sets it up (initPlanFuture: a fresh fetch, the stored save, or a file the player
 *      picked). Until then it waits, and an answer already on screen is labelled `START_WAIT_LABEL`.
 *   2. `StartProvenance`: every row, share and instant record says where its start came from, so a case
 *      like Allan's can be read off the board instead of reconstructed.
 *
 * Pure: the stores hand their values in (stores/chainSearch.ts `startWait`, `startProvenanceNow`).
 * NEVER a player id in here: the save is named by `saveHashOf` (its time and eggs), never by its account.
 */
import { countTEThresholdsPassed } from '@/lib/truthEggs';

/** Where the planner's start state came from, as the stores were last set up (stores/initialState.ts
 *  `setupSource`):
 *    - `fresh`: a save fetched just now and set up the Auto Planner's way (initPlanFuture);
 *    - `stored`: the save kept on this device, set up the same way (a failed fetch, a run carried on, a
 *      saved entry's save);
 *    - `file`: a save file the player loaded;
 *    - `draft`: the Manual planner's restored draft (its TE and eggs are whenever that plan was made);
 *    - `switch`: an account switch's quick load (claimed TE only, pending not rolled up). */
export const START_SOURCES = ['fresh', 'stored', 'file', 'draft', 'switch'] as const;
export type StartSource = (typeof START_SOURCES)[number];
/** The sources the instant answer and a search may start from: set up the Auto Planner's way. */
export const SET_UP_SOURCES: ReadonlySet<StartSource> = new Set(['fresh', 'stored', 'file']);

/** Where the plan start came from: `now` (the clock; the start boxes not set by the player), `override`
 *  (the player's own start in the boxes, Joo's start-time override), `handoff` (a search's own start handed
 *  back: a run carried on, an older save, a route applied from a search). */
export const PLAN_START_SOURCES = ['now', 'override', 'handoff'] as const;
export type PlanStartSource = (typeof PLAN_START_SOURCES)[number];

// ------------------------------------------------------------------ 1. waiting for the save

/** Why the instant answer is waiting, or '' when it may run. */
export type StartWait = '' | 'loading' | 'no-save' | 'other-account' | 'draft' | 'switch' | 'not-set-up';

export interface StartStateNow {
  /** The player ID in the box (App.vue `playerId`, mirrored to stores/ui.ts `screenPlayerId`). */
  screenPlayerId: string;
  /** The account the stores were loaded for (initialState `playerId`). */
  storesPlayerId: string;
  /** How the stores were last set up (initialState `setupSource`); '' after a reset. */
  source: StartSource | '';
  /** The stores' own save time (initialState `lastBackupTime`): 0 for a draft. */
  lastBackupTime: number;
  /** The save's own time (saveFreshness.ts `backupSecondsOf(rawBackup)`): 0 without a save. */
  saveTime: number;
  /** A save is being fetched or set up (stores/ui.ts `loading`). */
  loading: boolean;
}

/**
 * Whether the start state is the save's, set up the Auto Planner's way, for the account on screen. With no
 * player ID there is no save to wait for (a TE typed in, the Manual planner's own numbers): '' as before.
 */
export function startWaitOf(s: StartStateNow): StartWait {
  if (!s.screenPlayerId) return '';
  if (s.loading) return 'loading';
  if (!(s.saveTime > 0)) return 'no-save';
  if (s.storesPlayerId !== s.screenPlayerId) return 'other-account';
  if (s.source === 'draft') return 'draft';
  if (s.source === 'switch') return 'switch';
  if (!s.source || !SET_UP_SOURCES.has(s.source)) return 'not-set-up';
  // Set up from this very save: the stores' time is the save's (a draft's is always 0, and a save loaded
  // underneath without a set-up, as the header's reconcile refresh does, has a time of its own).
  if (s.lastBackupTime !== s.saveTime) return 'not-set-up';
  return '';
}

/** The label on an answer worked out before the save was set up (it stays on screen until the new one). */
export const START_WAIT_LABEL = 'From your last plan, not your save yet';

/** The line the instant answer shows while it waits. */
export function startWaitText(w: StartWait): string {
  switch (w) {
    case '':
      return '';
    case 'no-save':
      return 'Waiting for your save: the instant answer is worked out from your save once it has loaded.';
    default:
      return 'Waiting for your save to finish loading before working out the instant answer…';
  }
}

// ------------------------------------------------------------------ 2. where a run started

/** What a row, a share or an instant record says about its start (`Submission.start`, `InstantRecord.start`). */
export interface StartProvenance {
  /** How the start state was set up (`START_SOURCES`). */
  src?: StartSource;
  /** The save's claimed TE per virtue egg (Curiosity, Integrity, Humility, Resilience, Kindness), and the
   *  pending TE beside it (thresholds passed, not claimed yet), kept apart. */
  claimed?: number[];
  pending?: number[];
  /** The save's own time, unix seconds (to the millisecond, as the save has it). */
  saveAt?: number;
  /** 8 hex: a hash of the save's time, eggs delivered and claimed TE. Two rows with the same one used the
   *  same save. Never the account. */
  saveHash?: string;
  /** Eggs delivered per virtue egg in the start state the run priced from (6 significant figures). */
  eggs?: number[];
  /** Where the plan start came from (`PLAN_START_SOURCES`). */
  plan?: PlanStartSource;
  /** Hours from the page being opened to the send, and from the build it runs to the send: the tab's age. */
  tabH?: number;
  buildH?: number;
}

/** The longest `start` block, as JSON. A full one is about 260 bytes; the collector refuses nothing for it
 *  but drops the block past its own cap (collector/worker.js START_MAX_BYTES). */
export const MAX_START_BYTES = 400;
/** A tab's age either way, hours: ten years past, a day of clock skew before. */
const MAX_AGE_H = 24 * 3650;
const MIN_AGE_H = -24;
/** Eggs per egg: a TE 98 egg is 1e19 or so; past this is not a save. */
const MAX_EGGS = 1e30;

interface RawVirtue {
  settings?: { lastBackupTime?: number | null } | null;
  approxTime?: number | null;
  virtue?: { eovEarned?: (number | null)[] | null; eggsDelivered?: (number | null)[] | null } | null;
}

/** The save's own time as `loadFromBackup` reads it (settings.lastBackupTime, else approxTime); 0 without. */
function saveTimeOf(raw: unknown): number {
  const r = raw as RawVirtue | null | undefined;
  const t = r?.settings?.lastBackupTime || r?.approxTime || 0;
  return typeof t === 'number' && t > 1e9 ? t : 0;
}

/** FNV-1a, 32 bits, as 8 hex. */
function fnv8(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** A short hash of the save's time, its eggs delivered and its claimed TE ('' without a save). The account,
 *  its id and its name are never part of it, so it names a save, not a player. */
export function saveHashOf(raw: unknown): string {
  const t = saveTimeOf(raw);
  if (!t) return '';
  const v = (raw as RawVirtue).virtue;
  const eggs = [0, 1, 2, 3, 4].map(i => Number(v?.eggsDelivered?.[i] ?? 0));
  const eov = [0, 1, 2, 3, 4].map(i => Number(v?.eovEarned?.[i] ?? 0));
  return fnv8(`save|${t}|${eggs.join(',')}|${eov.join(',')}`);
}

const sig6 = (x: number) => (x > 0 && Number.isFinite(x) ? Number(x.toPrecision(6)) : 0);
const VIRTUE_ORDER = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const;

/**
 * What the start state was, read when the run (or the instant answer's check) starts: the set-up's source,
 * the save's claimed and pending TE per egg, its time and hash, the eggs the planner started from, and where
 * the plan start came from. The tab's age is added at send time (`finishStartProvenance`).
 */
export function startProvenanceOf(o: {
  source: StartSource | '';
  rawBackup: unknown;
  /** The planner's eggs delivered per virtue egg (initialState `initialEggsDelivered`). */
  eggs?: Partial<Record<string, number>> | null;
  plan: PlanStartSource | null;
}): StartProvenance {
  const out: StartProvenance = {};
  if (o.source && (START_SOURCES as readonly string[]).includes(o.source)) out.src = o.source;
  const t = saveTimeOf(o.rawBackup);
  if (t) {
    const v = (o.rawBackup as RawVirtue).virtue;
    const claimed = [0, 1, 2, 3, 4].map(i => Math.max(0, Math.min(98, Math.round(Number(v?.eovEarned?.[i] ?? 0)))));
    out.claimed = claimed;
    out.pending = [0, 1, 2, 3, 4].map(i =>
      Math.max(0, Math.min(98, countTEThresholdsPassed(Number(v?.eggsDelivered?.[i] ?? 0))) - claimed[i])
    );
    out.saveAt = Math.round(t * 1000) / 1000;
    out.saveHash = saveHashOf(o.rawBackup);
  }
  if (o.eggs) out.eggs = VIRTUE_ORDER.map(e => sig6(Number(o.eggs?.[e] ?? 0)));
  if (o.plan) out.plan = o.plan;
  return out;
}

/** This page's build time (ms), from `__BUILD_TIME__`; null where there is none (tests, dev). */
export function buildTimeMs(): number | null {
  const t = typeof __BUILD_TIME__ === 'string' ? Date.parse(__BUILD_TIME__) : NaN;
  return Number.isFinite(t) ? t : null;
}
/** When this page was opened (ms), from the browser's own clock origin; null where unknown. */
export function pageOpenedMs(): number | null {
  const t = typeof performance !== 'undefined' ? performance.timeOrigin : NaN;
  return Number.isFinite(t) && t > 0 ? t : null;
}

const hoursSince = (from: number | null | undefined, now: number): number | undefined => {
  if (from === null || from === undefined || !Number.isFinite(from)) return undefined;
  const h = Number(((now - from) / 3600000).toFixed(1)) + 0;
  return h >= MIN_AGE_H && h <= MAX_AGE_H ? h : undefined;
};

/**
 * The block as sent: only the fields that check out (`START_SOURCES`, five whole TEs, a save time, 8 hex,
 * five egg counts, `PLAN_START_SOURCES`), plus the tab's age at `now`. Undefined when nothing is left.
 */
export function finishStartProvenance(
  p: StartProvenance | null | undefined,
  o: { now: number; builtAt?: number | null; openedAt?: number | null } = { now: Date.now() }
): StartProvenance | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const five = (xs: unknown, max: number, whole: boolean): number[] | undefined =>
    Array.isArray(xs) &&
    xs.length === 5 &&
    xs.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max && (!whole || Number.isInteger(x)))
      ? (xs as number[]).slice()
      : undefined;
  const out: StartProvenance = {};
  if (p.src && (START_SOURCES as readonly string[]).includes(p.src)) out.src = p.src;
  const claimed = five(p.claimed, 98, true);
  const pending = five(p.pending, 98, true);
  // Kept as a pair, and only when each egg's two add up to 98 or less (the collector's rule too).
  if (claimed && pending && claimed.every((c, i) => c + pending[i] <= 98)) {
    out.claimed = claimed;
    out.pending = pending;
  }
  // 2020 to 2100, the collector's window for a time.
  if (typeof p.saveAt === 'number' && p.saveAt >= 1577836800 && p.saveAt <= 4102444800) out.saveAt = p.saveAt;
  if (typeof p.saveHash === 'string' && /^[a-f0-9]{8}$/.test(p.saveHash)) out.saveHash = p.saveHash;
  const eggs = five(p.eggs, MAX_EGGS, false);
  if (eggs) out.eggs = eggs;
  if (p.plan && (PLAN_START_SOURCES as readonly string[]).includes(p.plan)) out.plan = p.plan;
  const tabH = hoursSince(o.openedAt, o.now);
  const buildH = hoursSince(o.builtAt, o.now);
  if (tabH !== undefined) out.tabH = tabH;
  if (buildH !== undefined) out.buildH = buildH;
  return Object.keys(out).length ? out : undefined;
}

/** The problems with a `start` block as received, the app's side of the collector's check (empty: fine). */
export function startProvenanceProblems(v: unknown): string[] {
  if (v === undefined) return [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['start must be an object'];
  const p = v as StartProvenance;
  const clean = finishStartProvenance(p, { now: 0 });
  const problems: string[] = [];
  for (const k of ['src', 'claimed', 'pending', 'saveAt', 'saveHash', 'eggs', 'plan'] as const) {
    if (p[k] !== undefined && clean?.[k] === undefined) problems.push(`start.${k} is not valid`);
  }
  for (const k of ['tabH', 'buildH'] as const) {
    const h = p[k];
    if (h !== undefined && !(typeof h === 'number' && Number.isFinite(h) && h >= MIN_AGE_H && h <= MAX_AGE_H))
      problems.push(`start.${k} must be hours`);
  }
  if (JSON.stringify(p).length > MAX_START_BYTES) problems.push(`start must be at most ${MAX_START_BYTES} bytes`);
  return problems;
}
