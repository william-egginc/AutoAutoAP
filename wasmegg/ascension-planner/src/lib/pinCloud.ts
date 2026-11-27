/**
 * THE PIN CALLS (collector/pin.js; design ~/code/aaap-tools/notes/pin-cloud-design-2026-11-17.md): status, set, verify, refresh,
 * change, remove, recover, reset, cancel. Each is one call from the sync address's sibling /pin. `pk` (lib/pinCrypt.ts), the recovery code and the
 * sessions go in POST bodies and the `x-aaap-session` header (lib/pinSession.ts adds it), never in a URL; nothing is logged. A call that
 * can't be well-formed is refused here and nothing is sent.
 */
import { pinSessions } from './pinSession';
import type { SyncFetch } from './syncedRecords';

export type PinFail = 'wrong' | 'limit' | 'exists' | 'nopin' | 'cooldown' | 'session' | 'rejected' | 'off' | 'offline' | 'error';
export type PinFailure = { ok: false; why: PinFail; retryAfter?: number };
export type PinSessionOk = { ok: true; session: string; expires: number };

const TIMEOUT_MS = 10_000;
const KEY = /^[0-9a-f]{64}$/;
const SESSION = /^v1\.\d{10,16}\.\d{1,9}\.[0-9a-f]{64}$/;
const defaultFetch = (): SyncFetch | null =>
  typeof fetch === 'function' ? pinSessions().wrap(((u: string, i?: object) => fetch(u, i as RequestInit)) as unknown as SyncFetch) : null;

/** The collector's /pin from its /sync address ('' without one). */
export const pinBaseOf = (syncUrl: string | null | undefined): string => (syncUrl && /\/sync$/.test(syncUrl) ? syncUrl.replace(/\/sync$/, '/pin') : '');

