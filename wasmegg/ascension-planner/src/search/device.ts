/**
 * A phone or a small machine (the integrator, 7 Oct): there the instant answer keeps to the answer
 * itself. It uses two route workers, skips the background polish and the nearest tables above and
 * below (each holds more tables in memory), and runs the full simulator's check only when asked,
 * since that uses every core for a minute or more. A mobile browser, 4 GB of memory or less
 * (`navigator.deviceMemory`, where the browser says), or 4 cores or fewer.
 */
export function isSmallDevice(
  nav: Partial<Navigator> & { deviceMemory?: number } = globalThis.navigator ?? {}
): boolean {
  const ua = nav.userAgent ?? '';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true;
  return false;
}
