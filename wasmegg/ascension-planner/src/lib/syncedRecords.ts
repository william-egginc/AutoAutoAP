/**
 * SYNCED RECORDS (Jordan, 7 Nov 2026; client brief aaap-tools/notes/sync-client-brief-2026-11-07.md, design
 * sync-override-tracker-design-2026-11-07.md; the collector's side is collector/sync.js on branch spec-sync). Small
 * per-account records kept in the browser AND on the collector so every device agrees: the starting-TE override
 * (`override`, slot '0'; phase A) and, later, the Build-up tracker's ticks and kept plan (`ticks`, `plan`, slot = the
 * ascension's start; phase B). Plus "Delete everything saved online for this account" (`forgetEverything`).
 *
 * OFF until the orchestrator flips SYNC_RECORDS (one line), and always behind the master switch (lib/saveOnline.ts:
 * the callers derive the URL through `cloudSubmitUrl`). The key `k` is the followed routes' (lib/followCloud.ts
 * `followKey`): the player ID is never in a URL or a body; every JSON body is checked with `hasPlayerId` and refused
 * here on a match ('id').
 *
 * Endpoints (beside /follow, from the submit URL):
 *   GET    /sync?k=                       { records: [{ kind, slot, at, bytes, updatedAt }], now }; 404: an older collector
 *   GET    /sync/get?k=&kind=&slot=       the JSON as stored (override, ticks); headers x-sync-at, x-sync-updated; 404 absent
 *   PUT    /sync?k=&kind=&slot=&at=<ms>   the JSON; 200 { ok, updatedAt, unchanged? }; 409 { latest } (a newer `at` is
 *                                         stored); 400 "ahead" (an `at` over 10 minutes ahead: sent once more stamped
 *                                         now); 413; 429 { retryAfter }; 503 not set up
 *   DELETE /forget?k=&all=1               { ok, deleted: { follows, prefs, answers, synced } }; 404/405 an older collector
 *
 * EVERY CALL IS BEST EFFORT: never a throw (a typed failure instead), a 10 s timeout counts as offline. What a caller
 * does with each failure (404 off quietly, 429 pause for retryAfter, 409 adopt `latest`) is in composables/useOverrideSync.ts.
 *
 * Not a result code hash input (lib/resultCodeHash.ts): nothing hashed imports it.
 */
import { followUrlOf, hasPlayerId, isAheadRefusal } from './followCloud';

/**
 * THE SYNC SWITCH (one line, like lib/prefsCloud.ts SYNC_PROGRESS_SENDS): off, nothing of the synced records is read
 * or written, and Setup shows no "Delete everything" button (/forget is not on the live collector yet). An object so
 * the specs can turn it on against a fake collector. The orchestrator flips it once the collector side is live.
 */
export const SYNC_RECORDS = { enabled: false };

export type SyncKind = 'override' | 'ticks' | 'plan';
/** The override's one slot. */
export const OVERRIDE_SLOT = '0';
/** A call that hangs this long counts as offline. */
export const SYNC_TIMEOUT_MS = 10_000;
const EGGS = ['curiosity', 'integrity', 'humility', 'resilience', 'kindness'] as const;
type Egg = (typeof EGGS)[number];
export type TEByEgg = Record<Egg, number>;

// ----------------------------------------------------------------------------------------- endpoints

/** The collector's /sync from the submit URL ('' without a collector). */
export function syncedUrlOf(submitUrl: string | null | undefined): string {
  const f = followUrlOf(submitUrl);
  return f ? f.replace(/\/follow$/, '/sync') : '';
}
/** The collector's /forget from the submit URL ('' without a collector). */
export function forgetUrlOf(submitUrl: string | null | undefined): string {
  const f = followUrlOf(submitUrl);
  return f ? f.replace(/\/follow$/, '/forget') : '';
}

// ----------------------------------------------------------------------------------------- the override value

/** The override as the collector keeps it: the five eggs' claimed TE (whole 0 to 98) and the save's TE when typed. */
export type OverrideValue = TEByEgg & { saveTE?: number };
/** Removing the override is a record too, so other devices learn it. */
export interface OverrideRemoved {
  removed: true;
}
export type OverrideRecord = OverrideValue | OverrideRemoved;
export const isRemoved = (r: OverrideRecord): r is OverrideRemoved => (r as OverrideRemoved).removed === true;

