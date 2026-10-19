/**
 * What to call the player's machine in a sentence ("this phone" / "this tablet" / "this computer"),
 * ported in small from the AutoAutoAP fork (search/device.ts, Jordan 16 Oct 2026). A phone: a phone's
 * user agent, or a touch-first screen narrower than a tablet. A tablet: an iPad (which may say
 * Macintosh but has a touch screen) or an Android without "Mobile".
 */
type Win = { innerWidth?: number; matchMedia?: (q: string) => { matches: boolean } };

export type DeviceWord = 'phone' | 'tablet' | 'computer';

export function isPhone(nav: Partial<Navigator> = globalThis.navigator ?? {}, win: Win = (globalThis as never) ?? {}): boolean {
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPod|Android.+Mobile|Mobi/i.test(ua)) return true;
  let coarse = false;
  try {
    coarse = !!win.matchMedia?.('(pointer: coarse)').matches;
  } catch {
    coarse = false;
  }
  return coarse && typeof win.innerWidth === 'number' && win.innerWidth < 768;
}

export function deviceWord(nav: Partial<Navigator> = globalThis.navigator ?? {}, win: Win = (globalThis as never) ?? {}): DeviceWord {
  if (isPhone(nav, win)) return 'phone';
  const ua = nav.userAgent ?? '';
  if (/iPad|Tablet|Android/i.test(ua)) return 'tablet';
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'tablet';
  return 'computer';
}

/** "this phone" / "this tablet" / "this computer". */
export function thisDevice(...args: Parameters<typeof deviceWord>): string {
  return `this ${deviceWord(...args)}`;
}
