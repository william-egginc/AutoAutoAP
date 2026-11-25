/**
 * The "which table answered" ping, the page's side (R10.1, Jordan, 25 Nov 2026; shape agreed with the collector, which
 * pins the same TE list): on by default, off with the Setup tick (`shareTableUse`), and a stored No or a Withdraw stays
 * off. One tiny POST to the collector's `/tablepick`, text/plain, once a day per browser per combination, so counts are
 * answers shown (browser-days), never players:
 *
 *   { kind: own|gear|delivery|maxed, answered?, delivery?, noTable?, te, build }
 *
 *  - `answered`: the delivery key whose table answered, only for kind delivery. `delivery`: the player's own delivery
 *    key (every kind, when known: what shows which tables are missing). `noTable`: no table is listed for their set.
 *  - `te`: the largest of TE_EDGES at or below the player's TE (the collector refuses any other number).
 *  - NO player ID, account code, hash, gear stamp, table file name or timestamp. Every value is checked against the
 *    collector's own patterns here and a bad one is left out (a bad kind, TE or delivery-kind key sends nothing).
 *
 * Never touches the answer: nothing is awaited, errors are swallowed, the collector's answer is ignored (it is 204 for
 * success and caps, 400 for a probe).
 */
import { consentAgreed } from '@/composables/useConsent';

/** The collector's fixed lower edges (worker code holds the same list; its table edges are 75, 150 and 340). */
export const TE_EDGES = [0, 50, 75, 100, 125, 150, 200, 250, 300, 340, 400] as const;

export type PickKind = 'own' | 'gear' | 'delivery' | 'maxed';
const KINDS: readonly PickKind[] = ['own', 'gear', 'delivery', 'maxed'];

/** collector/worker.js DELIVERY_KEY (a set key). */
const SET_KEY = /^[A-Za-z0-9_-]{1,24}$/;
const BUILD_RE = /^[A-Za-z0-9:._-]{1,40}$/;
const HAS_ID = /EI\d{16}/i;
const setKey = (v: unknown): v is string => typeof v === 'string' && SET_KEY.test(v) && !HAS_ID.test(v);

export interface PickInput {
  kind: PickKind;
  /** The delivery set whose table answered (kind delivery). */
  answered?: string;
  /** The player's own delivery set, when known. */
  delivery?: string | null;
  noTable?: boolean | null;
  /** The TE the answer was worked out for. */
  te: number;
  build: string;
}

export interface TablePick {
  kind: PickKind;
  answered?: string;
  delivery?: string;
  noTable?: boolean;
  te: number;
  build: string;
}

/** The largest edge at or below `te`; null for a TE that is not a finite number of 0 or more. */
export function teEdge(te: number): number | null {
  if (typeof te !== 'number' || !Number.isFinite(te) || te < 0) return null;
  let edge = 0;
  for (const e of TE_EDGES) if (te >= e) edge = e;
  return edge;
}

/** The ping's body, or null when there is nothing valid to say. */
export function tablePickOf(i: PickInput): TablePick | null {
  if (!KINDS.includes(i.kind)) return null;
  const te = teEdge(i.te);
  if (te === null) return null;
  if (i.kind === 'delivery' && !setKey(i.answered)) return null;
  const stamp = typeof i.build === 'string' && BUILD_RE.test(i.build) && !HAS_ID.test(i.build) ? i.build : 'unknown';
  return {
    kind: i.kind,
    ...(i.kind === 'delivery' ? { answered: i.answered as string } : {}),
    ...(setKey(i.delivery) ? { delivery: i.delivery } : {}),
    ...(typeof i.noTable === 'boolean' ? { noTable: i.noTable } : {}),
    te,
    build: stamp,
  };
}

/** The collector's /tablepick, made from its /submit (as `instantUrlOf`); '' with no collector. */
export function tablePickUrlOf(submitUrl: string): string {
  return /\/submit\/?$/.test(submitUrl) ? submitUrl.replace(/\/submit\/?$/, '/tablepick') : '';
}

/** The day a ping counts for: UTC, as the collector counts. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const TABLE_PICK_SEEN_KEY = 'aap.tablepick.seen';
const MAX_SEEN = 200;

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
let memory: { d: string; k: string[] } = { d: '', k: [] };

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Seen today? Records it when not. Kept in this browser as the day and the combinations only; in memory when storage is blocked. */
function firstToday(st: StorageLike | null, day: string, key: string): boolean {
  let from: { d: string; k: string[] } = memory;
  try {
    if (st) {
      const o = JSON.parse(st.getItem(TABLE_PICK_SEEN_KEY) || 'null') as { d?: unknown; k?: unknown } | null;
      from = o && typeof o.d === 'string' && Array.isArray(o.k) ? { d: o.d, k: o.k.filter((x): x is string => typeof x === 'string') } : { d: '', k: [] };
    }
  } catch {
    from = memory; // blocked or unreadable: this visit's memory
  }
  const cur = from.d === day ? from : { d: day, k: [] as string[] };
  if (cur.k.includes(key)) return false;
  const next = { d: day, k: [...cur.k, key].slice(-MAX_SEEN) };
  memory = next;
  try {
    st?.setItem(TABLE_PICK_SEEN_KEY, JSON.stringify(next));
  } catch {
    // blocked: once per visit from memory
  }
  return true;
}

const TIMEOUT_MS = 4000;
function postText(url: string, body: string): void {
  try {
    if (typeof fetch !== 'function') return;
    const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    const p = fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit', ...(signal ? { signal } : {}) });
    if (p && typeof (p as Promise<unknown>).catch === 'function') (p as Promise<unknown>).catch(() => undefined);
  } catch {
    // a failed send changes nothing
  }
}

const isOnline = (): boolean => {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
};

export interface SendOptions {
  /** The collector's /tablepick ('' for none). */
  url: string;
  /** The account's `shareTableUse` consent (the default). */
  enabled?: () => boolean;
  now?: () => number;
  storage?: StorageLike | null;
  post?: (url: string, body: string) => void;
  online?: () => boolean;
}

/** Tell the collector which table answered. True when a ping went out; never throws, never waits. */
export function sendTablePick(i: PickInput, o: SendOptions): boolean {
  try {
    if (!o.url) return false;
    if (!(o.enabled ?? (() => consentAgreed('shareTableUse')))()) return false;
    if (!(o.online ?? isOnline)()) return false;
    const pick = tablePickOf(i);
    if (!pick) return false;
    const body = JSON.stringify(pick);
    if (body.length > 256) return false;
    const key = [pick.kind, pick.answered ?? '', pick.delivery ?? '', pick.noTable === undefined ? '' : pick.noTable ? '1' : '0', pick.te, pick.build].join('|');
    if (!firstToday(o.storage === undefined ? defaultStorage() : o.storage, dayOf((o.now ?? Date.now)()), key)) return false;
    (o.post ?? postText)(o.url, body);
    return true;
  } catch {
    return false;
  }
}

/** For specs: forget what this visit has seen. */
export function resetTablePickMemory(): void {
  memory = { d: '', k: [] };
}
