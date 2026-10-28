/**
 * WHAT WENT WRONG ON THE PAGE, ONE LINE EACH (teleport2, 27 Oct 2026). Vue hands an error no component caught to
 * `app.config.errorHandler`; without one, a production build logs the bare error object (its message can hold a
 * player ID, a URL with an account's key) and nothing says where it came from. This logs one tagged line instead:
 * `[app] <name>: <message> (<where>)` and at most 3 stack lines, no ID, no URL query (lib/renderGuard.ts
 * `scrubErrorText`). Nothing is swallowed: every error still gets its line, as before it got Vue's. The instant
 * card's own guard (InstantGuard.ts) keeps its errors and its `[instant]` line; this is for everything else.
 *
 * Not covered by any handler: a throw inside Vue's post-flush step (a deferred Teleport's mount): Vue 3.5 runs those
 * without one. No Teleport here is deferred any more (composables/useTeleportTarget.ts).
 */
import type { App } from 'vue';
import { cardErrorOf } from './renderGuard';

/** Vue's own words for where it happened (development), or the error reference link's code (production). */
function whereOf(info: string): string {
  const code = info.match(/#runtime-(\d+)$/)?.[1];
  return code !== undefined ? `Vue code ${code}` : info;
}

/** The line(s) for one error: `[app] TypeError: … (component update)`, then up to 3 stack lines. */
export function appErrorLine(err: unknown, info = ''): string {
  const e = cardErrorOf(err, info);
  const where = whereOf(info);
  return [`[app] ${e.name}: ${e.message}${where ? ` (${where})` : ''}`, ...e.stack.map(l => `  ${l}`)].join('\n');
}

/** Every uncaught Vue error of `app` gets its line. */
export function installAppErrorLog(app: App): void {
  app.config.errorHandler = (err, _instance, info) => {
    console.error(appErrorLine(err, info));
  };
}
