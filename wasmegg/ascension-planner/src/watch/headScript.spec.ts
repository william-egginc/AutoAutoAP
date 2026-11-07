/**
 * watch.html's inline head script (QA's P3, 6 Nov 2026): before the Cloudflare beacon or anything else runs, it takes
 * the phone link's #<id>.<secret> out of the address (history.replaceState), keeps it for this tab in sessionStorage
 * (in memory when that throws), and hands it to the page code (window.aaapWatchLink). The real script text is run,
 * read from watch.html, and its CSP hash is worked out from that same text.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptHashes } from '@/lib/securityHeaders';
import { newWatchId, newWatchSecret, watchPageUrl } from '@/search/watchLink';
import { WATCH_HTML, headScriptText, loadWatchPage } from '@/watch/specHeadScript';

const ID = newWatchId();
const SECRET = newWatchSecret();
const PAGE = 'https://egg.example.org/ascension-planner/watch.html';
const KEY = 'aaap-watch-link';

describe("watch.html's head script keeps the watch secret out of the address", () => {
  it('a link as the planner builds it today opens the phone page, and the address loses its fragment', () => {
    const url = watchPageUrl({
      origin: 'https://egg.example.org',
      base: '/ascension-planner/',
      id: ID,
      secret: SECRET,
      collector: 'https://c.example',
    });
    expect(url).toContain(`#${ID}.${SECRET}`);
    const tab = new Map<string, string>();
    const p = loadWatchPage(url, tab);
    expect(p.documentElement.className).toBe('phone');
    expect(p.location.hash).toBe('');
    expect(p.location.href).not.toContain(SECRET);
    expect(p.location.href).not.toContain('#');
    // The query (?collector=) and the path stay.
    expect(p.replaced).toEqual([new URL(url).pathname + new URL(url).search]);
    expect(tab.get(KEY)).toBe(`${ID}.${SECRET}`);
    expect(p.window.aaapWatchLink?.()).toBe(`${ID}.${SECRET}`);
  });

  it('a reload (no fragment left, the tab still holding it) is still the phone page for that run', () => {
    const tab = new Map<string, string>();
    loadWatchPage(`${PAGE}#${ID}.${SECRET}`, tab);
    const again = loadWatchPage(PAGE, tab);
    expect(again.documentElement.className).toBe('phone');
    expect(again.window.aaapWatchLink?.()).toBe(`${ID}.${SECRET}`);
    expect(again.replaced).toEqual([]);
  });

  it('with no fragment and nothing held it is the second-tab watcher, and touches nothing', () => {
    const tab = new Map<string, string>();
    const p = loadWatchPage(PAGE, tab);
    expect(p.documentElement.className).toBe('');
    expect(p.window.aaapWatchLink?.()).toBe('');
    expect(p.replaced).toEqual([]);
    expect(tab.size).toBe(0);
  });

  it('a new link pasted over this one (hashchange) replaces the held one and leaves the address too', () => {
    const tab = new Map<string, string>();
    const p = loadWatchPage(`${PAGE}#${ID}.${SECRET}`, tab);
    const id2 = newWatchId();
    const secret2 = newWatchSecret();
    p.location.hash = `#${id2}.${secret2}`;
    p.location.href = `${PAGE}#${id2}.${secret2}`;
    expect(p.window.aaapWatchLink?.()).toBe(`${id2}.${secret2}`);
    expect(p.location.hash).toBe('');
    expect(tab.get(KEY)).toBe(`${id2}.${secret2}`);
  });

  for (const storage of ['throws', 'setItem throws'] as const) {
    it(`sessionStorage that ${storage === 'throws' ? 'throws on every access' : 'refuses writes'}: held in memory, nothing thrown`, () => {
      let p!: ReturnType<typeof loadWatchPage>;
      expect(() => (p = loadWatchPage(`${PAGE}#${ID}.${SECRET}`, storage))).not.toThrow();
      expect(p.documentElement.className).toBe('phone');
      expect(p.location.hash).toBe('');
      expect(p.window.aaapWatchLink?.()).toBe(`${ID}.${SECRET}`);
      expect(p.window.aaapWatchLink?.()).toBe(`${ID}.${SECRET}`);
    });
  }

  it('runs first: right after <meta charset>, before every other script, the manifest and the title', () => {
    const head = WATCH_HTML.slice(WATCH_HTML.indexOf('<head>'), WATCH_HTML.indexOf('</head>'));
    expect(head).toMatch(/^<head>\s*<meta charset="UTF-8" \/>\s*<script>/);
    expect(WATCH_HTML.indexOf('<script')).toBe(WATCH_HTML.indexOf(`<script>${headScriptText()}</script>`));
  });

  it('is ES5 and stands alone (no arrows, let/const, template strings, spread or imports)', () => {
    const s = headScriptText();
    for (const banned of [/=>/, /\blet\s/, /\bconst\s/, /`/, /\.\.\./, /\bimport\b/, /\bclass\s/])
      expect(s).not.toMatch(banned);
  });

  it("the CSP's hash is the hash of exactly this script text", async () => {
    const want = `sha256-${createHash('sha256').update(headScriptText()).digest('base64')}`;
    const hashes = await inlineScriptHashes(WATCH_HTML);
    expect(hashes).toEqual([want]);
    expect(contentSecurityPolicy(hashes)).toContain(`'${want}'`);
  });
});
