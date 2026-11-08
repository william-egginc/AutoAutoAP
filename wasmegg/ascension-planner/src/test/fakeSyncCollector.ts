/**
 * A fake collector for the synced records and "Delete everything" (lib/syncedRecords.ts), after collector/sync.js on
 * branch spec-sync (read only): records kept per key `k`, last write wins by the client's `at` (an older `at` is 409
 * with the stored record as `latest`, its value for override and ticks), the same content is `unchanged`, an `at`
 * over 10 minutes ahead of its clock is 400. `mode` makes every call answer one way: 'old' (404: a collector with no
 * /sync or /forget), 'limit' (429 with retryAfter), 'off' (503), 'offline' (fetch throws). /forget deletes the key's
 * records and counts them, plus the follows, prefs and answers the spec says the key had. Every call and body is kept
 * (`calls`) so a spec can check that none holds a player ID. Specs only.
 */
const ID = /EI\d{16}/i;

export interface FakeRecord {
  at: number;
  updated: number;
  /** JSON text (override, ticks), or the plan's gzip bytes. */
  data: string | Uint8Array;
}
export interface FakeCall {
  method: string;
  url: string;
  body?: string;
  /** A binary body (the plan's gzip). */
  bytes?: Uint8Array;
  keepalive?: boolean;
}
const sameData = (a: string | Uint8Array, b: string | Uint8Array) =>
  typeof a === 'string' || typeof b === 'string' ? a === b : a.length === b.length && a.every((x, i) => x === b[i]);

export function fakeSyncCollector(base = 'https://collector.example') {
  const records = new Map<string, Map<string, FakeRecord>>();
  const other = new Map<string, { follows: number; prefs: number; answers: number }>();
  const calls: FakeCall[] = [];
  const state = { skewMs: 0, mode: 'ok' as 'ok' | 'old' | 'limit' | 'off' | 'offline', retryAfter: 120, forgetMode: 'ok' as 'ok' | 'old' | '405' | 'limit' | 'offline' };
  const of = (k: string) => {
    if (!records.has(k)) records.set(k, new Map());
    return records.get(k)!;
  };
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    json: async () => (body instanceof Uint8Array ? JSON.parse('x') : typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    arrayBuffer: async () => (body instanceof Uint8Array ? body.slice().buffer : new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)).buffer),
  });
  async function f(url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; keepalive?: boolean }) {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const bytes = init?.body instanceof Uint8Array ? init.body : undefined;
    calls.push({ method, url, ...(body !== undefined ? { body } : {}), ...(bytes ? { bytes } : {}), ...(init?.keepalive ? { keepalive: true } : {}) });
    const u = new URL(url);
    const isForget = u.pathname === '/forget';
    const mode = isForget ? state.forgetMode : state.mode;
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    if (mode === 'old') return reply(404, { error: 'not found' });
    if (mode === '405') return reply(405, { error: 'method not allowed' });
    if (mode === 'limit') return reply(429, { error: 'slow down', retryAfter: state.retryAfter }, { 'retry-after': String(state.retryAfter) });
    if (mode === 'off') return reply(503, { error: 'not set up' });
    if (ID.test(url) || (body && ID.test(body))) return reply(400, { error: 'rejected', problems: ['send the key, never the player id'] });
    const k = u.searchParams.get('k') ?? '';
    if (isForget) {
      if (method !== 'DELETE') return reply(405, { error: 'method not allowed' });
      if (u.searchParams.get('all') !== '1') return reply(400, { error: 'rejected', problems: ['add all=1'] });
      const synced = of(k).size;
      records.delete(k);
      const o = other.get(k) ?? { follows: 0, prefs: 0, answers: 0 };
      other.delete(k);
      return reply(200, { ok: true, deleted: { ...o, synced } });
    }
    // The collector's own clock (`skewMs` ahead of this device's: a device whose clock is behind).
    const now = Date.now() + state.skewMs;
    if (u.pathname === '/sync/get') {
      const r = of(k).get(`${u.searchParams.get('kind')}|${u.searchParams.get('slot')}`);
      if (!r) return reply(404, { error: 'not found' });
      return reply(200, r.data, { 'x-sync-at': String(r.at), 'x-sync-updated': String(r.updated) });
    }
    if (method === 'GET') {
      const list = [...of(k)].map(([ks, r]) => {
        const [kind, slot] = ks.split('|');
        return { kind, slot, at: r.at, bytes: r.data.length, updatedAt: r.updated };
      });
      return reply(200, { records: list, now });
    }
    if (method === 'PUT') {
      const kind = u.searchParams.get('kind')!;
      const slot = u.searchParams.get('slot')!;
      const at = Number(u.searchParams.get('at'));
      if (at > now + 600_000) return reply(400, { error: 'rejected', problems: ["at is more than 10 minutes ahead of the collector clock: check the clock"] });
      if (kind === 'plan' ? !bytes || bytes[0] !== 0x1f || bytes[1] !== 0x8b : !body)
        return reply(400, { error: 'rejected', problems: ['body'] });
      if (kind === 'plan' && bytes!.length > 96 * 1024) return reply(413, { error: 'too big' });
      if (kind === 'ticks' && new TextEncoder().encode(body!).length > 16 * 1024) return reply(413, { error: 'too big' });
      const data: string | Uint8Array = kind === 'plan' ? bytes!.slice() : JSON.stringify(JSON.parse(body!));
      const have = of(k).get(`${kind}|${slot}`);
      if (have) {
        if (sameData(have.data, data)) return reply(200, { ok: true, unchanged: true, updatedAt: have.updated });
        if (have.at > at)
          return reply(409, {
            error: 'a newer record is stored',
            latest: {
              kind,
              slot,
              at: have.at,
              bytes: have.data.length,
              updatedAt: have.updated,
              ...(typeof have.data === 'string' ? { value: JSON.parse(have.data) } : {}),
            },
          });
      }
      of(k).set(`${kind}|${slot}`, { at, updated: now, data });
      return reply(200, { ok: true, updatedAt: now });
    }
    if (method === 'DELETE') {
      of(k).clear();
      return reply(200, { ok: true });
    }
    return reply(405, { error: 'method not allowed' });
  }
  return {
    f,
    calls,
    state,
    records,
    other,
    submitUrl: `${base}/submit`,
    record: (k: string, kind: string, slot = '0') => {
      const r = records.get(k)?.get(`${kind}|${slot}`);
      return r ? { at: r.at, value: (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown> } : null;
    },
    put: (k: string, kind: string, slot: string, at: number, value: unknown) =>
      void of(k).set(`${kind}|${slot}`, { at, updated: Date.now(), data: JSON.stringify(value) }),
  };
}
export type FakeSyncCollector = ReturnType<typeof fakeSyncCollector>;
