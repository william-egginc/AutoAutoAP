/**
 * A player ID in the address is not sent to the page counter (review 21 Oct 2026, data-security #7):
 * index.html sent page views to carpet's GoatCounter, whose count.js sends the query (and, off the
 * canonical host, the path with it), so `?playerId=` went along. The ID is now read, taken out of the
 * address bar, and the view is counted by path only, after that.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { countPageView, forgetLinkPlayerId, linkPlayerId, takePlayerIdFromUrl } from './urlPlayerId';

const ID = 'EI1234567890123456';

function fakeWindow(href: string) {
  const session = new Map<string, string>();
  const win = {
    location: new URL(href) as unknown as Location,
    history: {
      state: { s: 1 },
      replaceState: vi.fn((_s: unknown, _t: string, url: string) => {
        win.location = new URL(url) as unknown as Location;
      }),
    },
    sessionStorage: {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => void session.set(k, v),
      removeItem: (k: string) => void session.delete(k),
    } as unknown as Storage,
  };
  return { win, session };
}

describe('?playerId= in the address', () => {
  it('is read, then taken out of the address bar (other parameters and the hash kept)', () => {
    const { win } = fakeWindow(`https://example.test/ascension-planner/?playerId=${ID}&gap=2#/auto`);
    expect(takePlayerIdFromUrl(win as never)).toBe(ID);
    expect(win.history.replaceState).toHaveBeenCalledTimes(1);
    expect(String(win.location)).toBe('https://example.test/ascension-planner/?gap=2#/auto');
    expect(String(win.location)).not.toContain(ID);
    expect(linkPlayerId(win as never)).toBe(ID);
  });

  it('a reload of the tab before the save loaded still opens that account; after it, the saved ID does', () => {
    const { win, session } = fakeWindow(`https://example.test/?playerId=${ID}`);
    takePlayerIdFromUrl(win as never);
    forgetLinkPlayerId(win as never); // the module's own copy goes with a reload too
    session.set('aap-link-player-id', ID);
    expect(linkPlayerId(win as never)).toBe(ID);
    forgetLinkPlayerId(win as never);
    expect(linkPlayerId(win as never)).toBeNull();
  });

  it('no parameter: nothing changes', () => {
    const { win } = fakeWindow('https://example.test/ascension-planner/#/auto');
    expect(takePlayerIdFromUrl(win as never)).toBeNull();
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });
});

describe('the GoatCounter page view', () => {
  it('is counted by path only, once count.js has loaded', () => {
    const count = vi.fn();
    let onLoad: (() => void) | null = null;
    const doc = { querySelector: () => ({ addEventListener: (_e: string, f: () => void) => (onLoad = f) }) };
    const win = { location: new URL('https://example.test/ascension-planner/?gap=2') } as never as {
      location: Location;
      goatcounter?: { count: typeof count };
    };
    countPageView(doc as never, win as never);
    expect(count).not.toHaveBeenCalled();
    win.goatcounter = { count };
    onLoad!();
    expect(count).toHaveBeenCalledWith({ path: '/ascension-planner/' });
  });

  it('index.html loads count.js with no_onload, and main.ts strips the ID before the app', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain(`data-goatcounter-settings='{"no_onload": true}'`);
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const imports = main.split('\n').filter(l => l.startsWith('import '));
    expect(imports.slice(0, 2)).toEqual(["import './lib/storageGuard.install';", "import './lib/urlPrivacy.install';"]);
    const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
    expect(app).not.toContain("get('playerId')");
    expect(app).toContain('const playerId = ref(linkPlayerId() || getSavedPlayerID() ||');
  });
});
