/**
 * YOUR CHOICES AND SETUP, SAVED ONLINE (Jordan, 26 Oct 2026; contract aaap-tools/notes/prefs-contract.md v1). Each
 * account's consent choices ("Help improve the planner" and the sharing ticks behind it, the credit) and its Setup
 * (awake hours and days, time off, no prestige days, the target TE, the time zone) are kept on the collector too, so a
 * new browser or a private window has them when the player enters their ID. Not "This computer" (workers, memory).
 *
 * The key is the followed route's (lib/followCloud.ts `followKey`: SHA-256 of "aaap-follow-v1:" + the ID in UPPER
 * case, lowercase hex). The raw ID is never in a URL or a value: a value with EI + 16 digits anywhere is never built
 * (`hasPlayerId`), and a body with one is never sent.
 *
 * Endpoints (the collector's own, from the submit URL; no other URL):
 *   GET /prefs?k=                     both kinds' latest values ({ prefs: { consent?, setup? } }); 404: an older
 *                                     collector with no /prefs ("no cloud prefs here")
 *   PUT /prefs {k, kind, value}       one kind's new value (30 an hour per key, 4 KB a value, 6 KB a body)
 * Last write wins by the client's own `at` inside the value; the collector doesn't compare them.
 *
 * Pure apart from `fetch` (injected, the global one by default), `crypto.subtle` (the key) and the guarded
 * localStorage of the local `at` records (`readLocalAt`/`writeLocalAt`).
 */
import { followKey, followUrlOf, hasPlayerId, type CloudFail } from './followCloud';
import type { TimeOffDates } from '@/search/timeOff';

export { hasPlayerId };
/** The same key as the followed routes (one code per account). */
export const prefsKey = followKey;

export type PrefsKind = 'consent' | 'setup';
export const PREFS_KINDS: readonly PrefsKind[] = ['consent', 'setup'];

/** The collector's caps (contract v1). */
export const PREFS_MAX_VALUE_BYTES = 4096;
export const PREFS_MAX_BODY_BYTES = 6144;
export const PREFS_MAX_RANGES = 16;
export const PREFS_MAX_TICKS = 16;
export const PREFS_NAME_MAX = 40;
export const PREFS_VERSIONS = 5;
export const PREFS_WRITES_PER_HOUR = 30;
/** A call that hangs this long counts as offline. */
export const PREFS_TIMEOUT_MS = 10_000;

/** The consents kept online (useConsent.ts ids). The sharing choices only: the Stepping away? ones (carry on after a
 *  crash, watch from a tab or a phone, send progress) and a sweep's one-off "I understand" describe this computer or a
 *  single run, and stay in this browser. */
export const SYNCED_CONSENTS = ['leaderboard', 'sendCsv', 'diagnosticsDefault', 'keepSharingChecks', 'shareBaseline'] as const;
export type SyncedConsent = (typeof SYNCED_CONSENTS)[number];

// ----------------------------------------------------------------------------------------- shapes

/** The Consent value (contract). */
export interface CloudConsent {
  at: number;
  answeredAt?: number;
  study?: 'yes' | 'no' | 'later';
  ticks?: Record<string, boolean>;
  credit?: 'name' | 'anonymous';
  nickname?: string;
}

/** One time off or no prestige stretch as the collector keeps it (the app's own `YYYY-MM-DD` text). */
export interface CloudRange {
  from: string;
  to: string;
}

/** Awake hours (24-hour "HH:MM"), the days they hold on (0 = Sunday) and whether they are on (Setup's tick). */
export interface CloudHours {
  start: string;
  end: string;
  days?: number[];
  scheduleEnabled?: boolean;
}

/** The Setup value (contract, with the two changes the collector adopted on 26 Oct: `noPrestigeDays` shaped like
 *  `timeOff`, and `days` and `scheduleEnabled` inside `hours`). */
export interface CloudSetup {
  at: number;
  hours?: CloudHours | null;
  timeOff?: CloudRange[];
  noPrestigeDays?: CloudRange[];
  targetTE?: number | null;
  timezone?: string;
}

export type CloudPrefValue = CloudConsent | CloudSetup;

/** A kind read back, with the collector's version and its own clock. */
export interface PrefsEntry<V> {
  value: V;
  version: number;
  updatedAt: number;
}

/** The consent of the account on screen, as the app holds it (stores/prefs.ts reads it from useStudy and useConsent). */
export interface ConsentNow {
  /** This account's answer to "Help improve the planner" (null: not answered for it). */
  study: 'yes' | 'no' | null;
  /** When it was answered, ms (0: unknown). */
  answeredAt: number;
  /** The synced consents this account has chosen (a default nobody chose is left out). */
  ticks: Partial<Record<SyncedConsent, boolean>>;
  credit: 'name' | 'anonymous' | null;
  /** The "Credit me as" name typed for the account ('' for none). */
  nickname: string;
}

