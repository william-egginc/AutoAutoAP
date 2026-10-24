/**
 * THE FOLLOWED ROUTE, SAVED ONLINE (Jordan, 23 Oct 2026; contract aaap-tools/notes/follow-contract.md v1). Pressing
 * "Follow this route" (any screen) keeps the route in this browser (lib/follow.ts) AND saves it on the collector, so
 * another device shows the same route when the player enters their ID. Nothing else writes it: no write on a result,
 * on a load or on a takeover. Loading an account reads the saved routes back; the newer of the browser's and the
 * saved one (by the client's own `at`, when Follow was pressed) is the one followed.
 *
 * The collector never sees the player ID: the key is SHA-256 of "aaap-follow-v1:" + the ID in UPPER case, lowercase
 * hex, worked out here (`followKey`). Anyone who knows the ID can work out the same key and read or write it: that is
 * accepted (about.html says so). A value never holds the ID or a name (`hasPlayerId` refuses one before sending), and
 * a URL only ever holds the key.
 *
 * Endpoints (the collector's own, from the submit URL, lib/collectorUrl.ts; no other URL):
 *   GET  /follow?k=                 every goal's latest value
 *   PUT  /follow {k, goal, value}   one goal's new value (30 an hour per key, 8 goals per key, 4 KB a value)
 *   GET  /follow/history?k=&goal=   the last 5 versions of one goal, newest first; a restore is a PUT of one again
 * There is no delete: un-following is kept in this browser only (stores/follow.ts keeps when, so an older saved
 * route doesn't come back on the next load).
 *
 * Pure apart from `fetch` (injected, the global one by default) and `crypto.subtle`.
 */
import { eggDaySeconds } from './eggDay';
import { screenGoalKey, type Followed, type FollowFrom, type FollowMap } from './follow';
import type { GoalKey } from './planGoals';

/** The contract's prefix (three a's: follow-contract.md, collector/README.md). The first build hashed 'aap-follow-v1:';
 *  nothing was stored under that key outside the test collector (the live collector had no /follow), so no migration. */
export const FOLLOW_KEY_PREFIX = 'aaap-follow-v1:';
/** The collector's caps (contract v1). */
export const FOLLOW_MAX_VALUE_BYTES = 4096;
export const FOLLOW_MAX_STOPS = 16;
export const FOLLOW_VERSIONS = 5;
/** The Egg Day the contract names on its own; any other year goes as `bydate:<its start>`. */
export const CLOUD_EGG_DAY_YEAR = 2027;

/** Where a followed route came from, as the collector keeps it. */
export type FollowSource = 'instant' | 'fast' | 'exact' | 'custom' | 'manual';
export const FOLLOW_SOURCES: readonly FollowSource[] = ['instant', 'fast', 'exact', 'custom', 'manual'];

/** The hours window as the collector keeps it (24-hour "HH:MM"); null: any time. */
export interface CloudHours {
  start: string;
  end: string;
  timezone?: string;
}

/** One goal's value as the collector keeps it (contract "Value"). */
export interface CloudValue {
  chain: number[];
  planStart: number;
  source: FollowSource;
  /** ms, when Follow was pressed (this device's clock): newer wins. */
  at: number;
  finish?: number;
  endTE?: number;
  spareSeconds?: number;
  hours?: CloudHours | null;
  saveTime?: number;
  simVersion?: string;
  build?: string;
}

/** A value read back, with the collector's version and its own clock. */
export interface CloudEntry {
  value: CloudValue;
  version: number;
  updatedAt: number;
}

/** An EI + 16 digits anywhere: the player ID. Never in a value or a URL. */
const PLAYER_ID = /EI\d{16}/i;
export const hasPlayerId = (s: string): boolean => PLAYER_ID.test(s);

/** The key for an ID: lowercase hex SHA-256 of "aaap-follow-v1:" + the ID trimmed and upper-cased; '' without one. */
export async function followKey(playerId: string): Promise<string> {
  const id = (playerId ?? '').trim().toUpperCase();
  if (!id) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(FOLLOW_KEY_PREFIX + id));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

