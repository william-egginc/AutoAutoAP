/**
 * "Which build is in use": each open copy of the page tells the collector which build it is, at most once a day,
 * so the maintainer can see when old builds are still open (24 Oct 2026, the owner: "it just sends only what
 * version it is"). The collector side is collector/buildcount.js; public/about.html says the same in words.
 *
 * WHAT IS SENT. Only the build id: the hashed entry script this page loaded, without its folder and `.js`
 * (`assets/index-BGv8tSVu.js` -> `index-BGv8tSVu`), as the body of `POST <collector>/v`. No player ID, no account
 * tag, no save, no page path (the request goes with `referrerPolicy: 'no-referrer'`), no cookies
 * (`credentials: 'omit'`), no time: the collector keeps a count per UTC day and build, nothing else.
 *
 * WHEN. At most once a UTC day per build per browser (a stamp in localStorage, `BUILD_COUNT_KEY`); where storage is
 * blocked, at most once per page load. Only after the page has been visible for `VISIBLE_MS` in a row, never while
 * offline (it waits for the browser to be back online, then for the page to be visible again), and fire-and-forget:
 * a failed send is not retried and says nothing. The stamp is written before the send, so a failure is not retried
 * either.
 *
 * NEVER. With Global Privacy Control or Do Not Track on, nothing is sent. Nor from an automated browser
 * (`navigator.webdriver`, e.g. the site runner), a build with no collector, or the dev server (its entry has no hash).
 */

/** The localStorage record: `{ [build]: 'YYYY-MM-DD' }`, today's builds only. */
export const BUILD_COUNT_KEY = 'aap.buildCount';
/** How long the page must have been visible, in a row, before it sends. */
export const VISIBLE_MS = 5000;
/** The collector's check (collector/buildcount.js BUILD_ID): an entry name, a dash, a 6 to 16 character hash. */
export const BUILD_ID = /^[a-z]{1,16}-[A-Za-z0-9_-]{6,16}$/;

/** `assets/index-BGv8tSVu.js` (or a full URL to it) -> `index-BGv8tSVu`; null for anything else (the dev server). */
export function buildIdFrom(src: string | null | undefined, entry: string): string | null {
  if (!src) return null;
  const m = src.match(new RegExp(`(?:^|/)assets/(${entry}-[A-Za-z0-9_-]+)\\.js(?:[?#]|$)`));
  return m && BUILD_ID.test(m[1]) ? m[1] : null;
}

/** The navigator fields read here; a parameter so the specs can supply their own. */
export interface CountNavigator {
  onLine?: boolean;
  webdriver?: boolean;
  globalPrivacyControl?: boolean;
  doNotTrack?: string | null;
  msDoNotTrack?: string | null;
}

/** True when the browser asks sites not to track it: Global Privacy Control, or Do Not Track ("1" or "yes"). */
export function asksNotToTrack(nav: CountNavigator | undefined, win?: { doNotTrack?: string | null }): boolean {
  if (!nav) return false;
  if (nav.globalPrivacyControl === true) return true;
  const dnt = [nav.doNotTrack, nav.msDoNotTrack, win?.doNotTrack];
  return dnt.some(v => v === '1' || v === 'yes');
}

/** The UTC day of `ms`, `YYYY-MM-DD` (the collector counts by the same day). */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** True when the stored record says `build` was already sent on `day`. A record that is not one counts as empty. */
export function sentOn(raw: string | null, build: string, day: string): boolean {
  return readStamps(raw)[build] === day;
}

