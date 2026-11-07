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
 * NEVER TOUCHES THE RUN. Every hook returns nothing to wait on, and every step is in try/catch; a fetch is bounded by
 * BEACON_TIMEOUT_MS and its promise caught; the answer (200, 404, 429, 503, anything) is ignored. Nothing is sent with
 * the switch off (`beaconEnabled`), offline, or with no collector.
 *
 * THE SWITCH: one per browser (localStorage RUN_BEACON_KEY, '1' / '0'), in Setup's Sharing. Its default is
 * RUN_BEACON_DEFAULT, read in one place (`readSwitch`); runBeacon.spec.ts pins it, so making it opt-in is deliberate. The
 * gate is one function, `beaconEnabled`: tying the alert to "Help improve the planner" instead (Words' Option 2) changes
 * only that function (and drops the Setup tick).
 */
import { ref, watch, type Ref } from 'vue';
import { appBuildId } from '@/search/submission';
import type { SearchOption } from '@/lib/searchOption';

/** A run estimated at this or more announces itself (Jordan: over 2 hours). The collector takes 0.25 hours and up, so
 *  this can change without a collector change. */
export const BEACON_MIN_SECONDS = 7200;
/** The Setup switch's default: ON for now. Jordan may make it opt-in: change this one line (and its pin in
 *  runBeacon.spec.ts). */
export const RUN_BEACON_DEFAULT = true;
/** Where this browser keeps the switch ('1' on, '0' off; absent: RUN_BEACON_DEFAULT). */
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

// ---- the switch ----

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The ONE place RUN_BEACON_DEFAULT is read. */
function readSwitch(): boolean {
  try {
    const v = storage()?.getItem(RUN_BEACON_KEY);
    return v === '1' ? true : v === '0' ? false : RUN_BEACON_DEFAULT;
  } catch {
    return RUN_BEACON_DEFAULT;
  }
}

let shared: Ref<boolean> | null = null;
/** Setup's switch: this browser's one value (created on first use). */
export function runBeaconSwitch(): Ref<boolean> {
  if (shared) return shared;
  const on = ref(readSwitch());
  watch(
    on,
    v => {
      try {
        storage()?.setItem(RUN_BEACON_KEY, v ? '1' : '0');
      } catch {
        /* this visit only */
      }
    },
    { flush: 'sync' }
  );
  return (shared = on);
}

/** THE GATE: whether the alert may send anything. Option 2 (Words): `consentAgreed('<its study tick>')` instead. */
export function beaconEnabled(): boolean {
  try {
    return runBeaconSwitch().value;
  } catch {
    return false;
  }
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

function send(url: string, kind: BeaconKind, estimateSeconds: number): void {
  try {
    if (!url || !canSend()) return;
    const run = makeRunCode();
    if (run.length !== RUN_CODE_LENGTH) return;
    const estHours = Math.min(2000, Math.max(0.25, Math.round((estimateSeconds / 3600) * 100) / 100));
    const stamp = appBuildId();
    const build = BUILD_RE.test(stamp) ? stamp : 'unknown';
    current = { run, url };
    post(url, JSON.stringify({ t: 'start', run, kind, estHours, build, startedAt: Date.now() }));
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
    if (startedUnarmed && now - startedUnarmed.at <= ARM_WINDOW_MS && !current) {
      const { url } = startedUnarmed;
      startedUnarmed = null;
      send(url, kind, estimateSeconds);
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
    if (current) return;
    if (a && now - a.at <= ARM_WINDOW_MS) send(url, a.kind, a.estimateSeconds);
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
    current = null;
    if (!c || !canSend()) return;
    post(c.url, JSON.stringify({ t: 'stop', run: c.run, reason: REASON[how] ?? 'failed' }));
  } catch {
    /* nothing */
  }
}

/** pagehide (the tab closing or reloading): 'closed' for a run still going, with sendBeacon. */
export function runBeaconPageClosing(): void {
  try {
    const c = current;
    current = null;
    if (!c || !canSend()) return;
    const body = JSON.stringify({ t: 'stop', run: c.run, reason: 'closed' });
    let queued = false;
    try {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      queued = typeof nav?.sendBeacon === 'function' ? nav.sendBeacon(c.url, body) : false;
    } catch {
      queued = false;
    }
    if (!queued) post(c.url, body);
  } catch {
    /* nothing */
  }
}

/** For specs: forget the run and the switch (the next read takes storage again). */
export function resetRunBeacon(): void {
  armed = null;
  startedUnarmed = null;
  current = null;
  shared = null;
}
