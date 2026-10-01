/**
 * Set-up read from the address, applied once per page load.
 *
 * A panel that reads a link's parameters in its setup runs that code every time it mounts, and since
 * the planner's tabs that is every visit to its screen: the Egg Day link (`eggday=1&asc=...`) put its
 * boxes back over whatever the player had typed each time they came back to Highest TE by a date.
 * A reload is a fresh open of the link, so it applies again then.
 */
const taken = new Set<string>();

/** True the first time `key` is asked for in this page load, false after. */
export function firstTime(key: string): boolean {
  if (taken.has(key)) return false;
  taken.add(key);
  return true;
}