function readStamps(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The record after sending `build` on `day`: that day's stamps only, so old builds do not pile up. */
export function stamped(raw: string | null, build: string, day: string): string {
  const out: Record<string, string> = {};
  for (const [b, d] of Object.entries(readStamps(raw))) if (d === day && BUILD_ID.test(b)) out[b] = d;
  out[build] = day;
  return JSON.stringify(out);
}

/** `https://…/submit` -> `https://…/v`; null without a collector or for anything that is not http(s). */
export function countUrlFrom(submitUrl: string | null | undefined): string | null {
  const base = (submitUrl ?? '')
    .trim()
    .replace(/\/submit\/?$/, '')
    .replace(/\/$/, '');
  return /^https?:\/\/[^/]/i.test(base) ? `${base}/v` : null;
}

/** The one send: a keepalive POST with the build id as plain text, nothing else attached; failure ignored. */
export function sendBuild(url: string, build: string): void {
  try {
    void fetch(url, {
      method: 'POST',
      body: build,
      keepalive: true,
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    }).catch(() => undefined);
  } catch {
    // No fetch, or it threw at once: nothing to do.
  }
}

/** The page load's memory: the builds sent (or found sent) on this load, the floor when storage is blocked. */
const sentThisLoad = new Set<string>();

/** Everything startBuildCount touches, injectable for the specs. */
export interface BuildCountDeps {
  url: string | null;
  nav: CountNavigator | undefined;
  win: { doNotTrack?: string | null } | undefined;
  /** The document's visibility and its events. */
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined;
  /** The window's `online` event. */
  events: Pick<Window, 'addEventListener' | 'removeEventListener'> | undefined;
  /** localStorage, or a throw where it is blocked. */
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  now: () => number;
  send: (url: string, build: string) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  loadMemory: Set<string>;
}

function defaultDeps(): BuildCountDeps {
  const hasWindow = typeof window !== 'undefined';
  return {
    url: countUrlFrom(import.meta.env.VITE_SUBMIT_URL as string | undefined),
    nav: typeof navigator === 'undefined' ? undefined : (navigator as CountNavigator),
    win: hasWindow ? (window as unknown as { doNotTrack?: string | null }) : undefined,
    doc: typeof document === 'undefined' ? undefined : document,
    events: hasWindow ? window : undefined,
    storage: () => window.localStorage,
    now: () => Date.now(),
    send: sendBuild,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: t => clearTimeout(t as ReturnType<typeof setTimeout>),
    loadMemory: sentThisLoad,
  };
}

/**
 * Sends `build` once the page has been visible VISIBLE_MS, unless it was sent today (see the top of this file).
 * Returns a stop function that cancels anything still waiting. Nothing happens for a null build.
 */
export function startBuildCount(build: string | null, overrides: Partial<BuildCountDeps> = {}): () => void {
  const d = { ...defaultDeps(), ...overrides };
  const noop = () => undefined;
  if (!build || !BUILD_ID.test(build) || !d.url || !d.doc || !d.nav) return noop;
  if (d.nav.webdriver === true || asksNotToTrack(d.nav, d.win)) return noop;
  if (d.loadMemory.has(build)) return noop;

  const url = d.url;
  const doc = d.doc;
  let timer: unknown = null;
  let done = false;

  const disarm = () => {
    if (timer !== null) d.clearTimer(timer);
    timer = null;
  };
  const stop = () => {
    done = true;
    disarm();
    doc.removeEventListener('visibilitychange', onVisibility);
    d.events?.removeEventListener('online', onVisibility);
  };
  const arm = () => {
    if (done || timer !== null || doc.visibilityState !== 'visible') return;
    timer = d.setTimer(fire, VISIBLE_MS);
  };
  function onVisibility(): void {
    if (doc.visibilityState === 'visible') arm();
    else disarm();
  }

  function fire(): void {
    timer = null;
    if (done) return;
    // Hidden at the last moment, or offline: wait for the page to be visible (and online) again.
    if (doc.visibilityState !== 'visible' || d.nav?.onLine === false) return;
    if (asksNotToTrack(d.nav, d.win) || d.loadMemory.has(build!)) return stop();
    const day = utcDay(d.now());
    let store: Pick<Storage, 'getItem' | 'setItem'> | null = null;
    let raw: string | null = null;
    try {
      store = d.storage();
      raw = store.getItem(BUILD_COUNT_KEY);
    } catch {
      store = null; // Blocked: once per page load is the most this can promise.
    }
    d.loadMemory.add(build!);
    if (store && sentOn(raw, build!, day)) return stop();
    if (store) {
      try {
        store.setItem(BUILD_COUNT_KEY, stamped(raw, build!, day));
      } catch {
        // Full or blocked on write: the page load's memory still holds.
      }
    }
    d.send(url, build!);
    stop();
  }

  doc.addEventListener('visibilitychange', onVisibility);
  d.events?.addEventListener('online', onVisibility);
  arm();
  return stop;
}
