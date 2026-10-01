/**
 * Which browser this is, for advice that differs by browser (keeping a long search running in a
 * background tab). From the user agent, which is all a page has; good enough for advice, never for
 * behaviour. The order matters: Edge and Chrome both say "Chrome", Chrome on iOS says "Safari".
 */
export type BrowserKind = 'safari' | 'chrome' | 'edge' | 'firefox' | 'other';

export function browserKind(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): BrowserKind {
  if (/edg(e|a|ios)?\//i.test(ua)) return 'edge';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/chrome|chromium|crios/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua) && !/android/i.test(ua)) return 'safari';
  return 'other';
}