const isKey = (k: string) => /^[0-9a-f]{64}$/.test(k);

/** The collector's /follow endpoint from the submit URL ('' without a collector). */
export function followUrlOf(submitUrl: string | null | undefined): string {
  const u = (submitUrl ?? '').trim();
  if (!u) return '';
  return /\/submit\/?$/.test(u) ? u.replace(/\/submit\/?$/, '/follow') : `${u.replace(/\/+$/, '')}/follow`;
}

// ----------------------------------------------------------------------------------------- goals

/**
 * The collector's goal for a goal key of this app (lib/planGoals.ts): `fastest-490` race490, `fastest-<te>`
 * target:<te>, `eggday-2027` eggday2027, another Egg Day and `date-<unix>` bydate:<unix>. Null: not one it keeps.
 */
export function cloudGoalOf(goalKey: GoalKey): string | null {
  let m = /^fastest-(\d+)$/.exec(goalKey);
  if (m) {
    const te = Number(m[1]);
    if (te === 490) return 'race490';
    return te >= 1 && te <= 490 ? `target:${te}` : null;
  }
  m = /^eggday-(\d{4})$/.exec(goalKey);
  if (m) return Number(m[1]) === CLOUD_EGG_DAY_YEAR ? 'eggday2027' : okDate(eggDaySeconds(Number(m[1])));
  m = /^date-(\d+)$/.exec(goalKey);
  return m ? okDate(Number(m[1])) : null;
}
const okDate = (d: number) => (Number.isInteger(d) && d >= 1577836800 && d <= 4102444800 ? `bydate:${d}` : null);

/** Back the other way: the app's goal key for a collector goal (an Egg Day date is Egg Day's key), or null. */
export function goalKeyOfCloud(goal: string, nowMs = Date.now()): GoalKey | null {
  if (goal === 'race490') return 'fastest-490';
  if (goal === 'eggday2027') return `eggday-${CLOUD_EGG_DAY_YEAR}`;
  let m = /^target:(\d{1,3})$/.exec(goal);
  if (m) return `fastest-${Number(m[1])}`;
  m = /^bydate:(\d{9,11})$/.exec(goal);
  return m ? screenGoalKey(Number(m[1]), 0, nowMs) : null;
}

// ----------------------------------------------------------------------------------------- values

/** "Follow this route"'s own source when the button doesn't say: the instant answer's, typed or a board row's by hand. */
export function sourceOfFrom(from: FollowFrom): FollowSource {
  return from === 'answer' || from === 'count' ? 'instant' : 'manual';
}

/** A search level (lib/searchPointer.ts FoundLevel) as a source. */
export function sourceOfLevel(level: 'Fast' | 'Exact' | 'Custom' | null | undefined): Exclude<FollowSource, 'manual'> {
  return level === 'Exact' ? 'exact' : level === 'Custom' ? 'custom' : level === 'Fast' ? 'fast' : 'instant';
}

const pad2 = (h: number) => String(h).padStart(2, '0');

/**
 * The hours window of Your setup as the collector keeps it: `{start, end, timezone}` from search/availability.ts's
 * `fromHour`/`toHour`, null for any time. The days and the time off are not kept (the contract has no field).
 */
export function hoursOf(a: { fromHour: number; toHour: number; timezone?: string } | null | undefined): CloudHours | null {
  if (!a || !Number.isInteger(a.fromHour) || !Number.isInteger(a.toHour) || a.fromHour === a.toHour) return null;
  if (a.fromHour < 0 || a.fromHour > 23 || a.toHour < 0 || a.toHour > 23) return null;
  const tz = typeof a.timezone === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(a.timezone) ? a.timezone : undefined;
  return { start: `${pad2(a.fromHour)}:00`, end: `${pad2(a.toHour)}:00`, ...(tz ? { timezone: tz } : {}) };
}

