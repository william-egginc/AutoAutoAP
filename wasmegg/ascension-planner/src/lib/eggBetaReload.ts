/**
 * THE EGG-BETA TIMED RELOAD (Jordan, 1 Nov 2026): on egg-beta only, a tab running an older build counts down to a set
 * time (`eggBeta.reloadAt` in version.json, written only when the build had AAP_EGG_BETA_RELOAD_AT: lib/versionJson.ts)
 * and reloads itself then -- never while a search is running: it waits for the search to end.
 *
 * SAFE BY CONSTRUCTION, every one of these must hold or nothing shows and nothing reloads:
 *   - the HOST is exactly EGG_BETA_HOST (a runtime check; live builds also leave this code out: __AAP_EGG_BETA_RELOAD__);
 *   - version.json has `eggBeta` with a readable reloadAt and builtAt (a later build without the env var turns it off);
 *   - this tab's own build time is OLDER than `eggBeta.builtAt`: a tab freshly loaded from that build is as new as it
 *     and never reloads, so a reload can never loop;
 *   - it is no more than 6 h past reloadAt;
 *   - this tab has not already reloaded for that reloadAt (sessionStorage EGG_BETA_RELOADED_KEY, which survives the
 *     reload: at most once per reloadAt, even if the host served the old page again).
 * The search guard: at reloadAt with a search running it waits, re-checking every 15 s (and at once when the caller
 * says the search ended), and the banner says so.
 */
import { compactDuration } from '@/lib/duration';

/** The one host this ever runs on (~/code/aaap-tools/deploy-beta.sh deploys there). */
export const EGG_BETA_HOST = 'egg-beta.williamstest.fyi';
/** sessionStorage: the reloadAt this tab has already reloaded for. */
export const EGG_BETA_RELOADED_KEY = 'aap-eggbeta-reloaded';
/** How long after reloadAt a tab still acts on it. */
export const LATE_LIMIT_MS = 6 * 3600_000;
/** How often a tab waiting for a search to end looks again. */
export const WAIT_POLL_MS = 15_000;
/** How often version.json is read again (a later build may drop or move the deadline). */
export const FETCH_EVERY_MS = 60_000;

/** This build has the timed reload compiled in (vite.config.ts; absent in specs and dev). */
export const EGG_BETA_RELOAD_BUILD: boolean =
  typeof __AAP_EGG_BETA_RELOAD__ === 'boolean' ? __AAP_EGG_BETA_RELOAD__ : false;

export type EggBetaState =
  | { kind: 'none' }
  | { kind: 'countdown'; reloadAt: string; msLeft: number }
  | { kind: 'waiting'; reloadAt: string }
  | { kind: 'reload'; reloadAt: string };

export interface EggBetaInput {
  host: string;
  /** version.json as last read, or null. */
  live: unknown;
  /** This tab's own build time (__BUILD_TIME__), '' when unknown. */
  ownBuildTime: string;
  nowMs: number;
  /** A search or run is going. */
  busy: boolean;
  /** The reloadAt this tab already reloaded for (sessionStorage), or null. */
  reloadedFor: string | null;
}

/** The `eggBeta` field when it is whole and readable, else null. */
function eggBetaField(live: unknown): { reloadAt: string; builtAt: string; atMs: number } | null {
  if (!live || typeof live !== 'object') return null;
  const f = (live as { eggBeta?: unknown }).eggBeta;
  if (!f || typeof f !== 'object') return null;
  const { reloadAt, builtAt } = f as { reloadAt?: unknown; builtAt?: unknown };
  if (typeof reloadAt !== 'string' || typeof builtAt !== 'string') return null;
  const atMs = Date.parse(reloadAt);
  if (!Number.isFinite(atMs) || !Number.isFinite(Date.parse(builtAt))) return null;
  return { reloadAt, builtAt, atMs };
}

