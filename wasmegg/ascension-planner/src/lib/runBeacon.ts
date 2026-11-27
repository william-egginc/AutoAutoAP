/**
 * The long-run alert, the page's side (design: aaap-tools/notes/long-run-alert-design-2026-11-07.md, the SIMPLE version:
 * start and stop only, no heartbeat; Jordan, 7 Nov 2026). A search estimated at BEACON_MIN_SECONDS or more tells the
 * planner's server it started, and again when it ends and why, so the maintainer can see a long search is running before
 * a deploy or a forced reload. The server side is collector/runs.js (`POST /runs`):
 *
 *   { t: 'start', run, kind, estHours, build, startedAt }   then   { t: 'stop', run, reason }
 *
 *  - `run`: 22 base64url characters from 16 random bytes, made fresh for each run (`makeRunCode`). Not derived from, or
 *    sent beside, the player ID, its hash, the follow key, an owner code or a name. NOTHING ELSE about the player is sent.
 *  - `kind`: fast | exact | custom (the strength), bydate (Highest TE by a date), other (a Full sweep).
 *  - `estHours`: the estimate the screen showed beside Run, in hours (0.25 to 2000, the collector's bounds).
 *  - `build`: `appBuildId()` (search/submission.ts), 'unknown' when the build has none (a dev page).
 *  - `startedAt`: this page's clock when the run started, ms.
 *  - `reason`: done (finished), cancelled (Stop pressed), failed, closed (pagehide: the tab closed or reloaded).
 *  A plain string body (text/plain, no preflight; the collector answers CORS `*`), well under its 512 bytes.
 *
 * Where: the build's own collector, VITE_SUBMIT_URL's `/submit` made `/runs` (the store's `submitUrl`, as `instantUrlOf`
 * makes `/instant`). Never VITE_BOARD_SUBMIT_URL: this is not a board send.
 *
 * When: Run pressed on a long run (RunControls.vue `armLongRun`, with the estimate it shows) AND the store seeing a run
 * start (`runBeaconRunStarted`), in either order within ARM_WINDOW_MS. A run the player did not start with Run (a carry-on
 * the watcher reopened, a sweep queue's later boxes) sends nothing. The store's run watcher calls `runBeaconRunEnded`, and
 * its pagehide `runBeaconPageClosing` (sendBeacon). A stop only follows a start this page sent, and only once.
 *
 * THE PLANNED-UPDATE BANNER (ReloadPlannedBanner.vue, lib/reloadPlanned.ts) reads `longRun`: a long run started with Run
 * (the banner is local, and does not depend on the sends).
 *
 * NEVER TOUCHES THE RUN. Every hook returns nothing to wait on, and every step is in try/catch; a fetch is bounded by
 * BEACON_TIMEOUT_MS and its promise caught; the answer (200, 404, 429, 503, anything) is ignored. Nothing is sent with
 * the flag off (`beaconEnabled`), offline, or with no collector.
 *
 * NO PLAYER SWITCH (Jordan, 16 Nov 2026: "don't give the users an option to disable the long sends, just send a first
 * signal and last (if possible); we will disable that once we stop updating things"). It was a tick in Setup's Sharing
 * (localStorage RUN_BEACON_KEY, '1' / '0'); the tick, its summary entry and the reading of the key are gone, and an "off"
 * an older page stored is ignored (runBeacon.always.spec.ts). The one place to turn the sends off for everyone is the
 * flag RUN_BEACON_SENDS below; `beaconEnabled` is its only reader.
 */
import { computed, shallowRef } from 'vue';
import { appBuildId } from '@/search/submission';
import type { SearchOption } from '@/lib/searchOption';
import { BEACON_MIN_HOURS } from '@/lib/runBeaconWords';

/** A run estimated at this or more announces itself and shows the banner (Jordan: 2 hours; one number, Words'
 *  BEACON_MIN_HOURS in lib/runBeaconWords.ts). The collector takes 0.25 hours and up, so this can change without a
 *  collector change. */