const whole = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

export function overrideTotal(te: Partial<Record<string, number>>): number {
  return EGGS.reduce((s, e) => s + (te[e] ?? 0), 0);
}
/** The five numbers alone (no saveTE), for comparing two overrides. */
export function eggsOf(te: Partial<Record<string, number>>): TEByEgg {
  return Object.fromEntries(EGGS.map(e => [e, te[e] ?? 0])) as TEByEgg;
}
export const sameEggs = (a: Partial<Record<string, number>>, b: Partial<Record<string, number>>): boolean =>
  EGGS.every(e => (a[e] ?? -1) === (b[e] ?? -1));

/** The record to send: the override (with the save's TE when known), or the tombstone for none. Null: out of bounds. */
export function buildOverrideValue(te: Partial<Record<string, number>> | null, saveTE: number | null): OverrideRecord | null {
  if (!te) return { removed: true };
  if (!EGGS.every(e => whole(te[e], 0, 98))) return null;
  return { ...eggsOf(te), ...(whole(saveTE, 0, 490) ? { saveTE } : {}) };
}

/** A record read back (the collector's own checks); anything else null. */
export function readOverrideValue(v: unknown): OverrideRecord | null {
  const x = v as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  if (x.removed !== undefined) return x.removed === true ? { removed: true } : null;
  if (!EGGS.every(e => whole(x[e], 0, 98))) return null;
  return { ...eggsOf(x as Record<string, number>), ...(whole(x.saveTE, 0, 490) ? { saveTE: x.saveTE } : {}) };
}

// ----------------------------------------------------------------------------------------- the override: who wins

/** This device's override for the account: its five numbers (null: none), when it was last set here (0: before `at`
 *  was kept, which counts as the oldest), and when it was last removed here (0: never). */
export interface LocalOverride {
  teEarned: TEByEgg | null;
  at: number;
  removedAt: number;
}
export type OverrideResolution =
  | { act: 'keep' }
  | { act: 'adopt'; teEarned: TEByEgg; at: number; saveTE?: number }
  | { act: 'remove'; at: number }
  | { act: 'ask'; teEarned: TEByEgg; at: number; saveTE?: number };

/**
 * NEWER WINS by the client's `at` (brief section 3), and NEVER SILENTLY (section 5): a cloud override newer than this
 * device's is applied without asking only when it is the same as this device's own, equals the save's TE (`saveTE`,
 * claimed plus pending; null unknown: asked), or the player already confirmed those numbers on this device
 * (`confirmed`); otherwise it is ASKED ("Another device set a starting TE of N. Your save says M."). A newer tombstone
 * removes the override here (going back to the save's TE is the safe way); with none here there is nothing to do.
 * Cloud empty (no record) is never a reason to change anything here: the caller does not call this then.
 */
export function resolveOverride(
  local: LocalOverride,
  cloud: { record: OverrideRecord; at: number },
  saveTE: number | null,
  confirmed: (te: TEByEgg) => boolean
): OverrideResolution {
  const localAt = Math.max(local.at || 0, local.removedAt || 0);
  if (!(cloud.at > localAt)) return { act: 'keep' };
  if (isRemoved(cloud.record)) return local.teEarned ? { act: 'remove', at: cloud.at } : { act: 'keep' };
  const te = eggsOf(cloud.record);
  const extra = cloud.record.saveTE !== undefined ? { saveTE: cloud.record.saveTE } : {};
  const silent =
    (local.teEarned && sameEggs(local.teEarned, te)) || (saveTE !== null && overrideTotal(te) === saveTE) || confirmed(te);
  return { act: silent ? 'adopt' : 'ask', teEarned: te, at: cloud.at, ...extra };
}

// ----------------------------------------------------------------------------------------- the calls

export interface SyncResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text?(): Promise<string>;
  headers?: { get(name: string): string | null };
}
export type SyncFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal; keepalive?: boolean }
) => Promise<SyncResponse>;

/**
 * Why a call didn't work. 'missing': 404, a collector with no /sync (turn the sync off quietly); 'absent': 404 of one
 * record (/sync/get); 'newer': 409 (see `latest`); 'limit': 429 (`retryAfter` seconds); 'off': 503, or no collector,
 * key or fetch; 'rejected': 400; 'ahead': 400 for an `at` too far ahead, twice; 'big': 413; 'id': the body held a player
 * ID and was never sent; 'offline': no answer (or a timeout); 'error': anything else.
 */
