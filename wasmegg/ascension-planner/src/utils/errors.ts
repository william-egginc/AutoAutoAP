/**
 * Turn what the browser throws into something a player can act on.
 *
 * Browsers report a lost connection as `TypeError: Failed to fetch` (Chrome), `NetworkError when
 * attempting to fetch resource` (Firefox) or `Load failed` (Safari), and a worker whose code could
 * not be downloaded as a failed dynamic import. None of those says "you are offline", and none says
 * whether anything was lost -- which is the first thing anyone wants to know. Plain `e.message`
 * went straight to the screen in half a dozen places; they all come through here now.
 *
 * No Vue, no stores: the Explorer page uses this too.
 */

const NETWORK = /failed to fetch|networkerror|load failed|network ?request failed|the internet connection appears to be offline|err_internet_disconnected/i;
const CODE_DOWNLOAD = /dynamically imported module|importing a module script failed|failed to load module script|importscripts|error loading dynamically/i;
const MEMORY = /out of memory|allocation failed|array buffer allocation|invalid array length|maximum call stack/i;

export type ErrorKind = 'network' | 'code-download' | 'memory' | 'other';

export function errorKind(e: unknown): ErrorKind {
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (CODE_DOWNLOAD.test(text)) return 'code-download';
  if (NETWORK.test(text)) return 'network';
  if (MEMORY.test(text)) return 'memory';
  return 'other';
}

function rawMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * A fetch that failed, reading `what` ("the collector", "that run's table"). Known network failures
 * become one plain sentence; anything else keeps its own message, which is usually already specific
 * (a status code, a parse error).
 */
export function describeFetchError(e: unknown, what: string): string {
  switch (errorKind(e)) {
    case 'network':
      return `Could not reach ${what}: this computer looks to be offline, or the address is wrong. Check the connection and try again.`;
    default:
      return rawMessage(e);
  }
}

/**
 * A search that stopped with an exception. Every run checkpoints what it has priced, so the most
 * useful thing to say after "what happened" is that pressing Start again resumes rather than
 * restarts.
 */
export function describeRunError(e: unknown): string {
  switch (errorKind(e)) {
    case 'code-download':
    case 'network':
      return 'The connection dropped while the search was starting its workers, so their code could not be downloaded. Reconnect and press Start again: anything already priced is saved and will not be redone.';
    case 'memory':
      return 'The browser ran out of memory. Give the search fewer workers (or close other tabs) and press Start again: anything already priced is saved and will not be redone.';
    default:
      return rawMessage(e);
  }
}
