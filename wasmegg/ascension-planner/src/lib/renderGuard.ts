/**
 * NEVER NOTHING, AT THE VUE LAYER (Jordan's Safari shot, 24 Oct 2026: By a date with the instant answer's Hide
 * pill and nothing under it, while Nearby routes read the answer it had found). Every state of the instant card
 * says something (InstantRoute.states.spec.ts), but a component whose render throws is drawn as nothing by Vue in a
 * production build, with one console line no player sees; a throw while it updates leaves it as it was, or half
 * drawn. InstantGuard.ts catches those for the card in its slot and says so instead.
 *
 * No Vue here: the decision alone, for the spec.
 */

/** What the guard shows in place of a card that couldn't be drawn. Player words: no "table", no raw error. */
export const INSTANT_FAILED =
  'The instant answer couldn’t be shown: something went wrong drawing it on this page. Show it again, or use Fast, Exact or Custom below.';

/**
 * Whether a Vue error (`errorCaptured`'s third argument) is the component failing to draw itself: its setup
 * (0), its render (1) or its update (15, a patch that threw). Development builds name them; production builds give
 * a link ending in the code (runtime-core `handleError`). Event handlers, watchers and lifecycle hooks are not:
 * the card still shows, so they go on to the page's usual handling.
 */
export function isRenderFailure(info: string): boolean {
  if (/^(setup function|render function|component update)$/.test(info)) return true;
  return /#runtime-(0|1|15)$/.test(info);
}

/**
 * WHAT WENT WRONG, KEPT (crash2, 26 Oct 2026: Jordan's fresh Chrome showed the message and nobody could tell what
 * threw). The caught error's name and message, where it happened (setup, drawing, update) and at most 3 lines of its
 * stack, each cut short. Never an ID: any EI and 16 digits is replaced, and a URL loses its query (`?k=…` is an
 * account's key). Shown in the guard's closed "Details" fold and logged once.
 */
export interface CardError {
  name: string;
  message: string;
  where: string;
  stack: string[];
}

const ID_ANYWHERE = /EI\d{16}/gi;
/** A URL (or a path) and its query: the query goes, the address stays. */
const URL_QUERY = /((?:[a-z][a-z0-9+.-]*:\/\/|\/)[^\s?#'"()]*)\?[^\s#'"()]*/gi;
const MAX_MESSAGE = 300;
const MAX_LINE = 200;
const MAX_STACK_LINES = 3;

/** A text with no ID and no URL query. */
export function scrubErrorText(text: string): string {
  return String(text ?? '')
    .replace(ID_ANYWHERE, 'EI…')
    .replace(URL_QUERY, '$1');
}
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Where the card failed, in plain words, from `errorCaptured`'s info (development words or production codes). */
function whereOf(info: string): string {
  if (/^setup function$|#runtime-0$/.test(info)) return 'setting up';
  if (/^render function$|#runtime-1$/.test(info)) return 'drawing';
  if (/^component update$|#runtime-15$/.test(info)) return 'updating';
  return '';
}

export function cardErrorOf(err: unknown, info = ''): CardError {
  const e = err as { name?: unknown; message?: unknown; stack?: unknown } | null;
  const isObj = !!e && typeof e === 'object';
  const name = cut(scrubErrorText(isObj && typeof e.name === 'string' && e.name ? e.name : 'Error'), 60);
  const message = cut(scrubErrorText(isObj && e.message !== undefined ? String(e.message) : String(err)), MAX_MESSAGE);
  const raw = isObj && typeof e.stack === 'string' ? e.stack : '';
  const head = isObj ? `${String(e.name ?? '')}: ${String(e.message ?? '')}` : '';
  const stack = raw
    .split('\n')
    .map(l => l.trim())
    // V8 starts with "Name: message" (one line or more); Safari and Firefox with the first frame.
    .filter(l => l && !head.startsWith(l) && !l.startsWith(head))
    .slice(0, MAX_STACK_LINES)
    .map(l => cut(scrubErrorText(l), MAX_LINE));
  return { name, message, where: whereOf(info), stack };
}

/** The fold's text: "TypeError: … (while updating)", then the stack lines. */
export function cardErrorText(e: CardError): string {
  return [`${e.name}: ${e.message}${e.where ? ` (while ${e.where})` : ''}`, ...e.stack].join('\n');
}

/** The console line: one short tagged line, no stack, no ID. */
export function cardErrorLog(e: CardError): string {
  return `[instant] card could not be drawn: ${e.name}: ${e.message}`;
}
