/**
 * A phone or a small machine (the integrator, 7 Oct): there the instant answer keeps to the answer
 * itself. It uses two route workers, skips the background polish and the nearest tables above and
 * below (each holds more tables in memory), and runs the full simulator's check only when asked,
 * since that uses every core for a minute or more. A mobile browser (an iPad says Macintosh but has a
 * touch screen), 4 GB of memory or less (`navigator.deviceMemory`, where the browser says), or 2 cores
 * or fewer. Not 4: browsers report 4 for many desktops (headless Chrome on an 8-thread Mac does).
 */
export function isSmallDevice(
  nav: Partial<Navigator> & { deviceMemory?: number } = globalThis.navigator ?? {}
): boolean {
  const ua = nav.userAgent ?? '';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 2) return true;
  return false;
}

/**
 * Safari (on the Mac, an iPad or an iPhone), not Chrome, Edge or Firefox, which all say "Safari" too: the same
 * test as SafariNotice.vue. Safari reloads a tab at a much lower memory level than Chrome ("This webpage was
 * reloaded because it was using significant memory": By a date with hours on, egg-beta, 22 Oct 2026), so the
 * instant answer keeps its route workers' memory smaller there (search/sweepCache.ts). Works in a worker too.
 */
export function isSafari(nav: Partial<Navigator> = globalThis.navigator ?? {}): boolean {
  const ua = nav.userAgent ?? '';
  return /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|android/i.test(ua);
}

/** Workers for the instant answer's Check exactly and Light on Safari: at most three (22 Oct 2026), so with the
 *  route workers asleep the tab never runs more than three simulators at once. Each route is priced the same on any
 *  worker; fewer only take longer. */
export const SAFARI_CHECK_WORKERS = 3;

/** The worker count Check exactly and Light ask for: `want`, at most three on Safari. */
export function checkWorkers(want: number, safari: boolean = isSafari()): number {
  return Math.max(1, safari ? Math.min(want, SAFARI_CHECK_WORKERS) : want);
}

/**
 * A phone (not a tablet or a computer), for the note beside Find that searches run much faster on a
 * computer (the user, 12 Oct 2026): a phone's user agent, or a touch-first screen narrower than a
 * tablet (pointer: coarse and under 768 px).
 */
export function isPhone(
  nav: Partial<Navigator> = globalThis.navigator ?? {},
  win: { innerWidth?: number; matchMedia?: (q: string) => { matches: boolean } } = (globalThis as never) ?? {}
): boolean {
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

/** The note itself. */
export const PHONE_NOTE = 'Searches run much faster on a computer. This phone can still run short ones.';

/**
 * What to call the player's machine in a sentence (Jordan, 16 Oct 2026): "Saved on this phone" on a
 * phone, "this computer" on a computer, rather than "this computer" or "this device" for everyone.
 * A tablet (an iPad, which may say Macintosh but has a touch screen, or an Android without "Mobile")
 * is "this tablet". `isPhone` decides the phone, so this and PHONE_NOTE never disagree. Read once per
 * call: cheap, and nothing to keep in step when a window is resized.
 */
export type DeviceWord = 'phone' | 'tablet' | 'computer';

export function deviceWord(
  nav: Partial<Navigator> = globalThis.navigator ?? {},
  win: { innerWidth?: number; matchMedia?: (q: string) => { matches: boolean } } = (globalThis as never) ?? {}
): DeviceWord {
  if (isPhone(nav, win)) return 'phone';
  const ua = nav.userAgent ?? '';
  if (/iPad|Tablet|Android/i.test(ua)) return 'tablet';
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'tablet';
  return 'computer';
}

/** "this phone" / "this tablet" / "this computer", for the middle of a sentence. */
export function thisDevice(...args: Parameters<typeof deviceWord>): string {
  return `this ${deviceWord(...args)}`;
}

/** "This phone" / "This tablet" / "This computer", to start one (or as a heading). */
export function ThisDevice(...args: Parameters<typeof deviceWord>): string {
  return `This ${deviceWord(...args)}`;
}
