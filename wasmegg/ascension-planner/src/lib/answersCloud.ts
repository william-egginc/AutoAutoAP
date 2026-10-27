/**
 * THE INSTANT ANSWER, SAVED ONLINE BESIDE THE FOLLOWED ROUTE (Jordan, 27 Oct 2026; contract
 * aaap-tools/notes/instantcloud-contract.md v1, the Collector's `/answers`). The page always shows the answer kept in
 * this browser first (InstantRoute.vue `showStale`); in a new browser or a private window, where nothing is kept, the
 * account's answer saved online is shown instead, marked "From <time>, checking…", until the fresh one is worked out.
 * A fresh answer, once kept here, is saved online (debounced; skipped when the same one is already there).
 *
 * The key is the account's follow key (lib/followCloud.ts `followKey`: SHA-256 of "aaap-follow-v1:" + the ID), never
 * the ID. The body is gzip of the snapshot's JSON (the Collector cannot look inside it), so every player ID pattern is
 * scrubbed BEFORE compressing (`scrubIds`), and a body that still holds one is never sent.
 *
 * Endpoints (the collector's own, from the submit URL): GET /answers?k= (the list), GET /answers/get?k=&e= (one gzip
 * body), PUT /answers?k=&e=&at= (body: gzip bytes), DELETE /answers?k=&e= (unused). 404 or 503: no answers saved online
 * here (an older collector): nothing more is asked on this page load. Every failure is quiet.
 *
 * Pure apart from `fetch` (injected), `CompressionStream`/`DecompressionStream` and timers.
 */
import { hasPlayerId } from './followCloud';
import { INSTANT_RULES } from '@/search/instantTables';

/** The contract's caps (v1). */
export const ANSWERS_MAX_GZ = 65_536;
export const ANSWERS_MAX_ENTRIES = 8;
export const ANSWERS_WRITES_PER_HOUR = 30;
/** How long after an answer is kept it is saved online (a newer one in the meantime replaces it). */
export const ANSWERS_DEBOUNCE_MS = 5000;

const ENTRY = /^[A-Za-z0-9._:-]{1,96}$/;
const isKey = (k: string) => /^[0-9a-f]{64}$/.test(k);

/** The collector's /answers endpoint from the submit URL ('' without a collector). */
export function answersUrlOf(submitUrl: string | null | undefined): string {
  const u = (submitUrl ?? '').trim();
  if (!u) return '';
  return /\/submit\/?$/.test(u) ? u.replace(/\/submit\/?$/, '/answers') : `${u.replace(/\/+$/, '')}/answers`;
}

/** Every player ID (EI + 16 digits, any case) in a text, replaced: keys and nested strings alike. */
export function scrubIds(text: string): string {
  return text.replace(/EI\d{16}/gi, 'EI-');
}

/** FNV-1a, hex: the entry key only has to tell answers apart. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193) >>> 0;
  return h.toString(16);
}

/** `target 490` -> `t490`, `date 1815670800` -> `d1815670800`; null for anything else. */
export function goalTagOf(goal: string): string | null {
  const m = /^(target|date) (\d{1,11})$/.exec(goal);
  return m ? `${m[1] === 'target' ? 't' : 'd'}${m[2]}` : null;
}

/**
 * The entry key: the goal, the save (its backup time), the answer's own key hashed (the save's TE and eggs, Your
 * setup, the filters) and the tables it was made from with INSTANT_RULES (search/instantTables.ts `tablesIdentity`,
 * hashed): `a1.t490.1790000000.1a2b3c4d.5e6f7a8b`. Null when the goal is not one kept.
 */
export function entryKeyOf(o: { goal: string; backupTime: number; snapKey: string; tables: string | null }): string | null {
  const tag = goalTagOf(o.goal);
  if (!tag) return null;
  const e = `a1.${tag}.${Math.max(0, Math.floor(o.backupTime) || 0)}.${fnv(o.snapKey)}.${fnv(o.tables ?? `rules=${INSTANT_RULES}`)}`;
  return ENTRY.test(e) ? e : null;
}
/** The goal tag of an entry key (`t490`), or null. */
export const entryGoalTag = (e: string): string | null => /^a1\.([td]\d{1,11})\./.exec(e)?.[1] ?? null;

/** What is saved online for one answer: the snapshot (the box, the rows, the legs) and the pricing record. */
export interface CloudAnswer<S = unknown, P = unknown> {
  v: 1;
  /** `target 490` / `date <unix>` (search/instantSnapshot.ts `instantGoal`). */
  goal: string;
  /** When the answer was kept, ms (the snapshot's `at`). */
  at: number;
  snap: S;
  /** lib/followEstimate.ts PricingRecord, or null when too big to go with it. */
  pricing: P | null;
}

