/**
 * A player ID in the address (`?playerId=…`) is taken out of the address bar as soon as the page has
 * read it, and the page view is counted without the query (review 21 Oct 2026, data-security #7). The
 * ID is a bearer token for the save, and GoatCounter's count.js sends the address's query (`q`) and, on
 * hosts other than the canonical one, the path with it, to carpet's GoatCounter account.
 *
 * WHY NOT KEPT FOR SHARE LINKS. The site builds no link with a player ID in it: the account lives in this
 * browser (lib's saved player ID), and the old `?playerId=` rewrite in App.vue only kept a hand-made link
 * pointing at the account loaded last. So the link's ID is read, kept for this tab only (a reload before
 * the save has loaded still opens the same account) and dropped from the address; once the save loads it
 * is the saved ID like any other.
 *
 * Runs from main.ts before the app (`urlPrivacy.install.ts`), so App.vue reads `linkPlayerId()`.
 */
const TAB_KEY = 'aap-link-player-id';
let taken: string | null = null;

type Win = Pick<Window, 'location' | 'history'> & { sessionStorage?: Storage };

/** Reads `?playerId=` and takes it out of the address bar (replaceState, no new history entry). */
export function takePlayerIdFromUrl(win: Win = window): string | null {
  const url = new URL(win.location.href);
  const id = url.searchParams.get('playerId');
  if (id === null) return null;
  url.searchParams.delete('playerId');
  win.history.replaceState(win.history.state, '', url.toString());
  taken = id.trim() || null;
  try {
    if (taken) win.sessionStorage?.setItem(TAB_KEY, taken);
  } catch {
    // Storage blocked: the ID still opens this visit.
  }
  return taken;
}

/** The ID a link opened this tab with, until the save has loaded (`forgetLinkPlayerId`). */
export function linkPlayerId(win: Pick<Win, 'sessionStorage'> = window): string | null {
  if (taken) return taken;
  try {
    return win.sessionStorage?.getItem(TAB_KEY) || null;
  } catch {
    return null;
  }
}

/** The save loaded and the ID is saved as usual: the tab's copy of the link's ID is no longer needed. */
export function forgetLinkPlayerId(win: Pick<Win, 'sessionStorage'> = window): void {
  taken = null;
  try {
    win.sessionStorage?.removeItem(TAB_KEY);
  } catch {
    // nothing kept
  }
}

type GoatCounter = { count?: (vars: { path: string }) => void };

/**
 * Counts the page view with GoatCounter, by the path alone (no query string). index.html loads count.js
 * with `no_onload`, so nothing is sent until this runs, after the ID is out of the address.
 */
export function countPageView(
  doc: Pick<Document, 'querySelector'> = document,
  win: Pick<Window, 'location'> & { goatcounter?: GoatCounter } = window as never
): void {
  const send = () => {
    try {
      win.goatcounter?.count?.({ path: win.location.pathname });
    } catch {
      // A counter failing is never the page's problem.
    }
  };
  if (typeof win.goatcounter?.count === 'function') return send();
  doc.querySelector('script[data-goatcounter]')?.addEventListener('load', send, { once: true });
}
