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
import { buildIdFrom, startBuildCount } from '@/lib/buildCount';
import { listNotes, type ListedNote, type RunningBuild } from '@/lib/updateNotes';

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

/** `version.json` as the build writes it: entry name -> hashed file, plus `release` (below). */
export type LiveEntries = Record<string, unknown>;

/** How much a new build matters (release.ts explains the three levels). */
export type ReleaseLevel = 'small' | 'big' | 'essential';

export interface ReleaseInfo {
  level: ReleaseLevel;
  /** The release notes (lib/updateNotes.ts), at most MAX_SHOWN: the ones this tab's build does not carry first,
   *  marked "New", then the ones it does. Empty when none is new, and then the banner says only "Small update
   *  available" (or asks for the reload). */
  notes: ListedNote[];
  /** How many more notes did not fit ("+N more"). */
  more: number;
}

/** This bundle's build time, or '' where the define is absent (tests, dev). */
export const OWN_BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** This bundle's build: its time, and the key (and `at`) of each release note it already carries (vite.config.ts).
 *  No key list (tests, a bundle from before keys) leaves the time rule to decide (lib/updateNotes.ts). */
export const RUNNING_BUILD: RunningBuild = {
  builtAt: OWN_BUILD_TIME,
  noteAts: typeof __BUILD_NOTE_ATS__ !== 'undefined' && Array.isArray(__BUILD_NOTE_ATS__) ? __BUILD_NOTE_ATS__ : [],
  noteKeys:
    typeof __BUILD_NOTE_KEYS__ !== 'undefined' && Array.isArray(__BUILD_NOTE_KEYS__) ? __BUILD_NOTE_KEYS__ : undefined,
};

/**
 * How much the live build matters to THIS tab: "essential" when the tab was built before the last
 * change an open tab could trip over (release.ts `reloadIfBuiltBefore`) -- so a tab that slept
 * through an essential deploy and then saw a later small one is still told to reload; else "big"
 * when ANY update it missed is marked big; else "small".
 * A version.json without the marker (from before this existed), or a tab that does not know its
 * own build time, counts as "essential": the only kind of notice there used to be.
 *
 * The notes are the history entries, each marked whether this tab's build already carries it (by its
 * text, lib/updateNotes.ts): listed only when one is new, the new ones first and tagged "New" (UX35-b,
 * 28 Oct 2026; by text, 30 Oct 2026). Only a new note can make the update big. A rebuild whose only
 * change is re-timed notes still names a new entry script (the build time is compiled in), so it still
 * shows the quiet "Small update available", with no list: the tab cannot tell it from a code change. The top-level `release.note` is never shown: it is
 * always the newest entry, which a tab running Release 5 or later already had (26 Oct 2026).
 */
export function releaseFrom(versionJson: unknown, running: RunningBuild = RUNNING_BUILD): ReleaseInfo {
  const r = versionJson && typeof versionJson === 'object' ? (versionJson as LiveEntries).release : null;
  if (!r || typeof r !== 'object') return { level: 'essential', notes: [], more: 0 };
  const since = (r as { reloadIfBuiltBefore?: unknown }).reloadIfBuiltBefore;
  const listed = listNotes((r as { history?: unknown }).history, running);
  const notes = listed.shown;
  const more = listed.more;
  const ownBuildTime = running?.builtAt ?? '';
  if (typeof since !== 'string' || !since || !ownBuildTime) return { level: 'essential', notes, more };
  if (ownBuildTime < since) return { level: 'essential', notes, more };
  return { level: listed.anyBig ? 'big' : 'small', notes, more };
}

const RANK: Record<ReleaseLevel, number> = { small: 0, big: 1, essential: 2 };

/** Levels only go up: a tab already asking for more never drops back to a quieter notice. The notes
 *  always come from the newest check: a later version.json lists every note this tab still lacks. */
export function raiseLevel(current: ReleaseInfo | null, next: ReleaseInfo): ReleaseInfo {
  if (current && RANK[current.level] > RANK[next.level]) return { ...next, level: current.level };
  return next;
}

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
export function isMobileLike(
  nav: DeviceHints | undefined = typeof navigator === 'undefined' ? undefined : (navigator as DeviceHints)
): boolean {
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
  /** What the newer build says about itself; meaningful once `available` is true. */
  const release = ref<ReleaseInfo>({ level: 'essential', notes: [], more: 0 });
  let timer: ReturnType<typeof setInterval> | null = null;
  let channel: BroadcastChannel | null = null;
  let lastChecked = 0;
  let everyMs = checkEveryMs(false);
  let stopCount: (() => void) | null = null;

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
    // After a small or big notice keep looking: a later build may be one this tab has to reload for.
    if ((available.value && release.value.level === 'essential') || !loadedSrc) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    lastChecked = Date.now();
    try {
      const entries = await fetchEntries();
      if (entries && liveEntryFrom(entries, entry)) {
        if (isNewerEntry(entries, loadedSrc, entry)) {
          release.value = raiseLevel(available.value ? release.value : null, releaseFrom(entries));
          available.value = true;
        }
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
    if (isNewerEntry(e.data.entries, loadedSrc, entry)) {
      release.value = raiseLevel(available.value ? release.value : null, releaseFrom(e.data.entries));
      available.value = true;
    }
  };

  onMounted(() => {
    if (!loadedSrc) return;
    // "Which build is in use" (lib/buildCount.ts): this build's id, at most once a day, nothing else.
    stopCount = startBuildCount(buildIdFrom(loadedSrc, entry));
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
    stopCount?.();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
    channel?.close();
  });

  return { available, release, check };
}