/** A snapshot read back is drawn like one kept here: it must have what InstantRoute.vue `applySnapshot` reads. */
export function readCloudAnswer(x: unknown): CloudAnswer | null {
  const a = x as Partial<CloudAnswer> | null;
  if (!a || a.v !== 1 || typeof a.goal !== 'string' || typeof a.at !== 'number' || !Number.isFinite(a.at)) return null;
  const s = a.snap as { v?: number; at?: number; result?: unknown; header?: unknown } | null;
  if (!s || s.v !== 1 || typeof s.at !== 'number' || !s.result || !s.header) return null;
  return { v: 1, goal: a.goal, at: a.at, snap: s, pricing: a.pricing ?? null };
}

// ------------------------------------------------------------------------------------- gzip

const GZ = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function gzip(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined' || !GZ(bytes)) return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/**
 * The body to send: the answer's JSON with every ID scrubbed, gzipped, at most ANSWERS_MAX_GZ. Too big: without the
 * pricing record, then without the parts the box doesn't need (the nearest tables, the polish gains, the maxed what-if,
 * the search result); still too big, or no CompressionStream here: null (not sent). `json` is what was compressed.
 */
export async function encodeAnswer(a: CloudAnswer): Promise<{ bytes: Uint8Array; json: string } | null> {
  const tries: CloudAnswer[] = [a];
  if (a.pricing) tries.push({ ...a, pricing: null });
  const s = a.snap as Record<string, unknown>;
  tries.push({ ...a, pricing: null, snap: { ...s, bracket: null, gains: [], whatIf: null, search: null } });
  for (const t of tries) {
    const json = scrubIds(JSON.stringify(t));
    if (hasPlayerId(json)) return null;
    const bytes = await gzip(json);
    if (!bytes) return null;
    if (bytes.length <= ANSWERS_MAX_GZ) return { bytes, json };
  }
  return null;
}

/** A body read back: gunzipped, parsed and checked; null for anything else (or one holding an ID). */
export async function decodeAnswer(bytes: Uint8Array): Promise<CloudAnswer | null> {
  try {
    const text = await gunzip(bytes);
    if (!text || hasPlayerId(text)) return null;
    return readCloudAnswer(JSON.parse(text));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------- the calls

export interface AnswersResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  headers?: { get(name: string): string | null };
}
export type AnswersFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array }
) => Promise<AnswersResponse>;

/** `t490` as itself, `d<unix>` as the deadline's UTC date (`d2027-07-14`): the console lines' goal words. */
export function tagWords(tag: string): string {
  const m = /^d(\d+)$/.exec(tag);
  return m ? `d${new Date(Number(m[1]) * 1000).toISOString().slice(0, 10)}` : tag;
}

/**
 * The entry to serve for a goal (`AnswersClient.newestFor`): the exact entry key; else the newest of the same goal and
 * save; else the newest of the same goal; else, for a date goal, the newest whose deadline is within a day of it (the
 * same date read in another time zone). Null: none for this goal.
 */
export function pickEntry(
  list: readonly AnswersEntry[],
  want: { tag: string; e: string | null; backupTime: number | null }
): AnswersEntry | null {
  const exact = want.e ? list.find(x => x.e === want.e) : undefined;
  if (exact) return exact;
  const newest = (xs: AnswersEntry[]) => xs.sort((a, b) => b.at - a.at)[0] ?? null;
  const same = list.filter(x => entryGoalTag(x.e) === want.tag);
  const save = want.backupTime ? same.filter(x => entrySave(x.e) === Math.floor(want.backupTime!)) : [];
  if (save.length) return newest(save);
  if (same.length) return newest(same);
  const d = /^d(\d+)$/.exec(want.tag);
  if (!d) return null;
  const at = Number(d[1]);
  return newest(
    list.filter(x => {
      const m = /^d(\d+)$/.exec(entryGoalTag(x.e) ?? '');
      return !!m && Math.abs(Number(m[1]) - at) <= 86_400;
    })
  );
}
/** The save (backup time) of an entry key, or null. */
export const entrySave = (e: string): number | null => {
  const m = /^a1\.[td]\d{1,11}\.(\d+)\./.exec(e);
  return m ? Number(m[1]) : null;
};

export interface AnswersEntry {
  e: string;
  at: number;
  bytes: number;
  updatedAt: number;
}

/** What the client needs from the page: the key and URL (empty: none yet), a search running or starting. */
export interface AnswersEnv {
  key(): string;
  url(): string;
  busy(): boolean;
  /** Resolves once the key and the URL are known (the account's follow key is worked out after its save loads): a
   *  read asked before then waits for it instead of giving up (stores/answers.ts, at most a while). */
  whenReady?(): Promise<unknown>;
  /** Dev lines on the console ("[answers] …", never an ID or the key). */
  log?(line: string): void;
  fetch(): AnswersFetch | null;
  now?(): number;
}

