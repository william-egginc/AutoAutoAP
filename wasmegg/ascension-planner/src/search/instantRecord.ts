/**
 * @module instantRecord
 * @description Opt-in instant answer records: the instant answer and its Check exactly, sent to the
 * collector's private `POST /instant` (collector/worker.js "instant answer records").
 *
 * WHY. Most players only use the instant answer, so the board learns nothing from them. With this
 * ticked (Your setup, "Share my instant answers and their Check exactly results"; composables/
 * useInstantShare.ts) each finished Check exactly sends ONE record: the instant answer's route, the
 * full simulator's times for it on the player's account, and what the answer was built on. The
 * analyst uses them for the instant answer's accuracy across gear and TE, which gear to build the
 * next instant answers for, half-built farms, and prestige windows from repeat checks of one save.
 *
 * WHAT IS NEVER IN IT: the player id (or anything derived from it), the save, the nickname. The
 * sender is the account's random owner code (search/owner.ts), as for board sends. The collector
 * keeps records privately for 180 days and never serves them.
 *
 * HOW OFTEN: at most one per save, per mode and target (or deadline), per hour, and never the same
 * record twice (`shouldSend`). The collector also caps each owner code at 30 a day.
 *
 * Everything here is pure or takes its storage and fetch as arguments, so it is tested without a page.
 */
import type { Route } from './routeFinder';
import type { LegSummary } from './types';
import type { FirstAscension } from './firstAscension';

export const INSTANT_RECORD_VERSION = 1;
/** The collector's cap on a record's body (collector/worker.js INSTANT_MAX_BYTES). */
export const INSTANT_MAX_BYTES = 8 * 1024;
/** One record per save, mode and target per hour. */
export const INSTANT_GAP_MS = 60 * 60 * 1000;

/** One of the instant answer's own legs, as sent. */
export interface InstantLegOut {
  to: number;
  endTE: number;
  start: number;
  end: number;
  label: string;
  sales: number;
  tier13: boolean;
}
/** One of the full simulator's legs, as sent. */
export interface ExactLegOut {
  te: number;
  start?: number;
  days: number;
  strategy: string;
  sales?: number;
  tier13: boolean;
  peakQph: number;
  holdHours: number;
  delayHours: number;
  timeOff?: 'stopped' | 'restarted';
}
export interface BracketSideOut {
  gear: string;
  end: number | null;
  te: number;
}