/** Setup as the app holds it (stores/chainSearch.ts and the Auto Planner store's time zone). */
export interface SetupNow {
  scheduleEnabled: boolean;
  fromHour: number;
  toHour: number;
  days: number[];
  timeOff: TimeOffDates[];
  noPrestige: TimeOffDates[];
  finalTE: number;
  timezone: string;
}

// ----------------------------------------------------------------------------------------- rules

const AT_FROM = Date.UTC(2020, 0, 1);
const AT_TO = Date.UTC(2100, 0, 1);
const okAt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= AT_FROM && (v as number) <= AT_TO;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const RANGE_TEXT = /^[0-9A-Za-z:T +/_-]{1,32}$/;
const TICK_KEY = /^[a-z][A-Za-z0-9]{0,23}$/;
const ZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const pad2 = (h: number) => String(h).padStart(2, '0');
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** A name as the collector keeps it: control characters dropped, at most 40 characters (counted as a player sees them). */
export function cleanNickname(s: string): string {
  return Array.from(String(s ?? '').replace(CONTROL, '').trim()).slice(0, PREFS_NAME_MAX).join('').trim();
}

const ranges = (list: readonly { from: string; to: string }[] | null | undefined): CloudRange[] =>
  (list ?? [])
    .filter(w => !!w && typeof w.from === 'string' && typeof w.to === 'string' && RANGE_TEXT.test(w.from) && RANGE_TEXT.test(w.to))
    .slice(0, PREFS_MAX_RANGES)
    .map(w => ({ from: w.from, to: w.to }));

