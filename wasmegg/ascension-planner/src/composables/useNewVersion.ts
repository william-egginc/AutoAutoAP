/**
 * Notice when a newer build of this page has gone live, so a tab opened hours ago says so.
 *
 * WHY. Long searches keep a tab open for hours, and a tab keeps running the code it loaded. When
 * the collector changed its upload rules, a tab from before the change kept sending CSVs the new
 * collector refuses, and all it could say was "refused (403)". A reload fixes it; the tab just had
 * no way to know one was needed.
 *
 * HOW, WITHOUT A BUILD STEP. Vite names each page's entry script by content hash
 * (`assets/index-BGv8tSVu.js`), and that name changes whenever the page's code does. So: remember
 * the name this tab loaded, re-fetch the page's HTML now and then with the cache bypassed, and
 * compare. The dev server serves `/src/main.ts` with no hash, so this stays quiet there.
 *
 * OFFLINE IS NOT AN ERROR. A failed fetch is ignored and tried again next time; nothing here may
 * interrupt a run that is still going.
 *
 * HOW OFTEN. One check is the page's HTML: ~1.2 KB (0.5 KB compressed) plus headers. The useful
 * moment is when someone comes BACK to the tab, so that always checks, as does coming back online.
 * Beyond that it depends on the device (2026-09-24): every 5 minutes on a desktop, where a long run
 * sits open all day on a flat-rate connection, and every 30 on a phone or tablet -- or anything
 * with data saver on -- where the same all-day tab at 5 minutes would spend ~0.5 MB of mobile data
 * for nothing. Only ever while the tab is visible, so a phone in a pocket spends nothing.
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
  return (mobile ? 30 : 5) * 60 * 1000;
}

/**
 * `available` turns true once a newer build is live. `pageUrl` is the HTML to re-fetch (relative to
 * this page), `entry` the script name to compare.
 */
export function useNewVersion(pageUrl: string, entry: string) {
  const available = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  const loadedSrc =
    typeof document === 'undefined'
      ? null
      : ([...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')]
          .map(s => s.getAttribute('src') ?? '')
          .find(src => entryScriptIn(src, entry)) ?? null);

  async function check(): Promise<void> {
    if (available.value || !loadedSrc) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const res = await fetch(pageUrl, { cache: 'no-store' });
      if (res.ok && isNewerBuild(await res.text(), loadedSrc, entry)) available.value = true;
    } catch {
      // Offline, or the host is restarting mid-deploy. Try again on the next tick.
    }
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };

  onMounted(() => {
    if (!loadedSrc) return;
    timer = setInterval(() => void check(), checkEveryMs(isMobileLike()));
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
  });

  return { available, check };
}
