/**
 * Spec helper for the watch specs: runs watch.html's own inline head script (the exact text the CSP hashes, read
 * from the file) in a bare stand-in for the page, so a spec can check what it does to the address, sessionStorage and
 * <html class>, and hand the page code the same `window` and `location` afterwards. Node only (node:fs, node:vm).
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export const WATCH_HTML = readFileSync(new URL('../../watch.html', import.meta.url), 'utf8');

/** The first inline <script> of watch.html (no src), byte for byte as the browser and the CSP hash see it. */
export function headScriptText(html = WATCH_HTML): string {
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    if (/\ssrc\s*=/i.test(m[1] ?? '') || !m[2].trim()) continue;
    return m[2];
  }
  throw new Error('watch.html has no inline script');
}

/** A sessionStorage stand-in kept across "reloads" of one tab. `throws`: every access throws (storage blocked). */
export type TabStorage = Map<string, string> | 'throws' | 'setItem throws';

export type FakePage = {
  window: Record<string, unknown> & { aaapWatchLink?: () => string };
  location: { hash: string; pathname: string; search: string; href: string };
  documentElement: { className: string };
  /** The addresses handed to history.replaceState, in order. */
  replaced: string[];
};

/** Loads `url` in a stand-in tab and runs the head script there, as the browser does before anything else. */
export function loadWatchPage(url: string, storage: TabStorage = new Map()): FakePage {
  const at = new URL(url);
  const location = { hash: at.hash, pathname: at.pathname, search: at.search, href: at.href };
  const replaced: string[] = [];
  const history = {
    state: null,
    replaceState(_state: unknown, _title: string, next: string) {
      replaced.push(next);
      const n = new URL(next, location.href);
      Object.assign(location, { hash: n.hash, pathname: n.pathname, search: n.search, href: n.href });
    },
  };
  const store =
    storage instanceof Map
      ? {
          getItem: (k: string) => storage.get(k) ?? null,
          setItem: (k: string, v: string) => void storage.set(k, String(v)),
          removeItem: (k: string) => void storage.delete(k),
        }
      : {
          getItem: () => null,
          setItem: () => {
            throw new Error('QuotaExceededError');
          },
          removeItem: () => undefined,
        };
  const window: FakePage['window'] = { location, history };
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      if (storage === 'throws') throw new Error('SecurityError: The operation is insecure.');
      return store;
    },
  });
  const documentElement = { className: '' };
  runInNewContext(headScriptText(), { window, location, history, document: { documentElement } });
  return { window, location, documentElement, replaced };
}
