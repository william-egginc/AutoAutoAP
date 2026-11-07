/**
 * The phone link's `<id>.<secret>`. watch.html's inline head script takes it out of the address before anything else
 * runs (so it is not in the address bar, nor in what any later script reads from location) and keeps it for this tab,
 * in sessionStorage or, where that throws, in memory; a reload of the tab still has it. A new link pasted over the
 * page (hashchange) is taken the same way when this is called. Falls back to the address's own fragment when the head
 * script did not run (a CSP that refused it, or a spec).
 */
type Held = { aaapWatchLink?: () => string };

export function watchFragment(): string {
  const take = typeof window === 'undefined' ? undefined : (window as unknown as Held).aaapWatchLink;
  if (typeof take === 'function') return take();
  return location.hash.replace(/^#/, '');
}