const weekdays = (v: unknown): number[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : null;

/**
 * THE AWAKE HOURS MAPPING, both ways, in one place (where `days` and `scheduleEnabled` sit is decided here only; the
 * collector adopted both inside `hours`, prefs-contract-progress.md 26 Oct). `hours` {start, end, days, scheduleEnabled}:
 * the hours picked are kept while the tick is off too. The app's whole hours go as "HH:00" (24 as "00:00", the same end
 * of the day); a read "HH:MM" keeps its hour. Read back: null is "any time" (off); no `scheduleEnabled` is on.
 */
export function scheduleToCloud(s: Pick<SetupNow, 'scheduleEnabled' | 'fromHour' | 'toHour' | 'days'>): Pick<CloudSetup, 'hours'> {
  const hour = (h: number) => (Number.isInteger(h) && h >= 0 && h <= 24 ? h % 24 : null);
  const from = hour(s.fromHour);
  const to = hour(s.toHour);
  if (from === null || to === null) return { hours: null };
  const days = weekdays(s.days) ?? [];
  return { hours: { start: `${pad2(from)}:00`, end: `${pad2(to)}:00`, days, scheduleEnabled: !!s.scheduleEnabled } };
}
export function scheduleFromCloud(v: Pick<CloudSetup, 'hours'>): Partial<Pick<SetupNow, 'scheduleEnabled' | 'fromHour' | 'toHour' | 'days'>> {
  if (v.hours === undefined) return {};
  if (v.hours === null) return { scheduleEnabled: false };
  const out: Partial<Pick<SetupNow, 'scheduleEnabled' | 'fromHour' | 'toHour' | 'days'>> = {
    scheduleEnabled: v.hours.scheduleEnabled ?? true,
    fromHour: Number(v.hours.start.slice(0, 2)),
    toHour: Number(v.hours.end.slice(0, 2)),
  };
  if (v.hours.days) out.days = [...v.hours.days];
  return out;
}

/** A value's JSON is within the caps and holds no ID. */
function fits(value: object): boolean {
  const text = JSON.stringify(value);
  return !hasPlayerId(text) && bytes(text) <= PREFS_MAX_VALUE_BYTES;
}

/**
 * The Setup value for what the app holds, stamped `at`. Out-of-bounds parts are left out (a half-typed time off row,
 * an unknown zone, a target outside 1 to 490 goes as null). Null: `at` out of bounds, an ID somewhere, or over 4 KB.
 */
export function buildSetupValue(s: SetupNow, at: number): CloudSetup | null {
  if (!okAt(at)) return null;
  const value: CloudSetup = {
    at,
    ...scheduleToCloud(s),
    timeOff: ranges(s.timeOff),
    noPrestigeDays: ranges(s.noPrestige),
    targetTE: Number.isInteger(s.finalTE) && s.finalTE >= 1 && s.finalTE <= 490 ? s.finalTE : null,
  };
  if (typeof s.timezone === 'string' && ZONE.test(s.timezone)) value.timezone = s.timezone;
  return fits(value) ? value : null;
}

/** The Consent value for what the app holds, stamped `at`. Null: `at` out of bounds, an ID somewhere, or over 4 KB. */
export function buildConsentValue(c: ConsentNow, at: number): CloudConsent | null {
  if (!okAt(at)) return null;
  const value: CloudConsent = { at };
  if (okAt(c.answeredAt) && c.study) value.answeredAt = c.answeredAt;
  if (c.study) value.study = c.study;
  const ticks: Record<string, boolean> = {};
  for (const id of SYNCED_CONSENTS) if (typeof c.ticks[id] === 'boolean') ticks[id] = c.ticks[id]!;
  if (Object.keys(ticks).length) value.ticks = ticks;
  if (c.credit) value.credit = c.credit;
  const name = cleanNickname(c.nickname);
  if (c.credit === 'name' && name) value.nickname = name;
  return fits(value) ? value : null;
}

/**
 * The contract's own checks of a value (what the collector would refuse, by field): [] when it would keep it.
 * `at` required; unknown fields aren't problems (the collector drops them).
 */
export function prefsProblems(kind: PrefsKind, v: unknown): string[] {
  const x = v as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return ['value'];
  const p: string[] = [];
  const text = JSON.stringify(x);
  if (hasPlayerId(text)) p.push('id');
  if (bytes(text) > PREFS_MAX_VALUE_BYTES) p.push('size');
  if (!okAt(x.at)) p.push('at');
  if (kind === 'consent') {
    if (x.answeredAt !== undefined && !okAt(x.answeredAt)) p.push('answeredAt');
    if (x.study !== undefined && !['yes', 'no', 'later'].includes(x.study as string)) p.push('study');
    if (x.ticks !== undefined) {
      const t = x.ticks as Record<string, unknown>;
      if (!t || typeof t !== 'object' || Array.isArray(t) || Object.keys(t).length > PREFS_MAX_TICKS) p.push('ticks');
      else if (Object.entries(t).some(([k, b]) => !TICK_KEY.test(k) || typeof b !== 'boolean')) p.push('ticks');
    }
    if (x.credit !== undefined && x.credit !== 'name' && x.credit !== 'anonymous') p.push('credit');
    if (x.nickname !== undefined && (typeof x.nickname !== 'string' || Array.from(x.nickname).length > PREFS_NAME_MAX)) p.push('nickname');
  } else {
    if (x.hours !== undefined && x.hours !== null) {
      const h = x.hours as Record<string, unknown>;
      if (typeof h !== 'object' || !HHMM.test(String(h.start)) || !HHMM.test(String(h.end))) p.push('hours');
      else if (h.days !== undefined && (!Array.isArray(h.days) || h.days.length > 7 || weekdays(h.days)?.length !== h.days.length))
        p.push('hours.days');
      else if (h.scheduleEnabled !== undefined && typeof h.scheduleEnabled !== 'boolean') p.push('hours.scheduleEnabled');
    }
    for (const f of ['timeOff', 'noPrestigeDays'] as const) {
      const list = x[f];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.length > PREFS_MAX_RANGES) p.push(f);
      else if (list.some(w => !w || typeof w !== 'object' || !RANGE_TEXT.test(String(w.from)) || !RANGE_TEXT.test(String(w.to)))) p.push(f);
    }
    if (x.targetTE !== undefined && x.targetTE !== null && !(Number.isInteger(x.targetTE) && (x.targetTE as number) >= 1 && (x.targetTE as number) <= 490))
      p.push('targetTE');
    if (x.timezone !== undefined && (typeof x.timezone !== 'string' || !ZONE.test(x.timezone))) p.push('timezone');
  }
  return p;
}

/** A Consent value read back: the known fields that are within bounds (the rest dropped); null without a good `at`
 *  or with an ID anywhere. */
export function readConsentValue(v: unknown): CloudConsent | null {
  const x = v as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || !okAt(x.at) || hasPlayerId(JSON.stringify(x))) return null;
  const out: CloudConsent = { at: x.at };
  if (okAt(x.answeredAt)) out.answeredAt = x.answeredAt;
  if (x.study === 'yes' || x.study === 'no' || x.study === 'later') out.study = x.study;
  const t = x.ticks as Record<string, unknown> | null;
  if (t && typeof t === 'object' && !Array.isArray(t)) {
    const ticks: Record<string, boolean> = {};
    for (const [k, b] of Object.entries(t)) if (TICK_KEY.test(k) && typeof b === 'boolean') ticks[k] = b;
    if (Object.keys(ticks).length) out.ticks = ticks;
  }
  if (x.credit === 'name' || x.credit === 'anonymous') out.credit = x.credit;
  if (out.credit === 'name' && typeof x.nickname === 'string' && cleanNickname(x.nickname)) out.nickname = cleanNickname(x.nickname);
  return out;
}

