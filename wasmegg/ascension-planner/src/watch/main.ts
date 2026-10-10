/**
 * watch.html's entry: two small pages in one address.
 *
 *  - `watch.html` alone is the second-tab watcher ("Watch this run from a second tab and reopen it",
 *    src/watch/local.ts), which reads the run tab's heartbeat from this site's localStorage.
 *  - `watch.html?k=<watch key>` is the phone page ("Watch this run from your phone",
 *    src/watch/phone.ts), which reads the run's heartbeat from the collector.
 *
 * Each is loaded only when it is the one asked for, so neither carries the other.
 */
const key = new URLSearchParams(location.search).get('k');
if (key) void import('./phone').then(m => m.startPhone(key));
else void import('./local');
