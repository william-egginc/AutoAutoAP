/**
 * watch.html's entry picks the phone page or the second-tab watcher. Since P3 (6 Nov 2026) the head script has
 * already cleared the address, so it asks the head script for the held link, not location.hash.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWatchPage } from '@/watch/specHeadScript';

const PAGE = 'https://egg.example.org/ascension-planner/watch.html';

async function entryFor(url: string, tab: Map<string, string>): Promise<'phone' | 'local'> {
  vi.resetModules();
  let picked: 'phone' | 'local' | null = null;
  vi.doMock('./phone', () => ({ startPhone: () => (picked = 'phone') }));
  vi.doMock('./local', () => {
    picked = 'local';
    return {};
  });
  const p = loadWatchPage(url, tab);
  vi.stubGlobal('location', p.location);
  vi.stubGlobal('window', { aaapWatchLink: p.window.aaapWatchLink });
  await import('./main');
  for (let i = 0; i < 50 && !picked; i++) await new Promise(r => setTimeout(r, 1));
  return picked!;
}

afterEach(() => {
  vi.doUnmock('./phone');
  vi.doUnmock('./local');
  vi.unstubAllGlobals();
});

describe("watch.html's entry", () => {
  it('a phone link is the phone page, and still is after a reload with the address cleared', async () => {
    const tab = new Map<string, string>();
    expect(await entryFor(`${PAGE}#abc.def`, tab)).toBe('phone');
    expect(await entryFor(PAGE, tab)).toBe('phone');
  });

  it('no link anywhere is the second-tab watcher', async () => {
    expect(await entryFor(PAGE, new Map())).toBe('local');
  });
});
