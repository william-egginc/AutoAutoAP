/**
 * Which browser and OS this is, and the "Stepping away?" help that differs by them: how to allow the
 * watcher's pop-ups, how to keep a background tab awake, which key opens a link in the background.
 * Used by the run page (StepAwayOptions.vue) and the watcher (src/watch/main.ts), so it stays pure
 * and tiny: no Vue, no DOM beyond an optional `navigator` read.
 *
 * Advice only, never behaviour. `chrome://`, `edge://` and `about:` addresses can't be opened from a
 * web page, so they come back as `{ code }` parts for the page to show as text with a Copy button.
 */
import type { BrowserKind } from './browser';

export type OSKind = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'other';

export interface BrowserInfo {
  browser: BrowserKind;
  os: OSKind;
}

interface Brand {
  brand: string;
}

/** `navigator.userAgentData`, where the browser has it (Chromium only). */
interface UAData {
  brands?: readonly Brand[];
  platform?: string;
}

function browserFromBrands(brands: readonly Brand[] | undefined): BrowserKind | null {
  if (!brands?.length) return null;
  const names = brands.map(b => b.brand);
  if (names.includes('Microsoft Edge')) return 'edge';
  if (names.includes('Google Chrome')) return 'chrome';
  // Brave, Opera, Vivaldi...: Chromium with settings pages of their own.
  if (names.includes('Chromium')) return 'other';
  return null;
}

function browserFromUA(ua: string): BrowserKind {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'edge';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox';
  if (/OPR\/|Opera|Vivaldi|YaBrowser|SamsungBrowser/.test(ua)) return 'other';
  if (/Chrome\/|Chromium\/|CriOS\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'safari';
  return 'other';
}

function osFromPlatform(p: string | undefined): OSKind | null {
  if (!p) return null;
  if (/^mac/i.test(p)) return 'mac';
  if (/^win/i.test(p)) return 'windows';
  if (/android/i.test(p)) return 'android';
  if (/^ios/i.test(p)) return 'ios';
  if (/linux|chrome ?os|cros/i.test(p)) return 'linux';
  return null;
}

function osFromUA(ua: string): OSKind {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux|X11|CrOS/.test(ua)) return 'linux';
  return 'other';
}

/** The browser and OS, from `navigator.userAgentData` where it exists, else the user agent. */
export function detectBrowser(ua?: string, uaData?: UAData | null): BrowserInfo {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const agent = ua ?? nav?.userAgent ?? '';
  const data =
    uaData !== undefined ? uaData : ((nav as (Navigator & { userAgentData?: UAData }) | null)?.userAgentData ?? null);
  return {
    browser: browserFromBrands(data?.brands) ?? browserFromUA(agent),
    os: osFromPlatform(data?.platform) ?? osFromUA(agent),
  };
}

/** "Tip: ⌘-click it to open it in the background", or null where there is no such click (phones). */
export function backgroundOpenTip(os: OSKind): string | null {
  if (os === 'mac') return 'Tip: ⌘-click it to open it in the background.';
  if (os === 'windows' || os === 'linux') return 'Tip: Ctrl-click (or middle-click) it to open it in the background.';
  return null;
}

/** A line of help: plain text, and addresses to show as copyable code. */
export type HelpPart = string | { code: string };
export type HelpLine = HelpPart[];

export interface BrowserHelp {
  /** "Safari", "Chrome"...; '' when unknown. */
  name: string;
  /** How to allow this site's pop-ups (so the watcher can open, and reopen the run). */
  popups: HelpLine;
  /** How to keep the run's tab from being put to sleep in the background. */
  keepAwake: HelpLine;
  /** Anything else worth knowing in this browser. */
  note?: HelpLine;
}

const NAMES: Record<BrowserKind, string> = {
  edge: 'Edge',
  chrome: 'Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  other: '',
};

/** The help for one browser. `site` is this site's address (e.g. `example.com`), shown to copy. */
export function browserHelp(browser: BrowserKind, site: string): BrowserHelp {
  const add: HelpPart[] = site ? [' and add ', { code: site }, '.'] : [' and add this site.'];
  const enter: HelpPart[] = site ? [' and enter ', { code: site }, '.'] : [' and enter this site.'];
  const name = NAMES[browser];
  switch (browser) {
    case 'edge':
      return {
        name,
        popups: [
          'Allow pop-ups: open ',
          { code: 'edge://settings/content/popups' },
          ', press Add next to Allow',
          ...enter,
        ],
        keepAwake: [
          'Keep it awake: open ',
          { code: 'edge://settings/system' },
          ', find "Never put these sites to sleep", press Add',
          ...enter,
        ],
      };
    case 'chrome':
      return {
        name,
        popups: [
          'Allow pop-ups: open ',
          { code: 'chrome://settings/content/popups' },
          ', press Add next to "Allowed to send pop-ups"',
          ...enter,
        ],
        keepAwake: [
          'Keep it awake: open ',
          { code: 'chrome://settings/performance' },
          ', find "Always keep these sites active" (under Memory Saver), press Add',
          ...enter,
        ],
      };
    case 'firefox':
      return {
        name,
        popups: [
          'Allow pop-ups: Settings → Privacy & Security → Permissions → Block pop-up windows → Exceptions (',
          { code: 'about:preferences#privacy' },
          '),',
          ...add,
        ],
        keepAwake: [
          "Firefox doesn't put tabs to sleep by default, but it may unload one if the computer runs low on memory.",
        ],
      };
    case 'safari':
      return {
        name,
        popups: [
          'Allow pop-ups: Safari → Settings → Websites → Pop-up Windows, and set ',
          site ? { code: site } : 'this site',
          ' to Allow.',
        ],
        keepAwake: [
          "Safari pauses background tabs to save power: keep the run tab's window visible (not minimised), and keep the Mac awake and plugged in.",
        ],
        note: ["Safari doesn't report memory, so the black box records less about a crash."],
      };
    default:
      return {
        name,
        popups: [
          "Allow pop-ups for this site in your browser's site settings",
          ...(site ? [' (', { code: site }, ').'] : ['.']),
        ],
        keepAwake: ['If your browser puts background tabs to sleep, add this site to its list of sites to keep awake.'],
      };
  }
}
