/**
 * THE CALENDAR FEED'S CALLS (spec-calendar-ui, 14 Nov 2026; collector notes/calendar-feed-build-2026-11-14.md): mint a
 * private link (POST /cal/new), reset it (POST /cal/revoke), the subscribe addresses, and the plan's event list as the
 * 'cal' sync record (PUT /sync kind=cal slot 0). The account key `k` goes in a request BODY for mint and revoke, never in
 * an address (the feed address itself is the secret, shown once and never kept here). The events are built by
 * lib/calendarFeedEvents.ts; a body with a player ID in it is never sent (putSynced checks). Never throws.
 * Not a result code hash input.
 */
import { getSynced, putSynced, type PutSyncedResult, type SyncFetch } from './syncedRecords';
import type { LinkRecord } from './calLinkCrypt';
import { calendarFeedOn } from './calendarFlag';
import type { CalEventList } from './calendarFeedEvents';

/**
 * THE CALENDAR FEED'S BUILD FLAG (14 Nov 2026): off in the repo, because beta's collector address is the LIVE collector, which has
 * no /cal and no 'cal' sync kind yet. Flipped on (the `=== '1'` here becomes `true`) in the release that deploys the live
 * collector (lib/calendarFlag.ts CALENDAR_FEED_DEFAULT, one line). A QA build against the TEST collector turns it on with
 * VITE_CALENDAR_FEED=1. An object so the specs can turn it on
 * and off. Off: no Setup card (components/auto/CalendarFeedSetup.vue), and no request to /cal or of kind=cal, checked here
 * (every call below refuses first) and in composables/useCalendarFeed.ts (`available`, `note`).
 */
export const CALENDAR_FEED = { enabled: calendarFeedOn(import.meta.env.VITE_CALENDAR_FEED) };

const KEY = /^[0-9a-f]{64}$/;
const TIMEOUT_MS = 10_000;
const defaultFetch = (): SyncFetch | null =>
  typeof fetch === 'function' ? (((u: string, i?: object) => fetch(u, i as RequestInit)) as unknown as SyncFetch) : null;

/** The collector's /cal from its /sync address ('' without one). */
export function calBaseOf(syncUrl: string | null | undefined): string {
  return syncUrl && /\/sync$/.test(syncUrl) ? syncUrl.replace(/\/sync$/, '/cal') : '';
}

export type CalFail = 'off' | 'limit' | 'busy' | 'offline' | 'error';
export type MintResult = { ok: true; url: string } | { ok: false; why: CalFail };
export type RevokeResult = { ok: true; revoked: number } | { ok: false; why: CalFail };

const failOf = (status: number): CalFail => (status === 409 ? 'limit' : status === 429 ? 'busy' : status === 503 ? 'off' : 'error');

async function post(f: SyncFetch, url: string, body: object): Promise<{ status: number; json: unknown } | 'offline'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const res = await Promise.race([
      f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...(ctl ? { signal: ctl.signal } : {}) }),
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
    return { status: res.status, json };
  } catch {
    return 'offline';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The feed address a collector gives: its own /cal/<22 characters>.ics over https (http only for a local test collector). */
export function isFeedUrl(u: unknown, base: string): u is string {
  if (typeof u !== 'string' || !base) return false;
  return u.startsWith(base + '/') && /^\/[A-Za-z0-9_-]{22}\.ics$/.test(u.slice(base.length)) && /^https:\/\/|^http:\/\/(?:127\.0\.0\.1|localhost)[:/]/.test(u);
}

/** POST /cal/new { k }: a new private link, `url` shown to the player once. 409: three live links already. */
export async function mintCalendarLink(syncUrl: string, k: string, f: SyncFetch | null = defaultFetch()): Promise<MintResult> {
  const base = calBaseOf(syncUrl);
  if (!CALENDAR_FEED.enabled || !base || !KEY.test(k) || !f) return { ok: false, why: 'off' };
  const r = await post(f, `${base}/new`, { k });
  if (r === 'offline') return { ok: false, why: 'offline' };
  if (r.status < 200 || r.status >= 300) return { ok: false, why: failOf(r.status) };
  const url = (r.json as { url?: unknown } | null)?.url;
  return isFeedUrl(url, base) ? { ok: true, url } : { ok: false, why: 'error' };
}

/** POST /cal/revoke { k, all: true }: every link of this account stops at once. */
export async function revokeCalendarLinks(syncUrl: string, k: string, f: SyncFetch | null = defaultFetch()): Promise<RevokeResult> {
  const base = calBaseOf(syncUrl);
  if (!CALENDAR_FEED.enabled || !base || !KEY.test(k) || !f) return { ok: false, why: 'off' };
  const r = await post(f, `${base}/revoke`, { k, all: true });
  if (r === 'offline') return { ok: false, why: 'offline' };
  if (r.status < 200 || r.status >= 300) return { ok: false, why: failOf(r.status) };
  return { ok: true, revoked: Number((r.json as { revoked?: unknown } | null)?.revoked) || 0 };
}

/** Apple Calendar: the feed address with webcal://. */
export const webcalUrl = (url: string): string => url.replace(/^https?:\/\//, 'webcal://');
/** Google Calendar: "add by link" with the webcal address. */
export const googleCalendarUrl = (url: string): string => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(url))}`;

/** PUT /sync kind=cal slot 0: the plan's event list stamped `at` (ms). */
export function putCalendar(syncUrl: string, k: string, at: number, list: CalEventList, f: SyncFetch | null = defaultFetch(), now: () => number = Date.now): Promise<PutSyncedResult> {
  if (!CALENDAR_FEED.enabled) return Promise.resolve({ ok: false, why: 'off' });
  return putSynced(syncUrl, k, 'cal', '0', at, list, f, now);
}

/** PUT /sync kind=callink slot 0: the encrypted link record (lib/calLinkCrypt.ts), stamped `at` (ms). One resend, stamped after a newer one, on a 409. */
export async function putCalLink(syncUrl: string, k: string, record: LinkRecord, f: SyncFetch | null = defaultFetch(), now: () => number = Date.now): Promise<PutSyncedResult> {
  if (!CALENDAR_FEED.enabled) return { ok: false, why: 'off' };
  let r = await putSynced(syncUrl, k, 'callink', '0', now(), record, f, now);
  if (!r.ok && r.why === 'newer') r = await putSynced(syncUrl, k, 'callink', '0', Math.max(now(), r.latest.at + 1), record, f, now);
  return r;
}

/** GET /sync/get kind=callink slot 0: the saved record as stored, 'absent' when there is none. */
export function getCalLink(syncUrl: string, k: string, f: SyncFetch | null = defaultFetch()) {
  if (!CALENDAR_FEED.enabled) return Promise.resolve({ ok: false, why: 'off' } as const);
  return getSynced(syncUrl, k, 'callink', '0', f);
}
