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
export const PHONE_NOTE = 'Searches run much faster on a computer; this phone can still run short ones.';