export const BEACON_MIN_SECONDS = BEACON_MIN_HOURS * 3600;
/** THE FLAG: the page sends the start and the stop of a long run. One line: `false` stops the sends for everyone (the
 *  banner is unaffected). Jordan: to go false once the maintainer stops updating the site. */
export const RUN_BEACON_SENDS = true;
/** Where an older page kept the player's switch ('1' on, '0' off). Nothing reads or writes it now; the name is kept so a
 *  spec can store an old "off" and show it stops nothing. */
export const RUN_BEACON_KEY = 'aap.runBeacon';
/** A run code's length: 16 random bytes in base64url, unpadded. */
export const RUN_CODE_LENGTH = 22;
/** How long a send may take before it is dropped. */
export const BEACON_TIMEOUT_MS = 10_000;
/** How far apart Run pressed and the store seeing the run start may be (a carry-on reads its save first). */
export const ARM_WINDOW_MS = 120_000;

export type BeaconKind = 'fast' | 'exact' | 'custom' | 'bydate' | 'other';
export type BeaconReason = 'done' | 'cancelled' | 'closed' | 'failed';
/** How the store says a run ended (its run watcher's `how`). */
export type RunEnd = 'finished' | 'stopped' | 'failed';

const REASON: Record<RunEnd, BeaconReason> = { finished: 'done', stopped: 'cancelled', failed: 'failed' };
const BUILD_RE = /^[A-Za-z0-9:._-]{1,40}$/;

/** 22 base64url characters from 16 random bytes (crypto.getRandomValues). Throws only with no crypto at all. */
export function makeRunCode(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The collector's `/runs` from the build's submit address; '' with none. */
export function runsUrlOf(submitUrl: string): string {
  return /\/submit\/?$/.test(submitUrl) ? submitUrl.replace(/\/submit\/?$/, '/runs') : '';
}

/** The collector's kind for a RunControls screen and strength. */
export function beaconKindOf(screen: 'smart' | 'full' | 'by-date', option: SearchOption | undefined): BeaconKind {
  if (screen === 'by-date') return 'bydate';
  return option === 'fast' || option === 'exact' || option === 'custom' ? option : 'other';
}

/** THE GATE: whether the alert may send anything. */
export function beaconEnabled(): boolean {
  return RUN_BEACON_SENDS;
}

// ---- the run ----

interface Armed {
  kind: BeaconKind;
  estimateSeconds: number;
  at: number;
}
/** Run pressed on a long run, not yet matched to a run start. */
let armed: Armed | null = null;
/** The store saw a run start that no press has claimed yet. */
let startedUnarmed: { url: string; at: number } | null = null;
/** The run this page announced and has not yet said ended. */
let current: { run: string; url: string } | null = null;

/** The long run going now (started with Run, estimated at BEACON_MIN_SECONDS or more): its estimate and when it
 *  started. For the planned-refresh banner (ReloadPlannedBanner.vue, lib/reloadPlanned.ts), which is local and does not
 *  depend on the sends (Jordan, 7 Nov 2026). Never the run code. */
export interface LongRun {
  estimateSeconds: number;
  startedAt: number;
}
const going = shallowRef<LongRun | null>(null);
/** The long run going now, or null (read only). */
export const longRun = computed<LongRun | null>(() => going.value);
function forget(): void {
  current = null;
  going.value = null;
}

const online = (): boolean => {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
};
const canSend = (): boolean => beaconEnabled() && online();

/** POST a body; never throws, never rejects, never waits on the answer. */
function post(url: string, body: string): void {
  try {
    if (typeof fetch !== 'function') return;
    const signal =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(BEACON_TIMEOUT_MS)
        : undefined;
    const p = fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit', ...(signal ? { signal } : {}) });
    if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => undefined);
  } catch {
    /* a failed send changes nothing */
  }
}