/** A Setup value read back, the same way. */
export function readSetupValue(v: unknown): CloudSetup | null {
  const x = v as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || !okAt(x.at) || hasPlayerId(JSON.stringify(x))) return null;
  const out: CloudSetup = { at: x.at };
  if (x.hours === null) out.hours = null;
  else if (x.hours && typeof x.hours === 'object') {
    const h = x.hours as Record<string, unknown>;
    if (HHMM.test(String(h.start)) && HHMM.test(String(h.end))) {
      out.hours = { start: String(h.start), end: String(h.end) };
      const days = weekdays(h.days);
      if (days) out.hours.days = days;
      if (typeof h.scheduleEnabled === 'boolean') out.hours.scheduleEnabled = h.scheduleEnabled;
    }
  }
  if (Array.isArray(x.timeOff)) out.timeOff = ranges(x.timeOff as CloudRange[]);
  if (Array.isArray(x.noPrestigeDays)) out.noPrestigeDays = ranges(x.noPrestigeDays as CloudRange[]);
  if (x.targetTE === null) out.targetTE = null;
  else if (Number.isInteger(x.targetTE) && (x.targetTE as number) >= 1 && (x.targetTE as number) <= 490) out.targetTE = x.targetTE as number;
  if (typeof x.timezone === 'string' && ZONE.test(x.timezone)) out.timezone = x.timezone;
  return out;
}