/** An answer offered for saving online (InstantRoute.vue, once kept). */
export interface AnswerOffer {
  goal: string;
  backupTime: number;
  snapKey: string;
  tables: string | null;
  at: number;
  snap: unknown;
  pricing: unknown | null;
}

/**
 * The client, one per page load (stores/answers.ts holds it). Reads the list once per key and URL; reads a body only
 * when asked for a goal's (or any) answer; writes the newest offer `ANSWERS_DEBOUNCE_MS` after it, never while a
 * search runs or starts (tried again later), never the same entry and `at` twice, at most ANSWERS_WRITES_PER_HOUR an
 * hour (and not before a 429's retryAfter). A 404 or 503 turns it off for the page load.
 */
export class AnswersClient {
  /** No answers saved online here (404/503): nothing more is asked on this page load. */
  off = false;
  private listFor = '';
  /** Why the last list read gave nothing ('' when it answered): the console line says so. */
  private listWhy = '';
  private list: Promise<AnswersEntry[]> | null = null;
  private bodies = new Map<string, Promise<CloudAnswer | null>>();
  private synced = new Map<string, number>();
  private writes: number[] = [];
  private blockedUntil = 0;
  private pending: AnswerOffer | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Answers read back on this page load, newest first (My runs' pricing meanwhile). */
  readonly read: CloudAnswer[] = [];

  constructor(private env: AnswersEnv) {}

  private now(): number {
    return this.env.now ? this.env.now() : Date.now();
  }
  private ready(): { k: string; url: string; f: AnswersFetch } | null {
    if (this.off) return null;
    const k = this.env.key();
    const url = this.env.url();
    const f = this.env.fetch();
    return isKey(k) && url && f ? { k, url, f } : null;
  }
  private noted(status: number): void {
    if (status === 404 || status === 503) this.off = true;
  }

  /** The list of this account's answers saved online (newest first), read once per key and URL. */
  entries(): Promise<AnswersEntry[]> {
    const r = this.ready();
    if (!r) return Promise.resolve([]);
    const sig = `${r.k}|${r.url}`;
    if (this.list && this.listFor === sig) return this.list;
    this.listFor = sig;
    this.list = (async () => {
      try {
        // A plain call: the browser's fetch throws when called as a method of another object.
        const f = r.f;
        const res = await f(`${r.url}?k=${r.k}`, { method: 'GET' });
        if (!res.ok) {
          this.noted(res.status);
          this.listWhy = `the list answered ${res.status}`;
          return [];
        }
        this.listWhy = '';
        const body = (await res.json()) as { entries?: Partial<AnswersEntry>[] };
        const out: AnswersEntry[] = [];
        for (const x of body?.entries ?? [])
          if (x && typeof x.e === 'string' && ENTRY.test(x.e) && typeof x.at === 'number')
            out.push({ e: x.e, at: x.at, bytes: Number(x.bytes) || 0, updatedAt: Number(x.updatedAt) || 0 });
        out.sort((a, b) => b.at - a.at);
        for (const x of out) if (!this.synced.has(x.e)) this.synced.set(x.e, x.at);
        return out.slice(0, ANSWERS_MAX_ENTRIES);
      } catch {
        this.listWhy = 'the list could not be read (offline or blocked)';
        return [];
      }
    })();
    return this.list;
  }

  /** One entry's answer (read once per page load). */
  private body(e: string): Promise<CloudAnswer | null> {
    const have = this.bodies.get(e);
    if (have) return have;
    const p = (async () => {
      const r = this.ready();
      if (!r) return null;
      try {
        const f = r.f;
        const res = await f(`${r.url}/get?k=${r.k}&e=${encodeURIComponent(e)}`, { method: 'GET' });
        if (!res.ok) {
          this.noted(res.status);
          return null;
        }
        const a = await decodeAnswer(new Uint8Array(await res.arrayBuffer()));
        if (a && !this.read.some(x => x.at === a.at && x.goal === a.goal)) {
          this.read.push(a);
          this.read.sort((x, y) => y.at - x.at);
        }
        return a;
      } catch {
        return null;
      }
    })();
    this.bodies.set(e, p);
    return p;
  }

  /**
   * The answer saved online to show for a goal while it is worked out here (the stale slot: better than blank, marked
   * "From <time>, checking…"). The entry key holds this browser's Setup, save and tables, which another browser's
   * rarely match (its Setup still the default before /prefs lands, a newer save, other tables), so: the exact entry
   * when there is one, else this save's newest for the goal, else the newest for the goal; a date goal read in
   * another time zone (its deadline hours off), the nearest date within a day. Never another goal's.
   */
  async newestFor(want: { goal: string; e?: string | null; backupTime?: number | null }): Promise<CloudAnswer | null> {
    const tag = goalTagOf(want.goal);
    if (!tag) {
      this.say(`read skipped: goal not kept online (${want.goal.split(' ')[0]})`);
      return null;
    }
    if (!this.ready() && !this.off && this.env.whenReady) await this.env.whenReady();
    const why = this.notReady();
    if (why) {
      this.say(`read skipped: ${why}`);
      return null;
    }
    const list = await this.entries();
    const e = pickEntry(list, { tag, e: want.e ?? null, backupTime: want.backupTime ?? null });
    if (!e && this.listWhy) {
      this.say(`read skipped: ${this.listWhy}`);
      return null;
    }
    if (!e) {
      if (!this.off) this.say(`no saved answer online for this save and setup (entries: ${list.length}, goal: ${tagWords(tag)})`);
      else this.say('read skipped: no answers saved online on this collector (404 or 503)');
      return null;
    }
    const a = await this.body(e.e);
    if (a) this.say(`served cloud answer ${fnv(e.e).slice(0, 6)} from ${new Date(a.at).toISOString()}`);
    else this.say(`read skipped: the answer ${fnv(e.e).slice(0, 6)} could not be read back`);
    return a;
  }

  private say(line: string): void {
    try {
      this.env.log?.(`[answers] ${line}`.replace(/EI\d{16}/gi, 'EI-'));
    } catch {
      // never a reason to fail
    }
  }
  private notReady(): string {
    if (this.off) return 'no answers saved online on this collector (404 or 503)';
    if (!isKey(this.env.key())) return 'no account key yet';
    if (!this.env.url()) return 'no collector';
    if (!this.env.fetch()) return 'no fetch here';
    return '';
  }

  /** The newest answer saved online of any goal, or null. */
  async newestAny(): Promise<CloudAnswer | null> {
    const list = await this.entries();
    return list[0] ? this.body(list[0].e) : null;
  }

  /** Save this answer online soon (the newest offer wins). */
  offer(o: AnswerOffer): void {
    if (this.off) return;
    this.pending = o;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ANSWERS_DEBOUNCE_MS);
  }

