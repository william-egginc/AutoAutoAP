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