/** A time zone this browser knows (an unknown one, put in place, makes every date on the page throw). */
export function isKnownZone(zone: string): boolean {
  if (typeof zone !== 'string' || !ZONE.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** What a Setup value read back sets in the app (only the parts it has). */
export function setupFromCloud(v: CloudSetup): Partial<SetupNow> {
  const out: Partial<SetupNow> = { ...scheduleFromCloud(v) };
  if (v.timeOff) out.timeOff = v.timeOff.map(w => ({ from: w.from, to: w.to }));
  if (v.noPrestigeDays) out.noPrestige = v.noPrestigeDays.map(w => ({ from: w.from, to: w.to }));
  if (typeof v.targetTE === 'number') out.finalTE = v.targetTE;
  if (v.timezone) out.timezone = v.timezone;
  return out;
}

/** What a Consent value read back sets in the app: "later" counts as answered (not asked again), like "no". */
export function consentFromCloud(v: CloudConsent): ConsentNow {
  const ticks: Partial<Record<SyncedConsent, boolean>> = {};
  for (const id of SYNCED_CONSENTS) if (typeof v.ticks?.[id] === 'boolean') ticks[id] = v.ticks[id];
  return {
    study: v.study === 'yes' ? 'yes' : v.study === 'no' || v.study === 'later' ? 'no' : null,
    answeredAt: v.answeredAt ?? (v.study ? v.at : 0),
    ticks,
    credit: v.credit ?? null,
    nickname: v.credit === 'name' ? (v.nickname ?? '') : '',
  };
}

/** A value with its `at` aside, as one string: two values that say the same thing have the same one. */
export function prefsSig(v: CloudPrefValue | null): string {
  if (!v) return '';
  const rest: Record<string, unknown> = { ...v };
  delete rest.at;
  return JSON.stringify(rest);
}

/** NEWER WINS (by the client's `at`, never the collector's clock): the cloud value is applied only when newer. */
export const cloudIsNewer = (cloudAt: number, localAt: number): boolean => cloudAt > localAt;

// ------------------------------------------------------------------------------------ the local `at`

/** What this browser keeps per account and kind: the `at` of the value it last changed, saved or applied, and that
 *  value's `prefsSig`. `pending`: changed here, not saved online yet. Under the partition hash, never the ID. */
export interface LocalAt {
  at: number;
  sig: string;
  pending?: boolean;
}
export const localAtKey = (hash: string, kind: PrefsKind) => `aap.prefsAt.${hash}.${kind}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLocalAt(hash: string, kind: PrefsKind): LocalAt | null {
  if (!hash) return null;
  try {
    const o = JSON.parse(storage()?.getItem(localAtKey(hash, kind)) ?? 'null') as Partial<LocalAt> | null;
    if (!o || typeof o !== 'object' || typeof o.at !== 'number' || !Number.isFinite(o.at) || typeof o.sig !== 'string') return null;
    return { at: o.at, sig: o.sig, ...(o.pending ? { pending: true } : {}) };
  } catch {
    return null;
  }
}

export function writeLocalAt(hash: string, kind: PrefsKind, rec: LocalAt): void {
  if (!hash || hasPlayerId(rec.sig)) return;
  try {
    storage()?.setItem(localAtKey(hash, kind), JSON.stringify(rec));
  } catch {
    // for this visit only
  }
}

// ------------------------------------------------------------------------------------- the calls

/** The collector's /prefs endpoint from the submit URL ('' without a collector). */
export function prefsUrlOf(submitUrl: string | null | undefined): string {
  const f = followUrlOf(submitUrl);
  return f ? f.replace(/\/follow$/, '/prefs') : '';
}

export type PrefsFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Why a call didn't work: followCloud's, plus 'missing' (404: a collector without /prefs). */
export type PrefsFail = CloudFail | 'missing';

const failOf = (status: number): PrefsFail =>
  status === 404 ? 'missing' : status === 429 ? 'limit' : status === 413 ? 'big' : status === 400 ? 'rejected' : status === 503 ? 'off' : 'error';

const isKey = (k: string) => /^[0-9a-f]{64}$/.test(k);
const defaultFetch = (): PrefsFetch | null => (typeof fetch === 'function' ? (fetch as unknown as PrefsFetch) : null);

/** `f` with a timeout (an abort when the browser has AbortController; a hung call counts as offline either way). */
async function timed<T>(run: (signal?: AbortSignal) => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    return await Promise.race([
      run(ctl?.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl?.abort();
          reject(new Error('timeout'));
        }, PREFS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** GET /prefs?k=: both kinds' latest values (a kind never saved, or one that doesn't read, is absent). */
export async function getPrefs(
  url: string,
  k: string,
  f: PrefsFetch | null = defaultFetch()
): Promise<
  | { ok: true; consent?: PrefsEntry<CloudConsent>; setup?: PrefsEntry<CloudSetup> }
  | { ok: false; why: PrefsFail }
> {
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  try {
    return await timed(async signal => {
      const res = await f(`${url}?k=${k}`, { method: 'GET', ...(signal ? { signal } : {}) });
      if (!res.ok) return { ok: false as const, why: failOf(res.status) };
      const body = (await res.json()) as { prefs?: Record<string, { value?: unknown; version?: number; updatedAt?: number }> };
      const out: { ok: true; consent?: PrefsEntry<CloudConsent>; setup?: PrefsEntry<CloudSetup> } = { ok: true };
      const c = body?.prefs?.consent;
      const cv = readConsentValue(c?.value);
      if (c && cv) out.consent = { value: cv, version: Number(c.version) || 0, updatedAt: Number(c.updatedAt) || 0 };
      const s = body?.prefs?.setup;
      const sv = readSetupValue(s?.value);
      if (s && sv) out.setup = { value: sv, version: Number(s.version) || 0, updatedAt: Number(s.updatedAt) || 0 };
      return out;
    });
  } catch {
    return { ok: false, why: 'offline' };
  }
}

/** PUT /prefs: one kind's new value. `retryAfter`: seconds, from a 429. */
export async function putPrefs(
  url: string,
  k: string,
  kind: PrefsKind,
  value: CloudPrefValue,
  f: PrefsFetch | null = defaultFetch()
): Promise<{ ok: true; version: number; unchanged: boolean } | { ok: false; why: PrefsFail; retryAfter?: number }> {
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  if (prefsProblems(kind, value).length) return { ok: false, why: 'rejected' };
  const body = JSON.stringify({ k, kind, value });
  if (hasPlayerId(body)) return { ok: false, why: 'rejected' };
  if (bytes(body) > PREFS_MAX_BODY_BYTES) return { ok: false, why: 'big' };
  try {
    return await timed(async signal => {
      const res = await f(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body, ...(signal ? { signal } : {}) });
      if (!res.ok) {
        let retryAfter: number | undefined;
        try {
          const j = (await res.json()) as { retryAfter?: number };
          if (typeof j?.retryAfter === 'number' && Number.isFinite(j.retryAfter)) retryAfter = j.retryAfter;
        } catch {
          // no body
        }
        return { ok: false as const, why: failOf(res.status), ...(retryAfter !== undefined ? { retryAfter } : {}) };
      }
      const j = (await res.json().catch(() => ({}))) as { version?: number; unchanged?: boolean };
      return { ok: true as const, version: Number(j?.version) || 0, unchanged: j?.unchanged === true };
    });
  } catch {
    return { ok: false, why: 'offline' };
  }
}