export function eggBetaDecision(i: EggBetaInput): EggBetaState {
  if (i.host !== EGG_BETA_HOST) return { kind: 'none' };
  const f = eggBetaField(i.live);
  if (!f) return { kind: 'none' };
  // Older build only, by build time: a tab as new as the deploy that wrote the field never reloads (no loop).
  if (!i.ownBuildTime || !Number.isFinite(Date.parse(i.ownBuildTime))) return { kind: 'none' };
  if (Date.parse(i.ownBuildTime) >= Date.parse(f.builtAt)) return { kind: 'none' };
  if (i.reloadedFor === f.reloadAt) return { kind: 'none' };
  if (i.nowMs < f.atMs) return { kind: 'countdown', reloadAt: f.reloadAt, msLeft: f.atMs - i.nowMs };
  if (i.nowMs - f.atMs > LATE_LIMIT_MS) return { kind: 'none' };
  return i.busy ? { kind: 'waiting', reloadAt: f.reloadAt } : { kind: 'reload', reloadAt: f.reloadAt };
}

/** The time left, compact (lib/duration.ts: `1h 12m`), in seconds in the last minute (`42s`). */
export function countdownText(msLeft: number): string {
  if (!(msLeft > 0)) return '0s';
  if (msLeft < 60_000) return `${Math.ceil(msLeft / 1000)}s`;
  return compactDuration(msLeft / 1000);
}

/** reloadAt as a Pacific clock time, `2:00 pm` (the banner says "Pacific" after it). */
export function pacificTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })
    .format(ms)
    .replace(/\s+/g, ' ')
    .replace(/AM$/, 'am')
    .replace(/PM$/, 'pm');
}

export interface EggBetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface EggBetaOptions {
  host: string;
  ownBuildTime: string;
  busy: () => boolean;
  /** version.json, or null when it could not be read. May throw (offline). */
  fetchLive: () => Promise<unknown>;
  reload: () => void;
  storage: EggBetaStorage | null;
  onState: (s: EggBetaState) => void;
}

/**
 * Runs the timed reload. Off the egg-beta host it does nothing at all: no fetch, no timer. `check()` looks again at
 * once (the caller calls it when a search ends); `stop()` clears every timer.
 */
export function startEggBetaReload(o: EggBetaOptions): { check: () => void; stop: () => void } {
  if (o.host !== EGG_BETA_HOST) {
    o.onState({ kind: 'none' });
    return { check: () => undefined, stop: () => undefined };
  }
  let live: unknown = null;
  let stopped = false;
  let reloadedFor: string | null = null;
  let tick: ReturnType<typeof setTimeout> | null = null;
  const readMark = (): string | null => {
    if (reloadedFor) return reloadedFor;
    try {
      return o.storage?.getItem(EGG_BETA_RELOADED_KEY) ?? null;
    } catch {
      return null;
    }
  };

  function evaluate(): void {
    if (stopped) return;
    if (tick) clearTimeout(tick);
    tick = null;
    const s = eggBetaDecision({
      host: o.host,
      live,
      ownBuildTime: o.ownBuildTime,
      nowMs: Date.now(),
      busy: o.busy(),
      reloadedFor: readMark(),
    });
    o.onState(s);
    if (s.kind === 'reload') {
      reloadedFor = s.reloadAt;
      try {
        o.storage?.setItem(EGG_BETA_RELOADED_KEY, s.reloadAt);
      } catch {
        // Storage blocked: the in-memory mark still stops a second reload in this page.
      }
      stop();
      o.reload();
      return;
    }
    // A countdown ticks each second (it shows seconds in the last minute); a wait looks again every 15 s; otherwise
    // the next read of version.json is what can change anything.
    if (s.kind === 'countdown') tick = setTimeout(evaluate, Math.min(1000, s.msLeft));
    else if (s.kind === 'waiting') tick = setTimeout(evaluate, WAIT_POLL_MS);
  }

  async function refresh(): Promise<void> {
    try {
      const body = await o.fetchLive();
      if (body && typeof body === 'object') live = body;
    } catch {
      // Offline or mid-deploy: keep what was read last.
    }
    evaluate();
  }

  const fetcher = setInterval(() => void refresh(), FETCH_EVERY_MS);
  function stop(): void {
    stopped = true;
    clearInterval(fetcher);
    if (tick) clearTimeout(tick);
    tick = null;
  }
  void refresh();
  return { check: evaluate, stop };
}