export type SyncFail = 'missing' | 'absent' | 'limit' | 'off' | 'rejected' | 'ahead' | 'big' | 'id' | 'offline' | 'error';

export interface SyncMeta {
  kind: SyncKind;
  slot: string;
  at: number;
  bytes: number;
  updatedAt: number;
}
export type SyncFailure = { ok: false; why: SyncFail; retryAfter?: number };

const isKey = (k: string) => /^[0-9a-f]{64}$/.test(k);
const KINDS: readonly SyncKind[] = ['override', 'ticks', 'plan'];
const defaultFetch = (): SyncFetch | null =>
  typeof fetch === 'function' ? (((u: string, i?: object) => fetch(u, i as RequestInit)) as unknown as SyncFetch) : null;

const failOf = (status: number): SyncFail =>
  status === 404 ? 'missing' : status === 429 ? 'limit' : status === 413 ? 'big' : status === 400 ? 'rejected' : status === 503 ? 'off' : 'error';

async function bodyOf(res: SyncResponse): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
function failure(status: number, body: unknown): SyncFailure {
  const why = failOf(status);
  const retryAfter = (body as { retryAfter?: unknown } | null)?.retryAfter;
  return { ok: false, why, ...(why === 'limit' && typeof retryAfter === 'number' && Number.isFinite(retryAfter) ? { retryAfter } : {}) };
}