/** A long run started with Run: `longRun` (the planned-update banner reads it), always; the start, when the flag is on
 *  and the page online. No collector (a self-hosted copy): neither, since its updates are not the maintainer's. */
function longRunStarted(url: string, kind: BeaconKind, estimateSeconds: number): void {
  try {
    if (!url) return;
    const startedAt = Date.now();
    going.value = { estimateSeconds, startedAt };
    if (!canSend()) return;
    const run = makeRunCode();
    if (run.length !== RUN_CODE_LENGTH) return;
    const estHours = Math.min(2000, Math.max(0.25, Math.round((estimateSeconds / 3600) * 100) / 100));
    const stamp = appBuildId();
    const build = BUILD_RE.test(stamp) ? stamp : 'unknown';
    current = { run, url };
    post(url, JSON.stringify({ t: 'start', run, kind, estHours, build, startedAt }));
  } catch {
    current = null;
  }
}

/** Run pressed on a `kind` run the screen estimates at `estimateSeconds` (RunControls.vue). */
export function armLongRun(kind: BeaconKind, estimateSeconds: number | null | undefined): void {
  try {
    armed = null;
    if (
      typeof estimateSeconds !== 'number' ||
      !Number.isFinite(estimateSeconds) ||
      estimateSeconds < BEACON_MIN_SECONDS
    )
      return;
    const now = Date.now();
    if (startedUnarmed && now - startedUnarmed.at <= ARM_WINDOW_MS && !going.value) {
      const { url } = startedUnarmed;
      startedUnarmed = null;
      longRunStarted(url, kind, estimateSeconds);
      return;
    }
    armed = { kind, estimateSeconds, at: now };
  } catch {
    armed = null;
  }
}

/** The store saw a run start (`submitUrl`: the build's own collector). */
export function runBeaconRunStarted(submitUrl: string): void {
  try {
    const url = runsUrlOf(submitUrl);
    const now = Date.now();
    const a = armed;
    armed = null;
    startedUnarmed = null;
    if (going.value) return;
    if (a && now - a.at <= ARM_WINDOW_MS) longRunStarted(url, a.kind, a.estimateSeconds);
    else startedUnarmed = { url, at: now };
  } catch {
    /* nothing */
  }
}

/** The store's run ended: `how` as its run watcher says. */
export function runBeaconRunEnded(how: RunEnd): void {
  try {
    startedUnarmed = null;
    const c = current;
    forget();
    if (!c || !canSend()) return;
    post(c.url, JSON.stringify({ t: 'stop', run: c.run, reason: REASON[how] ?? 'failed' }));
  } catch {
    /* nothing */
  }
}

/**
 * A keepalive POST that omits credentials (spec-review-ui, QA 7 Nov 2026: sendBeacon cannot omit the collector site's
 * cookies). False when this browser has no keepalive fetch, or the call throws at once: the caller then uses sendBeacon.
 */
function postKeepalive(url: string, body: string): boolean {
  try {
    if (typeof fetch !== 'function' || typeof Request === 'undefined' || !('keepalive' in Request.prototype)) return false;
    const p = fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit' });
    if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** pagehide (the tab closing or reloading): 'closed' for a run still going, with a keepalive fetch (sendBeacon only
 *  where that isn't available). */
export function runBeaconPageClosing(): void {
  try {
    const c = current;
    forget();
    if (!c || !canSend()) return;
    const body = JSON.stringify({ t: 'stop', run: c.run, reason: 'closed' });
    if (postKeepalive(c.url, body)) return;
    try {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      if (typeof nav?.sendBeacon === 'function') nav.sendBeacon(c.url, body);
    } catch {
      /* nothing more to try */
    }
  } catch {
    /* nothing */
  }
}

/** For specs: forget the run. */
export function resetRunBeacon(): void {
  armed = null;
  startedUnarmed = null;
  forget();
}