/** Two hours windows are the same (null = any time). */
export function sameHours(a: CloudHours | null | undefined, b: CloudHours | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.start === b.start && a.end === b.end && (a.timezone ?? '') === (b.timezone ?? '');
}

const UNIX_FROM = 1577836800;
const UNIX_TO = 4102444800;
const whole = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const STAMP = /^[0-9A-Za-z._:-]{1,40}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The value saved for a followed route: the route (`chain`), when the plan starts, where it came from, when Follow was
 * pressed, and the summary (finish, TE, spare, the hours window, the save's time, the simulator and the app's
 * version). Each optional field out of the collector's bounds is left out rather than refused. Null when the route
 * itself can't be kept (more than 16 stops, a stop that isn't a whole TE 0 to 490, or an ID somewhere).
 * `trimmed`: over 4 KB with everything, so only the route and its summary went (it never is in practice: no legs are
 * ever sent, the contract has no field for them).
 */
export function buildCloudValue(f: Followed): { value: CloudValue; trimmed: boolean } | null {
  const chain = f.chain;
  if (!chain.length || chain.length > FOLLOW_MAX_STOPS) return null;
  if (!chain.every((x, i) => whole(x, 0, 490) && (i === 0 || x > chain[i - 1]))) return null;
  const at = Math.round(f.at);
  if (!whole(at, UNIX_FROM * 1000, UNIX_TO * 1000)) return null;
  const planStart = whole(f.planStart, UNIX_FROM, UNIX_TO) ? f.planStart : Math.floor(at / 1000);
  const source = f.source && FOLLOW_SOURCES.includes(f.source) ? f.source : sourceOfFrom(f.from);
  const value: CloudValue = { chain: [...chain], planStart, source, at };
  if (whole(f.finish, UNIX_FROM, UNIX_TO)) value.finish = f.finish;
  if (whole(f.endTE, 0, 490)) value.endTE = f.endTE;
  if (typeof f.spareSeconds === 'number' && Number.isFinite(f.spareSeconds) && Math.abs(f.spareSeconds) <= 3e8)
    value.spareSeconds = Math.round(f.spareSeconds);
  if (f.hours === null) value.hours = null;
  else if (f.hours && HHMM.test(f.hours.start) && HHMM.test(f.hours.end))
    value.hours = {
      start: f.hours.start,
      end: f.hours.end,
      ...(f.hours.timezone && /^[A-Za-z0-9_+\-/]{1,64}$/.test(f.hours.timezone) ? { timezone: f.hours.timezone } : {}),
    };
  if (whole(f.saveTime, UNIX_FROM, UNIX_TO)) value.saveTime = f.saveTime;
  if (typeof f.simVersion === 'string' && STAMP.test(f.simVersion)) value.simVersion = f.simVersion;
  if (typeof f.build === 'string' && STAMP.test(f.build)) value.build = f.build;
  const text = JSON.stringify(value);
  if (hasPlayerId(text)) return null;
  if (new TextEncoder().encode(text).length <= FOLLOW_MAX_VALUE_BYTES) return { value, trimmed: false };
  // Only the route and the summary that compares it.
  const small: CloudValue = { chain: value.chain, planStart, source, at };
  for (const k of ['finish', 'endTE', 'spareSeconds'] as const) if (value[k] !== undefined) small[k] = value[k];
  return { value: small, trimmed: true };
}

/** A value read back from the collector (anything else: null). */
export function readCloudValue(v: unknown): CloudValue | null {
  const x = v as Partial<CloudValue> | null;
  if (!x || typeof x !== 'object' || !Array.isArray(x.chain) || !x.chain.length) return null;
  if (!x.chain.every(n => Number.isInteger(n))) return null;
  if (typeof x.at !== 'number' || !Number.isFinite(x.at) || typeof x.planStart !== 'number') return null;
  const source = FOLLOW_SOURCES.includes(x.source as FollowSource) ? (x.source as FollowSource) : 'manual';
  return { ...(x as CloudValue), chain: [...x.chain], source };
}