/** One call with a timeout; a throw (sync or async) or the timeout is offline. */
async function timed<T>(run: (signal?: AbortSignal) => Promise<T>, offline: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    return await Promise.race([
      run(ctl?.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl?.abort();
          reject(new Error('timeout'));
        }, SYNC_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return offline;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** GET /sync?k=: every record's meta (no bodies). */
export async function listSynced(
  url: string,
  k: string,
  f: SyncFetch | null = defaultFetch()
): Promise<{ ok: true; records: SyncMeta[]; now: number } | SyncFailure> {
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  return timed<{ ok: true; records: SyncMeta[]; now: number } | SyncFailure>(
    async signal => {
      const res = await f(`${url}?k=${k}`, { method: 'GET', ...(signal ? { signal } : {}) });
      const body = await bodyOf(res);
      if (!res.ok) return failure(res.status, body);
      const records: SyncMeta[] = [];
      for (const r of ((body as { records?: unknown[] } | null)?.records ?? []) as Partial<SyncMeta>[]) {
        if (!r || !KINDS.includes(r.kind as SyncKind) || typeof r.slot !== 'string' || typeof r.at !== 'number') continue;
        records.push({ kind: r.kind as SyncKind, slot: r.slot, at: r.at, bytes: Number(r.bytes) || 0, updatedAt: Number(r.updatedAt) || 0 });
      }
      return { ok: true, records, now: Number((body as { now?: unknown } | null)?.now) || 0 };
    },
    { ok: false, why: 'offline' }
  );
}

/** GET /sync/get: one JSON record (override, ticks) with its `at`. 404 here is 'absent' (the list said what exists). */
export async function getSynced(
  url: string,
  k: string,
  kind: Exclude<SyncKind, 'plan'>,
  slot: string,
  f: SyncFetch | null = defaultFetch()
): Promise<{ ok: true; value: unknown; at: number; updatedAt: number } | SyncFailure> {
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  return timed<{ ok: true; value: unknown; at: number; updatedAt: number } | SyncFailure>(
    async signal => {
      const res = await f(`${url}/get?k=${k}&kind=${kind}&slot=${encodeURIComponent(slot)}`, { method: 'GET', ...(signal ? { signal } : {}) });
      const body = await bodyOf(res);
      if (!res.ok) return res.status === 404 ? { ok: false, why: 'absent' } : failure(res.status, body);
      const at = Number(res.headers?.get('x-sync-at')) || 0;
      const updatedAt = Number(res.headers?.get('x-sync-updated')) || 0;
      return { ok: true, value: body, at, updatedAt };
    },
    { ok: false, why: 'offline' }
  );
}

export type PutSyncedResult =
  | { ok: true; updatedAt: number; unchanged: boolean; resentAt?: number }
  | { ok: false; why: 'newer'; latest: { kind: SyncKind; slot: string; at: number; updatedAt: number; value?: unknown }; resentAt?: number }
  | (SyncFailure & { resentAt?: number });

/**
 * PUT /sync: one JSON record stamped `at` (the time of the player's action, ms). Refused here when the body holds a
 * player ID ('id', nothing sent). On the collector's "ahead" 400, sent ONCE more stamped `now()` (`resentAt`).
 */
export async function putSynced(
  url: string,
  k: string,
  kind: Exclude<SyncKind, 'plan'>,
  slot: string,
  at: number,
  value: object,
  f: SyncFetch | null = defaultFetch(),
  now: () => number = Date.now
): Promise<PutSyncedResult> {
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  let body: string;
  try {
    body = JSON.stringify(value);
  } catch {
    return { ok: false, why: 'rejected' };
  }
  if (hasPlayerId(body) || hasPlayerId(slot)) return { ok: false, why: 'id' };
  const send = (stamp: number) =>
    timed<PutSyncedResult | { ok: false; why: 'ahead' }>(
      async signal => {
        const res = await f(`${url}?k=${k}&kind=${kind}&slot=${encodeURIComponent(slot)}&at=${Math.round(stamp)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body,
          ...(signal ? { signal } : {}),
        });
        const j = await bodyOf(res);
        if (res.ok) {
          const r = j as { updatedAt?: unknown; unchanged?: unknown } | null;
          return { ok: true, updatedAt: Number(r?.updatedAt) || 0, unchanged: r?.unchanged === true };
        }
        if (res.status === 409) {
          const l = (j as { latest?: Record<string, unknown> } | null)?.latest;
          if (!l || typeof l.at !== 'number') return { ok: false, why: 'error' };
          return {
            ok: false,
            why: 'newer',
            latest: {
              kind: l.kind as SyncKind,
              slot: String(l.slot),
              at: l.at,
              updatedAt: Number(l.updatedAt) || 0,
              ...(l.value !== undefined ? { value: l.value } : {}),
            },
          };
        }
        if (isAheadRefusal(res.status, j)) return { ok: false, why: 'ahead' };
        return failure(res.status, j);
      },
      { ok: false, why: 'offline' }
    );
  const first = await send(at);
  if (first.ok || first.why !== 'ahead') return first;
  const again = Math.round(now());
  return { ...(await send(again)), resentAt: again };
}

// ----------------------------------------------------------------------------------------- Delete everything

export interface ForgetCounts {
  follows: number;
  prefs: number;
  answers: number;
  synced: number;
}
/** 'cannot': 404 or 405, an older collector without /forget. */
export type ForgetResult = { ok: true; deleted: ForgetCounts } | { ok: false; why: 'cannot' | 'limit' | 'off' | 'offline' | 'error'; retryAfter?: number };

/**
 * DELETE /forget?k=<key>&all=1: everything saved online under the account's key (followed routes, Setup and choices,
 * instant answers, synced records). NOT gated by the Save online switch (it works with the switch off). It changes
 * nothing in this browser: the caller turns Save online off afterwards (brief section 4).
 */
export async function forgetEverything(submitUrl: string | null | undefined, k: string, f: SyncFetch | null = defaultFetch()): Promise<ForgetResult> {
  const url = forgetUrlOf(submitUrl);
  if (!url || !isKey(k) || !f) return { ok: false, why: 'off' };
  return timed<ForgetResult>(
    async signal => {
      const res = await f(`${url}?k=${k}&all=1`, { method: 'DELETE', ...(signal ? { signal } : {}) });
      const j = await bodyOf(res);
      if (res.ok) {
        const d = ((j as { deleted?: Partial<ForgetCounts> } | null)?.deleted ?? {}) as Partial<ForgetCounts>;
        return { ok: true, deleted: { follows: Number(d.follows) || 0, prefs: Number(d.prefs) || 0, answers: Number(d.answers) || 0, synced: Number(d.synced) || 0 } };
      }
      if (res.status === 404 || res.status === 405) return { ok: false, why: 'cannot' };
      if (res.status === 429) {
        const retryAfter = (j as { retryAfter?: unknown } | null)?.retryAfter;
        return { ok: false, why: 'limit', ...(typeof retryAfter === 'number' && Number.isFinite(retryAfter) ? { retryAfter } : {}) };
      }
      return { ok: false, why: res.status === 503 ? 'off' : 'error' };
    },
    { ok: false, why: 'offline' }
  );
}
