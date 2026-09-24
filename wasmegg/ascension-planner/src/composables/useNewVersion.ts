/**
 * Notice when a newer build of this page has gone live, so a tab opened hours ago says so.
 *
 * WHY. Long searches keep a tab open for hours, and a tab keeps running the code it loaded. When
 * the collector changed its upload rules, a tab from before the change kept sending CSVs the new
 * collector refuses, and all it could say was "refused (403)". A reload fixes it; the tab just had
 * no way to know one was needed.
 *
 * HOW. Vite names each page's entry script by content hash (`assets/index-BGv8tSVu.js`), and that
 * name changes whenever the page's code does. The build writes every entry's current name into
 * `version.json` (vite.config.ts, ~90 bytes). The tab remembers the name it loaded, fetches that
 * file now and then with every cache bypassed, and compares. A deploy that predates the file (or a
 * host that lost it) falls back to reading the entry out of the page's HTML, the way this used to
 * work. The dev server serves `/src/main.ts` with no hash, so this stays quiet there.
 *
 * OFFLINE IS NOT AN ERROR. A failed fetch is ignored and tried again next time; nothing here may
 * interrupt a run that is still going.
 *
 * HOW OFTEN (2026-09-24). A check is ~90 bytes plus headers, so: when someone comes BACK to the tab
 * or back online, and otherwise every minute on a desktop and every 5 on a phone, tablet or
 * data-saver connection -- an all-day phone tab at that rate is ~0.1 MB. Only while visible, so a
 * phone in a pocket spends nothing.
 *
 * ONE CHECK FOR ALL TABS. Tabs of this site share a BroadcastChannel: whichever checks tells the
 * others what it saw, and they skip their own next check. Ten open tabs cost one request a minute,
 * and a new build shows its banner in every tab at once, including ones hidden behind the one that
 * looked.
 */
import { onMounted, onUnmounted, ref } from 'vue';

/** The hashed entry script for `entry` (`index`, `explorer`) named in this HTML, or null. */
export function entryScriptIn(html: string, entry: string): string | null {
  const m = html.match(new RegExp(`assets/${entry}-[A-Za-z0-9_-]+\\.js`));
  return m ? m[0] : null;
}

/** True when the live page names a different build of `entry` than the one this tab loaded. */
export function isNewerBuild(liveHtml: string, loadedSrc: string | null, entry: string): boolean {
  if (!loadedSrc) return false;
  const loaded = entryScriptIn(loadedSrc, entry);
  const live = entryScriptIn(liveHtml, entry);
  return !!loaded && !!live && loaded !== live;
}

/** `version.json` as the build writes it: entry name -> hashed file. */
export type LiveEntries = Record<string, string>;

/** The live entry for `entry` from a `version.json` body, or null when it is not one. */
export function liveEntryFrom(versionJson: unknown, entry: string): string | null {
  if (!versionJson || typeof versionJson !== 'object') return null;
  const file = (versionJson as LiveEntries)[entry];
  return typeof file === 'string' ? entryScriptIn(file, entry) : null;
}

/** True when `version.json` names a different build of `entry` than the one this tab loaded. */
export function isNewerEntry(versionJson: unknown, loadedSrc: string | null, entry: string): boolean {
  const loaded = loadedSrc ? entryScriptIn(loadedSrc, entry) : null;
  const live = liveEntryFrom(versionJson, entry);
  return !!loaded && !!live && loaded !== live;
}

/** The navigator fields the device guess reads; a parameter so the tests can supply their own. */
export interface DeviceHints {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
  connection?: { saveData?: boolean };
}

/**
 * A phone or tablet, or anything asking to save data. The browser's own answer
 * (`userAgentData.mobile`, Chromium) wins when there is one; otherwise the user agent, plus the one
 * case it hides: an iPad reports itself as a Mac, and gives itself away with touch points.
 */
export function isMobileLike(nav: DeviceHints | undefined = typeof navigator === 'undefined' ? undefined : (navigator as DeviceHints)): boolean {
  if (!nav) return false;
  if (nav.connection?.saveData) return true;
  if (typeof nav.userAgentData?.mobile === 'boolean' && nav.userAgentData.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent ?? '')) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

/** How often a visible tab checks for a new build. */
export function checkEveryMs(mobile: boolean): number {
  return (mobile ? 5 : 1) * 60 * 1000;
}

/** A timed check skips when some tab (this one or another) looked this recently: a little under
 *  the interval, so timers that drift by a second or two do not each end up skipping. */
export function isDue(lastCheckedMs: number, nowMs: number, everyMs: number): boolean {
  return nowMs - lastCheckedMs >= everyMs * 0.8;
}

/** What one tab tells the others after a check: the entries it saw live. */
interface Seen {
  kind: 'seen';
  entries: LiveEntries;
}

const CHANNEL = 'aap-new-version';

/**
 * `available` turns true once a newer build is live. `pageUrl` is the page's HTML (relative to this
 * page) for the fallback, `entry` the script name to compare.
 */
export function useNewVersion(pageUrl: string, entry: string) {
  const available = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let channel: BroadcastChannel | null = null;
  let lastChecked = 0;
  let everyMs = checkEveryMs(false);

  const loadedSrc =
    typeof document === 'undefined'
      ? null
      : ([...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')]
          .map(s => s.getAttribute('src') ?? '')
          .find(src => entryScriptIn(src, entry)) ?? null);

  /** `version.json` next to the page, or null when the host has none (older deploy). The query
   *  string keeps any cache in between (a CDN, a tunnel) from answering with an old copy. */
  async function fetchEntries(): Promise<LiveEntries | null> {
    const res = await fetch(new URL(`version.json?t=${Date.now()}`, document.baseURI).href, { cache: 'no-store' });
    if (!res.ok) return null;
    try {
      const body = await res.json();
      return body && typeof body === 'object' ? (body as LiveEntries) : null;
    } catch {
      return null; // An HTML error page served as 200.
    }
  }

  async function check(): Promise<void> {
    if (available.value || !loadedSrc) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    lastChecked = Date.now();
    try {
      const entries = await fetchEntries();
      if (entries && liveEntryFrom(entries, entry)) {
        if (isNewerEntry(entries, loadedSrc, entry)) available.value = true;
        channel?.postMessage({ kind: 'seen', entries } satisfies Seen);
        return;
      }
      const res = await fetch(pageUrl, { cache: 'no-store' });
      if (res.ok && isNewerBuild(await res.text(), loadedSrc, entry)) available.value = true;
    } catch {
      // Offline, or the host is restarting mid-deploy. Try again on the next tick.
    }
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  const onTick = () => {
    if (isDue(lastChecked, Date.now(), everyMs)) void check();
  };
  const onSeen = (e: MessageEvent<Seen>) => {
    if (e.data?.kind !== 'seen') return;
    lastChecked = Date.now();
    if (isNewerEntry(e.data.entries, loadedSrc, entry)) available.value = true;
  };

  onMounted(() => {
    if (!loadedSrc) return;
    everyMs = checkEveryMs(isMobileLike());
    timer = setInterval(onTick, everyMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.addEventListener('message', onSeen);
    }
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
    channel?.close();
  });

  return { available, check };
}