/** Recovery codes are 16 base32 characters; the player may type them lower-case, with spaces or dashes. */
export function tidyRecovery(s: string): string | null {
  const t = String(s ?? '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z2-7]{16}$/.test(t) ? t : null;
}

async function call(f: SyncFetch, url: string, init: { method: string; body?: object }): Promise<{ status: number; json: Record<string, unknown> } | 'offline'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const res = await Promise.race([
      f(url, { method: init.method, ...(init.body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) } : {}), ...(ctl ? { signal: ctl.signal } : {}) }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl?.abort();
          reject(new Error('timeout'));
        }, TIMEOUT_MS);
      }),
    ]);
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json: json && typeof json === 'object' ? (json as Record<string, unknown>) : {} };
  } catch {
    return 'offline';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function failOf(status: number, j: Record<string, unknown>, route: string): PinFailure {
  const retryAfter = typeof j.retryAfter === 'number' && Number.isFinite(j.retryAfter) ? { retryAfter: j.retryAfter } : {};
  if (status === 429) return { ok: false, why: 'limit', ...retryAfter };
  if (status === 409) return route === 'set' ? { ok: false, why: 'exists' } : { ok: false, why: 'cooldown', ...retryAfter };
  if (status === 404) return j.pin === false ? { ok: false, why: 'nopin' } : { ok: false, why: 'off' };
  if (status === 401) return { ok: false, why: route === 'verify' || route === 'recover' ? 'wrong' : 'session' };
  if (status === 503) return { ok: false, why: 'off' };
  if (status === 400 || status === 413) return { ok: false, why: 'rejected' };
  return { ok: false, why: 'error' };
}

const sessionOf = (j: Record<string, unknown>): { session: string; expires: number } | null =>
  typeof j.session === 'string' && SESSION.test(j.session) && typeof j.expires === 'number' && Number.isFinite(j.expires) ? { session: j.session, expires: j.expires } : null;

async function post(syncUrl: string | null | undefined, route: string, body: { k: string } & Record<string, unknown>, f: SyncFetch | null): Promise<{ status: number; json: Record<string, unknown> } | PinFailure> {
  const base = pinBaseOf(syncUrl);
  if (!base || !KEY.test(body.k) || !f) return { ok: false, why: 'off' };
  const r = await call(f, `${base}/${route}`, { method: 'POST', body });
  if (r === 'offline') return { ok: false, why: 'offline' };
  return r;
}
const isFail = (r: unknown): r is PinFailure => (r as PinFailure).ok === false;

export async function pinStatus(syncUrl: string | null | undefined, k: string, f: SyncFetch | null = defaultFetch()): Promise<{ ok: true; pin: boolean; resetAt?: number } | PinFailure> {
  const base = pinBaseOf(syncUrl);
  if (!base || !KEY.test(k) || !f) return { ok: false, why: 'off' };
  const r = await call(f, `${base}/status?k=${k}`, { method: 'GET' });
  if (r === 'offline') return { ok: false, why: 'offline' };
  if (r.status !== 200) return failOf(r.status, r.json, 'status');
  return { ok: true, pin: r.json.pin === true, ...(typeof r.json.resetAt === 'number' ? { resetAt: r.json.resetAt } : {}) };
}

const withSession = (r: { status: number; json: Record<string, unknown> } | PinFailure, route: string): PinSessionOk | PinFailure => {
  if (isFail(r)) return r;
  if (r.status !== 200) return failOf(r.status, r.json, route);
  const s = sessionOf(r.json);
  return s ? { ok: true, ...s } : { ok: false, why: 'error' };
};

/** First PIN: the session, the recovery code (shown once) and how many calendar links it ended. */
export async function pinSet(syncUrl: string | null | undefined, k: string, pk: string, f: SyncFetch | null = defaultFetch()): Promise<(PinSessionOk & { recovery: string; revokedLinks: number }) | PinFailure> {
  if (!KEY.test(pk)) return { ok: false, why: 'rejected' };
  const r = await post(syncUrl, 'set', { k, pk }, f);
  const s = withSession(r, 'set');
  if (!s.ok || isFail(r)) return s.ok ? { ok: false, why: 'error' } : s;
  const code = tidyRecovery(String(r.json.recovery ?? ''));
  return code ? { ...s, recovery: code, revokedLinks: typeof r.json.revokedLinks === 'number' ? r.json.revokedLinks : 0 } : { ok: false, why: 'error' };
}
export async function pinVerify(syncUrl: string | null | undefined, k: string, pk: string, f: SyncFetch | null = defaultFetch()): Promise<PinSessionOk | PinFailure> {
  if (!KEY.test(pk)) return { ok: false, why: 'rejected' };
  return withSession(await post(syncUrl, 'verify', { k, pk }, f), 'verify');
}
export async function pinRefresh(syncUrl: string | null | undefined, k: string, f: SyncFetch | null = defaultFetch()): Promise<PinSessionOk | PinFailure> {
  return withSession(await post(syncUrl, 'refresh', { k }, f), 'refresh');
}
export async function pinChange(syncUrl: string | null | undefined, k: string, pk: string, f: SyncFetch | null = defaultFetch()): Promise<PinSessionOk | PinFailure> {
  if (!KEY.test(pk)) return { ok: false, why: 'rejected' };
  return withSession(await post(syncUrl, 'change', { k, pk }, f), 'change');
}
/** The recovery code sets a new PIN and gives a NEW recovery code. */
export async function pinRecover(syncUrl: string | null | undefined, k: string, recovery: string, pk: string, f: SyncFetch | null = defaultFetch()): Promise<(PinSessionOk & { recovery: string }) | PinFailure> {
  const code = tidyRecovery(recovery);
  if (!code || !KEY.test(pk)) return { ok: false, why: 'rejected' };
  const r = await post(syncUrl, 'recover', { k, recovery: code, pk }, f);
  const s = withSession(r, 'recover');
  if (!s.ok || isFail(r)) return s.ok ? { ok: false, why: 'error' } : s;
  const next = tidyRecovery(String(r.json.recovery ?? ''));
  return next ? { ...s, recovery: next } : { ok: false, why: 'error' };
}
export async function pinRemove(syncUrl: string | null | undefined, k: string, f: SyncFetch | null = defaultFetch()): Promise<{ ok: true } | PinFailure> {
  const r = await post(syncUrl, 'remove', { k }, f);
  return isFail(r) ? r : r.status === 200 ? { ok: true } : failOf(r.status, r.json, 'remove');
}
/** Start the 7-day wait-and-delete reset (no login: that is the point). */
export async function pinReset(syncUrl: string | null | undefined, k: string, f: SyncFetch | null = defaultFetch()): Promise<{ ok: true; resetAt: number } | PinFailure> {
  const r = await post(syncUrl, 'reset', { k }, f);
  if (isFail(r)) return r;
  if (r.status !== 200) return failOf(r.status, r.json, 'reset');
  return typeof r.json.resetAt === 'number' ? { ok: true, resetAt: r.json.resetAt } : { ok: false, why: 'error' };
}
export async function pinResetCancel(syncUrl: string | null | undefined, k: string, f: SyncFetch | null = defaultFetch()): Promise<{ ok: true } | PinFailure> {
  const r = await post(syncUrl, 'reset/cancel', { k }, f);
  return isFail(r) ? r : r.status === 200 ? { ok: true } : failOf(r.status, r.json, 'reset/cancel');
}
