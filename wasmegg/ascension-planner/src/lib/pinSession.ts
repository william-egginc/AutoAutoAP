/**
 * THE PIN SESSION this browser holds (collector/pin.js): once an account has a PIN, every cloud request for it needs the header
 * `x-aaap-session`. `wrap` puts it on the requests of the account that has one (the key `k` is in the URL or the JSON body), never on another
 * account's, never in a URL. A 401 means "pin required": the session (if any) was refused, so it is dropped and the account is `locked` until
 * the player enters the PIN (UI). Kept in localStorage per account (a 30-day session: a reload must not ask again); the PIN, `pk` and the recovery
 * code are never kept here. Any other failure (429, 5xx, offline) neither locks nor drops it.
 */
import { ref } from 'vue';

export interface PinSession {
  session: string;
  /** ms since 1970. */
  expires: number;
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Init = { headers?: Record<string, string>; body?: unknown; method?: string } & Record<string, unknown>;

const SESSION_RE = /^v1\.\d{10,16}\.\d{1,9}\.[0-9a-f]{64}$/;
const KEY_RE = /^[0-9a-f]{64}$/;
/** The PIN calls that carry the pk or need no login: no session header (a refused one is the caller's answer, not a lock). */
const NO_SESSION_ROUTES = /\/pin\/(status|verify|set|recover|reset)$/;
const HEADER = 'x-aaap-session';

export function createPinSessions(o: { storage: StorageLike | null; now?: () => number }) {
  const now = o.now ?? Date.now;
  const st = o.storage;
  const key = (k: string) => `aap.pinSession.${k.slice(0, 16)}`;
  const mem = new Map<string, PinSession>();
  /** The accounts that answered 401: reactive, for the card that asks for the PIN. */
  const lockedKeys = ref<string[]>([]);
  const lockedFlag = (k: string, on: boolean): void => {
    const has = lockedKeys.value.includes(k);
    if (on && !has) lockedKeys.value = [...lockedKeys.value, k];
    if (!on && has) lockedKeys.value = lockedKeys.value.filter(x => x !== k);
  };
  const valid = (s: unknown): s is PinSession => !!s && typeof s === 'object' && typeof (s as PinSession).session === 'string' && SESSION_RE.test((s as PinSession).session) && Number.isFinite((s as PinSession).expires);

  function set(k: string, s: PinSession): void {
    if (!KEY_RE.test(k) || !valid(s)) return;
    mem.set(k, { session: s.session, expires: s.expires });
    lockedFlag(k, false);
    try {
      st?.setItem(key(k), JSON.stringify({ k, session: s.session, expires: s.expires }));
    } catch {
      // kept for this visit only
    }
  }
  function clear(k: string): void {
    mem.delete(k);
    try {
      st?.removeItem(key(k));
    } catch {
      // nothing kept
    }
  }
  function get(k: string): PinSession | null {
    let s: PinSession | null | undefined = mem.get(k);
    if (!s) {
      try {
        const raw = JSON.parse(st?.getItem(key(k)) ?? 'null') as { k?: string; session?: string; expires?: number } | null;
        if (raw && raw.k === k && valid(raw)) s = { session: raw.session as string, expires: raw.expires as number };
      } catch {
        s = null;
      }
      if (s) mem.set(k, s);
    }
    if (!s) return null;
    if (s.expires <= now()) {
      clear(k);
      return null;
    }
    return s;
  }
  const locked = (k: string): boolean => lockedKeys.value.includes(k);

  function keyOf(url: string, init?: Init): string | null {
    try {
      const k = new URL(url, 'https://x.invalid').searchParams.get('k');
      if (k && KEY_RE.test(k)) return k;
    } catch {
      // not a URL we can read
    }
    if (typeof init?.body === 'string' && init.body.startsWith('{')) {
      try {
        const k = (JSON.parse(init.body) as { k?: unknown }).k;
        if (typeof k === 'string' && KEY_RE.test(k)) return k;
      } catch {
        // not JSON
      }
    }
    return null;
  }

  /** `f` with the session header added for the account in the request, and a 401 noted. Null stays null. */
  function wrap<F>(f: F): F;
  function wrap<F>(f: F | null): F | null;
  function wrap<F>(f: F | null): F | null {
    if (!f) return null;
    const inner = f as unknown as (url: string, init?: Init) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
    return (async (url: string, init?: Init) => {
      const k = keyOf(url, init);
      const route = (() => {
        try {
          return new URL(url, 'https://x.invalid').pathname;
        } catch {
          return '';
        }
      })();
      const plain = NO_SESSION_ROUTES.test(route);
      const s = k && !plain ? get(k) : null;
      const res = await inner(url, s ? { ...init, headers: { ...(init?.headers ?? {}), [HEADER]: s.session } } : init);
      if (res.status === 401 && k && !plain) {
        clear(k);
        lockedFlag(k, true);
      }
      return res;
    }) as unknown as F;
  }

  return { set, get, clear, locked, wrap };
}
export type PinSessions = ReturnType<typeof createPinSessions>;

// ------------------------------------------------------------------------------------------------ this page's instance
let page: PinSessions | null = null;
export function pinSessions(): PinSessions {
  if (!page) {
    let storage: StorageLike | null = null;
    try {
      storage = typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      storage = null;
    }
    page = createPinSessions({ storage });
  }
  return page;
}
/** Specs: a new page load. */
export function resetPinSessions(): void {
  page = null;
}
