import { describe, expect, it } from 'vitest';
import { backgroundOpenTip, browserHelp, detectBrowser, type HelpLine } from './browserHelp';

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/130.0.0.0`;
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const OPERA = `${CHROME_WIN} OPR/114.0.0.0`;

const text = (l: HelpLine) => l.map(p => (typeof p === 'string' ? p : p.code)).join('');
const codes = (l: HelpLine) => l.filter((p): p is { code: string } => typeof p !== 'string').map(p => p.code);

describe('detectBrowser', () => {
  it('tells the browsers and systems apart from the user agent', () => {
    expect(detectBrowser(SAFARI_MAC, null)).toEqual({ browser: 'safari', os: 'mac' });
    expect(detectBrowser(CHROME_WIN, null)).toEqual({ browser: 'chrome', os: 'windows' });
    expect(detectBrowser(EDGE_WIN, null)).toEqual({ browser: 'edge', os: 'windows' });
    expect(detectBrowser(CHROME_MAC, null)).toEqual({ browser: 'chrome', os: 'mac' });
    expect(detectBrowser(FIREFOX_LINUX, null)).toEqual({ browser: 'firefox', os: 'linux' });
    expect(detectBrowser(FIREFOX_MAC, null)).toEqual({ browser: 'firefox', os: 'mac' });
    expect(detectBrowser(CHROME_IOS, null)).toEqual({ browser: 'chrome', os: 'ios' });
    expect(detectBrowser(SAFARI_IOS, null)).toEqual({ browser: 'safari', os: 'ios' });
    expect(detectBrowser(OPERA, null).browser).toBe('other');
    expect(detectBrowser('', null)).toEqual({ browser: 'other', os: 'other' });
  });

  it('only calls it Safari with both "Safari/" and "Version/"', () => {
    expect(detectBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15', null).browser).toBe('other');
  });

  it('prefers userAgentData brands and platform where the browser has them', () => {
    const brands = (...names: string[]) => names.map(brand => ({ brand, version: '130' }));
    expect(
      detectBrowser(CHROME_WIN, { brands: brands('Not?A_Brand', 'Chromium', 'Microsoft Edge'), platform: 'Windows' })
    ).toEqual({
      browser: 'edge',
      os: 'windows',
    });
    expect(detectBrowser(CHROME_WIN, { brands: brands('Chromium', 'Google Chrome'), platform: 'macOS' })).toEqual({
      browser: 'chrome',
      os: 'mac',
    });
    // Brave: Chrome's user agent, but its own settings pages.
    expect(detectBrowser(CHROME_WIN, { brands: brands('Chromium', 'Brave'), platform: 'Linux' })).toEqual({
      browser: 'other',
      os: 'linux',
    });
    // No brands (an empty list): back to the user agent.
    expect(detectBrowser(EDGE_WIN, { brands: [], platform: '' })).toEqual({ browser: 'edge', os: 'windows' });
  });
});

describe('backgroundOpenTip', () => {
  it('names the right key, and nothing on a phone', () => {
    expect(backgroundOpenTip('mac')).toContain('⌘-click');
    expect(backgroundOpenTip('windows')).toContain('Ctrl-click');
    expect(backgroundOpenTip('linux')).toContain('Ctrl-click');
    expect(backgroundOpenTip('ios')).toBeNull();
    expect(backgroundOpenTip('android')).toBeNull();
  });
});

describe('browserHelp', () => {
  it("gives each browser's own settings, addresses as copyable code", () => {
    const edge = browserHelp('edge', 'example.com');
    expect(codes(edge.popups)).toEqual(['edge://settings/content/popups', 'example.com']);
    expect(codes(edge.keepAwake)).toEqual(['edge://settings/system', 'example.com']);
    expect(text(edge.keepAwake)).toContain('Never put these sites to sleep');

    const chrome = browserHelp('chrome', 'example.com');
    expect(codes(chrome.popups)[0]).toBe('chrome://settings/content/popups');
    expect(codes(chrome.keepAwake)[0]).toBe('chrome://settings/performance');
    expect(text(chrome.keepAwake)).toContain('Always keep these sites active');

    const firefox = browserHelp('firefox', 'example.com');
    expect(codes(firefox.popups)[0]).toBe('about:preferences#privacy');
    expect(text(firefox.popups)).toContain('Exceptions');
    expect(text(firefox.keepAwake)).toContain("doesn't put tabs to sleep");

    const safari = browserHelp('safari', 'example.com');
    expect(text(safari.popups)).toContain('Safari → Settings → Websites → Pop-up Windows');
    expect(text(safari.keepAwake)).toContain('not minimised');
    expect(text(safari.note!)).toContain("doesn't report memory");
  });

  it('never mixes in another browser, and has a generic version', () => {
    for (const b of ['edge', 'chrome', 'firefox', 'safari', 'other'] as const) {
      const all = [browserHelp(b, 'x.test').popups, browserHelp(b, 'x.test').keepAwake].map(text).join(' ');
      if (b !== 'edge') expect(all).not.toContain('edge://');
      if (b !== 'chrome') expect(all).not.toContain('chrome://');
      if (b !== 'firefox') expect(all).not.toContain('about:');
    }
    expect(text(browserHelp('other', '').popups)).toContain("your browser's site settings");
    expect(browserHelp('other', '').name).toBe('');
  });
});