/** The followed route kept in this browser for a value read back. */
export function followedFromCloud(v: CloudValue): Followed {
  const from: FollowFrom = v.source === 'instant' ? 'answer' : v.source === 'manual' ? 'typed' : 'saved';
  const f: Followed = { chain: [...v.chain], from, at: v.at, source: v.source, planStart: v.planStart, cloud: true };
  if (v.finish !== undefined) f.finish = v.finish;
  if (v.endTE !== undefined) f.endTE = v.endTE;
  if (v.spareSeconds !== undefined) f.spareSeconds = v.spareSeconds;
  if (v.hours !== undefined) f.hours = v.hours;
  if (v.saveTime !== undefined) f.saveTime = v.saveTime;
  if (v.simVersion !== undefined) f.simVersion = v.simVersion;
  if (v.build !== undefined) f.build = v.build;
  return f;
}

/**
 * NEWER WINS (by the client's `at`, never the collector's clock): each saved goal replaces the browser's when the
 * browser has none for it or an older one, unless the player un-followed it here after it was saved (`gone`, when).
 * A browser follow that is newer stays and is NOT written back (only Follow writes). `taken`: the goals replaced.
 */
export function mergeCloud(
  local: FollowMap,
  cloud: Record<GoalKey, CloudValue>,
  gone: Record<GoalKey, number> = {}
): { map: FollowMap; taken: GoalKey[] } {
  const map: FollowMap = { ...local };
  const taken: GoalKey[] = [];
  for (const [goalKey, v] of Object.entries(cloud)) {
    const here = local[goalKey];
    if (here && here.at >= v.at) continue;
    if ((gone[goalKey] ?? 0) >= v.at) continue;
    map[goalKey] = followedFromCloud(v);
    taken.push(goalKey);
  }
  return { map, taken };
}

// ------------------------------------------------------------------------------------- the calls

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Why a call didn't work: 'limit' (429), 'big' (413), 'rejected' (400), 'off' (no collector or 503), 'offline'. */
export type CloudFail = 'limit' | 'big' | 'rejected' | 'off' | 'offline' | 'error';

const failOf = (status: number): CloudFail =>
  status === 429 ? 'limit' : status === 413 ? 'big' : status === 400 ? 'rejected' : status === 503 ? 'off' : 'error';

const defaultFetch = (): FetchLike | null => (typeof fetch === 'function' ? (fetch as unknown as FetchLike) : null);

/** GET /follow?k=: every saved goal's latest value, by this app's goal key. */
export async function getFollows(
  url: string,
  k: string,
  f: FetchLike | null = defaultFetch(),
  nowMs = Date.now()
): Promise<{ ok: true; goals: Record<GoalKey, CloudEntry> } | { ok: false; why: CloudFail }> {
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  try {
    const res = await f(`${url}?k=${k}`, { method: 'GET' });
    if (!res.ok) return { ok: false, why: failOf(res.status) };
    const body = (await res.json()) as { goals?: Record<string, { value?: unknown; version?: number; updatedAt?: number }> };
    const goals: Record<GoalKey, CloudEntry> = {};
    for (const [g, e] of Object.entries(body?.goals ?? {})) {
      const key = goalKeyOfCloud(g, nowMs);
      const value = readCloudValue(e?.value);
      if (!key || !value) continue;
      const entry = { value, version: Number(e.version) || 0, updatedAt: Number(e.updatedAt) || 0 };
      // Two collector goals can be one goal here (target:490 and race490): the newer.
      if (!goals[key] || goals[key].value.at < value.at) goals[key] = entry;
    }
    return { ok: true, goals };
  } catch {
    return { ok: false, why: 'offline' };
  }
}