/** The record (collector/worker.js INSTANT_RECORD is the same list, with the bounds). */
export interface InstantRecord {
  v: 1;
  build?: string;
  mode: 'fastest' | 'date';
  /** Fastest: the target TE. */
  target?: number;
  /** By a date: the deadline, unix seconds. */
  deadline?: number;
  /** The plan start the check priced from, unix seconds. */
  planStart: number;
  timezone?: string;
  /** When the save was taken, and the plan start's age against it (signed, as on the board). */
  backupTime?: number;
  backupAgeHours?: number;
  /** The TE the route starts from, and the save's own. */
  currentTE: number;
  backupTE?: number;
  clothedTE?: number;
  /** Which instant answer was used, and how far the player's gear is from it. */
  gear: {
    /** The gear stamp's hash: the 24 hex of the gear instant answer that would fit this account. */
    stamp?: string;
    /** 'own': built on this account; 'gear': built on gear exactly like it; 'maxed': the maxed one, adjusted. */
    answer: 'own' | 'gear' | 'maxed';
    /** The account's own instant answer exists but its gear has changed since (what changed). */
    ownChanged?: string;
    /** Clothed TE the earnings set is short of the answer's, and delivery against it (1 = the same). */
    earningsShort?: number;
    deliveryScale?: number;
    /** The "Your gear isn't the gear the instant answer was built on" note was shown. */
    adjusted?: boolean;
    /** Epic research or colleggtibles short of the answer's (all maxed). */
    progressionShort?: boolean;
    /** The instant answer's first TE, and (a gear one) the last TE before it hands over to the maxed one. */
    tableFrom?: number;
    gearTo?: number;
    /** The route priced on the closest stronger and weaker gear's instant answers. */
    bracket?: { above: BracketSideOut | null; below: BracketSideOut | null };
  };
  /** The first-ascension stall: Clothed TE against the line, and the Integrity check if it ran. */
  stall?: {
    cte?: number;
    clears?: number;
    belowLine?: boolean;
    integrityHours?: number | null;
    notice?: 'none' | 'stalls' | 'blocked' | 'unknown';
  };
  settings?: {
    firstAscension?: FirstAscension;
    maxAscensions?: number | null;
    inHours?: boolean;
    window?: string | null;
    holdShifts?: boolean;
    tryAtOnce?: boolean;
    timeOff?: number;
    milestones?: number;
    small?: boolean;
  };
  /** The instant answer's own pick. */
  instant: { chain: number[]; end: number; endTE?: number; spareHours?: number; legs?: InstantLegOut[] };
  /** Every row shown: the instant answer against the exact check for each number of ascensions. */
  rows?: { n: number; chain: number[]; iEnd: number; iTE?: number; xEnd?: number | null; xTE?: number | null }[];
  /** The exact check's answer (the route the page leads with), leg by leg. Null: nothing priced. */
  exact?: {
    chain: number[];
    end: number;
    endTE?: number;
    spareHours?: number;
    handoff?: 'hour' | 'now' | 'sooner';
    firstLeg?: 'continue' | 'fresh';
    firstLegOtherHours?: number;
    legs?: ExactLegOut[];
  } | null;
  /** By a date: how late the instant answer's own route arrives on the account (when it misses). */
  exactMissedByHours?: number;
  /** The farm the plan continues against a fresh build's peak delivery (Q/h). */
  buildGap?: { contQph: number; freshQph: number; ratio: number; freshLeg: number };
  checkSeconds?: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const qph = (eggsPerSecond: number) => r3((eggsPerSecond * 3600) / 1e15);
const hours = (seconds: number) => r2(seconds / 3600);

export function instantLegs(r: Route): InstantLegOut[] {
  return r.legs.map(l => ({
    to: l.to,
    endTE: r2(l.endTE),
    start: Math.round(l.start),
    end: Math.round(l.end),
    label: String(l.label ?? '').slice(0, 24),
    sales: l.sales,
    tier13: !!l.tier13,
  }));
}

export function exactLegs(legs: LegSummary[]): ExactLegOut[] {
  return legs.map(l => ({
    te: r2(l.endTE),
    ...(Number.isFinite(l.startTime) ? { start: Math.round(l.startTime!) } : {}),
    days: r3(l.durationSeconds / 86400),
    strategy: String(l.key).slice(0, 32),
    ...(Number.isInteger(l.buildPhaseSaleCount) ? { sales: l.buildPhaseSaleCount } : {}),
    tier13: !!l.tier13Unlocked,
    peakQph: qph(l.maxELR),
    holdHours: hours(l.shiftDelaySeconds ?? 0),
    delayHours: hours(l.sleepDelaySeconds ?? 0),
    ...(l.timeOff ? { timeOff: l.timeOff } : {}),
  }));
}

/** Leg 1's choice and how much later the other way would have ended (as submission.ts sends it). */
export function firstLegOf(legs: LegSummary[]): { firstLeg?: 'continue' | 'fresh'; firstLegOtherHours?: number } {
  const leg1 = legs[0];
  if (!leg1) return {};
  const rival = leg1.firstLegRival;
  const other =
    rival && Number.isFinite(rival.endTime) && Number.isFinite(leg1.endTime)
      ? r2((rival.endTime - leg1.endTime) / 3600)
      : null;
  return {
    firstLeg: leg1.key === 'continue' ? 'continue' : 'fresh',
    ...(other !== null && Math.abs(other) <= 100000 * 24 ? { firstLegOtherHours: other + 0 } : {}),
  };
}

/**
 * The build gap (the analyst, 10 Oct): the farm the plan would continue (its peak delivery as the save
 * stands, `continueTailParams`) against the first fresh build's peak in the exact answer. Under ~0.85 a
 * mid-build farm is far from what a fresh build reaches. Null when either is missing.
 */
export function buildGapOf(
  contPeakEggsPerSecond: number | null | undefined,
  legs: LegSummary[]
): InstantRecord['buildGap'] | undefined {
  const i = legs.findIndex(l => l.key !== 'continue');
  if (!(contPeakEggsPerSecond && contPeakEggsPerSecond > 0) || i < 0 || !(legs[i].maxELR > 0)) return undefined;
  const contQph = qph(contPeakEggsPerSecond);
  const freshQph = qph(legs[i].maxELR);
  if (!(freshQph > 0)) return undefined;
  return { contQph, freshQph, ratio: r3(contQph / freshQph), freshLeg: i + 1 };
}

/**
 * Trim a record to the collector's size cap: first the instant answer's per-leg detail, then the
 * rows past the first eight, then the exact legs. Null when even that is too big (never sent).
 */
export function fitRecord(rec: InstantRecord, max = INSTANT_MAX_BYTES): InstantRecord | null {
  const size = (r: InstantRecord) => new TextEncoder().encode(JSON.stringify(r)).length;
  let r: InstantRecord = rec;
  if (size(r) <= max) return r;
  r = { ...r, instant: { ...r.instant, legs: undefined } };
  if (size(r) <= max) return r;
  if (r.rows && r.rows.length > 8) r = { ...r, rows: r.rows.slice(0, 8) };
  if (size(r) <= max) return r;
  if (r.exact) r = { ...r, exact: { ...r.exact, legs: undefined } };
  return size(r) <= max ? r : null;
}

/** FNV-1a of the record without what changes on every check of the same answer (its timing). */
export function recordSig(rec: InstantRecord): string {
  const { checkSeconds: _c, ...rest } = rec;
  void _c;
  const text = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}

/** Which save, mode and target a record is for: the unit "one an hour" counts in. The partition is the
 *  account's local hash (never sent); this key stays in this browser. */
export function recordSlot(partition: string, rec: InstantRecord): string {
  const what = rec.mode === 'date' ? `date ${rec.deadline}` : `target ${rec.target}`;
  return `${partition}|${rec.backupTime ?? ''}|${what}`;
}

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
export const SENT_KEY = 'aap.instant.sent';
type SentLog = Record<string, { at: number; sig: string }>;

function readLog(st: StorageLike | null): SentLog {
  try {
    const v = JSON.parse(st?.getItem(SENT_KEY) ?? '{}') as SentLog;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Whether this record may go: not the same as the last one for its slot, and an hour after it. */
export function shouldSend(st: StorageLike | null, slot: string, sig: string, now: number): boolean {
  const last = readLog(st)[slot];
  if (!last) return true;
  if (last.sig === sig) return false;
  return now - last.at >= INSTANT_GAP_MS;
}

/** Remember a sent record (and forget entries older than two days, so the log stays small). */
export function noteSent(st: StorageLike | null, slot: string, sig: string, now: number): void {
  const log = readLog(st);
  for (const [k, e] of Object.entries(log)) if (!(now - e.at < 2 * 86400 * 1000)) delete log[k];
  log[slot] = { at: now, sig };
  try {
    st?.setItem(SENT_KEY, JSON.stringify(log));
  } catch {
    /* storage blocked: the collector's daily cap is the backstop */
  }
}

/** A player id must never leave the page: refuse a record whose text holds one. */
export function holdsPlayerId(rec: InstantRecord): boolean {
  return /EI\d{16}/.test(JSON.stringify(rec));
}

export type InstantSendResult = 'sent' | 'skipped' | 'failed';

/**
 * Send one record: checked, trimmed to size, gated (`shouldSend`), then POSTed with the owner code.
 * Never throws: a failed send is just not recorded.
 */
export async function sendInstantRecord(o: {
  url: string;
  owner: string | null;
  partition: string;
  record: InstantRecord;
  storage: StorageLike | null;
  now?: number;
  fetchImpl?: typeof fetch;
}): Promise<InstantSendResult> {
  if (!o.url || !o.owner || !o.partition) return 'skipped';
  const rec = fitRecord(o.record);
  if (!rec || holdsPlayerId(rec)) return 'skipped';
  const now = o.now ?? Date.now();
  const slot = recordSlot(o.partition, rec);
  const sig = recordSig(rec);
  if (!shouldSend(o.storage, slot, sig, now)) return 'skipped';
  try {
    const res = await (o.fetchImpl ?? fetch)(o.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-owner-token': o.owner },
      body: JSON.stringify(rec),
    });
    if (!res.ok) return 'failed';
    noteSent(o.storage, slot, sig, now);
    return 'sent';
  } catch {
    return 'failed';
  }
}

/** The collector's /instant endpoint, from the submit URL; '' without a collector. */
export function instantUrlOf(submitUrl: string): string {
  return /\/submit\/?$/.test(submitUrl) ? submitUrl.replace(/\/submit\/?$/, '/instant') : '';
}