  /** The pending offer, written now if it may be. Exposed for specs. */
  async flush(): Promise<'sent' | 'skipped' | 'later' | 'failed'> {
    const o = this.pending;
    if (!o) return 'skipped';
    const r = this.ready();
    if (!r) return 'skipped';
    // A search running or starting has the page: again once more later.
    if (this.env.busy()) {
      this.offer(o);
      return 'later';
    }
    const e = entryKeyOf(o);
    if (!e) {
      this.pending = null;
      return 'skipped';
    }
    await this.entries();
    if (this.pending !== o) return 'skipped';
    if (this.synced.get(e) === o.at) {
      this.pending = null;
      return 'skipped';
    }
    const now = this.now();
    this.writes = this.writes.filter(t => now - t < 3600_000);
    if (this.writes.length >= ANSWERS_WRITES_PER_HOUR || now < this.blockedUntil) {
      this.pending = null;
      return 'skipped';
    }
    const body = await encodeAnswer({ v: 1, goal: o.goal, at: o.at, snap: o.snap, pricing: o.pricing });
    this.pending = null;
    if (!body) return 'skipped';
    this.writes.push(now);
    try {
      const f = r.f;
      const res = await f(`${r.url}?k=${r.k}&e=${encodeURIComponent(e)}&at=${Math.round(o.at)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: body.bytes,
      });
      if (!res.ok) {
        this.noted(res.status);
        if (res.status === 429) {
          let after = 3600;
          try {
            const j = (await res.json()) as { retryAfter?: number };
            if (typeof j?.retryAfter === 'number') after = j.retryAfter;
          } catch {
            // no body
          }
          this.blockedUntil = now + after * 1000;
        }
        return 'failed';
      }
      this.synced.set(e, o.at);
      // The list as the collector now holds it: this entry newest, the oldest beyond ANSWERS_MAX_ENTRIES dropped (it
      // evicts the least recently written itself).
      const prev = this.list ? await this.list : [];
      const entry: AnswersEntry = { e, at: o.at, bytes: body.bytes.length, updatedAt: now };
      this.list = Promise.resolve([entry, ...prev.filter(x => x.e !== e)].slice(0, ANSWERS_MAX_ENTRIES));
      return 'sent';
    } catch {
      return 'failed';
    }
  }
}