/** PUT /follow: one goal's value. `version`: the collector's version of it now. */
export async function putFollow(
  url: string,
  k: string,
  goalKey: GoalKey,
  value: CloudValue,
  f: FetchLike | null = defaultFetch()
): Promise<{ ok: true; version: number } | { ok: false; why: CloudFail; retryAfter?: number }> {
  const goal = cloudGoalOf(goalKey);
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  if (!goal) return { ok: false, why: 'rejected' };
  const body = JSON.stringify({ k, goal, value });
  if (hasPlayerId(body)) return { ok: false, why: 'rejected' };
  try {
    const res = await f(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
    if (!res.ok) {
      let retryAfter: number | undefined;
      try {
        const j = (await res.json()) as { retryAfter?: number };
        if (typeof j?.retryAfter === 'number') retryAfter = j.retryAfter;
      } catch {
        // no body
      }
      return { ok: false, why: failOf(res.status), ...(retryAfter !== undefined ? { retryAfter } : {}) };
    }
    const j = (await res.json().catch(() => ({}))) as { version?: number };
    return { ok: true, version: Number(j?.version) || 0 };
  } catch {
    return { ok: false, why: 'offline' };
  }
}

/** GET /follow/history?k=&goal=: the last 5 versions of a goal, newest first. */
export async function getFollowHistory(
  url: string,
  k: string,
  goalKey: GoalKey,
  f: FetchLike | null = defaultFetch()
): Promise<{ ok: true; versions: CloudEntry[] } | { ok: false; why: CloudFail }> {
  const goal = cloudGoalOf(goalKey);
  if (!url || !isKey(k) || !f || !goal) return { ok: false, why: 'off' };
  try {
    const res = await f(`${url}/history?k=${k}&goal=${encodeURIComponent(goal)}`, { method: 'GET' });
    if (!res.ok) return { ok: false, why: failOf(res.status) };
    const body = (await res.json()) as { versions?: { version?: number; updatedAt?: number; value?: unknown }[] };
    const versions: CloudEntry[] = [];
    for (const e of body?.versions ?? []) {
      const value = readCloudValue(e?.value);
      if (value) versions.push({ value, version: Number(e.version) || 0, updatedAt: Number(e.updatedAt) || 0 });
    }
    versions.sort((a, b) => b.version - a.version);
    return { ok: true, versions: versions.slice(0, FOLLOW_VERSIONS) };
  } catch {
    return { ok: false, why: 'offline' };
  }
}

// ------------------------------------------------------------------------------------- the words

/** Setup › Sharing's note when the saved routes couldn't be read on load. */
export const UNREACHABLE_NOTE = "Couldn't reach the saved route right now.";
/** A save refused for the hour's limit. */
export const LIMIT_WORDS = 'Too many changes this hour. Try again later.';

/** What a failed save says (Restore shows it; a Follow press shows it under Right now's route). */
export function saveFailWords(why: CloudFail): string {
  if (why === 'limit') return LIMIT_WORDS;
  if (why === 'big') return 'This route is too big to save online; it is still followed in this browser.';
  if (why === 'rejected') return "This route couldn't be saved online; it is still followed in this browser.";
  return "Couldn't save the route online right now; it is still followed in this browser.";
}

/** Right now's note when the followed route isn't saved online (stores/follow.ts `notSaved`), before "Save it online". */
export const NOT_SAVED_WORDS = 'Not saved online yet: your other devices don’t see this route.';

/** Right now's quiet note when a saved route was set with other hours or another simulator than the player's now. */
export function setWithOtherWords(o: { hours: boolean; sim: boolean }): string {
  if (o.hours && o.sim) return 'This route was set with a different hours window and simulator version.';
  if (o.hours) return 'This route was set with a different hours window.';
  if (o.sim) return 'This route was set with a different simulator version.';
  return '';
}

/** "Fast run", "instant answer", "typed or picked by hand": a source in the player's words. */
export function sourceWords(s: FollowSource): string {
  return s === 'instant' ? 'instant answer' : s === 'manual' ? 'picked by hand' : `${s[0].toUpperCase()}${s.slice(1)} run`;
}
